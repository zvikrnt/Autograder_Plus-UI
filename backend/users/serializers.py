from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from .models import User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 
                  'role', 'avatar_url', 'settings', 'is_active', 'date_joined']
        read_only_fields = ['id', 'date_joined']


class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True, required=True)
    
    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'password2', 'first_name', 'last_name', 'role']
        extra_kwargs = {
            'first_name': {'required': True},
            'last_name': {'required': True},
        }
    
    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({"password": "Password fields didn't match."})
        # Self-registration must never be able to grant admin. The 'admin'
        # role can only be granted by an existing admin, via the admin
        # portal's user-management endpoints.
        if attrs.get('role') == 'admin':
            raise serializers.ValidationError({"role": "Cannot self-register as admin."})
        return attrs
    
    def create(self, validated_data):
        validated_data.pop('password2')
        user = User.objects.create_user(**validated_data)
        return user


class UserSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['settings']
    
    def update(self, instance, validated_data):
        settings = instance.settings or {}
        settings.update(validated_data.get('settings', {}))
        instance.settings = settings
        instance.save()
        return instance
