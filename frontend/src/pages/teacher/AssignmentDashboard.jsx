import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useParams, useSearchParams, useNavigate } from "react-router-dom";
import {
    MoveLeft,
    BarChart3,
    Users,
    CheckCircle2,
    ArrowUpDown,
    Search,
    Filter,
    ListChecks,
    ChevronRight,
    Target,
    XCircle,
    StopCircle,
    Loader2,
    AlertCircle,
    Clock,
    Sparkles,
    FileText,
    HelpCircle,
    Edit2,
    Layers,
    Radio,
    GraduationCap,
    Wand2,
    ChevronDown,
    UserCheck,
    Info
} from "lucide-react";
import { toast } from "sonner"; // Assuming sonner or similar (or use custom toast)
import { motion, AnimatePresence } from "framer-motion";

import TeacherLayout from "../../components/layout/TeacherLayout";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../../components/ui/table";

// Services
import { assignmentService } from "../../services/assignmentService";
import { submissionService } from "../../services/submissionService";

// Analytics Components
import PerformanceMatrix from "../../components/features/analytics/PerformanceMatrix";
import ErrorWordCloud from "../../components/features/analytics/ErrorWordCloud";
import BoxPlotChart from "../../components/features/analytics/BoxPlotChart";
import ErrorHeatmapV2 from "../../components/features/analytics/ErrorHeatmapV2";
import CodeSimilarityMap from "../../components/features/analytics/CodeSimilarityMap";
import ClusterGradingPanel from "../../components/features/analytics/ClusterGradingPanel";
import LogViewer from "../../components/features/analytics/LogViewer";
import AssignmentOverview from "../../components/features/analytics/AssignmentOverview";
import StudentPerformanceModal from "../../components/features/analytics/StudentPerformanceModal";
import LiveMonitorPanel from "../../components/features/analytics/LiveMonitorPanel";
import AutoGradeDialog from "../../components/features/analytics/AutoGradeDialog";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from "../../components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "../../components/ui/dialog";

