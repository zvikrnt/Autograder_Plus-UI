import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    ChevronLeft,
    Play,
    Send,
    RotateCcw,
    CheckCircle2,
    XCircle,
    Lightbulb,
    Terminal,
    Loader2,
    Star,
    Trophy,
    Target,
    Zap,
    BookOpen,
    ArrowRight,
    Timer,
    Clock
} from "lucide-react";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Separator } from "../../ui/separator";
import { motion, AnimatePresence } from "framer-motion"; // eslint-disable-line no-unused-vars

// Monaco Editor
import MonacoEditor from '@monaco-editor/react';

// Services
import { practiceService } from "../../../services/practiceService";
import McqWorkspaceRenderer from "../../workspace/McqWorkspaceRenderer";
import { getWorkspaceStarterCode } from "../../../utils/workspaceBoilerplate";

const DIFFICULTY_COLORS = {
    easy: "bg-green-100 text-green-700 border-green-200",
    medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
    hard: "bg-red-100 text-red-700 border-red-200"
};

// Per-difficulty time limits in seconds
const DIFFICULTY_TIME_LIMITS = {
    easy: 15 * 60,   // 15 minutes
    medium: 30 * 60, // 30 minutes
    hard: 60 * 60,   // 60 minutes
};

const DEFAULT_TIME_LIMIT = 20 * 60; // 20 min fallback

const DIFFICULTY_ICONS = {
    easy: <Target className="w-3 h-3" />,
    medium: <Zap className="w-3 h-3" />,
    hard: <Trophy className="w-3 h-3" />
};

