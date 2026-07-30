from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    OverviewView, AdminUserViewSet, AdminClassViewSet,
    SystemHealthView, MaintenanceActionView, BackupViewSet,
)

router = DefaultRouter()
router.register(r'users', AdminUserViewSet, basename='admin-user')
router.register(r'classes', AdminClassViewSet, basename='admin-class')
router.register(r'backups', BackupViewSet, basename='admin-backup')

urlpatterns = [
    path('overview/', OverviewView.as_view(), name='admin-overview'),
    path('health/', SystemHealthView.as_view(), name='admin-health'),
    path('maintenance/<str:action_name>/', MaintenanceActionView.as_view(), name='admin-maintenance'),
    path('', include(router.urls)),
]
