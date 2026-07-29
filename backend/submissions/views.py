from collections import Counter, defaultdict
from statistics import median
import re

from rest_framework import viewsets, status
from django.db import models, transaction
from django.db.models import Sum
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from .models import SubmissionAttempt, AssignmentProgress, TestResult, GradebookEntry
from .serializers import SubmissionAttemptSerializer, AssignmentProgressSerializer, GradebookEntrySerializer
from .services import execute_code, analyze_code_structure
from assignments.models import AssignmentQuestion, ContentItem, Question
from gamification.points_calculator import PointsCalculator
import logging

logger = logging.getLogger(__name__)


def _check_assignment_start_time(assignment_id, user):
    """Check if assignment is accessible based on start_time. Raises PermissionError if not."""
    from assignments.models import ContentItem
    try:
        content_item = ContentItem.objects.get(id=assignment_id)
        now = timezone.now()
        if user.role != 'student':
            return
        if content_item.start_time and content_item.start_time > now:
            raise PermissionError(
                f'This assignment is not available yet. It starts at {content_item.start_time.isoformat()}'
            )
        is_exam_or_quiz = content_item.type == 'quiz'
        if not is_exam_or_quiz and content_item.type == 'assignment':
            try:
                is_exam_or_quiz = content_item.assignment.mode == 'exam'
            except Exception:
                is_exam_or_quiz = False
        if is_exam_or_quiz and content_item.due_date and content_item.due_date < now:
            raise PermissionError(
                f'This assignment is no longer available. It was due at {content_item.due_date.isoformat()}'
            )
    except ContentItem.DoesNotExist:
        raise PermissionError('Assignment not found')


