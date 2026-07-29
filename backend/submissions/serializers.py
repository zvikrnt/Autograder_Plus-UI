from rest_framework import serializers
from .models import SubmissionAttempt, AssignmentProgress, TestResult, GradebookEntry
from assignments.serializers import AssignmentQuestionSerializer
from users.serializers import UserSerializer


class TestResultSerializer(serializers.ModelSerializer):
    expected_output = serializers.SerializerMethodField()

    class Meta:
        model = TestResult
        fields = ['id', 'test_case_id', 'status', 'score', 'actual_output', 'error_message', 'expected_output']

    def get_expected_output(self, obj):
        try:
            # Look up the original expected output from the question's test cases
            test_cases = obj.attempt.assignment_question.question.test_cases
            if not test_cases:
                return None
            
            tc_id = str(obj.test_case_id)
            # Old format: test_case_id is just numerical index '0', '1', ...
            if tc_id.isdigit():
                idx = int(tc_id)
                if 0 <= idx < len(test_cases):
                    return str(test_cases[idx].get('expected_output', ''))
            
            # New format: test_case_id matches the 'id' field in the config JSON
            for tc in test_cases:
                if str(tc.get('id', '')) == tc_id:
                    return str(tc.get('expected_output', ''))
                    
            # Fallback if the id was slightly off but we have index
            if str(tc_id).startswith("tc_"):
                idx_str = tc_id.split("_")[1]
                if idx_str.isdigit():
                    idx = int(idx_str) - 1
                    if 0 <= idx < len(test_cases):
                         return str(test_cases[idx].get('expected_output', ''))

        except Exception:
            pass
        return None


