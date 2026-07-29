import { useState, useEffect } from "react";
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from "recharts";
import { Loader2, Trophy, TrendingUp, Users, Award } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "../../ui/dialog";
import { Badge } from "../../ui/badge";
import { classService } from "../../../services/classService";

// eslint-disable-next-line no-unused-vars -- Icon is rendered as JSX below
function Stat({ icon: Icon, label, value, sub, tone = "default" }) {
    const tones = {
        default: "text-gray-900 dark:text-gray-100",
        good: "text-green-600",
        accent: "text-indigo-600",
        warn: "text-amber-600",
    };
    return (
        <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Icon className={`w-3.5 h-3.5 ${tones[tone]}`} />
                {label}
            </div>
            <div className={`text-xl font-bold ${tones[tone]}`}>{value}</div>
            {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
        </div>
    );
}

function PerformanceBody({ classId, studentId }) {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);

    useEffect(() => {
        let cancelled = false;
        classService
            .getStudentPerformance(classId, studentId)
            .then((res) => { if (!cancelled) setData(res.data); })
            .catch(() => { if (!cancelled) setData(null); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [classId, studentId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin" />
            </div>
        );
    }
    if (!data) {
        return <p className="text-sm text-muted-foreground py-8 text-center">Failed to load performance.</p>;
    }

    const chartData = (data.assignments || []).map((a) => ({
        name: a.title?.length > 14 ? a.title.slice(0, 14) + "…" : a.title,
        fullName: a.title,
        type: a.type,
        student: a.student_score,
        classAvg: a.class_average,
    }));

    const diff = (data.student_overall_average - data.class_overall_average).toFixed(1);
    const aboveAvg = data.student_overall_average >= data.class_overall_average;

    return (
        <div className="space-y-5">
            {/* Header */}
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    {data.student.name}
                    <Badge className="bg-slate-100 text-slate-600">{data.student.username}</Badge>
                </DialogTitle>
                <DialogDescription>
                    Performance in {data.class_name} — score vs. class average
                </DialogDescription>
            </DialogHeader>

            {/* Stat grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat
                    icon={TrendingUp} tone={aboveAvg ? "good" : "warn"}
                    label="Overall Average" value={`${data.student_overall_average}%`}
                    sub={`${aboveAvg ? "+" : ""}${diff}% vs class`}
                />
                <Stat
                    icon={Users} label="Class Average" value={`${data.class_overall_average}%`}
                    sub={`${data.total_students} students`}
                />
                <Stat
                    icon={Trophy} tone="accent" label="Rank"
                    value={data.rank ? `#${data.rank}` : "—"}
                    sub={data.total_ranked ? `of ${data.total_ranked} graded` : ""}
                />
                <Stat
                    icon={Award} label="Percentile"
                    value={data.percentile != null ? `${data.percentile}th` : "—"}
                    sub={`${data.assignments_attempted}/${data.total_assignments} attempted`}
                />
            </div>

            {/* Score vs class average line chart */}
            <div>
                <h4 className="text-sm font-medium mb-2">Score vs. Class Average per Assignment</h4>
                {chartData.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">No graded assignments yet.</p>
                ) : (
                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 30 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0}
                                    angle={chartData.length > 4 ? -20 : 0}
                                    textAnchor={chartData.length > 4 ? "end" : "middle"} height={50} />
                                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                                <Tooltip
                                    content={({ active, payload }) => {
                                        if (!active || !payload?.length) return null;
                                        const d = payload[0].payload;
                                        return (
                                            <div className="bg-white dark:bg-gray-800 border rounded-lg shadow-lg p-3 text-xs space-y-1">
                                                <p className="font-semibold">{d.fullName} <span className="text-muted-foreground">({d.type})</span></p>
                                                <p>Student: <b>{d.student ?? "—"}{d.student != null ? "%" : ""}</b></p>
                                                <p>Class avg: <b>{d.classAvg}%</b></p>
                                            </div>
                                        );
                                    }}
                                />
                                <Legend />
                                <Line type="monotone" dataKey="student" name="Student"
                                    stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
                                <Line type="monotone" dataKey="classAvg" name="Class Avg"
                                    stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * Modal that shows one student's performance vs the class.
 * Controlled via `student` ({ id }) + classId; `onClose` clears it.
 */
export default function StudentPerformanceModal({ classId, student, onClose }) {
    return (
        <Dialog open={!!student} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-3xl">
                {student && classId && (
                    <PerformanceBody key={student.id} classId={classId} studentId={student.id} />
                )}
                {student && !classId && (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                        Class context unavailable for this student.
                    </p>
                )}
            </DialogContent>
        </Dialog>
    );
}