class SubmissionAttemptViewSet(viewsets.ModelViewSet):
    serializer_class = SubmissionAttemptSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None
    ordering_fields = ['created_at', 'status', 'final_score', 'student__username']
    filterset_fields = ['status', 'student']
    
    def get_queryset(self):
        user = self.request.user
        queryset = SubmissionAttempt.objects.select_related(
            'assignment_question',
            'assignment_question__assignment',
            'assignment_question__question',
            'student',
        ).prefetch_related(
            'test_results',
        )
        
        # Filter by Assignment ID (via AssignmentQuestion)
        assignment_id = self.request.query_params.get('assignment_id')
        if assignment_id:
            queryset = queryset.filter(assignment_question__assignment_id=assignment_id)
            
        if user.role == 'student':
            queryset = queryset.filter(student=user)
            
        return queryset

    @action(detail=False, methods=['get'], url_path='analytics')
    def analytics(self, request):
        """Lightweight endpoint for analytics charts — no pagination,
        minimal fields. Uses prefetch + annotation to eliminate N+1 queries."""
        from .serializers import SubmissionAnalyticsSerializer
        from django.db.models import Count, Q

        assignment_id = request.query_params.get('assignment_id')

        # Lean queryset — only the related fields analytics needs
        # We use prefetch_related for test_results and count them in Python (in the serializer)
        # to avoid a massive SQL GROUP BY that takes >2.5s and locks the database.
        queryset = SubmissionAttempt.objects.select_related(
            'assignment_question',
            'assignment_question__question',
            'student',
        ).prefetch_related(
            'test_results'
        )
        if assignment_id:
            queryset = queryset.filter(assignment_question__assignment_id=assignment_id)
        if request.user.role == 'student':
            queryset = queryset.filter(student=request.user)

        serializer = SubmissionAnalyticsSerializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='overview')
    def assignment_overview(self, request):
        """Assignment-level overview analytics for the teacher dashboard:
          - per-question average score (0-100) + attempt/submission counts
          - overall class pass percentage
          - average questions attempted per student

        'Score' here is the graded percentage: manual_score if a manual grade
        exists, otherwise passed_tests / total_tests * 100 (mirrors the gradebook).
        """
        from assignments.models import Assignment, AssignmentQuestion
        from django.contrib.auth import get_user_model

        assignment_id = request.query_params.get('assignment_id')
        if not assignment_id:
            return Response({'message': 'assignment_id is required'}, status=400)
        try:
            assignment = Assignment.objects.select_related('module__class_obj').get(id=assignment_id)
        except Assignment.DoesNotExist:
            return Response({'message': 'Assignment not found'}, status=404)

        User = get_user_model()
        total_students = User.objects.filter(
            enrollments__class_obj=assignment.module.class_obj,
            enrollments__role='student',
        ).distinct().count()

        # Pass threshold (percent) — a student "passes" a question at >= this score.
        PASS_THRESHOLD = 50.0

        questions = []
        # Track, per student, how many questions they attempted and whether they
        # passed the assignment overall (avg of their question scores >= threshold).
        student_attempts = {}   # student_id -> set(question ids attempted)
        student_scores = {}     # student_id -> list of question scores

        aqs = (
            AssignmentQuestion.objects
            .filter(assignment_id=assignment_id)
            .select_related('question')
            .order_by('order')
        )

        for aq in aqs:
            question = aq.question
            test_cases = question.test_cases or []
            num_tests = len(test_cases)

            # Latest attempt per student for this question.
            latest_attempts = (
                SubmissionAttempt.objects
                .filter(assignment_question=aq)
                .order_by('student_id', '-created_at')
                .distinct('student_id')
                .prefetch_related('test_results')
            )

            scores = []
            attempt_count = 0
            for attempt in latest_attempts:
                attempt_count += 1
                sid = attempt.student_id
                student_attempts.setdefault(sid, set()).add(aq.question_id)

                if attempt.manual_score is not None:
                    score = max(0.0, min(100.0, attempt.manual_score))
                elif num_tests > 0:
                    passed = min(attempt.test_results.filter(status='pass').count(), num_tests)
                    score = (passed / num_tests) * 100.0
                else:
                    score = 0.0
                scores.append(score)
                student_scores.setdefault(sid, []).append(score)

            avg_score = round(sum(scores) / len(scores), 1) if scores else 0.0
            pass_rate = (
                round(100.0 * sum(1 for s in scores if s >= PASS_THRESHOLD) / len(scores), 1)
                if scores else 0.0
            )
            questions.append({
                'question_id': str(question.id),
                'question_slug': question.slug,
                'title': question.title,
                'order': aq.order,
                'language': (question.config or {}).get('language', 'python'),
                'average_score': avg_score,
                'pass_rate': pass_rate,
                'attempts': attempt_count,        # students who submitted this question
                'not_attempted': max(total_students - attempt_count, 0),
            })

        # Overall pass percentage: share of students whose average question score
        # across attempted questions is >= threshold.
        passed_students = 0
        for sid, sc in student_scores.items():
            if sc and (sum(sc) / len(sc)) >= PASS_THRESHOLD:
                passed_students += 1
        overall_pass_percentage = (
            round(100.0 * passed_students / total_students, 1) if total_students else 0.0
        )

        # Average questions attempted per student (over enrolled students).
        total_attempted = sum(len(qs) for qs in student_attempts.values())
        avg_questions_attempted = (
            round(total_attempted / total_students, 2) if total_students else 0.0
        )
        students_who_attempted = len(student_attempts)

        return Response({
            'assignment_id': str(assignment.id),
            'total_students': total_students,
            'total_questions': aqs.count(),
            'pass_threshold': PASS_THRESHOLD,
            'overall_pass_percentage': overall_pass_percentage,
            'students_passed': passed_students,
            'students_who_attempted': students_who_attempted,
            'avg_questions_attempted': avg_questions_attempted,
            'questions': questions,
        })

    @action(detail=False, methods=['get'], url_path='summary')
    def get_assignment_summary(self, request):
        """
        Returns aggregated list of students for an assignment.
        Teacher only.
        """
        assignment_id = request.query_params.get('assignment_id')
        if not assignment_id: return Response({'message': 'Missing ID'}, status=400)
        
        from assignments.models import Assignment
        try:
            assignment = Assignment.objects.select_related('module__class_obj').get(id=assignment_id)
        except Assignment.DoesNotExist:
             return Response({'message': 'Assignment not found'}, status=404)

        # 0. Get All Enrolled Students (from the Class)
        class_obj = assignment.module.class_obj
        # Local import User if not imported at top level
        from django.contrib.auth import get_user_model
        User = get_user_model()
        enrolled_students = User.objects.filter(enrollments__class_obj=class_obj, enrollments__role='student')
        
        student_map = {}
        for student in enrolled_students:
             student_map[student.id] = {
                'student': {
                    'id': student.id,
                    'first_name': student.first_name,
                    'last_name': student.last_name,
                    'email': student.email,
                    'username': student.username
                },
                'status': 'not_started',
                'final_score': 0,
                'updated_at': None,
                'questions_completed': 0,
                'total_questions': 0 
            }

        # (Removed self-heal loop: manual grading endpoint already updates gradebook. Doing it here causes timeouts)

        # 1. Get Gradebook
        entries = GradebookEntry.objects.filter(content_item_id=assignment_id).select_related('student')
        for entry in entries:
            if entry.student_id in student_map:
                student_map[entry.student_id]['status'] = entry.status
                student_map[entry.student_id]['final_score'] = entry.final_score
                student_map[entry.student_id]['updated_at'] = entry.updated_at
        
        # 2. Any real submission attempt => submitted (unless already graded)
        submitted_rows = SubmissionAttempt.objects.filter(
            assignment_question__assignment_id=assignment_id
        ).values('student_id').annotate(
            submitted_questions=models.Count('assignment_question', distinct=True)
        )
        for row in submitted_rows:
            sid = row['student_id']
            if sid in student_map:
                if student_map[sid]['status'] != 'graded':
                    student_map[sid]['status'] = 'submitted'
                student_map[sid]['questions_completed'] = row['submitted_questions']

        # 3. Progress without submission attempts => in_progress
        progress_rows = AssignmentProgress.objects.filter(
            assignment_question__assignment_id=assignment_id
        ).values('student_id').distinct()
        for p in progress_rows:
            sid = p['student_id']
            if sid in student_map and student_map[sid]['status'] == 'not_started':
                student_map[sid]['status'] = 'in_progress'

        # Total questions
        total_questions = AssignmentQuestion.objects.filter(assignment_id=assignment_id).count()
        for sid in student_map:
            student_map[sid]['total_questions'] = total_questions
        
        return Response(list(student_map.values()))

        
    def create(self, request, *args, **kwargs):
        assignment_question_id = request.data.get('assignment_question_id')
        code = request.data.get('code_content') # Client sends code_content for coding
        response_data = request.data.get('response_data') # Client sends response_data for MCQ
        
        if not assignment_question_id:
             return Response({'message': 'Missing data'}, status=status.HTTP_400_BAD_REQUEST)
             
        try:
            aq = AssignmentQuestion.objects.select_related('question', 'assignment').get(id=assignment_question_id)
        except AssignmentQuestion.DoesNotExist:
            return Response({'message': 'Invalid assignment question'}, status=status.HTTP_404_NOT_FOUND)

        # Prevent re-taking finished exams
        if aq.assignment.mode == 'exam' and GradebookEntry.objects.filter(
            student=request.user,
            content_item=aq.assignment,
            status__in=['submitted', 'graded']
        ).exists():
            return Response(
                {'message': 'This exam has already been submitted and cannot be retaken.'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Check assignment start_time
        try:
            _check_assignment_start_time(aq.assignment.id, request.user)
        except PermissionError as e:
            return Response({'message': str(e)}, status=status.HTTP_403_FORBIDDEN)

        is_mcq = aq.question.question_type == 'mcq'
        if not is_mcq and code is None:
            return Response({'message': 'Missing code content'}, status=status.HTTP_400_BAD_REQUEST)
        if is_mcq and response_data is None:
            return Response({'message': 'Missing response data'}, status=status.HTTP_400_BAD_REQUEST)

        language = request.data.get('language', 'python')
        
        # Analyze code structure
        keywords = []
        if not is_mcq and language == 'python' and code:
             keywords = analyze_code_structure(code)

        # Create Attempt
        attempt = SubmissionAttempt.objects.create(
            student=request.user,
            assignment_question=aq,
            attempt_number=SubmissionAttempt.objects.filter(student=request.user, assignment_question=aq).count() + 1,
            status='processing',
            source_code=code if not is_mcq else '',
            response_data=response_data if is_mcq else None,
            detected_keywords=keywords,
        )

        if is_mcq:
            # Synchronous Grading for MCQ
            test_cases = aq.question.test_cases or []
            # In assignments, the correct index is typically stored in the question config or the first test case
            config = aq.question.config or {}
            
            # Determine correct option
            correct_option_index = None
            if 'correct_option' in config:
                correct_option_index = config['correct_option']
            elif test_cases and len(test_cases) > 0 and 'correct_option' in test_cases[0]:
                correct_option_index = test_cases[0]['correct_option']
            
            # Normalize submitted answer to int index explicitly
            actual_answer = response_data.get('answer') if isinstance(response_data, dict) else response_data
            
            try:
                # If boolean (e.g., frontend sent true/false instead of index for a true/false MCQ)
                if isinstance(actual_answer, bool):
                    actual_answer_int = 1 if actual_answer else 0
                elif str(actual_answer).strip().lower() == 'true':
                    actual_answer_int = 1
                elif str(actual_answer).strip().lower() == 'false':
                    actual_answer_int = 0
                else:
                    actual_answer_int = int(actual_answer)
            except (ValueError, TypeError):
                actual_answer_int = -1 # Invalid submission

            try:
                # Same normalization for correct_option_index
                if isinstance(correct_option_index, bool):
                    correct_option_int = 1 if correct_option_index else 0
                elif str(correct_option_index).strip().lower() == 'true':
                    correct_option_int = 1
                elif str(correct_option_index).strip().lower() == 'false':
                    correct_option_int = 0
                else:
                    correct_option_int = int(correct_option_index)
            except (ValueError, TypeError):
                correct_option_int = -2 # Data integrity issue, force fail

            passed = (actual_answer_int == correct_option_int)
            
            TestResult.objects.create(
                attempt=attempt,
                test_case_id='mcq_1',
                status='pass' if passed else 'fail',
                score=100.0 if passed else 0.0,
                actual_output=actual_answer,
                error_message='' if passed else 'Incorrect answer'
            )
            
            attempt.status = 'success' # Overall success means completed execution, test_results determine pass/fail
            attempt.save()
            
            # Update Gradebook immediately
            self._update_gradebook(request.user, aq.assignment)
            
            serializer = self.get_serializer(attempt)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        # Execute Code (Async) for Coding Questions
        from .tasks import execute_submission_task

        def _enqueue_task():
            task = execute_submission_task.delay(attempt.id, language)
            logger.info(f"Enqueued execute_submission_task for attempt {attempt.id}, task_id={task.id}")

        transaction.on_commit(_enqueue_task)

        serializer = self.get_serializer(attempt)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='run')
    def run_code(self, request):
        """
        Run code in sandbox without saving submission.
        Expects: code, language, test_cases, question_id
        """
        code = request.data.get('code')
        language = request.data.get('language', 'python')
        test_cases = request.data.get('test_cases', [])
        
        if not code:
             return Response({'message': 'Missing code'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate language support
        supported_languages = ['python', 'c', 'java']
        if language.lower() not in supported_languages:
            return Response({
                'message': f'Unsupported language: {language}. Supported languages: {", ".join(supported_languages)}'
            }, status=status.HTTP_400_BAD_REQUEST)
             
        try:
            # Fetch config if question_id is provided
            config = {}
            question_id = request.data.get('question_id')
            if question_id:
                try:
                    question = Question.objects.get(id=question_id)
                    config = question.config
                    logger.info(f"Running code with config from Question {question_id}: {config}")
                except Question.DoesNotExist:
                    logger.warning(f"Question {question_id} not found for run_code config lookup.")
            
            results = execute_code(code, language, test_cases, config=config)
            
            formatted_results = []
            for r in results:
                err = r.get('error_message') if r.get('status') != 'pass' else None
                formatted_results.append({
                    'actual_output': r.get('console_output'),
                    'expected_output': r.get('test_case', {}).get('expected_output') if isinstance(r.get('test_case'), dict) else '',
                    'passed': r.get('status') == 'pass',
                    'error': err,
                    'error_message': err,
                    'status': r.get('status'),
                    'test_case': r.get('test_case')
                })

            response_data = {
                'summary': {
                    'execution_successful': True,
                    'has_output': any(r.get('console_output') for r in results)
                },
                'results': formatted_results
            }
            
            return Response({'data': response_data})
            
        except Exception as e:
            logger.error(f"Sandbox execution failed: {e}")
            return Response({'message': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            logger.error(f"Sandbox execution failed: {e}")
            return Response({'message': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


    @action(detail=True, methods=['post'], url_path='analyze-ai')
    def analyze_ai(self, request, pk=None):
        """
        Trigger Bulk AI Analysis for this assignment.
        """
        try:
             # Verify assignment exists
             from assignments.models import Assignment
             try:
                 assignment = Assignment.objects.get(id=pk)
             except Assignment.DoesNotExist:
                 return Response({'message': 'Assignment not found'}, status=status.HTTP_404_NOT_FOUND)
            
             # Trigger Celery Task
             from .tasks import analyze_assignment_ai_task
             task = analyze_assignment_ai_task.delay(pk)
             
             return Response({
                 'message': f'AI Analysis started for assignment {assignment.title}',
                 'task_id': task.id
             })
             
        except Exception as e:
            logger.error(f"Failed to trigger AI analysis: {e}")
            return Response({'message': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['put', 'patch'], url_path='grade')
    def grade(self, request, pk=None):
        """
        Manually grade a submission.
        """
        attempt = self.get_object()
        manual_score = request.data.get('manual_score')
        feedback = request.data.get('feedback_text')
        
        if manual_score is not None:
             # Manual override is stored as a percentage (0-100).
             try:
                 score = float(manual_score)
             except (TypeError, ValueError):
                 return Response({'message': 'manual_score must be a number'}, status=400)
             attempt.manual_score = max(0.0, min(100.0, score))
        if feedback is not None:
             attempt.feedback_text = feedback
             
        attempt.save()
        
        # Trigger Gradebook Recalculation
        self._update_gradebook(attempt.student, attempt.assignment_question.assignment)

        # Notify Student
        try:
            from notifications.models import Notification
            assignment = attempt.assignment_question.assignment
            class_obj = assignment.module.class_obj
            
            Notification.objects.create(
                user=attempt.student,
                type='grade_published',
                title=f'Grade Published: {assignment.title}',
                message=f'Your submission for "{assignment.title}" in {class_obj.name} has been graded.',
                reference_link=f'/student/workspace/{assignment.id}'
            )
        except Exception as e:
             logger.error(f"Failed to send grading notification: {e}")
        
        serializer = self.get_serializer(attempt)
        return Response(serializer.data)

    def _update_gradebook(self, student, assignment):
        """
        Recalculate total score for assignment and update gradebook.
        Logic: Weighted by number of test cases (Total Passed / Total Tests).
        If Manual Score is present, it counts as (Score% * NumTests) passed.
        Now also includes points information from the gamification system.
        """
        aqs = AssignmentQuestion.objects.filter(assignment=assignment)
        total_questions = aqs.count()
        
        sum_question_percentages = 0
        questions_counted = 0
        total_points_earned = 0
        
        for aq in aqs:
            # Get latest attempt
            latest = SubmissionAttempt.objects.filter(
                student=student,
                assignment_question=aq
            ).order_by('-created_at').first()
            
            # Determine score for this question (0-100 scale)
            question_score = 0
            
            # aq.question.test_cases is a list of dicts
            test_cases = aq.question.test_cases or []
            num_tests = len(test_cases)
            
            if latest:
                if latest.manual_score is not None:
                    # Manual override is already stored as percentage (0-100).
                    question_score = max(0.0, min(100.0, latest.manual_score))
                elif num_tests > 0:
                    # Auto-calculated based on tests
                    results = latest.test_results.all()
                    if results:
                         passed = results.filter(status='pass').count()
                         passed = min(passed, num_tests) # Cap at max tests
                         question_score = (passed / num_tests) * 100
                else:
                    # No tests, no manual score. Default to 0? Or 100 if submitted? 
                    # Usually 0 if purely auto-graded until manual grade comes in.
                    question_score = 0

                    
                # Calculate points earned for this question
                try:
                    test_results_data = []
                    for test_result in latest.test_results.all():
                        test_results_data.append({
                            'status': test_result.status,
                            'score': test_result.score
                        })
                    
                    if test_results_data:
                        calculator = PointsCalculator()
                        question_points = calculator.calculate_assignment_points(
                            test_results=test_results_data,
                            attempt_number=latest.attempt_number,
                            assignment_question=aq
                        )
                        total_points_earned += question_points
                except Exception as e:
                    logger.error(f"Error calculating points for gradebook: {e}")
            else:
                # No attempt
                question_score = 0
            
            sum_question_percentages += question_score
            questions_counted += 1

        # Final Calculation: Average of Question Scores
        final_assignment_score = 0
        if total_questions > 0:
            final_assignment_score = sum_question_percentages / total_questions
             
        # Update Gradebook
        content_item = ContentItem.objects.get(id=assignment.id)
        entry, _ = GradebookEntry.objects.get_or_create(student=student, content_item=content_item)
        entry.final_score = final_assignment_score
        entry.points_earned = total_points_earned  # Store points in gradebook
        
        # Log points information
        if total_points_earned > 0:
            logger.info(f"Assignment {assignment.id} for {student.username}: {total_points_earned} points earned")
        
        # Check for Manual Grading Status
        # If any question has a manual score, mark the whole assignment as 'graded' (or partially graded?)
        # User said: "if teacher updates the score in rubric, we will show that as final score with graded"
        has_manual = SubmissionAttempt.objects.filter(
            student=student, 
            assignment_question__assignment=assignment, 
            manual_score__isnull=False
        ).exists()
        
        if has_manual:
            entry.status = 'graded'
        
        # Ensure we don't overwrite 'graded' with 'submitted' if we just ran an autograder for a new submission
        # But here we are just updating score. 
            
        entry.save()

    def _award_assignment_points(self, submission_attempt, test_results_data):
        """
        Award points for assignment submissions using the gamification system.
        
        Args:
            submission_attempt: The SubmissionAttempt instance
            test_results_data: List of test result dictionaries
        """
        try:
            calculator = PointsCalculator()
            points_awarded = calculator.calculate_and_award_assignment_points(
                submission_attempt=submission_attempt,
                test_results=test_results_data
            )
            
            if points_awarded > 0:
                logger.info(
                    f"Awarded {points_awarded} assignment points to {submission_attempt.student.username} "
                    f"for {submission_attempt.assignment_question}"
                )
                
        except Exception as e:
            logger.error(
                f"Error awarding assignment points for submission {submission_attempt.id}: {e}",
                exc_info=True
            )


class AssignmentProgressViewSet(viewsets.ModelViewSet):
    serializer_class = AssignmentProgressSerializer
    permission_classes = [IsAuthenticated]
    queryset = AssignmentProgress.objects.all()
    
    def get_queryset(self):
        return AssignmentProgress.objects.filter(student=self.request.user)
    
    def perform_create(self, serializer):
        # Update or create logic is better handled by frontend calling a specific endpoint or us overriding create
        # Here we assume POST creates/updates
        pass

    def _get_assignment_for_student(self, assignment_id, user):
        from assignments.models import Assignment

        return Assignment.objects.select_related('module__class_obj').filter(
            id=assignment_id,
            module__class_obj__enrollments__user=user,
            module__class_obj__enrollments__role='student',
        ).first()

    def _get_gradebook_entry(self, assignment_id, user):
        return GradebookEntry.objects.filter(
            student=user,
            content_item_id=assignment_id,
        ).first()

    def _is_report_unlocked(self, grade_entry):
        return bool(grade_entry and grade_entry.status == 'graded')

    def _score_attempt_percentage(self, attempt):
        if attempt is None:
            return 0.0

        aq = attempt.assignment_question

        if attempt.manual_score is not None:
            return round(max(0.0, min(100.0, attempt.manual_score)), 2)

        test_cases = aq.question.test_cases or []
        total_tests = len(test_cases)
        results = list(attempt.test_results.all())
        if not results:
            return 0.0

        if total_tests <= 0:
            total_tests = len(results)
            if total_tests == 0:
                return 0.0

        passed = sum(1 for r in results if r.status == 'pass')
        return round((passed / total_tests) * 100, 2)

    def _parse_error_type(self, message, actual_output=''):
        msg = (message or '').strip()
        output_text = (actual_output or '').strip()
        combined = msg or output_text
        if not combined:
            return 'Output Mismatch'

        first_line = combined.splitlines()[0].strip()

        # Prefer real exception names when present in traceback/output.
        match = re.search(r'\b([A-Za-z_][A-Za-z0-9_]*(?:Error|Exception))\b', combined)
        if match:
            return match.group(1)

        if ':' in first_line:
            first = first_line.split(':', 1)[0].strip()
            if first and len(first) <= 40 and ' ' not in first:
                return first

        lowered = combined.lower()
        if 'timeout' in lowered or 'time limit' in lowered:
            return 'Timeout'
        if 'syntax' in lowered:
            return 'Syntax Error'
        if 'assert' in lowered:
            return 'AssertionError'
        if any(token in lowered for token in ('expected', 'actual', 'mismatch', 'wrong answer')):
            return 'Output Mismatch'
        if msg:
            return 'Runtime Error'
        return 'Output Mismatch'

    def _extract_ai_concepts(self, ai_analysis_data):
        concepts = []
        if not isinstance(ai_analysis_data, dict):
            return concepts

        feedback = ai_analysis_data.get('feedback')
        if isinstance(feedback, dict):
            raw_concepts = feedback.get('identified_concepts') or []
            for item in raw_concepts:
                if isinstance(item, str) and item.strip():
                    concepts.append(item.strip().lower())
                elif isinstance(item, dict):
                    name = item.get('name') or item.get('concept')
                    if isinstance(name, str) and name.strip():
                        concepts.append(name.strip().lower())

        static_data = ai_analysis_data.get('static')
        if isinstance(static_data, dict):
            for item in static_data.get('constructs_found', []) or []:
                if isinstance(item, str) and item.strip():
                    concepts.append(item.strip().lower())

        for item in ai_analysis_data.get('tags', []) or []:
            if isinstance(item, str) and item.strip():
                concepts.append(item.strip().lower())

        return concepts

    def _rank_for_student(self, sorted_rows, target_student_id):
        total = len(sorted_rows)
        if total == 0:
            return None, 0, None

        rank = None
        prev_key = None
        current_rank = 0
        target_id = str(target_student_id)

        for idx, row in enumerate(sorted_rows):
            sort_key = (
                round(float(row.get('score', 0) or 0), 4),
                int(row.get('time_spent_seconds', 0) or 0),
            )
            if prev_key != sort_key:
                current_rank = idx + 1
                prev_key = sort_key

            if str(row.get('student_id')) == target_id:
                rank = current_rank
                break

        if rank is None:
            return None, total, None

        if total <= 1:
            percentile = 100.0
        else:
            percentile = round(((total - rank) / (total - 1)) * 100, 1)

        return rank, total, percentile

    @action(detail=False, methods=['get'], url_path='live-monitor')
    def live_monitor(self, request):
        """Live class monitoring for an assignment (teacher only).

        Classifies every enrolled student as live / idle / inactive / submitted /
        not_started based on AssignmentProgress.last_updated, and reports which
        question each active student is currently working on.

        Query: ?assignment_id=  (optional &live_seconds=120 &idle_seconds=600)
        """
        from django.utils import timezone
        from datetime import timedelta
        from django.contrib.auth import get_user_model
        from assignments.models import Assignment, AssignmentQuestion

        assignment_id = request.query_params.get('assignment_id')
        if not assignment_id:
            return Response({'message': 'assignment_id is required'}, status=400)
        try:
            assignment = Assignment.objects.select_related('module__class_obj').get(id=assignment_id)
        except Assignment.DoesNotExist:
            return Response({'message': 'Assignment not found'}, status=404)

        # Permission: owner/teacher/admin
        class_obj = assignment.module.class_obj
        from classes.models import Enrollment
        is_owner = class_obj.owner_id == request.user.id
        is_teacher = Enrollment.objects.filter(
            class_obj=class_obj, user=request.user, role='teacher'
        ).exists()
        is_admin = getattr(request.user, 'role', None) == 'admin'
        if not (is_owner or is_teacher or is_admin):
            return Response({'message': 'Not authorized.'}, status=status.HTTP_403_FORBIDDEN)

        live_seconds = int(request.query_params.get('live_seconds', 120))
        idle_seconds = int(request.query_params.get('idle_seconds', 600))
        now = timezone.now()
        live_cutoff = now - timedelta(seconds=live_seconds)
        idle_cutoff = now - timedelta(seconds=idle_seconds)

        User = get_user_model()
        students = list(User.objects.filter(
            enrollments__class_obj=class_obj, enrollments__role='student'
        ).distinct())

        # Latest progress row per student for this assignment (any question).
        progress_qs = (
            AssignmentProgress.objects
            .filter(assignment_question__assignment_id=assignment_id)
            .select_related('assignment_question__question', 'student')
            .order_by('student_id', '-last_updated')
        )
        latest_progress = {}
        for p in progress_qs:
            if p.student_id not in latest_progress:
                latest_progress[p.student_id] = p

        # Students who have submitted at least one attempt.
        submitted_ids = set(
            SubmissionAttempt.objects
            .filter(assignment_question__assignment_id=assignment_id)
            .values_list('student_id', flat=True)
        )
        # Students who finished (gradebook entry submitted/graded).
        finished_ids = set(
            GradebookEntry.objects
            .filter(content_item_id=assignment_id, status__in=['submitted', 'graded'])
            .values_list('student_id', flat=True)
        )

        counts = {'live': 0, 'idle': 0, 'inactive': 0, 'submitted': 0, 'not_started': 0}
        students_out = []
        # Per-question "currently working" tally.
        question_activity = {}

        for s in students:
            p = latest_progress.get(s.id)
            last_updated = p.last_updated if p else None
            current_q = None
            if p and p.assignment_question_id:
                current_q = {
                    'question_id': str(p.assignment_question.question_id),
                    'slug': p.assignment_question.question.slug,
                    'title': p.assignment_question.question.title,
                    'assignment_question_id': str(p.assignment_question_id),
                }

            if s.id in finished_ids:
                state = 'submitted'
            elif last_updated and last_updated >= live_cutoff:
                state = 'live'
            elif last_updated and last_updated >= idle_cutoff:
                state = 'idle'
            elif p or s.id in submitted_ids:
                state = 'inactive'
            else:
                state = 'not_started'

            counts[state] = counts.get(state, 0) + 1

            # Tally which question live/idle students are on.
            if state in ('live', 'idle') and current_q:
                qa = question_activity.setdefault(current_q['slug'], {
                    'title': current_q['title'], 'slug': current_q['slug'], 'count': 0
                })
                qa['count'] += 1

            students_out.append({
                'id': str(s.id),
                'name': f"{s.first_name} {s.last_name}".strip() or s.username,
                'username': s.username,
                'state': state,
                'last_active': last_updated,
                'current_question': current_q,
                'time_spent': p.time_spent if p else 0,
                'has_submitted': s.id in submitted_ids,
            })

        # Sort: live first, then idle, inactive, submitted, not_started.
        order = {'live': 0, 'idle': 1, 'inactive': 2, 'submitted': 3, 'not_started': 4}
        students_out.sort(key=lambda x: (order.get(x['state'], 9), x['name']))

        return Response({
            'assignment_id': str(assignment.id),
            'assignment_title': assignment.title,
            'server_time': now,
            'total_students': len(students),
            'counts': counts,
            'question_activity': sorted(
                question_activity.values(), key=lambda q: -q['count']
            ),
            'students': students_out,
        })

    @action(detail=False, methods=['get'], url_path='student-live-code')
    def student_live_code(self, request):
        """Return a student's current draft code for the live 'watch' view.

        Query: ?assignment_id=&student_id=  (optionally &assignment_question_id=)
        Teacher/owner/admin only.
        """
        from assignments.models import Assignment, AssignmentQuestion
        from classes.models import Enrollment

        assignment_id = request.query_params.get('assignment_id')
        student_id = request.query_params.get('student_id')
        aq_id = request.query_params.get('assignment_question_id')
        if not assignment_id or not student_id:
            return Response({'message': 'assignment_id and student_id are required'}, status=400)

        try:
            assignment = Assignment.objects.select_related('module__class_obj').get(id=assignment_id)
        except Assignment.DoesNotExist:
            return Response({'message': 'Assignment not found'}, status=404)

        class_obj = assignment.module.class_obj
        is_owner = class_obj.owner_id == request.user.id
        is_teacher = Enrollment.objects.filter(
            class_obj=class_obj, user=request.user, role='teacher'
        ).exists()
        is_admin = getattr(request.user, 'role', None) == 'admin'
        if not (is_owner or is_teacher or is_admin):
            return Response({'message': 'Not authorized.'}, status=status.HTTP_403_FORBIDDEN)

        qs = AssignmentProgress.objects.filter(
            assignment_question__assignment_id=assignment_id,
            student_id=student_id,
        ).select_related('assignment_question__question')
        if aq_id:
            qs = qs.filter(assignment_question_id=aq_id)
        progress = qs.order_by('-last_updated').first()

        if not progress:
            return Response({
                'has_draft': False,
                'message': 'No live draft for this student yet.',
            })

        q = progress.assignment_question.question
        return Response({
            'has_draft': True,
            'student_id': str(student_id),
            'current_code': progress.current_code or '',
            'language': (q.config or {}).get('language', 'python'),
            'question': {'slug': q.slug, 'title': q.title,
                         'assignment_question_id': str(progress.assignment_question_id)},
            'last_updated': progress.last_updated,
            'time_spent': progress.time_spent,
        })

    @action(detail=False, methods=['get'], url_path='my-assignment-report-summary')
    def my_assignment_report_summary(self, request):
        assignment_id = request.query_params.get('assignment_id')
        if not assignment_id:
            return Response({'message': 'Missing assignment_id'}, status=400)

        assignment = self._get_assignment_for_student(assignment_id, request.user)
        if not assignment:
            return Response({'message': 'Assignment not found'}, status=404)

        grade_entry = self._get_gradebook_entry(assignment_id, request.user)
        report_unlocked = self._is_report_unlocked(grade_entry)

        assignment_questions = list(
            AssignmentQuestion.objects.filter(
                assignment=assignment
            ).select_related('question').order_by('order')
        )

        progress_rows = AssignmentProgress.objects.filter(
            assignment_question__assignment=assignment
        ).values('assignment_question_id', 'student_id', 'time_spent')
        time_spent_map = {
            (str(r['assignment_question_id']), str(r['student_id'])): int(r['time_spent'] or 0)
            for r in progress_rows
        }

        latest_attempts = list(
            SubmissionAttempt.objects.filter(
                assignment_question__assignment=assignment
            ).select_related(
                'assignment_question',
                'assignment_question__question',
                'student',
            ).prefetch_related(
                'test_results'
            ).order_by(
                'assignment_question_id',
                'student_id',
                '-created_at',
            ).distinct('assignment_question_id', 'student_id')
        )

        attempts_by_question = defaultdict(list)
        for attempt in latest_attempts:
            attempts_by_question[str(attempt.assignment_question_id)].append(attempt)

        overall_rank = None
        overall_percentile = None
        overall_participants = 0

        if report_unlocked:
            graded_entries = list(
                GradebookEntry.objects.filter(
                    content_item=assignment,
                    status='graded',
                ).values('student_id', 'final_score', 'updated_at')
            )
            overall_participants = len(graded_entries)

            total_time_rows = AssignmentProgress.objects.filter(
                assignment_question__assignment=assignment
            ).values('student_id').annotate(total_time=Sum('time_spent'))
            total_time_by_student = {
                str(r['student_id']): int(r['total_time'] or 0)
                for r in total_time_rows
            }

            overall_rows = []
            for row in graded_entries:
                sid = str(row['student_id'])
                overall_rows.append({
                    'student_id': sid,
                    'score': float(row['final_score'] or 0),
                    'time_spent_seconds': total_time_by_student.get(sid, 0),
                    'updated_at': row.get('updated_at') or timezone.now(),
                })

            overall_rows.sort(
                key=lambda r: (-r['score'], r['time_spent_seconds'], r['updated_at'])
            )
            overall_rank, _, overall_percentile = self._rank_for_student(
                overall_rows,
                request.user.id,
            )
        else:
            overall_participants = GradebookEntry.objects.filter(
                content_item=assignment,
                status='graded',
            ).count()

        question_summaries = []
        for aq in assignment_questions:
            question_attempts = attempts_by_question.get(str(aq.id), [])
            rows = []
            my_attempt = None

            for attempt in question_attempts:
                sid = str(attempt.student_id)
                score = self._score_attempt_percentage(attempt)
                row = {
                    'student_id': sid,
                    'score': score,
                    'time_spent_seconds': time_spent_map.get((str(aq.id), sid), 0),
                    'submitted_at': attempt.created_at or timezone.now(),
                    'attempt': attempt,
                }
                rows.append(row)
                if sid == str(request.user.id):
                    my_attempt = attempt

            rows.sort(key=lambda r: (-r['score'], r['time_spent_seconds'], r['submitted_at']))

            my_score = self._score_attempt_percentage(my_attempt) if my_attempt else 0.0
            my_status = my_attempt.status if my_attempt else 'not_attempted'

            benchmark_avg = None
            benchmark_median = None
            my_rank = None
            my_percentile = None
            participant_count = len(rows)

            if report_unlocked and rows:
                scores = [r['score'] for r in rows]
                benchmark_avg = round(sum(scores) / len(scores), 2)
                benchmark_median = round(float(median(scores)), 2)
                if my_attempt:
                    my_rank, _, my_percentile = self._rank_for_student(rows, request.user.id)

            question_summaries.append({
                'assignment_question_id': aq.id,
                'question_id': aq.question.id,
                'order': aq.order,
                'title': aq.question.title,
                'question_type': aq.question.question_type,
                'difficulty': aq.question.difficulty,
                'my_latest_status': my_status,
                'my_latest_score': round(my_score, 2),
                'my_rank': my_rank,
                'my_percentile': my_percentile,
                'benchmark': {
                    'average_score': benchmark_avg,
                    'median_score': benchmark_median,
                    'participants': participant_count if report_unlocked else None,
                },
            })

        return Response({
            'assignment': {
                'id': assignment.id,
                'title': assignment.title,
                'due_date': assignment.due_date,
                'status': grade_entry.status if grade_entry else 'pending',
                'final_score': round(float(grade_entry.final_score), 2) if grade_entry else 0.0,
            },
            'visibility': {
                'can_view_detailed_report': report_unlocked,
                'reason': None if report_unlocked else 'Detailed report is available after grading.',
            },
            'overall_ranking': {
                'rank': overall_rank,
                'percentile': overall_percentile,
                'participants': overall_participants,
            },
            'questions': question_summaries,
        })

    @action(detail=False, methods=['get'], url_path='my-assignment-question-report')
    def my_assignment_question_report(self, request):
        assignment_id = request.query_params.get('assignment_id')
        assignment_question_id = request.query_params.get('assignment_question_id')

        if not assignment_id or not assignment_question_id:
            return Response({'message': 'assignment_id and assignment_question_id are required'}, status=400)

        assignment = self._get_assignment_for_student(assignment_id, request.user)
        if not assignment:
            return Response({'message': 'Assignment not found'}, status=404)

        grade_entry = self._get_gradebook_entry(assignment_id, request.user)
        if not self._is_report_unlocked(grade_entry):
            return Response(
                {
                    'can_view_detailed_report': False,
                    'message': 'Detailed report is available after grading.',
                },
                status=403,
            )

        try:
            aq = AssignmentQuestion.objects.select_related('question').get(
                id=assignment_question_id,
                assignment=assignment,
            )
        except AssignmentQuestion.DoesNotExist:
            return Response({'message': 'Question not found in assignment'}, status=404)

        progress_rows = AssignmentProgress.objects.filter(
            assignment_question=aq
        ).values('student_id', 'time_spent')
        time_spent_by_student = {
            str(r['student_id']): int(r['time_spent'] or 0)
            for r in progress_rows
        }

        my_attempts = list(
            SubmissionAttempt.objects.filter(
                student=request.user,
                assignment_question=aq,
            ).select_related(
                'assignment_question',
                'assignment_question__question',
            ).prefetch_related(
                'test_results'
            ).order_by('attempt_number', 'created_at')
        )
        my_latest = my_attempts[-1] if my_attempts else None

        class_latest_attempts = list(
            SubmissionAttempt.objects.filter(
                assignment_question=aq
            ).select_related(
                'student',
                'assignment_question',
                'assignment_question__question',
            ).prefetch_related(
                'test_results'
            ).order_by('student_id', '-created_at').distinct('student_id')
        )

        class_rows = []
        for attempt in class_latest_attempts:
            sid = str(attempt.student_id)
            score = self._score_attempt_percentage(attempt)
            class_rows.append({
                'student_id': sid,
                'score': score,
                'time_spent_seconds': time_spent_by_student.get(sid, 0),
                'submitted_at': attempt.created_at or timezone.now(),
                'attempt': attempt,
            })

        class_rows.sort(key=lambda r: (-r['score'], r['time_spent_seconds'], r['submitted_at']))

        my_rank, participants, my_percentile = self._rank_for_student(class_rows, request.user.id)
        class_scores = [r['score'] for r in class_rows]
        class_average = round(sum(class_scores) / len(class_scores), 2) if class_scores else 0.0
        class_median = round(float(median(class_scores)), 2) if class_scores else 0.0

        test_cases_meta = aq.question.test_cases or []
        test_case_lookup = {}
        test_case_list = []
        for idx, test_case in enumerate(test_cases_meta):
            raw_key = str(
                test_case.get('id')
                or test_case.get('test_case_id')
                or f'tc_{idx + 1}'
            )
            canonical_id = f'tc_{idx + 1}'
            meta = {
                'canonical_id': canonical_id,
                'name': test_case.get('concept')
                or test_case.get('name')
                or test_case.get('description')
                or f'Test Case {idx + 1}',
                'input': test_case.get('input') or '',
                'expected_output': test_case.get('expected_output')
                or test_case.get('output')
                or '',
                'index': idx,
            }
            test_case_list.append(meta)

            aliases = {raw_key, canonical_id, str(idx), str(idx + 1)}
            if test_case.get('id') is not None:
                aliases.add(str(test_case.get('id')))
            if test_case.get('test_case_id') is not None:
                aliases.add(str(test_case.get('test_case_id')))
            for alias in aliases:
                test_case_lookup[alias] = meta

        def resolve_test_case_meta(case_id, idx_fallback):
            candidates = []
            if case_id is not None:
                cid = str(case_id).strip()
                if cid:
                    candidates.append(cid)
                    if cid.startswith('tc_'):
                        suffix = cid[3:]
                        if suffix.isdigit():
                            n = int(suffix)
                            candidates.extend([str(n - 1), str(n)])
                    elif cid.isdigit():
                        n = int(cid)
                        candidates.extend([f'tc_{n + 1}', f'tc_{n}', str(n + 1)])

            candidates.extend([f'tc_{idx_fallback + 1}', str(idx_fallback), str(idx_fallback + 1)])

            for candidate in candidates:
                if candidate in test_case_lookup:
                    return test_case_lookup[candidate]

            if 0 <= idx_fallback < len(test_case_list):
                return test_case_list[idx_fallback]
            return {}

        heatmap_stats = {}
        for row in class_rows:
            attempt = row['attempt']
            for idx, result in enumerate(attempt.test_results.all()):
                test_case_meta = resolve_test_case_meta(result.test_case_id, idx)
                key = test_case_meta.get('canonical_id') or str(result.test_case_id or f'tc_{idx + 1}')
                if key not in heatmap_stats:
                    heatmap_stats[key] = {
                        'test_case_id': key,
                        'name': test_case_meta.get('name') or f'Test Case {idx + 1}',
                        'total_runs': 0,
                        'pass_count': 0,
                        'errors': Counter(),
                    }

                entry = heatmap_stats[key]
                entry['total_runs'] += 1
                if result.status == 'pass':
                    entry['pass_count'] += 1
                else:
                    entry['errors'][self._parse_error_type(result.error_message, result.actual_output)] += 1

        error_heatmap = []
        for value in heatmap_stats.values():
            total_runs = value['total_runs']
            pass_count = value['pass_count']
            top_errors = [
                {'type': error_type, 'count': count}
                for error_type, count in value['errors'].most_common(3)
            ]
            error_heatmap.append({
                'test_case_id': value['test_case_id'],
                'name': value['name'],
                'pass_rate': round((pass_count / total_runs) * 100, 2) if total_runs else 0.0,
                'total_runs': total_runs,
                'failed_runs': total_runs - pass_count,
                'top_errors': top_errors,
            })

        error_heatmap.sort(key=lambda item: (item['pass_rate'], -item['failed_runs']))

        benchmark_scatter = []
        for row in class_rows:
            benchmark_scatter.append({
                'x': round((row['time_spent_seconds'] or 0) / 60, 2),
                'y': round(float(row['score']), 2),
                'is_me': str(row['student_id']) == str(request.user.id),
            })

        attempt_trend = []
        for attempt in my_attempts:
            attempt_trend.append({
                'attempt_number': attempt.attempt_number,
                'score': round(self._score_attempt_percentage(attempt), 2),
                'submitted_at': attempt.created_at,
                'status': attempt.status,
            })

        top_concepts_counter = Counter()
        for row in class_rows:
            if row['score'] < 80:
                continue
            attempt = row['attempt']
            concepts = self._extract_ai_concepts(attempt.ai_analysis_data)
            if not concepts and attempt.detected_keywords:
                concepts = [c.lower() for c in attempt.detected_keywords if isinstance(c, str)]
            top_concepts_counter.update(concepts)

        best_solution_approach = [
            {'concept': concept, 'count': count}
            for concept, count in top_concepts_counter.most_common(8)
        ]

        my_concepts = self._extract_ai_concepts(my_latest.ai_analysis_data if my_latest else None)
        failed_tests = []
        ai_error_explanation = None
        if my_latest:
            feedback = (my_latest.ai_analysis_data or {}).get('feedback', {})
            if isinstance(feedback, dict):
                ai_error_explanation = feedback.get('error_explanation')

            for idx, result in enumerate(my_latest.test_results.all()):
                if result.status == 'pass':
                    continue
                case_meta = resolve_test_case_meta(result.test_case_id, idx)
                key = case_meta.get('canonical_id') or str(result.test_case_id or f'tc_{idx + 1}')
                failed_tests.append({
                    'test_case_id': key,
                    'name': case_meta.get('name') or f'Test Case {idx + 1}',
                    'error_type': self._parse_error_type(result.error_message, result.actual_output),
                })

        recommended_actions = []
        if failed_tests:
            recommended_actions.append('Revisit failed test cases and edge conditions first.')
        if ai_error_explanation:
            recommended_actions.append('Address the Autograder+ error explanation before optimizing.')
        if best_solution_approach:
            missing = [
                item['concept'] for item in best_solution_approach
                if item['concept'] not in my_concepts
            ][:3]
            if missing:
                recommended_actions.append(
                    f"Practice these high-performing concepts: {', '.join(missing)}."
                )
        if not recommended_actions:
            recommended_actions.append('Keep iterating with additional edge-case tests.')

        submission_snapshot = None
        if my_latest:
            submission_snapshot = {
                'id': my_latest.id,
                'attempt_number': my_latest.attempt_number,
                'status': my_latest.status,
                'submitted_at': my_latest.created_at,
                'code_content': my_latest.source_code,
                'response_data': my_latest.response_data,
                'manual_score': my_latest.manual_score,
                'score_percent': round(self._score_attempt_percentage(my_latest), 2),
                'feedback_text': my_latest.feedback_text,
                'ai_analysis_data': my_latest.ai_analysis_data,
                'time_spent_seconds': time_spent_by_student.get(str(request.user.id), 0),
                'test_results': [
                    {
                        'test_case_id': tr.test_case_id,
                        'canonical_test_case_id': (
                            resolve_test_case_meta(tr.test_case_id, idx).get('canonical_id')
                            or str(tr.test_case_id or f'tc_{idx + 1}')
                        ),
                        'status': tr.status,
                        'score': tr.score,
                        'actual_output': tr.actual_output,
                        'expected_output': resolve_test_case_meta(tr.test_case_id, idx).get('expected_output', ''),
                        'input': resolve_test_case_meta(tr.test_case_id, idx).get('input', ''),
                        'error_message': tr.error_message,
                    }
                    for idx, tr in enumerate(my_latest.test_results.all())
                ],
            }

        return Response({
            'assignment': {
                'id': assignment.id,
                'title': assignment.title,
            },
            'question': {
                'assignment_question_id': aq.id,
                'question_id': aq.question.id,
                'title': aq.question.title,
                'description': aq.question.description,
                'question_type': aq.question.question_type,
                'difficulty': aq.question.difficulty,
            },
            'submission_snapshot': submission_snapshot,
            'benchmark': {
                'rank': my_rank,
                'percentile': my_percentile,
                'participants': participants,
                'average_score': class_average,
                'median_score': class_median,
            },
            'charts': {
                'error_heatmap': error_heatmap,
                'time_vs_score': benchmark_scatter,
                'attempt_trend': attempt_trend,
            },
            'insights': {
                'best_solution_approach': best_solution_approach,
                'improvement_scope': {
                    'failed_tests': failed_tests,
                    'recommended_actions': recommended_actions,
                    'ai_error_explanation': ai_error_explanation,
                },
            },
        })
        
    @action(detail=False, methods=['post'], url_path='autosave')
    def autosave(self, request):
        aq_id = request.data.get('assignment_question_id')
        code = request.data.get('current_code')
        
        if not aq_id:
            return Response({'message': 'Missing ID'}, status=status.HTTP_400_BAD_REQUEST)
            
        progress, created = AssignmentProgress.objects.update_or_create(
            student=request.user,
            assignment_question_id=aq_id,
            defaults={'current_code': code}
        )
        
        return Response({'success': True})

    def _is_timed_assignment(self, assignment_id):
        """Check if assignment is an exam/quiz with duration_minutes set."""
        try:
            item = ContentItem.objects.get(id=assignment_id)
            return (item.type == 'quiz' or getattr(item, 'assignment', None).mode == 'exam') and item.duration_minutes
        except Exception:
            return False

    @action(detail=False, methods=['post'], url_path='start-timer')
    def start_timer(self, request):
        aq_id = request.data.get('assignment_question_id')
        assignment_id = request.data.get('assignment_id')
        # Fallback for inconsistent frontend payload if needed, 
        # but let's assume we fixed it to send assignment_question_id
        if not aq_id:
             # Try getting it from query params or other fields if legacy
             aq_id = request.data.get('question_id') # Legacy handling if it maps to AQ ID
        
        if not aq_id and not assignment_id:
            return Response({'message': 'Missing ID'}, status=status.HTTP_400_BAD_REQUEST)

        # Check assignment start_time
        if aq_id:
            try:
                aq = AssignmentQuestion.objects.select_related('assignment').get(id=aq_id)
                assignment_id = aq.assignment.id
                _check_assignment_start_time(assignment_id, request.user)
            except AssignmentQuestion.DoesNotExist:
                return Response({'message': 'Assignment question not found'}, status=status.HTTP_404_NOT_FOUND)
            except PermissionError as e:
                return Response({'message': str(e)}, status=status.HTTP_403_FORBIDDEN)
        elif assignment_id:
            try:
                _check_assignment_start_time(assignment_id, request.user)
            except PermissionError as e:
                return Response({'message': str(e)}, status=status.HTTP_403_FORBIDDEN)

        # For exams/quizzes with duration_minutes, use assignment-level timer
        if assignment_id and self._is_timed_assignment(assignment_id):
            grade_entry, _ = GradebookEntry.objects.get_or_create(
                student=request.user,
                content_item_id=assignment_id,
                defaults={'status': 'pending', 'total_time_spent': 0}
            )
            return Response({
                'success': True,
                'started_at': grade_entry.created_at,
                'time_spent': grade_entry.total_time_spent,
                'total_time_allowed': ContentItem.objects.get(id=assignment_id).duration_minutes * 60
            })

        # Per-question timer for regular assignments
        if not aq_id:
            return Response({'message': 'Missing question ID'}, status=status.HTTP_400_BAD_REQUEST)

        # Ensure Progress exists
        progress, created = AssignmentProgress.objects.get_or_create(
            student=request.user,
            assignment_question_id=aq_id
        )
        
        if not progress.started_at:
            progress.started_at = timezone.now()
            progress.save()
            
        return Response({
            'success': True, 
            'started_at': progress.started_at,
            'time_spent': progress.time_spent
        })

    @action(detail=False, methods=['post'], url_path='update-timer')
    def update_timer(self, request):
        aq_id = request.data.get('assignment_question_id')
        assignment_id = request.data.get('assignment_id')
        time_spent = request.data.get('time_spent')

        # For exams/quizzes, update assignment-level timer
        if assignment_id and self._is_timed_assignment(assignment_id):
            GradebookEntry.objects.update_or_create(
                student=request.user,
                content_item_id=assignment_id,
                defaults={'total_time_spent': time_spent, 'status': 'pending'}
            )
            return Response({'success': True})
        
        if not aq_id:
             return Response({'message': 'Missing ID'}, status=status.HTTP_400_BAD_REQUEST)
             
        try:
            progress = AssignmentProgress.objects.get(
                student=request.user, 
                assignment_question_id=aq_id
            )
            progress.time_spent = time_spent
            progress.save()
            return Response({'success': True})
        except AssignmentProgress.DoesNotExist:
            return Response({'message': 'Progress not found'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=False, methods=['get'], url_path='get-timer')
    def get_timer(self, request):
        aq_id = request.query_params.get('assignment_question_id')
        assignment_id = request.query_params.get('assignment_id')

        # For exams/quizzes, return assignment-level timer
        if assignment_id and self._is_timed_assignment(assignment_id):
            grade_entry, _ = GradebookEntry.objects.get_or_create(
                student=request.user,
                content_item_id=assignment_id,
                defaults={'status': 'pending', 'total_time_spent': 0}
            )
            return Response({
                'time_spent': grade_entry.total_time_spent,
                'started_at': grade_entry.created_at,
                'total_time_allowed': ContentItem.objects.get(id=assignment_id).duration_minutes * 60,
                'code_content': None
            })

        if not aq_id:
             # Legacy fetch might send raw question_id and assignment_id
             # We need to resolve AQ ID.
             assignment_id = request.query_params.get('assignment_id')
             question_id = request.query_params.get('question_id') # This usually refers to Question definition ID
             
             if assignment_id and question_id:
                 try:
                     aq = AssignmentQuestion.objects.get(assignment_id=assignment_id, question_id=question_id)
                     aq_id = aq.id
                 except AssignmentQuestion.DoesNotExist:
                     pass
        
        if not aq_id:
            return Response({'message': 'Missing ID'}, status=status.HTTP_400_BAD_REQUEST)
            
        progress, created = AssignmentProgress.objects.get_or_create(
            student=request.user,
            assignment_question_id=aq_id
        )
        
        # Get code content (Draft -> Last Submission -> Empty)
        code_content = progress.current_code
        
        if not code_content:
            # Fallback to latest submission if no draft
            latest_submission = SubmissionAttempt.objects.filter(
                student=request.user,
                assignment_question=aq_id
            ).order_by('-created_at').first()
            
            if latest_submission:
                code_content = latest_submission.source_code
        
        return Response({
            'time_spent': progress.time_spent,
            'started_at': progress.started_at,
            'code_content': code_content  # Return code to frontend
        })

    @action(detail=False, methods=['get'], url_path='points-summary')
    def get_points_summary(self, request):
        """
        Get points summary for the current user.
        Shows total points, assignment points, and recent point earnings.
        """
        try:
            from gamification.points_calculator import PointsCalculator
            calculator = PointsCalculator()
            points_summary = calculator.get_user_points_summary(request.user)
            
            # Get recent assignment submissions with points
            recent_submissions = SubmissionAttempt.objects.filter(
                student=request.user,
                status__in=['success', 'fail']
            ).order_by('-created_at')[:10]
            
            recent_points = []
            for submission in recent_submissions:
                test_results_data = []
                for test_result in submission.test_results.all():
                    test_results_data.append({
                        'status': test_result.status,
                        'score': test_result.score
                    })
                
                if test_results_data:
                    points = calculator.calculate_assignment_points(
                        test_results=test_results_data,
                        attempt_number=submission.attempt_number,
                        assignment_question=submission.assignment_question
                    )
                    
                    recent_points.append({
                        'assignment_question': submission.assignment_question.question.title,
                        'points_earned': points,
                        'submitted_at': submission.created_at,
                        'status': submission.status
                    })
            
            return Response({
                'points_summary': points_summary,
                'recent_assignment_points': recent_points
            })
            
        except Exception as e:
            logger.error(f"Error getting points summary: {e}")
            return Response({'error': 'Failed to get points summary'}, status=500)

    @action(detail=False, methods=['post'], url_path='finish-assignment')
    def finish_assignment(self, request):
        assignment_id = request.data.get('assignment_id')
        
        if not assignment_id:
            return Response({'message': 'Missing Assignment ID'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Find ContentItem for this assignment
            # Assuming Assignment ID is ContentItem ID (since inheritance)
            content_item = ContentItem.objects.get(id=assignment_id)
            
            # Check if this is an exam (prevent re-taking finished exams)
            from assignments.models import Assignment
            is_exam = Assignment.objects.filter(id=assignment_id, mode='exam').exists()
            
            entry, created = GradebookEntry.objects.get_or_create(
                student=request.user,
                content_item=content_item
            )
            
            # Prevent re-submitting an already-finished exam
            if is_exam and not created and entry.status in ['submitted', 'graded']:
                return Response(
                    {'message': 'This exam has already been submitted.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            entry.status = 'submitted'
            entry.updated_at = timezone.now()
            entry.save()

            # Notify Teacher(s)
            try:
                from notifications.models import Notification
                from classes.models import Class, Enrollment
                
                # Find the class and its teachers
                class_obj = content_item.module.class_obj
                teachers = Enrollment.objects.filter(class_obj=class_obj, role='teacher').select_related('user')
                
                # Notify class owner
                teacher_ids_notified = {class_obj.owner_id}
                Notification.objects.create(
                    user=class_obj.owner,
                    type='submission',
                    title=f'Submission: {request.user.username}',
                    message=f'{request.user.username} submitted the assignment "{content_item.title}" in {class_obj.name}.',
                    reference_link=f'/teacher/assignment/{content_item.id}'
                )

                # Notify other teachers/TAs
                for enrollment in teachers:
                    if enrollment.user_id not in teacher_ids_notified:
                        Notification.objects.create(
                            user=enrollment.user,
                            type='submission',
                            title=f'Submission: {request.user.username}',
                            message=f'{request.user.username} submitted the assignment "{content_item.title}" in {class_obj.name}.',
                            reference_link=f'/teacher/assignment/{content_item.id}'
                        )
                        teacher_ids_notified.add(enrollment.user_id)
            except Exception as e:
                logger.error(f"Failed to send submission notification: {e}")
            
            return Response({'success': True, 'status': 'submitted'})
            
        except ContentItem.DoesNotExist:
             return Response({'message': 'Assignment not found'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
             logger.error(f"Finish Assignment failed: {e}")
             return Response({'message': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['get'], url_path='assignment-status')
    def get_assignment_status(self, request):
        assignment_id = request.query_params.get('assignment_id')
        
        if not assignment_id:
             return Response({'message': 'Missing Assignment ID'}, status=status.HTTP_400_BAD_REQUEST)
             
        try:
             # Check GradebookEntry
             entry = GradebookEntry.objects.filter(
                 student=request.user,
                 content_item_id=assignment_id
             ).first()
             
             status_val = entry.status if entry else 'in_progress'
             
             return Response({'status': status_val})
             
        except Exception as e:
             return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['get'], url_path='assignment-progress-with-points')
    def get_assignment_progress_with_points(self, request):
        """
        Get assignment progress including points information.
        Shows completion status, scores, and points earned for each question.
        """
        assignment_id = request.query_params.get('assignment_id')
        if not assignment_id:
            return Response({'message': 'Missing assignment_id'}, status=400)
        
        try:
            from gamification.points_calculator import PointsCalculator
            calculator = PointsCalculator()
            
            # Get assignment questions
            aqs = AssignmentQuestion.objects.filter(assignment_id=assignment_id).select_related('question').order_by('order')
            
            progress_data = []
            total_points_earned = 0
            
            for aq in aqs:
                # Get latest submission
                latest = SubmissionAttempt.objects.filter(
                    student=request.user,
                    assignment_question=aq
                ).order_by('-created_at').first()
                
                question_data = {
                    'question_id': aq.question.id,
                    'assignment_question_id': aq.id,
                    'title': aq.question.title,
                    'status': 'not_attempted',
                    'score': 0,
                    'points_earned': 0,
                    'attempt_count': 0
                }
                
                if latest:
                    question_data['status'] = latest.status
                    question_data['attempt_count'] = latest.attempt_number
                    
                    # Calculate score
                    test_cases = aq.question.test_cases or []
                    if test_cases and latest.test_results.exists():
                        passed = latest.test_results.filter(status='pass').count()
                        question_data['score'] = (passed / len(test_cases)) * 100
                    
                    # Calculate points
                    test_results_data = []
                    for test_result in latest.test_results.all():
                        test_results_data.append({
                            'status': test_result.status,
                            'score': test_result.score
                        })
                    
                    if test_results_data:
                        points = calculator.calculate_assignment_points(
                            test_results=test_results_data,
                            attempt_number=latest.attempt_number,
                            assignment_question=aq
                        )
                        question_data['points_earned'] = points
                        total_points_earned += points
                
                progress_data.append(question_data)
            
            return Response({
                'assignment_id': assignment_id,
                'questions': progress_data,
                'total_points_earned': total_points_earned,
                'total_questions': len(progress_data),
                'completed_questions': len([q for q in progress_data if q['status'] == 'success'])
            })
            
        except Exception as e:
            logger.error(f"Error getting assignment progress with points: {e}")
            return Response({'error': str(e)}, status=500)


    @action(detail=False, methods=['get'], url_path='student-report')
    def get_student_report(self, request):
        """
        Detailed report for a student on an assignment.
        """
        assignment_id = request.query_params.get('assignment_id')
        student_id = request.query_params.get('student_id')

        if request.user.role == 'student':
            if student_id and str(student_id) != str(request.user.id):
                return Response({'message': 'Permission denied'}, status=403)
            student_id = str(request.user.id)

        if not assignment_id or not student_id:
            return Response({'message': 'Missing IDs'}, status=400)
        
        # Get Assignment Questions
        aqs = AssignmentQuestion.objects.filter(assignment_id=assignment_id).select_related('question').order_by('order')
        
        report = []
        for aq in aqs:
            # Get latest submission
            latest = SubmissionAttempt.objects.filter(
                assignment_question=aq,
                student_id=student_id
            ).order_by('-created_at').first()
            
            # Serialize submission if exists
            sub_data = None
            if latest:
                sub_data = SubmissionAttemptSerializer(latest).data
                
            report.append({
                'question': {
                    'id': aq.question.id,
                    'title': aq.question.title,
                    'description': aq.question.description,
                    'test_cases': aq.question.test_cases
                },
                'max_points': aq.custom_points if aq.custom_points is not None else 10,
                'submission': sub_data,
                'status': latest.status if latest else 'not_attempted'
            })
            
        return Response(report)


class GradebookViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for gradebook entries with points information"""
    serializer_class = GradebookEntrySerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        queryset = GradebookEntry.objects.select_related('student', 'content_item')
        
        if user.role == 'student':
            # Students can only see their own grades
            queryset = queryset.filter(student=user)
        elif user.role == 'teacher':
            # Teachers can see all grades, optionally filtered by class
            class_id = self.request.query_params.get('class_id')
            if class_id:
                # Filter by class enrollment (assuming there's a way to get class students)
                # This would need to be implemented based on your class/enrollment system
                pass
        
        return queryset.order_by('-updated_at')
    
    @action(detail=False, methods=['get'], url_path='student-summary')
    def student_summary(self, request):
        """Get summary of student's grades and points"""
        try:
            from gamification.points_calculator import PointsCalculator
            calculator = PointsCalculator()
            
            # Get user's gradebook entries
            entries = GradebookEntry.objects.filter(student=request.user).select_related('content_item')
            
            # Calculate totals
            total_assignments = entries.count()
            total_score = sum(entry.final_score for entry in entries) / total_assignments if total_assignments > 0 else 0
            total_assignment_points = sum(entry.points_earned for entry in entries)
            
            # Get overall points summary
            points_summary = calculator.get_user_points_summary(request.user)
            
            # Return all entries for grade history (oldest first for chronological chart)
            all_entries = entries.order_by('updated_at')
            
            return Response({
                'summary': {
                    'total_assignments': total_assignments,
                    'average_score': round(total_score, 2),
                    'total_assignment_points': total_assignment_points,
                    'overall_points': points_summary
                },
                'recent_entries': GradebookEntrySerializer(all_entries, many=True).data
            })
            
        except Exception as e:
            logger.error(f"Error getting student summary: {e}")
            return Response({'error': 'Failed to get student summary'}, status=500)
    
    @action(detail=False, methods=['get'], url_path='class-summary')
    def class_summary(self, request):
        """Get class-wide gradebook summary with points (teachers only)"""
        if request.user.role != 'teacher':
            return Response({'error': 'Permission denied'}, status=403)
        
        try:
            assignment_id = request.query_params.get('assignment_id')
            if not assignment_id:
                return Response({'message': 'Missing assignment_id'}, status=400)
            
            # Get gradebook entries for this assignment
            entries = GradebookEntry.objects.filter(
                content_item_id=assignment_id
            ).select_related('student').order_by('student__last_name', 'student__first_name')
            
            class_data = []
            total_points = 0
            total_score = 0
            
            for entry in entries:
                student_data = {
                    'student': {
                        'id': entry.student.id,
                        'username': entry.student.username,
                        'first_name': entry.student.first_name,
                        'last_name': entry.student.last_name,
                        'email': entry.student.email
                    },
                    'final_score': entry.final_score,
                    'points_earned': entry.points_earned,
                    'status': entry.status,
                    'updated_at': entry.updated_at
                }
                class_data.append(student_data)
                total_points += entry.points_earned
                total_score += entry.final_score
            
            avg_score = total_score / len(entries) if entries else 0
            avg_points = total_points / len(entries) if entries else 0
            
            return Response({
                'assignment_id': assignment_id,
                'students': class_data,
                'class_statistics': {
                    'total_students': len(entries),
                    'average_score': round(avg_score, 2),
                    'average_points': round(avg_points, 2),
                    'total_points_awarded': total_points
                }
            })
            
        except Exception as e:
            logger.error(f"Error getting class summary: {e}")
            return Response({'error': str(e)}, status=500)
