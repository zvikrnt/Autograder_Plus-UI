import uuid
from django.db import models
from django.conf import settings


class AdaptiveQuestion(models.Model):
    """
    A question in the adaptive practice bank (imported from the merged
    LeetCode + Zerotrac dataset, or added via JSON import).

    `elo_rating` is the numeric item difficulty MARS uses. The MARS engine
    works in a 0-centred learner space, so the *effective* item rating is
    `elo_rating - RATING_SHIFT` (see mars_engine.RATING_SHIFT).
    """
    DIFFICULTY_CHOICES = [('Easy', 'Easy'), ('Medium', 'Medium'), ('Hard', 'Hard')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    slug = models.SlugField(max_length=200, unique=True)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    difficulty = models.CharField(max_length=20, choices=DIFFICULTY_CHOICES, default='Medium')
    tags = models.JSONField(default=list, blank=True)

    # Coding config
    language = models.CharField(max_length=20, default='python')
    entry_point = models.CharField(max_length=120, blank=True, default='solution')
    starter_code = models.TextField(blank=True)
    reference_solution = models.TextField(blank=True)
    test_cases = models.JSONField(default=list)

    # MARS item rating (numeric Elo). Also a reference solve-time for the
    # time-quality signal (seconds); defaults derived from difficulty.
    elo_rating = models.FloatField(default=1500.0)
    ref_time_sec = models.FloatField(default=180.0)

    source = models.CharField(max_length=60, blank=True, default='import')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'adaptive_questions'
        ordering = ['elo_rating']
        indexes = [models.Index(fields=['elo_rating']), models.Index(fields=['is_active'])]

    def __str__(self):
        return f"{self.title} ({self.elo_rating:.0f})"


class MarsRating(models.Model):
    """
    Per-student MARS learner state (persisted across sessions).

    `rating` is the displayed/stored MARS score. Per product decision it starts
    at 0. `velocity`, `streak`, `rolling_updates`, and per-topic stats mirror the
    MARS `LearnerState`. `sigma2` (volatility) is derived from rolling_updates.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='mars_rating'
    )
    rating = models.FloatField(default=0.0)
    velocity = models.FloatField(default=0.0)
    n = models.IntegerField(default=0)               # questions answered
    streak = models.IntegerField(default=0)
    peak_rating = models.FloatField(default=0.0)
    rolling_updates = models.JSONField(default=list, blank=True)   # last N deltas
    topic_correct = models.JSONField(default=dict, blank=True)
    topic_total = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'mars_ratings'
        ordering = ['-rating']

    def __str__(self):
        return f"{self.student.username}: {self.rating:.0f}"


class AdaptiveSession(models.Model):
    """One adaptive practice session (a run of served questions)."""
    STATUS_CHOICES = [('active', 'Active'), ('ended', 'Ended')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='adaptive_sessions'
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    language = models.CharField(max_length=20, default='python')
    rating_start = models.FloatField(default=0.0)
    rating_end = models.FloatField(null=True, blank=True)
    questions_served = models.IntegerField(default=0)
    questions_solved = models.IntegerField(default=0)
    questions_skipped = models.IntegerField(default=0)
    # id of the currently-served question (awaiting submit/skip)
    current_question = models.ForeignKey(
        AdaptiveQuestion, on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )
    current_served_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'adaptive_sessions'
        ordering = ['-started_at']

    @property
    def rating_delta(self):
        if self.rating_end is None:
            return 0.0
        return round(self.rating_end - self.rating_start, 1)


class AdaptiveAttempt(models.Model):
    """A single served question within a session and its outcome."""
    OUTCOME_CHOICES = [('solved', 'Solved'), ('failed', 'Failed'), ('skipped', 'Skipped')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(AdaptiveSession, on_delete=models.CASCADE, related_name='attempts')
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='adaptive_attempts')
    question = models.ForeignKey(AdaptiveQuestion, on_delete=models.CASCADE, related_name='attempts')

    outcome = models.CharField(max_length=20, choices=OUTCOME_CHOICES)
    source_code = models.TextField(blank=True)
    tests_passed = models.IntegerField(default=0)
    tests_total = models.IntegerField(default=0)
    time_taken_sec = models.FloatField(default=0.0)
    run_attempts = models.IntegerField(default=1)

    rating_before = models.FloatField(default=0.0)
    rating_after = models.FloatField(default=0.0)
    rating_delta = models.FloatField(default=0.0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'adaptive_attempts'
        ordering = ['created_at']
