import json
import sys
from pathlib import Path
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils.text import slugify
from assignments.models import Question
from assignments.services import ConfigGenerator, QuestionImportValidator
from gamification.models import PracticeQuestionLibrary
import uuid

User = get_user_model()


class Command(BaseCommand):
    help = 'Import questions from a JSON file with test cases'

    def add_arguments(self, parser):
        parser.add_argument('--file', type=str, required=True, help='Path to the JSON file to import')
        parser.add_argument('--user', type=str, required=True, help='Email or username of the teacher creating the questions')

    def handle(self, *args, **options):
        file_path = options['file']
        user_identifier = options['user']

        # Validate file exists
        if not Path(file_path).exists():
            raise CommandError(f'File not found: {file_path}')

        # Get user
        try:
            user = User.objects.get(Q(username=user_identifier) | Q(email=user_identifier))
        except User.DoesNotExist:
            raise CommandError(f'User not found: {user_identifier}')
        except User.MultipleObjectsReturned:
            raise CommandError(f'Multiple users matched: {user_identifier}')

        # Load JSON
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
        except json.JSONDecodeError as e:
            raise CommandError(f'Invalid JSON file: {str(e)}')
        except Exception as e:
            raise CommandError(f'Error reading file: {str(e)}')

        # Validate
        validator = QuestionImportValidator()
        is_valid, validated_questions, errors = validator.validate(data)

        if not is_valid:
            self.stdout.write(self.style.ERROR('Validation failed:'))
            for error in errors:
                self.stdout.write(self.style.ERROR(f'  - {error}'))
            raise CommandError('Import aborted due to validation errors')

        # Import questions
        created_count = 0
        test_case_count = 0
        skipped = []

        for question_data in validated_questions:
            try:
                question = self._create_question(question_data, user)
                test_case_count += len(question.test_cases)
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f'✓ Created: {question.title} ({question.slug})'))
            except Exception as e:
                skipped.append({'title': question_data.get('title', 'Unknown'), 'error': str(e)})
                self.stdout.write(self.style.WARNING(f'⚠ Skipped: {question_data.get("title", "Unknown")} - {str(e)}'))

        # Summary
        self.stdout.write('\n' + '=' * 60)
        self.stdout.write(self.style.SUCCESS(f'Import Complete!'))
        self.stdout.write(f'Created: {created_count} questions')
        self.stdout.write(f'Test Cases: {test_case_count}')
        if skipped:
            self.stdout.write(self.style.WARNING(f'Skipped: {len(skipped)} questions'))
            for item in skipped:
                self.stdout.write(f'  - {item["title"]}: {item["error"]}')

    def _create_question(self, question_data, user):
        """Create a question from validated data."""
        # Generate slug if not provided
        slug = question_data.get('slug')
        if not slug:
            base_slug = slugify(question_data['title'])
            if not base_slug:
                base_slug = 'question'
            base_slug = base_slug[:40]
            slug = f"{base_slug}-{str(uuid.uuid4())[:8]}"

        # Check for duplicate slug
        if Question.objects.filter(slug=slug).exists():
            raise Exception(f'Slug "{slug}" already exists')

        # Prepare config
        config = question_data.get('config', {})
        if question_data['question_type'] == 'coding' and 'entry_point' in question_data:
            config['entry_point'] = question_data['entry_point']

        # Create question
        question = Question.objects.create(
            title=question_data['title'],
            slug=slug,
            description=question_data['description'],
            question_type=question_data['question_type'],
            test_cases=question_data['test_cases'],
            difficulty=question_data.get('difficulty', 'Medium'),
            category=question_data.get('category', 'General'),
            point_value=question_data.get('point_value', 100),
            starter_code=question_data.get('starter_code', ''),
            reference_solution=question_data.get('reference_solution', ''),
            tags=question_data.get('tags', []),
            config=config,
            created_by=user
        )

        # Generate config file
        try:
            ConfigGenerator.generate_question_config(question)
        except Exception as e:
            print(f'Warning: Failed to generate config for {question.slug}: {str(e)}')

        # Add to Practice Question Library
        try:
            PracticeQuestionLibrary.objects.get_or_create(
                question=question,
                defaults={
                    'is_public': True,
                    'tags': question.tags
                }
            )
        except Exception as e:
            print(f'Warning: Failed to add {question.slug} to Practice Library: {str(e)}')

        return question
