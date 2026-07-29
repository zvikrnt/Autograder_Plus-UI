import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
    Clock,
    CheckCircle2,
    ArrowRight,
    TrendingUp,
    Target,
    Flame,
    FileCode,
    Loader2,
    Plus,
    Timer
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

import StudentLayout from '../../components/layout/StudentLayout';
import { assignmentService } from '../../services/assignmentService';
import { submissionService } from '../../services/submissionService';
import { gamificationService } from '../../services/gamificationService';
import { Button } from '../../components/ui/button';
import JoinClassDialog from '../../components/features/student/JoinClassDialog';
import RiveDashboardCharacter from '../../components/features/student/RiveDashboardCharacter';
import { LeaderboardWidget, PointsDisplay, AchievementBadges, MarsBadge } from '../../components/features/gamification';
import MarsLeaderboard from '../../components/features/analytics/MarsLeaderboard';

// --- Components ---

const ProgressBar = ({ progress, className = "" }) => (
    <div className={`h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden ${className}`}>
        <div
            className="h-full bg-gray-900 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
        />
    </div>
);

const MotionDiv = motion.div;
const MotionSection = motion.section;

const StudentDashboard = () => {
    const navigate = useNavigate();
    const [assignments, setAssignments] = useState([]);
    const [recentActivity, setRecentActivity] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false);
    const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
    const [showStartConfirmation, setShowStartConfirmation] = useState(false);
    const [selectedAssignment, setSelectedAssignment] = useState(null);
    const [showFullDescription, setShowFullDescription] = useState(false);
    // Real analytics state
    const [analyticsData, setAnalyticsData] = useState(null);

    const fetchAssignments = async () => {
        try {
            const response = await assignmentService.getAssignments();
            const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
            setAssignments(data);
        } catch (err) {
            console.error("Failed to load assignments", err);
            setError("Could not load your assignments.");
        }
    };

    const fetchRecentActivity = async () => {
        try {
            const response = await submissionService.getSubmissions();
            const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
            // Sort by created_at desc
            data.sort((a, b) => new Date(b.created_at || b.submitted_at) - new Date(a.created_at || a.submitted_at));

            // Filter unique assignments to avoid spam
            const unique = [];
            const seen = new Set();
            for (const item of data) {
                const aid = item.assignment_id || item.assignment;
                if (aid && !seen.has(aid)) {
                    seen.add(aid);
                    unique.push(item);
                }
            }
            setRecentActivity(unique.slice(0, 5));
        } catch (err) {
            console.error("Failed to load activity", err);
        }
    };

    useEffect(() => {
        const init = async () => {
            setLoading(true);
            await Promise.all([
                fetchAssignments(),
                fetchRecentActivity(),
                gamificationService.getStudentAnalytics()
                    .then(res => {
                        if (res.success) {
                            const data = res.data;
                            const core = data?.data?.analytics || data?.analytics || {};
                            const trend = data?.data?.performance_trend || data?.performance_trend || [];
                            // this week's activity
                            const thisWeek = trend.slice(-7).reduce((s, d) => s + (d.total_activities || 0), 0);
                            setAnalyticsData({
                                currentStreak: core.current_streak || 0,
                                totalPracticeCompleted: core.total_practice_completed || 0,
                                totalAssignmentsCompleted: core.total_assignments_completed || 0,
                                thisWeekActivity: thisWeek,
                            });
                        }
                    })
                    .catch(() => { })
            ]);
            setLoading(false);
        };
        init();
    }, []);

    const handleJoinSuccess = () => {
        fetchAssignments();
        fetchRecentActivity();
        setSidebarRefreshKey(prev => prev + 1);
    };

    const handleStartAssignment = (assignment) => {
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

    // Derived State: Sort by urgency (excluding submitted & past-due)
    const sortedAssignments = [...assignments]
        .filter(a => {
            if (a.is_submitted) return false;
            const deadline = a.due_date || a.start_time;
            return !deadline || new Date(deadline) >= new Date();
        })
        .sort((a, b) => {
            const da = a.due_date || a.start_time;
            const db = b.due_date || b.start_time;
            if (!da) return 1;
            if (!db) return -1;
            return new Date(da) - new Date(db);
        });

    const activeAssignment = sortedAssignments[0];
    const upNext = sortedAssignments.slice(1, 8);

    const MOMENTUM_STATS = analyticsData
        ? [
            {
                label: "Day Streak",
                value: String(analyticsData.currentStreak),
                icon: Flame,
                color: "text-orange-500",
                bg: "bg-orange-50",
            },
            {
                label: "Practice Solved",
                value: String(analyticsData.totalPracticeCompleted),
                icon: CheckCircle2,
                color: "text-green-500",
                bg: "bg-green-50",
            },
            {
                label: "Assignments Done",
                value: String(analyticsData.totalAssignmentsCompleted),
                icon: FileCode,
                color: "text-blue-500",
                bg: "bg-blue-50",
            },
            {
                label: "This Week",
                value: String(analyticsData.thisWeekActivity),
                icon: TrendingUp,
                color: "text-indigo-500",
                bg: "bg-indigo-50",
            },
        ]
        : [
            { label: "Day Streak", value: "—", icon: Flame, color: "text-orange-500", bg: "bg-orange-50" },
            { label: "Practice Solved", value: "—", icon: CheckCircle2, color: "text-green-500", bg: "bg-green-50" },
            { label: "Assignments Done", value: "—", icon: FileCode, color: "text-blue-500", bg: "bg-blue-50" },
            { label: "This Week", value: "—", icon: TrendingUp, color: "text-indigo-500", bg: "bg-indigo-50" },
        ];

    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const pendingCount = sortedAssignments.length;
    const completedCount = analyticsData?.totalAssignmentsCompleted ?? assignments.filter((a) => a.is_submitted).length;

    if (loading) {
        return (
            <StudentLayout>
                <div className="flex justify-center items-center h-[60vh]">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
            </StudentLayout>
        );
    }

    return (
        <StudentLayout refreshTrigger={sidebarRefreshKey}>
            <div className="space-y-6 max-w-7xl mx-auto">

                {/* 1. Header & Momentum Indicators */}
                <header className="flex flex-col md:flex-row justify-between items-start md:items-start gap-6">
                    <div>
                        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">Workspace</h1>
                        <p className="text-gray-500 mt-2 text-lg">
                            {greeting}. {pendingCount > 0
                                ? `You have ${pendingCount} pending assignment${pendingCount === 1 ? "" : "s"} and ${completedCount} completed.`
                                : `You're all caught up with ${completedCount} completed assignment${completedCount === 1 ? "" : "s"}.`}
                        </p>
                    </div>

                    <div className="flex items-center gap-4 flex-wrap">
                        {/* MARS adaptive-practice rating */}
                        <MarsBadge />

                        <Button
                            onClick={() => setIsJoinDialogOpen(true)}
                            variant="outline"
                            className="gap-2 rounded-xl border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition-all font-medium"
                        >
                            <Plus className="w-4 h-4" />
                            Join Class
                        </Button>

                        {/* Gamification Stats - Replace placeholder with real data */}
                        <PointsDisplay compact={true} showBreakdown={false} className="border-0 shadow-sm" />
                    </div>
                </header>

                <JoinClassDialog
                    open={isJoinDialogOpen}
                    onOpenChange={setIsJoinDialogOpen}
                    onJoinSuccess={handleJoinSuccess}
                />

                {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error}
                    </div>
                )}

                {/* Momentum Row */}
                <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {MOMENTUM_STATS.map(({ label, value, icon, color, bg }) => (
                        <div
                            key={label}
                            className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-800 rounded-xl p-4 flex items-center justify-between hover:shadow-sm transition-shadow"
                        >
                            <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">{label}</p>
                                <p className="text-xl font-extrabold text-gray-900 mt-1">{value}</p>
                            </div>
                            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
                                {React.createElement(icon, { className: `w-5 h-5 ${color}` })}
                            </div>
                        </div>
                    ))}
                </section>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* LEFT COLUMN: Focus & Tasks */}
                    <div className="lg:col-span-2 space-y-8">

                        {/* 2. Hero Focus Card */}
                        <MotionDiv
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5 }}
                            className="bg-white dark:bg-gray-800 rounded-3xl p-0 shadow-lg shadow-indigo-100/50 border border-gray-100 dark:border-gray-800 relative overflow-hidden group hover:shadow-xl hover:shadow-indigo-100/60 transition-all duration-500"
                        >
                            {/* Premium Gradient Background */}
                            <div className="absolute inset-0 bg-gradient-to-br from-white via-indigo-50/30 to-white opacity-80" />

                            <div className="relative z-10 p-8 md:p-10 flex flex-col md:flex-row gap-8 items-center">
                                {/* Left Content */}
                                <div className="flex-1 w-full">
                                    {activeAssignment ? (
                                        <>
                                            <div className="flex items-center gap-3 mb-4">
                                                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full uppercase tracking-wider border border-indigo-100">
                                                    Current Priority
                                                </span>
                                                {activeAssignment.mode === 'exam' && (
                                                    <span className="text-xs font-bold text-red-600 bg-red-50 px-3 py-1 rounded-full uppercase tracking-wider border border-red-100">
                                                        Exam
                                                    </span>
                                                )}
                                                {activeAssignment.type === 'quiz' && activeAssignment.mode !== 'exam' && (
                                                    <span className="text-xs font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-full uppercase tracking-wider border border-amber-100">
                                                        Quiz
                                                    </span>
                                                )}
                                                {activeAssignment.due_date && (
                                                    <span className="text-xs font-semibold text-gray-400 flex items-center gap-1.5">
                                                        <Clock className="w-3.5 h-3.5" />
                                                        Due {new Date(activeAssignment.due_date).toLocaleDateString()}
                                                    </span>
                                                )}
                                                {!activeAssignment.due_date && activeAssignment.start_time && (
                                                    <span className="text-xs font-semibold text-gray-400 flex items-center gap-1.5">
                                                        <Clock className="w-3.5 h-3.5" />
                                                        Opens {new Date(activeAssignment.start_time).toLocaleDateString()}
                                                    </span>
                                                )}
                                            </div>

                                            <h2 className="text-3xl font-extrabold text-gray-900 mb-2 leading-tight">
                                                {activeAssignment.title}
                                            </h2>
                                            <p className="text-lg text-gray-500 mb-8 font-medium">
                                                {activeAssignment.class_name || "Assignments"}
                                            </p>

                                            <div className="grid grid-cols-2 gap-6 mb-8 bg-white/50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                                                <div>
                                                    <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Points</span>
                                                    <span className="font-bold text-xl text-gray-900">{activeAssignment.points || 100}</span>
                                                </div>
                                                <div>
                                                    <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Difficulty</span>
                                                    <span className={`font-bold text-xl ${activeAssignment.difficulty === 'Easy' ? 'text-green-600' :
                                                        activeAssignment.difficulty === 'Medium' ? 'text-amber-600' :
                                                            'text-red-600'
                                                        }`}>{activeAssignment.difficulty || 'Medium'}</span>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => handleStartAssignment(activeAssignment)}
                                                className="w-full md:w-auto px-8 py-4 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-all flex items-center justify-center gap-2 shadow-lg shadow-gray-200 hover:-translate-y-0.5"
                                            >
                                                Start {activeAssignment.type === 'quiz' ? 'Quiz' : activeAssignment.mode === 'exam' ? 'Exam' : 'Assignment'} <ArrowRight className="w-4 h-4 font-bold" />
                                            </button>
                                        </>
                                    ) : (
                                        <div className="py-10">
                                            <h3 className="text-2xl font-bold text-gray-900 mb-2">All Caught Up!</h3>
                                            <p className="text-gray-500">You have no pending assignments. Great job!</p>
                                        </div>
                                    )}
                                </div>

                                {/* Right Content - Rive Animation */}
                                <div className="w-full md:w-1/3 h-80 md:h-96 relative flex items-center justify-center">
                                    <div className="absolute inset-0 bg-indigo-100 rounded-full blur-3xl opacity-30 transform scale-75" />
                                    <RiveDashboardCharacter />
                                </div>
                            </div>
                        </MotionDiv>

                        {/* 3. Up Next Queue */}
                        {upNext.length > 0 && (
                            <MotionSection
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.1 }}
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                        <Clock className="w-5 h-5 text-gray-400" /> Up Next
                                    </h3>
                                    <Button
                                        variant="link"
                                        className="text-indigo-600 font-semibold text-sm"
                                        onClick={() => navigate("/student/calendar")}
                                    >
                                        View Calendar
                                    </Button>
                                </div>

                                <div className="space-y-3">
                                    {upNext.map((task, i) => (
                                        <div key={task.id} className="relative group">
                                            {/* Connector Line */}
                                            {i !== upNext.length - 1 && (
                                                <div className="absolute left-[26px] top-12 bottom-[-14px] w-0.5 bg-gray-100 dark:bg-gray-800 z-0 group-hover:bg-indigo-50 transition-colors" />
                                            )}

                                            <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 flex items-center justify-between hover:border-indigo-100 hover:shadow-md transition-all relative z-10 group-hover:-translate-y-0.5 duration-300">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-14 h-14 rounded-xl bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center border border-gray-100 dark:border-gray-800 group-hover:bg-indigo-50 group-hover:border-indigo-100 transition-colors">
                                                        <span className="text-xs font-semibold text-gray-400 uppercase group-hover:text-indigo-400">{task.due_date ? 'Due' : 'Opens'}</span>
                                                        <span className="text-lg font-bold text-gray-900 group-hover:text-indigo-700">
                                                            {new Date(task.due_date || task.start_time).getDate()}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <h4 className="font-bold text-gray-900 group-hover:text-indigo-700 transition-colors">{task.title}</h4>
                                                            {task.mode === 'exam' && (
                                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-red-50 text-red-700 border-red-100">Exam</span>
                                                            )}
                                                            {task.type === 'quiz' && task.mode !== 'exam' && (
                                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-100">Quiz</span>
                                                            )}
                                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${task.difficulty === 'Easy' ? 'bg-green-50 text-green-700 border-green-100' :
                                                                task.difficulty === 'Medium' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                                                    'bg-red-50 text-red-700 border-red-100'
                                                                }`}>{task.difficulty}</span>
                                                        </div>
                                                        <p className="text-sm text-gray-500 font-medium">
                                                            {task.class_name} • {task.points || 100} pts
                                                        </p>
                                                    </div>
                                                </div>
                                                <Button
                                                    onClick={() => handleStartAssignment(task)}
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"
                                                >
                                                    <ArrowRight className="w-5 h-5" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </MotionSection>
                        )}
                    </div>

                    {/* RIGHT COLUMN: Skills & Coaching */}
                    <div className="space-y-8 lg:sticky lg:top-20 self-start">
                        {/* Gamification Widgets */}
                        <MotionDiv
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.5, delay: 0.2 }}
                        >
                            <LeaderboardWidget
                                type="global"
                                limit={5}
                                compact={true}
                                className="shadow-lg shadow-gray-100/50"
                            />
                        </MotionDiv>

                        {/* MARS adaptive-practice leaderboard */}
                        <MotionDiv
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.5, delay: 0.22 }}
                        >
                            <MarsLeaderboard />
                        </MotionDiv>

                        <MotionDiv
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.5, delay: 0.25 }}
                        >
                            <AchievementBadges
                                showProgress={true}
                                limit={6}
                                compact={true}
                                className="shadow-lg shadow-gray-100/50"
                            />
                        </MotionDiv>

                        {/* 5. AI Coach / Next Skill */}
                        <MotionDiv
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.5, delay: 0.3 }}
                            className="bg-white dark:bg-gray-800 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-lg shadow-gray-100/50 relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full blur-3xl opacity-50 -translate-y-1/2 translate-x-1/2" />

                            <div className="relative z-10">
                                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center mb-4">
                                    <Target className="w-5 h-5 text-indigo-600" />
                                </div>

                                <h3 className="text-lg font-bold text-gray-900 mb-2">Weekly Goal</h3>
                                <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                                    Complete 5 activities this week to maintain your momentum.
                                </p>
                                {(() => {
                                    const done = Math.min(analyticsData?.thisWeekActivity ?? 0, 5);
                                    const goal = 5;
                                    const pct = Math.round((done / goal) * 100);
                                    return (
                                        <div className="space-y-2 mb-2">
                                            <div className="flex justify-between text-xs font-bold text-gray-500 uppercase tracking-wider">
                                                <span>Progress</span>
                                                <span>{done}/{goal}</span>
                                            </div>
                                            <ProgressBar progress={pct} className="bg-gray-100 dark:bg-gray-800" />
                                        </div>
                                    );
                                })()}
                            </div>
                        </MotionDiv>

                        {/* 6. Recent Activity */}
                        <MotionDiv
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.5, delay: 0.4 }}
                            className="bg-white dark:bg-gray-800 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm"
                        >
                            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-indigo-500" /> Recent Activity
                            </h3>

                            <div className="space-y-4">
                                {recentActivity.length > 0 ? recentActivity.map((activity, i) => (
                                    <div key={i} className="flex items-start gap-3">
                                        <div className="mt-1 p-1.5 bg-green-50 rounded-full">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-gray-900">
                                                Submitted <span className="font-bold">{activity.assignment_title || "Assignment"}</span>
                                            </p>
                                            <p className="text-xs text-gray-400">
                                                {new Date(activity.submitted_at || activity.created_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                )) : (
                                    <p className="text-sm text-gray-400 text-center py-4 italic">No recent activity yet</p>
                                )}
                            </div>
                        </MotionDiv>
                    </div>
                </div>

                {/* Start Assignment Confirmation Modal */}
                <AnimatePresence>
                    {showStartConfirmation && selectedAssignment && (
                        <MotionDiv
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[1px]"
                        >
                            <MotionDiv
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.8, opacity: 0 }}
                                className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-2xl text-center max-w-md w-full mx-4"
                            >
                                <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Timer className="w-8 h-8 text-indigo-600" />
                                </div>
                                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                                    {selectedAssignment.is_submitted ? 'View Submission?' : `Start ${selectedAssignment.type === 'quiz' ? 'Quiz' : selectedAssignment.mode === 'exam' ? 'Exam' : 'Assignment'}?`}
                                </h2>
                                <p className="text-gray-500 mb-2">
                                    <strong>{selectedAssignment.title}</strong>
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

                                <p className="text-gray-500 mb-6">
                                    {selectedAssignment.mode === 'exam'
                                        ? "This is an EXAM. Once started, you must remain in fullscreen. Leaving the exam or switching tabs will result in automatic submission. Are you ready?"
                                        : `Once you start, the timer will begin and you can only exit by submitting your solution. Are you ready to begin?`}
                                </p>
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
                                        className={`flex-1 text-white ${selectedAssignment.is_submitted ? 'bg-green-600 hover:bg-green-700' : selectedAssignment.mode === 'exam' ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                                        {selectedAssignment.is_submitted ? 'View Submission' : `Start ${selectedAssignment.type === 'quiz' ? 'Quiz' : selectedAssignment.mode === 'exam' ? 'Exam' : 'Assignment'}`}
                                    </Button>
                                </div>
                            </MotionDiv>
                        </MotionDiv>
                    )}
                </AnimatePresence>
            </div>
        </StudentLayout>
    );
};

export default StudentDashboard;
