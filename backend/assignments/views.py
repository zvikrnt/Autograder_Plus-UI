from rest_framework import viewsets, status
import logging
import json
import subprocess
import os
import sys
import tempfile
from datetime import timedelta
logger = logging.getLogger(__name__)
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q
from django.utils import timezone
from .models import Assignment, Question
from .serializers import AssignmentSerializer, QuestionSerializer
from classes.models import Enrollment


class AssignmentViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action == 'list':
            from .serializers import StreamAssignmentSerializer
            return StreamAssignmentSerializer
        return AssignmentSerializer
    
    def get_queryset(self):
        user = self.request.user
        class_id = self.request.query_params.get('class_id', None)
        
        # Select related module -> class for filtering
        from django.db.models import Count
        queryset = Assignment.objects.select_related('module__class_obj').annotate(
            comments_count=Count('class_comments', distinct=True)
        )
        
        # Only prefetch questions if NOT listing (detailed view needs them)
        if self.action != 'list':
            queryset = queryset.prefetch_related('questions')
        
        if class_id:
            queryset = queryset.filter(module__class_obj_id=class_id)
            
        # Filter for student visualization (only published)
        if user.role == 'student':
            enrolled_classes = Enrollment.objects.filter(
                user=user
            ).values_list('class_obj_id', flat=True)
            
            queryset = queryset.filter(
                is_published=True,
                module__class_obj_id__in=enrolled_classes
            )
        else:
            # Teachers/TAs can see all in their classes
            enrolled_classes = Enrollment.objects.filter(
                user=user
            ).values_list('class_obj_id', flat=True)
            
            # Teachers can see drafts
            queryset = queryset.filter(module__class_obj_id__in=enrolled_classes)
        
        return queryset
    
    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy', 'publish', 'close']:
            # Only teachers/admins can modify assignments
            # Permissions logic can be refined to check specific class ownership
            return [IsAuthenticated()]
        return [IsAuthenticated()]
    
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        if request.user.role == 'student':
            now = timezone.now()
            if instance.start_time and instance.start_time > now:
                return Response(
                    {'message': 'This assignment is not available yet. It starts at ' + instance.start_time.isoformat()},
                    status=status.HTTP_403_FORBIDDEN
                )
            if instance.due_date and instance.due_date < now:
                is_exam_or_quiz = instance.type == 'quiz' or getattr(instance, 'mode', None) == 'exam'
                if is_exam_or_quiz:
                    return Response(
                        {'message': 'This assignment is no longer available. It was due at ' + instance.due_date.isoformat()},
                        status=status.HTTP_403_FORBIDDEN
                    )

            # Block exam if time window has expired (start_time + duration_minutes elapsed)
            if instance.mode == 'exam' and instance.start_time and instance.duration_minutes:
                exam_end = instance.start_time + timedelta(minutes=instance.duration_minutes)
                if now > exam_end:
                    return Response(
                        {'message': 'This exam has ended. The time window (' + str(instance.duration_minutes) + ' min) starting at ' + instance.start_time.isoformat() + ' has passed.'},
                        status=status.HTTP_403_FORBIDDEN
                    )

            # Prevent re-accessing a submitted exam
            if instance.mode == 'exam':
                from submissions.models import GradebookEntry
                if GradebookEntry.objects.filter(
                    student=request.user,
                    content_item=instance,
                    status__in=['submitted', 'graded']
                ).exists():
                    return Response(
                        {'message': 'This assignment has already been completed.'},
                        status=status.HTTP_403_FORBIDDEN
                    )
        return super().retrieve(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        # Handle 'class_obj_id' from frontend -> 'module' for backend
        class_id = request.data.get('class_obj_id')
        if class_id and 'module' not in request.data:
            from classes.models import Module, Class
            # Find/Create a default module for this class
            # For now, just grab the first module or create "Default"
            try:
                print(f"DEBUG: Looking for Class ID: {class_id} (Type: {type(class_id)})")
                class_obj = Class.objects.get(id=class_id)
                module, _ = Module.objects.get_or_create(
                    class_obj=class_obj,
                    defaults={'title': 'Assignments', 'order_index': 0}
                )
                request.data['module'] = module.id
            except Class.DoesNotExist:
                print(f"DEBUG: Class {class_id} not found!")
                return Response(
                    {'message': 'Invalid Class ID'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            except Exception as e:
                print(f"DEBUG: Error finding class: {e}")
                return Response(
                    {'message': f'Error finding class: {str(e)}'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        # Handle type and mode
        req_type = request.data.get('type', 'assignment')
        req_mode = request.data.get('mode', 'practice')
        
        # Validate type
        valid_types = [t[0] for t in Assignment.TYPE_CHOICES]
        if req_type not in valid_types:
            req_type = 'assignment'
            
        # Validate mode
        valid_modes = [m[0] for m in Assignment.MODE_CHOICES]
        if req_mode not in valid_modes:
            req_mode = 'practice'
            
        request.data['type'] = req_type
        request.data['mode'] = req_mode

        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        # Handle 'class_obj_id' from frontend -> 'module' for backend
        class_id = request.data.get('class_obj_id')
        if class_id and 'module' not in request.data:
            from classes.models import Module, Class
            try:
                class_obj = Class.objects.get(id=class_id)
                module, _ = Module.objects.get_or_create(
                    class_obj=class_obj,
                    defaults={'title': 'Assignments', 'order_index': 0}
                )
                request.data['module'] = module.id
            except Class.DoesNotExist:
                return Response(
                    {'message': 'Invalid Class ID'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        # Handle type and mode
        if 'type' in request.data:
            req_type = request.data.get('type')
            valid_types = [t[0] for t in Assignment.TYPE_CHOICES]
            if req_type not in valid_types:
                request.data['type'] = 'assignment'
                
        if 'mode' in request.data:
            req_mode = request.data.get('mode')
            valid_modes = [m[0] for m in Assignment.MODE_CHOICES]
            if req_mode not in valid_modes:
                request.data['mode'] = 'practice'

        return super().update(request, *args, **kwargs)

    def perform_create(self, serializer):
        assignment = serializer.save()
        
        # Handle question_ids linkage
        question_ids = self.request.data.get('question_ids', [])
        if question_ids:
            from .models import AssignmentQuestion, Question
            for index, q_id in enumerate(question_ids):
                try:
                    question = Question.objects.get(id=q_id)
                    AssignmentQuestion.objects.create(
                        assignment=assignment,
                        question=question,
                        order=index
                    )
                except Question.DoesNotExist:
                    pass # Ignore invalid question IDs

        # Hide exam questions in the Practice Library until the test ends
        if assignment.mode == 'exam':
            try:
                from gamification.models import PracticeQuestionLibrary
                from .models import AssignmentQuestion
                from django.utils import timezone
                
                q_ids = AssignmentQuestion.objects.filter(assignment=assignment).values_list('question_id', flat=True)
                
                # Get or create library entries and mark them as hidden
                for q_id in q_ids:
                    pql, _ = PracticeQuestionLibrary.objects.get_or_create(
                        question_id=q_id,
                        defaults={
                            'is_public': True,
                        }
                    )
                    # Mark as hidden and set unhide date to assignment due date (or far future if no due date)
                    pql.is_hidden = True
                    pql.source_assignment = assignment
                    pql.hide_until = assignment.due_date if assignment.due_date else timezone.now() + timezone.timedelta(days=365)
                    pql.save()
            except Exception as e:
                logger.warning(f"Could not hide exam questions in Practice Library: {e}")

        # Notify students if assignment is created as published
        if assignment.is_published:
            try:
                from notifications.models import Notification
                class_obj = assignment.module.class_obj
                enrollments = Enrollment.objects.filter(class_obj=class_obj, role='student').select_related('user')
                
                for enrollment in enrollments:
                    Notification.objects.create(
                        user=enrollment.user,
                        type='alert',
                        title=f'New Assignment: {assignment.title}',
                        message=f'A new assignment "{assignment.title}" has been posted in {class_obj.name}.',
                        reference_link=f'/student/workspace/{assignment.id}'
                    )
            except Exception as e:
                logger.warning(f"Failed to send creation notifications: {e}")

    def perform_update(self, serializer):
        user = self.request.user
        instance = serializer.instance
        
        is_newly_published = False
        
        # Check if is_published is being changed by a non-teacher
        if 'is_published' in serializer.validated_data:
            new_status = serializer.validated_data['is_published']
            
            if new_status != instance.is_published:
                if new_status:
                    is_newly_published = True
                # Verify permissions
                class_owner = instance.module.class_obj.owner
                is_owner = class_owner == user
                is_teacher = Enrollment.objects.filter(
                    class_obj=instance.module.class_obj, 
                    user=user, 
                    role='teacher'
                ).exists()
                is_admin = user.role == 'admin'
                
                if not (is_owner or is_teacher or is_admin):
                    # Revert to original status
                    serializer.validated_data['is_published'] = instance.is_published
                    is_newly_published = False

        # Check if key fields changed to trigger re-submission chance
        trigger_reset = False
        if instance.is_published:
            important_fields = ['title', 'description', 'due_date']
            for field in important_fields:
                if field in serializer.validated_data and serializer.validated_data[field] != getattr(instance, field):
                    trigger_reset = True
                    break
            
            if 'question_ids' in self.request.data:
                # Questions changed
                trigger_reset = True

        assignment = serializer.save()
        
        # Notify if newly published during update
        if is_newly_published:
            try:
                from notifications.models import Notification
                class_obj = assignment.module.class_obj
                enrollments = Enrollment.objects.filter(class_obj=class_obj, role='student').select_related('user')
                
                for enrollment in enrollments:
                    Notification.objects.create(
                        user=enrollment.user,
                        type='alert',
                        title=f'New Assignment: {assignment.title}',
                        message=f'A new assignment "{assignment.title}" has been posted in {class_obj.name}.',
                        reference_link=f'/student/workspace/{assignment.id}'
                    )
            except Exception as e:
                logger.warning(f"Failed to send newly published notifications: {e}")

        # Notify and Reset Status if needed
        if trigger_reset:
            try:
                from notifications.models import Notification
                from submissions.models import GradebookEntry
                
                class_obj = assignment.module.class_obj
                enrollments = Enrollment.objects.filter(class_obj=class_obj, role='student').select_related('user')
                
                for enrollment in enrollments:
                    # Notify
                    Notification.objects.create(
                        user=enrollment.user,
                        type='alert',
                        title=f'Assignment Updated: {assignment.title}',
                        message=f'The assignment "{assignment.title}" in {class_obj.name} has been updated. You can now re-edit and re-submit your work.',
                        reference_link=f'/student/workspace/{assignment.id}'
                    )
                    
                    # Reset GradebookEntry status from 'submitted' to 'pending' to allow editing
                    GradebookEntry.objects.filter(
                        student=enrollment.user,
                        content_item_id=assignment.id,
                        status='submitted'
                    ).update(status='pending')
            except Exception as e:
                logger.error(f"Failed to trigger update notifications/reset: {e}")

        # Handle question_ids linkage update
        # Check explicit None vs empty list if we want to support clearing, 
        # but frontend sends [] if empty.
        # We only update if 'question_ids' key is present in request.
        if 'question_ids' in self.request.data:
            question_ids = self.request.data.get('question_ids', [])
            from .models import AssignmentQuestion, Question
            
            # Clear existing questions
            AssignmentQuestion.objects.filter(assignment=assignment).delete()
            
            # Re-link new questions
            for index, q_id in enumerate(question_ids):
                try:
                    question = Question.objects.get(id=q_id)
                    AssignmentQuestion.objects.create(
                        assignment=assignment,
                        question=question,
                        order=index
                    )
                except Question.DoesNotExist:
                    pass
                    
        # Hide exam questions in the Practice Library until the test ends
        if assignment.mode == 'exam':
            try:
                from gamification.models import PracticeQuestionLibrary
                from .models import AssignmentQuestion
                from django.utils import timezone
                
                q_ids = AssignmentQuestion.objects.filter(assignment=assignment).values_list('question_id', flat=True)
                
                # Get or create library entries and mark them as hidden
                for q_id in q_ids:
                    pql, _ = PracticeQuestionLibrary.objects.get_or_create(
                        question_id=q_id,
                        defaults={
                            'is_public': True,
                        }
                    )
                    # Mark as hidden and set unhide date to assignment due date (or far future if no due date)
                    pql.is_hidden = True
                    pql.source_assignment = assignment
                    pql.hide_until = assignment.due_date if assignment.due_date else timezone.now() + timezone.timedelta(days=365)
                    pql.save()
            except Exception as e:
                logger.warning(f"Could not hide exam questions in Practice Library: {e}")
    
    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        """Publish an assignment"""
        assignment = self.get_object()
        
        # Check authorization relative to class owner/teacher
        # TAs (role='ta') cannot publish. Only 'teacher' or 'admin' or class owner.
        class_owner = assignment.module.class_obj.owner
        
        # Check credentials
        is_owner = class_owner == request.user
        is_teacher = Enrollment.objects.filter(
            class_obj=assignment.module.class_obj, 
            user=request.user, 
            role='teacher'
        ).exists()
        is_admin = request.user.role == 'admin'
        
        if not (is_owner or is_teacher or is_admin):
             return Response(
                {'message': 'Not authorized. Only Teachers can publish.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        assignment.is_published = True
        assignment.save()

        # Notify Students
        try:
            from notifications.models import Notification
            class_obj = assignment.module.class_obj
            enrollments = Enrollment.objects.filter(class_obj=class_obj, role='student').select_related('user')
            
            for enrollment in enrollments:
                Notification.objects.create(
                    user=enrollment.user,
                    type='invite', # Or 'assignment' if we add a choice
                    title=f'New Assignment: {assignment.title}',
                    message=f'A new assignment "{assignment.title}" has been posted in {class_obj.name}.',
                    reference_link=f'/student/workspace/{assignment.id}'
                )
        except Exception as e:
            logger.error(f"Failed to send publication notifications: {e}")
        
        return Response({
            'success': True,
            'data': AssignmentSerializer(assignment).data
        })
    
    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        """Close an assignment (unpublish)"""
        assignment = self.get_object()
        
        class_owner = assignment.module.class_obj.owner
        is_owner = class_owner == request.user
        is_teacher = Enrollment.objects.filter(
            class_obj=assignment.module.class_obj, 
            user=request.user, 
            role='teacher'
        ).exists()
        is_admin = request.user.role == 'admin'
        
        if not (is_owner or is_teacher or is_admin):
            return Response(
                {'message': 'Not authorized. Only Teachers can close assignments.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        assignment.is_published = False
        assignment.save()
        
        return Response({
            'success': True,
            'data': AssignmentSerializer(assignment).data
        })




    @action(detail=True, methods=['get'], url_path='word-cloud')
    def generate_word_cloud(self, request, pk=None):
        """
        Generate per-question word clouds split by score tier.

        Query params:
            question_id  (required) – the Question PK to scope to.

        Response:
            {
              "full":    { "image_base64": "...", "top_words": [...], "count": N },
              "partial": { "image_base64": "...", "top_words": [...], "count": N },
            }
        Both keys are always present; image_base64 is null when there is no data
        for that tier.
        """
        import re
        import base64
        from io import BytesIO
        from collections import Counter

        import matplotlib
        matplotlib.use('Agg')
        try:
            from wordcloud import WordCloud
        except ImportError:
            return Response(
                {'message': 'wordcloud library not installed. Run: pip install wordcloud'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        question_id = request.query_params.get('question_id')
        if not question_id:
            return Response({'message': 'question_id query param is required.'}, status=status.HTTP_400_BAD_REQUEST)

        # ------------------------------------------------------------------ #
        # Extended stop-word list — remove generic / non-insightful tokens    #
        # ------------------------------------------------------------------ #
        STOPWORDS = {
            # Articles / prepositions / conjunctions
            'a','an','the','and','or','but','in','on','at','to','for','of','with',
            'is','are','was','were','be','been','being','have','has','had','do','does',
            'did','will','would','shall','should','may','might','must','can','could',
            'not','no','nor','so','yet','both','either','neither','as','if','then',
            'than','though','because','while','since','up','out','by','from','this',
            'that','these','those','it','its','they','them','their',
            'what','which','who','how','when','where','why','all','each','any',
            'more','also','very','just','about','into','through','during','before',
            'after','above','below','between',
            # Generic programming / filler verbs
            'use','used','using','make','makes','made','takes','take','taken',
            'get','gets','got','set','sets','let','lets','call','calls','called',
            'check','checks','return','returns','print','prints',
            'function','line','code','python','variable','value','output','input',
            'string','list','dict','int','float','bool','type','none','true','false',
            'error','warning','result','results','based','given','provide','provides',
            'provided','overall','solution','attempt','attempts','student','students',
            'implement','implementation','approach','demonstrates','given',
            'however','therefore','thus','hence','also','additionally','furthermore',
            'correct','correctly','incorrect','incorrect','wrong','right','well',
            'good','better','best','issue','issues','problem','problems','note','notes',
            'show','shows','shown','see','seen','need','needs','needed',
            'work','works','worked','working','run','runs','running','ran',
            # Short noise
            's','t','re','ve','ll','d','m','one','two','three','four','five',
            'six','seven','eight','nine','ten',
        }

        def _extract_tokens(attempt, include_errors=False):
            """Extract only technical/conceptual tokens from ai_analysis_data."""
            tokens = []
            ai = attempt.ai_analysis_data
            if not isinstance(ai, dict):
                return tokens

            fb = ai.get('feedback', {})
            if isinstance(fb, dict):
                # Technical concepts / approach descriptions
                for field in ('technical_summary', 'summarized_construct'):
                    val = fb.get(field)
                    if val and isinstance(val, str):
                        tokens.extend(re.findall(r'[a-zA-Z][a-zA-Z0-9_]{3,}', val.lower()))
                # Error explanations — only for partial/incorrect tier
                if include_errors:
                    val = fb.get('error_explanation')
                    if val and isinstance(val, str):
                        tokens.extend(re.findall(r'[a-zA-Z][a-zA-Z0-9_]{3,}', val.lower()))
                # Identified concepts are always useful
                for c in fb.get('identified_concepts', []):
                    if c and isinstance(c, str):
                        tokens.extend(re.findall(r'[a-zA-Z][a-zA-Z0-9_]{3,}', str(c).lower()))

            # Static constructs (always technical)
            static = ai.get('static', {})
            if isinstance(static, dict):
                for c in static.get('constructs_found', []):
                    if isinstance(c, str):
                        tokens.extend(re.findall(r'[a-zA-Z][a-zA-Z0-9_]{3,}', c.lower()))

            # Tags (short labels from old format or pipeline)
            for tag in ai.get('tags', []):
                if tag and isinstance(tag, str) and len(tag) >= 4:
                    tokens.append(tag.lower().strip())

            # Filter stop-words, digits, short tokens
            return [
                t for t in tokens
                if t not in STOPWORDS and not t.isdigit() and len(t) >= 4
            ]

        def _build_cloud(tokens, colormap):
            """Build a WordCloud PIL image from token list; returns base64 string or None."""
            if not tokens:
                return None, []
            freq = Counter(tokens)
            top = freq.most_common(120)
            freq_dict = dict(top)
            wc = WordCloud(
                width=900,
                height=420,
                background_color='white',
                colormap=colormap,
                max_words=100,
                prefer_horizontal=0.75,
                min_font_size=10,
                collocations=False,
            )
            wc.generate_from_frequencies(freq_dict)
            buf = BytesIO()
            wc.to_image().save(buf, format='PNG')
            img_b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
            return img_b64, [(w, c) for w, c in top[:20]]

        try:
            from submissions.models import SubmissionAttempt
            from assignments.models import AssignmentQuestion

            # Resolve the AssignmentQuestion to get max_score
            try:
                aq = AssignmentQuestion.objects.select_related('question').get(
                    assignment_id=pk,
                    question_id=question_id
                )
            except AssignmentQuestion.DoesNotExist:
                return Response(
                    {'message': 'Question not found in this assignment.'},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Max score = number of test cases (each worth 1 point)
            test_cases = aq.question.test_cases or []
            max_score = len(test_cases) if isinstance(test_cases, list) else 1

            # Fetch all attempts for this specific question that have AI data
            attempts = SubmissionAttempt.objects.filter(
                assignment_question=aq,
                ai_analysis_data__isnull=False
            ).only('ai_analysis_data', 'manual_score', 'status')

            if not attempts.exists():
                return Response(
                    {'message': 'No AI analysis data found for this question. Run Autograder+ first.'},
                    status=status.HTTP_404_NOT_FOUND
                )

            full_tokens = []
            partial_tokens = []

            for attempt in attempts:
                score = attempt.manual_score
                # Full tier: score equals max (all test cases passed)
                is_full = (
                    score is not None
                    and max_score > 0
                    and score >= max_score
                ) or attempt.status == 'success'

                if is_full:
                    full_tokens.extend(_extract_tokens(attempt, include_errors=False))
                else:
                    partial_tokens.extend(_extract_tokens(attempt, include_errors=True))

            full_img, full_top = _build_cloud(full_tokens, colormap='YlGn')
            partial_img, partial_top = _build_cloud(partial_tokens, colormap='YlOrRd')

            if full_img is None and partial_img is None:
                return Response(
                    {'message': 'Not enough meaningful tokens found. Try running more AI analysis first.'},
                    status=status.HTTP_404_NOT_FOUND
                )

            return Response({
                'full': {
                    'image_base64': full_img,
                    'top_words': full_top,
                    'count': len(full_tokens),
                },
                'partial': {
                    'image_base64': partial_img,
                    'top_words': partial_top,
                    'count': len(partial_tokens),
                },
            })

        except Exception as e:
            logger.error(f"Error generating word cloud: {e}", exc_info=True)
            return Response({'message': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)



    @action(detail=True, methods=['post'], url_path='analyze-ai')
    def analyze_ai(self, request, pk=None):
        """
        Trigger Bulk AI Analysis for this assignment (batched, parallel Celery tasks).
        """
        from submissions.tasks import analyze_assignment_ai_task
        from submissions.models import AIAnalysisTask

        assignment = self.get_object()

        # Permissions: owner / teacher / admin only
        class_owner = assignment.module.class_obj.owner
        is_owner = class_owner == request.user
        is_teacher = Enrollment.objects.filter(
            class_obj=assignment.module.class_obj,
            user=request.user,
            role='teacher'
        ).exists()
        is_admin = request.user.role == 'admin'

        if not (is_owner or is_teacher or is_admin):
            return Response(
                {'message': 'Not authorized. Only Teachers can trigger AI analysis.'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Removed global guard to allow concurrent AI analyses and rely on Celery for queue management.

        # Block duplicate runs FOR THIS ASSIGNMENT — reject if already pending or running
        # unless 'force=true' is passed OR the task is clearly stale.
        force_restart = str(request.data.get('force', '')).lower() == 'true'
        from django.utils import timezone
        from datetime import timedelta

        active_task = AIAnalysisTask.objects.filter(
            assignment=assignment, status__in=['pending', 'running']
        ).order_by('-created_at').first()

        if active_task:
            is_stale = (timezone.now() - active_task.created_at) > timedelta(minutes=30)
            
            if force_restart or (is_stale and active_task.status == 'pending'):
                logger.info(f"Overriding {'stale ' if is_stale else ''}AI task {active_task.id} for assignment {pk}")
                active_task.status = 'cancelled'
                active_task.save(update_fields=['status'])
                active_task = None # Allow creation of new task below
            else:
                # Tell the frontend about the existing task so it can resume polling
                return Response({
                    'success': False,
                    'already_running': True,
                    'task_id': str(active_task.id),
                    'completed_batches': active_task.completed_batches,
                    'total_batches': active_task.total_batches,
                    'analyzed': active_task.analyzed,
                    'total': active_task.total_submissions or assignment.assignmentquestion_set.count(),
                    'message': f'An AI analysis is already in progress (status: {active_task.status}). '
                               f'Batch {active_task.completed_batches}/{active_task.total_batches}. '
                               f'Cancel it first before starting a new one.',
                }, status=status.HTTP_409_CONFLICT)

        # Create a tracking record first (so progress endpoint works immediately)
        ai_task = AIAnalysisTask.objects.create(
            assignment=assignment,
            status='pending',
        )

        # Dispatch master task. Normal runs resume from the last unfinished
        # question; an explicit force-restart re-analyzes everything.
        celery_task = analyze_assignment_ai_task.delay(
            str(assignment.id),
            str(ai_task.id),
            resume=not force_restart,
        )

        return Response({
            'success': True,
            'task_id': str(ai_task.id),
            'celery_task_id': celery_task.id,
            'resume': not force_restart,
            'message': ('Resuming AI Analysis from last unfinished question.'
                        if not force_restart else 'AI Analysis restarted from scratch.'),
        })

    @action(detail=True, methods=['post'], url_path='cancel-ai')
    def cancel_ai_analysis(self, request, pk=None):
        """
        Cancel the currently running AI analysis for this assignment.
        Revokes all pending Celery batch tasks.
        """
        from celery import current_app
        from submissions.models import AIAnalysisTask

        ai_task = AIAnalysisTask.objects.filter(
            assignment_id=pk, status__in=['pending', 'running']
        ).first()

        if not ai_task:
            return Response({'message': 'No active analysis to cancel.'}, status=status.HTTP_404_NOT_FOUND)

        # Revoke all spawned batch tasks
        for task_id in ai_task.task_ids:
            try:
                current_app.control.revoke(task_id, terminate=True)
            except Exception as e:
                logger.warning(f"Could not revoke task {task_id}: {e}")

        ai_task.status = 'cancelled'
        ai_task.save(update_fields=['status'])

        return Response({'success': True, 'message': 'Analysis cancelled.'})

    @action(detail=False, methods=['get'], url_path='ai-analysis-tasks')
    def list_ai_analysis_tasks(self, request):
        """List active (pending/running) AI analysis tasks. Admin: all; teacher/ta: only their assignments."""
        from submissions.models import AIAnalysisTask
        tasks_qs = AIAnalysisTask.objects.filter(
            status__in=['pending', 'running']
        ).select_related('assignment__module__class_obj')

        if getattr(request.user, 'role', None) != 'admin':
            # Teacher/TA: only assignments in classes they own or teach
            allowed_classes = set()
            from classes.models import Class
            owned = Class.objects.filter(owner=request.user).values_list('id', flat=True)
            allowed_classes.update(owned)
            taught = Enrollment.objects.filter(user=request.user, role='teacher').values_list('class_obj_id', flat=True)
            allowed_classes.update(taught)
            tasks_qs = tasks_qs.filter(assignment__module__class_obj_id__in=allowed_classes)
        
        tasks = tasks_qs.order_by('-created_at')
        data = []
        for t in tasks:
            # Skip or handle tasks with missing assignments (orphaned)
            if not t.assignment:
                continue

            data.append({
                'task_id': str(t.id),
                'assignment_id': str(t.assignment_id),
                'assignment_title': t.assignment.title,
                'status': t.status,
                'completed_batches': t.completed_batches,
                'total_batches': t.total_batches,
                'analyzed': t.analyzed,
                'total_submissions': t.total_submissions,
                'log_output': (t.log_output or [])[-500:],
                'kind': 'ai',
            })
        return Response(data)

    @action(detail=True, methods=['get'], url_path='analysis-progress')
    def analysis_progress(self, request, pk=None):
        """
        Returns real-time batch progress from the AIAnalysisTask model.
        Falls back to counting DB records if no task record exists or hasn't been
        populated yet (race condition window right after task is created).
        """
        from submissions.models import AIAnalysisTask, SubmissionAttempt

        ai_task = AIAnalysisTask.objects.filter(assignment_id=pk).first()

        if ai_task:
            # If the master task hasn't populated total yet, get a real count from DB
            total = ai_task.total_submissions
            if total == 0:
                total = SubmissionAttempt.objects.filter(
                    assignment_question__assignment_id=pk
                ).values('student_id', 'assignment_question_id').distinct().count()

            analyzed = ai_task.analyzed
            percent = round(analyzed / total * 100) if total > 0 else 0

            return Response({
                'status':            ai_task.status,
                'total_batches':     ai_task.total_batches,
                'completed_batches': ai_task.completed_batches,
                'total':             total,
                'analyzed':          analyzed,
                'percent':           percent,
                'log_output':        (ai_task.log_output or [])[-500:],
            })

        # No task record at all — count directly from DB
        total    = SubmissionAttempt.objects.filter(
            assignment_question__assignment_id=pk
        ).values('student_id', 'assignment_question_id').distinct().count()
        analyzed = SubmissionAttempt.objects.filter(
            assignment_question__assignment_id=pk,
            ai_analysis_data__isnull=False
        ).count()
        return Response({
            'status':  'unknown',
            'total':   total,
            'analyzed': analyzed,
            'percent': round(analyzed / total * 100, 1) if total > 0 else 0,
        })

    # ------------------------------------------------------------------
    # CLUSTER GRADING
    # ------------------------------------------------------------------
    def _is_grader(self, assignment, user):
        """Owner / teacher / admin may run and save cluster grading."""
        class_obj = assignment.module.class_obj
        is_owner = class_obj.owner == user
        is_teacher = Enrollment.objects.filter(
            class_obj=class_obj, user=user, role='teacher'
        ).exists()
        is_admin = getattr(user, 'role', None) == 'admin'
        return is_owner or is_teacher or is_admin

    @action(detail=True, methods=['post'], url_path='run-cluster-grade')
    def run_cluster_grade(self, request, pk=None):
        """Trigger behavior-aware cluster grading for this assignment."""
        from submissions.cluster_tasks import run_cluster_grading_task
        from submissions.models import ClusterGradingTask
        from django.utils import timezone
        from datetime import timedelta

        assignment = self.get_object()
        if not self._is_grader(assignment, request.user):
            return Response(
                {'message': 'Not authorized. Only teachers can run cluster grading.'},
                status=status.HTTP_403_FORBIDDEN
            )

        force_restart = str(request.data.get('force', '')).lower() == 'true'
        # Optional tuning knobs forwarded to cluster_grade.py.
        config_options = request.data.get('config') or {}

        active = ClusterGradingTask.objects.filter(
            assignment=assignment, status__in=['pending', 'running']
        ).order_by('-created_at').first()

        if active:
            is_stale = (timezone.now() - active.created_at) > timedelta(minutes=30)
            if force_restart or (is_stale and active.status == 'pending'):
                active.status = 'cancelled'
                active.save(update_fields=['status'])
                active = None
            else:
                return Response({
                    'success': False,
                    'already_running': True,
                    'task_id': str(active.id),
                    'completed_batches': active.completed_batches,
                    'total_batches': active.total_batches,
                    'message': f'Cluster grading already in progress (status: {active.status}).',
                }, status=status.HTTP_409_CONFLICT)

        cg_task = ClusterGradingTask.objects.create(assignment=assignment, status='pending')
        # Normal runs resume from the last unfinished question; force restarts everything.
        celery_task = run_cluster_grading_task.delay(
            str(assignment.id), str(cg_task.id), config_options, not force_restart
        )
        return Response({
            'success': True,
            'task_id': str(cg_task.id),
            'celery_task_id': celery_task.id,
            'resume': not force_restart,
            'message': ('Resuming cluster grading from last unfinished question.'
                        if not force_restart else 'Cluster grading restarted from scratch.'),
        })

    @action(detail=True, methods=['post'], url_path='cancel-cluster-grade')
    def cancel_cluster_grade(self, request, pk=None):
        """Cancel an in-progress cluster grading run."""
        from celery import current_app
        from submissions.models import ClusterGradingTask

        cg_task = ClusterGradingTask.objects.filter(
            assignment_id=pk, status__in=['pending', 'running']
        ).first()
        if not cg_task:
            return Response({'message': 'No active cluster grading to cancel.'},
                            status=status.HTTP_404_NOT_FOUND)
        for task_id in cg_task.task_ids:
            try:
                current_app.control.revoke(task_id, terminate=True)
            except Exception as e:
                logger.warning(f"Could not revoke cluster task {task_id}: {e}")
        cg_task.status = 'cancelled'
        cg_task.save(update_fields=['status'])
        return Response({'success': True, 'message': 'Cluster grading cancelled.'})

    @action(detail=True, methods=['get'], url_path='cluster-progress')
    def cluster_progress(self, request, pk=None):
        """Real-time progress for the latest cluster grading run."""
        from submissions.models import ClusterGradingTask

        cg_task = ClusterGradingTask.objects.filter(assignment_id=pk).first()
        if not cg_task:
            return Response({'status': 'unknown', 'total_batches': 0,
                             'completed_batches': 0, 'analyzed': 0, 'percent': 0})
        return Response({
            'status':            cg_task.status,
            'task_id':           str(cg_task.id),
            'total_batches':     cg_task.total_batches,
            'completed_batches': cg_task.completed_batches,
            'total':             cg_task.total_submissions,
            'analyzed':          cg_task.analyzed,
            'percent':           cg_task.percent,
            'has_results':       bool(cg_task.results),
            'log_output':        (cg_task.log_output or [])[-500:],
        })

    @action(detail=False, methods=['get'], url_path='cluster-grading-tasks')
    def list_cluster_grading_tasks(self, request):
        """List active (pending/running) cluster grading tasks.

        Admin: all. Teacher/TA: only assignments in classes they own or teach.
        Shaped like list_ai_analysis_tasks so the admin task page can merge both.
        """
        from submissions.models import ClusterGradingTask
        tasks_qs = ClusterGradingTask.objects.filter(
            status__in=['pending', 'running']
        ).select_related('assignment__module__class_obj')

        if getattr(request.user, 'role', None) != 'admin':
            allowed_classes = set()
            from classes.models import Class
            owned = Class.objects.filter(owner=request.user).values_list('id', flat=True)
            allowed_classes.update(owned)
            taught = Enrollment.objects.filter(
                user=request.user, role='teacher'
            ).values_list('class_obj_id', flat=True)
            allowed_classes.update(taught)
            tasks_qs = tasks_qs.filter(assignment__module__class_obj_id__in=allowed_classes)

        data = []
        for t in tasks_qs.order_by('-created_at'):
            if not t.assignment:
                continue
            data.append({
                'task_id': str(t.id),
                'assignment_id': str(t.assignment_id),
                'assignment_title': t.assignment.title,
                'status': t.status,
                'completed_batches': t.completed_batches,
                'total_batches': t.total_batches,
                'analyzed': t.analyzed,
                'total_submissions': t.total_submissions,
                'log_output': (t.log_output or [])[-500:],
                'kind': 'cluster',
            })
        return Response(data)

    @action(detail=True, methods=['get'], url_path='cluster-results')
    def cluster_results(self, request, pk=None):
        """Return parsed clusters + insights + plot URLs for the latest run."""
        from submissions.models import ClusterGradingTask

        cg_task = ClusterGradingTask.objects.filter(
            assignment_id=pk
        ).exclude(results={}).order_by('-created_at').first()

        if not cg_task or not cg_task.results:
            return Response({'status': 'no_results', 'questions': []})

        questions = list(cg_task.results.values())
        return Response({
            'status': cg_task.status,
            'task_id': str(cg_task.id),
            'questions': questions,
        })

    @action(detail=True, methods=['get'], url_path='cluster-member-code')
    def cluster_member_code(self, request, pk=None):
        """Return a student's latest source code for a question (for the code popup).

        Query params: question_slug, username
        """
        from submissions.models import SubmissionAttempt

        assignment = self.get_object()
        if not self._is_grader(assignment, request.user):
            return Response({'message': 'Not authorized.'}, status=status.HTTP_403_FORBIDDEN)

        question_slug = request.query_params.get('question_slug')
        username = request.query_params.get('username')
        if not question_slug or not username:
            return Response({'message': 'question_slug and username are required.'},
                            status=status.HTTP_400_BAD_REQUEST)

        attempt = (
            SubmissionAttempt.objects
            .filter(assignment_question__assignment_id=pk,
                    assignment_question__question__slug=question_slug,
                    student__username=username)
            .select_related('assignment_question__question')
            .order_by('-created_at')
            .first()
        )
        if not attempt:
            return Response({'message': 'No submission found for that student.'},
                            status=status.HTTP_404_NOT_FOUND)

        q_config = attempt.assignment_question.question.config or {}
        return Response({
            'username': username,
            'question_slug': question_slug,
            'language': q_config.get('language', 'python'),
            'source_code': attempt.source_code or '',
            'manual_score': attempt.manual_score,
            'submitted_at': attempt.created_at,
        })

    @action(detail=True, methods=['post'], url_path='save-cluster-grade')
    def save_cluster_grade(self, request, pk=None):
        """
        Persist a teacher's grade for one cluster of one question.

        Propagation policy (per product decision): grades apply to every member
        only for SAFE / SAFE_SINGLETON clusters. UNSAFE clusters are rejected —
        those must be graded per-student in the normal grading interface.

        Body: { question_slug, cluster_id, grade (0-100) }
        """
        from submissions.models import ClusterGradingTask, SubmissionAttempt

        assignment = self.get_object()
        if not self._is_grader(assignment, request.user):
            return Response({'message': 'Not authorized.'}, status=status.HTTP_403_FORBIDDEN)

        question_slug = request.data.get('question_slug')
        cluster_id = request.data.get('cluster_id')
        grade = request.data.get('grade')

        if question_slug is None or cluster_id is None or grade is None:
            return Response({'message': 'question_slug, cluster_id and grade are required.'},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            grade = float(grade)
            cluster_id = int(cluster_id)
        except (TypeError, ValueError):
            return Response({'message': 'grade and cluster_id must be numeric.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if not (0 <= grade <= 100):
            return Response({'message': 'grade must be between 0 and 100.'},
                            status=status.HTTP_400_BAD_REQUEST)

        cg_task = ClusterGradingTask.objects.filter(
            assignment_id=pk
        ).exclude(results={}).order_by('-created_at').first()
        if not cg_task or question_slug not in (cg_task.results or {}):
            return Response({'message': 'No cluster results for that question. Re-run cluster grading.'},
                            status=status.HTTP_404_NOT_FOUND)

        q_result = cg_task.results[question_slug]
        cluster = next((c for c in q_result.get('clusters', []) if c.get('cluster_id') == cluster_id), None)
        if not cluster:
            return Response({'message': f'Cluster {cluster_id} not found.'},
                            status=status.HTTP_404_NOT_FOUND)

        if cluster.get('safety') not in ('SAFE', 'SAFE_SINGLETON'):
            return Response({
                'message': 'This cluster is UNSAFE — grade its students individually in the grading interface.',
                'safety': cluster.get('safety'),
            }, status=status.HTTP_400_BAD_REQUEST)

        # Apply the grade to every member's latest attempt for this question.
        usernames = [m['student_id'] for m in cluster.get('members', []) if m.get('student_id')]
        updated = 0
        for username in usernames:
            attempt = (
                SubmissionAttempt.objects
                .filter(assignment_question__assignment_id=pk,
                        assignment_question__question__slug=question_slug,
                        student__username=username)
                .order_by('-created_at')
                .first()
            )
            if attempt:
                attempt.manual_score = grade
                attempt.save(update_fields=['manual_score'])
                updated += 1

        # Record the applied grade back onto the stored cluster for the UI.
        cluster['cluster_grade'] = grade
        cluster['graded'] = True
        cg_task.save(update_fields=['results'])

        return Response({
            'success': True,
            'updated_students': updated,
            'message': f'Applied {grade}% to {updated} student(s) in cluster C{cluster_id}.',
        })

    # ------------------------------------------------------------------
    # AUTOMATIC GRADING (from test-case pass percentage)
    # ------------------------------------------------------------------
    @staticmethod
    def _question_pass_percentage(attempt, num_tests):
        """Test-case pass percentage (0-100) for one attempt."""
        if num_tests <= 0:
            return 0.0
        passed = min(attempt.test_results.filter(status='pass').count(), num_tests)
        return (passed / num_tests) * 100.0

    @staticmethod
    def _apply_auto_strategy(pass_pct, options):
        """Map a pass percentage (0-100) to a grade (0-100) per the chosen strategy.

        strategy:
          - 'pass_percentage': grade = pass_pct (identity)
          - 'range': floor at min_marks, then linearly scale the [0,100] pass
             range into [min_marks, max_marks]. If full_marks_on_all_pass, a
             100% pass always yields max_marks.
          - 'formula': grade = pass_pct * multiplier + offset (then clamped)
        """
        strategy = options.get('strategy', 'pass_percentage')
        try:
            if strategy == 'range':
                min_marks = float(options.get('min_marks', 0))
                max_marks = float(options.get('max_marks', 100))
                grade = min_marks + (pass_pct / 100.0) * (max_marks - min_marks)
                if options.get('full_marks_on_all_pass') and pass_pct >= 99.999:
                    grade = max_marks
                return grade
            if strategy == 'formula':
                mult = float(options.get('multiplier', 1.0))
                offset = float(options.get('offset', 0.0))
                return pass_pct * mult + offset
            # default: identity
            return pass_pct
        except (TypeError, ValueError):
            return pass_pct

    @action(detail=True, methods=['post'], url_path='auto-grade')
    def auto_grade(self, request, pk=None):
        """Automatically grade all students from test-case pass percentage.

        Body:
          strategy: 'pass_percentage' | 'range' | 'formula'
          min_marks, max_marks, full_marks_on_all_pass   (range)
          multiplier, offset                             (formula)
          overwrite_manual: bool  — if False (default), skip attempts that
                            already have a manual_score (e.g. cluster-graded).
          preview: bool — if True, compute and return the grades WITHOUT saving.
        """
        from submissions.models import SubmissionAttempt
        from submissions.services import update_gradebook

        assignment = self.get_object()
        if not self._is_grader(assignment, request.user):
            return Response({'message': 'Not authorized.'}, status=status.HTTP_403_FORBIDDEN)

        options = request.data or {}
        preview = bool(options.get('preview', False))
        overwrite_manual = bool(options.get('overwrite_manual', False))
        # Give 0 marks when a submission has no source code (default on).
        zero_if_missing_code = bool(options.get('zero_if_missing_code', True))

        graded = 0
        skipped = 0
        missing_code = 0
        affected_students = set()
        sample = []

        for aq in assignment.assignmentquestion_set.select_related('question'):
            num_tests = len(aq.question.test_cases or [])
            latest_attempts = (
                SubmissionAttempt.objects
                .filter(assignment_question=aq)
                .order_by('student_id', '-created_at')
                .distinct('student_id')
                .select_related('student')
                .prefetch_related('test_results')
            )
            for attempt in latest_attempts:
                if attempt.manual_score is not None and not overwrite_manual:
                    skipped += 1
                    continue

                code_missing = not (attempt.source_code or '').strip()
                if zero_if_missing_code and code_missing:
                    pass_pct = 0.0
                    grade = 0.0
                    missing_code += 1
                else:
                    pass_pct = self._question_pass_percentage(attempt, num_tests)
                    grade = round(max(0.0, min(100.0, self._apply_auto_strategy(pass_pct, options))), 2)

                if len(sample) < 8:
                    sample.append({
                        'student': attempt.student.username,
                        'question': aq.question.title,
                        'pass_percentage': round(pass_pct, 1),
                        'grade': grade,
                        'code_missing': code_missing,
                    })

                if not preview:
                    attempt.manual_score = grade
                    attempt.save(update_fields=['manual_score'])
                graded += 1
                affected_students.add(attempt.student_id)

        # Recalculate gradebook for affected students (skip on preview).
        if not preview:
            for sid in affected_students:
                try:
                    student = assignment.module.class_obj.enrollments.get(user_id=sid).user
                except Exception:
                    from django.contrib.auth import get_user_model
                    student = get_user_model().objects.filter(id=sid).first()
                if student:
                    try:
                        update_gradebook(student, assignment)
                    except Exception as exc:
                        logger.error(f"auto-grade gradebook update failed for {sid}: {exc}")

        return Response({
            'success': True,
            'preview': preview,
            'graded': graded,
            'skipped_manual': skipped,
            'missing_code_zeroed': missing_code,
            'students_affected': len(affected_students),
            'strategy': options.get('strategy', 'pass_percentage'),
            'sample': sample,
            'message': (
                f"Preview: {graded} submissions would be graded "
                f"({skipped} manual skipped, {missing_code} missing-code → 0)."
                if preview else
                f"Auto-graded {graded} submissions across {len(affected_students)} students "
                f"({skipped} manual grades kept, {missing_code} missing-code → 0)."
            ),
        })


class QuestionViewSet(viewsets.ModelViewSet):
    queryset = Question.objects.all()
    serializer_class = QuestionSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        question = serializer.save()
        try:
            from .services import ConfigGenerator
            ConfigGenerator.generate_question_config(question)
        except Exception as e:
            print(f"Warning: Failed to generate config for question {question.id}: {e}")
            
        # Automatically add the new question to the Practice Question Library
        try:
            from gamification.models import PracticeQuestionLibrary
            PracticeQuestionLibrary.objects.get_or_create(
                question=question,
                defaults={
                    'is_public': True,
                    'tags': question.tags
                }
            )
        except Exception as e:
            print(f"Warning: Failed to add question {question.id} to Practice Library: {e}")

    def perform_update(self, serializer):
        question = serializer.save()
        try:
            from .services import ConfigGenerator
            ConfigGenerator.generate_question_config(question)
        except Exception as e:
            print(f"Warning: Failed to generate config for question {question.id}: {e}")

    @action(detail=False, methods=['post'], url_path='bulk-import')
    def bulk_import(self, request):
        """
        Bulk import questions from a JSON file.
        Expects multipart form data with 'json_file' field containing JSON data.
        """
        import json
        import uuid
        from django.utils.text import slugify
        from .services import QuestionImportValidator, ConfigGenerator
        from gamification.models import PracticeQuestionLibrary

        # Get JSON file from request
        if 'json_file' not in request.FILES:
            return Response(
                {'success': False, 'error': 'No json_file provided'},
                status=status.HTTP_400_BAD_REQUEST
            )

        json_file = request.FILES['json_file']

        # Read and parse JSON
        try:
            data = json.loads(json_file.read().decode('utf-8'))
        except json.JSONDecodeError as e:
            return Response(
                {'success': False, 'error': f'Invalid JSON: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            return Response(
                {'success': False, 'error': f'Error reading file: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate
        validator = QuestionImportValidator()
        is_valid, validated_questions, errors = validator.validate(data)

        if not is_valid:
            return Response(
                {'success': False, 'errors': errors},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Import questions
        created_count = 0
        test_case_count = 0
        skipped = []

        for question_data in validated_questions:
            try:
                # Generate slug if not provided
                slug = question_data.get('slug')
                if not slug:
                    base_slug = slugify(question_data['title'])
                    if not base_slug:
                        base_slug = 'question'
                    base_slug = base_slug[:40]
                    slug = f"{base_slug}-{str(uuid.uuid4())[:8]}"

                # Check for duplicate slug
                if Question.objects.filter(slug=slug).exists():
                    skipped.append({'title': question_data['title'], 'error': f'Slug "{slug}" already exists'})
                    continue

                # Prepare config
                config = question_data.get('config', {})
                if question_data['question_type'] == 'coding' and 'entry_point' in question_data:
                    config['entry_point'] = question_data['entry_point']

                # Create question
                question = Question.objects.create(
                    title=question_data['title'],
                    slug=slug,
                    description=question_data['description'],
                    question_type=question_data['question_type'],
                    test_cases=question_data['test_cases'],
                    difficulty=question_data.get('difficulty', 'Medium'),
                    category=question_data.get('category', 'General'),
                    point_value=question_data.get('point_value', 100),
                    starter_code=question_data.get('starter_code', ''),
                    reference_solution=question_data.get('reference_solution', ''),
                    tags=question_data.get('tags', []),
                    config=config,
                    created_by=request.user
                )

                # Generate config file
                try:
                    ConfigGenerator.generate_question_config(question)
                except Exception as e:
                    logger.warning(f"Failed to generate config for {question.slug}: {str(e)}")

                # Add to Practice Question Library
                try:
                    PracticeQuestionLibrary.objects.get_or_create(
                        question=question,
                        defaults={
                            'is_public': True,
                            'tags': question.tags
                        }
                    )
                except Exception as e:
                    logger.warning(f"Failed to add {question.slug} to Practice Library: {str(e)}")

                test_case_count += len(question.test_cases)
                created_count += 1
            except Exception as e:
                skipped.append({'title': question_data.get('title', 'Unknown'), 'error': str(e)})

        response_data = {
            'success': True,
            'created': created_count,
            'test_cases_added': test_case_count,
            'skipped': len(skipped),
            'details': f'Successfully imported {created_count} questions with {test_case_count} test cases'
        }

        if skipped:
            response_data['skipped_details'] = skipped

        return Response(response_data, status=status.HTTP_201_CREATED)
