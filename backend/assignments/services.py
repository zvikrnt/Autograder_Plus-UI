import json
from pathlib import Path
from django.conf import settings

class ConfigGenerator:
    """
    Generates JSON configuration files for questions.
    Updated to use JSON for compatibility with Autograder_plus Ingestor.
    """
    # Define base directory for assignment data
    # Ideally should be configurable, defaulting to 'assignments_data' in project root
    BASE_DIR = Path(settings.BASE_DIR) / "assignments_data"

    @classmethod
    def get_config_dir(cls, question):
        """
        Get directory for a question's config based on creator and slug.
        Structure: assignments_data/{username}/{slug}/
        """
        if hasattr(question, 'created_by') and question.created_by:
            username = question.created_by.username
        else:
            username = "default_user"
            
        return cls.BASE_DIR / username / question.slug

    @classmethod
    def get_config_path(cls, question):
        return cls.get_config_dir(question) / "config.json"

    @classmethod
    def generate_question_config(cls, question):
        """
        Generates a config.json file for a given Question instance.
        """
        config_dir = cls.get_config_dir(question)
        config_dir.mkdir(parents=True, exist_ok=True)
        
        config_path = config_dir / "config.json"
        
        # Extract config details from the JSONField
        # Default to 'solution' if not specified (though frontend sends it)
        entry_point = question.config.get('entry_point', 'solution')
        timeout = question.config.get('timeout', 2.0)
        memory = question.config.get('memory', 128)
        
        # Prepare data structure for JSON
        # Autograder_plus expects: language, test_cases, execution_mode etc.
        data = {
            'title': question.title,
            'slug': question.slug,
            'language': 'python', # Defaulting to python for now, should be dynamic if multi-lang supported
            'execution_mode': {
                'type': 'program' if not entry_point or entry_point == 'solution' else 'function',
                'entry_point': entry_point
            },
            'limits': {
                'timeout_seconds': timeout,
                'memory_limit_mb': memory
            },
            'test_cases': question.test_cases
        }
        
        # Write to file
        with open(config_path, 'w') as f:
            json.dump(data, f, indent=4)
            
        # Write starter code boilerplate if none exists
        if not question.starter_code:
            if data['execution_mode']['type'] == 'function':
                # Create a boilerplate python function based on the entry_point name
                boilerplate = (
                    f"# Write your solution below\n"
                    f"# The function '{entry_point}' will be called with the test case inputs.\n"
                    f"def {entry_point}():\n"
                    f"    pass\n"
                )
            else:
                boilerplate = "# Write your solution below\n"
            
            question.starter_code = boilerplate
            question.save(update_fields=['starter_code'])

        return str(config_path)


