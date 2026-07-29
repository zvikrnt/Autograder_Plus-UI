import { useState } from "react";
import { Loader2, Wand2, Eye, CheckCircle2 } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "../../ui/dialog";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { toast } from "sonner";
import { assignmentService } from "../../../services/assignmentService";

const STRATEGIES = [
    { value: "pass_percentage", label: "Pass % as grade", hint: "grade = test-case pass percentage" },
    { value: "range", label: "Range (min–max marks)", hint: "scale pass % into a marks range with a floor" },
    { value: "formula", label: "Formula (pass % × k + c)", hint: "linear formula on the pass %" },
];

export default function AutoGradeDialog({ assignmentId, open, onClose, onDone }) {
    const [strategy, setStrategy] = useState("pass_percentage");
    const [minMarks, setMinMarks] = useState(20);
    const [maxMarks, setMaxMarks] = useState(100);
    const [fullOnAllPass, setFullOnAllPass] = useState(true);
    const [multiplier, setMultiplier] = useState(1);
    const [offset, setOffset] = useState(0);
    const [overwriteManual, setOverwriteManual] = useState(false);
    const [zeroIfMissing, setZeroIfMissing] = useState(true);
    const [preview, setPreview] = useState(null);
    const [busy, setBusy] = useState(false);

    const buildOptions = (isPreview) => ({
        strategy,
        min_marks: Number(minMarks),
        max_marks: Number(maxMarks),
        full_marks_on_all_pass: fullOnAllPass,
        multiplier: Number(multiplier),
        offset: Number(offset),
        overwrite_manual: overwriteManual,
        zero_if_missing_code: zeroIfMissing,
        preview: isPreview,
    });

    const runPreview = async () => {
        setBusy(true);
        try {
            const res = await assignmentService.autoGrade(assignmentId, buildOptions(true));
            setPreview(res.data);
        } catch (e) {
            toast.error(e.response?.data?.message || "Preview failed.");
        } finally {
            setBusy(false);
        }
    };

    const applyGrades = async () => {
        setBusy(true);
        try {
            const res = await assignmentService.autoGrade(assignmentId, buildOptions(false));
            toast.success(res.data?.message || "Auto-grading applied.");
            onDone?.();
            onClose();
        } catch (e) {
            toast.error(e.response?.data?.message || "Auto-grading failed.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Wand2 className="w-4 h-4 text-indigo-500" /> Automatic Grading
                    </DialogTitle>
                    <DialogDescription>
                        Turn each student's test-case pass percentage into a grade. Preview before applying.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Strategy */}
                    <div>
                        <label className="text-sm font-medium">Strategy</label>
                        <Select value={strategy} onValueChange={(v) => { setStrategy(v); setPreview(null); }}>
                            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {STRATEGIES.map((s) => (
                                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-1">
                            {STRATEGIES.find((s) => s.value === strategy)?.hint}
                        </p>
                    </div>

                    {/* Range options */}
                    {strategy === "range" && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-sm">Min marks (0% pass)</label>
                                    <Input type="number" min={0} max={100} value={minMarks}
                                        onChange={(e) => { setMinMarks(e.target.value); setPreview(null); }} className="mt-1" />
                                </div>
                                <div>
                                    <label className="text-sm">Max marks (100% pass)</label>
                                    <Input type="number" min={0} max={100} value={maxMarks}
                                        onChange={(e) => { setMaxMarks(e.target.value); setPreview(null); }} className="mt-1" />
                                </div>
                            </div>
                            <label className="flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={fullOnAllPass}
                                    onChange={(e) => { setFullOnAllPass(e.target.checked); setPreview(null); }} />
                                Give full marks when all tests pass
                            </label>
                        </div>
                    )}

                    {/* Formula options */}
                    {strategy === "formula" && (
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-sm">Multiplier (k)</label>
                                <Input type="number" step="0.1" value={multiplier}
                                    onChange={(e) => { setMultiplier(e.target.value); setPreview(null); }} className="mt-1" />
                            </div>
                            <div>
                                <label className="text-sm">Offset (c)</label>
                                <Input type="number" step="1" value={offset}
                                    onChange={(e) => { setOffset(e.target.value); setPreview(null); }} className="mt-1" />
                            </div>
                            <p className="col-span-2 text-xs text-muted-foreground">
                                grade = pass% × {multiplier || 0} + {offset || 0} (clamped to 0–100)
                            </p>
                        </div>
                    )}

                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={zeroIfMissing}
                            onChange={(e) => { setZeroIfMissing(e.target.checked); setPreview(null); }} />
                        Give <b>0 marks</b> when a student's code is missing
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={overwriteManual}
                            onChange={(e) => { setOverwriteManual(e.target.checked); setPreview(null); }} />
                        Overwrite existing manual / cluster grades
                    </label>
                    {!overwriteManual && (
                        <p className="text-xs text-amber-600">
                            Submissions already graded manually or by clusters will be kept.
                        </p>
                    )}

                    {/* Preview result */}
                    {preview && (
                        <div className="rounded-lg border bg-slate-50 p-3 text-sm space-y-2">
                            <p className="font-medium">
                                {preview.graded} graded · {preview.skipped_manual} kept · {preview.missing_code_zeroed || 0} missing-code→0 · {preview.students_affected} students
                            </p>
                            <div className="max-h-40 overflow-auto text-xs font-mono space-y-0.5">
                                {preview.sample?.map((r, i) => (
                                    <div key={i} className="flex justify-between">
                                        <span>
                                            {r.student} · {r.question}
                                            {r.code_missing && <span className="text-red-500 ml-1">(no code)</span>}
                                        </span>
                                        <span className="text-muted-foreground">{r.pass_percentage}% → <b>{r.grade}</b></span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={runPreview} disabled={busy} className="gap-2">
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                        Preview
                    </Button>
                    <Button onClick={applyGrades} disabled={busy || !preview}
                        className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        Apply grades
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
