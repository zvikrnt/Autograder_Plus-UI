from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AdaptiveViewSet

router = DefaultRouter()
router.register(r'', AdaptiveViewSet, basename='adaptive')

urlpatterns = [
    path('', include(router.urls)),
]
