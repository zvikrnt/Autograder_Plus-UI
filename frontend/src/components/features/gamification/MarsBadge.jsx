import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Zap } from "lucide-react";
import { adaptiveService } from "../../../services/adaptiveService";

// Compact MARS rating chip for the student dashboard header. Clicks → adaptive practice.
export default function MarsBadge() {
    const navigate = useNavigate();
    const [data, setData] = useState(null);

    useEffect(() => {
        adaptiveService.getMyRating().then((res) => setData(res.data)).catch(() => { });
    }, []);

    return (
        <button
            onClick={() => navigate("/student/adaptive")}
            title="Adaptive practice — your MARS rating"
            className="flex items-center gap-2.5 rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white px-3.5 py-2 shadow-sm hover:shadow transition-all"
        >
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" />
            </div>
            <div className="text-left">
                <div className="text-lg font-extrabold text-indigo-700 leading-none">
                    {data ? Math.round(data.rating) : "—"}
                </div>
                <div className="text-[10px] text-gray-400 leading-none mt-0.5">
                    MARS{data?.rank ? ` · #${data.rank}` : ""}
                </div>
            </div>
        </button>
    );
}
