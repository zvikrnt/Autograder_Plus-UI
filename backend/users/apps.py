from django.apps import AppConfig
from django.conf import settings


class UsersConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'users'

    def ready(self):
        """Auto-create the S3/MinIO bucket on startup if it doesn't exist
        and ensure objects are publicly readable."""
        try:
            import boto3
            from botocore.config import Config
            from botocore.exceptions import ClientError
            import json

            client = boto3.client(
                's3',
                endpoint_url=settings.AWS_S3_ENDPOINT_URL,
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                config=Config(signature_version='s3v4'),
                region_name='us-east-1',
            )
            try:
                client.head_bucket(Bucket=settings.AWS_STORAGE_BUCKET_NAME)
            except ClientError:
                client.create_bucket(Bucket=settings.AWS_STORAGE_BUCKET_NAME)

            # Set public read policy so avatar URLs are accessible without auth
            bucket_policy = {
                'Version': '2012-10-17',
                'Statement': [{
                    'Effect': 'Allow',
                    'Principal': '*',
                    'Action': 's3:GetObject',
                    'Resource': f'arn:aws:s3:::{settings.AWS_STORAGE_BUCKET_NAME}/*'
                }]
            }
            client.put_bucket_policy(
                Bucket=settings.AWS_STORAGE_BUCKET_NAME,
                Policy=json.dumps(bucket_policy)
            )
        except Exception:
            pass  # Storage not available — local dev without MinIO
