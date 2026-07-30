import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import AdminLayout from "../../components/layout/AdminLayout";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { adminService } from "../../services/adminService";

const LABELS = {
    database: "Database (Postgres)",
    redis: "Redis",
    minio: "MinIO",
    docker: "Docker (grading)",
    celery: "Celery workers",
    stuck_submissions: "Stuck submissions",
    disk: "Disk usage",
};

export default function AdminSystem() {
    const [checks, setChecks] = useState(null);
    const [loading, setLoading] = useState(true);

    // `loading` already starts true, so the mount fetch must NOT set it again
    // synchronously — that would be a setState inside the effect body.
    const fetchHealth = async () => {
        const res = await adminService.getHealth();
        if (res.success) {
            setChecks(res.data.checks);
        } else {
            toast.error(res.message || "Failed to load system health.");
        }
        setLoading(false);
    };

    const refresh = () => {
        setLoading(true);
        fetchHealth();
    };

    useEffect(() => { fetchHealth(); }, []);

    return (
        <AdminLayout>
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-xl font-bold text-gray-900">System Health</h1>
                <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
                    <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                    Refresh
                </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {checks && Object.entries(checks).map(([key, check]) => (
                    <Card key={key} className="p-4 flex items-start gap-3">
                        {check.ok ? (
                            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                        ) : (
                            <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                        )}
                        <div>
                            <p className="text-sm font-semibold text-gray-900">{LABELS[key] || key}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{check.detail}</p>
                        </div>
                    </Card>
                ))}
            </div>
        </AdminLayout>
    );
}
