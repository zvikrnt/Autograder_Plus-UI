from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ClassViewSet, EnrollmentViewSet, AnnouncementViewSet, CommentViewSet,
    ClassResourceViewSet, DiscussionThreadViewSet,
)

router = DefaultRouter()
router.register(r'enrollments', EnrollmentViewSet, basename='enrollment')
router.register(r'announcements', AnnouncementViewSet, basename='announcement')
router.register(r'comments', CommentViewSet, basename='comment')
router.register(r'resources', ClassResourceViewSet, basename='class-resource')
router.register(r'discussions', DiscussionThreadViewSet, basename='discussion')
router.register(r'', ClassViewSet, basename='class')

urlpatterns = [
    path('join-by-code/', ClassViewSet.as_view({'post': 'join_by_code'}), name='class-join-by-code'),
    path('', include(router.urls)),
]
