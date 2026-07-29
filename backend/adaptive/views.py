import logging
from django.db import transaction
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import AdaptiveQuestion, MarsRating, AdaptiveSession, AdaptiveAttempt
from .serializers import (
    AdaptiveQuestionSerializer, MarsRatingSerializer,
    AdaptiveSessionSerializer,
)
from . import mars_engine

logger = logging.getLogger(__name__)


def _get_or_create_rating(user):
    mars, _ = MarsRating.objects.get_or_create(student=user)
    return mars


def _grade(code, question, test_cases, config):
    """Grade code against test cases. Uses the Docker-free local grader for
    Python function-mode (the adaptive bank), else falls back to the main
    execute_code service (Docker) for other languages."""
    lang = (question.language or 'python').lower()
    if lang == 'python':
        from .local_grader import grade_python_function
        return grade_python_function(code, question.entry_point or 'solution', test_cases)
    from submissions.services import execute_code
    return execute_code(code, lang, test_cases, config=config)


def _recommend_question(mars, served_ids, language='python'):
    """Pick the next question by MARS utility, avoiding already-served ones.

    To stay fast over a large bank, we take a candidate window of questions
    whose Elo is near the learner's (behaviour-shifted) target, then score.
    Filtered to the session's language.
    """
    target_elo = mars.rating + mars_engine.RATING_SHIFT + mars_engine._behavioral_target(mars)
    qs = AdaptiveQuestion.objects.filter(is_active=True).exclude(id__in=served_ids)
    if language:
        qs = qs.filter(language=language)

    window_qs = []
    for window in (400, 800, 5000):
        window_qs = list(qs.filter(
            elo_rating__gte=target_elo - window,
            elo_rating__lte=target_elo + window,
        )[:120])
        if window_qs:
            break
    if not window_qs:
        window_qs = list(qs[:120])
    if not window_qs:
        return None
    return max(window_qs, key=lambda q: mars_engine.score_candidate(mars, q, served_ids))


