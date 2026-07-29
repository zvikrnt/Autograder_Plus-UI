import ast
import logging
import tempfile
import os
import json
import time
from pathlib import Path
from django.conf import settings

# Model imports
from assignments.models import AssignmentQuestion, ContentItem
from submissions.models import SubmissionAttempt, GradebookEntry
from gamification.points_calculator import PointsCalculator

class SubmissionConfigGenerator:
    """
    Generates configuration and source files for student submissions.
    Structure: media/classes/{class_id}/assignments/{assignment_id}/questions/{question_slug}/submissions/{student_username}/{attempt_id}/
    """

    @classmethod
    def get_submission_dir(cls, attempt):
        student_username = attempt.student.username
        assignment = attempt.assignment_question.assignment
        from django.utils.text import slugify
        
        # Handle cases where assignment might not be linked to a class module yet
        if assignment.module and assignment.module.class_obj:
            class_obj = assignment.module.class_obj
            class_slug = f"{slugify(class_obj.name)}-{str(class_obj.id)[:8]}"
        else:
            class_slug = "unassigned"
            
        assignment_slug = f"{slugify(assignment.title)}-{str(assignment.id)[:8]}"
        question_slug = attempt.assignment_question.question.slug
        attempt_id = str(attempt.id)
        
        return Path(settings.MEDIA_ROOT) / "classes" / class_slug / "assignments" / assignment_slug / "questions" / question_slug / "submissions" / student_username / attempt_id

    @classmethod
    def save_artifacts(cls, attempt, language='python'):
        submission_dir = cls.get_submission_dir(attempt)
        submission_dir.mkdir(parents=True, exist_ok=True)
        
        # Extension
        ext_map = {'python': '.py', 'c': '.c', 'java': '.java'}
        ext = ext_map.get(language, '.txt')
        
        code_path = submission_dir / f"submission{ext}"
        with open(code_path, 'w') as f:
            f.write(attempt.source_code)
            
        # 2. Save Config Snapshot
        config_path = submission_dir / "config.json"
        
        # Get original config
        question_config = attempt.assignment_question.question.config or {}
        
        # Merge with submission metadata
        submission_config = {
            'meta': {
                'student': attempt.student.username,
                'attempt_id': str(attempt.id),
                'timestamp': str(attempt.created_at),
                'status': attempt.status,
                'language': language
            },
            'question_config': question_config
        }
        
        with open(config_path, 'w') as f:
            json.dump(submission_config, f, indent=4)
            
        return str(submission_dir)


logger = logging.getLogger(__name__)

def execute_code(code, language, test_cases, config=None):
    """
    Execute code against test cases using a custom implementation based on Dynamic Analyzer.
    Supports Python, C, and Java with Docker-based execution.
    """
    # Validate language support
    supported_languages = ['python', 'c', 'java']
    language = language.lower()
    
    if language not in supported_languages:
        return [{
            'status': 'error',
            'error_message': f'Unsupported language: {language}. Supported languages: {", ".join(supported_languages)}',
            'console_output': '',
            'execution_time': 0,
            'test_case': {}
        }]
    
    if not code or not code.strip():
        return [{
            'status': 'error',
            'error_message': 'Code cannot be empty',
            'console_output': '',
            'execution_time': 0,
            'test_case': {}
        }]
    
    # Create temporary file for code
    try:
        with tempfile.NamedTemporaryFile(mode='w', suffix=_get_file_extension(language), delete=False) as temp_file:
            temp_file.write(code)
            temp_file_path = temp_file.name
        
        # Use our custom executor that captures all outputs
        results = _execute_with_output_capture(temp_file_path, language, test_cases, config)
        return results


    except Exception as e:
        logger.error(f"Code execution failed: {e}")
        return [{
            'status': 'error',
            'error_message': f'Execution failed: {str(e)}',
            'console_output': '',
            'execution_time': 0,
            'test_case': {}
        }]
    
    finally:
        # Clean up temporary file
        try:
            if 'temp_file_path' in locals():
                os.unlink(temp_file_path)
        except Exception as e:
            logger.warning(f"Failed to clean up temporary file: {e}")

