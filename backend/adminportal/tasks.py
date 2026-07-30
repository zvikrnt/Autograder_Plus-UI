import logging
import os

from celery import shared_task
from django.utils import timezone

from .models import BackupRecord
from .services import create_backup_zip, enforce_retention

logger = logging.getLogger(__name__)


@shared_task
def create_backup_task(record_id):
    """Builds a backup ZIP (DB dump + media/ + assignments_data/) and
    updates the BackupRecord. Runs on the general Celery queue — a backup is
    a few tens of MB and would otherwise risk tripping Nginx's 130s
    proxy_read_timeout on /api/ if built synchronously in the request."""
    try:
        record = BackupRecord.objects.get(id=record_id)
    except BackupRecord.DoesNotExist:
        logger.error("create_backup_task: BackupRecord %s not found", record_id)
        return

    record.status = 'running'
    record.save(update_fields=['status'])

    try:
        zip_path = create_backup_zip()
        record.filename = zip_path.name
        record.size_bytes = os.path.getsize(zip_path)
        record.status = 'complete'
        record.completed_at = timezone.now()
        record.save(update_fields=['filename', 'size_bytes', 'status', 'completed_at'])
        enforce_retention()
    except Exception as e:
        logger.exception("Backup failed for record %s", record_id)
        record.status = 'failed'
        record.error_message = str(e)
        record.save(update_fields=['status', 'error_message'])
