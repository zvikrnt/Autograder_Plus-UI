from rest_framework import permissions

class IsTeacher(permissions.BasePermission):
    """
    Custom permission to only allow teachers to access the view.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == 'teacher')


class IsAdmin(permissions.BasePermission):
    """
    Custom permission to only allow admins to access the view.

    Keyed on `role == 'admin'`, not is_staff/is_superuser — those flags are
    set independently (only via seed scripts) and are decoupled from `role`
    throughout this project.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == 'admin')
