import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { FileText, CheckCircle2, Clock, Radio, Users, Inbox, Loader2 } from "lucide-react";
import { Card } from "../../ui/card";
import { classContentService } from "../../../services/classContentService";

// eslint-disable-next-line no-unused-vars -- Icon is rendered as JSX below
function Row({ icon: Icon, label, value, color = "text-gray-900 dark:text-gray-100" }) {
    return (
        <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs text-gray-500">
                <Icon className={`w-3.5 h-3.5 ${color}`} />
                {label}
            </span>
            <span className={`text-sm font-bold ${color}`}>{value}</span>
        </div>
    );
}

// Teacher/TA-only class overview stats for the Stream sidebar.
export default function ClassStatsCards({ classId }) {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [forbidden, setForbidden] = useState(false);

    useEffect(() => {
        let cancelled = false;
        classContentService
            .getClassStats(classId)
            .then((res) => { if (!cancelled) setStats(res.data); })
            .catch((e) => { if (!cancelled && e.response?.status === 403) setForbidden(true); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [classId]);

    // Students (403) just don't see the teacher stats.
    if (forbidden) return null;

    if (loading) {
        return (
            <Card>
                <div className="p-4 flex items-center justify-center text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                </div>
            </Card>
        );
    }
    if (!stats) return null;

    const a = stats.assignments || {};
    const g = stats.grading || {};

    return (
        <div className="space-y-4">
            <Card>
                <div className="p-4 space-y-3">
                    <h3 className="font-semibold text-gray-600 text-sm">Class Overview</h3>
                    <Row icon={Users} label="Students" value={stats.students} color="text-indigo-600" />
                    <Row icon={FileText} label="Assignments" value={a.total} />
                    <Row icon={Radio} label="Active" value={a.active} color="text-green-600" />
                    <Row icon={Clock} label="Drafts" value={a.drafts} color="text-amber-600" />
                    <Row icon={Inbox} label="Submissions" value={stats.submissions_received} />
                </div>
            </Card>

            <Card>
                <div className="p-4 space-y-3">
                    <h3 className="font-semibold text-gray-600 text-sm">Grading</h3>
                    <Row icon={CheckCircle2} label="Graded" value={g.graded} color="text-green-600" />
                    <Row icon={Clock} label="Needs grading" value={g.needs_grading}
                        color={g.needs_grading > 0 ? "text-red-600" : "text-gray-900 dark:text-gray-100"} />
                    {g.needs_grading > 0 && (
                        <p className="text-[11px] text-red-600 pt-1">
                            {g.needs_grading} submission{g.needs_grading === 1 ? "" : "s"} awaiting a grade.
                        </p>
                    )}
                </div>
            </Card>

            {/* Per-assignment quick list */}
            {stats.per_assignment?.length > 0 && (
                <Card>
                    <div className="p-4 space-y-3">
                        <h3 className="font-semibold text-gray-600 text-sm">Assignments</h3>
                        <div className="space-y-2.5">
                            {stats.per_assignment.slice(0, 6).map((it) => (
                                <Link
                                    key={it.id}
                                    to={`/teacher/assignment/${it.id}`}
                                    className="block group"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate group-hover:text-indigo-600 max-w-[130px]">
                                            {it.title}
                                        </span>
                                        {it.is_active ? (
                                            <span className="text-[9px] uppercase font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">Active</span>
                                        ) : it.is_published ? (
                                            <span className="text-[9px] uppercase font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">Closed</span>
                                        ) : (
                                            <span className="text-[9px] uppercase font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Draft</span>
                                        )}
                                    </div>
                                    <div className="text-[10px] text-gray-400 mt-0.5">
                                        {it.submissions} sub · {it.graded} graded
                                        {it.to_grade > 0 && <span className="text-red-500"> · {it.to_grade} to grade</span>}
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                </Card>
            )}
        </div>
    );
}