def _execute_with_output_capture(code_path, language, test_cases, config=None):
    """Execute code and capture outputs for all test cases"""
    from dynamic_analyzer import DynamicAnalyzer
    import docker
    import json
    import tarfile
    import io
    
    # For Python, ensure config is initialized
    if config is None:
        config = {}

    # For Python, try to detect entry point if missing
    if language == 'python' and not config.get('entry_point'):
        try:
            detected = _detect_python_entry_point(code_path)
            if detected:
                logger.info(f"Auto-detected entry point: {detected}")
                config['entry_point'] = detected
        except Exception as e:
            logger.warning(f"Entry point detection failed: {e}")

    # If entry_point exists, DynamicAnalyzer will use Batch Mode automatically
    # otherwise it will use simple mode
    
    # Initialize analyzer for Docker-based execution
    analyzer = DynamicAnalyzer()
    
    if not analyzer.client:
        return [{
            'status': 'error',
            'console_output': '',
            'error_message': 'Docker unavailable',
            'execution_time': 0,
            'test_case': test_case
        } for test_case in test_cases]
    
    results = []
    
    try:
        if language == 'python':
            results = _execute_python_with_output(analyzer, code_path, test_cases, config)
        elif language == 'c':
            results = _execute_c_with_output(analyzer, code_path, test_cases)
        elif language == 'java':
            results = _execute_java_with_output(analyzer, code_path, test_cases)
        else:
            raise ValueError(f"Unsupported language: {language}")
            
    except Exception as e:
        logger.error(f"Execution failed for {language}: {e}")
        results = [{
            'status': 'error',
            'console_output': '',
            'error_message': str(e),
            'execution_time': 0,
            'test_case': test_case
        } for test_case in test_cases]
    
    return results

def _execute_python_with_output(analyzer, code_path, test_cases, config=None):
    """Execute Python code and capture all outputs"""
    results = []
    
    # check for batch mode capability
    entry_point = config.get('entry_point') if config else None
    
    if entry_point:
        # Use new Batch Runner
        try:
            batch_results = analyzer._run_python_batch_tests(
                Path(code_path), 
                entry_point, 
                test_cases,
                config=config
            )
            
            # Map batch results to unexpected format
            for i, res in enumerate(batch_results):
                 # res format: {'name':..., 'status':..., 'actual':..., 'error':..., 'execution_time':...}
                 # We need to add comparison logic here because batch runner returns 'actual'
                 # It converts 'run_success' to 'pass'/'fail' based on comparison.
                 
                 tc_data = test_cases[i] if i < len(test_cases) else {}
                 
                 status = res.get('status')
                 actual = res.get('actual', '')
                 err_msg = res.get('error_message', res.get('error', ''))
                 duration = res.get('duration', res.get('execution_time', 0))
                 
                 if status == 'run_success':
                     # We need to compare actual vs expected
                     expected = str(tc_data.get('expected_output', '')).strip()
                     actual_norm = analyzer._normalize_output(actual)
                     expected_norm = analyzer._normalize_output(expected)
                     
                     if analyzer._compare_outputs(actual_norm, expected_norm):
                         status = 'pass'
                     else:
                         status = 'fail'
                         
                 results.append({
                    'status': status,
                    'console_output': actual,
                    'error_message': err_msg,
                    'execution_time': duration,
                    'test_case': tc_data
                })
            return results
            
        except Exception as e:
            logger.error(f"Batch execution error: {e}")
            # Fallthrough to simple execution? No, distinct failure.
            return [{
                'status': 'error',
                'console_output': '',
                'error_message': f"Batch execution failed: {str(e)}",
                'execution_time': 0,
                'test_case': tc
            } for tc in test_cases]

    # Fallback to analyzer method (Loop Mode)
    for i, test_case in enumerate(test_cases):
        try:
            input_str = str(test_case.get('input', ''))
            expected = str(test_case.get('expected_output', '')).strip()
            
            # Run the test case
            ec, out, err, duration = analyzer._run_python_test_case(
                Path(code_path), 
                {'type': 'program'}, 
                input_str
            )
            
            if ec is None:
                status = 'timeout'
                console_output = ''
                error_message = err or 'Execution timed out'
            elif ec != 0:
                status = 'runtime_error'
                console_output = out
                error_message = err or 'Runtime error'
            else:
                # Compare outputs
                actual_norm = analyzer._normalize_output(out)
                expected_norm = analyzer._normalize_output(expected)
                
                if analyzer._compare_outputs(actual_norm, expected_norm):
                    status = 'pass'
                else:
                    status = 'fail'
                
                console_output = out
                error_message = ''
            
            results.append({
                'status': status,
                'console_output': console_output,
                'error_message': error_message,
                'execution_time': duration,
                'test_case': test_case
            })
            
        except Exception as e:
            results.append({
                'status': 'error',
                'console_output': '',
                'error_message': f'Test execution failed: {str(e)}',
                'execution_time': 0,
                'test_case': test_case
            })
    
    return results

