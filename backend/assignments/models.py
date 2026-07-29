import uuid
from django.db import models
from django.conf import settings
from classes.models import Module


class ContentItem(models.Model):
    """
    Polymorphic Parent for content (Assignment, Quiz, Material).
    """
    TYPE_CHOICES = [
        ('assignment', 'Assignment'),
        ('quiz', 'Quiz'),
        ('material', 'Material'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    module = models.ForeignKey(Module, on_delete=models.CASCADE, related_name='items')
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    is_published = models.BooleanField(default=False)
    due_date = models.DateTimeField(null=True, blank=True)
    start_time = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'content_items'
        ordering = ['due_date']
        
    @property
    def actual_type(self):
        if self.type == 'assignment' and hasattr(self, 'assignment'):
            if getattr(self.assignment, 'mode', '') == 'exam':
                return 'exam'
        return self.type

    def __str__(self):
        return self.title


class Question(models.Model):
    """
    A reusable coding problem.
    Replaces ProblemVersion.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200)
    slug = models.SlugField(unique=True)
    description = models.TextField()
    starter_code = models.TextField(blank=True)
    reference_solution = models.TextField(blank=True)
    
    QUESTION_TYPES = [
        ('coding', 'Coding'),
        ('mcq', 'Multiple Choice'),
    ]
    question_type = models.CharField(max_length=20, choices=QUESTION_TYPES, default='coding')
    
    # JSONB for test cases (Input/Output/Hidden/Points) or MCQ correct answer index
    test_cases = models.JSONField(default=list)
    
    # Tags for Topic Analysis
    tags = models.JSONField(default=list, blank=True)

    # Unified fields from PracticeQuestion
    difficulty = models.CharField(
        max_length=20, 
        choices=[('Easy', 'Easy'), ('Medium', 'Medium'), ('Hard', 'Hard')],
        default='Medium'
    )
    category = models.CharField(max_length=100, default='General')
    point_value = models.IntegerField(default=100)
    is_active = models.BooleanField(default=True)
    config = models.JSONField(default=dict, blank=True)
    
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='created_questions')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'questions'
    
    def __str__(self):
        return self.title


class Assignment(ContentItem):
    """
    Extends ContentItem.
    """
    MODE_CHOICES = [
        ('practice', 'Practice'),
        ('exam', 'Exam'),
    ]
    
    DIFFICULTY_CHOICES = [
        ('Easy', 'Easy'),
        ('Medium', 'Medium'),
        ('Hard', 'Hard'),
    ]
    
    mode = models.CharField(max_length=20, choices=MODE_CHOICES, default='practice')
    points_total = models.IntegerField(default=100)
    difficulty = models.CharField(max_length=20, choices=DIFFICULTY_CHOICES, default='Medium')
    
    # JSONB for languages, time_limit, etc.
    config = models.JSONField(default=dict)
    
    questions = models.ManyToManyField(Question, through='AssignmentQuestion', related_name='assignments')
    questions_released = models.BooleanField(default=False)
    
    class Meta:
        db_table = 'assignments'


class AssignmentQuestion(models.Model):
    """
    Link table for ordering questions in an assignment.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE)
    question = models.ForeignKey(Question, on_delete=models.CASCADE)
    order = models.IntegerField(default=0)
    custom_points = models.IntegerField(null=True, blank=True)
    umap_url = models.CharField(max_length=500, blank=True, null=True)
    
    class Meta:
        db_table = 'assignment_questions'
        ordering = ['order']
        unique_together = ['assignment', 'question']
