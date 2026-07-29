from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SubmissionAttemptViewSet, AssignmentProgressViewSet, GradebookViewSet

router = DefaultRouter()
router.register(r'attempts', SubmissionAttemptViewSet, basename='attempt')
router.register(r'progress', AssignmentProgressViewSet, basename='progress')
router.register(r'gradebook', GradebookViewSet, basename='gradebook')

urlpatterns = [
    path(
        'progress/my-assignment-report-summary/',
        AssignmentProgressViewSet.as_view({'get': 'my_assignment_report_summary'}),
        name='progress-my-assignment-report-summary'
    ),
    path(
        'progress/my-assignment-question-report/',
        AssignmentProgressViewSet.as_view({'get': 'my_assignment_question_report'}),
        name='progress-my-assignment-question-report'
    ),
    path('', include(router.urls)),
]