class AdaptiveViewSet(viewsets.ViewSet):
    """Adaptive practice session flow + MARS rating for the current student."""
    permission_classes = [IsAuthenticated]

    # ── Current student's MARS rating ──────────────────────────────────
    @action(detail=False, methods=['get'], url_path='my-rating')
    def my_rating(self, request):
        from django.db.models import Sum, Count, Q
        mars = _get_or_create_rating(request.user)
        rank = MarsRating.objects.filter(rating__gt=mars.rating).count() + 1

        agg = AdaptiveAttempt.objects.filter(student=request.user).aggregate(
            total_time=Sum('time_taken_sec'),
            attempted=Count('id', filter=Q(outcome__in=['solved', 'failed'])),
            solved=Count('id', filter=Q(outcome='solved')),
            skipped=Count('id', filter=Q(outcome='skipped')),
        )
        sessions = AdaptiveSession.objects.filter(student=request.user, status='ended').count()

        data = MarsRatingSerializer(mars).data
        data.update({
            'rank': rank,
            'total_rated': MarsRating.objects.count(),
            'total_time_sec': round(agg['total_time'] or 0.0, 0),
            'total_attempted': agg['attempted'] or 0,
            'total_solved': agg['solved'] or 0,
            'total_skipped': agg['skipped'] or 0,
            'sessions_completed': sessions,
        })
        return Response(data)

    @action(detail=False, methods=['get'], url_path='history')
    def history(self, request):
        """Student's personal adaptive-practice history: past sessions + attempts."""
        sessions = (
            AdaptiveSession.objects.filter(student=request.user, status='ended')
            .order_by('-started_at')[:30]
        )
        return Response({'sessions': AdaptiveSessionSerializer(sessions, many=True).data})

    # ── Start a session ────────────────────────────────────────────────
    @action(detail=False, methods=['get'], url_path='languages')
    def languages(self, request):
        """Languages that have adaptive questions, with counts."""
        from django.db.models import Count
        rows = (AdaptiveQuestion.objects.filter(is_active=True)
                .values('language').annotate(count=Count('id')).order_by('-count'))
        return Response({'languages': [{'language': r['language'], 'count': r['count']} for r in rows]})

    @action(detail=False, methods=['post'], url_path='start')
    def start(self, request):
        mars = _get_or_create_rating(request.user)
        language = (request.data.get('language') or 'python').lower()

        AdaptiveSession.objects.filter(
            student=request.user, status='active'
        ).update(status='ended', ended_at=timezone.now(), rating_end=mars.rating)

        session = AdaptiveSession.objects.create(
            student=request.user, rating_start=mars.rating, language=language
        )
        question = _recommend_question(mars, served_ids=[], language=language)
        if question is None:
            session.delete()
            return Response({'message': f'No {language} questions available yet. Try another language.'},
                            status=status.HTTP_404_NOT_FOUND)

        session.current_question = question
        session.current_served_at = timezone.now()
        session.questions_served = 1
        session.save(update_fields=['current_question', 'current_served_at', 'questions_served'])

        return Response({
            'session': AdaptiveSessionSerializer(session).data,
            'question': AdaptiveQuestionSerializer(question).data,
            'rating': mars.rating,
        })

    @action(detail=True, methods=['post'], url_path='run')
    def run(self, request, pk=None):
        """Run code against the current question's tests WITHOUT changing the
        rating — lets the student 'try' freely. Returns pass counts only."""
        try:
            session = AdaptiveSession.objects.get(id=pk, student=request.user)
        except (AdaptiveSession.DoesNotExist, ValueError):
            return Response({'message': 'Session not found.'}, status=404)
        question = session.current_question
        if not question:
            return Response({'message': 'No active question.'}, status=400)

        code = request.data.get('code', '') or ''
        test_cases = question.test_cases or []
        config = {
            'entry_point': question.entry_point or 'solution',
            'execution_mode': {
                'type': 'function' if question.entry_point and question.entry_point != 'solution' else 'program',
                'entry_point': question.entry_point or 'solution',
            },
            'timeout': 5,
        }
        tests_passed = 0
        details = []
        try:
            results = _grade(code, question, test_cases, config)
            tests_passed = sum(1 for r in results if r.get('status') == 'pass')
            # Return only the visible (non-hidden) test outcomes.
            for tc, r in zip(test_cases, results):
                if not tc.get('is_hidden'):
                    details.append({
                        'status': r.get('status'),
                        'input': str(tc.get('input', '')),
                        'expected': str(tc.get('expected_output', '')),
                        'actual': str(r.get('actual_output', '') or r.get('error_message', '')),
                    })
        except Exception as exc:
            logger.error(f"[adaptive] run failed: {exc}", exc_info=True)
            return Response({'message': 'Execution failed.'}, status=500)

        return Response({
            'tests_passed': tests_passed,
            'tests_total': len(test_cases),
            'details': details[:5],
        })

    @action(detail=True, methods=['post'], url_path='submit')
    def submit(self, request, pk=None):
        return self._handle(request, pk, skipped=False)

    @action(detail=True, methods=['post'], url_path='skip')
    def skip(self, request, pk=None):
        return self._handle(request, pk, skipped=True)

    @transaction.atomic
    def _handle(self, request, session_id, skipped):
        try:
            session = AdaptiveSession.objects.select_for_update().get(
                id=session_id, student=request.user
            )
        except (AdaptiveSession.DoesNotExist, ValueError):
            return Response({'message': 'Session not found.'}, status=404)
        if session.status != 'active':
            return Response({'message': 'Session already ended.'}, status=400)

        question = session.current_question
        if not question:
            return Response({'message': 'No active question in this session.'}, status=400)

        mars = _get_or_create_rating(request.user)

        tests_passed = tests_total = 0
        pass_ratio = 0.0
        outcome = 'skipped'
        source_code = request.data.get('code', '') or ''
        run_attempts = int(request.data.get('run_attempts', 1) or 1)
        time_taken = request.data.get('time_taken_sec')
        if time_taken is None and session.current_served_at:
            time_taken = (timezone.now() - session.current_served_at).total_seconds()
        time_taken = float(time_taken or 0.0)

        if not skipped:
            test_cases = question.test_cases or []
            tests_total = len(test_cases)
            config = {
                'entry_point': question.entry_point or 'solution',
                'execution_mode': {
                    'type': 'function' if question.entry_point and question.entry_point != 'solution' else 'program',
                    'entry_point': question.entry_point or 'solution',
                },
                'timeout': 5,
            }
            try:
                results = _grade(source_code, question, test_cases, config)
                tests_passed = sum(1 for r in results if r.get('status') == 'pass')
            except Exception as exc:
                logger.error(f"[adaptive] execution failed: {exc}", exc_info=True)
                tests_passed = 0
            pass_ratio = (tests_passed / tests_total) if tests_total else 0.0
            outcome = 'solved' if (tests_total > 0 and tests_passed == tests_total) else 'failed'

        result = mars_engine.update_rating(
            mars, question,
            outcome=outcome, pass_ratio=pass_ratio,
            time_taken=time_taken, run_attempts=run_attempts,
        )
        mars.save()

        AdaptiveAttempt.objects.create(
            session=session, student=request.user, question=question,
            outcome=outcome, source_code=source_code,
            tests_passed=tests_passed, tests_total=tests_total,
            time_taken_sec=round(time_taken, 1), run_attempts=run_attempts,
            rating_before=result['rating_before'], rating_after=result['rating_after'],
            rating_delta=result['delta'],
        )

        if skipped:
            session.questions_skipped += 1
        elif outcome == 'solved':
            session.questions_solved += 1

        served_ids = list(
            AdaptiveAttempt.objects.filter(session=session).values_list('question_id', flat=True)
        )
        next_q = _recommend_question(mars, served_ids=served_ids, language=session.language)
        if next_q:
            session.current_question = next_q
            session.current_served_at = timezone.now()
            session.questions_served += 1
        else:
            session.current_question = None
        session.save()

        return Response({
            'result': {
                'outcome': outcome,
                'tests_passed': tests_passed,
                'tests_total': tests_total,
                'rating_before': result['rating_before'],
                'rating_after': result['rating_after'],
                'delta': result['delta'],
            },
            'rating': mars.rating,
            'next_question': AdaptiveQuestionSerializer(next_q).data if next_q else None,
        })

    @action(detail=True, methods=['post'], url_path='end')
    def end(self, request, pk=None):
        try:
            session = AdaptiveSession.objects.get(id=pk, student=request.user)
        except (AdaptiveSession.DoesNotExist, ValueError):
            return Response({'message': 'Session not found.'}, status=404)

        mars = _get_or_create_rating(request.user)
        if session.status == 'active':
            session.status = 'ended'
            session.rating_end = mars.rating
            session.ended_at = timezone.now()
            session.current_question = None
            session.save()

        rank = MarsRating.objects.filter(rating__gt=mars.rating).count() + 1
        return Response({
            'session': AdaptiveSessionSerializer(session).data,
            'rating': mars.rating,
            'rank': rank,
            'total_rated': MarsRating.objects.count(),
        })

    @action(detail=False, methods=['get'], url_path='active')
    def active(self, request):
        session = AdaptiveSession.objects.filter(
            student=request.user, status='active'
        ).order_by('-started_at').first()
        if not session or not session.current_question:
            return Response({'active': False})
        return Response({
            'active': True,
            'session': AdaptiveSessionSerializer(session).data,
            'question': AdaptiveQuestionSerializer(session.current_question).data,
            'rating': _get_or_create_rating(request.user).rating,
        })

    @action(detail=False, methods=['get'], url_path='leaderboard')
    def leaderboard(self, request):
        """Global or per-class MARS leaderboard. ?class_id= for class scope."""
        class_id = request.query_params.get('class_id')
        qs = MarsRating.objects.select_related('student').filter(n__gt=0)

        if class_id:
            from classes.models import Enrollment
            member_ids = Enrollment.objects.filter(
                class_obj_id=class_id, role='student'
            ).values_list('user_id', flat=True)
            qs = qs.filter(student_id__in=member_ids)

        qs = qs.order_by('-rating')[:100]
        me_id = request.user.id
        rows = []
        for i, m in enumerate(qs, start=1):
            rows.append({
                'rank': i,
                'username': m.student.username,
                'name': f"{m.student.first_name} {m.student.last_name}".strip() or m.student.username,
                'rating': round(m.rating, 1),
                'peak_rating': round(m.peak_rating, 1),
                'questions_answered': m.n,
                'is_me': m.student_id == me_id,
            })
        return Response({'scope': 'class' if class_id else 'global', 'leaderboard': rows})
