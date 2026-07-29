from django.contrib import admin
from .models import AdaptiveQuestion, MarsRating, AdaptiveSession, AdaptiveAttempt


@admin.register(AdaptiveQuestion)
class AdaptiveQuestionAdmin(admin.ModelAdmin):
    list_display = ('title', 'difficulty', 'elo_rating', 'language', 'is_active', 'source')
    list_filter = ('difficulty', 'language', 'is_active', 'source')
    search_fields = ('title', 'slug')


@admin.register(MarsRating)
class MarsRatingAdmin(admin.ModelAdmin):
    list_display = ('student', 'rating', 'peak_rating', 'n', 'streak')
    search_fields = ('student__username',)


@admin.register(AdaptiveSession)
class AdaptiveSessionAdmin(admin.ModelAdmin):
    list_display = ('student', 'status', 'rating_start', 'rating_end', 'questions_solved', 'started_at')
    list_filter = ('status',)


admin.site.register(AdaptiveAttempt)
