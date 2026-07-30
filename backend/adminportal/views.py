import os
from datetime import timedelta

from django.db.models import Count, Q
from django.http import FileResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken

from core.permissions import IsAdmin
from users.models import User
from users.serializers import UserSerializer
from classes.models import Class
from assignments.models import Assignment
from submissions.models import SubmissionAttempt

from .models import BackupRecord
from .serializers import AdminUserSerializer, AdminUserCreateSerializer, AdminClassSerializer, BackupRecordSerializer
from .services import BACKUP_DIR
from .tasks import create_backup_task
from . import health as health_checks

# Every view in this app is admin-only. Applied per-view rather than a
# module-level default so each class's intent is explicit.
ADMIN_ONLY = [IsAuthenticated, IsAdmin]


class OverviewView(APIView):
    """GET /api/admin/overview/ — system-wide totals + a per-class table.

    Reuses the same annotate() shape as ClassViewSet.get_queryset
    (classes/views.py) for student_count/assignment_count, and mirrors the
    metric definitions in ClassViewSet.class_stats, but expressed as a single
    annotated queryset since this is system-wide rather than per-class.
    """
    permission_classes = ADMIN_ONLY

    def get(self, request):
        now = timezone.now()
        week_ago = now - timedelta(days=7)

        users_by_role = dict(
            User.objects.values('role').annotate(n=Count('id')).values_list('role', 'n')
        )

        classes_qs = Class.objects.select_related('owner').prefetch_related('enrollments').annotate(
            student_count=Count('enrollments', filter=Q(enrollments__role='student'), distinct=True),
            assignment_count=Count('modules__items', filter=Q(modules__items__type='assignment'), distinct=True),
            submission_count=Count(
                'modules__items__assignment__assignmentquestion__attempts', distinct=True
            ),
        ).order_by('-created_at')

        totals = {
            'users_total': User.objects.count(),
            'users_by_role': {
                'admin': users_by_role.get('admin', 0),
                'teacher': users_by_role.get('teacher', 0),
                'ta': users_by_role.get('ta', 0),
                'student': users_by_role.get('student', 0),
            },
            'classes_active': classes_qs.filter(is_archived=False).count(),
            'classes_archived': classes_qs.filter(is_archived=True).count(),
            'assignments_total': Assignment.objects.count(),
            'submissions_total': SubmissionAttempt.objects.count(),
            'submissions_last_7_days': SubmissionAttempt.objects.filter(created_at__gte=week_ago).count(),
        }

        classes_data = AdminClassSerializer(classes_qs, many=True).data

        return Response({'success': True, 'totals': totals, 'classes': classes_data})


class AdminUserViewSet(viewsets.ModelViewSet):
    """/api/admin/users/ — full user management. Search + filter, create
    (the "add teacher" path), edit role/active state, set-password, delete.
    Distinct from users.UserViewSet (self-service profile endpoints)."""
    queryset = User.objects.all().order_by('-date_joined')
    permission_classes = ADMIN_ONLY

    def get_serializer_class(self):
        if self.action == 'create':
            return AdminUserCreateSerializer
        return AdminUserSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get('search')
        role = self.request.query_params.get('role')
        is_active = self.request.query_params.get('is_active')
        if search:
            qs = qs.filter(
                Q(username__icontains=search) | Q(email__icontains=search) |
                Q(first_name__icontains=search) | Q(last_name__icontains=search)
            )
        if role:
            qs = qs.filter(role=role)
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in ('1', 'true', 'yes'))
        return qs

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response({'success': True, 'user': AdminUserSerializer(user).data}, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        # Guardrail: an admin can't demote themselves out of the admin role
        # via this endpoint — that would be an easy way to accidentally lock
        # yourself out with no one left to undo it.
        if instance.id == request.user.id and request.data.get('role') and request.data['role'] != 'admin':
            return Response({'success': False, 'message': "You cannot change your own role."},
                             status=status.HTTP_400_BAD_REQUEST)
        response = super().update(request, *args, **kwargs)
        return Response({'success': True, 'user': response.data})

    def partial_update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.id == request.user.id:
            return Response({'success': False, 'message': "You cannot delete your own account."},
                             status=status.HTTP_400_BAD_REQUEST)
        if instance.role == 'admin' and User.objects.filter(role='admin').count() <= 1:
            return Response({'success': False, 'message': "Cannot delete the last remaining admin."},
                             status=status.HTTP_400_BAD_REQUEST)
        instance.delete()
        return Response({'success': True}, status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], url_path='set-password')
    def set_password(self, request, pk=None):
        """Admin-initiated password reset. Passwords are hashed and can
        never be read back — this SETS a new one. Also blacklists the
        user's outstanding refresh tokens so a compromised session is
        actually terminated, not just left holding a 7-day access token."""
        new_password = request.data.get('new_password')
        if not new_password or len(new_password) < 8:
            return Response({'success': False, 'message': 'Password must be at least 8 characters.'},
                             status=status.HTTP_400_BAD_REQUEST)

        user = self.get_object()
        user.set_password(new_password)
        user.save(update_fields=['password'])

        for token in OutstandingToken.objects.filter(user=user):
            BlacklistedToken.objects.get_or_create(token=token)

        return Response({'success': True, 'message': f"Password reset for {user.username}."})


