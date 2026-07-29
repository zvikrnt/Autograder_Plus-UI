import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
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
    Loader2,
    AlertCircle,
    Clock,
    Layers
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import TeacherAssistantLayout from "../../components/layout/TeacherAssistantLayout";
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
import ErrorHeatmap from "../../components/features/analytics/ErrorHeatmap";
import CodeSimilarityMap from "../../components/features/analytics/CodeSimilarityMap";
import ClusterGradingPanel from "../../components/features/analytics/ClusterGradingPanel";

export default function AssignmentDashboard() {
    const { id } = useParams();
    const [searchTerm, setSearchTerm] = useState("");
    const [filterStatus, setFilterStatus] = useState("All");

    // Data State
    const [assignment, setAssignment] = useState(null);
    const [studentsSummary, setStudentsSummary] = useState([]); // Aggregated student data
    const [submissions, setSubmissions] = useState([]); // Raw submissions (kept for Analytics)
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Analytics Navigation State
    const [selectedQuestion, setSelectedQuestion] = useState(null);
    const [wordClouds, setWordClouds] = useState({ full: null, partial: null });
    const [wordCloudLoading, setWordCloudLoading] = useState(false);
    const [analysisStatus, setAnalysisStatus] = useState({ analyzed: 0 });
    // Reset word cloud when switching questions
    const handleSelectQuestion = (qId) => {
        setSelectedQuestion(qId);
        setWordClouds({ full: null, partial: null });
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                // 1. Fetch Assignment Details
                const assignResponse = await assignmentService.getAssignment(id);
                setAssignment(assignResponse.data);

                // 2. Fetch Aggregated Student Summary (For Table)
                const summaryRes = await submissionService.getAssignmentSummary(id);
                setStudentsSummary(summaryRes.data);

                // 3. Fetch Raw Submissions (For Analytics)
                const subResponse = await submissionService.getAssignmentSubmissions(id);
                const subData = Array.isArray(subResponse.data) ? subResponse.data : (subResponse.data?.results || []);
                setSubmissions(subData);

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

    // Fetch analysis progress once so we know if AI data exists
    useEffect(() => {
        assignmentService.getAnalysisProgress(id)
            .then(r => setAnalysisStatus(r.data))
            .catch(() => { });
    }, [id]);

    // Auto-fetch word clouds when a question is selected and AI data exists
    useEffect(() => {
        if (!selectedQuestion || !analysisStatus?.analyzed) return;
        const fetchWordClouds = async () => {
            setWordCloudLoading(true);
            setWordClouds({ full: null, partial: null });
            try {
                const wcRes = await assignmentService.getWordCloud(id, selectedQuestion);
                const { full, partial } = wcRes.data;
                setWordClouds({
                    full: full?.image_base64 ?? null,
                    partial: partial?.image_base64 ?? null,
                });
            } catch (e) {
                if (e.response?.status !== 404) {
                    // silent on 404 (no AI data yet for this question)
                }
            } finally {
                setWordCloudLoading(false);
            }
        };
        fetchWordClouds();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedQuestion, id]);

    // Derived Stats
    const totalStudents = assignment?.total_students || 0;
    const submittedCount = studentsSummary.filter(s => s.status === 'submitted').length;
    const gradedCount = studentsSummary.filter(s => s.status === 'graded').length;

    // Calculate Average Score
    const scores = studentsSummary.filter(s => s.final_score > 0).map(s => s.final_score); // Filter 0s if needed, or include
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;



    // Calculate Highest/Lowest
    const highestScore = scores.length > 0 ? Math.max(...scores) : 0;
    const lowestScore = scores.length > 0 ? Math.min(...scores) : 0;
    const completionRate = totalStudents > 0 ? Math.round((submittedCount / totalStudents) * 100) : 0;

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

    if (loading) {
        return (
            <TeacherAssistantLayout>
                <div className="flex h-[80vh] items-center justify-center">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
                </div>
            </TeacherAssistantLayout>
        );
    }

    if (error || !assignment) {
        return (
            <TeacherAssistantLayout>
                <div className="flex flex-col h-[80vh] items-center justify-center text-red-500">
                    <AlertCircle className="w-12 h-12 mb-4" />
                    <h2 className="text-xl font-bold">Error</h2>
                    <p>{error || "Assignment not found"}</p>
                    <Button variant="outline" className="mt-4" asChild>
                        <Link to="/teacher/dashboard">Back to Dashboard</Link>
                    </Button>
                </div>
            </TeacherAssistantLayout>
        );
    }

    return (
        <TeacherAssistantLayout>
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
            >
                {/* Header */}
                <div className="flex flex-col gap-4 md:flex-row md:items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" asChild>
                            <Link to="/teacher/dashboard">
                                <MoveLeft className="w-5 h-5" />
                            </Link>
                        </Button>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-2xl font-bold text-gray-900">{assignment.title}</h1>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${assignment.status === 'published' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-700 border-gray-200'
                                    }`}>
                                    {assignment.status}
                                </span>
                            </div>
                            <p className="text-gray-500 text-sm mt-1">Due {new Date(assignment.due_date).toLocaleDateString()}</p>
                        </div>
                    </div>
                </div>

                {/* Main Content Tabs */}
                <Tabs defaultValue="submissions" className="space-y-6">
                    <TabsList className="bg-white dark:bg-gray-800 border p-1 rounded-lg">
                        <TabsTrigger value="submissions" className="flex items-center gap-2">
                            <ListChecks className="w-4 h-4" />
                            Submissions
                        </TabsTrigger>
                        <TabsTrigger value="analytics" className="flex items-center gap-2">
                            <BarChart3 className="w-4 h-4" />
                            Analytics & Insights
                        </TabsTrigger>
                        <TabsTrigger value="cluster" className="flex items-center gap-2">
                            <Layers className="w-4 h-4" />
                            Cluster Grading
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
                                    <p className="text-xs text-muted-foreground">To grade: {submittedCount - gradedCount}</p>
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

                        {/* Submission Table */}
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle>All Submissions</CardTitle>
                                        <CardDescription>Manage individual student grades</CardDescription>
                                    </div>
                                    <div className="flex gap-2 items-center">
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
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold uppercase">
                                                                {item.student.first_name?.[0] || item.student.email?.[0] || "?"}
                                                            </div>
                                                            <div>
                                                                <div className="text-sm font-medium">
                                                                    {item.student.first_name ? `${item.student.first_name} ${item.student.last_name}` : item.student.username}
                                                                </div>
                                                                <div className="text-xs text-gray-500">{item.student.email}</div>
                                                            </div>
                                                        </div>
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



                                {(() => {
                                    const questionSubs = submissions.filter(s => s.question?.id === selectedQuestion);
                                    const validSubs = questionSubs.filter(s => s.final_score !== null);

                                    // EMPTY STATE HANDLER
                                    if (validSubs.length === 0) {
                                        return (
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

                                                    {questionSubs.length > 0 && (
                                                        <p className="text-xs text-amber-600 font-medium bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                                                            {questionSubs.length} pending submissions waiting to be graded
                                                        </p>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        );
                                    }

                                    return (
                                        <div className="space-y-6">
                                            {/* Row 1: Key Performance Metrics */}
                                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[400px]">
                                                <div className="lg:col-span-2 h-full">
                                                    <PerformanceMatrix
                                                        submissions={validSubs}
                                                    />
                                                </div>
                                                <div className="lg:col-span-1 h-full">
                                                    <BoxPlotChart
                                                        data={(() => {
                                                            const values = validSubs
                                                                .map(s => s.final_score)
                                                                .sort((a, b) => a - b);

                                                            // We know length > 0 here
                                                            const q1 = values[Math.floor(values.length * 0.25)];
                                                            const median = values[Math.floor(values.length * 0.5)];
                                                            const q3 = values[Math.floor(values.length * 0.75)];

                                                            return [{
                                                                name: "Class",
                                                                min: values[0],
                                                                q1: q1,
                                                                median: median,
                                                                q3: q3,
                                                                max: values[values.length - 1]
                                                            }];
                                                        })()}
                                                    />
                                                </div>
                                            </div>

                                            {/* Row 2: Deep Dive (Heatmap + Word Cloud) */}
                                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[400px]">
                                                <div className="lg:col-span-2 h-full">
                                                    <ErrorHeatmap
                                                        questions={[{
                                                            id: currentQuestion?.id,
                                                            title: "Concept Mastery",
                                                            avgScore: Math.round(avgScore),
                                                            testCases: (() => {
                                                                const questionId = currentQuestion?.id;
                                                                const questionSubs = validSubs.filter(s => s.question?.id === questionId);

                                                                if (questionSubs.length === 0) return [];

                                                                const tcStats = {};

                                                                // Helper to get concept from assignment data
                                                                const getConcept = (idx) => {
                                                                    if (currentQuestion?.testCases && currentQuestion.testCases[idx]) {
                                                                        return currentQuestion.testCases[idx].concept || `Test Case ${idx + 1}`;
                                                                    }
                                                                    return `Test Case ${idx + 1}`;
                                                                };

                                                                questionSubs.forEach(sub => {
                                                                    if (sub.test_results) {
                                                                        sub.test_results.forEach((res, idx) => {
                                                                            const key = idx;
                                                                            if (!tcStats[key]) {
                                                                                tcStats[key] = {
                                                                                    passes: 0,
                                                                                    total: 0,
                                                                                    name: getConcept(idx),
                                                                                    concept: getConcept(idx) // Pass concept specifically
                                                                                };
                                                                            }

                                                                            tcStats[key].total++;
                                                                            if (res.status === 'pass') tcStats[key].passes++;
                                                                        });
                                                                    }
                                                                });

                                                                return Object.values(tcStats).map((stat, i) => ({
                                                                    id: i,
                                                                    name: stat.name,
                                                                    concept: stat.concept,
                                                                    passRate: stat.total > 0 ? Math.round((stat.passes / stat.total) * 100) : 0
                                                                }));
                                                            })()
                                                        }]}
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
                                                <CodeSimilarityMap />
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        )}
                    </TabsContent>

                    {/* --- TAB: CLUSTER GRADING --- */}
                    <TabsContent value="cluster">
                        <ClusterGradingPanel assignmentId={id} />
                    </TabsContent>
                </Tabs>
            </motion.div>
        </TeacherAssistantLayout >
    );
}