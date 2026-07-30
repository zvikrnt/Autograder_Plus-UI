import { useState } from "react";
import { toast } from "sonner";
import AdminLayout from "../../components/layout/AdminLayout";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { adminService } from "../../services/adminService";

const ACTIONS = [
    { key: "cleanup_stale_submissions", label: "Clean up stale submissions", description: 'Clears submissions stuck in "processing" for over 10 minutes.' },
    { key: "update_analytics", label: "Update analytics", description: "Recomputes StudentAnalytics summary rows." },
    { key: "recalculate_points", label: "Recalculate points", description: "Recomputes gamification points from scratch." },
    { key: "update_leaderboard", label: "Update leaderboard", description: "Refreshes cached leaderboard rankings." },
];

export default function AdminMaintenance() {
    const [running, setRunning] = useState(null);
    const [output, setOutput] = useState({});

    const run = async (key) => {
        setRunning(key);
        const res = await adminService.runMaintenance(key);
        setRunning(null);
        if (res.success) {
            toast.success(`"${key}" completed.`);
            setOutput((prev) => ({ ...prev, [key]: res.data.output || "(no output)" }));
        } else {
            toast.error(res.message || `"${key}" failed.`);
            setOutput((prev) => ({ ...prev, [key]: `Error: ${res.message}` }));
        }
    };

    return (
        <AdminLayout>
            <h1 className="text-xl font-bold text-gray-900 mb-4">Maintenance</h1>
            <div className="space-y-3">
                {ACTIONS.map((a) => (
                    <Card key={a.key} className="p-4">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-sm font-semibold text-gray-900">{a.label}</p>
                                <p className="text-xs text-gray-500 mt-0.5">{a.description}</p>
                            </div>
                            <Button size="sm" onClick={() => run(a.key)} disabled={running === a.key}>
                                {running === a.key ? "Running..." : "Run"}
                            </Button>
                        </div>
                        {output[a.key] && (
                            <pre className="mt-3 text-xs bg-gray-900 text-gray-100 rounded p-3 overflow-x-auto whitespace-pre-wrap">
                                {output[a.key]}
                            </pre>
                        )}
                    </Card>
                ))}
            </div>
        </AdminLayout>
    );
}
