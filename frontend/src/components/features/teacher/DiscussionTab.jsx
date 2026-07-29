import { useState, useEffect, useCallback } from "react";
import {
    MessageCircle, Loader2, Plus, Send, CheckCircle2, Circle, Trash2, ChevronDown, ChevronRight,
} from "lucide-react";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Textarea } from "../../ui/textarea";
import { Avatar, AvatarFallback } from "../../ui/avatar";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../../ui/dialog";
import { toast } from "sonner";
import { classContentService } from "../../../services/classContentService";
import { RoleBadge } from "./RoleBadge";

// Role → left-border + name color, so teacher/TA/student replies are visually distinct.
const ROLE_STYLE = {
    teacher: { border: "border-l-indigo-500", name: "text-indigo-700", bg: "bg-indigo-50/40" },
    ta: { border: "border-l-green-500", name: "text-green-700", bg: "bg-green-50/40" },
    student: { border: "border-l-gray-300", name: "text-gray-800", bg: "bg-white" },
};

function initials(u) {
    return (u?.first_name?.[0] || u?.username?.[0] || "U").toUpperCase();
}

function Reply({ reply }) {
    const style = ROLE_STYLE[reply.author_role] || ROLE_STYLE.student;
    return (
        <div className={`flex gap-3 border-l-2 ${style.border} ${style.bg} pl-3 py-2 rounded-r`}>
            <Avatar className="w-7 h-7">
                <AvatarFallback className="bg-gray-100 text-gray-700 text-xs font-bold">{initials(reply.author)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
                <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold ${style.name}`}>
                        {reply.author?.first_name ? `${reply.author.first_name} ${reply.author.last_name}` : reply.author?.username}
                    </span>
                    <RoleBadge role={reply.author_role} />
                    <span className="text-[10px] text-gray-400">{new Date(reply.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap">{reply.content}</p>
            </div>
        </div>
    );
}

function Thread({ thread, canManage, onReply, onToggleResolved, onDelete, currentUserId }) {
    const [open, setOpen] = useState(false);
    const [replyText, setReplyText] = useState("");
    const [sending, setSending] = useState(false);
    const style = ROLE_STYLE[thread.author_role] || ROLE_STYLE.student;

    const send = async () => {
        if (!replyText.trim()) return;
        setSending(true);
        await onReply(thread, replyText);
        setReplyText("");
        setSending(false);
        setOpen(true);
    };

    const canDelete = canManage || thread.author?.id === currentUserId;

    return (
        <Card>
            <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                    <button onClick={() => setOpen((o) => !o)} className="flex items-start gap-3 text-left flex-1 min-w-0">
                        {open ? <ChevronDown className="w-4 h-4 mt-1 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 mt-1 text-gray-400 shrink-0" />}
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-semibold text-gray-900">{thread.title}</h3>
                                {thread.is_resolved && (
                                    <span className="text-[10px] font-bold text-green-700 bg-green-100 border border-green-200 rounded px-1.5 py-0.5 uppercase">Resolved</span>
                                )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className={`text-xs font-medium ${style.name}`}>
                                    {thread.author?.first_name ? `${thread.author.first_name} ${thread.author.last_name}` : thread.author?.username}
                                </span>
                                <RoleBadge role={thread.author_role} />
                                <span className="text-[10px] text-gray-400">{new Date(thread.created_at).toLocaleDateString()}</span>
                                <span className="text-[10px] text-gray-400 flex items-center gap-1">
                                    <MessageCircle className="w-3 h-3" /> {thread.reply_count ?? thread.replies?.length ?? 0}
                                </span>
                            </div>
                        </div>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                        {canManage && (
                            <Button variant="ghost" size="icon" title={thread.is_resolved ? "Mark unresolved" : "Mark resolved"}
                                className={thread.is_resolved ? "text-green-600" : "text-gray-400 hover:text-green-600"}
                                onClick={() => onToggleResolved(thread)}>
                                {thread.is_resolved ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                            </Button>
                        )}
                        {canDelete && (
                            <Button variant="ghost" size="icon" className="text-gray-400 hover:text-red-500" onClick={() => onDelete(thread)}>
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        )}
                    </div>
                </div>

                {thread.body && open && (
                    <p className="text-sm text-gray-600 mt-2 ml-7 whitespace-pre-wrap">{thread.body}</p>
                )}

                {open && (
                    <div className="mt-3 ml-7 space-y-2">
                        {(thread.replies || []).map((r) => <Reply key={r.id} reply={r} />)}
                        <div className="flex gap-2 pt-1">
                            <Input value={replyText} onChange={(e) => setReplyText(e.target.value)}
                                placeholder="Write a reply…" className="h-9 text-sm"
                                onKeyDown={(e) => e.key === "Enter" && send()} />
                            <Button size="sm" onClick={send} disabled={sending || !replyText.trim()} className="gap-1">
                                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </Card>
    );
}

export default function DiscussionTab({ classId, canManage = false, currentUserId = null }) {
    const [threads, setThreads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [form, setForm] = useState({ title: "", body: "" });
    const [creating, setCreating] = useState(false);

    const load = useCallback(() => {
        setLoading(true);
        classContentService
            .getThreads(classId)
            .then((res) => setThreads(Array.isArray(res.data) ? res.data : res.data?.results || []))
            .catch(() => setThreads([]))
            .finally(() => setLoading(false));
    }, [classId]);

    useEffect(() => { load(); }, [load]);

    const handleCreate = async () => {
        if (!form.title.trim()) { toast.error("Add a title / question."); return; }
        setCreating(true);
        try {
            const res = await classContentService.createThread(classId, form);
            setThreads((prev) => [res.data, ...prev]);
            setForm({ title: "", body: "" });
            setDialogOpen(false);
        } catch (e) {
            toast.error(e.response?.data?.message || "Failed to post.");
        } finally {
            setCreating(false);
        }
    };

    const handleReply = async (thread, content) => {
        try {
            const res = await classContentService.replyToThread(thread.id, content);
            setThreads((prev) => prev.map((t) => t.id === thread.id
                ? { ...t, replies: [...(t.replies || []), res.data], reply_count: (t.reply_count || 0) + 1 }
                : t));
        } catch {
            toast.error("Failed to reply.");
        }
    };

    const handleToggleResolved = async (thread) => {
        try {
            const res = await classContentService.toggleResolved(thread.id);
            setThreads((prev) => prev.map((t) => t.id === thread.id ? { ...t, is_resolved: res.data.is_resolved } : t));
        } catch {
            toast.error("Failed to update.");
        }
    };

    const handleDelete = async (thread) => {
        if (!window.confirm("Delete this discussion?")) return;
        try {
            await classContentService.deleteThread(thread.id);
            setThreads((prev) => prev.filter((t) => t.id !== thread.id));
        } catch {
            toast.error("Delete failed.");
        }
    };

    return (
        <div className="max-w-4xl">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-lg font-bold text-gray-900">Discussion</h2>
                    <p className="text-sm text-gray-500">Ask questions — teachers and TAs (colored) reply for everyone to see.</p>
                </div>
                <Button onClick={() => setDialogOpen(true)} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
                    <Plus className="w-4 h-4" /> New question
                </Button>
            </div>

            {/* Role legend */}
            <div className="flex items-center gap-3 mb-4 text-[11px] text-gray-500">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-indigo-500" /> Teacher</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500" /> TA</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-gray-300" /> Student</span>
            </div>

            {loading ? (
                <div className="flex justify-center py-16 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : threads.length === 0 ? (
                <Card>
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
                        <MessageCircle className="w-12 h-12 text-gray-300" />
                        <p className="text-sm font-medium">No discussions yet</p>
                        <p className="text-xs">Be the first to ask a question.</p>
                    </div>
                </Card>
            ) : (
                <div className="space-y-3">
                    {threads.map((t) => (
                        <Thread key={t.id} thread={t} canManage={canManage} currentUserId={currentUserId}
                            onReply={handleReply} onToggleResolved={handleToggleResolved} onDelete={handleDelete} />
                    ))}
                </div>
            )}

            {/* New thread dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Ask a question</DialogTitle>
                        <DialogDescription>Your question is visible to the whole class.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div>
                            <label className="text-sm font-medium">Question / title</label>
                            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                                placeholder="e.g. How do I handle edge cases in Q3?" className="mt-1" />
                        </div>
                        <div>
                            <label className="text-sm font-medium">Details (optional)</label>
                            <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
                                className="mt-1 min-h-[100px]" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreate} disabled={creating} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
                            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            Post
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
