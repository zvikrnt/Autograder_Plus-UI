"""
Repair adaptive-question starter code so the function SIGNATURE (parameter names)
is shown to students.

Many imported questions (esp. MBPP) had a param-less stub `def name():` while the
real solution takes arguments, e.g. `def sample_nam(sample_names):`. Students then
don't know which parameters to accept or how the example input maps to arguments.

This command rewrites `starter_code` to the reference solution's signature with an
empty body, for any question where the reference has parameters the starter lacks.
It also mirrors the fix into the linked practice-bank Question rows.

Usage:
    python manage.py fix_adaptive_starters            # apply
    python manage.py fix_adaptive_starters --dry-run  # preview counts only
"""
import re

from django.core.management.base import BaseCommand
from adaptive.models import AdaptiveQuestion


def _signature_starter(entry_point, reference_solution):
    """Return a starter stub carrying the reference solution's full signature,
    or None if we can't confidently extract it."""
    if not entry_point or not reference_solution:
        return None
    # Match `def <entry>(<params>) [-> ret]:` (indented or not; class methods too).
    m = re.search(
        r'^([ \t]*)def\s+' + re.escape(entry_point) + r'\s*\(([^)]*)\)\s*(->[^:]+)?:',
        reference_solution,
        re.MULTILINE,
    )
    if not m:
        return None
    indent, params, ret = m.group(1), m.group(2).strip(), (m.group(3) or '').rstrip()
    # Drop a leading `self,`/`self` for class-method solutions turned into plain stubs
    # only when there is NO class wrapper (LeetCode keeps its class starter as-is).
    sig = f"def {entry_point}({params}){(' ' + ret) if ret else ''}:"
    return f"{sig}\n    # write your solution\n    pass"


class Command(BaseCommand):
    help = "Rewrite adaptive starter code to expose the function signature."

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **opts):
        dry = opts['dry_run']
        fixed = skipped = 0

        for q in AdaptiveQuestion.objects.all():
            # LeetCode questions already carry a proper class/def signature.
            if 'class Solution' in (q.starter_code or ''):
                skipped += 1
                continue

            starter = q.starter_code or ''
            sm = re.search(r'def\s+\w+\s*\(([^)]*)\)', starter)
            starter_params = (sm.group(1).strip() if sm else '')

            rm = re.search(
                r'def\s+' + re.escape(q.entry_point or '') + r'\s*\(([^)]*)\)',
                q.reference_solution or '',
            )
            ref_params = (rm.group(1).strip() if rm else '')

            # Only repair when the reference has params the starter is missing.
            if ref_params and not starter_params:
                new_starter = _signature_starter(q.entry_point, q.reference_solution)
                if new_starter and new_starter != starter:
                    if not dry:
                        q.starter_code = new_starter
                        q.save(update_fields=['starter_code'])
                        self._mirror_practice(q, new_starter)
                    fixed += 1
                    continue
            skipped += 1

        verb = "Would fix" if dry else "Fixed"
        self.stdout.write(self.style.SUCCESS(
            f"{verb} {fixed} starter stubs ({skipped} left unchanged)."
        ))

    def _mirror_practice(self, adaptive_q, new_starter):
        """Keep the mirrored practice-bank Question's starter in sync."""
        try:
            from assignments.models import Question
            base = (adaptive_q.slug or '')[:40].rstrip('-')
            practice_slug = f"{base}-{str(adaptive_q.id)[:8]}"[:50]
            Question.objects.filter(slug=practice_slug).update(starter_code=new_starter)
        except Exception:
            pass
