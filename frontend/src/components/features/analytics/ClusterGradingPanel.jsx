import { useState, useEffect, useRef, useCallback } from "react";
import {
    Sparkles,
    Loader2,
    StopCircle,
    Play,
    Layers,
    ShieldCheck,
    ShieldAlert,
    TrendingDown,
    Users,
    Info,
    CheckCircle2,
    Save,
    Code2,
} from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Badge } from "../../ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../../ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "../../ui/dialog";
import LogViewer from "./LogViewer";
import { assignmentService } from "../../../services/assignmentService";
import { API_CONFIG } from "../../../config/api";

const mediaBase = API_CONFIG.BASE_URL.replace(/\/api$/, "");
const toFullUrl = (url) =>
    url ? (url.startsWith("/media/") ? `${mediaBase}${url}` : url) : null;

const isSafe = (safety) => safety === "SAFE" || safety === "SAFE_SINGLETON";

// eslint-disable-next-line no-unused-vars -- Icon is used in JSX below (<Icon />); flat config lacks react JSX-usage detection
function InsightTile({ icon: Icon, label, value, sub, tone = "default" }) {
    const toneCls =
        tone === "safe"
            ? "text-green-600"
            : tone === "unsafe"
                ? "text-red-600"
                : tone === "accent"
                    ? "text-indigo-600"
                    : "text-gray-900 dark:text-gray-100";
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
                <Icon className={`h-4 w-4 ${toneCls}`} />
            </CardHeader>
            <CardContent>
                <div className={`text-2xl font-bold ${toneCls}`}>{value}</div>
                {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
            </CardContent>
        </Card>
    );
}

function SafetyBadge({ safety }) {
    if (safety === "SAFE")
        return <Badge className="bg-green-100 text-green-700 border-green-200">SAFE</Badge>;
    if (safety === "SAFE_SINGLETON")
        return <Badge className="bg-slate-100 text-slate-600 border-slate-200">SINGLETON</Badge>;
    return <Badge className="bg-red-100 text-red-700 border-red-200">UNSAFE</Badge>;
}