export default function AssignmentDashboard() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const initialTab = searchParams.get("tab") || "submissions";
    
    const [searchTerm, setSearchTerm] = useState("");
    const [filterStatus, setFilterStatus] = useState("All");
    const [activeTab, setActiveTab] = useState(initialTab);
    const [perfStudent, setPerfStudent] = useState(null); // { id } for the performance modal
    const [autoGradeOpen, setAutoGradeOpen] = useState(false);
    const [gradeInfoOpen, setGradeInfoOpen] = useState(false);

    // Data State
    const [assignment, setAssignment] = useState(null);
    const [studentsSummary, setStudentsSummary] = useState([]); // Aggregated student data
    const [submissions, setSubmissions] = useState([]); // Raw submissions (kept for Analytics)
    const [wordClouds, setWordClouds] = useState({ full: null, partial: null });
    const [wordCloudLoading, setWordCloudLoading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisStatus, setAnalysisStatus] = useState({
        status: 'unknown',
        analyzed: 0, total: 0, percent: 0,
        completed_batches: 0, total_batches: 0,
    });
    // Timestamp of the most recent trigger — used to ignore stale 'cancelled' responses
    // that arrive in the first few poll cycles right after a new task is dispatched.
    const taskStartTimeRef = useRef(null);

    // Analytics Navigation State
    const [selectedQuestion, setSelectedQuestion] = useState(null);
    const [selectedAnalyticsTag, setSelectedAnalyticsTag] = useState(null); // kept for potential future tag-filtering use
    // Reset word cloud when switching questions
    const handleSelectQuestion = (qId) => {
        setSelectedQuestion(qId);
        setWordClouds({ full: null, partial: null });
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);

                // Fire the fast, visible-table requests in parallel.
                // Analytics (heavy) runs concurrently but we don't block rendering on it.
                const [assignResponse, summaryRes, progRes] = await Promise.all([
                    assignmentService.getAssignment(id),
                    submissionService.getAssignmentSummary(id),
                    assignmentService.getAnalysisProgress(id).catch(() => null), // ignore 404
                ]);

                setAssignment(assignResponse.data);
                setStudentsSummary(summaryRes.data || []);
                if (progRes?.data) setAnalysisStatus(progRes.data);

                setError(null);
            } catch (err) {
                console.error("Failed to load dashboard data:", err);
                setError("Failed to load assignment data. Please try again.");
            } finally {
                setLoading(false);
            }
        };

        if (id) fetchData();
    }, [id]);

    // Lazy-load heavy analytics data in background (doesn't block the students table)
    useEffect(() => {
        if (!id) return;
        submissionService.getAnalyticsSubmissions(id).then(subResponse => {
            const subData = Array.isArray(subResponse.data) ? subResponse.data : (subResponse.data?.results || []);
            setSubmissions(subData || []);
        }).catch(err => {
            console.error("Failed to load analytics data:", err);
        });
    }, [id]);

    // Derived Stats
    const totalStudents = assignment?.total_students || 0;
    const gradedCount = studentsSummary.filter(s => (s.status || '').toLowerCase() === 'graded').length;
    const submittedCount = studentsSummary.filter(s => {
        const st = (s.status || '').toLowerCase();
        return st === 'submitted' || st === 'graded';
    }).length;
    const toGradeCount = Math.max(submittedCount - gradedCount, 0);

    // Calculate Average Score
    const scores = studentsSummary.filter(s => s.final_score > 0).map(s => s.final_score); // Filter 0s if needed, or include
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;


    // AI Analysis Handler
    const handleTriggerAI = async (forceParam = false) => {
        // Ensure force is a boolean (prevents React event objects being passed via onClick)
        const force = forceParam === true;
        try {
            // Reset state for a clean start
            setIsAnalyzing(true);
            setAnalysisStatus({ status: 'pending', analyzed: 0, total: 0, percent: 0, completed_batches: 0, total_batches: 0 });
            taskStartTimeRef.current = Date.now(); // mark start time for grace period
            toast.loading(force ? "Force Restarting AI Analysis..." : "Queuing AI Analysis...", { id: "ai-progress" });
            const res = await assignmentService.triggerAIAnalysis(id, force);
            // 200: successfully started — polling effect takes over
            if (res.data?.success) return;
        } catch (err) {
            // 409 Conflict = a run is already in progress; resume polling it
            if (err.response?.status === 409) {
                const data = err.response.data;
                setAnalysisStatus({
                    status: 'running',
                    completed_batches: data.completed_batches ?? 0,
                    total_batches: data.total_batches ?? 0,
                    analyzed: data.analyzed ?? 0,
                    total: data.total ?? 0,
                });
                const batchInfo = (data.total_batches ?? 0) > 0
                    ? ` Batch ${data.completed_batches ?? 0}/${data.total_batches}`
                    : '';
                toast.error(`An AI analysis is already running.${batchInfo}`, {
                    id: 'ai-progress',
                    action: {
                        label: "Force Restart",
                        onClick: () => handleTriggerAI(true)
                    },
                    duration: 5000
                });
                return;
            }
            console.error(err);
            toast.error("Failed to trigger AI Analysis.", { id: 'ai-progress' });
            setIsAnalyzing(false);
            taskStartTimeRef.current = null;
        }
    };

    // Cancel AI Analysis
    const handleCancelAI = async () => {
        try {
            await assignmentService.cancelAIAnalysis(id);
            // Reset all state cleanly so the button is immediately re-clickable
            taskStartTimeRef.current = null;
            setIsAnalyzing(false);
            setAnalysisStatus({ status: 'cancelled', analyzed: 0, total: 0, percent: 0, completed_batches: 0, total_batches: 0 });
            toast.warning("AI Analysis cancelled.", { id: "ai-progress" });
        } catch (err) {
            console.error(err);
            toast.error("Failed to cancel analysis.");
        }
    };

    // ── Grade All handlers ────────────────────────────────────────────────
    // Grade individually → open the first student's code grading page.
    const handleGradeIndividual = () => {
        // Prefer a student who has submitted; fall back to the first in the list.
        const submitted = studentsSummary.filter(
            s => ['submitted', 'graded'].includes((s.status || '').toLowerCase())
        );
        const first = (submitted[0] || studentsSummary[0])?.student;
        if (!first) {
            toast.error("No students to grade yet.");
            return;
        }
        navigate(`/teacher/grading/assignment/${id}/student/${first.id}`);
    };

    // Grade by cluster → open the Cluster Grading tab.
    const handleGradeCluster = () => {
        if (!analysisStatus?.analyzed) {
            toast.error("Run Autograder+ first to enable cluster grading.");
            return;
        }
        setActiveTab("cluster");
    };

    // Auto-fetch word clouds whenever the selected question changes (if AI data exists)
    useEffect(() => {
        if (!selectedQuestion || !analysisStatus?.analyzed) return;

        const fetchWordClouds = async () => {
            setWordCloudLoading(true);
            setWordClouds({ full: null, partial: null }); // reset while loading
            try {
                const wcRes = await assignmentService.getWordCloud(id, selectedQuestion);
                const { full, partial } = wcRes.data;
                setWordClouds({
                    full: full?.image_base64 ?? null,
                    partial: partial?.image_base64 ?? null,
                });
            } catch (e) {
                // 404 = no AI data yet for this question — silent, component shows empty state
                if (e.response?.status !== 404) {
                    toast.error('Word cloud generation failed.');
                }
            } finally {
                setWordCloudLoading(false);
            }
        };

        fetchWordClouds();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedQuestion, id]);

    // Polling progress while AI analysis is running
    useEffect(() => {
        if (!isAnalyzing) return;

        const checkProgress = async () => {
            try {
                const res = await assignmentService.getAnalysisProgress(id);
                const data = res.data;
                setAnalysisStatus(data);

                const { status, completed_batches, total_batches, analyzed, total, percent } = data;

                // Grace period: ignore terminal/stale statuses for 5s after a fresh trigger
                // This prevents a newly-triggered task from being killed by a leftover 'cancelled' response.
                const justStarted = taskStartTimeRef.current && (Date.now() - taskStartTimeRef.current) < 5000;

                if (status === 'cancelled' || status === 'failed') {
                    if (justStarted) return; // ignore stale — the new task hasn't registered yet
                    setIsAnalyzing(false);
                    taskStartTimeRef.current = null;
                    toast.warning(
                        status === 'failed' ? 'Analysis failed. Check server logs.' : 'Analysis was cancelled.',
                        { id: 'ai-progress' }
                    );
                } else if (status === 'unknown') {
                    if (justStarted) return; // backend hasn't written the new task record yet
                    setIsAnalyzing(false);
                    taskStartTimeRef.current = null;
                    toast.dismiss('ai-progress');
                } else if (status === 'completed' || (total_batches > 0 && completed_batches >= total_batches)) {
                    setIsAnalyzing(false);
                    taskStartTimeRef.current = null;
                    toast.success(
                        `AI Analysis done! ${analyzed} submissions analyzed.`,
                        { id: 'ai-progress' }
                    );
                    // Refresh submissions in-place
                    const subResponse = await submissionService.getAnalyticsSubmissions(id);
                    const subData = Array.isArray(subResponse.data)
                        ? subResponse.data
                        : (subResponse.data?.results || []);
                    setSubmissions(subData);

                    // Refresh assignment object to load newly generated UMAP URLs
                    try {
                        const assignmentRes = await assignmentService.getAssignmentDetails(id);
                        if (assignmentRes.data) {
                            setAssignment(assignmentRes.data);
                        }
                    } catch (err) {
                        console.error('Failed to refresh assignment data after AI analysis', err);
                    }
                } else if (status === 'pending') {
                    toast.loading('Queuing questions…', { id: 'ai-progress' });
                } else {
                    // Running normally
                    const batchInfo = total_batches > 0
                        ? ` · Question ${completed_batches}/${total_batches}`
                        : '';
                    toast.loading(
                        `Analyzing… ${analyzed}/${total} (${percent}%)${batchInfo}`,
                        { id: 'ai-progress' }
                    );
                }
            } catch (e) {
                console.error('Progress poll failed', e);
            }
        };

        checkProgress();
        const interval = setInterval(checkProgress, 4000);
        return () => clearInterval(interval);
    }, [isAnalyzing, id]);

    // Derived Stats
    const highestScore = scores.length > 0 ? Math.max(...scores) : 0;
    const lowestScore = scores.length > 0 ? Math.min(...scores) : 0;
    const completionRate = totalStudents > 0 ? Math.round((submittedCount / totalStudents) * 100) : 0;

    // ... (rest of filtering logic)

    // ...



    // Filter Logic (Students)
    const filteredStudents = studentsSummary.filter(item => {
        const s = item.student;
        const studentName = s?.first_name ? `${s.first_name} ${s.last_name}` : s?.email || "Unknown";
        const matchesSearch = studentName.toLowerCase().includes(searchTerm.toLowerCase());

        let status = item.status === 'processed' ? 'To Grade' : 'Submitted'; // Default mapping if simpler
        if (item.status === 'graded') status = 'Graded';
        if (item.status === 'in_progress') status = 'In Progress';
        if (item.status === 'submitted') status = 'Submitted';

        // Simple mapping for filter UI (which has "All", "Graded", "To Grade")
        // "Submitted" implies "To Grade" usually
        const displayStatus = (item.status === 'submitted') ? 'To Grade' : (item.status === 'graded' ? 'Graded' : item.status);

        const matchesStatus = filterStatus === "All" || displayStatus === filterStatus;
        return matchesSearch && matchesStatus;
    });

    const currentQuestion = selectedQuestion && assignment?.questions
        ? assignment.questions.find(q => q.question.id === selectedQuestion)?.question
        : null;

    // Memoize the data preparation to prevent infinite re-render loops
    // detailed analytics data calculation moved to top level
    const analyticsData = useMemo(() => {
        const questionSubs = submissions.filter(s => (s.question_id || s.question?.id) === selectedQuestion);
        const validSubs = questionSubs.filter(s => s.final_score !== null);

        if (validSubs.length === 0) return { validSubs, boxPlotData: null, heatmapQuestions: [], wordCloudData: [] };

        // Box Plot Data
        const values = validSubs.map(s => s.final_score).sort((a, b) => a - b);
        const q1 = values[Math.floor(values.length * 0.25)];
        const median = values[Math.floor(values.length * 0.5)];
        const q3 = values[Math.floor(values.length * 0.75)];
        const boxPlotData = [{
            name: "Class",
            min: values[0],
            q1, median, q3,
            max: values[values.length - 1]
        }];

        // Error Heatmap Data
        const testCasesMeta = currentQuestion?.test_cases || currentQuestion?.testCases || [];
        const getConcept = (idx, testCaseId) => {
            if (testCasesMeta[idx]?.concept) return testCasesMeta[idx].concept;
            if (testCasesMeta[idx]?.tag) return testCasesMeta[idx].tag;
            if (testCasesMeta[idx]?.description) return testCasesMeta[idx].description;
            if (testCaseId) return `Test Case ${testCaseId.replace('tc_', '#')}`;
            return `Test Case ${idx + 1}`;
        };

        const tcStats = {};
        validSubs.forEach(sub => {
            if (sub.test_results) {
                sub.test_results.forEach((res, idx) => {
                    const key = res.test_case_id || idx;
                    if (!tcStats[key]) {
                        tcStats[key] = {
                            passes: 0,
                            total: 0,
                            name: getConcept(idx, res.test_case_id),
                            concept: getConcept(idx, res.test_case_id),
                            errors: {}, // Store error counts: { "Timeout": 5, "IndexError": 2 }
                        };
                    }
                    tcStats[key].total++;

                    if (res.status === 'pass') {
                        tcStats[key].passes++;
                    } else if (res.error_message) {
                        // Dynamic Error Analysis
                        // Extract exception type: "IndexError: list index out of range" -> "IndexError"
                        // If no colon, might be "Timeout" or just the message.
                        let errorType = "Unknown Error";
                        const msg = res.error_message.trim();

                        // Common Python/Java exception pattern
                        if (msg.includes(':')) {
                            const parts = msg.split(':');
                            // Take first part if it looks like an Exception Class (CamelCase usually, no spaces preferably)
                            if (parts[0].length < 30 && !parts[0].includes(' ')) {
                                errorType = parts[0];
                            } else {
                                // Fallback: try to find common keywords
                                if (msg.toLowerCase().includes('timeout')) errorType = "Timeout";
                                else if (msg.toLowerCase().includes('syntax')) errorType = "Syntax Error";
                                else errorType = "Runtime Error";
                            }
                        } else if (msg.toLowerCase().includes('timeout')) {
                            errorType = "Timeout";
                        } else {
                            // If short enough, use whole message, else generic
                            errorType = msg.length < 20 ? msg : "Runtime Error";
                        }

                        tcStats[key].errors[errorType] = (tcStats[key].errors[errorType] || 0) + 1;
                    }
                });
            }
        });

        const heatmapQuestions = [{
            id: currentQuestion?.id,
            title: "Concept Mastery",
            avgScore: Math.round(avgScore),
            testCases: Object.values(tcStats).map((stat, i) => {
                // Convert errors obj to sorted array
                const errorList = Object.entries(stat.errors)
                    .map(([type, count]) => ({ type, count }))
                    .sort((a, b) => b.count - a.count); // Most frequent first

                return {
                    id: i,
                    name: stat.name,
                    concept: stat.concept,
                    passRate: stat.total > 0 ? Math.round((stat.passes / stat.total) * 100) : 0,
                    total: stat.total,
                    errorStats: errorList
                };
            })
        }];

        // Word Cloud Data
        const tagCounts = {};
        validSubs.forEach(sub => {
            if (sub.feedback_tags) {
                sub.feedback_tags.split(',').forEach(tag => {
                    const cleanTag = tag.trim();
                    if (cleanTag) {
                        tagCounts[cleanTag] = (tagCounts[cleanTag] || 0) + 1;
                    }
                });
            }
        });
        const wordCloudData = Object.entries(tagCounts)
            .map(([text, value]) => ({ text, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 20);

        return { validSubs, boxPlotData, heatmapQuestions, wordCloudData };
    }, [submissions, selectedQuestion, currentQuestion, avgScore]);

    const { validSubs, boxPlotData, heatmapQuestions, wordCloudData } = analyticsData;

    if (loading) {
        return (
            <TeacherLayout>
                <div className="flex h-[80vh] items-center justify-center">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
                </div>
            </TeacherLayout>
        );
    }

    if (error || !assignment) {
        return (
            <TeacherLayout>
                <div className="flex flex-col h-[80vh] items-center justify-center text-red-500">
                    <AlertCircle className="w-12 h-12 mb-4" />
                    <h2 className="text-xl font-bold">Error</h2>
                    <p>{error || "Assignment not found"}</p>
                    <Button variant="outline" className="mt-4" asChild>
                        <Link to="/teacher/dashboard">Back to Dashboard</Link>
                    </Button>
                </div>
            </TeacherLayout>
        );
    }

    return (
        <TeacherLayout>
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
            >
                {/* Header */}
                <div className="flex flex-col gap-4 md:flex-row md:items-center justify-between">
                    <div className="flex items-center gap-4">
                        {/* Previuse code : <Button variant="ghost" size="icon" asChild>
                            <Link to="/teacher/dashboard">
                                <MoveLeft className="w-5 h-5" />
                            </Link>
                        </Button> */}
                        <Button variant="ghost" size="icon" asChild>
                            <Link to={`/teacher/class/${assignment?.class_id}?tab=classwork`}>
                                <MoveLeft className="w-5 h-5" />
                            </Link>
                        </Button>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-2xl font-bold text-gray-900">{assignment.title}</h1>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${assignment.status === 'published' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 border-gray-200 dark:border-gray-700'
                                    }`}>
                                    {assignment.status}
                                </span>
                            </div>
                            <p className="text-gray-500 text-sm mt-1">Due {new Date(assignment.due_date).toLocaleDateString()}</p>
                        </div>
                    </div>
                    {/* Autograder+ Button Group */}
                    <div className="flex items-center gap-2">
                        <Button
                            onClick={handleTriggerAI}
                            disabled={isAnalyzing}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 shadow-lg hover:shadow-xl transition-all"
                        >
                            {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            {isAnalyzing
                                ? (analysisStatus?.total_batches > 0
                                    ? `Question ${analysisStatus?.completed_batches}/${analysisStatus?.total_batches}`
                                    : "Queuing...")
                                : "Autograder+"}
                        </Button>
                        {isAnalyzing && (
                            <Button
                                onClick={handleCancelAI}
                                variant="outline"
                                size="icon"
                                className="border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400"
                                title="Cancel AI Analysis"
                            >
                                <StopCircle className="w-4 h-4" />
                            </Button>
                        )}
                    </div>
                </div>

                {/* Autograder+ (AI) pipeline logs — visible while analyzing or after a run */}
                {(isAnalyzing || (analysisStatus?.log_output?.length > 0)) && (
                    <LogViewer
                        lines={analysisStatus?.log_output}
                        title="Autograder+ analysis logs"
                        defaultOpen={isAnalyzing}
                    />
                )}

                {/* Main Content Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                    <TabsList className="bg-white dark:bg-gray-800 border p-1 rounded-lg">
                        <TabsTrigger value="submissions" className="flex items-center gap-2">
                            <ListChecks className="w-4 h-4" />
                            Submissions
                        </TabsTrigger>
                        <TabsTrigger value="questions" className="flex items-center gap-2">
                            <HelpCircle className="w-4 h-4" />
                            Questions
                        </TabsTrigger>
                        <TabsTrigger
                            value="analytics"
                            className="flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={!analysisStatus?.analyzed}
                        >
                            <BarChart3 className="w-4 h-4" />
                            Analytics & Insights
                            {!analysisStatus?.analyzed && (
                                <span className="ml-2 text-xs text-gray-400">(Run Autograder first)</span>
                            )}
                        </TabsTrigger>
                        <TabsTrigger
                            value="cluster"
                            className="flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={!analysisStatus?.analyzed}
                        >
                            <Layers className="w-4 h-4" />
                            Cluster Grading
                            {!analysisStatus?.analyzed && (
                                <span className="ml-2 text-xs text-gray-400">(Run Autograder first)</span>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="live" className="flex items-center gap-2">
                            <Radio className="w-4 h-4" />
                            Live Monitor
                        </TabsTrigger>
                    </TabsList>

                    {/* --- TAB: SUBMISSIONS --- */}
                    <TabsContent value="submissions">
                        {/* Overall Stats Row */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">Average Score</CardTitle>
                                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">{avgScore}%</div>
                                    <p className="text-xs text-muted-foreground">Based on {gradedCount} graded</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">Submitted</CardTitle>
                                    <Users className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">{submittedCount}/{totalStudents || "?"}</div>
                                    <p className="text-xs text-muted-foreground">{completionRate}% completion rate</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">Graded</CardTitle>
                                    <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">{gradedCount}</div>
                                    <p className="text-xs text-muted-foreground">To grade: {toGradeCount}</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">Highest Score</CardTitle>
                                    <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">{Math.round(highestScore)}</div>
                                    <p className="text-xs text-muted-foreground">Lowest: {Math.round(lowestScore)}</p>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Assignment overview analytics: question-wise avg score, attempts, pass % */}
                        <div className="mb-8">
                            <AssignmentOverview assignmentId={id} />
                        </div>

                        {/* Submission Table */}
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle>All Submissions</CardTitle>
                                        <CardDescription>Manage individual student grades</CardDescription>
                                    </div>
                                    <div className="flex gap-2 items-center">
                                        {/* Grade All — choose a grading mode */}
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                                                    <GraduationCap className="w-4 h-4" />
                                                    Grade All
                                                    <ChevronDown className="w-4 h-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-64">
                                                <DropdownMenuLabel>Choose a grading mode</DropdownMenuLabel>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem onClick={handleGradeCluster} className="gap-2 cursor-pointer">
                                                    <Layers className="w-4 h-4 text-indigo-600" />
                                                    <div className="flex flex-col">
                                                        <span className="flex items-center gap-1.5">
                                                            Grade by cluster
                                                            <span className="text-[10px] bg-green-100 text-green-700 rounded px-1.5 py-0.5 font-medium">Recommended</span>
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">Grade one per cluster</span>
                                                    </div>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={handleGradeIndividual} className="gap-2 cursor-pointer">
                                                    <UserCheck className="w-4 h-4" />
                                                    <div className="flex flex-col">
                                                        <span>Grade individually</span>
                                                        <span className="text-xs text-muted-foreground">Open each student's code</span>
                                                    </div>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => setAutoGradeOpen(true)} className="gap-2 cursor-pointer">
                                                    <Wand2 className="w-4 h-4" />
                                                    <div className="flex flex-col">
                                                        <span>Grade automatically</span>
                                                        <span className="text-xs text-muted-foreground">From pass % · range · formula</span>
                                                    </div>
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setGradeInfoOpen(true)}
                                            title="About grading modes"
                                            className="text-gray-400 hover:text-indigo-600"
                                        >
                                            <Info className="w-4 h-4" />
                                        </Button>
                                        <div className="relative w-64">
                                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                                            <Input
                                                placeholder="Search student..."
                                                className="pl-9"
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                            />
                                        </div>
                                        <Button variant="outline"><Filter className="w-4 h-4 mr-2" /> Filter</Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Student</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Sent At</TableHead>
                                            <TableHead className="text-right">Score</TableHead>
                                            <TableHead className="text-right">Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredStudents.length > 0 ? (
                                            filteredStudents.map((item) => (
                                                <TableRow key={item.student.username}>
                                                    <TableCell className="font-medium">
                                                        <button
                                                            type="button"
                                                            onClick={() => setPerfStudent({ id: item.student.id })}
                                                            className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity group"
                                                            title="View performance"
                                                        >
                                                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold uppercase">
                                                                {item.student.first_name?.[0] || item.student.email?.[0] || "?"}
                                                            </div>
                                                            <div>
                                                                <div className="text-sm font-medium group-hover:text-indigo-600 group-hover:underline">
                                                                    {item.student.first_name ? `${item.student.first_name} ${item.student.last_name}` : item.student.username}
                                                                </div>
                                                                <div className="text-xs text-gray-500">{item.student.email}</div>
                                                            </div>
                                                        </button>
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${item.status === 'graded' ? "bg-green-50 text-green-700 border-green-200" :
                                                            item.status === 'submitted' ? "bg-blue-50 text-blue-700 border-blue-200" :
                                                                "bg-amber-50 text-amber-700 border-amber-200"
                                                            }`}>
                                                            {item.status.replace('_', ' ')}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-xs text-gray-500">
                                                        {item.updated_at ? new Date(item.updated_at).toLocaleDateString() : "-"}
                                                    </TableCell>
                                                    <TableCell className="text-right font-bold">
                                                        {(item.status === 'submitted' || item.status === 'graded') ? `${Math.round(item.final_score)}` : "-"}
                                                        <span className="text-xs text-gray-400 block font-normal">
                                                            Progress: {item.questions_completed} / {item.total_questions}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button size="sm" variant="outline" asChild>
                                                            <Link to={`/teacher/grading/assignment/${assignment.id}/student/${item.student.id}`}>
                                                                Grade
                                                            </Link>
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center py-6 text-gray-500">
                                                    No submissions found {searchTerm && "matching your search"}
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* --- TAB: QUESTIONS --- */}
                    <TabsContent value="questions">
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900">Assignment Questions</h2>
                                    <p className="text-sm text-gray-500">View the problems you created for this assignment.</p>
                                </div>
                                <Button variant="outline" asChild>
                                    <Link to={`/teacher/assignment/create?id=${assignment.id}&edit=true`}>
                                        <Edit2 className="w-4 h-4 mr-2" /> Edit Assignment
                                    </Link>
                                </Button>
                            </div>

                            <div className="grid grid-cols-1 gap-6">
                                {assignment.questions?.length > 0 ? (
                                    assignment.questions.map((q, idx) => (
                                        <Card key={q.id || idx} className="overflow-hidden hover:shadow-md transition-shadow">
                                            <CardHeader className="bg-gray-50/50 dark:bg-gray-900 border-b">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
                                                            {idx + 1}
                                                        </div>
                                                        <CardTitle className="text-lg">{q.question.title}</CardTitle>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${
                                                            q.question.difficulty === 'Easy' ? 'bg-green-50 text-green-700 border-green-200' :
                                                            q.question.difficulty === 'Hard' ? 'bg-red-50 text-red-700 border-red-200' :
                                                            'bg-blue-50 text-blue-700 border-blue-200'
                                                        }`}>
                                                            {q.question.difficulty}
                                                        </span>
                                                        <span className="text-xs font-medium text-gray-500 bg-white dark:bg-gray-800 px-2 py-1 rounded border">
                                                            {q.question.points || 10} pts
                                                        </span>
                                                    </div>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="pt-6">
                                                <div className="prose prose-sm max-w-none text-gray-700">
                                                    <div className="whitespace-pre-wrap">{q.question.description}</div>
                                                </div>
                                                
                                                {q.question.test_cases?.length > 0 && (
                                                    <div className="mt-6 pt-6 border-t">
                                                        <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                                            <Target className="w-4 h-4 text-indigo-500" />
                                                            Test Cases ({q.question.test_cases.length})
                                                        </h4>
                                                        <div className="space-y-3">
                                                            {q.question.test_cases.slice(0, 3).map((tc, tcIdx) => (
                                                                <div key={tcIdx} className="bg-gray-50 dark:bg-gray-900 rounded p-3 text-xs font-mono border">
                                                                    <div className="grid grid-cols-2 gap-4">
                                                                        <div>
                                                                            <span className="text-gray-400 block mb-1">Input:</span>
                                                                            <span className="text-gray-800">{tc.input || "(empty)"}</span>
                                                                        </div>
                                                                        <div>
                                                                            <span className="text-gray-400 block mb-1">Expected Output:</span>
                                                                            <span className="text-green-700 font-bold">{tc.expected_output || tc.output}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                            {q.question.test_cases.length > 3 && (
                                                                <p className="text-xs text-gray-400 italic">+{q.question.test_cases.length - 3} more test cases...</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>
                                    ))
                                ) : (
                                    <div className="text-center py-12 border-2 border-dashed rounded-lg">
                                        <p className="text-gray-500">No questions found for this assignment.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </TabsContent>

                    {/* --- TAB: ANALYTICS --- */}
                    <TabsContent value="analytics" className="space-y-6">
                        {!selectedQuestion ? (
                            <Card className="border-2 border-dashed">
                                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                                    <div className="p-4 bg-indigo-50 rounded-full mb-4">
                                        <Target className="w-8 h-8 text-indigo-600" />
                                    </div>
                                    <h3 className="text-xl font-semibold text-gray-900 mb-2">Select a Question</h3>
                                    <p className="text-gray-500 max-w-md mb-8">
                                        Analytics are viewed per-question. Please select one to inspect performance.
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
                                        {assignment?.questions?.map((q, idx) => (
                                            <Button
                                                key={q.id}
                                                variant="outline"
                                                className="h-auto py-4 px-6 flex flex-col items-start gap-1 hover:border-indigo-500 hover:bg-indigo-50 transition-all text-left"
                                                onClick={() => handleSelectQuestion(q.question.id)}
                                            >
                                                <span className="font-bold text-gray-900">Question {idx + 1}</span>
                                                <span className="text-xs text-gray-500 line-clamp-1">{q.question.title}</span>
                                            </Button>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="space-y-6">
                                <div className="flex items-center gap-4">
                                    <Button variant="ghost" size="sm" onClick={() => handleSelectQuestion(null)}>
                                        <MoveLeft className="w-4 h-4 mr-2" />
                                        Back to Questions
                                    </Button>
                                    <h3 className="text-lg font-semibold border-l pl-4">
                                        Analytics for: <span className="text-indigo-600">{currentQuestion?.title}</span>
                                    </h3>
                                </div>



                                {validSubs.length === 0 ? (
                                    <Card className="border-dashed bg-gray-50/50 dark:bg-gray-900">
                                        <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                                            <div className="bg-white dark:bg-gray-800 p-4 rounded-full shadow-sm mb-4">
                                                <Clock className="w-10 h-10 text-indigo-400" />
                                            </div>
                                            <h3 className="text-xl font-semibold text-gray-900 mb-2">
                                                {new Date(assignment.due_date) > new Date() ? "Analytics In Progress" : "No Data Available"}
                                            </h3>
                                            <p className="text-gray-500 max-w-sm mx-auto mb-6">
                                                {new Date(assignment.due_date) > new Date()
                                                    ? "This assignment is currently active. Graphs and insights will populate automatically as students submit their work."
                                                    : "No graded submissions were found for this question."}
                                            </p>
                                            {submissions.filter(s => (s.question_id || s.question?.id) === selectedQuestion).length > 0 && (
                                                <p className="text-xs text-amber-600 font-medium bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                                                    Pending submissions waiting to be graded
                                                </p>
                                            )}
                                        </CardContent>
                                    </Card>
                                ) : (
                                    <div className="space-y-6">
                                        {/* Row 1: Key Performance Metrics */}
                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                            <div className="lg:col-span-2 h-full">
                                                <PerformanceMatrix
                                                    submissions={validSubs}
                                                />
                                            </div>
                                            <div className="lg:col-span-1 h-full">
                                                <BoxPlotChart
                                                    data={boxPlotData}
                                                />
                                            </div>
                                        </div>

                                        {/* Row 2: Deep Dive (Heatmap + Word Cloud) */}
                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                            <div className="lg:col-span-2 h-full">
                                                <ErrorHeatmapV2
                                                    questions={heatmapQuestions}
                                                />
                                            </div>
                                            <div className="lg:col-span-1 h-full">
                                                <ErrorWordCloud
                                                    fullImage={wordClouds.full}
                                                    partialImage={wordClouds.partial}
                                                    loading={wordCloudLoading}
                                                    hasAiData={!!analysisStatus?.analyzed}
                                                />
                                            </div>
                                        </div>

                                        {/* Row 3: Advanced Analysis */}
                                        <div className="h-[600px]">
                                            <CodeSimilarityMap
                                                submissions={validSubs}
                                                url={assignment?.questions?.find(q => q.question.id === selectedQuestion)?.umap_url}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </TabsContent>

                    {/* --- TAB: CLUSTER GRADING --- */}
                    <TabsContent value="cluster">
                        <ClusterGradingPanel assignmentId={id} />
                    </TabsContent>

                    {/* --- TAB: LIVE MONITOR --- */}
                    <TabsContent value="live">
                        {activeTab === "live" && <LiveMonitorPanel assignmentId={id} />}
                    </TabsContent>
                </Tabs>

                {/* Student performance modal (opened by clicking a student name) */}
                <StudentPerformanceModal
                    classId={assignment?.class_id}
                    student={perfStudent}
                    onClose={() => setPerfStudent(null)}
                />

                {/* Automatic grading dialog */}
                <AutoGradeDialog
                    assignmentId={id}
                    open={autoGradeOpen}
                    onClose={() => setAutoGradeOpen(false)}
                    onDone={() => window.location.reload()}
                />

                {/* Grading modes info dialog */}
                <Dialog open={gradeInfoOpen} onOpenChange={setGradeInfoOpen}>
                    <DialogContent className="max-w-lg">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <GraduationCap className="w-5 h-5 text-indigo-600" /> Grading Modes
                            </DialogTitle>
                            <DialogDescription>
                                Three ways to grade this assignment. Scores are stored as a 0–100 percentage.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 text-sm">
                            <div className="flex gap-3">
                                <Layers className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-medium flex items-center gap-1.5">
                                        Grade by cluster
                                        <span className="text-[10px] bg-green-100 text-green-700 rounded px-1.5 py-0.5">Recommended</span>
                                    </p>
                                    <p className="text-muted-foreground">
                                        Groups students with similar code + test behavior. You grade one representative
                                        per cluster and the mark propagates to every member — the fastest way to grade
                                        fairly at scale. Opens the Cluster Grading tab (run Autograder+ first).
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <UserCheck className="w-5 h-5 text-gray-600 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-medium">Grade individually</p>
                                    <p className="text-muted-foreground">
                                        Opens the full code-grading page for the first student, where you review each
                                        student's code and test results and enter a score one by one. Most control,
                                        most effort.
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <Wand2 className="w-5 h-5 text-gray-600 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-medium">Grade automatically</p>
                                    <p className="text-muted-foreground">
                                        Derives grades from each submission's test-case pass percentage. Choose:
                                    </p>
                                    <ul className="text-muted-foreground list-disc pl-5 mt-1 space-y-0.5">
                                        <li><b>Pass % as grade</b> — grade equals the pass percentage.</li>
                                        <li><b>Range</b> — floor at a minimum (e.g. 0% pass still gives 20), scale up to a max; optional full marks when all tests pass.</li>
                                        <li><b>Formula</b> — grade = pass% × multiplier + offset.</li>
                                    </ul>
                                    <p className="text-muted-foreground mt-1">
                                        Existing manual/cluster grades are kept unless you opt to overwrite. Always
                                        preview before applying.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </motion.div>
        </TeacherLayout >
    );
}