class AdminClassViewSet(viewsets.ModelViewSet):
    """/api/admin/classes/ — oversight across every class (not just ones the
    admin owns/teaches, unlike ClassViewSet which scopes to the caller)."""
    queryset = Class.objects.select_related('owner').prefetch_related('enrollments').annotate(
        student_count=Count('enrollments', filter=Q(enrollments__role='student'), distinct=True),
        assignment_count=Count('modules__items', filter=Q(modules__items__type='assignment'), distinct=True),
        submission_count=Count('modules__items__assignment__assignmentquestion__attempts', distinct=True),
    ).order_by('-created_at')
    serializer_class = AdminClassSerializer
    permission_classes = ADMIN_ONLY
    http_method_names = ['get', 'patch', 'head', 'options']  # oversight + archive toggle only


class SystemHealthView(APIView):
    permission_classes = ADMIN_ONLY

    def get(self, request):
        return Response({'success': True, 'checks': health_checks.get_system_health()})


_ALLOWED_MAINTENANCE_ACTIONS = {
    'cleanup_stale_submissions',
    'update_analytics',
    'recalculate_points',
    'update_leaderboard',
}


class MaintenanceActionView(APIView):
    """POST /api/admin/maintenance/<action>/ — runs an allow-listed Django
    management command. `action` is validated against a fixed set; nothing
    from the request body is ever passed to call_command."""
    permission_classes = ADMIN_ONLY

    def post(self, request, action_name):
        if action_name not in _ALLOWED_MAINTENANCE_ACTIONS:
            return Response({'success': False, 'message': f'Unknown action: {action_name}'},
                             status=status.HTTP_400_BAD_REQUEST)

        from django.core.management import call_command
        import io
        out = io.StringIO()
        try:
            call_command(action_name, stdout=out)
            return Response({'success': True, 'output': out.getvalue()})
        except Exception as e:
            return Response({'success': False, 'message': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class BackupViewSet(viewsets.ReadOnlyModelViewSet):
    """/api/admin/backups/ — list + create (enqueues a Celery task, returns
    immediately) + download. Creation is deliberately async: a backup can be
    tens of MB and building it in-request risks Nginx's 130s proxy_read_timeout
    on /api/."""
    queryset = BackupRecord.objects.all()
    serializer_class = BackupRecordSerializer
    permission_classes = ADMIN_ONLY

    def create(self, request):
        record = BackupRecord.objects.create(created_by=request.user, status='pending')
        create_backup_task.delay(record.id)
        return Response({'success': True, 'backup': BackupRecordSerializer(record).data},
                         status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        record = self.get_object()
        if record.status != 'complete':
            return Response({'success': False, 'message': f'Backup is {record.status}, not ready.'},
                             status=status.HTTP_400_BAD_REQUEST)
        path = BACKUP_DIR / record.filename
        if not path.exists():
            return Response({'success': False, 'message': 'Backup file missing on disk.'},
                             status=status.HTTP_404_NOT_FOUND)
        return FileResponse(open(path, 'rb'), as_attachment=True, filename=record.filename)