class QuestionImportValidator:
    """
    Validates and processes JSON import data for bulk question creation.
    """

    REQUIRED_QUESTION_FIELDS = {'title', 'description', 'question_type', 'test_cases'}
    OPTIONAL_QUESTION_FIELDS = {'slug', 'difficulty', 'category', 'point_value',
                               'starter_code', 'reference_solution', 'entry_point', 'tags', 'config'}
    VALID_QUESTION_TYPES = {'coding', 'mcq'}
    VALID_DIFFICULTIES = {'Easy', 'Medium', 'Hard'}

    def __init__(self):
        self.errors = []
        self.warnings = []

    def validate(self, data):
        """
        Validate JSON import data.
        Returns tuple: (is_valid, validated_questions, errors)
        """
        self.errors = []
        self.warnings = []

        if not isinstance(data, dict):
            self.errors.append("Root data must be a JSON object")
            return False, [], self.errors

        if 'questions' not in data:
            self.errors.append("JSON must contain 'questions' key")
            return False, [], self.errors

        if not isinstance(data['questions'], list):
            self.errors.append("'questions' must be a list")
            return False, [], self.errors

        validated_questions = []

        for idx, question_data in enumerate(data['questions']):
            errors = self._validate_question(question_data, idx + 1)
            if errors:
                self.errors.extend(errors)
            else:
                validated_questions.append(question_data)

        is_valid = len(self.errors) == 0
        return is_valid, validated_questions, self.errors

    def _validate_question(self, question_data, question_num):
        """Validate a single question."""
        errors = []

        if not isinstance(question_data, dict):
            errors.append(f"Question #{question_num}: Must be an object")
            return errors

        # Check required fields
        missing_fields = self.REQUIRED_QUESTION_FIELDS - set(question_data.keys())
        if missing_fields:
            errors.append(f"Question #{question_num}: Missing required fields: {', '.join(missing_fields)}")
            return errors

        # Validate field types and values
        title = question_data.get('title')
        if not isinstance(title, str) or not title.strip():
            errors.append(f"Question #{question_num}: 'title' must be a non-empty string")

        description = question_data.get('description')
        if not isinstance(description, str) or not description.strip():
            errors.append(f"Question #{question_num}: 'description' must be a non-empty string")

        question_type = question_data.get('question_type')
        if question_type not in self.VALID_QUESTION_TYPES:
            errors.append(f"Question #{question_num}: 'question_type' must be 'coding' or 'mcq', got '{question_type}'")

        difficulty = question_data.get('difficulty')
        if difficulty and difficulty not in self.VALID_DIFFICULTIES:
            errors.append(f"Question #{question_num}: 'difficulty' must be Easy/Medium/Hard, got '{difficulty}'")

        # Validate test cases based on type
        test_cases = question_data.get('test_cases')
        if not isinstance(test_cases, list):
            errors.append(f"Question #{question_num}: 'test_cases' must be a list")
        elif len(test_cases) == 0:
            errors.append(f"Question #{question_num}: Must have at least one test case")
        else:
            tc_errors = self._validate_test_cases(test_cases, question_type, question_num)
            errors.extend(tc_errors)

        # For coding questions, check entry_point if provided
        if question_type == 'coding':
            entry_point = question_data.get('entry_point')
            if entry_point and not self._is_valid_identifier(entry_point):
                errors.append(f"Question #{question_num}: 'entry_point' must be a valid Python identifier, got '{entry_point}'")

        return errors

    def _validate_test_cases(self, test_cases, question_type, question_num):
        """Validate test cases based on question type."""
        errors = []

        if question_type == 'coding':
            for idx, tc in enumerate(test_cases):
                if not isinstance(tc, dict):
                    errors.append(f"Question #{question_num}, Test Case #{idx + 1}: Must be an object")
                    continue

                if 'input' not in tc or 'expected_output' not in tc:
                    errors.append(f"Question #{question_num}, Test Case #{idx + 1}: Must have 'input' and 'expected_output' fields")

                if 'input' in tc and not isinstance(tc['input'], str):
                    errors.append(f"Question #{question_num}, Test Case #{idx + 1}: 'input' must be a string")

                if 'expected_output' in tc and not isinstance(tc['expected_output'], str):
                    errors.append(f"Question #{question_num}, Test Case #{idx + 1}: 'expected_output' must be a string")

                if 'points' in tc and not isinstance(tc['points'], int):
                    errors.append(f"Question #{question_num}, Test Case #{idx + 1}: 'points' must be an integer")

                if 'is_hidden' in tc and not isinstance(tc['is_hidden'], bool):
                    errors.append(f"Question #{question_num}, Test Case #{idx + 1}: 'is_hidden' must be a boolean")

        elif question_type == 'mcq':
            tc = test_cases[0]
            if not isinstance(tc, dict):
                errors.append(f"Question #{question_num}: MCQ test_cases must be an object")
            elif 'correct_option' not in tc:
                errors.append(f"Question #{question_num}: MCQ test_cases must have 'correct_option' field")
            elif not isinstance(tc['correct_option'], int):
                errors.append(f"Question #{question_num}: 'correct_option' must be an integer")

        return errors

    def _is_valid_identifier(self, name):
        """Check if name is a valid Python identifier."""
        return name.isidentifier()
