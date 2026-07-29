import { useState, useEffect } from "react";
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Cell,
    LabelList,
} from "recharts";
import { Loader2, CheckCircle2, ListChecks, Target, BarChart3, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../ui/card";
import { submissionService } from "../../../services/submissionService";

// eslint-disable-next-line no-unused-vars -- Icon is rendered as JSX below
function StatTile({ icon: Icon, label, value, sub, tone = "default" }) {
    const tones = {
        default: "text-gray-900 dark:text-gray-100",
        good: "text-green-600",
        warn: "text-amber-600",
        accent: "text-indigo-600",
    };
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
                <Icon className={`h-4 w-4 ${tones[tone]}`} />
            </CardHeader>
            <CardContent>
                <div className={`text-2xl font-bold ${tones[tone]}`}>{value}</div>
                {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
            </CardContent>
        </Card>
    );
}

const barColor = (score) =>
    score >= 75 ? "#16a34a" : score >= 50 ? "#f59e0b" : "#dc2626";

// Remount the body per assignmentId so loading state resets naturally
// (avoids a synchronous setState inside an effect).
export default function AssignmentOverview({ assignmentId }) {
    return <AssignmentOverviewBody key={assignmentId} assignmentId={assignmentId} />;
}

function AssignmentOverviewBody({ assignmentId }) {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);

    useEffect(() => {
        let cancelled = false;
        submissionService
            .getAssignmentOverview(assignmentId)
            .then((res) => { if (!cancelled) setData(res.data); })
            .catch(() => { if (!cancelled) setData(null); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [assignmentId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin" />
            </div>
        );
    }
    if (!data) return null;

    const chartData = (data.questions || []).map((q) => ({
        name: q.title?.length > 18 ? q.title.slice(0, 18) + "…" : q.title || q.question_slug,
        fullName: q.title,
        language: q.language,
        score: q.average_score,
        pass_rate: q.pass_rate,
        attempts: q.attempts,
        not_attempted: q.not_attempted,
    }));

    return (
        <div className="space-y-6">
            {/* Overview stat tiles */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatTile
                    icon={Target} tone="accent" label="Overall Pass %"
                    value={`${data.overall_pass_percentage}%`}
                    sub={`${data.students_passed}/${data.total_students} students ≥ ${data.pass_threshold}%`}
                />
                <StatTile
                    icon={ListChecks} label="Avg Questions Attempted"
                    value={data.avg_questions_attempted}
                    sub={`of ${data.total_questions} questions`}
                />
                <StatTile
                    icon={CheckCircle2} tone="good" label="Students Attempted"
                    value={`${data.students_who_attempted}/${data.total_students}`}
                    sub="submitted at least one question"
                />
                <StatTile
                    icon={BarChart3} label="Questions"
                    value={data.total_questions}
                    sub={`${data.total_students} enrolled students`}
                />
            </div>

            {/* Question-wise average score chart */}
            <Card>
                <CardHeader>
                    <CardTitle>Question-wise Average Score</CardTitle>
                    <CardDescription>
                        Average graded score per question (0–100). Green ≥ 75, amber ≥ 50, red below.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {chartData.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                            <Info className="w-8 h-8 mb-2" />
                            <p className="text-sm">No submissions yet.</p>
                        </div>
                    ) : (
                        <div className="h-[340px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                                    <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0}
                                        angle={chartData.length > 4 ? -20 : 0} textAnchor={chartData.length > 4 ? "end" : "middle"} height={60} />
                                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                                    <Tooltip
                                        content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null;
                                            const d = payload[0].payload;
                                            return (
                                                <div className="bg-white dark:bg-gray-800 border rounded-lg shadow-lg p-3 text-xs space-y-1">
                                                    <p className="font-semibold">{d.fullName}</p>
                                                    <p className="text-muted-foreground">Language: {d.language}</p>
                                                    <p>Avg score: <b>{d.score}%</b></p>
                                                    <p>Pass rate: <b>{d.pass_rate}%</b></p>
                                                    <p>Attempted: <b>{d.attempts}</b> · Not attempted: {d.not_attempted}</p>
                                                </div>
                                            );
                                        }}
                                    />
                                    <Bar dataKey="score" radius={[6, 6, 0, 0]} maxBarSize={70}>
                                        {chartData.map((entry, i) => (
                                            <Cell key={i} fill={barColor(entry.score)} />
                                        ))}
                                        <LabelList dataKey="score" position="top" formatter={(v) => `${v}%`}
                                            style={{ fontSize: 11, fill: "#6b7280" }} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Per-question attempts table */}
            <Card>
                <CardHeader>
                    <CardTitle>Per-Question Breakdown</CardTitle>
                    <CardDescription>Attempts and pass rate for each question.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-muted-foreground border-b">
                                    <th className="py-2 pr-4">#</th>
                                    <th className="py-2 pr-4">Question</th>
                                    <th className="py-2 pr-4">Lang</th>
                                    <th className="py-2 pr-4 text-right">Avg Score</th>
                                    <th className="py-2 pr-4 text-right">Pass Rate</th>
                                    <th className="py-2 pr-4 text-right">Attempted</th>
                                    <th className="py-2 text-right">Not Attempted</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(data.questions || []).map((q, i) => (
                                    <tr key={q.question_id} className="border-b last:border-0">
                                        <td className="py-2 pr-4 text-muted-foreground">{i + 1}</td>
                                        <td className="py-2 pr-4 font-medium">{q.title}</td>
                                        <td className="py-2 pr-4 text-muted-foreground">{q.language}</td>
                                        <td className="py-2 pr-4 text-right font-semibold" style={{ color: barColor(q.average_score) }}>
                                            {q.average_score}%
                                        </td>
                                        <td className="py-2 pr-4 text-right">{q.pass_rate}%</td>
                                        <td className="py-2 pr-4 text-right">{q.attempts}</td>
                                        <td className="py-2 text-right text-muted-foreground">{q.not_attempted}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
