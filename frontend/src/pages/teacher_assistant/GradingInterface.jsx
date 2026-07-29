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
    AlertCircle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import TeacherLayout from "../../components/layout/TeacherLayout";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { submissionService } from "../../services/submissionService";


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
        const dirtyEntries = Object.entries(gradesMap).filter(([_, data]) => data.isDirty);

        if (dirtyEntries.length === 0) {
            // Nothing to save, just go back
            navigate(`/teacher/assignment/${assignmentId}`);
            return;
        }

        try {
            setSaving(true);

            // Execute all saves concurrently
            await Promise.all(dirtyEntries.map(([qId, data]) => {
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

    const currentItem = report.find(item => item.question.id === selectedQuestionId);
    const submission = currentItem?.submission;

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
                            Assignment ID: {assignmentId.slice(0, 8)}... <span className="text-gray-300">|</span> Student ID: {studentId.slice(0, 8)}...
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {submission && (
                        <Button onClick={handleSave} className="gap-2" disabled={saving}>
                            {saving ? <Loader2 className="animate-spin w-4 h-4" /> : <Save className="w-4 h-4" />}
                            Save Grade
                        </Button>
                    )}
                </div>
            </header>

            {/* Main Content - Split Pane */}
            <div className="flex-1 flex overflow-hidden">

                {/* 1. Sidebar: Question List */}
                <div className="w-64 bg-white dark:bg-gray-800 border-r dark:border-gray-700 flex flex-col overflow-y-auto">
                    <div className="p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Questions</span>
                    </div>
                    {report.map((item, idx) => {
                        const isDirty = gradesMap[item.question.id]?.isDirty;
                        const scoreToShow = gradesMap[item.question.id]?.score;

                        return (
                            <button
                                key={item.question.id}
                                onClick={() => setSelectedQuestionId(item.question.id)}
                                className={`p-4 text-left border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-start gap-3
                                ${selectedQuestionId === item.question.id ? 'bg-indigo-50 border-l-4 border-l-indigo-600' : 'border-l-4 border-l-transparent'}
                            `}
                            >
                                <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${isDirty ? 'bg-amber-500' : // Orange dot for unsaved changes
                                    item.status === 'success' ? 'bg-green-500' :
                                        item.status === 'fail' ? 'bg-red-500' :
                                            'bg-gray-300'
                                    }`} />
                                <div>
                                    <p className={`text-sm font-medium ${selectedQuestionId === item.question.id ? 'text-indigo-900' : 'text-gray-700'}`}>
                                        {item.question.title} {isDirty && <span className="text-amber-600 text-[10px] font-bold ml-1">(Unsaved)</span>}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                                        Q{idx + 1} • {item.submission ? `${scoreToShow}/100` : 'Not Attempted'}
                                    </p>
                                </div>
                            </button>
                        )
                    })}
                </div>

                {/* 2. Main Area */}
                {currentItem ? (
                    submission ? (
                        <>
                            {/* Code Viewer (Center) */}
                            <div className="flex-1 bg-gray-900 text-gray-100 overflow-auto p-4 font-mono text-sm relative">
                                <div className="absolute top-4 right-4 text-xs bg-gray-800 px-2 py-1 rounded text-gray-400 flex items-center gap-2">
                                    <FileCode2 className="w-3 h-3" />
                                    {submission.language || "python"}
                                </div>
                                <pre className="counter-reset: line">
                                    <code>
                                        {submission.code_content || "# No code provided"}
                                    </code>
                                </pre>
                            </div>

                            {/* Grading Tools (Right) */}
                            <div className="w-[400px] border-l dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col shadow-xl z-20">
                                <Tabs defaultValue="autograder" className="flex-1 flex flex-col">
                                    <div className="border-b px-4">
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

                                    <div className="flex-1 overflow-auto p-4">
                                        <TabsContent value="autograder" className="mt-0 space-y-4">
                                            <Card>
                                                <CardHeader className="pb-3">
                                                    <CardTitle className="text-sm font-medium flex justify-between">
                                                        <span>Test Suite Results</span>
                                                        <span className={submission.status === 'success' ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                                                            {submission.status.toUpperCase()}
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

                                                        return results.map((res, i) => {
                                                            const tc = testCases[i] || {};
                                                            return (
                                                                <div key={i} className={`p-3 rounded-lg border text-sm space-y-2 ${res.status === 'pass' ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                                                                    <div className="flex items-center gap-2 font-medium">
                                                                        {res.status === 'pass' ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
                                                                        <span>
                                                                            {tc.concept || `Test Case ${i + 1}`}
                                                                        </span>
                                                                        {tc.concept && <span className="text-xs font-normal text-gray-500 px-2 border-l ml-2">Test Case {i + 1}</span>}

                                                                        <span className="uppercase text-xs font-bold opacity-70 ml-auto">{res.status}</span>
                                                                    </div>

                                                                    {tc.explanation && (
                                                                        <div className="text-xs text-gray-600 italic border-l-2 border-gray-300 dark:border-gray-600 pl-2 py-0.5 mb-2">
                                                                            "{tc.explanation}"
                                                                        </div>
                                                                    )}

                                                                    <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                                                                        <div>
                                                                            <span className="font-semibold text-gray-500 block">Input:</span>
                                                                            <code className="bg-white/50 px-1 py-0.5 rounded block whitespace-pre-wrap">{tc.input || "N/A"}</code>
                                                                        </div>
                                                                        <div>
                                                                            <span className="font-semibold text-gray-500 block">Expected:</span>
                                                                            <code className="bg-white/50 px-1 py-0.5 rounded block whitespace-pre-wrap">{tc.output || "N/A"}</code>
                                                                        </div>
                                                                    </div>

                                                                    {res.status !== 'pass' && (
                                                                        <div className="mt-2 pt-2 border-t border-red-200/50">
                                                                            <span className="font-semibold text-red-700 block text-xs">Actual Output:</span>
                                                                            <code className="bg-white/50 px-1 py-0.5 rounded block whitespace-pre-wrap text-xs font-mono">{res.actual_output || res.error_message || "(Empty)"}</code>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        });
                                                    })()}
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
                    )
                ) : (
                    <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                        <Loader2 className="animate-spin text-indigo-600" />
                    </div>
                )}
            </div>
        </div>
    );
}
