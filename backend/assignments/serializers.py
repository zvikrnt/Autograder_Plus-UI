from rest_framework import serializers
from .models import Assignment, Question, AssignmentQuestion, ContentItem
from classes.serializers import ClassSerializer
from users.serializers import UserSerializer
from submissions.models import GradebookEntry


class QuestionSerializer(serializers.ModelSerializer):
    slug = serializers.SlugField(required=False)
    
    class Meta:
        model = Question
        fields = ['id', 'title', 'slug', 'description', 'question_type', 'difficulty', 'category', 'point_value', 
                  'starter_code', 'reference_solution', 'test_cases', 'tags', 'config', 'is_active', 
                  'created_by', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at', 'slug']

    def create(self, validated_data):
        if 'slug' not in validated_data:
            # Generate a simple slug from title or use uuid if title is missing (edge case)
            from django.utils.text import slugify
            import uuid
            title = validated_data.get('title', '')
            base_slug = slugify(title)
            if not base_slug:
                base_slug = "question"
            # Append short UUID to ensure uniqueness
            # Truncate base_slug to 40 chars to leave room for 9 char suffix (total < 50)
            base_slug = base_slug[:40]
            validated_data['slug'] = f"{base_slug}-{str(uuid.uuid4())[:8]}"
            
        # Ensure test_cases is a list
        if 'test_cases' not in validated_data:
            validated_data['test_cases'] = []
            
        # Set created_by from context
        validated_data['created_by'] = self.context['request'].user
        
        # Default question_type if missing
        if 'question_type' not in validated_data:
            validated_data['question_type'] = 'coding'
            
        return super().create(validated_data)

    def validate_config(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Config must be a dictionary.")
        
        entry_point = value.get('entry_point')
        if entry_point:
            if not isinstance(entry_point, str) or not entry_point.isidentifier():
                # Allow it to pass if it's an MCQ which doesn't use entry_point
                pass # Or we can just let it through, or check self.initial_data.get('question_type')
        
        return value

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        if not ret.get('starter_code'):
            config = instance.config or {}
            entry_point = config.get('entry_point')
            if entry_point:
                ret['starter_code'] = (
                    f"# Write your solution below\n"
                    f"# The function '{entry_point}' will be called with the test case inputs.\n"
                    f"def {entry_point}():\n"
                    f"    pass\n"
                )
            else:
                ret['starter_code'] = "# Write your solution below\n"
        return ret



class AssignmentQuestionSerializer(serializers.ModelSerializer):
    question = QuestionSerializer(read_only=True)
    
    class Meta:
        model = AssignmentQuestion
        fields = ['id', 'question', 'order', 'custom_points', 'umap_url']


class AssignmentSerializer(serializers.ModelSerializer):
    questions = AssignmentQuestionSerializer(source='assignmentquestion_set', many=True, read_only=True)
    class_name = serializers.CharField(source='module.class_obj.name', read_only=True)
    points = serializers.IntegerField(source='points_total', read_only=True)
    
    total_students = serializers.SerializerMethodField()
    is_submitted = serializers.SerializerMethodField()
    is_graded = serializers.SerializerMethodField()
    
    class_id = serializers.UUIDField(source='module.class_obj.id', read_only=True)

    class Meta:
        model = Assignment
        # Include fields from ContentItem (inherited) and Assignment
        fields = ['id', 'title', 'description', 'due_date', 'start_time', 'duration_minutes', 'is_published', 'type',
                  'mode', 'points_total', 'points', 'difficulty', 'config', 'questions', 
                  'module', 'class_name', 'class_id', 'total_students', 'is_submitted', 'is_graded', 'created_at']
        read_only_fields = ['id', 'class_name', 'class_id', 'points', 'total_students', 'is_submitted', 'is_graded', 'created_at']

    def get_total_students(self, obj):
        # Count students enrolled in the class linked to this assignment's module
        return obj.module.class_obj.enrollments.filter(role='student').count()

    def get_is_submitted(self, obj):
        user = self.context.get('request').user if self.context.get('request') else None
        if not user or not user.is_authenticated or user.role != 'student':
            return False
            
        return GradebookEntry.objects.filter(
            student=user,
            content_item=obj,
            status__in=['submitted', 'graded']
        ).exists()

    def get_is_graded(self, obj):
        user = self.context.get('request').user if self.context.get('request') else None
        if not user or not user.is_authenticated or user.role != 'student':
            return False
            
        return GradebookEntry.objects.filter(
            student=user,
            content_item=obj,
            status='graded'
        ).exists()


class StreamAssignmentSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for stream/list view.
    Excludes questions and heavy computed fields.
    """
    class_id = serializers.UUIDField(source='module.class_obj.id', read_only=True, allow_null=True)
    class_name = serializers.CharField(source='module.class_obj.name', read_only=True, allow_null=True)
    comments_count = serializers.IntegerField(read_only=True)
    is_submitted = serializers.SerializerMethodField()
    is_graded = serializers.SerializerMethodField()
    
    class Meta:
        model = Assignment
        fields = ['id', 'title', 'description', 'due_date', 'start_time', 'duration_minutes', 'type', 'mode', 'points_total', 'created_at', 'class_id', 'class_name', 'is_published', 'comments_count', 'is_submitted', 'is_graded']

    def get_is_submitted(self, obj):
        user = self.context.get('request').user if self.context.get('request') else None
        if not user or not user.is_authenticated or user.role != 'student':
            return False
        return GradebookEntry.objects.filter(
            student=user,
            content_item=obj,
            status__in=['submitted', 'graded']
        ).exists()

    def get_is_graded(self, obj):
        user = self.context.get('request').user if self.context.get('request') else None
        if not user or not user.is_authenticated or user.role != 'student':
            return False
        return GradebookEntry.objects.filter(
            student=user,
            content_item=obj,
            status='graded'
        ).exists()