def _execute_python_simple(code_path, test_cases):
    """Simple Python execution without complex Docker setup"""
    import subprocess
    import tempfile
    import os
    
    results = []
    
    # Read the code
    with open(code_path, 'r') as f:
        code = f.read()
    
    for test_case in test_cases:
        try:
            input_str = str(test_case.get('input', ''))
            expected = str(test_case.get('expected_output', '')).strip()
            
            # Create a temporary script that includes the code and handles input
            with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as temp_script:
                # Write the user's code
                temp_script.write(code)
                temp_script_path = temp_script.name
            
            try:
                # Execute the script with input
                start_time = time.time()
                process = subprocess.run(
                    ['python3', temp_script_path],
                    input=input_str,
                    capture_output=True,
                    text=True,
                    timeout=5,  # 5 second timeout
                    cwd=os.path.dirname(temp_script_path)
                )
                end_time = time.time()
                duration = int((end_time - start_time) * 1000)
                
                if process.returncode == 0:
                    actual_output = process.stdout.strip()
                    if actual_output == expected:
                        status = 'pass'
                    else:
                        status = 'fail'
                    
                    results.append({
                        'status': status,
                        'console_output': actual_output,
                        'error_message': process.stderr if status == 'fail' else '',
                        'execution_time': duration,
                        'test_case': test_case
                    })
                else:
                    results.append({
                        'status': 'runtime_error',
                        'console_output': process.stdout,
                        'error_message': process.stderr or 'Runtime error',
                        'execution_time': 0,
                        'test_case': test_case
                    })
                    
            finally:
                # Clean up temporary file
                try:
                    os.unlink(temp_script_path)
                except Exception:
                    pass
                    
        except subprocess.TimeoutExpired:
            results.append({
                'status': 'timeout',
                'console_output': '',
                'error_message': 'Execution timed out (5s)',
                'execution_time': 5000,
                'test_case': test_case
            })
        except Exception as e:
            results.append({
                'status': 'error',
                'console_output': '',
                'error_message': f'Execution failed: {str(e)}',
                'execution_time': 0,
                'test_case': test_case
            })
    
    return results

def _execute_c_with_output(analyzer, code_path, test_cases):
    """Execute C code and capture all outputs"""
    # For now, use the original dynamic analyzer for C
    # We could implement output capture here if needed
    submission_data = {
        'student_id': 'temp_execution',
        'code_path': code_path,
        'language': 'c',
        'config': {
            'language': 'c',
            'test_cases': _format_test_cases_for_analyzer(test_cases),
        },
        'analysis': {'dynamic': []}
    }
    
    result = analyzer.analyze(submission_data)
    dynamic_results = result.get('analysis', {}).get('dynamic', [])
    
    formatted_results = []
    for i, test_result in enumerate(dynamic_results):
        test_case_data = test_cases[i] if i < len(test_cases) else {}
        
        formatted_result = {
            'status': test_result.get('status', 'error'),
            'console_output': test_result.get('actual', ''),
            'error_message': test_result.get('error', ''),
            'execution_time': test_result.get('execution_time', 0),
            'test_case': test_case_data
        }
        
        formatted_results.append(formatted_result)
    
    return formatted_results

