from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AssignmentViewSet, QuestionViewSet

router = DefaultRouter()
router.register(r'questions', QuestionViewSet, basename='question')
router.register(r'', AssignmentViewSet, basename='assignment')

# Must be before router: else these are matched as detail {pk} and 404
urlpatterns = [
    path('ai-analysis-tasks/', AssignmentViewSet.as_view(actions={'get': 'list_ai_analysis_tasks'})),
    path('cluster-grading-tasks/', AssignmentViewSet.as_view(actions={'get': 'list_cluster_grading_tasks'})),
    path('', include(router.urls)),
]
