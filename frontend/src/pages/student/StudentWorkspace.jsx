import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    ChevronLeft,
    Play,
    Send,
    Settings,
    RotateCcw,
    CheckCircle2,
    XCircle,
    Lightbulb,
    FileText,
    History,
    ChevronDown,
    Terminal,
    GripVertical,
    Loader2,
    Clock,
    ArrowRight,
    Save,
    SkipForward,
    CheckCheck
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import { motion as Motion, AnimatePresence } from "framer-motion";

// --- MONACO EDITOR ---
import MonacoEditor from '@monaco-editor/react';
import { Separator } from "../../components/ui/separator";
import ReactMarkdown from 'react-markdown';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels";

// Services
import { assignmentService } from "../../services/assignmentService";
import { submissionService } from "../../services/submissionService";
import QuestionPalette from "../../components/workspace/QuestionPalette";
import McqWorkspaceRenderer from "../../components/workspace/McqWorkspaceRenderer";
import { getWorkspaceStarterCode } from "../../utils/workspaceBoilerplate";
import { tokenManager } from "../../utils/tokenManager";

const StudentWorkspace = () => {
    const { assignmentId } = useParams();
    const navigate = useNavigate();

    // State
    const [assignment, setAssignment] = useState(null);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0); // Hoisted State
    const [completedQuestions, setCompletedQuestions] = useState(new Set()); // Track completed indices
    const [questionSubmissionStatus, setQuestionSubmissionStatus] = useState({}); // { [index]: 'success' | 'fail' }
    const [codeDrafts, setCodeDrafts] = useState({}); // Local cache: { index: code }
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [code, setCode] = useState("");
    const [selectedLanguage, setSelectedLanguage] = useState("python"); // Add language state
    const [output, setOutput] = useState(null);
    const [isRunning, setIsRunning] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showConfetti, setShowConfetti] = useState(false);
    const [showExitWarning, setShowExitWarning] = useState(false);
    const [, setIsCompleted] = useState(false); // Track completion status
    const [isReadOnly, setIsReadOnly] = useState(false); // Locked mode after finish

    // --- Anti-Cheat State ---
    const [, setWarnings] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
    const [warningModal, setWarningModal] = useState(null); // { message, isFinal }
    const MAX_WARNINGS = 3;
    // Ref-based lock: prevents re-entrant cheat detection (alert() itself triggers blur/visibilitychange)
    const isCheatHandlingRef = useRef(false);
    const warningsRef = useRef(0); // Mirror of warnings state, readable inside event handlers

    // Timer state
    const [timeSpent, setTimeSpent] = useState(0); // in seconds (for backend tracking)
    const [timeRemaining, setTimeRemaining] = useState(0); // countdown timer in seconds
    const [, setTotalTimeAllowed] = useState(0); // total time for this difficulty
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const [showHint, setShowHint] = useState(false);
    const timerIntervalRef = useRef(null);
    const lastUpdateRef = useRef(Date.now());
    const isExamOrQuiz = assignment?.mode === 'exam' || assignment?.type === 'quiz';
    const isClipboardRestricted = !isReadOnly && isExamOrQuiz;

    // Language configuration - Limited to 3 languages supported by dynamic analyzer
    const languageConfig = {
        python: {
            name: "Python 3",
            extension: "py",
            defaultCode: "",
            icon: "🐍",
            monacoLang: "python"
        },
        java: {
            name: "Java",
            extension: "java",
            defaultCode: "",
            icon: "☕",
            monacoLang: "java"
        },
        c: {
            name: "C",
            extension: "c",
            defaultCode: "",
            icon: "🔧",
            monacoLang: "c"
        }
    };

    // Monaco editor ref for disabling copy/paste actions
    const monacoEditorRef = useRef(null);
    const workspaceRootRef = useRef(null);

    const handleMonacoMount = (editor, monaco) => {
        monacoEditorRef.current = editor;
        if (!isReadOnly && isExamOrQuiz) {
            // Disable copy and paste commands for active assignments/tests.
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyC, () => { });
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, () => { });
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyX, () => { });

            // Extra hardening: block keyboard and native clipboard events in editor area.
            editor.onKeyDown((e) => {
                const isCmdOrCtrl = e.ctrlKey || e.metaKey;
                const keyCode = e.keyCode;
                const isCopyCutPaste =
                    (isCmdOrCtrl && (keyCode === monaco.KeyCode.KeyC || keyCode === monaco.KeyCode.KeyV || keyCode === monaco.KeyCode.KeyX)) ||
                    (e.shiftKey && keyCode === monaco.KeyCode.Insert) ||
                    (isCmdOrCtrl && keyCode === monaco.KeyCode.Insert);

                if (isCopyCutPaste) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            });

            const editorDomNode = editor.getDomNode();
            if (editorDomNode) {
                const blockClipboard = (evt) => {
                    evt.preventDefault();
                    evt.stopPropagation();
                };

                editorDomNode.addEventListener("copy", blockClipboard, true);
                editorDomNode.addEventListener("cut", blockClipboard, true);
                editorDomNode.addEventListener("paste", blockClipboard, true);
                editorDomNode.addEventListener("contextmenu", blockClipboard, true);

                editor.onDidDispose(() => {
                    editorDomNode.removeEventListener("copy", blockClipboard, true);
                    editorDomNode.removeEventListener("cut", blockClipboard, true);
                    editorDomNode.removeEventListener("paste", blockClipboard, true);
                    editorDomNode.removeEventListener("contextmenu", blockClipboard, true);
                });
            }
        }
    };

    const SUBMIT_SAVE_RETRIES = 2;
    const SUBMIT_SAVE_RETRY_DELAY_MS = 1200;

    const getDraftStorageKey = (aqId, language = selectedLanguage) => {
        const user = tokenManager.getUserFromToken();
        const userId = user?.userId || 'guest';
        return `student-workspace-draft:${userId}:${assignmentId}:${aqId}:${language}`;
    };

    const getDraftFromStorage = (aqId, language = selectedLanguage) => {
        try {
            const key = getDraftStorageKey(aqId, language);
            const value = window.localStorage.getItem(key);
            return value === null ? null : value;
        } catch (err) {
            console.error("Failed to read draft from local storage:", err);
            return null;
        }
    };

    const saveDraftToStorage = (aqId, draftValue, language = selectedLanguage) => {
        try {
            const key = getDraftStorageKey(aqId, language);
            window.localStorage.setItem(key, draftValue ?? "");
        } catch (err) {
            console.error("Failed to save draft to local storage:", err);
        }
    };

    const clearDraftFromStorage = (aqId, language = selectedLanguage) => {
        try {
            window.localStorage.removeItem(getDraftStorageKey(aqId, language));
        } catch (err) {
            console.error("Failed to clear local draft:", err);
        }
    };

    const clearAssignmentDraftsFromStorage = () => {
        try {
            const user = tokenManager.getUserFromToken();
            const userId = user?.userId || 'guest';
            const prefix = `student-workspace-draft:${userId}:${assignmentId}:`;
            const keysToDelete = [];
            for (let i = 0; i < window.localStorage.length; i++) {
                const key = window.localStorage.key(i);
                if (key && key.startsWith(prefix)) keysToDelete.push(key);
            }
            keysToDelete.forEach((key) => window.localStorage.removeItem(key));
        } catch (err) {
            console.error("Failed to clear assignment drafts from local storage:", err);
        }
    };

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const getApiErrorMessage = (response) => {
        if (!response) return "Unknown submission error";
        if (typeof response.message === "string" && response.message.trim()) return response.message;
        if (typeof response.data?.message === "string" && response.data.message.trim()) return response.data.message;
        return "Submission request failed";
    };

    const isAlreadyCompletedError = (message) => {
        return typeof message === "string" && message.toLowerCase().includes("already successfully completed");
    };

    const isRetriableSubmitFailure = (response) => {
        const statusCode = response?.status;
        const message = getApiErrorMessage(response).toLowerCase();
        return (
            !statusCode ||
            statusCode >= 500 ||
            statusCode === 408 ||
            statusCode === 429 ||
            message.includes("network") ||
            message.includes("timeout")
        );
    };

    const submitCodeWithRetry = async (payload) => {
        let lastFailure = null;

        for (let attempt = 0; attempt <= SUBMIT_SAVE_RETRIES; attempt++) {
            const response = await submissionService.submitCode(payload);
            if (response.success) {
                return { ok: true, response };
            }

            const errorMessage = getApiErrorMessage(response);
            if (isAlreadyCompletedError(errorMessage)) {
                return { ok: true, alreadyCompleted: true, response };
            }

            lastFailure = response;
            const canRetry = attempt < SUBMIT_SAVE_RETRIES && isRetriableSubmitFailure(response);
            if (canRetry) {
                await sleep(SUBMIT_SAVE_RETRY_DELAY_MS);
                continue;
            }
            break;
        }

        return { ok: false, response: lastFailure };
    };

    const buildQuestionSubmissionPayload = ({ aq, question, answerValue, spentTime }) => {
        const isMcq = question?.question_type === "mcq";
        const payload = {
            assignment_id: assignment.id,
            assignment_question_id: aq.id,
            question_id: question.id,
            language: selectedLanguage,
            time_spent: spentTime ?? 0,
        };

        if (isMcq) {
            let optionIndex = -1;
            if (Array.isArray(question?.config?.options)) {
                const idx = question.config.options.indexOf(answerValue);
                if (idx !== -1) optionIndex = idx;
            }
            if (optionIndex === -1 && typeof answerValue === "number" && Number.isInteger(answerValue)) {
                optionIndex = answerValue;
            }
            payload.response_data = { answer: optionIndex };
        } else {
            payload.code_content = answerValue ?? "";
        }

        return payload;
    };

    // Load Question Data when Index Changes
    useEffect(() => {
        const loadQuestionData = async () => {
            if (!assignment || !assignment.questions || !assignment.questions[currentQuestionIndex]) {
                setLoading(false); // Safety: clear loading even on early return
                return;
            }

            const aq = assignment.questions[currentQuestionIndex];
            const question = aq.question;
            const aqId = aq.id;

            setLoading(false); // Assignment is loaded, just switching questions

            // 1. Calculate Time Limit
            const isTimedExam = isExamOrQuiz && assignment.duration_minutes;
            const timeLimit = isTimedExam
                ? assignment.duration_minutes * 60
                : getTimeLimit(question.difficulty);
            setTotalTimeAllowed(timeLimit);

            const setTimerFromResponse = (timerData) => {
                if (isTimedExam && timerData.total_time_allowed) {
                    setTimeSpent(timerData.time_spent || 0);
                    setTimeRemaining(Math.max(0, timerData.total_time_allowed - (timerData.time_spent || 0)));
                } else {
                    setTimeSpent(timerData.time_spent || 0);
                    setTimeRemaining(Math.max(0, timeLimit - (timerData.time_spent || 0)));
                }
            };

            // 2. Load Code: Local storage draft -> in-memory draft -> backend
            const localDraft = !isReadOnly ? getDraftFromStorage(aqId, selectedLanguage) : null;
            const hasUsableLocalDraft = localDraft !== null && localDraft !== "";
            if (hasUsableLocalDraft) {
                setCode(localDraft);
                try {
                    const timerResponse = await submissionService.getTimer(assignmentId, aqId, selectedLanguage);
                    if (timerResponse.success && timerResponse.data) {
                        setTimerFromResponse(timerResponse.data);
                    }
                } catch (e) { console.error("Timer fetch failed", e); }
                return;
            }

            const hasDraftForQuestion = Object.prototype.hasOwnProperty.call(codeDrafts, currentQuestionIndex);
            if (hasDraftForQuestion) {
                setCode(codeDrafts[currentQuestionIndex]);
                try {
                    const timerResponse = await submissionService.getTimer(assignmentId, aqId, selectedLanguage);
                    if (timerResponse.success && timerResponse.data) {
                        setTimerFromResponse(timerResponse.data);
                    }
                } catch (e) { console.error("Timer fetch failed", e); }
                return;
            }

            // 3. Load Timer & Draft Code
            try {
                const timerResponse = await submissionService.getTimer(assignmentId, aqId, selectedLanguage);
                if (timerResponse.success && timerResponse.data) {
                    setTimerFromResponse(timerResponse.data);

                    // Load saved code
                    if (timerResponse.data.code_content) {
                        setCode(timerResponse.data.code_content);
                    } else {
                        setCode(getWorkspaceStarterCode(question, selectedLanguage));
                    }
                } else {
                    // New/No Progress
                    setTimeSpent(0);
                    setTimeRemaining(timeLimit);
                    setCode(getWorkspaceStarterCode(question, selectedLanguage));
                }
            } catch (err) {
                console.error("Failed to load timer:", err);
                setTimeSpent(0);
                setTimeRemaining(timeLimit);
                setCode(getWorkspaceStarterCode(question, selectedLanguage));
            }
        };

        if (assignment) {
            loadQuestionData();
        }
    }, [currentQuestionIndex, assignment]);

    // Restart timer when question changes (per-question timer, unless exam/quiz with duration)
    useEffect(() => {
        if (assignment && assignment.questions && assignment.questions.length > 0 && !isReadOnly && timeRemaining > 0 && !isTimerRunning) {
            const isTimedExam = isExamOrQuiz && assignment.duration_minutes;
            if (!isTimedExam) {
                // Only restart per-question timer for regular assignments
                setIsTimerRunning(true);
            }
        }
    }, [currentQuestionIndex, assignment, isReadOnly, timeRemaining, isExamOrQuiz]);

    // Start/continue exam timer when exam data is ready (continuous timer)
    useEffect(() => {
        if (assignment && assignment.questions && assignment.questions.length > 0 && !isReadOnly && timeRemaining > 0 && !isTimerRunning) {
            const isTimedExam = isExamOrQuiz && assignment.duration_minutes;
            if (isTimedExam) {
                setIsTimerRunning(true);
            }
        }
    }, [assignment, isReadOnly, timeRemaining, isExamOrQuiz]);

    // Initial Assignment Fetch & Status Check
    useEffect(() => {
        const fetchAssignment = async () => {
            if (!assignmentId) return;
            try {
                setLoading(true);

                // Parallel fetch: Assignment + Status
                const [assignmentRes, statusRes, progressRes] = await Promise.all([
                    assignmentService.getAssignment(assignmentId),
                    submissionService.getAssignmentStatus(assignmentId),
                    submissionService.getAssignmentProgressWithPoints(assignmentId)
                ]);

                if (!assignmentRes.success) {
                    setError(assignmentRes.message || "Assignment not found.");
                    setLoading(false);
                    return;
                }

                setAssignment(assignmentRes.data);

                // Hydrate question submission states from latest attempts
                if (progressRes?.success && progressRes.data?.questions && assignmentRes.data?.questions) {
                    const aqIndexMap = new Map(
                        assignmentRes.data.questions.map((aq, idx) => [String(aq.id), idx])
                    );

                    const initialCompleted = new Set();
                    const initialStatus = {};

                    progressRes.data.questions.forEach((q) => {
                        const idx = aqIndexMap.get(String(q.assignment_question_id));
                        if (idx === undefined) return;
                        if (!q.status || q.status === "not_attempted") return;

                        initialCompleted.add(idx);

                        if (q.status === "fail" || q.status === "error") {
                            initialStatus[idx] = "fail";
                            return;
                        }

                        if (q.status === "success") {
                            initialStatus[idx] = Number(q.score) >= 100 ? "success" : "fail";
                        }
                    });

                    setCompletedQuestions(initialCompleted);
                    setQuestionSubmissionStatus(initialStatus);
                }

                // lock if submitted
                if (statusRes.data && statusRes.data.status === 'submitted') {
                    setIsReadOnly(true);
                    setIsCompleted(true); // Re-use completion banner or specific one
                }

                // Always clear loading after a successful fetch — loadQuestionData
                // picks up from here via the second useEffect and will not block UI.
                if (!assignmentRes.data || !assignmentRes.data.questions || assignmentRes.data.questions.length === 0) {
                    setLoading(false);
                } else {
                    // Questions exist — loadQuestionData (triggered by assignment state change)
                    // will call setLoading(false). Add a 3-second safety timeout so loading
                    // never stays stuck if loadQuestionData fails silently.
                    setTimeout(() => setLoading(false), 3000);
                }
            } catch {
                setError("Could not load assignment.");
                setLoading(false);
            }
        };
        fetchAssignment();
    }, [assignmentId]);

    // Start timer when component mounts
    useEffect(() => {
        if (assignment && assignment.questions && assignment.questions.length > 0 && !isReadOnly) {
            startTimer();
        }

        // Cleanup on unmount - pause timer and save
        return () => {
            if (!isReadOnly) pauseTimer();
        };
    }, [assignment, isReadOnly]);

    // Timer interval
    useEffect(() => {
        if (isTimerRunning && timeRemaining > 0 && !isReadOnly) {
            timerIntervalRef.current = setInterval(() => {
                setTimeSpent(prev => prev + 1);
                setTimeRemaining(prev => {
                    const newRemaining = prev - 1;

                    // Auto-submit when time runs out
                    if (newRemaining <= 0) {
                        handleTimeUp();
                        return 0;
                    }

                    return newRemaining;
                });
            }, 1000);
        } else {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
            }
        }

        return () => {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
            }
        };
    }, [isTimerRunning, timeRemaining, isReadOnly]);

    // Auto-save timer every 30 seconds
    useEffect(() => {
        if (isReadOnly) return; // Don't auto-save in read-only mode

        const autoSaveInterval = setInterval(() => {
            if (assignment && assignment.questions && assignment.questions.length > 0 && timeSpent > 0) {
                updateTimerOnBackend();
            }
        }, 30000); // 30 seconds

        return () => clearInterval(autoSaveInterval);
    }, [assignment, timeSpent, isReadOnly]);

    // --- Anti-Cheat Tracking (Tab/Window Switches & Fullscreen) ---
    useEffect(() => {
        if (isReadOnly || loading || !assignment || assignment.mode !== 'exam') return;

        // 1. Fullscreen monitoring
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener("fullscreenchange", handleFullscreenChange);

        // 2. Tab/Window Switch monitoring
        const handleVisibilityChange = () => {
            if (document.hidden && document.fullscreenElement !== null) {
                handleCheatDetected("You switched tabs or windows!");
            }
        };

        // 3. Window blur monitoring (do NOT also handle visibilitychange to avoid double-counting)
        const handleWindowBlur = () => {
            // Only fire if fullscreen is active AND page is still visible (pure window-blur, not tab switch)
            if (document.fullscreenElement !== null && !document.hidden) {
                handleCheatDetected("Focus lost from the exam window!");
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("blur", handleWindowBlur);

        return () => {
            document.removeEventListener("fullscreenchange", handleFullscreenChange);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("blur", handleWindowBlur);
        };
        // NOTE: 'warnings' intentionally NOT in deps — we use warningsRef to read current count
        // inside the handler without re-registering listeners on every warning increment.
    }, [isReadOnly, loading, assignment]);

    // Global clipboard restrictions for active workspace (assignment + code area).
    useEffect(() => {
        if (!isClipboardRestricted) return;
        const root = workspaceRootRef.current;
        if (!root) return;

        const blockEvent = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };

        const blockShortcut = (e) => {
            const key = (e.key || "").toLowerCase();
            const isCmdOrCtrl = e.ctrlKey || e.metaKey;
            const isCopyCutPasteShortcut =
                (isCmdOrCtrl && (key === "c" || key === "v" || key === "x" || key === "insert")) ||
                (e.shiftKey && key === "insert");

            if (isCopyCutPasteShortcut) {
                e.preventDefault();
                e.stopPropagation();
            }
        };

        root.addEventListener("keydown", blockShortcut, true);
        root.addEventListener("copy", blockEvent, true);
        root.addEventListener("cut", blockEvent, true);
        root.addEventListener("paste", blockEvent, true);
        root.addEventListener("contextmenu", blockEvent, true);

        return () => {
            root.removeEventListener("keydown", blockShortcut, true);
            root.removeEventListener("copy", blockEvent, true);
            root.removeEventListener("cut", blockEvent, true);
            root.removeEventListener("paste", blockEvent, true);
            root.removeEventListener("contextmenu", blockEvent, true);
        };
    }, [isClipboardRestricted]);

    const handleCheatDetected = (reason) => {
        // Guard against re-entrant calls (native alert() triggers blur/visibilitychange itself)
        if (isCheatHandlingRef.current) return;
        isCheatHandlingRef.current = true;

        warningsRef.current += 1;
        const newWarnings = warningsRef.current;
        setWarnings(newWarnings); // Keep UI state in sync

        if (newWarnings >= MAX_WARNINGS) {
            // Immediately disable further detection before showing modal
            setIsReadOnly(true);
            setWarningModal({
                message: reason,
                count: newWarnings,
                isFinal: true,
            });
            // Auto-submit is triggered when the user dismisses the modal (onClose)
        } else {
            setWarningModal({
                message: reason,
                count: newWarnings,
                isFinal: false,
            });
        }
        // Release lock after a short delay to allow React to re-render the modal
        // before any further events could arrive
        setTimeout(() => { isCheatHandlingRef.current = false; }, 1000);
    };

    const enterFullscreen = async () => {
        try {
            const docElm = document.documentElement;
            if (docElm.requestFullscreen) {
                await docElm.requestFullscreen();
            } else if (docElm.mozRequestFullScreen) { /* Firefox */
                await docElm.mozRequestFullScreen();
            } else if (docElm.webkitRequestFullscreen) { /* Chrome, Safari and Opera */
                await docElm.webkitRequestFullscreen();
            } else if (docElm.msRequestFullscreen) { /* IE/Edge */
                await docElm.msRequestFullscreen();
            } else {
                alert("Your browser does not support fullscreen functionality.");
            }
        } catch (err) {
            console.error("Fullscreen request failed", err);
            alert("Could not automatically enter fullscreen. Please ensure your browser allows it, or click anywhere on the page and try again.");
        }
    };

    // Timer functions
    const startTimer = async () => {
        if (!assignment || !assignment.questions || assignment.questions.length === 0 || isReadOnly) return;

        const aqId = assignment.questions[currentQuestionIndex]?.id; // Use current index
        try {
            await submissionService.startTimer(assignmentId, aqId, selectedLanguage);
            setIsTimerRunning(true);
            lastUpdateRef.current = Date.now();
        } catch (err) {
            console.error("Failed to start timer:", err);
        }
    };

    const pauseTimer = async () => {
        if (isReadOnly) return;
        setIsTimerRunning(false);
        await updateTimerOnBackend();
    };

    const updateTimerOnBackend = async () => {
        if (!assignment || !assignment.questions || assignment.questions.length === 0 || isReadOnly) return;

        const aqId = assignment.questions[currentQuestionIndex]?.id;
        try {
            await submissionService.updateTimer(assignmentId, aqId, timeSpent, selectedLanguage);
        } catch (err) {
            console.error("Failed to update timer:", err);
        }
    };

    const formatTime = (seconds) => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hrs > 0) {
            return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Calculate time limit based on difficulty
    const getTimeLimit = (difficulty) => {
        switch (difficulty?.toLowerCase()) {
            case 'easy': return 30 * 60; // 30 minutes
            case 'medium': return 45 * 60; // 45 minutes  
            case 'hard': return 60 * 60; // 60 minutes
            default: return 45 * 60; // default to 45 minutes
        }
    };

    // Handle when time runs out
    const handleTimeUp = async () => {
        setIsTimerRunning(false);
        setShowExitWarning(false);
        await handleConfirmExit();
    };

    // Handle back button with warning
    const handleBackClick = () => {
        if (isReadOnly) {
            navigate('/student/dashboard');
            return;
        }
        setShowExitWarning(true);
    };

    const persistCurrentQuestionDraft = (draftCode, language = selectedLanguage) => {
        if (!assignment || isReadOnly) return;
        const aqId = assignment.questions?.[currentQuestionIndex]?.id;
        if (!aqId) return;
        saveDraftToStorage(aqId, draftCode, language);
    };

    const handleCodeChange = (nextCode) => {
        setCode(nextCode);
        persistCurrentQuestionDraft(nextCode);
    };

    const getQuestionSubmissionData = async (aq, questionIndex) => {
        const hasInMemoryDraft = Object.prototype.hasOwnProperty.call(codeDrafts, questionIndex);
        let answerValue = questionIndex === currentQuestionIndex
            ? code
            : hasInMemoryDraft
                ? codeDrafts[questionIndex]
                : null;

        if (answerValue === null || answerValue === undefined) {
            const localDraft = getDraftFromStorage(aq.id, selectedLanguage);
            if (localDraft !== null && localDraft !== "") {
                answerValue = localDraft;
            }
        }

        let questionTimeSpent = questionIndex === currentQuestionIndex ? timeSpent : 0;
        try {
            const timerResponse = await submissionService.getTimer(assignmentId, aq.id, selectedLanguage);
            if (timerResponse.success && timerResponse.data) {
                questionTimeSpent = timerResponse.data.time_spent || questionTimeSpent;
                if ((answerValue === null || answerValue === undefined) && timerResponse.data.code_content !== null && timerResponse.data.code_content !== undefined) {
                    answerValue = timerResponse.data.code_content;
                }
            }
        } catch (err) {
            console.error(`Failed to fetch timer data for question ${questionIndex + 1}:`, err);
        }

        if (answerValue === null || answerValue === undefined) {
            answerValue = "";
        }

        return { answerValue, questionTimeSpent };
    };

    const handleConfirmExit = async () => {
        if (isSubmitting) return;
        try {
            setIsSubmitting(true);
            saveToDrafts(currentQuestionIndex, code);

            // Save timer before submitting
            await updateTimerOnBackend();

            const failedToSaveQuestions = [];

            for (let idx = 0; idx < (assignment?.questions?.length || 0); idx++) {
                const aq = assignment.questions[idx];
                const question = aq.question;
                const { answerValue, questionTimeSpent } = await getQuestionSubmissionData(aq, idx);

                const payload = buildQuestionSubmissionPayload({
                    aq,
                    question,
                    answerValue,
                    spentTime: questionTimeSpent,
                });

                const submissionResult = await submitCodeWithRetry(payload);
                if (!submissionResult.ok) {
                    failedToSaveQuestions.push(idx + 1);
                }
            }

            if (failedToSaveQuestions.length > 0) {
                alert(
                    `Could not save submission for question(s): ${failedToSaveQuestions.join(", ")} even after automatic retry. ` +
                    "Please stay on this page and retry submission."
                );
                return;
            }

            const finishResponse = await submissionService.finishAssignment(assignment.id);
            if (!finishResponse.success) {
                alert("All questions were submitted, but final assignment submission failed. Please try again.");
                return;
            }

            clearAssignmentDraftsFromStorage();
            setShowExitWarning(false);
            setShowConfetti(true);
            setTimeout(() => {
                setShowConfetti(false);
                navigate('/student/dashboard');
            }, 3000);

        } catch (err) {
            console.error("Failed to exit:", err);
            alert("Exit & Submit failed. Your local drafts are still saved. Please retry.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // Language change handler
    const handleLanguageChange = async (newLanguage) => {
        if (!currentAQ) return;

        // Save current language draft before switching
        saveDraftToStorage(currentAQ.id, code, selectedLanguage);

        let nextCode = getDraftFromStorage(currentAQ.id, newLanguage);
        const hasUsableLocalDraft = nextCode !== null && nextCode !== "";

        // Try backend draft only if local draft for target language does not exist
        if (!hasUsableLocalDraft) {
            try {
                const timerResponse = await submissionService.getTimer(assignmentId, currentAQ.id, newLanguage);
                if (timerResponse.success && timerResponse.data && timerResponse.data.code_content !== null && timerResponse.data.code_content !== undefined) {
                    nextCode = timerResponse.data.code_content;
                }
            } catch (error) {
                console.error("Error loading language-specific code:", error);
            }
        }

        if (nextCode === null || nextCode === "") {
            nextCode = getWorkspaceStarterCode(assignment?.questions?.[currentQuestionIndex]?.question, newLanguage);
        }

        setSelectedLanguage(newLanguage);
        setCode(nextCode);
        setOutput(null); // Clear previous output
    };

    const handleRunCode = async () => {
        if (!assignment || !assignment.questions?.[currentQuestionIndex]) return;

        setIsRunning(true);
        setOutput({ status: 'running' }); // UI State for "Running..."

        try {
            const aq = assignment.questions[currentQuestionIndex];
            const testCases = aq.question?.test_cases || [];

            console.log("🚀 Starting code execution...");
            console.log("Code:", code);
            console.log("Test cases:", testCases);

            // Call Backend Sandbox with correct format
            const response = await submissionService.runCode({
                code: code,
                language: selectedLanguage, // Use selected language instead of hardcoded "python"
                test_cases: testCases,
                question_id: aq.question?.id
            });

            console.log("✅ Run code response:", response); // Debug log

            // Format result for UI
            // The API client wraps the response, so we need response.data.data
            const resultData = response.data.data || response.data;
            console.log("📊 Result data:", resultData);

            // Calculate if all tests passed
            const allTestsPassed = resultData.results.every(r => r.passed);
            const executionSuccessful = resultData.summary.execution_successful;

            let status = 'error';
            let message = 'Code execution failed';

            if (executionSuccessful) {
                if (allTestsPassed) {
                    status = 'success';
                    message = 'Code executed successfully and all tests passed!';
                } else {
                    status = 'failed';
                    message = 'Code executed, but some test cases failed.';
                }
            } else {
                status = 'error';
                message = 'Code execution crashed or timed out.';
            }

            const formattedOutput = {
                status: status,
                message: message,
                results: resultData.results.map((r, index) => ({
                    id: index,
                    status: r.passed ? 'success' : 'error', // Individual test status
                    output: r.actual_output || '',
                    expected: r.expected_output || '',
                    error: r.error || r.error_message || '',
                    input: r.test_case?.input || testCases[index]?.input || '',
                    showOutputOnly: r.show_output_only || false,
                    testPassed: r.passed
                }))
            };

            console.log("🎯 Formatted output:", formattedOutput);
            setOutput(formattedOutput);

        } catch (err) {
            console.error("❌ Run failed:", err);
            setOutput({
                status: 'error',
                message: 'Execution failed: ' + (err.message || 'Unknown error'),
                results: []
            });
        } finally {
            setIsRunning(false);
        }
    };



    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="text-center">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mx-auto mb-4" />
                    <p className="text-gray-500 font-medium">Loading workspace...</p>
                </div>
            </div>
        );
    }

    if (error || !assignment) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="text-center">
                    <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Error Loading Assignment</h2>
                    <p className="text-gray-500 mb-6">{error || "Assignment not found."}</p>
                    <Button onClick={() => navigate('/student/dashboard')}>Back to Dashboard</Button>
                </div>
            </div>
        );
    }

    // Helpers
    const currentQuestion = assignment?.questions?.[currentQuestionIndex]?.question || {};
    const currentAQ = assignment?.questions?.[currentQuestionIndex];
    const totalQuestions = assignment?.questions?.length || 0;
    const allQuestionsSubmitted = totalQuestions > 0 && completedQuestions.size >= totalQuestions;
    const testCases = currentQuestion.test_cases || [];

    // Save current code to draft
    const saveToDrafts = (index, currentCode) => {
        setCodeDrafts(prev => ({
            ...prev,
            [index]: currentCode
        }));

        const aqId = assignment?.questions?.[index]?.id;
        if (aqId) {
            saveDraftToStorage(aqId, currentCode, selectedLanguage);
        }
    };

    // Navigation Handlers
    const switchToQuestion = async (nextIndex) => {
        if (isReadOnly) {
            setCurrentQuestionIndex(nextIndex);
            setOutput(null);
            return;
        }

        if (nextIndex === currentQuestionIndex) return;
        if (nextIndex < 0 || nextIndex >= totalQuestions) return;

        // Persist current question state before switching so timer resumes correctly.
        setIsTimerRunning(false);
        saveToDrafts(currentQuestionIndex, code);
        await updateTimerOnBackend();

        setCurrentQuestionIndex(nextIndex);
        setOutput(null);
    };

    const handleNextQuestion = async () => {
        if (currentQuestionIndex < totalQuestions - 1) {
            await switchToQuestion(currentQuestionIndex + 1);
        }
    };

    const handlePrevQuestion = async () => {
        if (currentQuestionIndex > 0) {
            await switchToQuestion(currentQuestionIndex - 1);
        }
    };

    // Polling Logic for Async Submissions
    const pollSubmission = (attemptId, questionIndex = currentQuestionIndex, questionTestCases = testCases) => {
        const POLL_INTERVAL = 1000; // 1s — faster feedback
        const MAX_ATTEMPTS = 120; // 2 minutes max wait

        let attempts = 0;

        const checkStatus = async () => {
            try {
                if (attempts >= MAX_ATTEMPTS) {
                    setIsSubmitting(false);
                    setWarningModal({ message: "Submission is taking too long. Please check your dashboard later.", count: 0, isFinal: false });
                    return;
                }

                const response = await submissionService.getSubmission(attemptId);
                if (!response.success || !response.data) {
                    attempts++;
                    setTimeout(checkStatus, POLL_INTERVAL);
                    return;
                }
                const attempt = response.data;

                // Terminal states that should stop polling
                const terminalStates = ['success', 'fail', 'error'];

                if (!terminalStates.includes(attempt.status)) {
                    attempts++;
                    // Continue polling for all other states (pending, queued, processing, etc.)
                    setTimeout(checkStatus, POLL_INTERVAL);
                } else {
                    // Completed
                    setIsSubmitting(false);
                    processSubmissionResult(attempt, questionIndex, questionTestCases);
                    // fail/error details are already shown in the output panel
                }
            } catch (err) {
                console.error("Polling error:", err);
                setIsSubmitting(false);
                // Don't alert — just log; student sees nothing changed in the output panel
            }
        };

        // Start polling
        checkStatus();
    };

    // Updated Submit Handler
    const handleSubmit = async () => {
        if (!currentAQ) {
            console.error("Submit failed: currentAQ is missing", { assignment, currentQuestionIndex });
            alert("Error: Question data not found. Please refresh the page.");
            return;
        }

        if (isReadOnly) {
            alert("This assignment is submitted and read-only.");
            return;
        }

        console.log("Submitting code...", {
            assignment_id: assignment.id,
            assignment_question_id: currentAQ.id,
            question_id: currentQuestion.id,
            language: selectedLanguage
        });

        setIsSubmitting(true);
        try {
            await updateTimerOnBackend();
            saveToDrafts(currentQuestionIndex, code);

            const payload = buildQuestionSubmissionPayload({
                aq: currentAQ,
                question: currentQuestion,
                answerValue: code,
                spentTime: timeSpent
            });

            const submissionResult = await submitCodeWithRetry(payload);
            if (!submissionResult.ok) {
                const errorMessage = getApiErrorMessage(submissionResult.response);
                alert(
                    `Submission failed to save after automatic retry. ${errorMessage}\n` +
                    "Your code is kept locally and will be recalled automatically."
                );
                setIsSubmitting(false);
                return;
            }

            if (submissionResult.alreadyCompleted) {
                setCompletedQuestions(prev => new Set(prev).add(currentQuestionIndex));
                setIsSubmitting(false);
                return;
            }

            const attempt = submissionResult.response?.data;
            if (!attempt || !attempt.status) {
                alert("Submission failed due to an unexpected server response. Your code is still saved locally.");
                setIsSubmitting(false);
                return;
            }

            if (attempt.status === 'queued' || attempt.status === 'processing') {
                // Async: Start Polling
                // Note: We do NOT set isSubmitting(false) here. Polling handles it.
                pollSubmission(attempt.id, currentQuestionIndex, testCases);
            } else {
                // Sync / Immediate Result
                processSubmissionResult(attempt, currentQuestionIndex, testCases);
                setIsSubmitting(false);
            }

        } catch (err) {
            console.error("Submission failed:", err);
            setIsSubmitting(false);
            alert("Submission failed unexpectedly. Your code is still saved locally.");
        }
    };

    const processSubmissionResult = (attempt, questionIndex = currentQuestionIndex, questionTestCases = testCases) => {
        if (!attempt || !attempt.test_results) {
            setCompletedQuestions(prev => new Set(prev).add(questionIndex));
            setQuestionSubmissionStatus(prev => ({ ...prev, [questionIndex]: "fail" }));
            if (questionIndex === currentQuestionIndex) {
                setOutput({
                    status: "failed",
                    message: "Submission saved, but test results were not returned.",
                    results: []
                });
            }
            return;
        }

        const formattedResults = attempt.test_results.map((r, idx) => ({
            id: idx,
            status: r.status === 'pass' ? 'success' : 'error',
            output: r.actual_output || '',
            expected: questionTestCases[idx]?.expected_output || '',
            error: r.error_message || '',
            input: questionTestCases[idx]?.input || '',
            testPassed: r.status === 'pass'
        }));

        const hasResults = formattedResults.length > 0;
        const allPassed = hasResults && formattedResults.every(r => r.status === 'success');
        const submissionStatus = allPassed ? "success" : "fail";

        if (questionIndex === currentQuestionIndex) {
            setOutput({
                status: allPassed ? 'success' : 'failed',
                message: allPassed ? 'All Test Cases Passed! Great Job!' : 'Some test cases failed. Review details below.',
                results: formattedResults
            });
        }

        setCompletedQuestions(prev => new Set(prev).add(questionIndex));
        setQuestionSubmissionStatus(prev => ({ ...prev, [questionIndex]: submissionStatus }));

        if (questionIndex === currentQuestionIndex) {
            pauseTimer();
        }

        const aqId = assignment?.questions?.[questionIndex]?.id;
        if (aqId) {
            clearDraftFromStorage(aqId, selectedLanguage);
        }

        setCodeDrafts(prev => {
            if (!Object.prototype.hasOwnProperty.call(prev, questionIndex)) return prev;
            const next = { ...prev };
            delete next[questionIndex];
            return next;
        });
    };

    const handleFinishAssignment = async () => {
        try {
            setIsSubmitting(true);
            const finishResponse = await submissionService.finishAssignment(assignment.id);
            if (!finishResponse.success) {
                throw new Error(getApiErrorMessage(finishResponse));
            }
            clearAssignmentDraftsFromStorage();

            // Show Success Modal
            setShowConfetti(true);

            // Navigate after delay
            setTimeout(() => {
                setShowConfetti(false);
                navigate('/student/dashboard');
            }, 3000);

        } catch (error) {
            console.error("Failed to finish assignment:", error);
            alert("Error finishing assignment: " + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSaveAndNext = async () => {
        saveToDrafts(currentQuestionIndex, code);
        if (currentQuestionIndex < totalQuestions - 1) {
            await switchToQuestion(currentQuestionIndex + 1);
        }
    };

    const handleSkipAndNext = async () => {
        saveToDrafts(currentQuestionIndex, code);
        if (currentQuestionIndex < totalQuestions - 1) {
            await switchToQuestion(currentQuestionIndex + 1);
        }
    };

    const handleSubmitAndEnd = async () => {
        saveToDrafts(currentQuestionIndex, code);
        setIsSubmitting(true);
        try {
            await updateTimerOnBackend();

            if (currentAQ) {
                const payload = buildQuestionSubmissionPayload({
                    aq: currentAQ,
                    question: currentQuestion,
                    answerValue: code,
                    spentTime: timeSpent
                });
                const submissionResult = await submitCodeWithRetry(payload);
                if (!submissionResult.ok) {
                    const errorMessage = getApiErrorMessage(submissionResult.response);
                    alert(
                        `Submission failed to save after automatic retry. ${errorMessage}\n` +
                        "Your code is kept locally. The test will still end."
                    );
                }
            }

            const finishResponse = await submissionService.finishAssignment(assignment.id);
            if (!finishResponse.success) {
                throw new Error(getApiErrorMessage(finishResponse));
            }
            clearAssignmentDraftsFromStorage();
            setShowConfetti(true);
            setTimeout(() => {
                setShowConfetti(false);
                navigate('/student/dashboard');
            }, 3000);
        } catch (error) {
            console.error("Failed to submit and finish:", error);
            alert("Error: " + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClipboardRestriction = (e) => {
        if (isClipboardRestricted || isReadOnly) {
            e.preventDefault();
        }
    };

    return (
        <div ref={workspaceRootRef} className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 font-sans overflow-hidden">

            {/* Anti-Cheat Fullscreen Blocking Overlay */}
            {!isReadOnly && !loading && !error && assignment && assignment.mode === 'exam' && !isFullscreen && (
                <div className="fixed inset-0 z-50 bg-gray-900/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8 max-w-md w-full border-t-4 border-indigo-600">
                        <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Settings className="w-8 h-8 text-indigo-600 animate-spin-slow" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Strict Mode Active</h2>
                        <div className="text-gray-600 text-sm mb-6 space-y-2">
                            <p>This assignment runs in a restricted environment.</p>
                            <ul className="text-left bg-gray-50 dark:bg-gray-900 p-3 rounded-lg border border-gray-100 dark:border-gray-800 space-y-1 text-xs">
                                <li>• You must remain in Fullscreen mode.</li>
                                <li>• Switching tabs or windows is recorded.</li>
                                <li>• 3 warnings will result in auto-submission.</li>
                                <li>• Copying/pasting is disabled.</li>
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

            {/* Anti-Cheat Warning Modal — replaces alert() to avoid focus-loss cascade */}
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
                            <p className="text-red-600 text-sm text-center font-medium mb-4">
                                Your assignment is being automatically submitted.
                            </p>
                        ) : (
                            <p className="text-gray-500 text-xs text-center mb-4">
                                {MAX_WARNINGS - warningModal.count} more warning(s) will trigger auto-submission.
                            </p>
                        )}
                        <button
                            className={`w-full py-2 rounded-lg font-semibold text-white transition-colors ${warningModal.isFinal ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-500 hover:bg-amber-600'}`}
                            onClick={() => {
                                const wasFinal = warningModal.isFinal;
                                setWarningModal(null);
                                if (wasFinal) {
                                    handleTimeUp(); // Trigger auto-submit AFTER modal is closed
                                }
                            }}
                        >
                            {warningModal.isFinal ? 'Acknowledged — Submit Now' : 'I Understand, Return to Exam'}
                        </button>
                    </div>
                </div>
            )}

            {/* Completed Banner */}
            {isReadOnly && (
                <div className="bg-amber-100 border-b border-amber-200 px-4 py-2 text-amber-800 text-sm font-medium flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    This assignment has been submitted and is now read-only.
                </div>
            )}

            {/* 1. HEADER */}
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
                            {assignment.title}
                        </h1>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span className={`px-1.5 py-0.5 rounded border ${assignment.difficulty === 'Hard' ? 'bg-red-50 border-red-100 text-red-700' :
                                assignment.difficulty === 'Medium' ? 'bg-amber-50 border-amber-100 text-amber-700' :
                                    'bg-green-50 border-green-100 text-green-700'
                                }`}>
                                {assignment.difficulty || "Medium"}
                            </span>
                            <span>•</span>
                            <Clock className="w-3 h-3" />
                            <span className={timeRemaining < 300 ? "text-red-600 font-bold" : ""}>
                                {formatTime(timeRemaining)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Question Palette / Navigation */}
                <QuestionPalette
                    currentQuestionIndex={currentQuestionIndex}
                    totalQuestions={totalQuestions}
                    questionStatusMap={questionSubmissionStatus}
                    onSelectQuestion={switchToQuestion}
                    onNext={handleNextQuestion}
                    onPrev={handlePrevQuestion}
                />

                <div className="flex items-center gap-3">
                    {/* Compact Points Display Removed */}


                    {/* Read-Only Mode Navigation */}
                    {isReadOnly ? (
                        <div className="flex items-center gap-2">
                            {currentQuestionIndex > 0 && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handlePrevQuestion}
                                    className="h-9 shadow-sm gap-2"
                                >
                                    <ChevronLeft className="w-4 h-4" /> Prev
                                </Button>
                            )}

                            {currentQuestionIndex < totalQuestions - 1 ? (
                                <Button
                                    size="sm"
                                    onClick={handleNextQuestion}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white h-9 shadow-sm gap-2"
                                >
                                    Next <ChevronDown className="w-4 h-4 -rotate-90" />
                                </Button>
                            ) : (
                                <Button
                                    size="sm"
                                    onClick={() => navigate('/student/dashboard')}
                                    className="bg-gray-900 hover:bg-gray-800 text-white h-9 shadow-sm gap-2"
                                >
                                    Back to Dashboard <ArrowRight className="w-4 h-4" />
                                </Button>
                            )}
                        </div>
                    ) : (
                        /* Normal Submission Mode */
                        !isExamOrQuiz && completedQuestions.has(currentQuestionIndex) ? (
                            <div className="flex items-center gap-2">
                                {/* Allow Retry */}
                                <Button
                                    size="sm"
                                    variant="outline"

                                    onClick={handleSubmit}
                                    disabled={isRunning || isSubmitting}
                                    className="h-9 shadow-sm gap-2"
                                >
                                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    Submit
                                </Button>

                                {allQuestionsSubmitted || currentQuestionIndex === totalQuestions - 1 ? (
                                    <Button
                                        size="sm"
                                        onClick={handleFinishAssignment}
                                        className="bg-blue-600 hover:bg-blue-700 text-white h-9 shadow-sm gap-2"
                                    >
                                        Finish Assignment <CheckCircle2 className="w-4 h-4" />
                                    </Button>
                                ) : (
                                    <Button
                                        size="sm"
                                        onClick={handleNextQuestion}
                                        className="bg-green-600 hover:bg-green-700 text-white h-9 shadow-sm gap-2"
                                    >
                                        Next Question <ChevronDown className="w-4 h-4 -rotate-90" />
                                    </Button>
                                )}
                            </div>
                        ) : (
                            /* Not Completed */
                            <>
                                {currentQuestion.question_type !== 'mcq' && (
                                    <>
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

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleSkipAndNext}
                                            disabled={isRunning || isSubmitting}
                                            className="h-9 text-amber-700 border-amber-300 hover:bg-amber-50 gap-1.5"
                                        >
                                            <SkipForward className="w-4 h-4" />
                                            Skip & Next
                                        </Button>
                                    </>
                                )}

                                <Button
                                    size="sm"
                                    onClick={handleSubmit}
                                    disabled={isRunning || isSubmitting}
                                    className="bg-green-600 hover:bg-green-700 text-white h-9 shadow-sm"
                                >
                                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                                    Submit
                                </Button>

                                <Button
                                    size="sm"
                                    onClick={handleSubmitAndEnd}
                                    disabled={isRunning || isSubmitting}
                                    className="bg-blue-600 hover:bg-blue-700 text-white h-9 shadow-sm gap-1.5"
                                >
                                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                                    Submit & End
                                </Button>
                            </>
                        )
                    )}
                </div>
            </header>

            {/* 2. MAIN WORKSPACE */}
            <div className="flex-1 w-full overflow-hidden flex">
                {/* LEFT PANEL: Description */}
                <div
                    className="w-[35%] min-w-[300px] max-w-[600px] bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col h-full"
                    onCopy={handleClipboardRestriction}
                    onCut={handleClipboardRestriction}
                    onPaste={handleClipboardRestriction}
                    onContextMenu={handleClipboardRestriction}
                >
                    <div className="flex-1 overflow-y-auto p-6">
                        <div className="mb-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-2 select-none">
                                {currentQuestionIndex + 1}. {currentQuestion.title}
                            </h2>
                            <Separator className="my-4" />

                            <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap select-none">
                                <ReactMarkdown>
                                    {currentQuestion.description || assignment.description}
                                </ReactMarkdown>
                            </div>
                        </div>

                        {/* Test Cases Preview (Optional) */}
                        <div className="mt-6">
                            <h3 className="text-sm font-semibold text-gray-900 mb-3">Example Test Cases</h3>
                            <div className="space-y-3">
                                {testCases.slice(0, 2).map((tc, idx) => (
                                    <div key={idx} className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 text-xs font-mono border border-gray-200 dark:border-gray-700 select-none">
                                        <div className="grid grid-cols-2 gap-2 mb-1">
                                            <span className="text-gray-500">Input:</span>
                                            <span className="text-gray-900">{tc.input}</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <span className="text-gray-500">Output:</span>
                                            <span className="text-gray-900">{tc.expected_output || tc.output}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {currentQuestion.hint && (
                            <div className="mt-8 border-t border-gray-100 dark:border-gray-800 pt-4">
                                <button
                                    onClick={() => setShowHint(!showHint)}
                                    className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                                >
                                    <Lightbulb className="w-4 h-4" />
                                    {showHint ? 'Hide Hint' : 'Need a Hint?'}
                                </button>
                                {showHint && (
                                    <Motion.div
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="mt-3 bg-amber-50 text-amber-900 p-3 rounded-md text-sm border border-amber-100"
                                    >
                                        {currentQuestion.hint}
                                    </Motion.div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT PANEL: Editor & Output - TAKES REMAINING SPACE */}
                <div className="flex-1 bg-white dark:bg-gray-800 flex flex-col h-full">
                    {currentQuestion?.question_type === 'mcq' ? (
                        <div className="flex-1 overflow-hidden">
                            <McqWorkspaceRenderer
                                question={currentQuestion}
                                selectedOption={code}
                                onChange={handleCodeChange}
                                disabled={isReadOnly || isSubmitting}
                            />
                        </div>
                    ) : (
                        <PanelGroup direction="vertical" className="flex-1">
                            <Panel defaultSize={60} minSize={10} className="flex flex-col">
                                <div className="flex-1 min-h-0 flex flex-col bg-[#2d2d2d]">
                                    <div className="bg-[#2d2d2d] border-b border-[#111] px-4 h-9 flex justify-between items-center text-xs text-gray-400 select-none flex-shrink-0">
                                        <div className="flex items-center gap-2">
                                            {/* Language Dropdown */}
                                            <div className="relative">
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
                                        </div>
                                        <span
                                            className="hover:text-white cursor-pointer transition-colors flex items-center gap-1"
                                            onClick={() => handleCodeChange(getWorkspaceStarterCode(currentQuestion, selectedLanguage))}
                                        >
                                            <RotateCcw className="w-3 h-3" /> Reset
                                        </span>
                                    </div>

                                    <div
                                        className="flex-1 relative overflow-hidden bg-[#1e1e1e]"
                                        onCopy={handleClipboardRestriction}
                                        onCut={handleClipboardRestriction}
                                        onPaste={handleClipboardRestriction}
                                        onContextMenu={handleClipboardRestriction}
                                    >
                                        <MonacoEditor
                                            height="100%"
                                            language={languageConfig[selectedLanguage].monacoLang}
                                            value={code}
                                            theme="vs-dark"
                                            onChange={(value) => handleCodeChange(value || '')}
                                            onMount={handleMonacoMount}
                                            options={{
                                                fontSize: 14,
                                                fontFamily: '"Fira Code", "Fira Mono", monospace',
                                                fontLigatures: true,
                                                minimap: { enabled: false },
                                                scrollBeyondLastLine: false,
                                                wordWrap: 'on',
                                                readOnly: isReadOnly || isSubmitting,
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
                                                contextmenu: false, // disable right-click copy/paste menu
                                            }}
                                        />
                                    </div>
                                </div>
                            </Panel>

                            <PanelResizeHandle className="h-1.5 bg-gray-800 hover:bg-indigo-500 transition-colors cursor-row-resize flex items-center justify-center relative">
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className="w-8 h-0.5 bg-gray-600 rounded-full opacity-50 shadow-sm"></div>
                                </div>
                            </PanelResizeHandle>

                            <Panel defaultSize={40} minSize={10} className="flex flex-col">
                                <div className="flex-1 min-h-0 bg-white dark:bg-gray-800 flex flex-col">
                                    <div className="h-9 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 select-none flex-shrink-0">
                                        <div className="flex items-center gap-2">
                                            <div className="flex items-center gap-2 text-gray-500 font-medium text-xs">
                                                <Terminal className="w-3.5 h-3.5" />
                                                Output
                                            </div>
                                            {isRunning && <span className="text-xs text-indigo-600 animate-pulse">Running Code...</span>}
                                            {output?.status === 'error' && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                                            {output?.status === 'failed' && <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />}
                                            {output?.status === 'success' && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                                        </div>
                                    </div>

                                    <div className="flex-1 overflow-auto p-4">
                                        {!output && !isRunning && (
                                            <div className="flex flex-col items-center justify-center text-gray-400 h-full">
                                                <Terminal className="w-12 h-12 mb-2 opacity-50" />
                                                <span className="text-sm">Click "Run Code" to see your output here</span>
                                            </div>
                                        )}

                                        {isRunning && (
                                            <div className="flex flex-col items-center justify-center text-blue-600 h-full">
                                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
                                                <span className="text-sm">Running your Python code...</span>
                                            </div>
                                        )}

                                        {output && (
                                            <div className="space-y-4">
                                                {/* Status */}
                                                <div className={`p-3 rounded-lg border ${output.status === 'success' ? 'bg-green-50 border-green-200' :
                                                    output.status === 'failed' ? 'bg-orange-50 border-orange-200' :
                                                        'bg-red-50 border-red-200'
                                                    }`}>
                                                    <div className="flex flex-col gap-2">
                                                        <div className="flex items-center gap-2">
                                                            {output.status === 'success' && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                                                            {output.status === 'failed' && <XCircle className="w-4 h-4 text-orange-600" />}
                                                            {output.status === 'error' && <XCircle className="w-4 h-4 text-red-600" />}

                                                            <span className={`font-medium text-sm ${output.status === 'success' ? 'text-green-800' :
                                                                output.status === 'failed' ? 'text-orange-800' :
                                                                    'text-red-800'
                                                                }`}>
                                                                {output.message}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Main Output Display */}
                                                {output.results && output.results.length > 0 && (
                                                    <div className="space-y-3">
                                                        {output.results.map((result, idx) => (
                                                            <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                                                                {/* Output Header */}
                                                                <div className="bg-blue-50 px-4 py-2 border-b border-blue-200">
                                                                    <h3 className="font-semibold text-blue-800 text-sm flex items-center gap-2">
                                                                        <Terminal className="w-4 h-4" />
                                                                        Your Code Output
                                                                        {result.error && <span className="text-red-600 text-xs">(Error)</span>}
                                                                    </h3>
                                                                </div>

                                                                <div className="p-4 space-y-3">
                                                                    {/* Input (if any) */}
                                                                    {result.input && (
                                                                        <div>
                                                                            <div className="text-xs font-semibold text-gray-500 mb-1">INPUT PROVIDED:</div>
                                                                            <div className="bg-gray-100 dark:bg-gray-800 p-2 rounded text-sm font-mono border">
                                                                                {result.input}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {/* Main Output - Most Important */}
                                                                    <div>
                                                                        <div className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                                                            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-bold">OUTPUT</span>
                                                                            What your code printed:
                                                                        </div>
                                                                        <div className={`p-3 rounded border-2 text-sm font-mono ${result.error ? 'bg-red-50 border-red-300 text-red-800' :
                                                                            result.testPassed ? 'bg-green-50 border-green-300 text-green-800' :
                                                                                'bg-orange-50 border-orange-300 text-orange-900'
                                                                            }`}>
                                                                            {result.error ? (
                                                                                <div>
                                                                                    <div className="font-bold text-red-600 mb-1">❌ Error:</div>
                                                                                    <div className="whitespace-pre-wrap">{result.error}</div>
                                                                                </div>
                                                                            ) : (
                                                                                <div className="whitespace-pre-wrap">
                                                                                    {result.output || <span className="text-gray-500 italic">(no output)</span>}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    {/* Test Comparison (Secondary) */}
                                                                    {result.expected && (
                                                                        <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
                                                                            <div className="text-xs font-semibold text-gray-500 mb-2">📋 Test Comparison:</div>
                                                                            <div className="grid grid-cols-2 gap-3 text-xs">
                                                                                <div>
                                                                                    <div className="font-semibold text-gray-600 mb-1">Expected:</div>
                                                                                    <div className="bg-blue-100 p-2 rounded font-mono text-blue-800 whitespace-pre-wrap">
                                                                                        {result.expected}
                                                                                    </div>
                                                                                </div>
                                                                                <div>
                                                                                    <div className="font-semibold text-gray-600 mb-1">Your Output:</div>
                                                                                    <div className={`p-2 rounded font-mono whitespace-pre-wrap ${result.testPassed ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
                                                                                        }`}>
                                                                                        {result.output || '(no output)'}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                            <div className={`mt-2 text-xs font-medium ${result.testPassed ? 'text-green-600' : 'text-orange-600'}`}>
                                                                                {result.testPassed ? '✅ Matches expected output' : '❌ Output mismatch'}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Debug info (remove this later) */}
                                                <details className="text-xs text-gray-500">
                                                    <summary className="cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">Debug Info (click to expand)</summary>
                                                    <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded overflow-auto text-xs">
                                                        {JSON.stringify(output, null, 2)}
                                                    </pre>
                                                </details>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </Panel>
                        </PanelGroup>
                    )
                    }
                </div>
            </div>

            {/* Exit Warning Modal */}
            <AnimatePresence>
                {showExitWarning && (
                    <Motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[1px]"
                    >
                        <Motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-2xl text-center max-w-md w-full mx-4"
                        >
                            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <XCircle className="w-8 h-8 text-amber-600" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">Exit Assignment?</h2>
                            <p className="text-gray-500 mb-6">
                                If you click on "Exit Assignment", the assignment will be submitted automatically.
                                Your current code and progress will be saved and submitted.
                            </p>
                            <div className="flex gap-3">
                                <Button
                                    variant="outline"
                                    onClick={() => setShowExitWarning(false)}
                                    className="flex-1"
                                    disabled={isSubmitting}
                                >
                                    Continue Working
                                </Button>
                                <Button
                                    onClick={handleConfirmExit}
                                    className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? 'Submitting...' : 'Exit & Submit Assignment'}
                                </Button>
                            </div>
                        </Motion.div>
                    </Motion.div>
                )}
            </AnimatePresence>

            {/* Success Modal */}
            <AnimatePresence>
                {showConfetti && (
                    <Motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[1px]"
                    >
                        <Motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-2xl text-center max-w-sm w-full mx-4"
                        >
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <CheckCircle2 className="w-8 h-8 text-green-600" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">Assignment Submitted Successfully!</h2>
                            <p className="text-gray-500 mb-6">Your assignment has been automatically submitted and sent for grading. You will be redirected to the dashboard in a few seconds.</p>
                            <Button onClick={() => navigate('/student/dashboard')} className="w-full bg-gray-900 text-white">
                                Back to Dashboard
                            </Button>
                        </Motion.div>
                    </Motion.div>
                )}
            </AnimatePresence>
        </div >
    );
};

export default StudentWorkspace;