class SubmissionAttemptSerializer(serializers.ModelSerializer):
    assignment_question = AssignmentQuestionSerializer(read_only=True)
    student = UserSerializer(read_only=True)
    test_results = TestResultSerializer(many=True, read_only=True)
    
    # Flattened/Convenience fields for frontend
    question = serializers.SerializerMethodField()
    final_score = serializers.SerializerMethodField()
    is_graded = serializers.SerializerMethodField()
    feedback_tags = serializers.SerializerMethodField()
    assignment_id = serializers.UUIDField(source='assignment_question.assignment.id', read_only=True)
    assignment_title = serializers.CharField(source='assignment_question.assignment.title', read_only=True)
    code_content = serializers.CharField(source='source_code', read_only=True)
    time_spent = serializers.SerializerMethodField()

    class Meta:
        model = SubmissionAttempt
        fields = ['id', 'assignment_question', 'question', 'attempt_number', 'status', 
                  'test_results', 'created_at', 'student', 'final_score', 'is_graded', 
                  'feedback_tags', 'assignment_id', 'assignment_title', 'manual_score', 'feedback_text', 
                  'code_content', 'time_spent', 'ai_analysis_data']

    def get_question(self, obj):
        from assignments.serializers import QuestionSerializer
        return QuestionSerializer(obj.assignment_question.question).data

    def get_final_score(self, obj):
        # Manual override is stored as percentage (0-100).
        if obj.manual_score is not None:
            return round(max(0.0, min(100.0, obj.manual_score)), 1)

        # Fallback: Calculate score based on passed test cases
        results = obj.test_results.all()
        if not results:
            return 0
        
        passed = sum(1 for r in results if r.status == 'pass')
        total = len(results)
        
        if total == 0:
            return 0
            
        return round((passed / total) * 100)

    def get_time_spent(self, obj):
        # Use cached progress lookup to avoid N+1 queries
        if not hasattr(self, '_progress_cache'):
            # Bulk-fetch all AssignmentProgress for this assignment in one query
            assignment_id = obj.assignment_question.assignment_id
            progress_qs = AssignmentProgress.objects.filter(
                assignment_question__assignment_id=assignment_id
            ).values_list('assignment_question_id', 'student_id', 'time_spent')
            self._progress_cache = {
                (aq_id, student_id): time_spent
                for aq_id, student_id, time_spent in progress_qs
            }
        
        key = (obj.assignment_question_id, obj.student_id)
        time_spent = self._progress_cache.get(key, 0)
        if time_spent:
            return round(time_spent / 60, 1)  # Convert seconds → minutes
        return 0

    def get_is_graded(self, obj):
        return obj.status in ['success', 'fail']

    def get_feedback_tags(self, obj):
        """Extract 1-2 word tags from feedback_text for the word cloud."""
        if not obj.feedback_text:
            return ""
        
        import re
        # Strip <output> XML tags
        text = re.sub(r'</?output>', '', obj.feedback_text).strip().lower()
        if not text:
            return ""
        
        # Curated 1-2 word tags with tight keyword patterns
        tag_patterns = {
            'list comprehension': ['list comprehension'],
            'nested loops': ['nested loop', 'nested for', 'nested while'],
            'loop efficiency': ['loop efficiency', 'unnecessary iteration', 'loop optimization'],
            'variable naming': ['variable name', 'naming convention', 'descriptive name', 'descriptive variable'],
            'edge cases': ['edge case', 'boundary', 'corner case'],
            'error handling': ['error handling', 'try except', 'exception handling'],
            'efficiency': ['efficient', 'efficiency', 'time complexity', 'more efficiently'],
            'recursion': ['recursion', 'recursive'],
            'string slicing': ['string slicing', 'string manipulation'],
            'conditional logic': ['conditional statement', 'if-elif', 'if statement', 'conditional expression'],
            'data structures': ['data structure', 'dictionary comprehension', 'set comprehension'],
            'modular design': ['modular', 'reusable function', 'break down'],
            'input validation': ['input validation', 'validate input', 'sanitize'],
            'code style': ['pep8', 'formatting', 'code style', 'indentation error'],
            'documentation': ['docstring', 'documentation', 'add comment'],
            'logic error': ['logic error', 'incorrect output', 'wrong answer'],
            'append method': ['append method', 'append correctly', "append'"],
            'indexing': ['list indexing', 'index error', 'indexing'],
            'simplification': ['simplif', 'redundant', 'unnecessary'],
        }
        
        found_tags = []
        for tag, keywords in tag_patterns.items():
            if any(kw in text for kw in keywords):
                found_tags.append(tag)
        
        if not found_tags:
            found_tags = ['general feedback'] if obj.status == 'success' else ['needs review']
        
        return ','.join(found_tags)


class TestResultMinimalSerializer(serializers.ModelSerializer):
    """Minimal test result — only status and ID for analytics."""
    class Meta:
        model = TestResult
        fields = ['test_case_id', 'status', 'error_message', 'execution_time_ms']


