import { useState, useEffect, useRef, useCallback } from "react";
import {
    Radio,
    Loader2,
    Eye,
    Users,
    Activity,
    Moon,
    CheckCircle2,
    Circle,
    Clock,
    Code2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../ui/card";
import { Badge } from "../../ui/badge";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "../../ui/dialog";
import { submissionService } from "../../../services/submissionService";

const POLL_MS = 5000;

const STATE_META = {
    live: { label: "Live", color: "text-green-600", badge: "bg-green-100 text-green-700 border-green-200", icon: Radio },
    idle: { label: "Idle", color: "text-amber-600", badge: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock },
    inactive: { label: "Inactive", color: "text-gray-500", badge: "bg-gray-100 text-gray-600 border-gray-200", icon: Moon },
    submitted: { label: "Submitted", color: "text-blue-600", badge: "bg-blue-100 text-blue-700 border-blue-200", icon: CheckCircle2 },
    not_started: { label: "Not started", color: "text-gray-400", badge: "bg-gray-50 text-gray-400 border-gray-200", icon: Circle },
};

function timeAgo(iso) {
    if (!iso) return "—";
    const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (secs < 60) return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    return `${Math.floor(secs / 3600)}h ago`;
}

// eslint-disable-next-line no-unused-vars -- Icon is rendered as JSX below
function CountTile({ icon: Icon, label, value, color }) {
    return (
        <Card>
            <CardContent className="flex items-center gap-3 py-4">
                <div className={`p-2 rounded-lg bg-slate-50 ${color}`}>
                    <Icon className="w-5 h-5" />
                </div>
                <div>
                    <div className={`text-2xl font-bold ${color}`}>{value}</div>
                    <div className="text-xs text-muted-foreground">{label}</div>
                </div>
            </CardContent>
        </Card>
    );
}

// Live code watch dialog — polls the student's current draft.
function WatchCodeBody({ assignmentId, student }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const bottomRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        const fetchCode = () => {
            submissionService
                .getStudentLiveCode(assignmentId, student.id)
                .then((res) => { if (!cancelled) setData(res.data); })
                .catch(() => { if (!cancelled) setData({ has_draft: false }); })
                .finally(() => { if (!cancelled) setLoading(false); });
        };
        fetchCode();
        const iv = setInterval(fetchCode, POLL_MS);
        return () => { cancelled = true; clearInterval(iv); };
    }, [assignmentId, student]);

    return (
        <>
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-indigo-500" />
                    Watching {student.name}
                    <span className="flex items-center gap-1 text-xs text-green-600">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> live
                    </span>
                </DialogTitle>
                <DialogDescription>
                    {data?.question?.title ? `On: ${data.question.title} · ` : ""}
                    {data?.language ? `${data.language} · ` : ""}
                    updates every {POLL_MS / 1000}s
                    {data?.last_updated ? ` · edited ${timeAgo(data.last_updated)}` : ""}
                </DialogDescription>
            </DialogHeader>
            {loading ? (
                <div className="flex items-center justify-center py-12 text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin" />
                </div>
            ) : !data?.has_draft ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400 space-y-2">
                    <Code2 className="w-10 h-10" />
                    <p className="text-sm">No live draft yet — the student hasn't started typing.</p>
                </div>
            ) : (
                <pre className="bg-gray-950 text-gray-100 rounded-lg p-4 max-h-[60vh] overflow-auto text-xs font-mono whitespace-pre">
                    {data.current_code || "// (empty)"}
                    <div ref={bottomRef} />
                </pre>
            )}
        </>
    );
}

export default function LiveMonitorPanel({ assignmentId }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [watch, setWatch] = useState(null); // { id, name }

    const fetchMonitor = useCallback(() => {
        submissionService
            .getLiveMonitor(assignmentId)
            .then((res) => setData(res.data))
            .catch(() => { /* keep last */ })
            .finally(() => setLoading(false));
    }, [assignmentId]);

    useEffect(() => {
        fetchMonitor();
        const iv = setInterval(fetchMonitor, POLL_MS);
        return () => clearInterval(iv);
    }, [fetchMonitor]);

    if (loading && !data) {
        return (
            <div className="flex items-center justify-center py-16 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin" />
            </div>
        );
    }
    if (!data) return null;

    const c = data.counts || {};

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <span className="flex items-center gap-1.5 text-green-600">
                            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                        </span>
                        Live Class Monitor
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        {data.total_students} students · auto-refreshing every {POLL_MS / 1000}s
                    </p>
                </div>
            </div>

            {/* Count tiles */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <CountTile icon={Radio} label="Live now" value={c.live || 0} color="text-green-600" />
                <CountTile icon={Clock} label="Idle" value={c.idle || 0} color="text-amber-600" />
                <CountTile icon={Moon} label="Inactive" value={c.inactive || 0} color="text-gray-500" />
                <CountTile icon={CheckCircle2} label="Submitted" value={c.submitted || 0} color="text-blue-600" />
                <CountTile icon={Circle} label="Not started" value={c.not_started || 0} color="text-gray-400" />
            </div>

            {/* Question activity */}
            {data.question_activity?.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <Activity className="w-4 h-4 text-indigo-500" /> Where students are working now
                        </CardTitle>
                        <CardDescription>Active (live/idle) students per question.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-2">
                            {data.question_activity.map((q) => (
                                <Badge key={q.slug} className="bg-indigo-50 text-indigo-700 border-indigo-200 gap-1">
                                    {q.title}
                                    <span className="bg-indigo-600 text-white rounded-full px-1.5 text-[10px]">{q.count}</span>
                                </Badge>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Student activity list */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Users className="w-4 h-4" /> Student Activity
                    </CardTitle>
                    <CardDescription>Click “Watch” to see a live student's code as they type.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-muted-foreground border-b">
                                    <th className="py-2 pr-4">Student</th>
                                    <th className="py-2 pr-4">State</th>
                                    <th className="py-2 pr-4">Current question</th>
                                    <th className="py-2 pr-4">Last active</th>
                                    <th className="py-2 text-right">Watch</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.students.map((s) => {
                                    const meta = STATE_META[s.state] || STATE_META.not_started;
                                    const canWatch = s.state === "live" || s.state === "idle";
                                    return (
                                        <tr key={s.id} className="border-b last:border-0">
                                            <td className="py-2 pr-4">
                                                <div className="font-medium">{s.name}</div>
                                                <div className="text-xs text-muted-foreground">{s.username}</div>
                                            </td>
                                            <td className="py-2 pr-4">
                                                <Badge className={`${meta.badge} gap-1`}>
                                                    <meta.icon className="w-3 h-3" /> {meta.label}
                                                </Badge>
                                            </td>
                                            <td className="py-2 pr-4">
                                                {s.current_question ? s.current_question.title : <span className="text-muted-foreground">—</span>}
                                            </td>
                                            <td className="py-2 pr-4 text-muted-foreground">{timeAgo(s.last_active)}</td>
                                            <td className="py-2 text-right">
                                                {canWatch ? (
                                                    <button
                                                        onClick={() => setWatch({ id: s.id, name: s.name })}
                                                        className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                                                    >
                                                        <Eye className="w-3.5 h-3.5" /> Watch
                                                    </button>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Watch dialog */}
            <Dialog open={!!watch} onOpenChange={(v) => !v && setWatch(null)}>
                <DialogContent className="max-w-3xl">
                    {watch && <WatchCodeBody key={watch.id} assignmentId={assignmentId} student={watch} />}
                </DialogContent>
            </Dialog>
        </div>
    );
}
