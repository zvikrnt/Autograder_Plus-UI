from rest_framework import serializers

from users.models import User
from classes.models import Class
from .models import BackupRecord


class AdminUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name',
                  'role', 'is_active', 'date_joined']
        read_only_fields = ['id', 'date_joined']


class AdminUserCreateSerializer(serializers.ModelSerializer):
    """Used for the admin-portal 'add user' action (e.g. adding a teacher).
    Unlike self-registration, `role` is fully trusted here since the caller
    is already verified as an admin."""
    password = serializers.CharField(write_only=True, required=True)

    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'first_name', 'last_name', 'role']

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class AdminClassSerializer(serializers.ModelSerializer):
    owner_username = serializers.CharField(source='owner.username', read_only=True)
    student_count = serializers.IntegerField(read_only=True)
    assignment_count = serializers.IntegerField(read_only=True)
    submission_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Class
        fields = ['id', 'name', 'section', 'owner_username', 'is_archived',
                  'student_count', 'assignment_count', 'submission_count', 'created_at']


class BackupRecordSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(source='created_by.username', read_only=True, default=None)

    class Meta:
        model = BackupRecord
        fields = ['id', 'filename', 'size_bytes', 'status', 'error_message',
                  'created_by_username', 'created_at', 'completed_at']
        read_only_fields = fields
