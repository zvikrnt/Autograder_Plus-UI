from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.views.decorators.csrf import csrf_exempt
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from .models import User
from .serializers import UserSerializer, UserRegistrationSerializer, UserSettingsSerializer
from core.permissions import IsAdmin
from django.core.mail import send_mail
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.conf import settings
from rest_framework.parsers import MultiPartParser, FormParser
from django.core.files.storage import default_storage


# Simple function-based view for testing
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def current_user(request):
    """Get current user - simple function-based view"""
    serializer = UserSerializer(request.user)
    return Response({'success': True, 'user': serializer.data})


@csrf_exempt
@api_view(['POST', 'GET'])
@permission_classes([AllowAny])
def simple_login(request):
    """Simple login function-based view"""
    if request.method == 'GET':
        return Response({'message': 'Simple login endpoint is working'})

    username = request.data.get('username')
    password = request.data.get('password')

    if not username or not password:
        return Response(
            {'success': False, 'message': 'Username and password are required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Allow logging in with email instead of username.
    if '@' in username:
        user_obj = User.objects.filter(email=username).first()
        if user_obj:
            username = user_obj.username

    user = authenticate(username=username, password=password)

    if user and user.is_active:
        refresh = RefreshToken.for_user(user)
        return Response({
            'success': True,
            'user': UserSerializer(user).data,
            'tokens': {
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            }
        })

    return Response(
        {'success': False, 'message': 'Invalid credentials'},
        status=status.HTTP_401_UNAUTHORIZED
    )


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ['create', 'register', 'login', 'request_password_reset', 'reset_password_confirm']:
            return [AllowAny()]
        # 'me'/'update_me'/'user_settings'/'upload_avatar' declare their own
        # permission_classes=[IsAuthenticated] on the @action decorator, so
        # those are unaffected by this. Everything else on this ViewSet is
        # the raw ModelViewSet CRUD (list/retrieve/update/partial_update/
        # destroy) operating on ANY user's row — that must be admin-only,
        # not just "logged in as somebody".
        if self.action in ['list', 'retrieve', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsAdmin()]
        return [IsAuthenticated()]
    
    @action(detail=False, methods=['post'], permission_classes=[AllowAny])
    def register(self, request):
        """User registration"""
        serializer = UserRegistrationSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            refresh = RefreshToken.for_user(user)
            return Response({
                'success': True,
                'user': UserSerializer(user).data,
                'tokens': {
                    'refresh': str(refresh),
                    'access': str(refresh.access_token),
                }
            }, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['post'], permission_classes=[AllowAny])
    def login(self, request):
        """User login"""
        username = request.data.get('username')
        password = request.data.get('password')
        
        if not username or not password:
            return Response(
                {'message': 'Username and password are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        user = authenticate(username=username, password=password)
        if user and user.is_active:
            refresh = RefreshToken.for_user(user)
            return Response({
                'success': True,
                'user': UserSerializer(user).data,
                'tokens': {
                    'refresh': str(refresh),
                    'access': str(refresh.access_token),
                }
            })
        return Response(
            {'message': 'Invalid credentials'},
            status=status.HTTP_401_UNAUTHORIZED
        )
    
    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def me(self, request):
        """Get current user"""
        serializer = self.get_serializer(request.user)
        return Response({'success': True, 'user': serializer.data})
    
    @action(detail=False, methods=['put', 'patch'], permission_classes=[IsAuthenticated])
    def update_me(self, request):
        """Update current user"""
        serializer = self.get_serializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response({'success': True, 'user': serializer.data})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['put', 'patch'], permission_classes=[IsAuthenticated], url_path='settings')
    def user_settings(self, request):
        """Update user settings"""
        serializer = UserSettingsSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response({'success': True, 'user': UserSerializer(request.user).data})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated], parser_classes=[MultiPartParser, FormParser], url_path='avatar')
    def upload_avatar(self, request):
        """Upload user avatar"""
        if 'avatar' not in request.FILES:
            return Response({'message': 'No image provided'}, status=status.HTTP_400_BAD_REQUEST)

        file_obj = request.FILES['avatar']

        import os
        ext = os.path.splitext(file_obj.name)[1]
        if not ext:
            ext = '.bin'

        file_path = f'avatars/{request.user.id}_avatar{ext}'

        try:
            if default_storage.exists(file_path):
                default_storage.delete(file_path)

            file_name = default_storage.save(file_path, file_obj)
            file_url = default_storage.url(file_name)

            request.user.avatar_url = file_url
            request.user.save()

            return Response({'success': True, 'user': UserSerializer(request.user).data})
        except Exception as e:
            return Response(
                {'message': f'Storage error: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['post'], permission_classes=[AllowAny])
    def request_password_reset(self, request):
        """Request password reset email"""
        email = request.data.get('email')
        if not email:
            return Response({'message': 'Email is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            # For security, don't reveal that the user doesn't exist
            # But return success so frontend shows the "check email" message
            return Response({'success': True, 'message': 'If an account exists, a reset email has been sent.'})
            
        token = default_token_generator.make_token(user)
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        
        # Construct reset link
        # TODO: Move domain to settings
        reset_link = f"http://localhost:5173/reset-password/{uid}/{token}"
        
        try:
            send_mail(
                subject='Password Reset Request - Autograder',
                message=f'Click the following link to reset your password: {reset_link}',
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[email],
                fail_silently=False,
            )
            return Response({'success': True, 'message': 'Password reset email sent'})
        except Exception as e:
            return Response({'success': False, 'message': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'], permission_classes=[AllowAny])
    def reset_password_confirm(self, request):
        """Confirm password reset with token"""
        uid = request.data.get('uid')
        token = request.data.get('token')
        new_password = request.data.get('new_password')
        
        if not all([uid, token, new_password]):
             return Response({'message': 'All fields are required'}, status=status.HTTP_400_BAD_REQUEST)
             
        try:
            uid_decoded = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=uid_decoded)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return Response({'message': 'Invalid link'}, status=status.HTTP_400_BAD_REQUEST)
            
        if user and default_token_generator.check_token(user, token):
            user.set_password(new_password)
            user.save()
            return Response({'success': True, 'message': 'Password has been reset successfully'})
        else:
            return Response({'message': 'Invalid or expired token'}, status=status.HTTP_400_BAD_REQUEST)