def _execute_java_with_output(analyzer, code_path, test_cases):
    """Execute Java code and capture all outputs"""
    # For now, use the original dynamic analyzer for Java
    # We could implement output capture here if needed
    submission_data = {
        'student_id': 'temp_execution',
        'code_path': code_path,
        'language': 'java',
        'config': {
            'language': 'java',
            'test_cases': _format_test_cases_for_analyzer(test_cases),
        },
        'analysis': {'dynamic': []}
    }
    
    result = analyzer.analyze(submission_data)
    dynamic_results = result.get('analysis', {}).get('dynamic', [])
    
    formatted_results = []
    for i, test_result in enumerate(dynamic_results):
        test_case_data = test_cases[i] if i < len(test_cases) else {}
        
        formatted_result = {
            'status': test_result.get('status', 'error'),
            'console_output': test_result.get('actual', ''),
            'error_message': test_result.get('error', ''),
            'execution_time': test_result.get('execution_time', 0),
            'test_case': test_case_data
        }
        
        formatted_results.append(formatted_result)
    
    return formatted_results

def _get_file_extension(language):
    """Get appropriate file extension for the language"""
    extensions = {
        'python': '.py',
        'c': '.c',
        'java': '.java'
    }
    return extensions.get(language, '.txt')

def _format_test_cases_for_analyzer(test_cases):
    """Format test cases for the dynamic analyzer"""
    formatted_cases = []
    
    for i, test_case in enumerate(test_cases):
        formatted_case = {
            'name': f'test_{i+1}',
            'input': test_case.get('input', ''),
            'expected_output': test_case.get('expected_output', '')
        }
        formatted_cases.append(formatted_case)
    
    return formatted_cases

def _format_docker_results(docker_result, original_test_cases):
    """Convert Docker result format to View format"""
    formatted = []
    raw_results = docker_result.get('results', [])
    
    for i, res in enumerate(raw_results):
        tc_data = original_test_cases[i] if i < len(original_test_cases) else {}
        
        status = 'pass' if res['passed'] else 'fail'
        if res.get('error'):
            status = 'error'
            
        formatted.append({
            'status': status,
            'console_output': res.get('actual_output', ''),
            'error_message': res.get('error', ''),
            'execution_time': res.get('execution_time', 0),
            'test_case': tc_data
        })
    return formatted

def _detect_python_entry_point(code_path):
    """
    Detect the entry point (function name) from Python code.
    Returns the name of the first function defined in the code.
    """
    try:
        with open(code_path, 'r') as f:
            code = f.read()
            
        tree = ast.parse(code)
        
        # Look for the first top-level function definition
        for node in tree.body:
            if isinstance(node, ast.FunctionDef):
                return node.name
                
    except Exception as e:
        logger.warning(f"Error parsing Python code for entry point: {e}")
        
    return None

def analyze_code_structure(code):
    """
    Analyze Python code structure using AST.
    Returns a list of detected tags/keywords.
    """
    tags = []
    try:
        tree = ast.parse(code)
        
        # Walk the tree
        for node in ast.walk(tree):
            # Recursion Detection
            if isinstance(node, ast.FunctionDef):
                for child in ast.walk(node):
                    if isinstance(child, ast.Call):
                        if isinstance(child.func, ast.Name) and child.func.id == node.name:
                            if "recursion" not in tags: tags.append("recursion")
            
            # Nested Loops
            if isinstance(node, (ast.For, ast.While)):
                for child in node.body:
                    if isinstance(child, (ast.For, ast.While)):
                        if "nested_loops" not in tags: tags.append("nested_loops")
                        
            # List Comprehension
            if isinstance(node, ast.ListComp):
                if "list_comprehension" not in tags: tags.append("list_comprehension")
                
            # Dictionary Comprehension
            if isinstance(node, ast.DictComp):
                if "dict_comprehension" not in tags: tags.append("dict_comprehension")
                
            # Set Comprehension
            if isinstance(node, ast.SetComp):
                if "set_comprehension" not in tags: tags.append("set_comprehension")
                
            # Generators
            if isinstance(node, ast.GeneratorExp):
                if "generator" not in tags: tags.append("generator")

            # Try/Except
            if isinstance(node, ast.Try):
                if "error_handling" not in tags: tags.append("error_handling")

    except SyntaxError:
        tags.append("syntax_error")
    except Exception:
        pass
        
    return tags