// Fetches + renders one member's code. Mounted fresh per open, so state resets
// naturally without a synchronous setState-in-effect.
function CodeDialogBody({ assignmentId, questionSlug, member }) {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);

    useEffect(() => {
        let cancelled = false;
        assignmentService
            .getClusterMemberCode(assignmentId, questionSlug, member.student_id)
            .then((res) => { if (!cancelled) setData(res.data); })
            .catch(() => { if (!cancelled) setData({ source_code: "// Failed to load code." }); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [assignmentId, questionSlug, member]);

    return (
        <>
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-indigo-500" />
                    {member.student_id}
                    {member.is_representative && (
                        <Badge className="bg-indigo-100 text-indigo-700">Representative</Badge>
                    )}
                </DialogTitle>
                <DialogDescription>
                    {data?.language ? `Language: ${data.language} · ` : ""}
                    Latest submission {data?.manual_score != null ? `· score ${data.manual_score}` : ""}
                </DialogDescription>
            </DialogHeader>
            {loading ? (
                <div className="flex items-center justify-center py-12 text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin" />
                </div>
            ) : (
                <pre className="bg-gray-950 text-gray-100 rounded-lg p-4 max-h-[60vh] overflow-auto text-xs font-mono whitespace-pre">
                    {data?.source_code || "// (empty submission)"}
                </pre>
            )}
        </>
    );
}

// Modal shell — remounts the body (via key) each time a member is opened.
function CodeDialog({ assignmentId, questionSlug, member, onClose }) {
    return (
        <Dialog open={!!member} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-3xl">
                {member && (
                    <CodeDialogBody
                        key={member.student_id}
                        assignmentId={assignmentId}
                        questionSlug={questionSlug}
                        member={member}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

export default function ClusterGradingPanel({ assignmentId }) {
    const [isRunning, setIsRunning] = useState(false);
    const [progress, setProgress] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [selectedSlug, setSelectedSlug] = useState(null);
    const [gradeInputs, setGradeInputs] = useState({}); // { `${slug}:${clusterId}`: value }
    const [savingKey, setSavingKey] = useState(null);
    const [loadingResults, setLoadingResults] = useState(true);
    // { member, questionSlug } for the code popup
    const [codePopup, setCodePopup] = useState(null);
    const startRef = useRef(null);

    const loadResults = useCallback(async () => {
        try {
            const res = await assignmentService.getClusterResults(assignmentId);
            const qs = res.data?.questions || [];
            setQuestions(qs);
            setSelectedSlug((prev) => prev || (qs[0]?.question_slug ?? null));
        } catch {
            // 404 / no results is fine — empty state handles it
        } finally {
            setLoadingResults(false);
        }
    }, [assignmentId]);

    // On mount: check if a run is already in progress, and load any existing results.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await assignmentService.getClusterProgress(assignmentId);
                const st = res.data?.status;
                if (!cancelled && (st === "running" || st === "pending")) {
                    setIsRunning(true);
                    setProgress(res.data);
                    startRef.current = Date.now();
                }
            } catch { /* ignore */ }
            await loadResults();
        })();
        return () => { cancelled = true; };
    }, [assignmentId, loadResults]);

    // Poll while running.
    useEffect(() => {
        if (!isRunning) return;
        const tick = async () => {
            try {
                const res = await assignmentService.getClusterProgress(assignmentId);
                const data = res.data;
                setProgress(data);
                const justStarted = startRef.current && Date.now() - startRef.current < 5000;

                if (data.status === "completed") {
                    setIsRunning(false);
                    startRef.current = null;
                    toast.success("Cluster grading complete.", { id: "cluster-progress" });
                    await loadResults();
                } else if (data.status === "failed" || data.status === "cancelled") {
                    if (justStarted) return;
                    setIsRunning(false);
                    startRef.current = null;
                    toast.warning(
                        data.status === "failed" ? "Cluster grading failed." : "Cluster grading cancelled.",
                        { id: "cluster-progress" }
                    );
                } else if (data.status === "unknown") {
                    if (justStarted) return;
                    setIsRunning(false);
                    startRef.current = null;
                }
            } catch { /* transient */ }
        };
        const iv = setInterval(tick, 2500);
        tick();
        return () => clearInterval(iv);
    }, [isRunning, assignmentId, loadResults]);

    const handleRun = async (force = false) => {
        try {
            setIsRunning(true);
            startRef.current = Date.now();
            setProgress({ status: "pending", completed_batches: 0, total_batches: 0 });
            toast.loading(force ? "Restarting cluster grading..." : "Starting cluster grading...", {
                id: "cluster-progress",
            });
            const res = await assignmentService.runClusterGrade(assignmentId, force);
            if (res.data?.success) {
                toast.loading("Cluster grading running in background...", { id: "cluster-progress" });
                return;
            }
        } catch (err) {
            if (err.response?.status === 409) {
                setProgress({ status: "running", ...err.response.data });
                toast.error("Cluster grading already running.", {
                    id: "cluster-progress",
                    action: { label: "Restart", onClick: () => handleRun(true) },
                    duration: 5000,
                });
                return;
            }
            toast.error(err.response?.data?.message || "Failed to start cluster grading.", {
                id: "cluster-progress",
            });
            setIsRunning(false);
            startRef.current = null;
        }
    };

    const handleCancel = async () => {
        try {
            await assignmentService.cancelClusterGrade(assignmentId);
            setIsRunning(false);
            startRef.current = null;
            toast.warning("Cluster grading cancelled.", { id: "cluster-progress" });
        } catch {
            toast.error("Failed to cancel.");
        }
    };

    const handleSaveGrade = async (slug, cluster) => {
        const key = `${slug}:${cluster.cluster_id}`;
        const raw = gradeInputs[key] ?? cluster.cluster_grade ?? cluster.proposed_grade ?? "";
        const grade = parseFloat(raw);
        if (Number.isNaN(grade) || grade < 0 || grade > 100) {
            toast.error("Enter a grade between 0 and 100.");
            return;
        }
        setSavingKey(key);
        try {
            const res = await assignmentService.saveClusterGrade(assignmentId, slug, cluster.cluster_id, grade);
            toast.success(res.data?.message || "Grade applied to cluster.");
            // Mark locally as graded.
            setQuestions((prev) =>
                prev.map((q) =>
                    q.question_slug !== slug
                        ? q
                        : {
                            ...q,
                            clusters: q.clusters.map((c) =>
                                c.cluster_id === cluster.cluster_id
                                    ? { ...c, cluster_grade: grade, graded: true }
                                    : c
                            ),
                        }
                )
            );
        } catch (err) {
            toast.error(err.response?.data?.message || "Failed to save grade.");
        } finally {
            setSavingKey(null);
        }
    };

    const activeQuestion = questions.find((q) => q.question_slug === selectedSlug) || null;
    const hasResults = questions.length > 0;

    return (
        <div className="space-y-6">
            {/* Run bar */}
            <Card className="border-indigo-100">
                <CardContent className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-4">
                    <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-indigo-50">
                            <Layers className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Cluster Grading</h3>
                            <p className="text-sm text-muted-foreground max-w-xl">
                                Groups students by code + test-behavior, so you grade one representative per
                                safe cluster and the mark propagates to the group.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button
                            onClick={() => handleRun(false)}
                            disabled={isRunning}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
                        >
                            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                            {isRunning
                                ? progress?.total_batches > 0
                                    ? `Question ${progress?.completed_batches}/${progress?.total_batches}`
                                    : "Queuing..."
                                : hasResults
                                    ? "Re-run Cluster Grade"
                                    : "Run Cluster Grade"}
                        </Button>
                        {isRunning && (
                            <Button
                                onClick={handleCancel}
                                variant="outline"
                                size="icon"
                                className="border-red-300 text-red-600 hover:bg-red-50"
                                title="Cancel"
                            >
                                <StopCircle className="w-4 h-4" />
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Live pipeline logs */}
            {(isRunning || (progress?.log_output?.length > 0)) && (
                <LogViewer lines={progress?.log_output} title="Cluster grading logs" />
            )}

            {/* Empty / loading states */}
            {!hasResults && (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                        {loadingResults ? (
                            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                        ) : (
                            <>
                                <Sparkles className="w-12 h-12 text-slate-300" />
                                <p className="text-lg font-medium text-gray-700 dark:text-gray-200">
                                    No clusters yet
                                </p>
                                <p className="text-sm text-muted-foreground max-w-md">
                                    Run cluster grading to group student submissions and unlock the grading module,
                                    insights, and interactive maps.
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>
            )}

            {hasResults && (
                <>
                    {/* Question selector */}
                    {questions.length > 1 && (
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-muted-foreground">Question:</span>
                            <Select value={selectedSlug} onValueChange={setSelectedSlug}>
                                <SelectTrigger className="w-[320px]">
                                    <SelectValue placeholder="Select question" />
                                </SelectTrigger>
                                <SelectContent>
                                    {questions.map((q) => (
                                        <SelectItem key={q.question_slug} value={q.question_slug}>
                                            {q.question_title || q.question_slug}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {activeQuestion && (
                        <ClusterQuestionView
                            question={activeQuestion}
                            gradeInputs={gradeInputs}
                            setGradeInputs={setGradeInputs}
                            savingKey={savingKey}
                            onSave={handleSaveGrade}
                            onShowCode={(member) =>
                                setCodePopup({ member, questionSlug: activeQuestion.question_slug })
                            }
                        />
                    )}
                </>
            )}

            {/* Representative / member code popup */}
            <CodeDialog
                assignmentId={assignmentId}
                questionSlug={codePopup?.questionSlug}
                member={codePopup?.member || null}
                onClose={() => setCodePopup(null)}
            />
        </div>
    );
}

function ClusterQuestionView({ question, gradeInputs, setGradeInputs, savingKey, onSave, onShowCode }) {
    const insights = question.insights || {};
    const clusters = question.clusters || [];
    const plotUrl = toFullUrl(question.plot_url);
    const slug = question.question_slug;

    return (
        <div className="space-y-6">
            {/* Insights row */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <InsightTile icon={Layers} label="Clusters" value={insights.num_clusters ?? clusters.length}
                    sub={`${insights.total_students ?? 0} students`} tone="accent" />
                <InsightTile icon={ShieldCheck} label="Safe" value={insights.num_safe ?? 0}
                    sub="auto-propagate grade" tone="safe" />
                <InsightTile icon={ShieldAlert} label="Unsafe" value={insights.num_unsafe ?? 0}
                    sub="grade individually" tone="unsafe" />
                <InsightTile icon={TrendingDown} label="Workload ↓"
                    value={`${insights.workload_reduction_percent ?? 0}%`}
                    sub={`${insights.submissions_to_grade ?? 0} to grade`} tone="accent" />
                <InsightTile icon={Users} label="Largest" value={insights.largest_cluster_size ?? 0}
                    sub="biggest cluster" />
            </div>

            {/* Interactive plots (embedded from cluster_grade.py HTML) */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-indigo-500" /> Cluster Maps
                    </CardTitle>
                    <CardDescription>
                        Grading, code-similarity and failure-behavior projections. Star = representative.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0 h-[640px] overflow-hidden rounded-b-lg">
                    {plotUrl ? (
                        <iframe
                            src={plotUrl}
                            className="w-full h-full border-0"
                            title="Cluster maps"
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full bg-slate-50 text-slate-500 space-y-2">
                            <Info className="w-10 h-10 text-slate-400" />
                            <p className="text-sm">No interactive map (need ≥2 submissions with embeddings).</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Grading module */}
            <Card>
                <CardHeader>
                    <CardTitle>Grading Module</CardTitle>
                    <CardDescription>
                        Grade one representative per <b>SAFE</b> cluster — the mark applies to all members.
                        UNSAFE clusters must be graded per-student in the grading interface.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Cluster</TableHead>
                                    <TableHead>Safety</TableHead>
                                    <TableHead className="text-right">Size</TableHead>
                                    <TableHead>Representative</TableHead>
                                    <TableHead>Code</TableHead>
                                    <TableHead className="text-right">Avg Pass %</TableHead>
                                    <TableHead>Proposed</TableHead>
                                    <TableHead className="w-[220px]">Grade & Apply</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {clusters.map((c) => {
                                    const key = `${slug}:${c.cluster_id}`;
                                    const safe = isSafe(c.safety);
                                    const value =
                                        gradeInputs[key] ??
                                        (c.cluster_grade ?? c.proposed_grade ?? "");
                                    return (
                                        <TableRow key={c.cluster_id}>
                                            <TableCell className="font-medium">C{c.cluster_id}</TableCell>
                                            <TableCell><SafetyBadge safety={c.safety} /></TableCell>
                                            <TableCell className="text-right">{c.size}</TableCell>
                                            <TableCell className="max-w-[160px] truncate" title={c.representative_student_id}>
                                                {c.representative_student_id || "—"}
                                            </TableCell>
                                            <TableCell>
                                                {c.representative_student_id ? (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 gap-1 text-indigo-600 hover:text-indigo-800"
                                                        onClick={() =>
                                                            onShowCode({
                                                                student_id: c.representative_student_id,
                                                                is_representative: true,
                                                            })
                                                        }
                                                    >
                                                        <Code2 className="w-3.5 h-3.5" /> View
                                                    </Button>
                                                ) : (
                                                    "—"
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {(c.avg_pass_percentage ?? 0).toFixed(1)}
                                            </TableCell>
                                            <TableCell>
                                                {c.proposed_grade != null ? `${c.proposed_grade}%` : "—"}
                                            </TableCell>
                                            <TableCell>
                                                {safe ? (
                                                    <div className="flex items-center gap-2">
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            max={100}
                                                            value={value}
                                                            onChange={(e) =>
                                                                setGradeInputs((prev) => ({ ...prev, [key]: e.target.value }))
                                                            }
                                                            className="w-20 h-8"
                                                        />
                                                        <Button
                                                            size="sm"
                                                            variant={c.graded ? "outline" : "default"}
                                                            onClick={() => onSave(slug, c)}
                                                            disabled={savingKey === key}
                                                            className="gap-1"
                                                        >
                                                            {savingKey === key ? (
                                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                            ) : c.graded ? (
                                                                <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                                                            ) : (
                                                                <Save className="w-3.5 h-3.5" />
                                                            )}
                                                            {c.graded ? "Update" : "Apply"}
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">
                                                        Grade individually
                                                    </span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
