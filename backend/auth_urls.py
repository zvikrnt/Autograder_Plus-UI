from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView, TokenObtainPairView
from users.views import simple_login, current_user

urlpatterns = [
    path('simple-login/', simple_login, name='simple-login'),
    path('current/', current_user, name='current-user'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
]