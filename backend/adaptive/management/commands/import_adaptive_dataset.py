"""
Import merged adaptive-practice questions (from mars/build_dataset.py output)
into the AdaptiveQuestion bank.

Usage:
    python manage.py import_adaptive_dataset --file ../mars/adaptive_dataset.json
    python manage.py import_adaptive_dataset --file ../mars/adaptive_dataset.json --limit 300
    python manage.py import_adaptive_dataset --file my_questions.json --clear
"""
import ast
import json
import re
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from adaptive.models import AdaptiveQuestion

DIFFICULTY_REF_TIME = {"Easy": 120.0, "Medium": 240.0, "Hard": 420.0}

# A call expression like  add(2, 3)  or  f(nums = [3,3], target = 6)
_CALL_RE = re.compile(r"^\s*[A-Za-z_][\w.]*\s*\((.*)\)\s*$", re.DOTALL)


def _normalize_input(raw):
    """
    The batch runner parses each LINE of `input` as one argument (JSON / ast /
    `key = value`). Dataset inputs are often full call expressions like
    `add(2, 3)` or `f(nums = [3,3], target = 6)`. Convert those to one argument
    per line so the runner binds them positionally. If we can't parse, return
    the raw string unchanged (already stdin-style datasets still work).
    """
    if not isinstance(raw, str):
        return raw
    s = raw.strip()
    m = _CALL_RE.match(s)
    inner = m.group(1) if m else s
    if not inner.strip():
        return raw

    # Parse the argument list robustly using the AST of a fake call.
    try:
        call = ast.parse(f"__f__({inner})", mode="eval").body
        if not isinstance(call, ast.Call):
            return raw
        parts = []
        for arg in call.args:
            parts.append(ast.get_source_segment(f"__f__({inner})", arg) or "")
        for kw in call.keywords:
            seg = ast.get_source_segment(f"__f__({inner})", kw.value) or ""
            parts.append(seg)
        parts = [p.strip() for p in parts if p and p.strip()]
        if parts:
            return "\n".join(parts)
    except (SyntaxError, ValueError):
        pass
    return raw


class Command(BaseCommand):
    help = "Import adaptive questions from a merged dataset JSON file."

    def add_arguments(self, parser):
        parser.add_argument('--file', required=True, help='Path to the dataset JSON')
        parser.add_argument('--limit', type=int, default=None, help='Import at most N questions')
        parser.add_argument('--clear', action='store_true', help='Delete existing adaptive questions first')
        parser.add_argument('--to-practice', action='store_true',
                            help='Also mirror into the main Question bank + Practice Library')

    def handle(self, *args, **opts):
        path = Path(opts['file'])
        if not path.exists():
            raise CommandError(f"File not found: {path}")

        data = json.loads(path.read_text(encoding='utf-8'))
        questions = data.get('questions', data if isinstance(data, list) else [])
        if not questions:
            raise CommandError("No questions found in file (expected {'questions': [...]}).")

        if opts['clear']:
            n = AdaptiveQuestion.objects.count()
            AdaptiveQuestion.objects.all().delete()
            self.stdout.write(self.style.WARNING(f"Cleared {n} existing adaptive questions."))

        limit = opts['limit']
        created = updated = skipped = 0

        for i, q in enumerate(questions):
            if limit and created + updated >= limit:
                break
            slug = q.get('slug')
            if not slug:
                skipped += 1
                continue
            if not q.get('test_cases'):
                skipped += 1
                continue

            difficulty = q.get('difficulty', 'Medium')
            if difficulty not in ('Easy', 'Medium', 'Hard'):
                difficulty = 'Medium'
            # elo_rating: prefer explicit, else derive from difficulty.
            elo = q.get('elo_rating')
            if elo is None:
                elo = {'Easy': 1300, 'Medium': 1700, 'Hard': 2200}[difficulty]

            # Cap to at most 10 test cases per question (keep visible ones first)
            # and normalize call-expression inputs → one-arg-per-line for the runner.
            all_cases = q.get('test_cases', []) or []
            for tc in all_cases:
                tc['input'] = _normalize_input(tc.get('input', ''))
            visible = [tc for tc in all_cases if not tc.get('is_hidden')]
            hidden = [tc for tc in all_cases if tc.get('is_hidden')]
            capped = (visible + hidden)[:10]

            defaults = dict(
                title=q.get('title', slug)[:255],
                description=q.get('description', ''),
                difficulty=difficulty,
                tags=q.get('tags', []) or [],
                language=q.get('language', 'python'),
                entry_point=q.get('entry_point', 'solution') or 'solution',
                starter_code=q.get('starter_code', ''),
                reference_solution=q.get('reference_solution', ''),
                test_cases=capped,
                elo_rating=float(elo),
                ref_time_sec=float(q.get('ref_time_sec') or DIFFICULTY_REF_TIME.get(difficulty, 180.0)),
                source=q.get('source', 'import'),
                is_active=True,
            )
            obj, was_created = AdaptiveQuestion.objects.update_or_create(
                slug=slug, defaults=defaults
            )
            created += int(was_created)
            updated += int(not was_created)

        practice_note = ""
        if opts['to_practice']:
            n_practice = self._mirror_to_practice(limit=limit)
            practice_note = f" Mirrored {n_practice} into the main practice bank."

        self.stdout.write(self.style.SUCCESS(
            f"Import complete: {created} created, {updated} updated, {skipped} skipped. "
            f"Total in bank: {AdaptiveQuestion.objects.count()}.{practice_note}"
        ))

    def _mirror_to_practice(self, limit=None):
        """Create/refresh Question + PracticeQuestionLibrary rows for adaptive
        questions so they also appear in the main practice question bank."""
        from django.contrib.auth import get_user_model
        from assignments.models import Question
        from gamification.models import PracticeQuestionLibrary

        User = get_user_model()
        author = (User.objects.filter(role='admin').first()
                  or User.objects.filter(role='teacher').first()
                  or User.objects.first())
        if not author:
            self.stdout.write(self.style.WARNING("No user to own practice questions — skipping mirror."))
            return 0

        count = 0
        qs = AdaptiveQuestion.objects.all()
        if limit:
            qs = qs[:limit]
        for aq in qs:
            # Question.slug is max_length=50; adaptive slugs can be longer, so
            # truncate but keep uniqueness with a short suffix of the UUID.
            base = aq.slug[:40].rstrip('-')
            practice_slug = f"{base}-{str(aq.id)[:8]}"[:50]
            question, _ = Question.objects.update_or_create(
                slug=practice_slug,
                defaults=dict(
                    title=aq.title,
                    description=aq.description,
                    question_type='coding',
                    test_cases=aq.test_cases,
                    tags=aq.tags,
                    difficulty=aq.difficulty,
                    category='Adaptive',
                    point_value=100,
                    starter_code=aq.starter_code,
                    reference_solution=aq.reference_solution,
                    is_active=True,
                    config={
                        'language': aq.language,
                        'entry_point': aq.entry_point or 'solution',
                        'execution_mode': {
                            'type': 'function' if aq.entry_point and aq.entry_point != 'solution' else 'program',
                            'entry_point': aq.entry_point or 'solution',
                        },
                        'timeout': 5,
                        'elo_rating': aq.elo_rating,
                    },
                    created_by=author,
                ),
            )
            PracticeQuestionLibrary.objects.get_or_create(
                question=question,
                defaults={'is_public': True, 'tags': aq.tags},
            )
            count += 1
        return count