const PracticeWorkspace = () => {
    const { questionId } = useParams();
    const navigate = useNavigate();

    // State
    const [question, setQuestion] = useState(null);
    const [progress, setProgress] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [code, setCode] = useState("");
    const [selectedLanguage, setSelectedLanguage] = useState("python");
    const [selectedMcqOption, setSelectedMcqOption] = useState(null);
    const [output, setOutput] = useState(null);
    const [isRunning, setIsRunning] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showHint, setShowHint] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [pointsEarned, setPointsEarned] = useState(0);

    // ── Timer State ──
    const [timeLeft, setTimeLeft] = useState(null);     // seconds remaining
    const [elapsed, setElapsed] = useState(0);          // seconds elapsed (to send to backend)
    const timerRef = useRef(null);
    const elapsedRef = useRef(0);                       // stable ref for callbacks
    const lastSyncRef = useRef(0);                      // last elapsed value synced to backend
    const handleSubmitRef = useRef(null);               // avoid stale closure in timer auto-submit

    // --- Anti-Cheat State ---
    const [warnings, setWarnings] = useState(0); // eslint-disable-line no-unused-vars
    const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
    const [warningModal, setWarningModal] = useState(null);
    const MAX_WARNINGS = 3;
    const isCheatHandlingRef = useRef(false);
    const warningsRef = useRef(0);

    // Language configuration - Limited to 3 languages supported by dynamic analyzer
    const languageConfig = {
        python: {
            name: "Python 3",
            extension: "py",
            defaultCode: "# Write your solution here\n",
            icon: "🐍",
            monacoLang: "python"
        },
        java: {
            name: "Java",
            extension: "java",
            defaultCode: "// Write your solution here\n",
            icon: "☕",
            monacoLang: "java"
        },
        c: {
            name: "C",
            extension: "c",
            defaultCode: "// Write your solution here\n",
            icon: "🔧",
            monacoLang: "c"
        }
    };

    // Load practice question and progress
    useEffect(() => {
        const fetchData = async () => {
            if (!questionId) return;

            try {
                setLoading(true);

                console.log("Fetching data for questionId:", questionId);
                // Fetch question and progress in parallel
                const [questionRes, progressRes] = await Promise.all([
                    practiceService.getPracticeQuestion(questionId),
                    practiceService.getPracticeProgress({ question: questionId })
                ]);

                console.log("Question Response:", questionRes);
                console.log("Progress Response:", progressRes);

                setQuestion(questionRes.data);

                // Find progress for this specific question
                const progressData = Array.isArray(progressRes.data) ? progressRes.data : (progressRes.data.results || []);
                const questionProgress = progressData.find(p => p.question == questionId);
                setProgress(questionProgress || null);

                // Set initial code
                setCode(getWorkspaceStarterCode(questionRes.data, selectedLanguage));

            } catch (err) {
                console.error("Failed to load practice question:", err);
                setError("Failed to load practice question");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [questionId, selectedLanguage]);

    // Start practice session when component mounts
    useEffect(() => {
        if (question && !progress) {
            practiceService.startPracticeSession(questionId).catch(console.error);
        }
    }, [question, progress, questionId]);

    // ── Timer logic ──
    useEffect(() => {
        if (!question || loading) return;
        if (progress?.is_completed) return; // no timer if already done

        const diff = (question.difficulty || 'medium').toLowerCase();
        const limit = DIFFICULTY_TIME_LIMITS[diff] || DEFAULT_TIME_LIMIT;
        const alreadySpent = progress?.time_spent || 0; // seconds already spent (from backend)
        const remaining = Math.max(0, limit - alreadySpent);

        setTimeLeft(remaining);
        setElapsed(alreadySpent);
        elapsedRef.current = alreadySpent;
        lastSyncRef.current = alreadySpent;

        // Clear any existing interval
        if (timerRef.current) clearInterval(timerRef.current);

        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev === null) return null;
                const next = prev - 1;
                elapsedRef.current += 1;
                setElapsed(elapsedRef.current);

                // Sync to backend every 30 seconds
                if (elapsedRef.current - lastSyncRef.current >= 30) {
                    lastSyncRef.current = elapsedRef.current;
                    practiceService.updateTimeSpent(questionId, elapsedRef.current).catch(() => { });
                }

                if (next <= 0) {
                    clearInterval(timerRef.current);
                    // Time's up — auto-submit using ref to avoid stale closure
                    if (handleSubmitRef.current) handleSubmitRef.current();
                    return 0;
                }
                return next;
            });
        }, 1000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            // Final sync on unmount
            practiceService.updateTimeSpent(questionId, elapsedRef.current).catch(() => { });
        };
    }, [question, progress?.is_completed, loading]);

    // Helper: format seconds as MM:SS
    const formatTime = (secs) => {
        if (secs === null) return '--:--';
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = (secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    // Timer color: green when > 50%, yellow when 25-50%, red when < 25%
    const getTimerColor = () => {
        if (timeLeft === null || !question) return '';
        const diff = (question.difficulty || 'medium').toLowerCase();
        const limit = DIFFICULTY_TIME_LIMITS[diff] || DEFAULT_TIME_LIMIT;
        const pct = timeLeft / limit;
        if (pct > 0.5) return 'text-green-600';
        if (pct > 0.25) return 'text-yellow-600';
        return 'text-red-600 animate-pulse';
    };

    const getTimerBg = () => {
        if (timeLeft === null || !question) return 'bg-gray-100 dark:bg-gray-800';
        const diff = (question.difficulty || 'medium').toLowerCase();
        const limit = DIFFICULTY_TIME_LIMITS[diff] || DEFAULT_TIME_LIMIT;
        const pct = timeLeft / limit;
        if (pct > 0.5) return 'bg-green-50 border-green-200';
        if (pct > 0.25) return 'bg-yellow-50 border-yellow-200';
        return 'bg-red-50 border-red-200';
    };

    // --- Anti-Cheat Tracking ---
    useEffect(() => {
        const isCompleted = progress?.is_completed;
        if (isCompleted || loading || !question) return;

        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener("fullscreenchange", handleFullscreenChange);

        const handleVisibilityChange = () => {
            if (document.hidden && document.fullscreenElement !== null) {
                handleCheatDetected("You switched tabs or windows!");
            }
        };

        const handleWindowBlur = () => {
            if (document.fullscreenElement !== null && !document.hidden) {
                handleCheatDetected("Focus lost from the practice window!");
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("blur", handleWindowBlur);

        return () => {
            document.removeEventListener("fullscreenchange", handleFullscreenChange);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("blur", handleWindowBlur);
        };
        // 'warnings' intentionally omitted — warningsRef used instead to avoid re-registering listeners
    }, [progress?.is_completed, loading, question]);

    const handleCheatDetected = (reason) => {
        if (isCheatHandlingRef.current) return;
        isCheatHandlingRef.current = true;

        warningsRef.current += 1;
        const newWarnings = warningsRef.current;
        setWarnings(newWarnings);

        if (newWarnings >= MAX_WARNINGS) {
            setWarningModal({ message: reason, count: newWarnings, isFinal: true });
        } else {
            setWarningModal({ message: reason, count: newWarnings, isFinal: false });
        }
        setTimeout(() => { isCheatHandlingRef.current = false; }, 1000);
    };

    const enterFullscreen = () => {
        const docElm = document.documentElement;
        const requestFS = docElm.requestFullscreen || docElm.mozRequestFullScreen || docElm.webkitRequestFullScreen || docElm.msRequestFullscreen;

        if (requestFS) {
            requestFS.call(docElm).catch(err => {
                console.error("Fullscreen request failed", err);
                alert("Could not automatically enter fullscreen. please ensure your browser allows it.");
            });
        } else {
            alert("Your browser does not support fullscreen functionality.");
        }
    };

    const handleLanguageChange = (newLanguage) => {
        setSelectedLanguage(newLanguage);

        // Reset to starter code or default for new language
        setCode(getWorkspaceStarterCode(question, newLanguage));

        setOutput(null);
    };

    const handleRunCode = async () => {
        if (!question) return;

        setIsRunning(true);
        setOutput({ status: 'running' });

        try {
            const response = await practiceService.runPracticeCode(questionId, {
                code: code,
                language: selectedLanguage,
                test_cases: question.test_cases || []
            });

            // Format result for UI
            const resultData = response.data.data || response.data;

            const formattedOutput = {
                status: resultData.summary.execution_successful ? 'success' : 'error',
                message: resultData.summary.execution_successful ?
                    'Code executed successfully!' : 'Code execution failed',
                results: resultData.results.map((r, index) => ({
                    id: index,
                    status: r.error ? 'error' : 'success',
                    output: r.actual_output || '',
                    expected: r.expected_output || '',
                    error: r.error || r.error_message || '',
                    input: r.test_case?.input || question.test_cases[index]?.input || '',
                    testPassed: r.passed
                }))
            };

            setOutput(formattedOutput);

        } catch (err) {
            console.error("Run failed:", err);
            setOutput({
                status: 'error',
                message: 'Execution failed: ' + (err.message || 'Unknown error'),
                results: []
            });
        } finally {
            setIsRunning(false);
        }
    };

    // Keep ref always pointing to latest handleSubmit (avoids stale closure in timer)
    const handleSubmit = async () => {
        if (!question) return;

        // Stop and sync timer before submitting
        if (timerRef.current) clearInterval(timerRef.current);
        practiceService.updateTimeSpent(questionId, elapsedRef.current).catch(() => { });

        const isMcq = question.question_type === 'mcq';

        // For MCQ, require an option to be selected
        if (isMcq && selectedMcqOption === null) {
            setOutput({
                status: 'error',
                message: 'Please select an answer before submitting.',
                results: []
            });
            return;
        }

        setIsSubmitting(true);

        try {
            let optionIndex = selectedMcqOption;
            if (isMcq && question.config?.options) {
                const idx = question.config.options.indexOf(selectedMcqOption);
                if (idx !== -1) optionIndex = idx;
            }

            const payload = isMcq
                ? { selected_option: optionIndex }
                : { source_code: code, language: selectedLanguage };

            const response = await practiceService.submitPracticeCode(questionId, payload);

            // apiClient returns { success, data, status } — check for API-level errors first
            if (!response.success) {
                const errMsg = response.data?.message || response.message || 'Submission failed';
                setOutput({ status: 'error', message: errMsg, results: [] });
                return;
            }

            // response.data is what the backend returns as the top-level JSON
            // Our backend wraps results in { success, data: { ... } }
            const submissionData = response.data?.data || response.data;

            if (isMcq) {
                const allPassed = submissionData.all_passed;
                setOutput({
                    status: allPassed ? 'success' : 'error',
                    message: allPassed
                        ? `🎉 Correct! You earned ${submissionData.points_awarded || 0} points!`
                        : '❌ Incorrect answer. Try again!',
                    results: [],
                    isSubmission: true,
                    isMcq: true,
                    pointsEarned: submissionData.points_awarded || 0
                });
                if (allPassed) {
                    setPointsEarned(submissionData.points_awarded || 0);
                    setShowSuccess(true);
                    setProgress(prev => ({ ...prev, is_completed: true, attempts_count: (prev?.attempts_count || 0) + 1, best_score: 100 }));
                } else {
                    setProgress(prev => ({ ...prev, attempts_count: (prev?.attempts_count || 0) + 1 }));
                }
                return;
            }

            // ── Coding question result processing ────────────────────────
            const rawResults = submissionData.test_results || submissionData.results || [];
            const formattedResults = rawResults.map((r, idx) => ({
                id: idx,
                status: r.status === 'pass' ? 'success' : 'error',
                output: r.actual_output || '',
                expected: question.test_cases[idx]?.expected_output || '',
                error: r.error || r.error_message || '',
                input: question.test_cases[idx]?.input || '',
                testPassed: r.status === 'pass'
            }));

            const allPassed = formattedResults.every(r => r.status === 'success');

            setOutput({
                status: allPassed ? 'success' : 'error',
                message: allPassed
                    ? `🎉 Congratulations! All test cases passed! You earned ${submissionData.points_earned || submissionData.points_awarded || 0} points!`
                    : 'Some test cases failed. Keep trying - you can submit unlimited times!',
                results: formattedResults,
                isSubmission: true,
                pointsEarned: submissionData.points_earned || submissionData.points_awarded || 0
            });

            if (allPassed) {
                setPointsEarned(submissionData.points_earned || submissionData.points_awarded || 0);
                setShowSuccess(true);
                setProgress(prev => ({ ...prev, is_completed: true, attempts_count: (prev?.attempts_count || 0) + 1, best_score: 100 }));
            } else {
                setProgress(prev => ({ ...prev, attempts_count: (prev?.attempts_count || 0) + 1 }));
            }

        } catch (err) {
            console.error("Submission failed:", err);
            setOutput({
                status: 'error',
                message: 'Submission failed: ' + (err.response?.data?.message || err.message || 'Unknown error'),
                results: []
            });
        } finally {
            setIsSubmitting(false);
        }
    };
    // Update ref on every render so timer always has the latest handleSubmit
    handleSubmitRef.current = handleSubmit;


    const handleBackClick = () => {
        navigate('/student/practice');
    };

    const handleTryAnother = () => {
        navigate('/student/practice');
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="text-center">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mx-auto mb-4" />
                    <p className="text-gray-500 font-medium">Loading practice question...</p>
                </div>
            </div>
        );
    }

    if (error || !question) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="text-center">
                    <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Error Loading Question</h2>
                    <p className="text-gray-500 mb-6">{error || "Question not found."}</p>
                    <Button onClick={handleBackClick}>Back to Practice</Button>
                </div>
            </div>
        );
    }

    const testCases = question.test_cases || [];
    const isCompleted = progress?.is_completed || false;

    return (
        <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 font-sans overflow-hidden">

            {/* Anti-Cheat Fullscreen Blocking Overlay */}
            {!isCompleted && !loading && !error && question && !isFullscreen && (
                <div className="fixed inset-0 z-50 bg-gray-900/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8 max-w-md w-full border-t-4 border-indigo-600">
                        <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Target className="w-8 h-8 text-indigo-600 animate-pulse" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Practice Focus Mode</h2>
                        <div className="text-gray-600 text-sm mb-6 space-y-2">
                            <p>This practice session runs in a focused environment.</p>
                            <ul className="text-left bg-gray-50 dark:bg-gray-900 p-3 rounded-lg border border-gray-100 dark:border-gray-800 space-y-1 text-xs">
                                <li>• You must remain in Fullscreen mode.</li>
                                <li>• Switching tabs or windows is recorded.</li>
                                <li>• 3 warnings will result in auto-submission & exit.</li>
                                <li>• Copying/pasting is disabled to encourage typing out logic.</li>
                            </ul>
                        </div>
                        <Button
                            onClick={enterFullscreen}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 h-auto"
                        >
                            Enter Fullscreen to Start
                        </Button>
                    </div>
                </div>
            )}

            {/* Anti-Cheat Warning Modal */}
            {warningModal && (
                <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4">
                    <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-sm w-full border-t-4 ${warningModal.isFinal ? 'border-red-600' : 'border-amber-500'}`}>
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${warningModal.isFinal ? 'bg-red-100' : 'bg-amber-100'}`}>
                            <span className="text-2xl">{warningModal.isFinal ? '🚨' : '⚠️'}</span>
                        </div>
                        <h3 className={`text-lg font-bold text-center mb-2 ${warningModal.isFinal ? 'text-red-700' : 'text-amber-700'}`}>
                            {warningModal.isFinal ? 'Maximum Warnings Reached' : `Warning ${warningModal.count}/${MAX_WARNINGS}`}
                        </h3>
                        <p className="text-gray-700 text-sm text-center mb-2">{warningModal.message}</p>
                        {warningModal.isFinal ? (
                            <p className="text-red-600 text-sm text-center font-medium mb-4">Your practice session is being automatically submitted.</p>
                        ) : (
                            <p className="text-gray-500 text-xs text-center mb-4">{MAX_WARNINGS - warningModal.count} more warning(s) will trigger auto-submission.</p>
                        )}
                        <button
                            className={`w-full py-2 rounded-lg font-semibold text-white transition-colors ${warningModal.isFinal ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-500 hover:bg-amber-600'}`}
                            onClick={() => {
                                const wasFinal = warningModal.isFinal;
                                setWarningModal(null);
                                if (wasFinal) handleSubmit();
                            }}
                        >
                            {warningModal.isFinal ? 'Acknowledged — Submit Now' : 'I Understand, Return to Practice'}
                        </button>
                    </div>
                </div>
            )}

            {/* Completion Banner */}
            {isCompleted && (
                <div className="bg-green-100 border-b border-green-200 px-4 py-2 text-green-800 text-sm font-medium flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    🎉 Completed! {pointsEarned > 0 && `You earned ${pointsEarned} points. `}Feel free to continue practicing or try another question.
                </div>
            )}

            {/* Header */}
            <header className="h-14 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 z-20 shadow-sm flex-shrink-0">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={handleBackClick}
                    >
                        <ChevronLeft className="w-5 h-5 text-gray-600" />
                    </Button>
                    <div>
                        <h1 className="font-bold text-sm text-gray-900 leading-none mb-1">
                            {question.title}
                        </h1>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Badge className={DIFFICULTY_COLORS[question.difficulty] || DIFFICULTY_COLORS.medium}>
                                {DIFFICULTY_ICONS[question.difficulty]}
                                <span className="ml-1 capitalize">{question.difficulty}</span>
                            </Badge>
                            <span>•</span>
                            <Star className="w-3 h-3 text-yellow-500" />
                            <span>{question.point_value} pts</span>
                            {progress?.attempts_count > 0 && (
                                <>
                                    <span>•</span>
                                    <span>{progress.attempts_count} attempt{progress.attempts_count !== 1 ? 's' : ''}</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Timer Display */}
                    {!isCompleted && timeLeft !== null && (
                        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border text-sm font-mono font-bold ${getTimerBg()} ${getTimerColor()}`}>
                            <Clock className={`w-3.5 h-3.5 ${getTimerColor()}`} />
                            <span>{formatTime(timeLeft)}</span>
                        </div>
                    )}
                    {isCompleted && (
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg border bg-gray-50 dark:bg-gray-900 text-xs text-gray-500">
                            <Timer className="w-3.5 h-3.5" />
                            <span>Spent: {formatTime(elapsed)}</span>
                        </div>
                    )}
                    {question?.question_type !== 'mcq' && (
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleRunCode}
                            disabled={isRunning || isSubmitting}
                            className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 h-9"
                        >
                            {isRunning ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                            Run
                        </Button>
                    )}

                    <Button
                        size="sm"
                        onClick={handleSubmit}
                        disabled={isRunning || isSubmitting}
                        className="bg-green-600 hover:bg-green-700 text-white h-9 shadow-sm"
                    >
                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                        {isCompleted ? 'Submit Again' : 'Submit'}
                    </Button>
                </div>
            </header>

            {/* Main Workspace */}
            <div className="flex-1 w-full overflow-hidden flex">
                {/* Left Panel: Description */}
                <div className="w-[35%] min-w-[300px] max-w-[600px] bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col h-full">
                    <div className="flex-1 overflow-y-auto p-6">
                        <div className="mb-6">
                            <div className="flex items-center gap-2 mb-4">
                                <BookOpen className="w-5 h-5 text-indigo-600" />
                                <h2 className="text-xl font-bold text-gray-900 select-none">
                                    {question.title}
                                </h2>
                            </div>

                            {question.category && (
                                <div className="mb-4">
                                    <Badge variant="outline" className="text-gray-600 border-gray-200 dark:border-gray-700">
                                        {question.category.charAt(0).toUpperCase() + question.category.slice(1)}
                                    </Badge>
                                </div>
                            )}

                            <Separator className="my-4" />

                            <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap select-none">
                                {question.description || <span className="text-gray-400 italic">No description available.</span>}
                            </div>
                        </div>

                        {/* Test Cases Preview */}
                        <div className="mt-6">
                            <h3 className="text-sm font-semibold text-gray-900 mb-3">Example Test Cases</h3>
                            <div className="space-y-3">
                                {testCases.slice(0, 2).map((tc, idx) => (
                                    <div key={idx} className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 text-xs font-mono border border-gray-200 dark:border-gray-700">
                                        <div className="grid grid-cols-2 gap-2 mb-1">
                                            <span className="text-gray-500">Input:</span>
                                            <span className="text-gray-900">{tc.input !== undefined ? tc.input : (tc.concept || "N/A")}</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <span className="text-gray-500">Output:</span>
                                            <span className="text-gray-900">{tc.expected_output !== undefined ? tc.expected_output : (tc.output !== undefined ? tc.output : (tc.description || "N/A"))}</span>
                                        </div>
                                    </div>
                                ))}
                                {testCases.length === 0 && (
                                    <p className="text-gray-500 text-xs italic">No example test cases available.</p>
                                )}
                            </div>
                        </div>

                        {/* Practice Info */}
                        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                            <h4 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
                                <Target className="w-4 h-4" />
                                Practice Mode
                            </h4>
                            <ul className="text-xs text-blue-800 space-y-1">
                                <li>• Unlimited submissions until you get it right</li>
                                <li>• Immediate feedback on each attempt</li>
                                <li>• Earn full points when all test cases pass</li>
                                <li>• Time limit: Easy 15 min · Medium 30 min · Hard 60 min</li>
                            </ul>
                        </div>

                        {/* Hint */}
                        {question.hint && (
                            <div className="mt-6 border-t border-gray-100 dark:border-gray-800 pt-4">
                                <button
                                    onClick={() => setShowHint(!showHint)}
                                    className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                                >
                                    <Lightbulb className="w-4 h-4" />
                                    {showHint ? 'Hide Hint' : 'Need a Hint?'}
                                </button>
                                {showHint && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="mt-3 bg-amber-50 text-amber-900 p-3 rounded-md text-sm border border-amber-100"
                                    >
                                        {question.hint}
                                    </motion.div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel: Editor & Output */}
                <div className="flex-1 bg-white dark:bg-gray-800 flex flex-col h-full">
                    {/* Editor */}
                    {question?.question_type === 'mcq' ? (
                        <div className="flex-[60] min-h-0 flex flex-col bg-white dark:bg-gray-800 overflow-hidden border-b border-gray-200 dark:border-gray-700">
                            <McqWorkspaceRenderer
                                question={question}
                                selectedOption={selectedMcqOption}
                                onChange={setSelectedMcqOption}
                                disabled={isCompleted || isSubmitting}
                            />
                        </div>
                    ) : (
                        <div className="flex-[60] min-h-0 flex flex-col bg-[#2d2d2d]">
                            <div className="bg-[#2d2d2d] border-b border-[#111] px-4 h-9 flex justify-between items-center text-xs text-gray-400 select-none flex-shrink-0">
                                <div className="flex items-center gap-2">
                                    <select
                                        value={selectedLanguage}
                                        onChange={(e) => handleLanguageChange(e.target.value)}
                                        className="bg-[#3d3d3d] text-blue-400 font-medium border border-[#555] rounded px-2 py-1 text-xs cursor-pointer hover:bg-[#4d4d4d] focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    >
                                        {Object.entries(languageConfig).map(([key, lang]) => (
                                            <option key={key} value={key} className="bg-[#3d3d3d] text-white">
                                                {lang.icon} {lang.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <span
                                    className="hover:text-white cursor-pointer transition-colors flex items-center gap-1"
                                    onClick={() => setCode(getWorkspaceStarterCode(question, selectedLanguage))}
                                >
                                    <RotateCcw className="w-3 h-3" /> Reset
                                </span>
                            </div>

                            <div className="flex-1 relative overflow-hidden bg-[#1e1e1e]">
                                <MonacoEditor
                                    height="100%"
                                    language={languageConfig[selectedLanguage].monacoLang}
                                    value={code}
                                    theme="vs-dark"
                                    onChange={(value) => setCode(value || '')}
                                    onMount={(editor, monaco) => {
                                        if (!isCompleted) {
                                            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyC, () => { });
                                            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, () => { });
                                            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyX, () => { });
                                        }
                                    }}
                                    options={{
                                        fontSize: 14,
                                        fontFamily: '"Fira Code", "Fira Mono", monospace',
                                        fontLigatures: true,
                                        minimap: { enabled: false },
                                        scrollBeyondLastLine: false,
                                        wordWrap: 'on',
                                        readOnly: isCompleted || isSubmitting,
                                        automaticLayout: true,
                                        tabSize: 4,
                                        insertSpaces: true,
                                        autoIndent: 'full',
                                        formatOnType: true,
                                        bracketPairColorization: { enabled: true },
                                        autoClosingBrackets: 'always',
                                        autoClosingQuotes: 'always',
                                        lineNumbers: 'on',
                                        renderLineHighlight: 'all',
                                        scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
                                        padding: { top: 12, bottom: 12 },
                                        contextmenu: false,
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Divider */}
                    {question?.question_type !== 'mcq' && <div className="h-1 bg-gray-800 flex-shrink-0" />}

                    {/* Output Console */}
                    {question?.question_type !== 'mcq' && (
                        <div className="flex-[40] min-h-0 bg-white dark:bg-gray-800 flex flex-col">
                            <div className="h-9 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 select-none flex-shrink-0">
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-2 text-gray-500 font-medium text-xs">
                                        <Terminal className="w-3.5 h-3.5" />
                                        Output
                                    </div>
                                    {isRunning && <span className="text-xs text-indigo-600 animate-pulse">Running Code...</span>}
                                    {output?.status === 'error' && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                                    {output?.status === 'success' && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                                </div>
                            </div>

                            <div className="flex-1 overflow-auto p-4">
                                {!output && !isRunning && (
                                    <div className="flex flex-col items-center justify-center text-gray-400 h-full">
                                        <Terminal className="w-12 h-12 mb-2 opacity-50" />
                                        <span className="text-sm">Click "Run Code" to test your solution</span>
                                        <span className="text-xs mt-1">Or click "Submit" to check all test cases</span>
                                    </div>
                                )}

                                {isRunning && (
                                    <div className="flex flex-col items-center justify-center text-blue-600 h-full">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
                                        <span className="text-sm">Running your code...</span>
                                    </div>
                                )}

                                {output && (
                                    <div className="space-y-4">
                                        {/* Status Message */}
                                        <div className={`p-3 rounded-lg border ${output.status === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                                            }`}>
                                            <div className="flex items-center gap-2">
                                                {output.status === 'success' ? (
                                                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                                                ) : (
                                                    <XCircle className="w-4 h-4 text-red-600" />
                                                )}
                                                <span className={`font-medium text-sm ${output.status === 'success' ? 'text-green-800' : 'text-red-800'
                                                    }`}>
                                                    {output.message}
                                                </span>
                                            </div>

                                            {output.isSubmission && output.pointsEarned > 0 && (
                                                <div className="mt-2 flex items-center gap-2 text-green-700">
                                                    <Star className="w-4 h-4 text-yellow-500" />
                                                    <span className="font-semibold">+{output.pointsEarned} points earned!</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Test Results */}
                                        {output.results && output.results.length > 0 && (
                                            <div className="space-y-3">
                                                {output.results.map((result, idx) => (
                                                    <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                                                        <div className={`px-4 py-2 border-b ${result.testPassed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                                                            }`}>
                                                            <h3 className={`font-semibold text-sm flex items-center gap-2 ${result.testPassed ? 'text-green-800' : 'text-red-800'
                                                                }`}>
                                                                {result.testPassed ? (
                                                                    <CheckCircle2 className="w-4 h-4" />
                                                                ) : (
                                                                    <XCircle className="w-4 h-4" />
                                                                )}
                                                                Test Case {idx + 1}
                                                                {result.testPassed ? ' - Passed ✓' : ' - Failed ✗'}
                                                            </h3>
                                                        </div>

                                                        <div className="p-4 space-y-3">
                                                            {result.input && (
                                                                <div>
                                                                    <div className="text-xs font-semibold text-gray-500 mb-1">INPUT:</div>
                                                                    <div className="bg-gray-100 dark:bg-gray-800 p-2 rounded text-sm font-mono border">
                                                                        {result.input}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            <div className="grid grid-cols-2 gap-3">
                                                                <div>
                                                                    <div className="text-xs font-semibold text-gray-500 mb-1">EXPECTED:</div>
                                                                    <div className="bg-blue-100 p-2 rounded text-sm font-mono border text-blue-800">
                                                                        {result.expected || '(no output expected)'}
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <div className="text-xs font-semibold text-gray-500 mb-1">YOUR OUTPUT:</div>
                                                                    <div className={`p-2 rounded text-sm font-mono border ${result.testPassed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                                                        }`}>
                                                                        {result.error ? (
                                                                            <div className="text-red-600">
                                                                                <div className="font-bold">Error:</div>
                                                                                <div>{result.error}</div>
                                                                            </div>
                                                                        ) : (
                                                                            result.output || '(no output)'
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Encouragement for failed submissions */}
                                        {output.isSubmission && output.status === 'error' && (
                                            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                                <div className="flex items-center gap-2 text-blue-800 mb-2">
                                                    <Target className="w-4 h-4" />
                                                    <span className="font-semibold">Keep Going!</span>
                                                </div>
                                                <p className="text-sm text-blue-700">
                                                    Don't worry - practice makes perfect! Review the failed test cases above,
                                                    adjust your code, and try again. You have unlimited attempts.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Success Modal */}
            <AnimatePresence>
                {showSuccess && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[1px]"
                    >
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-2xl text-center max-w-md w-full mx-4"
                        >
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Trophy className="w-8 h-8 text-green-600" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">Congratulations! 🎉</h2>
                            <p className="text-gray-600 mb-4">
                                You've successfully completed this practice question and earned <strong>{pointsEarned} points</strong>!
                            </p>
                            <div className="flex gap-3">
                                <Button
                                    variant="outline"
                                    onClick={() => setShowSuccess(false)}
                                    className="flex-1"
                                >
                                    Continue Practicing
                                </Button>
                                <Button
                                    onClick={handleTryAnother}
                                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                                >
                                    Try Another <ArrowRight className="w-4 h-4 ml-1" />
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default PracticeWorkspace;
