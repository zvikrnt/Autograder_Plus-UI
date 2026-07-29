from rest_framework import serializers
from .models import (
    Class, Enrollment, Announcement, Comment,
    AnnouncementAttachment, ClassResource, DiscussionThread, DiscussionReply,
)
from users.serializers import UserSerializer


def class_role_for(user, class_obj):
    """Return a user's role within a class: owner→'teacher', else enrollment role, else None."""
    if not user or not class_obj:
        return None
    if getattr(class_obj, 'owner_id', None) == user.id:
        return 'teacher'
    enr = Enrollment.objects.filter(class_obj=class_obj, user=user).first()
    return enr.role if enr else None


class ClassSerializer(serializers.ModelSerializer):
    owner = UserSerializer(read_only=True)
    student_count = serializers.IntegerField(read_only=True)
    assignment_count = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = Class
        fields = ['id', 'name', 'section', 'owner', 'join_code',
                  'settings', 'created_at', 'updated_at',
                  'student_count', 'assignment_count', 'is_archived']
        read_only_fields = ['id', 'join_code', 'created_at', 'updated_at', 'owner']
    
    def create(self, validated_data):
        validated_data['owner'] = self.context['request'].user
        return super().create(validated_data)


class EnrollmentSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    class_obj = ClassSerializer(read_only=True)
    class_obj_id = serializers.PrimaryKeyRelatedField(
        queryset=Class.objects.all(), 
        source='class_obj',
        write_only=True
    )
    
    class Meta:
        model = Enrollment
        fields = ['id', 'class_obj', 'class_obj_id', 'user', 'role',
                  'joined_at']
        read_only_fields = ['id', 'user', 'joined_at']


class CommentSerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)
    author_role = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = ['id', 'author', 'author_role', 'content', 'created_at', 'updated_at', 'announcement', 'assignment']
        read_only_fields = ['id', 'author', 'author_role', 'created_at', 'updated_at']

    def get_author_role(self, obj):
        # Resolve the class from whichever parent the comment hangs on.
        class_obj = None
        if obj.announcement_id:
            class_obj = obj.announcement.class_obj
        elif obj.assignment_id:
            try:
                class_obj = obj.assignment.module.class_obj
            except Exception:
                class_obj = None
        return class_role_for(obj.author, class_obj)

    def create(self, validated_data):
        validated_data['author'] = self.context['request'].user
        return super().create(validated_data)


class AnnouncementAttachmentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = AnnouncementAttachment
        fields = ['id', 'file_url', 'original_name', 'size', 'content_type', 'uploaded_at']

    def get_file_url(self, obj):
        request = self.context.get('request')
        if not obj.file:
            return None
        url = obj.file.url
        return request.build_absolute_uri(url) if request else url


class AnnouncementSerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)
    comments = CommentSerializer(many=True, read_only=True)
    comments_count = serializers.IntegerField(read_only=True)
    attachments = AnnouncementAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = Announcement
        fields = ['id', 'class_obj', 'author', 'content', 'is_pinned', 'created_at', 'updated_at', 'comments', 'comments_count', 'attachments']
        read_only_fields = ['id', 'author', 'created_at', 'updated_at', 'comments', 'comments_count', 'attachments']

    def create(self, validated_data):
        validated_data['author'] = self.context['request'].user
        return super().create(validated_data)


class ClassResourceSerializer(serializers.ModelSerializer):
    uploaded_by = UserSerializer(read_only=True)
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = ClassResource
        fields = ['id', 'class_obj', 'uploaded_by', 'title', 'description', 'category',
                  'file_url', 'link_url', 'original_name', 'size', 'content_type',
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'uploaded_by', 'file_url', 'original_name', 'size',
                            'content_type', 'created_at', 'updated_at']

    def get_file_url(self, obj):
        request = self.context.get('request')
        if not obj.file:
            return None
        url = obj.file.url
        return request.build_absolute_uri(url) if request else url


class DiscussionReplySerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)
    author_role = serializers.SerializerMethodField()

    class Meta:
        model = DiscussionReply
        fields = ['id', 'thread', 'author', 'author_role', 'content', 'created_at']
        read_only_fields = ['id', 'author', 'author_role', 'created_at']

    def get_author_role(self, obj):
        return class_role_for(obj.author, obj.thread.class_obj)

    def create(self, validated_data):
        validated_data['author'] = self.context['request'].user
        return super().create(validated_data)


class DiscussionThreadSerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)
    author_role = serializers.SerializerMethodField()
    replies = DiscussionReplySerializer(many=True, read_only=True)
    reply_count = serializers.SerializerMethodField()

    class Meta:
        model = DiscussionThread
        fields = ['id', 'class_obj', 'author', 'author_role', 'title', 'body',
                  'is_resolved', 'is_pinned', 'created_at', 'updated_at',
                  'replies', 'reply_count']
        read_only_fields = ['id', 'author', 'author_role', 'created_at', 'updated_at',
                            'replies', 'reply_count']

    def get_author_role(self, obj):
        return class_role_for(obj.author, obj.class_obj)

    def get_reply_count(self, obj):
        return obj.replies.count()

    def create(self, validated_data):
        validated_data['author'] = self.context['request'].user
        return super().create(validated_data)