def update_gradebook(student, assignment):
    """
    Recalculate total score for assignment and update gradebook.
    Logic: Weighted by number of test cases (Total Passed / Total Tests).
    If Manual Score is present, it counts as (Score% * NumTests) passed.
    """
    aqs = AssignmentQuestion.objects.filter(assignment=assignment)
    total_questions = aqs.count()
    
    sum_question_percentages = 0
    total_assignment_tests = 0
    total_passed_tests = 0
    total_points_earned = 0
    
    for aq in aqs:
        # Get latest attempt
        latest = SubmissionAttempt.objects.filter(
            student=student,
            assignment_question=aq
        ).order_by('-created_at').first()
        
        test_cases = aq.question.test_cases or []
        num_tests = len(test_cases)
        total_assignment_tests += num_tests
        
        if latest:
            passed = 0
            if latest.manual_score is not None:
                # Recover test pass count from the normalized percentage
                passed = max(0, min(num_tests, round((latest.manual_score / 100.0) * num_tests)))
            elif num_tests > 0:
                # Auto-calculated based on tests
                results = latest.test_results.all()
                if results:
                     passed = results.filter(status='pass').count()
                     passed = min(passed, num_tests)
                     
            total_passed_tests += passed
                
            # Calculate points earned for this question
            try:
                test_results_data = []
                for test_result in latest.test_results.all():
                    test_results_data.append({
                        'status': test_result.status,
                        'score': test_result.score
                    })
                
                if test_results_data:
                    calculator = PointsCalculator()
                    question_points = calculator.calculate_assignment_points(
                        test_results=test_results_data,
                        attempt_number=latest.attempt_number,
                        assignment_question=aq
                    )
                    total_points_earned += question_points
            except Exception as e:
                logger.error(f"Error calculating points for gradebook: {e}")

    # Final Calculation: Total Passed Testcases / Total Expected Testcases
    final_assignment_score = 0
    if total_assignment_tests > 0:
        final_assignment_score = (total_passed_tests / total_assignment_tests) * 100
            
    # Update Gradebook
    content_item = ContentItem.objects.get(id=assignment.id)
    entry, _ = GradebookEntry.objects.get_or_create(student=student, content_item=content_item)
    entry.final_score = final_assignment_score
    entry.points_earned = total_points_earned
    
    if total_points_earned > 0:
        logger.info(f"Assignment {assignment.id} for {student.username}: {total_points_earned} points earned")
    
    # Determine status
    has_manual = SubmissionAttempt.objects.filter(
        student=student, 
        assignment_question__assignment=assignment, 
        manual_score__isnull=False
    ).exists()
    
    has_any_submission = SubmissionAttempt.objects.filter(
        student=student,
        assignment_question__assignment=assignment,
    ).exists()
    
    if has_manual:
        entry.status = 'graded'
    # Removed the has_any_submission -> 'submitted' transition here
    # Assignments should only be marked 'submitted' explicitly by the student (Finish Assignment)
    # or by a deadline/timer cron job.
        
    entry.save()
    logger.info(f"Gradebook updated for {student.username} on {assignment.title}: score={final_assignment_score:.1f}%, status={entry.status}")

def award_assignment_points(submission_attempt, test_results_data):
    """
    Award points for assignment submissions using the gamification system.
    """
    try:
        calculator = PointsCalculator()
        points_awarded = calculator.calculate_and_award_assignment_points(
            submission_attempt=submission_attempt,
            test_results=test_results_data
        )
        
        if points_awarded > 0:
            logger.info(
                f"Awarded {points_awarded} assignment points to {submission_attempt.student.username} "
                f"for {submission_attempt.assignment_question}"
            )
            
    except Exception as e:
        logger.error(
            f"Error awarding assignment points for submission {submission_attempt.id}: {e}",
            exc_info=True
        )
