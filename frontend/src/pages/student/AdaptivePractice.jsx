import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import MonacoEditor from "@monaco-editor/react";
import {
    Zap, SkipForward, Send, StopCircle, Loader2, Trophy, Clock, CheckCircle2,
    XCircle, Play, TrendingUp, ChevronRight, Award,
} from "lucide-react";
import { toast } from "sonner";
import StudentLayout from "../../components/layout/StudentLayout";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { adaptiveService } from "../../services/adaptiveService";

const DIFF_COLOR = {
    Easy: "text-green-600 bg-green-50 border-green-200",
    Medium: "text-amber-600 bg-amber-50 border-amber-200",
    Hard: "text-red-600 bg-red-50 border-red-200",
};

function Timer({ startRef }) {
    const [secs, setSecs] = useState(0);
    useEffect(() => {
        const tick = () => setSecs(Math.floor((Date.now() - startRef.current) / 1000));
        tick();
        const iv = setInterval(tick, 1000);
        return () => clearInterval(iv);
    }, [startRef]);
    const m = String(Math.floor(secs / 60)).padStart(2, "0");
    const s = String(secs % 60).padStart(2, "0");
    return <span className="font-mono">{m}:{s}</span>;
}

export default function AdaptivePractice() {
    const navigate = useNavigate();
    const [phase, setPhase] = useState("intro"); // intro | loading | active | result | ended
    const [language, setLanguage] = useState("python");
    const [languages, setLanguages] = useState([{ language: "python", count: 0 }]);
    const [session, setSession] = useState(null);
    const [question, setQuestion] = useState(null);
    const [rating, setRating] = useState(0);
    const [code, setCode] = useState("");
    const [runAttempts, setRunAttempts] = useState(0);
    const [sessionStats, setSessionStats] = useState({ attempted: 0, solved: 0, skipped: 0 });
    const [busy, setBusy] = useState(false);
    const [running, setRunning] = useState(false);
    const [runResult, setRunResult] = useState(null);    // {tests_passed,tests_total,details}
    const [lastResult, setLastResult] = useState(null); // per-question feedback flash
    const [summary, setSummary] = useState(null);        // end-of-session summary
    const questionStartRef = useRef(Date.now());

    // On mount, resume an active session if any.
    useEffect(() => {
        adaptiveService.getActiveSession().then((res) => {
            if (res.data?.active) {
                setSession(res.data.session);
                setQuestion(res.data.question);
                setRating(res.data.rating);
                setCode(res.data.question.starter_code || "");
                questionStartRef.current = Date.now();
                setPhase("active");
            }
        }).catch(() => { });
        adaptiveService.getMyRating().then((res) => setRating(res.data.rating)).catch(() => { });
        adaptiveService.getLanguages().then((res) => {
            const langs = res.data?.languages || [];
            if (langs.length) { setLanguages(langs); setLanguage(langs[0].language); }
        }).catch(() => { });
    }, []);

    const loadQuestion = useCallback((q) => {
        setQuestion(q);
        setCode(q?.starter_code || "");
        setRunAttempts(0);
        setRunResult(null);
        questionStartRef.current = Date.now();
        setLastResult(null);
    }, []);

    const handleRun = async () => {
        if (!code.trim()) { toast.error("Write some code to run."); return; }
        setRunning(true);
        setRunAttempts((n) => n + 1);
        try {
            const res = await adaptiveService.run(session.id, code);
            setRunResult(res.data);
            const { tests_passed, tests_total } = res.data;
            if (tests_passed === tests_total) toast.success(`All ${tests_total} tests passed! Submit to lock it in.`);
            else toast.info(`${tests_passed}/${tests_total} tests passed. Rating isn't affected by Run.`);
        } catch {
            toast.error("Run failed.");
        } finally {
            setRunning(false);
        }
    };

    const handleStart = async () => {
        setPhase("loading");
        try {
            const res = await adaptiveService.startSession(language);
            setSession(res.data.session);
            setRating(res.data.rating);
            loadQuestion(res.data.question);
            setPhase("active");
        } catch (e) {
            toast.error(e.response?.data?.message || "Couldn't start session.");
            setPhase("intro");
        }
    };

    const advance = (data) => {
        setRating(data.rating);
        setLastResult(data.result);
        setSessionStats((s) => ({
            attempted: s.attempted + (data.result.outcome === "skipped" ? 0 : 1),
            solved: s.solved + (data.result.outcome === "solved" ? 1 : 0),
            skipped: s.skipped + (data.result.outcome === "skipped" ? 1 : 0),
        }));
        // Flash the result briefly, then move to the next question (or end).
        setTimeout(() => {
            if (data.next_question) {
                loadQuestion(data.next_question);
            } else {
                toast.info("You've completed all available questions!");
                handleEnd();
            }
        }, 1400);
    };

    const handleSubmit = async () => {
        if (!code.trim()) { toast.error("Write some code first, or skip."); return; }
        setBusy(true);
        try {
            const time = Math.floor((Date.now() - questionStartRef.current) / 1000);
            const res = await adaptiveService.submit(session.id, {
                code, time_taken_sec: time, run_attempts: runAttempts + 1,
            });
            advance(res.data);
        } catch (e) {
            toast.error(e.response?.data?.message || "Submit failed.");
        } finally {
            setBusy(false);
        }
    };

    const handleSkip = async () => {
        setBusy(true);
        try {
            const time = Math.floor((Date.now() - questionStartRef.current) / 1000);
            const res = await adaptiveService.skip(session.id, { time_taken_sec: time });
            advance(res.data);
        } catch {
            toast.error("Skip failed.");
        } finally {
            setBusy(false);
        }
    };

    const handleEnd = async () => {
        setBusy(true);
        try {
            const res = await adaptiveService.end(session.id);
            setSummary(res.data);
            setPhase("ended");
        } catch {
            toast.error("Couldn't end session.");
        } finally {
            setBusy(false);
        }
    };

    // ── INTRO ──────────────────────────────────────────────────────────
    if (phase === "intro" || phase === "loading") {
        return (
            <StudentLayout>
                <div className="max-w-2xl mx-auto py-12">
                    <Card className="p-8 text-center space-y-5">
                        <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center mx-auto">
                            <Zap className="w-8 h-8 text-indigo-600" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Adaptive Practice</h1>
                            <p className="text-gray-500 mt-2">
                                Questions adapt to your skill using the <b>MARS</b> rating system.
                                Solve or skip — one question at a time. Your rating updates after each answer.
                            </p>
                        </div>
                        <div className="flex items-center justify-center gap-6 text-sm">
                            <div className="text-center">
                                <div className="text-3xl font-extrabold text-indigo-600">{Math.round(rating)}</div>
                                <div className="text-xs text-gray-400">Your MARS rating</div>
                            </div>
                        </div>

                        {/* Language selector */}
                        <div className="space-y-2">
                            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Language</div>
                            <div className="flex flex-wrap justify-center gap-2">
                                {languages.map((l) => (
                                    <button
                                        key={l.language}
                                        onClick={() => setLanguage(l.language)}
                                        className={`px-4 py-2 rounded-lg border text-sm font-medium capitalize transition-colors
                                            ${language === l.language
                                                ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                                                : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                                    >
                                        {l.language}
                                        {l.count > 0 && <span className="ml-1.5 text-[10px] text-gray-400">{l.count}</span>}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <Button onClick={handleStart} disabled={phase === "loading"}
                            className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white h-11 px-8">
                            {phase === "loading" ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                            Start Session
                        </Button>
                        <div>
                            <Button variant="link" className="text-gray-500" onClick={() => navigate("/student/leaderboard")}>
                                <Trophy className="w-4 h-4 mr-1" /> View leaderboard
                            </Button>
                        </div>
                    </Card>
                </div>
            </StudentLayout>
        );
    }

    // ── ENDED (results) ────────────────────────────────────────────────
    if (phase === "ended" && summary) {
        const s = summary.session;
        const delta = s.rating_delta;
        return (
            <StudentLayout>
                <div className="max-w-2xl mx-auto py-12 space-y-6">
                    <Card className="p-8 text-center space-y-4">
                        <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center mx-auto">
                            <Award className="w-8 h-8 text-indigo-600" />
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900">Session Complete</h1>
                        <div className="flex items-center justify-center gap-8">
                            <div>
                                <div className="text-4xl font-extrabold text-indigo-600">{Math.round(summary.rating)}</div>
                                <div className="text-xs text-gray-400">New MARS rating</div>
                            </div>
                            <div className={`flex items-center gap-1 text-2xl font-bold ${delta >= 0 ? "text-green-600" : "text-red-600"}`}>
                                <TrendingUp className={`w-6 h-6 ${delta < 0 ? "rotate-180" : ""}`} />
                                {delta >= 0 ? "+" : ""}{delta}
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 pt-2">
                            <div><div className="text-xl font-bold">{s.questions_solved}</div><div className="text-xs text-gray-400">Solved</div></div>
                            <div><div className="text-xl font-bold">{s.questions_served}</div><div className="text-xs text-gray-400">Served</div></div>
                            <div><div className="text-xl font-bold">{s.questions_skipped}</div><div className="text-xs text-gray-400">Skipped</div></div>
                        </div>
                        <p className="text-sm text-gray-500">
                            Global rank <b>#{summary.rank}</b> of {summary.total_rated}
                        </p>
                        <div className="flex gap-2 justify-center pt-2">
                            <Button onClick={() => { setSummary(null); setPhase("intro"); }} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                                <Zap className="w-4 h-4" /> Practice again
                            </Button>
                            <Button variant="outline" onClick={() => navigate("/student/leaderboard")} className="gap-2">
                                <Trophy className="w-4 h-4" /> Leaderboard
                            </Button>
                        </div>
                    </Card>

                    {/* Per-question breakdown */}
                    {s.attempts?.length > 0 && (
                        <Card className="p-4">
                            <h3 className="font-semibold text-sm mb-3">This session</h3>
                            <div className="space-y-1.5">
                                {s.attempts.map((a) => (
                                    <div key={a.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                                        <span className="flex items-center gap-2 min-w-0">
                                            {a.outcome === "solved" ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                                                : a.outcome === "skipped" ? <SkipForward className="w-4 h-4 text-gray-400 shrink-0" />
                                                    : <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
                                            <span className="truncate">{a.question_title}</span>
                                        </span>
                                        <span className={`font-mono font-bold ${a.rating_delta >= 0 ? "text-green-600" : "text-red-600"}`}>
                                            {a.rating_delta >= 0 ? "+" : ""}{a.rating_delta}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}
                </div>
            </StudentLayout>
        );
    }

    // ── ACTIVE (solving) ───────────────────────────────────────────────
    return (
        <StudentLayout>
            <div className="flex flex-col h-[calc(100vh-8rem)]">
                {/* Top bar */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1.5 text-sm font-bold text-indigo-600">
                            <Zap className="w-4 h-4" /> {Math.round(rating)}
                        </span>
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" /> <Timer startRef={questionStartRef} />
                        </span>
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                            {sessionStats.solved} solved
                        </span>
                        <span className="text-xs text-gray-400">
                            {sessionStats.attempted} attempted · {sessionStats.skipped} skipped
                        </span>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleEnd} disabled={busy}
                        className="border-red-200 text-red-600 hover:bg-red-50 gap-1.5">
                        <StopCircle className="w-4 h-4" /> End session
                    </Button>
                </div>

                {/* Result flash */}
                {lastResult && (
                    <div className={`mb-3 rounded-lg px-4 py-2 text-sm font-medium flex items-center justify-between
                        ${lastResult.outcome === "solved" ? "bg-green-50 text-green-700"
                            : lastResult.outcome === "skipped" ? "bg-gray-100 text-gray-600" : "bg-red-50 text-red-700"}`}>
                        <span className="flex items-center gap-2">
                            {lastResult.outcome === "solved" ? <CheckCircle2 className="w-4 h-4" />
                                : lastResult.outcome === "skipped" ? <SkipForward className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                            {lastResult.outcome === "solved" ? "Solved!" : lastResult.outcome === "skipped" ? "Skipped" : `Failed (${lastResult.tests_passed}/${lastResult.tests_total} tests)`}
                        </span>
                        <span className={`font-mono font-bold ${lastResult.delta >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {lastResult.delta >= 0 ? "+" : ""}{lastResult.delta}
                            <ChevronRight className="w-4 h-4 inline ml-1" /> next…
                        </span>
                    </div>
                )}

                <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
                    {/* Problem */}
                    <Card className="p-5 overflow-y-auto">
                        <div className="flex items-start justify-between gap-2 mb-3">
                            <h2 className="text-lg font-bold text-gray-900">{question?.title}</h2>
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded border shrink-0 ${DIFF_COLOR[question?.difficulty] || ""}`}>
                                {question?.difficulty}
                            </span>
                        </div>
                        {question?.tags?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-3">
                                {question.tags.slice(0, 6).map((t) => (
                                    <span key={t} className="text-[10px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{t}</span>
                                ))}
                            </div>
                        )}
                        <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                            {question?.description}
                        </div>

                        {/* Function hint: makes it explicit which function to complete
                            and how the example inputs map to its arguments. */}
                        {question?.entry_point && (
                            <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
                                <div className="text-[11px] font-bold uppercase text-indigo-500 mb-1">Your task</div>
                                <p className="text-xs text-gray-700">
                                    Complete the function{" "}
                                    <code className="font-mono font-semibold text-indigo-700">{question.entry_point}(…)</code>{" "}
                                    and <b>return</b> the answer (don't print it). The example
                                    "Input" is what gets passed as the function's argument(s).
                                </p>
                            </div>
                        )}

                        {question?.visible_test_cases?.length > 0 && (
                            <div className="mt-4">
                                <h4 className="text-xs font-bold uppercase text-gray-400 mb-2">Examples</h4>
                                <div className="space-y-2">
                                    {question.visible_test_cases.map((tc, i) => (
                                        <div key={i} className="text-xs font-mono bg-gray-50 rounded p-2.5 space-y-1.5">
                                            {question?.entry_point ? (
                                                <>
                                                    <div className="text-indigo-700">
                                                        {question.entry_point}({String(tc.input)})
                                                        <span className="text-gray-400"> →</span>{" "}
                                                        <span className="text-green-700 font-semibold">{String(tc.expected_output)}</span>
                                                    </div>
                                                    <div className="text-[10px] text-gray-400">
                                                        argument(s): {String(tc.input)} &nbsp;·&nbsp; returns: {String(tc.expected_output)}
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div><span className="text-gray-400">Input:</span> {String(tc.input)}</div>
                                                    <div><span className="text-gray-400">Output:</span> {String(tc.expected_output)}</div>
                                                </>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </Card>

                    {/* Editor + actions */}
                    <div className="flex flex-col min-h-0">
                        <div className="flex-1 border rounded-lg overflow-hidden min-h-[300px]">
                            <MonacoEditor
                                height="100%"
                                language={session?.language || "python"}
                                value={code}
                                theme="vs-dark"
                                onChange={(v) => setCode(v || "")}
                                options={{
                                    fontSize: 14, minimap: { enabled: false },
                                    scrollBeyondLastLine: false, wordWrap: "on",
                                    readOnly: busy || !!lastResult,
                                }}
                            />
                        </div>
                        {/* Run results (no rating impact) */}
                        {runResult && (
                            <div className="mt-3 rounded-lg border bg-slate-50 p-3 text-xs">
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="font-medium">
                                        Run: {runResult.tests_passed}/{runResult.tests_total} tests passed
                                    </span>
                                    <span className="text-gray-400">rating unaffected</span>
                                </div>
                                {runResult.details?.length > 0 && (
                                    <div className="space-y-1 font-mono max-h-28 overflow-auto">
                                        {runResult.details.map((d, i) => (
                                            <div key={i} className="flex items-center gap-1.5">
                                                {d.status === "pass"
                                                    ? <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                                                    : <XCircle className="w-3 h-3 text-red-400 shrink-0" />}
                                                <span className="text-gray-500 truncate">in: {d.input}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="flex items-center gap-2 mt-3">
                            <Button variant="outline" onClick={handleSkip} disabled={busy || running || !!lastResult} className="gap-1.5">
                                <SkipForward className="w-4 h-4" /> Skip
                            </Button>
                            <Button variant="outline" onClick={handleRun} disabled={busy || running || !!lastResult} className="gap-1.5">
                                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                                Run
                            </Button>
                            <Button onClick={handleSubmit} disabled={busy || running || !!lastResult}
                                className="flex-1 gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white">
                                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                Submit
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </StudentLayout>
    );
}
