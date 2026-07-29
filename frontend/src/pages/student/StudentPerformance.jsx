import { useState, useEffect } from "react";
import StudentLayout from "../../components/layout/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import {
    TrendingUp,
    Clock,
    Target,
    Flame,
    Brain,
    Code2,
    Calendar,
    Loader2,
    Star,
    Users,
    BookOpen,
    Award,
    Trophy,
} from "lucide-react";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    Radar,
    Brush,
    Legend,
} from "recharts";
import { LeaderboardWidget, PointsDisplay, AchievementBadges, ErrorBoundary } from "../../components/features/gamification";
import { submissionService } from "../../services/submissionService";
import { gamificationService } from "../../services/gamificationService";
import { practiceService } from "../../services/practiceService";

// ─── Constants ─────────────────────────────────────────────────────────────────

const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];

const TYPE_COLORS = {
    assignment: "#3B82F6",
    quiz: "#8B5CF6",
    exam: "#EF4444",
};

const TYPE_LABELS = {
    assignment: "Assignment",
    quiz: "Quiz",
    exam: "Exam",
};

// ─── Sub-components ─────────────────────────────────────────────────────────────

const StatCard = ({ title, value, subtitle, icon: Icon, color = "blue" }) => {
    const colorMap = {
        blue: "bg-blue-50 text-blue-600",
        green: "bg-green-50 text-green-600",
        purple: "bg-purple-50 text-purple-600",
        orange: "bg-orange-50 text-orange-600",
        rose: "bg-rose-50 text-rose-600",
    };
    return (
        <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-5">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
                        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
                    </div>
                    <div className={`p-3 rounded-xl ${colorMap[color]}`}>
                        <Icon className="w-5 h-5" />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

// Tabbed leaderboard card: Daily / Weekly / Global
const LEADERBOARD_TABS = [
    { id: 'daily', label: 'Daily', icon: '☀️' },
    { id: 'weekly', label: 'Weekly', icon: '📅' },
    { id: 'global', label: 'All Time', icon: '🌍' },
];

const LeaderboardSection = () => {
    const [activeTab, setActiveTab] = useState('global');
    return (
        <Card>
            <CardHeader className="pb-0">
                <CardTitle className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-500" />
                    Leaderboard
                </CardTitle>
                {/* Tabs */}
                <div className="flex gap-1 mt-3 border-b border-gray-100 dark:border-gray-800 pb-0">
                    {LEADERBOARD_TABS.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-t-lg border-b-2 transition-colors ${activeTab === tab.id
                                    ? 'border-indigo-500 text-indigo-600 bg-indigo-50'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                                }`}
                        >
                            <span>{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <LeaderboardWidget
                    key={activeTab}
                    type={activeTab}
                    limit={10}
                    showUserRank={activeTab === 'global'}
                    compact={true}
                    scrollable={true}
                    entriesMaxHeightClass="max-h-[320px]"
                    className="border-0 shadow-none rounded-none"
                />
            </CardContent>
        </Card>
    );
};


const GradeTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-3 text-sm">
            <p className="font-semibold text-gray-900">{d.label}</p>
            <p className="text-xs text-gray-500 mt-0.5">
                <span className="inline-block px-1.5 py-0.5 rounded text-white text-xs font-medium mr-1"
                    style={{ background: TYPE_COLORS[d.type] || "#3B82F6" }}>
                    {TYPE_LABELS[d.type] || "Assignment"}
                </span>
            </p>
            <p className="text-indigo-600 font-bold mt-1">{d.score}%</p>
        </div>
    );
};

// ─── Main component ─────────────────────────────────────────────────────────────

export default function StudentPerformance() {
    const [performanceData, setPerformanceData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [timeframe, setTimeframe] = useState("30d");

    const formatTime = (minutes) => {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    };

    const loadData = async (tf = timeframe) => {
        try {
            setLoading(true);
            setError(null);

            const [analyticsRes, performanceRes, gradebookRes, practiceAnalyticsRes] = await Promise.all([
                gamificationService.getStudentAnalytics().catch(() => ({ success: false })),
                gamificationService.getStudentPerformance(tf).catch(() => ({ success: false })),
                submissionService.getGradebookSummary().catch(() => ({ success: false })),
                practiceService.getPracticeAnalytics('summary').catch(() => ({ success: false })),
            ]);

            // ── Core analytics ──
            const analytics = analyticsRes.success ? analyticsRes.data : null;
            const analyticsCore = analytics?.data?.analytics || analytics?.analytics || {};
            const rankData = analytics?.data?.rank || analytics?.rank || null;
            const pointsData = analytics?.data?.points || analytics?.points || {};

            // ── Student-performance endpoint ──
            const perfData = performanceRes.success ? performanceRes.data?.data : null;

            // ── Gradebook: ALL entries, oldest first (for chart) ──
            const gradebook = gradebookRes.success ? gradebookRes.data : null;
            const gradeHistory = (gradebook?.recent_entries || []).map((entry, i) => ({
                label: entry.content_item_title || `Entry ${i + 1}`,
                type: entry.content_item_type === 'quiz' ? 'quiz' : (entry.content_item_mode === 'exam' ? 'exam' : 'assignment'),
                score: Math.round(entry.final_score || 0),
                shortLabel: (entry.content_item_title || `#${i + 1}`).slice(0, 18),
            }));

            // ── Practice summary ──
            const practiceStats = practiceAnalyticsRes.success ? practiceAnalyticsRes.data?.data : null;

            // ── Concept mastery ──
            const masteryDict = analyticsCore.concept_mastery || {};
            const conceptMastery = Object.entries(masteryDict).map(([concept, mastery]) => ({
                concept,
                mastery: Math.round(mastery),
            }));

            // ── Weekly activity: strictly from new endpoint, no fallback ──
            const weeklyActivity = perfData?.weekly_activity || [];

            // ── Language breakdown ──
            const languageStats = (perfData?.language_breakdown || []).map(l => ({
                language: (l.language || "python").charAt(0).toUpperCase() + (l.language || "python").slice(1),
                submissions: l.submissions,
                avgScore: l.avg_score,
            }));

            // ── Class comparison ──
            const classComparison = perfData?.class_comparison || null;

            setPerformanceData({
                overview: {
                    averageScore: Math.round(gradebook?.summary?.average_score || analyticsCore.average_score || 0),
                    completedAssignments: gradebook?.summary?.total_assignments || analyticsCore.total_assignments_completed || 0,
                    currentStreak: analyticsCore.current_streak || 0,
                    longestStreak: analyticsCore.longest_streak || 0,
                    totalTimeSpent: analyticsCore.total_time_spent || 0,
                    totalPoints: pointsData?.total_points || 0,
                    rank: rankData?.user_rank || 0,
                    totalStudents: rankData?.total_users || 0,
                    practiceCompleted: analyticsCore.total_practice_completed || practiceStats?.total_completed || 0,
                },
                gradeHistory,
                weeklyActivity,
                languageStats,
                conceptMastery,
                classComparison,
            });
        } catch (err) {
            console.error("Failed to load performance data:", err);
            setError("Failed to load performance data. Please try refreshing.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(timeframe); }, [timeframe]);

    if (loading) {
        return (
            <StudentLayout>
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                    <span className="ml-2 text-gray-600">Loading performance data...</span>
                </div>
            </StudentLayout>
        );
    }

    if (error) {
        return (
            <StudentLayout>
                <div className="text-center py-8">
                    <p className="text-red-600 mb-4">{error}</p>
                    <Button onClick={() => loadData()}>Retry</Button>
                </div>
            </StudentLayout>
        );
    }

    if (!performanceData) {
        return (
            <StudentLayout>
                <div className="text-center py-8">
                    <p className="text-gray-600">No performance data available yet. Start completing assignments or practice questions!</p>
                </div>
            </StudentLayout>
        );
    }

    const { overview, gradeHistory, weeklyActivity, languageStats, conceptMastery, classComparison } = performanceData;

    // For Brush: show last 10 points initially when chart has many entries
    const brushStart = gradeHistory.length > 10 ? gradeHistory.length - 10 : 0;

    return (
        <StudentLayout>
            <div className="max-w-7xl mx-auto space-y-6 pb-10">

                {/* ── Header ── */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-gray-900">My Performance</h1>
                        <p className="text-gray-500 mt-1">Track your progress across assignments, exams, quizzes, and practice.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {["7d", "30d", "all"].map((tf) => (
                            <Button
                                key={tf}
                                variant={timeframe === tf ? "default" : "outline"}
                                size="sm"
                                onClick={() => setTimeframe(tf)}
                                className={timeframe === tf ? "bg-indigo-600 text-white" : ""}
                            >
                                {tf === "7d" ? "7 Days" : tf === "30d" ? "30 Days" : "All Time"}
                            </Button>
                        ))}
                    </div>
                </div>

                {/* ── Overview Stats Row ── */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    <StatCard title="Avg Grade Score" value={`${overview.averageScore}%`} subtitle={`${overview.completedAssignments} graded`} icon={Target} color="blue" />
                    <StatCard title="Current Streak" value={`${overview.currentStreak}d`} subtitle={`Best: ${overview.longestStreak}d`} icon={Flame} color="orange" />
                    <StatCard title="Practice Solved" value={overview.practiceCompleted} subtitle="Questions" icon={Brain} color="purple" />
                    <StatCard title="Time Invested" value={formatTime(overview.totalTimeSpent)} subtitle="Coding time" icon={Clock} color="green" />
                    <StatCard title="Global Rank" value={overview.rank > 0 ? `#${overview.rank}` : "—"} subtitle={`of ${overview.totalStudents} students`} icon={Star} color="rose" />
                </div>

                {/* ── Grade Progression (full-width) ── */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-indigo-500" />
                            Grade Progression
                            <span className="ml-auto text-xs font-normal text-gray-400 flex items-center gap-2">
                                {Object.entries(TYPE_COLORS).map(([type, color]) => (
                                    <span key={type} className="flex items-center gap-1">
                                        <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
                                        {TYPE_LABELS[type]}
                                    </span>
                                ))}
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {gradeHistory.length > 0 ? (
                            <ResponsiveContainer width="100%" height={320}>
                                <LineChart data={gradeHistory}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="shortLabel" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" height={60} />
                                    <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} />
                                    <Tooltip content={<GradeTooltip />} />
                                    {gradeHistory.length > 8 && (
                                        <Brush
                                            dataKey="shortLabel"
                                            height={20}
                                            stroke="#e0e7ff"
                                            startIndex={brushStart}
                                        />
                                    )}
                                    <Line
                                        type="monotone"
                                        dataKey="score"
                                        stroke="#3B82F6"
                                        strokeWidth={2.5}
                                        dot={(props) => {
                                            const { cx, cy, payload } = props;
                                            return (
                                                <circle
                                                    key={`dot-${cx}-${cy}`}
                                                    cx={cx} cy={cy} r={5}
                                                    fill={TYPE_COLORS[payload.type] || "#3B82F6"}
                                                    stroke="white" strokeWidth={2}
                                                />
                                            );
                                        }}
                                        activeDot={{ r: 7 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-60 flex items-center justify-center text-gray-400">
                                <div className="text-center">
                                    <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                    <p className="font-medium">No grades yet</p>
                                    <p className="text-sm mt-1">Complete assignments, quizzes, or exams to see your grade trend.</p>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* ── Weekly Activity + Language Usage ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Calendar className="w-5 h-5 text-emerald-500" /> Weekly Activity
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {weeklyActivity.length > 0 ? (
                                <ResponsiveContainer width="100%" height={250}>
                                    <BarChart data={weeklyActivity} barGap={4}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                                        <YAxis allowDecimals={false} />
                                        <Tooltip />
                                        <Legend />
                                        <Bar dataKey="practice" name="Practice Questions" fill="#6366F1" radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="assignments" name="Assignments / Tests" fill="#10B981" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
                                    <div className="text-center">
                                        <Calendar className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                        <p>No activity data yet</p>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Language Usage */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Code2 className="w-5 h-5 text-purple-500" /> Language Usage
                                <span className="text-xs font-normal text-gray-400 ml-1">(practice + assignments)</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {languageStats.length > 0 ? (
                                <div className="flex items-center gap-6">
                                    <ResponsiveContainer width="55%" height={220}>
                                        <PieChart>
                                            <Pie
                                                data={languageStats}
                                                cx="50%" cy="50%"
                                                innerRadius={55}
                                                outerRadius={90}
                                                dataKey="submissions"
                                                paddingAngle={3}
                                            >
                                                {languageStats.map((_, i) => (
                                                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(v, name, props) => [`${v} submissions`, props.payload.language]} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="flex-1 space-y-2">
                                        {languageStats.map((l, i) => {
                                            const total = languageStats.reduce((s, x) => s + x.submissions, 0);
                                            const pct = total > 0 ? Math.round((l.submissions / total) * 100) : 0;
                                            return (
                                                <div key={l.language} className="flex items-center gap-2">
                                                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                                                    <span className="text-sm text-gray-700 flex-1">{l.language}</span>
                                                    <span className="text-sm font-semibold text-gray-900">{pct}%</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
                                    <div className="text-center">
                                        <Code2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                        <p>Submit code to see language breakdown</p>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* ── Concept Mastery + Achievements ── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <Card className="lg:col-span-2">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Brain className="w-5 h-5 text-blue-500" /> Concept Mastery
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {conceptMastery.length > 0 ? (
                                <ResponsiveContainer width="100%" height={300}>
                                    <RadarChart data={conceptMastery}>
                                        <PolarGrid />
                                        <PolarAngleAxis dataKey="concept" tick={{ fontSize: 12 }} />
                                        <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                                        <Radar
                                            name="Mastery %"
                                            dataKey="mastery"
                                            stroke="#3B82F6"
                                            fill="#3B82F6"
                                            fillOpacity={0.25}
                                        />
                                        <Tooltip formatter={(v) => [`${v}%`, "Mastery"]} />
                                    </RadarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-64 flex items-center justify-center text-gray-400">
                                    <div className="text-center">
                                        <Brain className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                        <p className="font-medium">Concept mastery will appear here</p>
                                        <p className="text-sm mt-1">Complete practice questions across different categories</p>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Award className="w-5 h-5 text-yellow-500" />
                                Achievements
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 overflow-hidden">
                            <ErrorBoundary title="Achievement Error" message="Unable to load achievements">
                                <AchievementBadges showProgress={true} showNotifications={false} limit={8} compact={true} />
                            </ErrorBoundary>
                        </CardContent>
                    </Card>
                </div>

                {/* ── Leaderboards (tabbed) + Points ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <ErrorBoundary title="Points Error" message="Unable to load points data">
                        <PointsDisplay showHistory={true} showBreakdown={true} />
                    </ErrorBoundary>
                    <ErrorBoundary title="Leaderboard Error" message="Unable to load leaderboard">
                        <LeaderboardSection />
                    </ErrorBoundary>
                </div>

                {/* ── Class Comparison ── */}
                {classComparison && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <BookOpen className="w-5 h-5 text-teal-500" /> Class Comparison
                                <span className="text-xs font-normal text-gray-400 ml-1">Your scores vs class average</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                                <div className="space-y-4">
                                    <div>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="font-medium text-indigo-600">Your Points</span>
                                            <span className="font-bold">{Math.round(classComparison.student_avg)}</span>
                                        </div>
                                        {(() => {
                                            const maxScore = Math.max(classComparison.student_avg, classComparison.class_avg, 1);
                                            return (
                                                <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                                    <div className="h-full bg-indigo-500 rounded-full transition-all duration-700"
                                                        style={{ width: `${(classComparison.student_avg / maxScore) * 100}%` }} />
                                                </div>
                                            );
                                        })()}
                                    </div>
                                    <div>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="font-medium text-gray-500">Class Average</span>
                                            <span className="font-bold">{Math.round(classComparison.class_avg)}</span>
                                        </div>
                                        {(() => {
                                            const maxScore = Math.max(classComparison.student_avg, classComparison.class_avg, 1);
                                            return (
                                                <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                                    <div className="h-full bg-gray-400 rounded-full transition-all duration-700"
                                                        style={{ width: `${(classComparison.class_avg / maxScore) * 100}%` }} />
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>

                                {/* Delta badge */}
                                <div className="text-center">
                                    {(() => {
                                        const diff = Math.round(classComparison.student_avg - classComparison.class_avg);
                                        const isAhead = diff >= 0;
                                        return (
                                            <div className={`inline-flex flex-col items-center justify-center w-32 h-32 rounded-full border-4 ${isAhead ? "border-emerald-400 bg-emerald-50" : "border-orange-300 bg-orange-50"}`}>
                                                <span className={`text-2xl font-black ${isAhead ? "text-emerald-600" : "text-orange-500"}`}>
                                                    {isAhead ? "+" : ""}{diff}
                                                </span>
                                                <span className="text-xs font-medium text-gray-500 mt-1">
                                                    {isAhead ? "Above avg" : "Below avg"}
                                                </span>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </StudentLayout>
    );
}
