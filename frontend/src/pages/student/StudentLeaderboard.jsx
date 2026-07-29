import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
    Zap, Trophy, Clock, CheckCircle2, SkipForward, XCircle, TrendingUp, History,
} from "lucide-react";
import StudentLayout from "../../components/layout/StudentLayout";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import MarsLeaderboard from "../../components/features/analytics/MarsLeaderboard";
import { adaptiveService } from "../../services/adaptiveService";
import { classService } from "../../services/classService";

function fmtTime(sec) {
    sec = Math.round(sec || 0);
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export default function StudentLeaderboard() {
    const navigate = useNavigate();
    const [rating, setRating] = useState(null);
    const [classId, setClassId] = useState(null);
    const [history, setHistory] = useState([]);

    useEffect(() => {
        adaptiveService.getMyRating().then((res) => setRating(res.data)).catch(() => { });
        adaptiveService.getHistory().then((res) => setHistory(res.data?.sessions || [])).catch(() => { });
        classService.getClasses().then((res) => {
            const list = res.data?.results || res.data || [];
            if (list.length) setClassId(list[0].id);
        }).catch(() => { });
    }, []);

    return (
        <StudentLayout>
            <div className="max-w-3xl mx-auto space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <Trophy className="w-6 h-6 text-yellow-500" /> Adaptive Practice
                        </h1>
                        <p className="text-gray-500 text-sm">Your MARS rating, ranking and history.</p>
                    </div>
                    <Button onClick={() => navigate("/student/adaptive")} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
                        <Zap className="w-4 h-4" /> Practice
                    </Button>
                </div>

                {/* Lifetime stats */}
                {rating && (
                    <Card className="p-5">
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-4 text-center">
                            <div><div className="text-2xl font-extrabold text-indigo-600">{Math.round(rating.rating)}</div><div className="text-[11px] text-gray-400">Rating</div></div>
                            <div><div className="text-2xl font-extrabold text-gray-900">#{rating.rank}</div><div className="text-[11px] text-gray-400">Global rank</div></div>
                            <div><div className="text-2xl font-extrabold text-gray-900">{Math.round(rating.peak_rating)}</div><div className="text-[11px] text-gray-400">Peak</div></div>
                            <div><div className="text-2xl font-extrabold text-green-600">{rating.total_solved}</div><div className="text-[11px] text-gray-400">Solved</div></div>
                            <div><div className="text-2xl font-extrabold text-gray-900">{rating.total_attempted}</div><div className="text-[11px] text-gray-400">Attempted</div></div>
                            <div><div className="text-2xl font-extrabold text-gray-900">{fmtTime(rating.total_time_sec)}</div><div className="text-[11px] text-gray-400">Time spent</div></div>
                        </div>
                    </Card>
                )}

                <MarsLeaderboard classId={classId} defaultScope="global" />

                {/* Personal history */}
                <Card className="overflow-hidden">
                    <div className="px-5 py-4 border-b">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                            <History className="w-5 h-5 text-indigo-500" /> Your Sessions
                        </h3>
                    </div>
                    {history.length === 0 ? (
                        <div className="text-center py-12 text-gray-400 text-sm">No past sessions yet.</div>
                    ) : (
                        <div className="divide-y">
                            {history.map((s) => (
                                <div key={s.id} className="px-5 py-3">
                                    <div className="flex items-center justify-between">
                                        <div className="text-sm text-gray-700">
                                            {new Date(s.started_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                        </div>
                                        <div className={`flex items-center gap-1 text-sm font-bold ${s.rating_delta >= 0 ? "text-green-600" : "text-red-600"}`}>
                                            <TrendingUp className={`w-4 h-4 ${s.rating_delta < 0 ? "rotate-180" : ""}`} />
                                            {s.rating_delta >= 0 ? "+" : ""}{s.rating_delta}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                                        <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500" /> {s.questions_solved} solved</span>
                                        <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-red-400" /> {s.questions_served - s.questions_solved - s.questions_skipped} failed</span>
                                        <span className="flex items-center gap-1"><SkipForward className="w-3 h-3" /> {s.questions_skipped} skipped</span>
                                        <span className="text-gray-400">{Math.round(s.rating_start)} → {Math.round(s.rating_end)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            </div>
        </StudentLayout>
    );
}
