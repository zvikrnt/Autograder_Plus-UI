"""System health checks for the admin portal. Every check is wrapped so one
failing dependency (e.g. Docker being unreachable) can't 500 the whole
overview — each returns {'ok': bool, 'detail': str}."""
import shutil
from datetime import timedelta

from django.conf import settings
from django.db import connection
from django.utils import timezone


def _check(fn):
    try:
        return fn()
    except Exception as e:
        return {'ok': False, 'detail': str(e)}


def check_database():
    def _run():
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
        return {'ok': True, 'detail': 'reachable'}
    return _check(_run)


def check_redis():
    def _run():
        from django_redis import get_redis_connection
        conn = get_redis_connection('default')
        conn.ping()
        return {'ok': True, 'detail': 'reachable'}
    return _check(_run)


def check_minio():
    def _run():
        import boto3
        client = boto3.client(
            's3',
            endpoint_url=settings.AWS_S3_ENDPOINT_URL,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        )
        client.head_bucket(Bucket=settings.AWS_STORAGE_BUCKET_NAME)
        return {'ok': True, 'detail': 'reachable'}
    return _check(_run)


def check_docker():
    def _run():
        import docker
        client = docker.from_env()
        client.ping()
        return {'ok': True, 'detail': 'reachable (grading containers can be launched)'}
    return _check(_run)


def check_celery():
    def _run():
        from autograder.celery import app
        replies = app.control.ping(timeout=1.0)
        if not replies:
            return {'ok': False, 'detail': 'no workers responded'}
        return {'ok': True, 'detail': f'{len(replies)} worker(s) responding'}
    return _check(_run)


def check_stuck_submissions():
    def _run():
        from submissions.models import SubmissionAttempt
        cutoff = timezone.now() - timedelta(minutes=10)
        count = SubmissionAttempt.objects.filter(status='processing', created_at__lt=cutoff).count()
        return {'ok': count == 0, 'detail': f'{count} submission(s) stuck in "processing" > 10 min'}
    return _check(_run)


def check_disk():
    def _run():
        total, used, free = shutil.disk_usage(settings.BASE_DIR)
        pct_used = round(used / total * 100, 1)
        return {
            'ok': pct_used < 90,
            'detail': f'{pct_used}% used ({free // (1024**3)}GB free of {total // (1024**3)}GB)',
        }
    return _check(_run)


def get_system_health():
    return {
        'database': check_database(),
        'redis': check_redis(),
        'minio': check_minio(),
        'docker': check_docker(),
        'celery': check_celery(),
        'stuck_submissions': check_stuck_submissions(),
        'disk': check_disk(),
    }
