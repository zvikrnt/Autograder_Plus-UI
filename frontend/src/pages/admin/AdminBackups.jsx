import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import AdminLayout from "../../components/layout/AdminLayout";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../../components/ui/table";
import { adminService } from "../../services/adminService";
import { tokenManager } from "../../utils/tokenManager";

const formatBytes = (n) => {
    if (!n) return "-";
    const mb = n / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(n / 1024).toFixed(0)} KB`;
};

const STATUS_VARIANT = { complete: "default", running: "secondary", pending: "secondary", failed: "destructive" };

export default function AdminBackups() {
    const [backups, setBackups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);

    const load = async () => {
        const res = await adminService.getBackups();
        if (res.success) {
            setBackups(res.data.results || []);
        } else {
            toast.error(res.message || "Failed to load backups.");
        }
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    // The backup runs on a Celery worker, not in the request, so poll while
    // anything is still in flight. Driven off the fetched rows rather than
    // from inside load() itself, which would be a self-reference.
    const inFlight = backups.some((b) => b.status === "pending" || b.status === "running");
    useEffect(() => {
        if (!inFlight) return;
        const id = setInterval(load, 3000);
        return () => clearInterval(id);
    }, [inFlight]);

    const handleCreate = async () => {
        setCreating(true);
        const res = await adminService.createBackup();
        setCreating(false);
        if (res.success) {
            toast.success("Backup started — this runs in the background.");
            load();
        } else {
            toast.error(res.message || "Failed to start backup.");
        }
    };

    const handleDownload = (backup) => {
        // FileResponse download needs the auth header, which a plain <a
        // href> can't attach — fetch the bytes and hand the browser a blob.
        const token = tokenManager.getAccessToken();
        fetch(adminService.getBackupDownloadUrl(backup.id), {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((r) => {
                if (!r.ok) throw new Error(`Download failed (${r.status})`);
                return r.blob();
            })
            .then((blob) => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = backup.filename;
                a.click();
                window.URL.revokeObjectURL(url);
            })
            .catch((e) => toast.error(e.message));
    };

    return (
        <AdminLayout>
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-xl font-bold text-gray-900">Backups</h1>
                <Button size="sm" onClick={handleCreate} disabled={creating}>
                    {creating ? "Starting..." : "Create backup"}
                </Button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
                Includes the database and all locally-stored submission/media files, as a ZIP. The
                newest 5 backups are kept; older ones are pruned automatically.
            </p>

            <Card className="p-0 overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Filename</TableHead>
                            <TableHead>Size</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead>By</TableHead>
                            <TableHead></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={6} className="text-center text-gray-500">Loading...</TableCell></TableRow>
                        ) : backups.length === 0 ? (
                            <TableRow><TableCell colSpan={6} className="text-center text-gray-500">No backups yet.</TableCell></TableRow>
                        ) : backups.map((b) => (
                            <TableRow key={b.id}>
                                <TableCell className="font-mono text-xs">{b.filename || "(pending)"}</TableCell>
                                <TableCell>{formatBytes(b.size_bytes)}</TableCell>
                                <TableCell>
                                    <Badge variant={STATUS_VARIANT[b.status] || "secondary"}>{b.status}</Badge>
                                    {b.status === "failed" && b.error_message && (
                                        <p className="text-xs text-red-500 mt-1 max-w-xs truncate" title={b.error_message}>{b.error_message}</p>
                                    )}
                                </TableCell>
                                <TableCell className="text-gray-500 text-xs">{new Date(b.created_at).toLocaleString()}</TableCell>
                                <TableCell className="text-gray-500 text-xs">{b.created_by_username || "-"}</TableCell>
                                <TableCell>
                                    {b.status === "complete" && (
                                        <Button size="sm" variant="outline" onClick={() => handleDownload(b)}>
                                            <Download className="w-3.5 h-3.5 mr-1.5" />
                                            Download
                                        </Button>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Card>
        </AdminLayout>
    );
}
