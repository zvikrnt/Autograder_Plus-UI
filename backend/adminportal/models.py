from django.conf import settings
from django.db import models


class BackupRecord(models.Model):
    """A single locally-stored ZIP backup (DB dump + media/ + assignments_data/).

    Backups are created asynchronously via Celery (`adminportal.tasks.
    create_backup_task`); this row tracks progress so the UI can poll it.
    """
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('running', 'Running'),
        ('complete', 'Complete'),
        ('failed', 'Failed'),
    ]

    filename = models.CharField(max_length=255, blank=True)
    size_bytes = models.BigIntegerField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    error_message = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='backups_created'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'admin_backup_records'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.filename or '(pending)'} [{self.status}]"