class SubmissionAnalyticsSerializer(serializers.ModelSerializer):
    """Lightweight serializer for analytics — strips source code, descriptions, etc.
    Reduces response from ~3.78MB to ~200KB for 1,397 submissions."""
    
    student_id = serializers.UUIDField(source='student.id', read_only=True)
    student_username = serializers.CharField(source='student.username', read_only=True)
    question_id = serializers.UUIDField(source='assignment_question.question.id', read_only=True)
    final_score = serializers.SerializerMethodField()
    time_spent = serializers.SerializerMethodField()
    feedback_tags = serializers.SerializerMethodField()
    test_results = TestResultMinimalSerializer(many=True, read_only=True)

    class Meta:
        model = SubmissionAttempt
        fields = ['id', 'student_id', 'student_username', 'question_id', 
                  'status', 'final_score', 'time_spent', 'feedback_tags', 'test_results']

    def get_final_score(self, obj):
        if obj.manual_score is not None:
            return round(max(0.0, min(100.0, obj.manual_score)), 1)
        
        # Iterate already-prefetched test_results (in memory, no extra DB query)
        results = list(obj.test_results.all())
        if not results:
            return 0
        passed = sum(1 for r in results if r.status == 'pass')
        return round((passed / len(results)) * 100)

    def get_time_spent(self, obj):
        if not hasattr(self, '_progress_cache'):
            assignment_id = obj.assignment_question.assignment_id
            progress_qs = AssignmentProgress.objects.filter(
                assignment_question__assignment_id=assignment_id
            ).values_list('assignment_question_id', 'student_id', 'time_spent')
            self._progress_cache = {
                (aq_id, student_id): time_spent
                for aq_id, student_id, time_spent in progress_qs
            }
        key = (obj.assignment_question_id, obj.student_id)
        time_spent = self._progress_cache.get(key, 0)
        if time_spent:
            return round(time_spent / 60, 1)
        return 0

    def get_feedback_tags(self, obj):
        if not obj.feedback_text:
            return ""
        import re
        text = re.sub(r'</?output>', '', obj.feedback_text).strip().lower()
        if not text:
            return ""
        tag_patterns = {
            'list comprehension': ['list comprehension'],
            'nested loops': ['nested loop', 'nested for', 'nested while'],
            'loop efficiency': ['loop efficiency', 'unnecessary iteration', 'loop optimization'],
            'variable naming': ['variable name', 'naming convention', 'descriptive name', 'descriptive variable'],
            'edge cases': ['edge case', 'boundary', 'corner case'],
            'error handling': ['error handling', 'try except', 'exception handling'],
            'efficiency': ['efficient', 'efficiency', 'time complexity', 'more efficiently'],
            'recursion': ['recursion', 'recursive'],
            'string slicing': ['string slicing', 'string manipulation'],
            'conditional logic': ['conditional statement', 'if-elif', 'if statement', 'conditional expression'],
            'data structures': ['data structure', 'dictionary comprehension', 'set comprehension'],
            'modular design': ['modular', 'reusable function', 'break down'],
            'input validation': ['input validation', 'validate input', 'sanitize'],
            'code style': ['pep8', 'formatting', 'code style', 'indentation error'],
            'documentation': ['docstring', 'documentation', 'add comment'],
            'logic error': ['logic error', 'incorrect output', 'wrong answer'],
            'append method': ['append method', 'append correctly', "append'"],
            'indexing': ['list indexing', 'index error', 'indexing'],
            'simplification': ['simplif', 'redundant', 'unnecessary'],
        }
        found_tags = []
        for tag, keywords in tag_patterns.items():
            if any(kw in text for kw in keywords):
                found_tags.append(tag)
        # Add detected_keywords from AST analysis
        if hasattr(obj, 'detected_keywords') and obj.detected_keywords:
            for kw in obj.detected_keywords:
                if kw not in found_tags:
                    found_tags.append(kw)

        if not found_tags:
            found_tags = ['general feedback'] if obj.status == 'success' else ['needs review']
            
        # Merge with AI Analysis Tags
        if obj.ai_analysis_data:
            ai_tags = obj.ai_analysis_data.get('tags', [])
            # Simple deduplication
            for t in ai_tags:
                if t.lower() not in found_tags:
                    found_tags.append(t.lower())
                    
        return ','.join(found_tags)


class AssignmentProgressSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssignmentProgress
        fields = ['assignment_question', 'current_code', 'time_spent', 'last_updated']


class GradebookEntrySerializer(serializers.ModelSerializer):
    """Serializer for gradebook entries including points information"""
    student = UserSerializer(read_only=True)
    content_item_title = serializers.CharField(source='content_item.title', read_only=True)
    content_item_type = serializers.CharField(source='content_item.type', read_only=True)
    content_item_mode = serializers.SerializerMethodField()
    
    class Meta:
        model = GradebookEntry
        fields = ['id', 'student', 'content_item', 'content_item_title', 'content_item_type', 'content_item_mode',
                  'final_score', 'points_earned', 'status', 'updated_at']
    
    def get_content_item_mode(self, obj):
        """Get mode if it's an Assignment, otherwise None"""
        if hasattr(obj.content_item, 'assignment'):
            return getattr(obj.content_item.assignment, 'mode', None)
        return None
