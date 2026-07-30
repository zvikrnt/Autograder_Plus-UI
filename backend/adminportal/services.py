"""
Local ZIP backup: a Django `dumpdata` JSON snapshot plus the two local data
directories the app actually writes to at runtime (media/ and
assignments_data/). Deliberately excludes the legacy, unreferenced
submissions_data/ and the scratch temp_data_folder/, and does not pull
MinIO objects (only two FileFields use it: AnnouncementAttachment.file and
ClassResource.file).
"""
import io
import os
import zipfile
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.core.management import call_command

BACKUP_DIR = Path(getattr(settings, 'BACKUP_ROOT', Path(settings.BASE_DIR) / 'backups'))
DEFAULT_RETENTION = 5

# Directories included verbatim in every backup, relative to BASE_DIR.
_INCLUDED_DATA_DIRS = ['media', 'assignments_data']


def _dump_database_json() -> bytes:
    buf = io.StringIO()
    call_command('dumpdata', indent=2, stdout=buf,
                  exclude=['contenttypes', 'auth.permission', 'sessions.session'])
    return buf.getvalue().encode('utf-8')


def _add_directory_to_zip(zf: zipfile.ZipFile, source_dir: Path, arc_prefix: str) -> None:
    if not source_dir.exists():
        return
    for root, _dirs, files in os.walk(source_dir):
        for fname in files:
            fpath = Path(root) / fname
            arcname = f"{arc_prefix}/{fpath.relative_to(source_dir)}"
            zf.write(fpath, arcname)


def create_backup_zip() -> Path:
    """Builds the ZIP synchronously and returns its path. Called from the
    Celery task (adminportal.tasks.create_backup_task), never directly from
    a request — this can take a while and must not run in-request."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    filename = f'autograder-backup-{timestamp}.zip'
    zip_path = BACKUP_DIR / filename

    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('db_dump.json', _dump_database_json())
        for dirname in _INCLUDED_DATA_DIRS:
            _add_directory_to_zip(zf, Path(settings.BASE_DIR) / dirname, dirname)

    return zip_path


def enforce_retention(keep: int = DEFAULT_RETENTION) -> list[str]:
    """Deletes the oldest backup files beyond `keep`, on disk AND their
    BackupRecord rows, so the 100GB deployment disk can't fill up. Returns
    the filenames removed."""
    from .models import BackupRecord

    records = list(BackupRecord.objects.filter(status='complete').order_by('-created_at'))
    to_remove = records[keep:]
    removed = []
    for rec in to_remove:
        path = BACKUP_DIR / rec.filename
        if path.exists():
            path.unlink()
        removed.append(rec.filename)
        rec.delete()
    return removed
