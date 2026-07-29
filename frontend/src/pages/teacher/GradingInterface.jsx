import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";

import {
    MoveLeft,
    CheckCircle2,
    XCircle,
    Play,
    Save,
    ChevronRight,
    TerminalSquare,
    History,
    Loader2,
    FileCode2,
    AlertCircle,
    Bot,
    Sparkles,
    Brain
} from "lucide-react";

import TeacherLayout from "../../components/layout/TeacherLayout";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { submissionService } from "../../services/submissionService";
import LearningTrajectory from "../../components/features/analytics/LearningTrajectory";
import ErrorBoundary from "../../components/features/gamification/ErrorBoundary";

export default function GradingInterface() {
    const { assignmentId, studentId } = useParams();
    const navigate = useNavigate();

    // Data State
    const [report, setReport] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // UI State
    const [selectedQuestionId, setSelectedQuestionId] = useState(null);
    // gradesMap: { [questionId]: { score: number, feedback: string, submissionId: number, isDirty: boolean } }
    const [gradesMap, setGradesMap] = useState({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const fetchReport = async () => {
            try {
                setLoading(true);
                const response = await submissionService.getStudentReport(assignmentId, studentId);
                setReport(response.data);

                // Initialize gradesMap
                const initialMap = {};
                response.data.forEach(item => {
                    if (item.submission) {
                        initialMap[item.question.id] = {
                            score: item.submission.manual_score !== null ? item.submission.manual_score : (item.submission.final_score || 0),
                            feedback: item.submission.feedback_text || "",
                            submissionId: item.submission.id,
                            isDirty: false
                        };
                    }
                });
                setGradesMap(initialMap);

                // Select first question by default if available
                if (response.data && response.data.length > 0) {
                    setSelectedQuestionId(response.data[0].question.id);
                }
            } catch (err) {
                console.error("Failed to load student report:", err);
                setError("Failed to load data.");
            } finally {
                setLoading(false);
            }
        };
        fetchReport();
    }, [assignmentId, studentId]);

    // Helpers to update temporary state
    const updateScore = (val) => {
        if (!selectedQuestionId) return;
        setGradesMap(prev => ({
            ...prev,
            [selectedQuestionId]: {
                ...prev[selectedQuestionId],
                score: val,
                isDirty: true
            }
        }));
    };

    const updateFeedback = (val) => {
        if (!selectedQuestionId) return;
        setGradesMap(prev => ({
            ...prev,
            [selectedQuestionId]: {
                ...prev[selectedQuestionId],
                feedback: val,
                isDirty: true
            }
        }));
    };

    // No longer need this effect to set local manualScore/feedback state
    // We derive values directly from gradesMap in render

    const handleSave = async () => {
        // Find all dirty entries
        const dirtyEntries = Object.entries(gradesMap).filter(([, data]) => data.isDirty);

        if (dirtyEntries.length === 0) {
            // Nothing to save, just go back
            navigate(`/teacher/assignment/${assignmentId}`);
            return;
        }

        try {
            setSaving(true);

            // Execute all saves concurrently
            await Promise.all(dirtyEntries.map(([, data]) => {
                if (!data.submissionId) return Promise.resolve();
                return submissionService.gradeSubmission(data.submissionId, {
                    manual_score: data.score,
                    feedback_text: data.feedback
                });
            }));

            // navigate to dashboard
            navigate(`/teacher/assignment/${assignmentId}`);
        } catch (err) {
            console.error("Failed to save grades:", err);
            alert("Failed to save some grades. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    const isSubmissionCorrect = (item) => {
        const sub = item?.submission;
        if (!sub) return false;
        if (sub.status === "success") return true;
        const results = sub.test_results || [];
        return results.length > 0 && results.every((r) => r.status === "pass");
    };

    const handleAutoSaveCorrectGrades = async () => {
        const correctItems = report.filter(isSubmissionCorrect);
        const updates = correctItems
            .map((item) => {
                const qid = item.question.id;
                const current = gradesMap[qid];
                const submissionId = current?.submissionId || item.submission?.id;
                if (!submissionId) return null;
                const feedback = current?.feedback ?? item.submission?.feedback_text ?? "";
                return { qid, submissionId, feedback };
            })
            .filter(Boolean);

        if (updates.length === 0) {
            alert("No correct submissions found to auto-save.");
            return;
        }

        try {
            setSaving(true);
            await Promise.all(
                updates.map((u) =>
                    submissionService.gradeSubmission(u.submissionId, {
                        manual_score: 100,
                        feedback_text: u.feedback,
                    })
                )
            );

            setGradesMap((prev) => {
                const next = { ...prev };
                updates.forEach((u) => {
                    const prevEntry = next[u.qid] || {};
                    next[u.qid] = {
                        ...prevEntry,
                        score: 100,
                        feedback: u.feedback,
                        submissionId: u.submissionId,
                        isDirty: false,
                    };
                });
                return next;
            });

            alert(`Auto-saved 100% for ${updates.length} correct question${updates.length === 1 ? "" : "s"}.`);
        } catch (err) {
            console.error("Failed to auto-save correct grades:", err);
            alert("Failed to auto-save correct grades. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    const currentItem = report.find(item => item.question.id === selectedQuestionId);
    const submission = currentItem?.submission;
    const currentQuestionIndex = report.findIndex(item => item.question.id === selectedQuestionId);
    const autoSavableCorrectCount = report.filter(isSubmissionCorrect).length;

    // Derived values for current inputs
    const currentGradeData = selectedQuestionId && gradesMap[selectedQuestionId]
        ? gradesMap[selectedQuestionId]
        : { score: 0, feedback: "" };

    if (loading) {
        return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>;
    }

    if (error) {
        return <div className="p-8 text-center text-red-500">{error}</div>;
    }

    return (
        <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
            {/* Top Bar */}
            <header className="h-16 bg-white dark:bg-gray-800 border-b px-4 flex items-center justify-between shrink-0 z-10 shadow-sm">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link to={`/teacher/assignment/${assignmentId}`}>
                            <MoveLeft className="w-5 h-5" />
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-lg font-bold text-gray-900">Grading Student</h1>
                        <p className="text-xs text-gray-500 flex items-center gap-2">
                            Assignment ID: {assignmentId?.slice(0, 8)}... <span className="text-gray-300">|</span> Student ID: {studentId?.slice(0, 8)}...
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {autoSavableCorrectCount > 0 && (
                        <Button variant="outline" onClick={handleAutoSaveCorrectGrades} className="gap-2" disabled={saving}>
                            <CheckCircle2 className="w-4 h-4" />
                            Auto-Save Correct ({autoSavableCorrectCount})
                        </Button>
                    )}
                    {submission && (
                        <Button onClick={handleSave} className="gap-2" disabled={saving}>
                            {saving ? <Loader2 className="animate-spin w-4 h-4" /> : <Save className="w-4 h-4" />}
                            Save Grade
                        </Button>
                    )}
                </div>
            </header>

            {/* Question Navigation (Top Center) */}
            <div className="h-14 bg-white dark:bg-gray-800 border-b px-4 flex items-center justify-center shrink-0">
                <div className="w-full max-w-5xl overflow-x-auto">
                    <div className="mx-auto flex w-max items-center gap-2 py-1">
                        {report.map((item, idx) => {
                            const isDirty = gradesMap[item.question.id]?.isDirty;
                            const isSelected = selectedQuestionId === item.question.id;
                            const passed = item.submission?.test_results?.filter(r => r.status === 'pass').length ?? 0;
                            const total = item.submission?.test_results?.length ?? 0;

                            return (
                                <button
                                    key={item.question.id}
                                    onClick={() => setSelectedQuestionId(item.question.id)}
                                    className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors flex items-center gap-1.5
                                    ${isSelected ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'}
                                `}
                                >
                                    <span>Q{idx + 1}</span>
                                    {total > 0 && <span className="text-[10px] opacity-75">{passed}/{total}</span>}
                                    {isDirty && <span className="text-amber-500 text-[10px]">●</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Main Content - Split Pane */}
            <div className="flex-1 flex overflow-hidden">
                <ErrorBoundary
                    key={selectedQuestionId}
                    title="Couldn't display this question"
                    message="This submission has data we couldn't render. You can still grade it from the panel, switch questions, or retry."
                >
                {currentItem ? (
                        <>
                            {/* 1. Left Panel: Question & Description */}
                            <aside className="w-[340px] shrink-0 bg-white dark:bg-gray-800 border-r overflow-y-auto">
                                <div className="p-5 border-b bg-gray-50 dark:bg-gray-900">
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                        Question {currentQuestionIndex >= 0 ? currentQuestionIndex + 1 : "—"}
                                    </p>
                                    <h2 className="mt-1 text-base font-semibold text-gray-900 leading-snug">
                                        {currentItem.question.title || "Untitled Question"}
                                    </h2>
                                    <div className="mt-3 flex items-center gap-2">
                                        <span className="text-[11px] text-gray-600 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-0.5 rounded-full">
                                            {currentItem.question.difficulty || "Unspecified"}
                                        </span>
                                        {submission ? (
                                            <span className={`text-[11px] px-2 py-0.5 rounded-full border ${submission.status === 'success'
                                                ? 'text-green-700 bg-green-50 border-green-200'
                                                : 'text-red-700 bg-red-50 border-red-200'
                                                }`}>
                                                {submission.status}
                                            </span>
                                        ) : (
                                            <span className="text-[11px] text-gray-600 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-0.5 rounded-full">
                                                not attempted
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="p-5">
                                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Description</h3>
                                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                                        {currentItem.question.description || "No question description available."}
                                    </p>
                                </div>
                            </aside>

                            {/* 2. Main Area */}
                            {submission ? (
                                <>
                            {/* Code Viewer (Center) */}
                            <div className="flex-1 bg-[#1e1e1e] text-gray-200 overflow-auto flex flex-col font-mono text-sm relative">
                                    <div className="sticky top-0 z-10 bg-[#252526] border-b border-[#333] px-4 py-2 flex items-center justify-between text-xs text-gray-400">
                                        <div className="flex items-center gap-2">
                                            <FileCode2 className="w-3.5 h-3.5" />
                                            <span>{submission.language || "python"}</span>
                                        </div>
                                        <span>Read-only</span>
                                    </div>
                                    <div className="p-4">
                                        {submission.code_content && submission.code_content.trim() ? (
                                            <pre className="counter-reset: line font-mono leading-relaxed">
                                                <code>
                                                    {submission.code_content}
                                                </code>
                                            </pre>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
                                                <FileCode2 className="w-10 h-10 opacity-50" />
                                                <p className="text-sm font-medium">Code missing</p>
                                                <p className="text-xs text-gray-500 text-center max-w-xs">
                                                    This student has a submission record but no source code was saved
                                                    {submission.status ? ` (status: ${submission.status})` : ""}.
                                                    You can still assign a grade on the right.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                            </div>

                            {/* Grading Tools (Right) */}
                            <div className="w-[400px] border-l bg-white dark:bg-gray-800 flex flex-col shadow-xl z-20 h-full min-h-0">
                                <Tabs defaultValue="autograder" className="flex-1 flex flex-col min-h-0">
                                    <div className="border-b px-4 shrink-0">
                                        <TabsList className="w-full justify-start h-12 bg-transparent p-0 gap-4">
                                            <TabsTrigger value="autograder" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none h-12 px-0">
                                                Autograder
                                            </TabsTrigger>
                                            <TabsTrigger value="manual" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none h-12 px-0">
                                                Rubric
                                            </TabsTrigger>
                                            <TabsTrigger value="history" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none h-12 px-0 flex items-center gap-2">
                                                <History className="w-3.5 h-3.5" />
                                                History
                                            </TabsTrigger>
                                        </TabsList>
                                    </div>

                                    <div className="flex-1 overflow-y-auto p-4 min-h-0">
                                        <TabsContent value="autograder" className="mt-0 space-y-4">
                                            <Card>
                                                <CardHeader className="pb-3">
                                                    <CardTitle className="text-sm font-medium flex justify-between">
                                                        <span>Test Suite Results</span>
                                                        <span className={submission.status === 'success' ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                                                            {(submission.status || 'unknown').toUpperCase()}
                                                        </span>
                                                    </CardTitle>
                                                </CardHeader>
                                                <CardContent className="space-y-3">
                                                    {(() => {
                                                        // Merge comparison logic
                                                        const testCases = currentItem.question.test_cases || [];
                                                        const results = submission.test_results || [];

                                                        // Fallback if no test cases defined in question
                                                        if (testCases.length === 0 && results.length === 0) {
                                                            return <p className="text-sm text-gray-500">No test results available.</p>;
                                                        }

                                                        // Render any value safely as text (objects/arrays → JSON).
                                                        const asText = (v, fallback = "N/A") => {
                                                            if (v === null || v === undefined || v === "") return fallback;
                                                            if (typeof v === "object") { try { return JSON.stringify(v); } catch { return String(v); } }
                                                            return String(v);
                                                        };
                                                        return results.map((res, i) => {
                                                            const tc = testCases[i] || {};
                                                            return (
                                                                <div key={i} className={`p-3 rounded-lg border text-sm space-y-2 ${res.status === 'pass' ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                                                                    <div className="flex items-center gap-2 font-medium">
                                                                        {res.status === 'pass' ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
                                                                        <span>
                                                                            {tc.concept ? asText(tc.concept) : `Test Case ${i + 1}`}
                                                                        </span>
                                                                        {tc.concept && <span className="text-xs font-normal text-gray-500 px-2 border-l ml-2">Test Case {i + 1}</span>}

                                                                        <span className="uppercase text-xs font-bold opacity-70 ml-auto">{asText(res.status, "")}</span>
                                                                    </div>

                                                                    {tc.explanation && (
                                                                        <div className="text-xs text-gray-600 italic border-l-2 border-gray-300 dark:border-gray-600 pl-2 py-0.5 mb-2">
                                                                            "{asText(tc.explanation, "")}"
                                                                        </div>
                                                                    )}

                                                                    <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                                                                        <div>
                                                                            <span className="font-semibold text-gray-500 block">Input:</span>
                                                                            <code className="bg-white/50 px-1 py-0.5 rounded block whitespace-pre-wrap">{asText(tc.input)}</code>
                                                                        </div>
                                                                        <div>
                                                                            <span className="font-semibold text-gray-500 block">Expected:</span>
                                                                            <code className="bg-white/50 px-1 py-0.5 rounded block whitespace-pre-wrap">{asText(tc.output ?? tc.expected_output)}</code>
                                                                        </div>
                                                                    </div>

                                                                    {res.status !== 'pass' && (
                                                                        <div className="mt-2 pt-2 border-t border-red-200/50">
                                                                            <span className="font-semibold text-red-700 block text-xs">Actual Output:</span>
                                                                            <code className="bg-white/50 px-1 py-0.5 rounded block whitespace-pre-wrap text-xs font-mono">{asText(res.actual_output || res.error_message, "(Empty)")}</code>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        });
                                                    })()}
                                                </CardContent>
                                            </Card>

                                            {/* AI Analysis Section */}
                                            <Card className="border-indigo-100 bg-indigo-50/20 shadow-sm">
                                                <CardHeader className="pb-3 border-b border-indigo-100/50">
                                                    <CardTitle className="text-sm font-medium flex items-center gap-2 text-indigo-900">
                                                        <Sparkles className="w-4 h-4 text-indigo-600" />
                                                        <span>AI Analysis (Autograder+)</span>
                                                    </CardTitle>
                                                </CardHeader>
                                                <CardContent className="pt-4 space-y-4">
                                                    {submission.ai_analysis_data ? (() => {
                                                        // Determine data shape:
                                                        // New format: { static, dynamic, feedback: { generative_model, technical_summary, ... }, embedding }
                                                        // Old format: { tags: [...] }
                                                        const raw = submission.ai_analysis_data;
                                                        const fb = (raw.feedback && typeof raw.feedback === 'object') ? raw.feedback : raw;
                                                        const staticData = raw.static || null;
                                                        const tags = raw.tags || (Array.isArray(fb.tags) ? fb.tags : []);
                                                        const hasAnyContent = fb.technical_summary || fb.error_explanation || fb.identified_concepts || fb.summarized_construct || tags.length > 0 || (staticData && staticData.constructs_found?.length > 0);

                                                        if (!hasAnyContent) {
                                                            return (
                                                                <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                                                                    <Brain className="w-10 h-10 mb-3 text-indigo-100" />
                                                                    <p className="text-sm font-medium text-gray-500">Analysis data is empty</p>
                                                                    <p className="text-xs mt-1">Re-run "Autograder+" to generate insights.</p>
                                                                </div>
                                                            );
                                                        }

                                                        return (
                                                            <div className="space-y-3 text-sm">
                                                                {/* Model Badge */}
                                                                {fb.generative_model && (
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-semibold border border-indigo-200">
                                                                            🤖 {fb.generative_model}
                                                                        </span>
                                                                    </div>
                                                                )}

                                                                {/* Tags (old format or supplementary) */}
                                                                {tags.length > 0 && (
                                                                    <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-indigo-100/50 shadow-sm">
                                                                        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold block mb-1.5">Code Tags</span>
                                                                        <div className="flex flex-wrap gap-1.5">
                                                                            {tags.map((tag, i) => (
                                                                                <span key={i} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md text-[10px] font-medium border border-indigo-100">
                                                                                    {typeof tag === 'object' ? JSON.stringify(tag) : tag}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Technical Summary */}
                                                                {fb.technical_summary && (
                                                                    <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-indigo-100/50 shadow-sm">
                                                                        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold block mb-1">Technical Summary</span>
                                                                        <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">
                                                                            {typeof fb.technical_summary === 'object' ? JSON.stringify(fb.technical_summary, null, 2) : fb.technical_summary}
                                                                        </p>
                                                                    </div>
                                                                )}

                                                                {/* Error Explanation */}
                                                                {fb.error_explanation && (
                                                                    <div className="p-3 bg-red-50 rounded-lg border border-red-100 shadow-sm">
                                                                        <span className="text-[10px] text-red-600 uppercase tracking-wider font-bold block mb-1">Error Explanation</span>
                                                                        <p className="text-xs text-red-700 leading-relaxed whitespace-pre-line">
                                                                            {typeof fb.error_explanation === 'object' ? JSON.stringify(fb.error_explanation, null, 2) : fb.error_explanation}
                                                                        </p>
                                                                    </div>
                                                                )}

                                                                {/* Identified Concepts */}
                                                                {fb.identified_concepts && (Array.isArray(fb.identified_concepts) ? fb.identified_concepts.length > 0 : true) && (
                                                                    <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-indigo-100/50 shadow-sm">
                                                                        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold block mb-1.5">Identified Concepts</span>
                                                                        {Array.isArray(fb.identified_concepts) && fb.identified_concepts.length > 0 ? (
                                                                            <div className="flex flex-wrap gap-1.5">
                                                                                {fb.identified_concepts.map((concept, i) => (
                                                                                    <span key={i} className="px-2 py-0.5 bg-violet-50 text-violet-700 rounded-md text-[10px] font-medium border border-violet-100">
                                                                                        {typeof concept === 'object' ? (concept.name || JSON.stringify(concept)) : concept}
                                                                                    </span>
                                                                                ))}
                                                                            </div>
                                                                        ) : (
                                                                            <p className="text-xs text-gray-500 italic">None detected</p>
                                                                        )}
                                                                    </div>
                                                                )}

                                                                {/* Summarized Construct */}
                                                                {fb.summarized_construct && (
                                                                    <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-indigo-100/50 shadow-sm">
                                                                        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold block mb-1">Construct Used</span>
                                                                        <p className="text-xs text-gray-700 leading-relaxed">
                                                                            {typeof fb.summarized_construct === 'object' ? JSON.stringify(fb.summarized_construct, null, 2) : fb.summarized_construct}
                                                                        </p>
                                                                    </div>
                                                                )}

                                                                {/* Static Analysis */}
                                                                {staticData && (
                                                                    <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800 shadow-sm space-y-1.5">
                                                                        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold block">Static Analysis</span>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${staticData.syntax_valid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                                                {staticData.syntax_valid ? '✓ Syntax Valid' : '✗ Syntax Error'}
                                                                            </span>
                                                                        </div>
                                                                        {staticData.errors?.length > 0 && (
                                                                            <p className="text-[10px] text-red-600 font-mono bg-red-50 px-2 py-1 rounded">{staticData.errors.join(', ')}</p>
                                                                        )}
                                                                        {staticData.constructs_found?.length > 0 && (
                                                                            <div className="flex flex-wrap gap-1">
                                                                                {staticData.constructs_found.map((c, i) => (
                                                                                    <span key={i} className="text-[10px] text-gray-600 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{c}</span>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })() : (
                                                        <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                                                            <Brain className="w-10 h-10 mb-3 text-indigo-100" />
                                                            <p className="text-sm font-medium text-gray-500">No AI analysis available yet</p>
                                                            <p className="text-xs mt-1">Run "Autograder+" from the assignment dashboard to generate insights.</p>
                                                        </div>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        </TabsContent>

                                        <TabsContent value="manual" className="mt-0 space-y-6">
                                            <div className="space-y-4">
                                                <div className="space-y-2">
                                                    <Label>Score Override</Label>
                                                    <div className="flex items-center gap-4">
                                                        <Input
                                                            type="number"
                                                            value={currentGradeData.score}
                                                            onChange={(e) => updateScore(e.target.value)}
                                                            className="text-lg font-bold w-24"
                                                            step="0.1"
                                                            max={100}
                                                        />
                                                        <span className="text-gray-500 font-medium">/ 100</span>
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Feedback</Label>
                                                    <Textarea
                                                        placeholder="Leave a comment..."
                                                        className="h-40"
                                                        value={currentGradeData.feedback}
                                                        onChange={(e) => updateFeedback(e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        </TabsContent>

                                        <TabsContent value="history">
                                            <div className="p-8 text-center text-gray-500 border border-dashed rounded bg-gray-50 dark:bg-gray-900">
                                                No history available.
                                            </div>
                                        </TabsContent>
                                    </div>
                                </Tabs>
                            </div>
                                </>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-500">
                                    <AlertCircle className="w-12 h-12 mb-4 opacity-50" />
                                    <h2 className="text-xl font-semibold">Not Attempted</h2>
                                    <p>The student has not submitted code for this question yet.</p>
                                </div>
                            )}
                        </>
                ) : (
                    <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                        <Loader2 className="animate-spin text-indigo-600" />
                    </div>
                )}
                </ErrorBoundary>
            </div>
        </div>
    );
}
