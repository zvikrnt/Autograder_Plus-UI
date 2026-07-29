from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from django.db.models import Count, Q
from .models import (
    Class, Enrollment, Module, Announcement, Comment,
    ClassResource, DiscussionThread, DiscussionReply,
)
from .serializers import (
    ClassSerializer, EnrollmentSerializer, AnnouncementSerializer, CommentSerializer,
    ClassResourceSerializer, DiscussionThreadSerializer, DiscussionReplySerializer,
)
from django.contrib.auth import get_user_model
from submissions.models import GradebookEntry, SubmissionAttempt
from core.permissions import IsTeacher
from assignments.models import Assignment, AssignmentQuestion

User = get_user_model()
from django.core.mail import send_mail
from django.conf import settings
from notifications.models import Notification


class ClassViewSet(viewsets.ModelViewSet):
    serializer_class = ClassSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        archived = self.request.query_params.get('archived', 'false').lower() == 'true'
        
        enrollments = Enrollment.objects.filter(
            user=user
        ).values_list('class_obj_id', flat=True)
        
        owned_classes = Class.objects.filter(owner=user).values_list('id', flat=True)
        all_class_ids = list(set(list(enrollments) + list(owned_classes)))
        
        queryset = Class.objects.filter(id__in=all_class_ids)
        
        if self.action == 'list':
            queryset = queryset.filter(is_archived=archived)
        
        return queryset.select_related('owner').prefetch_related('enrollments').annotate(
            student_count=Count('enrollments', filter=Q(enrollments__role='student'), distinct=True),
            assignment_count=Count('modules__items', filter=Q(modules__items__type='assignment'), distinct=True)
        ).order_by('-created_at')
    
    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy', 'archive']:
            # Only teachers/admins can create/update classes
            return [IsAuthenticated(), IsTeacher()]
        return [IsAuthenticated()]
    
    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)
        # Auto-enroll creator as teacher
        Enrollment.objects.create(
            class_obj=serializer.instance,
            user=self.request.user,
            role='teacher'
        )
    
    @action(detail=False, methods=['post'], url_path='join-by-code')
    def join_by_code(self, request):
        """Join a class using join code (no class ID needed)"""
        join_code = request.data.get('join_code', '').strip()
        
        if not join_code:
            return Response(
                {'message': 'Join code is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        try:
            # Removed is_archived check
            class_obj = Class.objects.get(join_code=join_code)
        except Class.DoesNotExist:
             return Response(
                {'message': 'Invalid join code'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Check for enrollment lock
        settings = class_obj.settings or {}
        if settings.get('enrollment_locked', False):
             return Response(
                {'message': 'Enrollment is currently locked for this class.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Check if already enrolled
        enrollment, created = Enrollment.objects.get_or_create(
            class_obj=class_obj,
            user=request.user,
            defaults={
                'role': request.user.role if request.user.role in ['teacher', 'ta'] else 'student',
            }
        )
        
        if not created:
             return Response(
                {'message': 'Already enrolled in this class'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        return Response({
            'success': True,
            'message': 'Joined class successfully',
            'class': ClassSerializer(class_obj).data,
            'enrollment': EnrollmentSerializer(enrollment).data
        })

    @action(detail=True, methods=['post'])
    def join(self, request, pk=None):
        """Join a class using join code (legacy, requires ID)"""
        return self.join_by_code(request)

    @action(detail=True, methods=['post'], url_path='regenerate-code')
    def regenerate_code(self, request, pk=None):
        """Regenerate the join code for a class"""
        class_obj = self.get_object()
        
        # Only owner/teacher can regenerate
        if class_obj.owner != request.user:
             return Response(
                {'message': 'Not authorized. Only the class owner can regenerate the code.'},
                status=status.HTTP_403_FORBIDDEN
            )
            
        from .models import generate_join_code
        new_code = generate_join_code()
        # Ensure uniqueness (simple retry)
        while Class.objects.filter(join_code=new_code).exists():
            new_code = generate_join_code()
            
        class_obj.join_code = new_code
        class_obj.save()
        
        return Response({
            'success': True,
            'message': 'Join code regenerated successfully',
            'join_code': new_code
        })
    
    @action(detail=True, methods=['post'])
    def archive(self, request, pk=None):
        """Archive or Unarchive a class"""
        class_obj = self.get_object()
        
        # Only owner can archive
        if class_obj.owner != request.user:
             return Response(
                {'message': 'Not authorized. Only the class owner can archive.'},
                status=status.HTTP_403_FORBIDDEN
            )
            
        # Toggle status
        class_obj.is_archived = not class_obj.is_archived
        class_obj.save()
        
        return Response({
            'success': True,
            'message': f"Class {'archived' if class_obj.is_archived else 'unarchived'} successfully",
            'class': ClassSerializer(class_obj).data
        })
    
    @action(detail=True, methods=['get'])
    def people(self, request, pk=None):
        """Get class roster"""
        class_obj = self.get_object()
        enrollments = Enrollment.objects.filter(
            class_obj=class_obj
        ).select_related('user')
        
        people = []
        for enrollment in enrollments:
            people.append({
                'id': enrollment.user.id,
                'name': f"{enrollment.user.first_name} {enrollment.user.last_name}",
                'email': enrollment.user.email,
                'avatar_url': enrollment.user.avatar_url,
                'role': enrollment.role,
                'joined_at': enrollment.joined_at
            })
        
        return Response({
            'success': True,
            'data': people
        })

    @action(detail=True, methods=['post'], url_path='add-member')
    def add_member(self, request, pk=None):
        """Add a member (TA or Student) by email manually"""
        class_obj = self.get_object()
        
        # Only owner or teacher can add members
        is_owner = class_obj.owner == request.user
        is_teacher = Enrollment.objects.filter(class_obj=class_obj, user=request.user, role='teacher').exists()
        
        if not (is_owner or is_teacher):
             return Response({'message': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)

        email = request.data.get('email')
        role = request.data.get('role', 'student')
        
        if not email:
            return Response({'message': 'Email is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        if role not in ['student', 'ta', 'teacher']:
             return Response({'message': 'Invalid role'}, status=status.HTTP_400_BAD_REQUEST)
             
        user_created = False
        users_found = User.objects.filter(email=email)
        
        if users_found.exists():
            user_to_add = users_found.first()
        else:
            # Create new user
            from django.utils.crypto import get_random_string
            username = email.split('@')[0] + '_' + get_random_string(4)
            # Ensure username is unique
            while User.objects.filter(username=username).exists():
                username = email.split('@')[0] + '_' + get_random_string(4)
                
            user_to_add = User.objects.create_user(
                username=username,
                email=email,
                password=get_random_string(32), # Random complex password
                first_name='Invited',
                last_name='User',
                role=role if role in ['ta', 'teacher'] else 'student' # Set initial role
            )
            user_created = True
        
        # Check if already enrolled
        if Enrollment.objects.filter(class_obj=class_obj, user=user_to_add).exists():
             return Response({'message': 'User already enrolled'}, status=status.HTTP_400_BAD_REQUEST)
             
        Enrollment.objects.create(
            class_obj=class_obj,
            user=user_to_add,
            role=role
        )

        # Send Email Invitation
        try:
            role_display = 'Teaching Assistant' if role == 'ta' else role.capitalize()
            
            if user_created:
                # Generate Password Reset Token
                from django.contrib.auth.tokens import default_token_generator
                from django.utils.http import urlsafe_base64_encode
                from django.utils.encoding import force_bytes
                
                uid = urlsafe_base64_encode(force_bytes(user_to_add.pk))
                token = default_token_generator.make_token(user_to_add)
                reset_link = f"http://localhost:5173/reset-password/{uid}/{token}"
                
                subject = f'Welcome to Autograder - Invitation to join {class_obj.name}'
                message = (
                    f'Hello,\n\n'
                    f'You have been invited to join the class "{class_obj.name}" as a {role_display}.\n\n'
                    f'An account has been created for you. Please click the link below to set your password and log in:\n\n'
                    f'{reset_link}\n\n'
                    f'If you did not expect this invitation, please ignore this email.'
                )
            else:
                subject = f'Invitation to join {class_obj.name}'
                message = (
                    f'Hello {user_to_add.first_name},\n\n'
                    f'You have been added to the class "{class_obj.name}" as a {role_display}.\n\n'
                    f'Log in to view your class: http://localhost:5173/login'
                )

            send_mail(
                subject=subject,
                message=message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user_to_add.email],
                fail_silently=True,
            )
        except Exception as e:
            print(f"Failed to send email: {e}")

        # Create In-App Notification
        try:
            Notification.objects.create(
                user=user_to_add,
                type='invite',
                title=f'Added to {class_obj.name}',
                message=f'You have been added to {class_obj.name} as a {role_display}.',
                reference_link=f'/student/class/{class_obj.id}' if role == 'student' else f'/teacher/class/{class_obj.id}'
            )
        except Exception as e:
             print(f"Failed to create notification: {e}")
        
        return Response({'success': True, 'message': f'Added {user_to_add.email} as {role}'})

    @action(detail=True, methods=['delete'], url_path='remove-member')
    def remove_member(self, request, pk=None):
        """Remove a member from the class"""
        class_obj = self.get_object()

        # Only owner or teacher can remove members
        is_owner = class_obj.owner == request.user
        is_teacher = Enrollment.objects.filter(class_obj=class_obj, user=request.user, role='teacher').exists()

        if not (is_owner or is_teacher):
            return Response({'message': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)

        user_id = request.data.get('user_id')
        if not user_id:
            return Response({'message': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        # Cannot remove the class owner
        if class_obj.owner_id == int(user_id):
            return Response({'message': 'Cannot remove the class owner'}, status=status.HTTP_400_BAD_REQUEST)

        # Cannot remove yourself
        if request.user.id == int(user_id):
            return Response({'message': 'You cannot remove yourself from the class'}, status=status.HTTP_400_BAD_REQUEST)

        deleted_count, _ = Enrollment.objects.filter(class_obj=class_obj, user_id=user_id).delete()

        if deleted_count == 0:
            return Response({'message': 'Member not found in this class'}, status=status.HTTP_404_NOT_FOUND)

        return Response({'success': True, 'message': 'Member removed from class'})

    @action(detail=True, methods=['post'])
    def leave(self, request, pk=None):
        """Allow a student or TA to leave/unenroll from the class"""
        class_obj = self.get_object()

        if class_obj.owner == request.user:
            return Response({'message': 'Class owner cannot leave the class'}, status=status.HTTP_400_BAD_REQUEST)

        enrollment = Enrollment.objects.filter(class_obj=class_obj, user=request.user).first()
        if not enrollment:
            return Response({'message': 'You are not enrolled in this class'}, status=status.HTTP_404_NOT_FOUND)

        enrollment.delete()
        return Response({'success': True, 'message': 'You have left the class'})

    @action(detail=True, methods=['get'])
    def grades(self, request, pk=None):
        """Get gradebook data (Assignments x Students)"""
        class_obj = self.get_object()
        
        # 1. Assignments (ContentItems of type assignment in this class)
        assignments = Assignment.objects.filter(module__class_obj=class_obj).order_by('created_at')
        assign_data = [{'id': a.id, 'title': a.title, 'points': a.points_total} for a in assignments]
        
        # 2. Students
        students = User.objects.filter(
            enrollments__class_obj=class_obj,
            enrollments__role='student'
        ).distinct().order_by('last_name', 'first_name')
        
        # 3. GradebookEntries
        entries = GradebookEntry.objects.filter(
            content_item__module__class_obj=class_obj
        ).values('student_id', 'content_item_id', 'final_score', 'status')
        
        # Map: student_id -> { content_item_id: score }
        grades_map = {}
        for entry in entries:
            s_id = str(entry['student_id'])
            c_id = str(entry['content_item_id'])
            if s_id not in grades_map: grades_map[s_id] = {}
            grades_map[s_id][c_id] = entry['final_score']
            
        # 4. Construct Roster
        roster = []
        for student in students:
            student_grades = grades_map.get(str(student.id), {})
            roster.append({
                'id': student.id,
                'name': f"{student.first_name} {student.last_name}",
                'email': student.email,
                'grades': student_grades
            })
            
        return Response({
            'assignments': assign_data,
            'roster': roster
        })

    @action(detail=True, methods=['get'], url_path='export-grades')
    def export_grades(self, request, pk=None):
        """Export the full class gradebook as a CSV download.

        One row per student (name, username, email, id) with a column per
        graded content item (assignments + quizzes) holding final_score (0-100),
        plus a Total (sum) and Average column. Teacher/owner/admin only.
        """
        import csv
        from django.http import HttpResponse
        from django.utils.text import slugify
        from assignments.models import ContentItem

        class_obj = self.get_object()

        # Permission: owner / teacher / admin
        is_owner = class_obj.owner_id == request.user.id
        is_teacher = Enrollment.objects.filter(
            class_obj=class_obj, user=request.user, role='teacher'
        ).exists()
        is_admin = getattr(request.user, 'role', None) == 'admin'
        if not (is_owner or is_teacher or is_admin):
            return Response({'message': 'Not authorized.'}, status=status.HTTP_403_FORBIDDEN)

        # Graded content items in this class (assignments + quizzes), ordered.
        items = list(
            ContentItem.objects
            .filter(module__class_obj=class_obj, type__in=['assignment', 'quiz'])
            .order_by('type', 'created_at')
        )

        students = User.objects.filter(
            enrollments__class_obj=class_obj, enrollments__role='student'
        ).distinct().order_by('last_name', 'first_name', 'username')

        # grades_map: student_id -> {content_item_id: final_score}
        entries = GradebookEntry.objects.filter(
            content_item__module__class_obj=class_obj
        ).values('student_id', 'content_item_id', 'final_score')
        grades_map = {}
        for e in entries:
            grades_map.setdefault(e['student_id'], {})[e['content_item_id']] = e['final_score']

        response = HttpResponse(content_type='text/csv')
        filename = f"gradebook_{slugify(class_obj.name)}.csv"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'

        writer = csv.writer(response)
        # Header
        header = ['Student Name', 'Username', 'Email', 'Student ID']
        header += [f"{it.title} ({it.type})" for it in items]
        header += ['Total', 'Average']
        writer.writerow(header)

        for student in students:
            sg = grades_map.get(student.id, {})
            row = [
                f"{student.first_name} {student.last_name}".strip() or student.username,
                student.username,
                student.email,
                str(student.id),
            ]
            scores = []
            for it in items:
                score = sg.get(it.id)
                if score is None:
                    row.append('')
                else:
                    val = round(float(score), 2)
                    row.append(val)
                    scores.append(val)
            total = round(sum(scores), 2) if scores else 0
            avg = round(sum(scores) / len(scores), 2) if scores else 0
            row += [total, avg]
            writer.writerow(row)

        return response

    @action(detail=True, methods=['get'], url_path='student-performance')
    def student_performance(self, request, pk=None):
        """Individual student performance within this class, for the teacher view.

        Returns, for ?student_id=:
          - per-assignment: the student's score vs the class average (for the
            score-vs-average line chart)
          - overall average, class overall average, rank and percentile
          - counts (assignments attempted, completed)

        'Score' is GradebookEntry.final_score (0-100 graded percentage).
        """
        from assignments.models import ContentItem

        class_obj = self.get_object()
        student_id = request.query_params.get('student_id')
        if not student_id:
            return Response({'message': 'student_id is required'}, status=400)

        # Permission: owner/teacher/admin (or the student themselves)
        is_owner = class_obj.owner_id == request.user.id
        is_teacher = Enrollment.objects.filter(
            class_obj=class_obj, user=request.user, role='teacher'
        ).exists()
        is_admin = getattr(request.user, 'role', None) == 'admin'
        is_self = str(request.user.id) == str(student_id)
        if not (is_owner or is_teacher or is_admin or is_self):
            return Response({'message': 'Not authorized.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            student = User.objects.get(id=student_id)
        except (User.DoesNotExist, ValueError):
            return Response({'message': 'Student not found'}, status=404)

        # Graded content items (assignments + quizzes) in this class.
        items = list(
            ContentItem.objects
            .filter(module__class_obj=class_obj, type__in=['assignment', 'quiz'])
            .order_by('created_at')
        )
        item_ids = [it.id for it in items]

        # All gradebook entries for these items → build class averages + this student's scores.
        entries = GradebookEntry.objects.filter(
            content_item_id__in=item_ids
        ).values('student_id', 'content_item_id', 'final_score')

        # class_scores[item_id] = list of scores ; student_scores[item_id] = score
        class_scores = {iid: [] for iid in item_ids}
        student_scores = {}
        per_student_totals = {}   # student_id -> list of scores (for overall rank)
        for e in entries:
            iid = e['content_item_id']
            score = float(e['final_score'] or 0)
            class_scores.setdefault(iid, []).append(score)
            per_student_totals.setdefault(e['student_id'], []).append(score)
            if str(e['student_id']) == str(student_id):
                student_scores[iid] = score

        assignments = []
        for it in items:
            scores = class_scores.get(it.id, [])
            class_avg = round(sum(scores) / len(scores), 1) if scores else 0.0
            stu = student_scores.get(it.id)
            assignments.append({
                'id': str(it.id),
                'title': it.title,
                'type': it.type,
                'student_score': round(stu, 1) if stu is not None else None,
                'class_average': class_avg,
                'attempted': stu is not None,
            })

        # Overall averages.
        stu_vals = [a['student_score'] for a in assignments if a['student_score'] is not None]
        student_overall = round(sum(stu_vals) / len(stu_vals), 1) if stu_vals else 0.0

        overall_by_student = {
            sid: (sum(v) / len(v)) for sid, v in per_student_totals.items() if v
        }
        class_overall = (
            round(sum(overall_by_student.values()) / len(overall_by_student), 1)
            if overall_by_student else 0.0
        )

        # Rank + percentile (higher score = better).
        ranking = sorted(overall_by_student.items(), key=lambda kv: kv[1], reverse=True)
        rank = None
        total_ranked = len(ranking)
        for idx, (sid, _score) in enumerate(ranking, start=1):
            if str(sid) == str(student_id):
                rank = idx
                break
        percentile = (
            round(100.0 * (total_ranked - rank) / total_ranked, 0)
            if rank and total_ranked > 1 else (100.0 if rank else None)
        )

        total_students = User.objects.filter(
            enrollments__class_obj=class_obj, enrollments__role='student'
        ).distinct().count()

        return Response({
            'student': {
                'id': str(student.id),
                'name': f"{student.first_name} {student.last_name}".strip() or student.username,
                'username': student.username,
                'email': student.email,
            },
            'class_name': class_obj.name,
            'assignments': assignments,
            'student_overall_average': student_overall,
            'class_overall_average': class_overall,
            'rank': rank,
            'total_ranked': total_ranked,
            'total_students': total_students,
            'percentile': percentile,
            'assignments_attempted': len(stu_vals),
            'total_assignments': len(items),
        })

    @action(detail=True, methods=['get'], url_path='stats')
    def class_stats(self, request, pk=None):
        """Class overview stats for the teacher dashboard (Canvas-like).

        assignments: total / published(active) / draft, graded / to-grade / ungraded,
        submissions received, students, and needs-grading count.
        """
        from django.utils import timezone
        from assignments.models import Assignment
        from submissions.models import SubmissionAttempt, GradebookEntry

        class_obj = self.get_object()

        # Permission: owner / teacher / TA / admin can see class-level insights.
        role = None
        if class_obj.owner_id == request.user.id:
            role = 'teacher'
        else:
            enr = Enrollment.objects.filter(class_obj=class_obj, user=request.user).first()
            role = enr.role if enr else None
        if role not in ('teacher', 'ta') and getattr(request.user, 'role', None) != 'admin':
            return Response({'message': 'Not authorized.'}, status=status.HTTP_403_FORBIDDEN)

        assignments = list(Assignment.objects.filter(module__class_obj=class_obj))
        assignment_ids = [a.id for a in assignments]
        now = timezone.now()

        total_assignments = len(assignments)
        published = sum(1 for a in assignments if a.is_published)
        drafts = total_assignments - published
        # "Active" = published and not past due (accepting submissions).
        active = sum(
            1 for a in assignments
            if a.is_published and (a.due_date is None or a.due_date >= now)
        )
        past_due = sum(
            1 for a in assignments
            if a.is_published and a.due_date is not None and a.due_date < now
        )

        student_count = Enrollment.objects.filter(
            class_obj=class_obj, role='student'
        ).values('user_id').distinct().count()

        # Submissions received across the class.
        total_submissions = SubmissionAttempt.objects.filter(
            assignment_question__assignment_id__in=assignment_ids
        ).count()
        # Distinct (student, assignment) that have at least one submission.
        submitted_pairs = SubmissionAttempt.objects.filter(
            assignment_question__assignment_id__in=assignment_ids
        ).values('student_id', 'assignment_question__assignment_id').distinct().count()

        # Gradebook: graded vs pending, per (student, assignment).
        entries = GradebookEntry.objects.filter(content_item_id__in=assignment_ids)
        graded_entries = entries.filter(status='graded').count()
        # Needs grading: submitted but not yet graded.
        needs_grading = max(submitted_pairs - graded_entries, 0)

        # Per-assignment breakdown (for a compact list).
        per_assignment = []
        for a in assignments:
            a_subs = SubmissionAttempt.objects.filter(
                assignment_question__assignment=a
            ).values('student_id').distinct().count()
            a_graded = GradebookEntry.objects.filter(
                content_item_id=a.id, status='graded'
            ).count()
            is_active = a.is_published and (a.due_date is None or a.due_date >= now)
            per_assignment.append({
                'id': str(a.id),
                'title': a.title,
                'is_published': a.is_published,
                'is_active': is_active,
                'due_date': a.due_date,
                'submissions': a_subs,
                'graded': a_graded,
                'to_grade': max(a_subs - a_graded, 0),
            })

        return Response({
            'class_id': str(class_obj.id),
            'students': student_count,
            'assignments': {
                'total': total_assignments,
                'published': published,
                'active': active,
                'drafts': drafts,
                'past_due': past_due,
            },
            'grading': {
                'graded': graded_entries,
                'needs_grading': needs_grading,
                'submitted_pairs': submitted_pairs,
            },
            'submissions_received': total_submissions,
            'per_assignment': per_assignment,
        })

    @action(detail=True, methods=['get'], url_path='student-topic-grades')
    def student_topic_grades(self, request, pk=None):
        """
        Get aggregated grades by topic (tags) for a student in this class.
        """
        class_obj = self.get_object()
        student_id = request.query_params.get('student_id')
        
        if not student_id:
            return Response({'message': 'Student ID is required'}, status=status.HTTP_400_BAD_REQUEST)
            
        # Verify student is enrollment in class
        if not Enrollment.objects.filter(class_obj=class_obj, user_id=student_id, role='student').exists():
             return Response({'message': 'Student not found in this class'}, status=status.HTTP_404_NOT_FOUND)

        # Get all attempts for this student in this class
        # Path: Attempt -> AssignmentQuestion -> Assignment -> Module -> Class
        attempts = SubmissionAttempt.objects.filter(
            student_id=student_id,
            assignment_question__assignment__module__class_obj=class_obj
            # status='success' <-- REMOVED to include failed attempts
        ).select_related('assignment_question__question')
        
        # We need "Latest Attempt" per Question to avoid counting multiple attempts for same question
        # Group by AssignmentQuestion
        latest_attempts = {}
        for attempt in attempts:
            aq_id = attempt.assignment_question_id
            # If we haven't seen this AQ or this attempt is newer
            if aq_id not in latest_attempts or attempt.created_at > latest_attempts[aq_id].created_at:
                latest_attempts[aq_id] = attempt
                
        # Now aggregate by Tag
        tag_stats = {} # { tag: { total_score: 0, count: 0 } }
        
        for attempt in latest_attempts.values():
            question = attempt.assignment_question.question
            tags = question.tags or [] # List of strings
            
            # Calculate percentage score for this attempt
            if attempt.manual_score is not None:
                # Manual override is stored as percentage (0-100).
                score = attempt.manual_score
            else:
                score = 100 if attempt.status == 'success' else 0
            
            # Cap at 100
            if score > 100: score = 100
            
            # If no tags, maybe categorize as "Uncategorized"?
            if not tags:
                tags = ["General"]
                
            for tag in tags:
                if tag not in tag_stats:
                    tag_stats[tag] = {'total_score': 0, 'count': 0}
                tag_stats[tag]['total_score'] += score
                tag_stats[tag]['count'] += 1
                
        # Format for response
        results = []
        for tag, stats in tag_stats.items():
            results.append({
                'topic': tag,
                'score': round(stats['total_score'] / stats['count']),
                'questions_count': stats['count']
            })
            
        return Response(results)


class EnrollmentViewSet(viewsets.ModelViewSet):
    serializer_class = EnrollmentSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return Enrollment.objects.filter(
            user=self.request.user
        ).select_related('class_obj', 'user')


class AnnouncementViewSet(viewsets.ModelViewSet):
    serializer_class = AnnouncementSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None
    
    def get_queryset(self):
        class_id = self.request.query_params.get('class_id')
        if class_id:
             # Ensure user is enrolled or owner
             # For now, simplistic check or reliance on frontend passing valid IDs
             return Announcement.objects.filter(class_obj_id=class_id).select_related('author').annotate(
                 comments_count=Count('comments', distinct=True)
             ).order_by('-is_pinned', '-created_at')
        return Announcement.objects.none()
    
    def perform_create(self, serializer):
        # In a real app, verify user has permission to post in this class
        announcement = serializer.save(author=self.request.user)
        
        # Send Notification to class members
        try:
            from notifications.models import Notification
            from .models import Enrollment
            
            class_obj = announcement.class_obj
            enrollments = Enrollment.objects.filter(class_obj=class_obj).exclude(user=self.request.user).select_related('user')
            
            for enrollment in enrollments:
                Notification.objects.create(
                    user=enrollment.user,
                    type='alert',
                    title=f'New Announcement in {class_obj.name}',
                    message=f'{self.request.user.first_name} {self.request.user.last_name}: {announcement.content[:50]}...',
                    reference_link=f'/student/class/{class_obj.id}?tab=stream' if enrollment.role == 'student' else f'/teacher/class/{class_obj.id}?tab=stream'
                )
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to send announcement notification: {e}")

    @action(detail=True, methods=['post'], url_path='attachments',
            parser_classes=[MultiPartParser, FormParser])
    def add_attachment(self, request, pk=None):
        """Attach a file (pdf/ppt/doc/image/etc.) to an announcement."""
        from .models import AnnouncementAttachment
        from .serializers import AnnouncementAttachmentSerializer

        announcement = self.get_object()
        # Only the author (or class owner/teacher) may attach.
        if announcement.author_id != request.user.id and \
                announcement.class_obj.owner_id != request.user.id and \
                not Enrollment.objects.filter(
                    class_obj=announcement.class_obj, user=request.user, role__in=['teacher', 'ta']
                ).exists():
            return Response({'message': 'Not authorized.'}, status=status.HTTP_403_FORBIDDEN)

        f = request.FILES.get('file')
        if not f:
            return Response({'message': 'No file provided.'}, status=400)

        att = AnnouncementAttachment.objects.create(
            announcement=announcement,
            file=f,
            original_name=f.name,
            size=f.size,
            content_type=getattr(f, 'content_type', '') or '',
        )
        return Response(
            AnnouncementAttachmentSerializer(att, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class CommentViewSet(viewsets.ModelViewSet):
    serializer_class = CommentSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
         announcement_id = self.request.query_params.get('announcement_id')
         assignment_id = self.request.query_params.get('assignment_id')
         
         queryset = Comment.objects.select_related('author').order_by('created_at')
         
         if announcement_id:
             return queryset.filter(announcement_id=announcement_id)
         if assignment_id:
             return queryset.filter(assignment_id=assignment_id)
             
         return queryset

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)


# ---------------------------------------------------------------------------
# Shared helper: is this user a grader (teacher/TA/owner/admin) in a class?
# ---------------------------------------------------------------------------
def _is_class_staff(user, class_obj):
    if class_obj.owner_id == user.id:
        return True
    if getattr(user, 'role', None) == 'admin':
        return True
    return Enrollment.objects.filter(
        class_obj=class_obj, user=user, role__in=['teacher', 'ta']
    ).exists()


def _is_class_member(user, class_obj):
    if _is_class_staff(user, class_obj):
        return True
    return Enrollment.objects.filter(class_obj=class_obj, user=user).exists()


class ClassResourceViewSet(viewsets.ModelViewSet):
    """Class materials (lecture notes, slides, pdfs). View: any member.
    Create/update/delete: teacher/TA/owner/admin only."""
    serializer_class = ClassResourceSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    pagination_class = None

    def get_queryset(self):
        qs = ClassResource.objects.select_related('uploaded_by', 'class_obj')
        if self.action == 'list':
            class_id = self.request.query_params.get('class_id')
            return qs.filter(class_obj_id=class_id) if class_id else qs.none()
        return qs

    def _get_class(self, request):
        class_id = request.data.get('class_obj') or request.query_params.get('class_id')
        return Class.objects.filter(id=class_id).first()

    def create(self, request, *args, **kwargs):
        class_obj = self._get_class(request)
        if not class_obj:
            return Response({'message': 'class_obj is required.'}, status=400)
        if not _is_class_staff(request.user, class_obj):
            return Response({'message': 'Only teachers/TAs can upload resources.'},
                            status=status.HTTP_403_FORBIDDEN)

        f = request.FILES.get('file')
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        extra = {'uploaded_by': request.user, 'class_obj': class_obj}
        if f:
            extra.update({
                'original_name': f.name,
                'size': f.size,
                'content_type': getattr(f, 'content_type', '') or '',
            })
        resource = serializer.save(**extra)
        return Response(self.get_serializer(resource).data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        resource = self.get_object()
        if not _is_class_staff(request.user, resource.class_obj):
            return Response({'message': 'Not authorized.'}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)


class DiscussionThreadViewSet(viewsets.ModelViewSet):
    """Discussion board threads. Any class member can start a thread; staff can
    pin/resolve. Replies are added via the `reply` action."""
    serializer_class = DiscussionThreadSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        qs = (DiscussionThread.objects
              .select_related('author', 'class_obj')
              .prefetch_related('replies__author'))
        # Only filter by class_id for list; detail actions (reply/resolve/delete)
        # must resolve any thread by pk.
        if self.action == 'list':
            class_id = self.request.query_params.get('class_id')
            return qs.filter(class_obj_id=class_id) if class_id else qs.none()
        return qs

    def perform_create(self, serializer):
        class_obj = serializer.validated_data.get('class_obj')
        if not class_obj or not _is_class_member(self.request.user, class_obj):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('You must be a member of this class to post.')
        serializer.save(author=self.request.user)

    @action(detail=True, methods=['post'], url_path='reply')
    def reply(self, request, pk=None):
        thread = self.get_object()
        if not _is_class_member(request.user, thread.class_obj):
            return Response({'message': 'Not authorized.'}, status=status.HTTP_403_FORBIDDEN)
        content = (request.data.get('content') or '').strip()
        if not content:
            return Response({'message': 'content is required.'}, status=400)
        reply = DiscussionReply.objects.create(
            thread=thread, author=request.user, content=content
        )
        return Response(
            DiscussionReplySerializer(reply, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'], url_path='toggle-resolved')
    def toggle_resolved(self, request, pk=None):
        thread = self.get_object()
        if not _is_class_staff(request.user, thread.class_obj):
            return Response({'message': 'Only teachers/TAs can resolve threads.'},
                            status=status.HTTP_403_FORBIDDEN)
        thread.is_resolved = not thread.is_resolved
        thread.save(update_fields=['is_resolved'])
        return Response({'is_resolved': thread.is_resolved})

    def destroy(self, request, *args, **kwargs):
        thread = self.get_object()
        # Author or class staff can delete.
        if thread.author_id != request.user.id and not _is_class_staff(request.user, thread.class_obj):
            return Response({'message': 'Not authorized.'}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)
