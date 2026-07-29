import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthUser } from "../../hooks/useAuthUser";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
    BookOpen, Trophy, TrendingUp, Target, Star, Clock, CheckCircle2,
    Home, ArrowLeft, Flame, Loader2, Brain
} from "lucide-react";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList
} from "recharts";

import PracticeQuestionsList from "../../components/features/student/PracticeQuestionsList";
import { PointsDisplay, AchievementBadges, ErrorBoundary } from "../../components/features/gamification";
import StudentLayout from "../../components/layout/StudentLayout";
import { practiceService } from "../../services/practiceService";
import { gamificationService } from "../../services/gamificationService";

const CATEGORY_COLORS = ["#6366F1", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#3B82F6"];

export default function StudentPractice() {
    const { user } = useAuthUser();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState("questions");

    // Live stats
    const [stats, setStats] = useState(null);
    const [loadingStats, setLoadingStats] = useState(true);

    useEffect(() => {
        const loadStats = async () => {
            try {
                setLoadingStats(true);
                const [practiceRes, analyticsRes] = await Promise.all([
                    practiceService.getPracticeAnalytics('summary').catch(() => ({ success: false })),
                    gamificationService.getStudentAnalytics().catch(() => ({ success: false })),
                ]);

                const practiceData = practiceRes.success ? practiceRes.data?.data : null;
                const analyticsData = analyticsRes.success ? analyticsRes.data : null;
                const analyticsCore = analyticsData?.data?.analytics || analyticsData?.analytics || {};
                const pointsData = analyticsData?.data?.points || analyticsData?.points || {};

                // week-over-week delta
                const trend = analyticsData?.data?.performance_trend || analyticsData?.performance_trend || [];
                const thisWeek = trend.slice(-7).reduce((s, d) => s + d.practice_completed, 0);
                const lastWeek = trend.slice(-14, -7).reduce((s, d) => s + d.practice_completed, 0);
                const weekDelta = thisWeek - lastWeek;

                // Category breakdown for chart
                const categoryBreakdown = Object.entries(practiceData?.category_breakdown || {}).map(
                    ([category, data], i) => ({
                        category,
                        attempted: data.attempted || 0,
                        completed: data.completed || 0,
                        rate: data.attempted > 0 ? Math.round((data.completed / data.attempted) * 100) : 0,
                        color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                    })
                );

                setStats({
                    totalCompleted: practiceData?.total_completed || analyticsCore.total_practice_completed || 0,
                    currentStreak: analyticsCore.current_streak || 0,
                    longestStreak: analyticsCore.longest_streak || 0,
                    timePracticedMins: practiceData?.total_time_minutes
                        ? Math.round(practiceData.total_time_minutes)
                        : Math.round((analyticsCore.total_time_spent || 0)),
                    practicePoints: pointsData.practice_points || 0,
                    totalPoints: pointsData.total_points || 0,
                    weekDelta,
                    categoryBreakdown,
                });
            } catch (e) {
                console.error("Failed to load practice stats:", e);
            } finally {
                setLoadingStats(false);
            }
        };
        loadStats();
    }, []);

    const formatTime = (minutes) => {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    const quickStats = [
        {
            icon: CheckCircle2,
            label: "Solved",
            value: loadingStats ? "—" : stats?.totalCompleted ?? 0,
            color: "text-green-500",
        },
        {
            icon: Star,
            label: "Total Pts",
            value: loadingStats ? "—" : (stats?.totalPoints ?? 0).toLocaleString(),
            color: "text-yellow-500",
        },
        {
            icon: Flame,
            label: "Streak",
            value: loadingStats ? "—" : `${stats?.currentStreak ?? 0}d`,
            color: "text-orange-500",
        },
        {
            icon: Clock,
            label: "Time Spent",
            value: loadingStats ? "—" : stats?.timePracticedMins != null ? formatTime(stats.timePracticedMins) : "0m",
            color: "text-blue-500",
        },
    ];

    const categoryData = stats?.categoryBreakdown || [];
    const sortedCategoryData = [...categoryData].sort((a, b) => b.rate - a.rate);
    const totalAttempted = categoryData.reduce((sum, item) => sum + (item.attempted || 0), 0);
    const totalCompleted = categoryData.reduce((sum, item) => sum + (item.completed || 0), 0);
    const overallCompletionRate = totalAttempted > 0 ? Math.round((totalCompleted / totalAttempted) * 100) : 0;
    const strongestCategory = sortedCategoryData[0]?.category || "—";
    const avgTimePerSolve = (stats?.totalCompleted ?? 0) > 0
        ? Math.max(1, Math.round((stats?.timePracticedMins ?? 0) / stats.totalCompleted))
        : 0;

    return (
        <StudentLayout>
            {/* Header */}
            <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="py-4 sm:py-6">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <Button
                                    onClick={() => navigate('/student/dashboard')}
                                    variant="ghost"
                                    size="sm"
                                    className="flex items-center gap-2 text-gray-600 hover:text-gray-900 dark:hover:text-white"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                    <span className="hidden sm:inline">Back to Dashboard</span>
                                    <span className="sm:hidden">Back</span>
                                </Button>
                                <div className="h-6 w-px bg-gray-300 hidden sm:block" />
                                <div>
                                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Practice Center</h1>
                                    <p className="mt-1 text-sm sm:text-base text-gray-600">
                                        Sharpen your coding skills with unlimited practice questions
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center justify-between sm:justify-end space-x-4">
                                <Button
                                    onClick={() => navigate('/student/dashboard')}
                                    variant="outline"
                                    size="sm"
                                    className="flex items-center gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                                >
                                    <Home className="w-4 h-4" />
                                    <span className="hidden sm:inline">Dashboard</span>
                                </Button>
                                <div className="text-right">
                                    <p className="text-xs sm:text-sm text-gray-500">Welcome back,</p>
                                    <p className="font-semibold text-sm sm:text-base text-gray-900">
                                        {user?.first_name || user?.username}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <TabsList className="grid w-full grid-cols-3 sm:w-[400px] bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                            <TabsTrigger value="questions" className="flex items-center gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:dark:bg-gray-800 data-[state=active]:shadow-sm text-xs sm:text-sm">
                                <BookOpen className="w-4 h-4" />
                                <span className="hidden sm:inline">Questions</span>
                                <span className="sm:hidden">Q</span>
                            </TabsTrigger>
                            <TabsTrigger value="progress" className="flex items-center gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:dark:bg-gray-800 data-[state=active]:shadow-sm text-xs sm:text-sm">
                                <TrendingUp className="w-4 h-4" />
                                <span className="hidden sm:inline">Progress</span>
                                <span className="sm:hidden">P</span>
                            </TabsTrigger>
                            <TabsTrigger value="achievements" className="flex items-center gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:dark:bg-gray-800 data-[state=active]:shadow-sm text-xs sm:text-sm">
                                <Trophy className="w-4 h-4" />
                                <span className="hidden sm:inline">Achievements</span>
                                <span className="sm:hidden">A</span>
                            </TabsTrigger>
                        </TabsList>

                        {/* Quick Stats Bar */}
                        <div className="flex items-center gap-4 sm:gap-6 text-sm text-gray-600">
                            {quickStats.map(({ icon: Icon, label, value, color }) => ( // eslint-disable-line no-unused-vars
                                <div key={label} className="flex items-center gap-1.5">
                                    <Icon className={`w-4 h-4 ${color}`} />
                                    <span className="font-semibold text-gray-800">{value}</span>
                                    <span className="hidden sm:inline text-gray-400">{label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Questions Tab */}
                    <TabsContent value="questions" className="space-y-6">
                        <PracticeQuestionsList />
                    </TabsContent>

                    {/* Progress Tab */}
                    <TabsContent value="progress" className="space-y-6">
                        {/* Category breakdown chart */}
                        {!loadingStats && stats?.categoryBreakdown?.length > 0 ? (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Brain className="w-5 h-5" /> Category Progress
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                                        <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2">
                                            <div className="text-[11px] uppercase tracking-wide text-indigo-700 font-semibold">Overall Completion</div>
                                            <div className="text-lg font-bold text-indigo-900">{overallCompletionRate}%</div>
                                        </div>
                                        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                                            <div className="text-[11px] uppercase tracking-wide text-emerald-700 font-semibold">Avg Time / Solve</div>
                                            <div className="text-lg font-bold text-emerald-900">{avgTimePerSolve}m</div>
                                        </div>
                                        <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                                            <div className="text-[11px] uppercase tracking-wide text-amber-700 font-semibold">Strongest Category</div>
                                            <div className="text-lg font-bold text-amber-900 truncate">{strongestCategory}</div>
                                        </div>
                                    </div>

                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={sortedCategoryData} layout="vertical" margin={{ top: 8, right: 36, left: 8, bottom: 8 }}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2ff" />
                                            <XAxis
                                                type="number"
                                                domain={[0, 100]}
                                                tickFormatter={(v) => `${v}%`}
                                                tick={{ fontSize: 11, fill: "#6b7280" }}
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <YAxis
                                                type="category"
                                                dataKey="category"
                                                tick={{ fontSize: 12, fill: "#374151" }}
                                                axisLine={false}
                                                tickLine={false}
                                                width={120}
                                            />
                                            <Tooltip
                                                contentStyle={{ borderRadius: 10, borderColor: "#e5e7eb" }}
                                                formatter={(value, _name, item) => {
                                                    const row = item?.payload || {};
                                                    return [
                                                        `${value}% (Solved ${row.completed}/${row.attempted})`,
                                                        "Completion",
                                                    ];
                                                }}
                                            />
                                            <Bar
                                                dataKey="rate"
                                                name="Completion Rate"
                                                fill="#4f46e5"
                                                radius={[0, 6, 6, 0]}
                                                background={{ fill: "#eef2ff", radius: 6 }}
                                            >
                                                <LabelList
                                                    dataKey="rate"
                                                    position="right"
                                                    formatter={(v) => `${v}%`}
                                                    style={{ fill: "#374151", fontSize: 11, fontWeight: 600 }}
                                                />
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>
                        ) : !loadingStats && (
                            <Card>
                                <CardContent className="py-12">
                                    <div className="text-center text-gray-400">
                                        <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-40" />
                                        <p className="text-lg font-medium mb-1">Start Your Journey!</p>
                                        <p className="text-sm mb-4">Progress charts will appear as you complete practice questions</p>
                                        <Button onClick={() => setActiveTab("questions")} className="bg-indigo-600 hover:bg-indigo-700">
                                            Browse Questions
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>

                    {/* Achievements Tab */}
                    <TabsContent value="achievements" className="space-y-6">
                        <div className="bg-gradient-to-br from-yellow-50 to-orange-50 border border-yellow-200 rounded-xl p-4 mb-4">
                            <h2 className="text-lg font-bold text-yellow-900 flex items-center gap-2">
                                <Trophy className="w-5 h-5" /> Achievement Gallery
                            </h2>
                            <p className="text-sm text-yellow-700 mt-1">
                                Complete practice questions and assignments to earn badges!
                            </p>
                        </div>
                        <ErrorBoundary title="Achievement Error" message="Could not load achievements">
                            <AchievementBadges showProgress={true} limit={20} />
                        </ErrorBoundary>
                    </TabsContent>
                </Tabs>
            </div>
        </StudentLayout>
    );
}
