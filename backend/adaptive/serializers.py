from rest_framework import serializers
from .models import AdaptiveQuestion, MarsRating, AdaptiveSession, AdaptiveAttempt


class AdaptiveQuestionSerializer(serializers.ModelSerializer):
    """Question as served to the student — hides hidden test cases + reference solution."""
    visible_test_cases = serializers.SerializerMethodField()

    class Meta:
        model = AdaptiveQuestion
        fields = ['id', 'slug', 'title', 'description', 'difficulty', 'tags',
                  'language', 'entry_point', 'starter_code', 'elo_rating',
                  'visible_test_cases']

    def get_visible_test_cases(self, obj):
        return [tc for tc in (obj.test_cases or []) if not tc.get('is_hidden')][:5]


class MarsRatingSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='student.username', read_only=True)
    name = serializers.SerializerMethodField()

    class Meta:
        model = MarsRating
        fields = ['rating', 'peak_rating', 'n', 'streak', 'username', 'name', 'updated_at']

    def get_name(self, obj):
        s = obj.student
        return f"{s.first_name} {s.last_name}".strip() or s.username


class AdaptiveAttemptSerializer(serializers.ModelSerializer):
    question_title = serializers.CharField(source='question.title', read_only=True)
    difficulty = serializers.CharField(source='question.difficulty', read_only=True)

    class Meta:
        model = AdaptiveAttempt
        fields = ['id', 'question_title', 'difficulty', 'outcome', 'tests_passed',
                  'tests_total', 'time_taken_sec', 'rating_before', 'rating_after',
                  'rating_delta', 'created_at']


class AdaptiveSessionSerializer(serializers.ModelSerializer):
    rating_delta = serializers.FloatField(read_only=True)
    attempts = AdaptiveAttemptSerializer(many=True, read_only=True)

    class Meta:
        model = AdaptiveSession
        fields = ['id', 'status', 'language', 'rating_start', 'rating_end', 'rating_delta',
                  'questions_served', 'questions_solved', 'questions_skipped',
                  'started_at', 'ended_at', 'attempts']
