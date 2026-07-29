import { useState, useEffect, useCallback } from "react";
import {
    Upload, FileText, Download, Trash2, Loader2, Link2, Plus, FolderOpen, X,
} from "lucide-react";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Textarea } from "../../ui/textarea";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../../ui/dialog";
import { toast } from "sonner";
import { classContentService } from "../../../services/classContentService";

const fmtSize = (b) => (!b ? "" : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`);

// canManage: teachers/TAs can upload/delete; students only view.
export default function ResourcesTab({ classId, canManage = true }) {
    const [resources, setResources] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [form, setForm] = useState({ title: "", description: "", category: "Lecture", file: null, link_url: "" });

    const load = useCallback(() => {
        setLoading(true);
        classContentService
            .getResources(classId)
            .then((res) => setResources(Array.isArray(res.data) ? res.data : res.data?.results || []))
            .catch(() => setResources([]))
            .finally(() => setLoading(false));
    }, [classId]);

    useEffect(() => { load(); }, [load]);

    const handleUpload = async () => {
        if (!form.title.trim()) { toast.error("Title is required."); return; }
        if (!form.file && !form.link_url.trim()) { toast.error("Add a file or a link."); return; }
        setUploading(true);
        try {
            await classContentService.uploadResource(classId, form);
            toast.success("Resource uploaded.");
            setDialogOpen(false);
            setForm({ title: "", description: "", category: "Lecture", file: null, link_url: "" });
            load();
        } catch (e) {
            toast.error(e.response?.data?.message || "Upload failed.");
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (r) => {
        if (!window.confirm(`Delete "${r.title}"?`)) return;
        try {
            await classContentService.deleteResource(r.id);
            setResources((prev) => prev.filter((x) => x.id !== r.id));
            toast.success("Deleted.");
        } catch {
            toast.error("Delete failed.");
        }
    };

    // Group by category for a tidy list.
    const grouped = resources.reduce((acc, r) => {
        const k = r.category || "General";
        (acc[k] = acc[k] || []).push(r);
        return acc;
    }, {});

    return (
        <div className="max-w-4xl">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-lg font-bold text-gray-900">Resources</h2>
                    <p className="text-sm text-gray-500">Lecture notes, slides, and materials for this class.</p>
                </div>
                {canManage && (
                    <Button onClick={() => setDialogOpen(true)} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
                        <Upload className="w-4 h-4" /> Upload
                    </Button>
                )}
            </div>

            {loading ? (
                <div className="flex justify-center py-16 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : resources.length === 0 ? (
                <Card>
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
                        <FolderOpen className="w-12 h-12 text-gray-300" />
                        <p className="text-sm font-medium">No resources yet</p>
                        {canManage && <p className="text-xs">Upload lecture notes, slides, or share links.</p>}
                    </div>
                </Card>
            ) : (
                <div className="space-y-6">
                    {Object.entries(grouped).map(([cat, items]) => (
                        <div key={cat}>
                            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">{cat}</h3>
                            <div className="space-y-2">
                                {items.map((r) => (
                                    <Card key={r.id} className="hover:shadow-sm transition-shadow">
                                        <div className="p-4 flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                                                {r.link_url && !r.file_url ? <Link2 className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-gray-900 truncate">{r.title}</p>
                                                {r.description && <p className="text-xs text-gray-500 truncate">{r.description}</p>}
                                                <p className="text-[11px] text-gray-400">
                                                    {r.uploaded_by?.first_name || r.uploaded_by?.username || "Staff"}
                                                    {r.size ? ` · ${fmtSize(r.size)}` : ""}
                                                    {" · "}{new Date(r.created_at).toLocaleDateString()}
                                                </p>
                                            </div>
                                            {(r.file_url || r.link_url) && (
                                                <a href={r.file_url || r.link_url} target="_blank" rel="noopener noreferrer"
                                                    className="shrink-0">
                                                    <Button variant="outline" size="sm" className="gap-1.5">
                                                        <Download className="w-3.5 h-3.5" /> Open
                                                    </Button>
                                                </a>
                                            )}
                                            {canManage && (
                                                <Button variant="ghost" size="icon" className="text-gray-400 hover:text-red-500 shrink-0"
                                                    onClick={() => handleDelete(r)}>
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Upload dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Upload Resource</DialogTitle>
                        <DialogDescription>Add lecture notes, slides (PPT), PDFs, or a link.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div>
                            <label className="text-sm font-medium">Title</label>
                            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                                placeholder="e.g. Lecture 5 — Recursion" className="mt-1" />
                        </div>
                        <div>
                            <label className="text-sm font-medium">Category</label>
                            <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                                placeholder="Lecture / Notes / Slides" className="mt-1" />
                        </div>
                        <div>
                            <label className="text-sm font-medium">Description (optional)</label>
                            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                                className="mt-1 min-h-[60px]" />
                        </div>
                        <div>
                            <label className="text-sm font-medium">File</label>
                            {form.file ? (
                                <div className="flex items-center gap-2 mt-1 text-sm bg-indigo-50 text-indigo-700 rounded px-3 py-2">
                                    <FileText className="w-4 h-4" />
                                    <span className="flex-1 truncate">{form.file.name}</span>
                                    <X className="w-4 h-4 cursor-pointer hover:text-red-500" onClick={() => setForm({ ...form, file: null })} />
                                </div>
                            ) : (
                                <label className="mt-1 flex items-center justify-center gap-2 border-2 border-dashed rounded-lg py-4 cursor-pointer text-sm text-gray-500 hover:border-indigo-300 hover:text-indigo-600">
                                    <Plus className="w-4 h-4" /> Choose a file (PDF, PPT, DOCX…)
                                    <input type="file" className="hidden"
                                        onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })} />
                                </label>
                            )}
                        </div>
                        <div>
                            <label className="text-sm font-medium">…or a link</label>
                            <Input value={form.link_url} onChange={(e) => setForm({ ...form, link_url: e.target.value })}
                                placeholder="https://…" className="mt-1" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleUpload} disabled={uploading} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
                            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                            Upload
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
