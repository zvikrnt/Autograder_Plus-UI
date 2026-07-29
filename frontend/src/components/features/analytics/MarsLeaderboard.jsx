import { useState, useEffect } from "react";
import { Trophy, Loader2, Users, Globe, Medal } from "lucide-react";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { adaptiveService } from "../../../services/adaptiveService";

const MEDAL = ["text-yellow-500", "text-gray-400", "text-amber-700"];

/**
 * MARS leaderboard. If `classId` is provided, a Global / This-class toggle is shown;
 * otherwise it's global only.
 */
export default function MarsLeaderboard({ classId = null, defaultScope = "global" }) {
    const [scope, setScope] = useState(classId ? defaultScope : "global");
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);  // reset spinner when scope/class changes
        adaptiveService
            .getLeaderboard(scope === "class" ? classId : undefined)
            .then((res) => { if (!cancelled) setRows(res.data?.leaderboard || []); })
            .catch(() => { if (!cancelled) setRows([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/set-state-in-effect
    }, [scope, classId]);

    return (
        <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-yellow-500" /> MARS Leaderboard
                </h3>
                {classId && (
                    <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                        <Button size="sm" variant={scope === "global" ? "default" : "ghost"}
                            className="h-7 gap-1 text-xs" onClick={() => setScope("global")}>
                            <Globe className="w-3.5 h-3.5" /> Global
                        </Button>
                        <Button size="sm" variant={scope === "class" ? "default" : "ghost"}
                            className="h-7 gap-1 text-xs" onClick={() => setScope("class")}>
                            <Users className="w-3.5 h-3.5" /> This class
                        </Button>
                    </div>
                )}
            </div>

            {loading ? (
                <div className="flex justify-center py-16 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : rows.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                    <Trophy className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No ranked students yet.</p>
                </div>
            ) : (
                <div className="divide-y">
                    {rows.map((r) => (
                        <div key={r.username}
                            className={`flex items-center gap-3 px-5 py-2.5 ${r.is_me ? "bg-indigo-50" : ""}`}>
                            <div className="w-8 text-center shrink-0">
                                {r.rank <= 3 ? (
                                    <Medal className={`w-5 h-5 mx-auto ${MEDAL[r.rank - 1]}`} />
                                ) : (
                                    <span className="text-sm font-bold text-gray-400">{r.rank}</span>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                    {r.name} {r.is_me && <span className="text-[10px] text-indigo-600 font-bold">(you)</span>}
                                </p>
                                <p className="text-[11px] text-gray-400">{r.questions_answered} questions</p>
                            </div>
                            <div className="text-right shrink-0">
                                <div className="text-base font-bold text-indigo-600">{Math.round(r.rating)}</div>
                                <div className="text-[10px] text-gray-400">peak {Math.round(r.peak_rating)}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}
