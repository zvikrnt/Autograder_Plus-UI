import { useState, useEffect } from "react";
import ReactMarkdown from 'react-markdown';
import { Link, useNavigate } from "react-router-dom";
import {
    Search,
    Filter,
    Calendar,
    CheckCircle2,
    Clock,
    AlertCircle,
    ArrowRight,
    Loader2,
    Timer
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import StudentLayout from "../../components/layout/StudentLayout";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent } from "../../components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../../components/ui/select";
import { Badge } from "../../components/ui/badge";

import { assignmentService } from "../../services/assignmentService";
import { classService } from "../../services/classService";
import { submissionService } from "../../services/submissionService";

export default function StudentAssignments() {
    const navigate = useNavigate();
    const [assignments, setAssignments] = useState([]);
    const [classes, setClasses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState("active");
    const [classFilter, setClassFilter] = useState("all");
    const [showStartConfirmation, setShowStartConfirmation] = useState(false);
    const [selectedAssignment, setSelectedAssignment] = useState(null);
    const [showFullDescription, setShowFullDescription] = useState(false);
    const [gradebookStatusMap, setGradebookStatusMap] = useState({});

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                // Parallel fetch
                const [assignRes, classRes, gradebookRes] = await Promise.all([
                    assignmentService.getAssignments(),
                    classService.getClasses(),
                    submissionService.getGradebookEntries()
                ]);

                const assignData = Array.isArray(assignRes.data) ? assignRes.data : (assignRes.data.results || []);
                const classData = Array.isArray(classRes.data) ? classRes.data : (classRes.data.results || []);
                const gradebookRows = Array.isArray(gradebookRes.data) ? gradebookRes.data : (gradebookRes.data?.results || []);
                const statusByAssignment = {};
                gradebookRows.forEach((entry) => {
                    if (entry?.content_item) {
                        statusByAssignment[String(entry.content_item)] = entry.status;
                    }
                });

                const hydratedAssignments = assignData.map((item) => {
                    const gradeStatus = statusByAssignment[String(item.id)];
                    return {
                        ...item,
                        is_graded: gradeStatus === "graded",
                        is_submitted: gradeStatus === "submitted" || gradeStatus === "graded",
                    };
                });

                setAssignments(hydratedAssignments);
                setClasses(classData);
                setGradebookStatusMap(statusByAssignment);
            } catch (err) {
                console.error("Failed to load data:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const handleStartAssignment = (assignment, e) => {
        e.preventDefault(); // Prevent Link navigation
        setSelectedAssignment(assignment);
        setShowFullDescription(false);
        setShowStartConfirmation(true);
    };

    const handleConfirmStart = () => {
        if (selectedAssignment) {
            navigate(`/student/workspace/${selectedAssignment.id}`);
        }
        setShowStartConfirmation(false);
        setSelectedAssignment(null);
        setShowFullDescription(false);
    };

    const getExcerpt = (text, limit = 300) => {
        if (!text) return "";
        if (text.length <= limit) return text;
        return text.slice(0, limit).trim() + '...';
    };

    // Helper for relative time
    const getRelativeTime = (dateString) => {
        if (!dateString) return null;
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = date - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return { text: `Ended ${Math.abs(diffDays)} days ago`, color: "text-gray-500 bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700" };
        if (diffDays === 0) return { text: "Due today", color: "text-amber-700 bg-amber-50 border-amber-200" };
        if (diffDays === 1) return { text: "Due tomorrow", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
        return { text: `Due in ${diffDays} days`, color: "text-indigo-700 bg-indigo-50 border-indigo-200" };
    };

    // Filter Logic
    const filteredAssignments = assignments.filter(item => {
        const matchesSearch = item.title.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesClass = classFilter === "all" || item.class_id?.toString() === classFilter;

        const now = new Date();
        const dueDate = item.due_date ? new Date(item.due_date) : null;
        const isEnded = dueDate && dueDate < now;
        const isSubmitted = item.is_submitted;

        let matchesTab = true;
        if (activeTab === "active") {
            // Active = Not ended AND Not submitted (To Do)
            matchesTab = !isEnded && !isSubmitted;
        } else {
            // Past = Ended OR Submitted (Completed)
            matchesTab = isEnded || isSubmitted;
        }

        return matchesSearch && matchesClass && matchesTab;
    });

    // Counts
    const counts = {
        active: assignments.filter(a => {
            const d = a.due_date ? new Date(a.due_date) : null;
            const isEnded = d && d < new Date();
            const isSubmitted = a.is_submitted;
            return !isEnded && !isSubmitted;
        }).length,
        past: assignments.filter(a => {
            const d = a.due_date ? new Date(a.due_date) : null;
            const isEnded = d && d < new Date();
            const isSubmitted = a.is_submitted;
            return isEnded || isSubmitted;
        }).length
    };

    const getStatusBadge = (item) => {
        if (item.is_graded) return <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-green-200">Graded</Badge>;
        if (item.is_submitted) return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200">Submitted</Badge>;

        const isOverdue = new Date(item.due_date) < new Date();
        if (isOverdue) return <Badge variant="destructive">Missing</Badge>;

        return <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">To Do</Badge>;
    };

    return (
        <StudentLayout>
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-6xl mx-auto space-y-8"
            >
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">My Classwork</h1>
                        <p className="text-gray-500">Track and manage your tasks, exams, and quizzes</p>
                    </div>
                </div>

                {/* Filters & Tabs */}
                <div className="flex flex-col gap-6">
                    {/* Tabs */}
                    <div className="flex items-center space-x-1 rounded-xl bg-gray-100 dark:bg-gray-800 p-1 w-fit">
                        {['active', 'past'].map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`
                                    flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200
                                    ${activeTab === tab
                                        ? "bg-white dark:bg-gray-800 text-indigo-600 shadow-sm ring-1 ring-black/5"
                                        : "text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200/50 dark:hover:bg-gray-600/50"
                                    }
                                `}
                            >
                                <span className="capitalize">{tab}</span>
                                <span className={`
                                    px-2 py-0.5 rounded-md text-[10px] font-bold
                                    ${activeTab === tab ? "bg-indigo-50 text-indigo-700" : "bg-gray-200 dark:bg-gray-700 text-gray-600"}
                                `}>
                                    {counts[tab] || 0}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Search & Class Filter */}
                    <div className="flex gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                            <Input
                                placeholder="Search assignments..."
                                className="pl-9 bg-white dark:bg-gray-800"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="w-48">
                            <Select value={classFilter} onValueChange={setClassFilter}>
                                <SelectTrigger className="bg-white dark:bg-gray-800">
                                    <SelectValue placeholder="All Classes" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Classes</SelectItem>
                                    {classes.map(c => (
                                        <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                {/* List */}
                {loading ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                    </div>
                ) : filteredAssignments.length === 0 ? (
                    <div className="text-center py-20 bg-gray-50 dark:bg-gray-900 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                        <div className="p-4 bg-white dark:bg-gray-800 rounded-full w-fit mx-auto mb-4 shadow-sm">
                            <Filter className="w-6 h-6 text-gray-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900">No {activeTab} assignments</h3>
                        <p className="text-gray-500 max-w-sm mx-auto mt-2">
                            You're all caught up! Check back later for new tasks.
                        </p>
                        {searchTerm && (
                            <Button
                                variant="link"
                                onClick={() => { setSearchTerm(""); setClassFilter("all") }}
                                className="mt-4 text-indigo-600 font-medium"
                            >
                                Clear Search Filters
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        {filteredAssignments.map((assignment) => {
                            const timeStatus = getRelativeTime(assignment.due_date);
                            return (
                                <motion.div
                                    key={assignment.id}
                                    layout
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                >
                                    <Card className={`hover:shadow-md transition-shadow group cursor-pointer overflow-hidden border-l-4 ${assignment.is_submitted ? "border-l-green-500 hover:border-l-green-600" : "border-l-transparent hover:border-l-indigo-600"
                                        }`}>
                                        <div onClick={(e) => handleStartAssignment(assignment, e)} className="block">
                                            <CardContent className="p-6 flex flex-col md:flex-row md:items-center gap-6">

                                                {/* Details */}
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-3 mb-2">
                                                        <h3 className="font-bold text-lg text-gray-900 group-hover:text-indigo-600 transition-colors">
                                                            {assignment.title}
                                                        </h3>
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${assignment.type === 'quiz' ? "bg-purple-50 text-purple-700 border-purple-200" :
                                                                assignment.mode === 'exam' ? "bg-red-50 text-red-700 border-red-200" :
                                                                    "bg-blue-50 text-blue-700 border-blue-200"
                                                            } capitalize`}>
                                                            {assignment.type === 'quiz' ? 'Quiz' : assignment.mode === 'exam' ? 'Exam' : 'Assignment'}
                                                        </span>
                                                        {getStatusBadge(assignment)}
                                                    </div>

                                                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-500">
                                                        <span className="flex items-center gap-1.5 font-medium text-gray-700">
                                                            <CheckCircle2 className="w-4 h-4 text-gray-400" />
                                                            {assignment.class_name || "Class"}
                                                        </span>

                                                        {timeStatus ? (
                                                            <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs font-semibold ${timeStatus.color}`}>
                                                                <Clock className="w-3.5 h-3.5" />
                                                                {timeStatus.text}
                                                            </span>
                                                        ) : (
                                                            <span className="flex items-center gap-1.5">
                                                                <Clock className="w-3.5 h-3.5" />
                                                                No deadline
                                                            </span>
                                                        )}

                                                        <span className="flex items-center gap-1.5">
                                                            <AlertCircle className="w-4 h-4 text-gray-400" />
                                                            {assignment.difficulty || "Medium"}
                                                        </span>
                                                        <span>• {assignment.points} pts</span>
                                                    </div>
                                                </div>

                                                {/* Action */}
                                                <div className="flex items-center gap-4">
                                                    {(gradebookStatusMap[String(assignment.id)] === "graded" || assignment.is_graded) && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                navigate(`/student/assignment/${assignment.id}/report`);
                                                            }}
                                                        >
                                                            View Report
                                                        </Button>
                                                    )}
                                                    <Button variant="ghost" size="icon" className="text-gray-400 group-hover:text-indigo-600 group-hover:bg-indigo-50">
                                                        <ArrowRight className="w-5 h-5" />
                                                    </Button>
                                                </div>
                                            </CardContent>
                                        </div>
                                    </Card>
                                </motion.div>
                            )
                        })}
                    </div>
                )}
            </motion.div>

            {/* Start Assignment Confirmation Modal */}
            <AnimatePresence>
                {showStartConfirmation && selectedAssignment && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[1px]"
                    >
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.8, opacity: 0 }}
                            className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-2xl text-center max-w-md w-full mx-4"
                        >
                            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${selectedAssignment.is_submitted ? "bg-green-100" : "bg-indigo-100"
                                }`}>
                                {selectedAssignment.is_submitted ? (
                                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                                ) : (
                                    <Timer className="w-8 h-8 text-indigo-600" />
                                )}
                            </div>

                            <h2 className="text-2xl font-bold text-gray-900 mb-2">
                                {selectedAssignment.is_submitted ? "View Submission?" : "Start Assignment?"}
                            </h2>
                            <p className="text-gray-500 mb-2 font-semibold">
                                {selectedAssignment.title}
                            </p>

                            {selectedAssignment.description ? (
                                <div className="text-left text-sm text-gray-600 mb-4 max-h-40 overflow-hidden">
                                    <ReactMarkdown>
                                        {showFullDescription ? selectedAssignment.description : getExcerpt(selectedAssignment.description, 500)}
                                    </ReactMarkdown>
                                    {selectedAssignment.description.length > 500 && (
                                        <div className="mt-2 text-right">
                                            <button
                                                onClick={() => setShowFullDescription(s => !s)}
                                                className="text-indigo-600 text-sm font-medium"
                                            >
                                                {showFullDescription ? 'Show less' : 'Show more'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : null}

                            {selectedAssignment.is_submitted ? (
                                <p className="text-gray-500 mb-6">
                                    You have already submitted this {selectedAssignment.type === 'quiz' ? 'quiz' : selectedAssignment.mode === 'exam' ? 'exam' : 'assignment'}. You can view your code in read-only mode.
                                </p>
                            ) : (
                                <p className="text-gray-500 mb-6">
                                    {selectedAssignment.mode === 'exam'
                                        ? "This is an EXAM. Once started, you must remain in fullscreen. Leaving the exam or switching tabs will result in automatic submission. Are you ready?"
                                        : `Once you start, the timer will begin and you can only exit by submitting your solution. Are you ready to begin?`}
                                </p>
                            )}

                            <div className="flex gap-3">
                                <Button
                                    variant="outline"
                                    onClick={() => setShowStartConfirmation(false)}
                                    className="flex-1"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleConfirmStart}
                                    className={`flex-1 text-white ${selectedAssignment.is_submitted
                                        ? "bg-green-600 hover:bg-green-700"
                                        : selectedAssignment.mode === 'exam' ? "bg-red-600 hover:bg-red-700" : "bg-indigo-600 hover:bg-indigo-700"
                                        }`}
                                >
                                    {selectedAssignment.is_submitted ? "View Submission" : `Start ${selectedAssignment.type === 'quiz' ? 'Quiz' : selectedAssignment.mode === 'exam' ? 'Exam' : 'Assignment'}`}
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </StudentLayout>
    );
}
