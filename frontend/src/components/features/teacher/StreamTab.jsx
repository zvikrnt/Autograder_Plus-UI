import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Info, StickyNote, Users, Send, MoreVertical, MessageSquare, Paperclip, X, Calendar, Trash2, Edit2 } from "lucide-react";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { Input } from "../../ui/input";
import { Textarea } from "../../ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "../../ui/avatar";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "../../ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "../../ui/dialog";
import { toast } from "sonner";
import { assignmentService } from "../../../services/assignmentService";
import { classService } from "../../../services/classService";
import { streamService } from "../../../services/streamService";
import { classContentService } from "../../../services/classContentService";
import ClassStatsCards from "./ClassStatsCards";
import { RoleBadge } from "./RoleBadge";

export default function StreamTab() {
    const { classId } = useParams();
    const navigate = useNavigate();
    const [classData, setClassData] = useState(null);
    const [upcomingWork, setUpcomingWork] = useState([]);
    const [isAnnouncing, setIsAnnouncing] = useState(false);
    const [announcementText, setAnnouncementText] = useState("");
    const [editingPostId, setEditingPostId] = useState(null);
    const [editText, setEditText] = useState("");
    const [pendingFiles, setPendingFiles] = useState([]); // files to attach to a new announcement
    const [posting, setPosting] = useState(false);
    const [posts, setPosts] = useState([]);
    const [currentUser, setCurrentUser] = useState(null); // Would normally get from AuthContext
    const [loading, setLoading] = useState(true);

    const isAssignmentLike = (t) => ['assignment', 'quiz', 'exam'].includes(t);

    // Fetch class details
    useEffect(() => {
        const fetchClassDetails = async () => {
            if (!classId) return;
            try {
                const response = await classService.getClass(classId);
                if (response.success) {
                    setClassData(response.data);
                }
                // Assume we can get current user from somewhere, or owner check
                // For now, rely on API response author
            } catch (error) {
                console.error("Failed to fetch class details", error);
            }
        };
        fetchClassDetails();
    }, [classId]);

    // Fetch Stream Data (Announcements + Assignments)
    useEffect(() => {
        const fetchStream = async () => {
            if (!classId) return;
            setLoading(true);
            try {
                // Parallel fetch
                const [announcementsRes, assignmentsRes] = await Promise.all([
                    streamService.getAnnouncements(classId),
                    assignmentService.getClassAssignments(classId)
                ]);

                let allPosts = [];

                // Process Announcements
                if (announcementsRes.success && Array.isArray(announcementsRes.data)) {
                    const announcements = announcementsRes.data.map(a => ({
                        id: a.id,
                        type: 'announcement',
                        author: a.author,
                        date: new Date(a.created_at),
                        content: a.content,
                        comments: a.comments || [],
                        commentsCount: a.comments_count || (a.comments?.length || 0),
                        showComments: false,
                        isPinned: a.is_pinned,
                        attachments: a.attachments || [],
                        raw: a
                    }));
                    allPosts = [...allPosts, ...announcements];
                }

                // Process Assignments (as Posts)
                let assignmentsForUpcoming = [];
                if (assignmentsRes.success && assignmentsRes.data) {
                    const rawAssignments = Array.isArray(assignmentsRes.data) ? assignmentsRes.data : (assignmentsRes.data.results || []);
                    assignmentsForUpcoming = rawAssignments;

                    const assignmentPosts = rawAssignments.map(a => {
                        const displayType = a.type === 'quiz' ? 'Quiz' : a.mode === 'exam' ? 'Exam' : 'Assignment';
                        const mappedType = a.type === 'quiz' ? 'quiz' : (a.mode === 'exam' ? 'exam' : 'assignment');
                        return {
                            id: a.id,
                            // preserve the true content type so consumers can detect quizzes/exams
                            type: mappedType,
                            displayType: displayType,
                            author: { first_name: 'New', last_name: displayType }, // Placeholder
                            title: a.title,
                            date: new Date(a.created_at),
                            content: `New ${displayType} Posted: ${a.title}`,
                            comments: [],
                            commentsCount: a.comments_count || 0,
                            showComments: false,
                            dueDate: a.due_date,
                            raw: a
                        };
                    });
                    allPosts = [...allPosts, ...assignmentPosts];
                }

                // Sort by Date Descending
                allPosts.sort((a, b) => b.date - a.date);
                setPosts(allPosts);

                // Process Upcoming Work
                const upcoming = assignmentsForUpcoming
                    .filter(a => new Date(a.due_date) >= new Date())
                    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
                    .map(a => {
                        const displayType = a.type === 'quiz' ? 'Quiz' : a.mode === 'exam' ? 'Exam' : 'Assignment';
                        return {
                            id: a.id,
                            title: a.title,
                            due: new Date(a.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                            // keep capitalized display label for UI
                            type: displayType
                        };
                    });
                setUpcomingWork(upcoming);

            } catch (error) {
                console.error("Failed to fetch stream:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchStream();
    }, [classId]);

    const handlePost = async () => {
        if (!announcementText.trim() && pendingFiles.length === 0) return;

        setPosting(true);
        try {
            const res = await streamService.createAnnouncement(classId, { content: announcementText });
            if (res.success) {
                // Upload any pending attachments to the new announcement.
                let attachments = [];
                if (pendingFiles.length > 0) {
                    for (const f of pendingFiles) {
                        try {
                            const up = await classContentService.uploadAnnouncementAttachment(res.data.id, f);
                            attachments.push(up.data);
                        } catch (e) {
                            console.error("Attachment upload failed:", e);
                            toast.error(`Failed to attach ${f.name}`);
                        }
                    }
                }
                const newPost = {
                    id: res.data.id,
                    type: 'announcement',
                    author: res.data.author,
                    date: new Date(res.data.created_at),
                    content: res.data.content,
                    comments: [],
                    commentsCount: 0,
                    showComments: false,
                    isPinned: res.data.is_pinned,
                    attachments,
                    raw: res.data
                };
                setPosts([newPost, ...posts]);
                setAnnouncementText("");
                setPendingFiles([]);
                setIsAnnouncing(false);
            }
        } catch (error) {
            console.error("Failed to post:", error);
            toast.error("Failed to post announcement.");
        } finally {
            setPosting(false);
        }
    };

    const handleDelete = async (post) => {
        if (post.type !== 'announcement') return; // Can't delete assignments from stream here

        if (confirm("Are you sure you want to delete this announcement?")) {
            const res = await streamService.deleteAnnouncement(post.id);
            if (res.success) {
                setPosts(posts.filter(p => p.id !== post.id));
            }
        }
    };

    const startEdit = (post) => {
        setEditingPostId(post.id);
        setEditText(post.content);
    };

    const saveEdit = async (post) => {
        if (!editText.trim()) return;
        try {
            const res = await streamService.updateAnnouncement(post.id, { content: editText });
            if (res.success) {
                setPosts(posts.map(p => p.id === post.id ? { ...p, content: res.data.content } : p));
                setEditingPostId(null);
                setEditText("");
            }
        } catch (error) {
            console.error("Failed to update:", error);
        }
    };

    const handleDeleteAssignment = async (assignment) => {
        if (!window.confirm(`Are you sure you want to delete the ${assignment.type || 'assignment'} "${assignment.title}"?`)) return;

        try {
            const res = await assignmentService.deleteAssignment(assignment.id);
            if (res.success) {
                setPosts(posts.filter(p => p.id !== assignment.id));
                toast.success("Assignment deleted successfully");
            }
        } catch (error) {
            console.error("Failed to delete assignment", error);
            alert("Failed to delete assignment. Please try again.");
        }
    };

    const handleEditAssignment = (assignment) => {
        navigate(`/teacher/assignment/create?id=${assignment.id}&edit=true`);
    };

    const toggleComments = async (post) => {
        // Fetch comments if needed (lazy load or refresh)
        // Always fetch to ensure we see new student comments
        if (!post.showComments) {
            try {
                // Determine IDs
                const announcementId = post.type === 'announcement' ? post.id : null;
                const assignmentId = isAssignmentLike(post.type) ? post.id : null;

                // Call API for both types to ensure fresh data
                const res = await streamService.getComments(announcementId, assignmentId);

                if (res.success) {
                    // Handle pagination (DRF returns { results: [...] } if paginated)
                    const commentsData = Array.isArray(res.data) ? res.data : (res.data.results || []);

                    setPosts(posts.map(p =>
                        p.id === post.id ? { ...p, comments: commentsData, commentsCount: commentsData.length, showComments: true } : p
                    ));
                    return;
                }
            } catch (error) {
                console.error("Failed to fetch comments", error);
            }
        }

        setPosts(posts.map(p =>
            p.id === post.id ? { ...p, showComments: !p.showComments } : p
        ));
    };

    const handleAddComment = async (post, text) => {
        if (!text.trim()) return;

        const payload = {
            content: text,
            // author is handled by backend token
        };

        if (post.type === 'announcement') payload.announcement = post.id;
        else if (isAssignmentLike(post.type)) payload.assignment = post.id;

        try {
            const res = await streamService.addComment(payload);
            if (res.success) {
                const newComment = res.data;
                // Append to post comments
                setPosts(posts.map(p => {
                    if (p.id === post.id) {
                        const currentComments = Array.isArray(p.comments) ? p.comments : [];
                        return {
                            ...p,
                            comments: [...currentComments, newComment],
                            commentsCount: (p.commentsCount || 0) + 1
                        };
                    }
                    return p;
                }));
            }
        } catch (error) {
            console.error("Failed to add comment:", error);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Left Sidebar */}
            <div className="space-y-6 hidden lg:block">
                {/* Teacher/TA-only class overview stats */}
                <ClassStatsCards classId={classId} />
                <Card>
                    <div className="p-4 space-y-3">
                        <h3 className="font-semibold text-gray-600 text-sm">Class Code</h3>
                        <div className="text-2xl font-bold tracking-widest text-indigo-600">
                            {classData?.join_code || "..."}
                        </div>
                        <p className="text-xs text-gray-400">Share this code with students</p>
                    </div>
                </Card>
                <Card>
                    <div className="p-4 space-y-4">
                        <h3 className="font-semibold text-gray-600 text-sm">Upcoming</h3>
                        <div className="space-y-3">
                            {upcomingWork.length > 0 ? (
                                upcomingWork.slice(0, 2).map(work => (
                                    <div key={work.id} className="text-sm">
                                        <p className="text-gray-900 font-medium">{work.title}</p>
                                        <p className="text-xs text-gray-500">Due {work.due}</p>
                                    </div>
                                ))
                            ) : (
                                <p className="text-xs text-gray-400 italic">No upcoming work due soon.</p>
                            )}
                        </div>

                        <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="link" className="p-0 text-indigo-600 text-sm h-auto">View all</Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-md">
                                <DialogHeader>
                                    <DialogTitle>Upcoming Work</DialogTitle>
                                    <DialogDescription>
                                        All assignments and due dates for this class.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                    {upcomingWork.map(work => (
                                        <div key={work.id} className="flex items-start gap-4 p-3 rounded-lg border bg-gray-50/50">
                                            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                                                <Calendar className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="font-semibold text-gray-900">{work.title}</p>
                                                <p className="text-sm text-gray-500">Due: {work.due}</p>
                                                <span className="inline-block mt-1 text-[10px] uppercase font-bold tracking-wider text-gray-400 border border-gray-200 px-1.5 rounded">
                                                    {work.type}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>
                </Card>
            </div>

            {/* Main Stream */}
            <div className="col-span-1 lg:col-span-3 space-y-6">
                {/* Announcement Input */}
                <Card className="shadow-sm transition-shadow">
                    {isAnnouncing ? (
                        <div className="p-4 space-y-4">
                            <Textarea
                                placeholder="Announce something to your class..."
                                className="min-h-[120px] resize-none border-0 focus-visible:ring-0 bg-gray-50 text-base"
                                value={announcementText}
                                onChange={(e) => setAnnouncementText(e.target.value)}
                                autoFocus
                            />
                            {/* Pending attachments */}
                            {pendingFiles.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {pendingFiles.map((f, i) => (
                                        <span key={i} className="flex items-center gap-1.5 text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 rounded px-2 py-1">
                                            <Paperclip className="w-3 h-3" />
                                            <span className="max-w-[160px] truncate">{f.name}</span>
                                            <X className="w-3 h-3 cursor-pointer hover:text-red-500"
                                                onClick={() => setPendingFiles(pendingFiles.filter((_, idx) => idx !== i))} />
                                        </span>
                                    ))}
                                </div>
                            )}
                            <div className="flex justify-between items-center">
                                <label className="cursor-pointer text-gray-400 hover:text-indigo-600 p-2 rounded-md hover:bg-gray-100" title="Attach files (PDF, PPT, etc.)">
                                    <Paperclip className="w-5 h-5" />
                                    <input
                                        type="file"
                                        multiple
                                        className="hidden"
                                        onChange={(e) => {
                                            const files = Array.from(e.target.files || []);
                                            if (files.length) setPendingFiles((prev) => [...prev, ...files]);
                                            e.target.value = ""; // allow re-selecting same file
                                        }}
                                    />
                                </label>
                                <div className="flex gap-2">
                                    <Button variant="ghost" onClick={() => { setIsAnnouncing(false); setPendingFiles([]); }}>Cancel</Button>
                                    <Button onClick={handlePost} disabled={posting || (!announcementText.trim() && pendingFiles.length === 0)}>
                                        {posting ? "Posting…" : "Post"}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div
                            className="p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50/50 transition-colors rounded-lg"
                            onClick={() => setIsAnnouncing(true)}
                        >
                            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                                {classData?.owner?.first_name?.charAt(0) || "T"}
                            </div>
                            <div className="flex-1 text-gray-400 text-sm font-medium hover:text-gray-500">
                                Announce something to your class...
                            </div>
                        </div>
                    )}
                </Card>

                {/* Stream Items */}
                {loading ? (
                    <div className="text-center py-12 text-gray-400">Loading stream...</div>
                ) : posts.map((post) => (
                    <Card key={`${post.type}-${post.id}`} className="group">
                        <div className="p-6">
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    {isAssignmentLike(post.type) ? (
                                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white bg-indigo-600">
                                            <StickyNote className="w-5 h-5" />
                                        </div>
                                    ) : (
                                        <Avatar className="w-10 h-10">
                                            <AvatarImage src={post.author?.avatar_url} />
                                            <AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold">
                                                {post.author?.first_name?.charAt(0) || post.author?.username?.charAt(0) || "U"}
                                            </AvatarFallback>
                                        </Avatar>
                                    )}

                                    <div>
                                        <h3 className="font-semibold text-gray-900">
                                            {isAssignmentLike(post.type) ? `${post.author.first_name} posted a new ${post.displayType?.toLowerCase() || 'assignment'}: ${post.title}` : (post.author?.first_name ? `${post.author.first_name} ${post.author.last_name}` : post.author?.username)}
                                        </h3>
                                        <p className="text-xs text-gray-500">{post.date.toLocaleDateString()} {post.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                    </div>
                                </div>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <MoreVertical className="w-4 h-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                        {post.type === 'announcement' ? (
                                            <>
                                                <DropdownMenuItem onClick={() => startEdit(post)}>Edit</DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handleDelete(post)} className="text-red-600">
                                                    <Trash2 className="w-4 h-4 mr-2" /> Delete
                                                </DropdownMenuItem>
                                            </>
                                        ) : (
                                            <>
                                                <DropdownMenuItem onClick={() => handleEditAssignment(post)}>
                                                    <Edit2 className="w-4 h-4 mr-2" /> Edit
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handleDeleteAssignment(post)} className="text-red-600">
                                                    <Trash2 className="w-4 h-4 mr-2" /> Delete
                                                </DropdownMenuItem>
                                            </>
                                        )}

                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>

                            {editingPostId === post.id ? (
                                <div className="space-y-3">
                                    <Textarea
                                        value={editText}
                                        onChange={(e) => setEditText(e.target.value)}
                                        className="min-h-[100px]"
                                    />
                                    <div className="flex justify-end gap-2">
                                        <Button variant="outline" size="sm" onClick={() => setEditingPostId(null)}>Cancel</Button>
                                        <Button size="sm" onClick={() => saveEdit(post)}>Save</Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-gray-700 text-sm mb-4 whitespace-pre-wrap">
                                    {isAssignmentLike(post.type) ? (
                                        // Assignment simplified view
                                        <div className="flex flex-col gap-1">
                                            <span>{post.title}</span>
                                            <span className="text-xs text-gray-500">Due: {new Date(post.dueDate).toLocaleDateString()}</span>
                                        </div>
                                    ) : post.content}
                                </div>
                            )}

                            {/* Announcement attachments */}
                            {!isAssignmentLike(post.type) && Array.isArray(post.attachments) && post.attachments.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {post.attachments.map((att) => (
                                        <a
                                            key={att.id}
                                            href={att.file_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors max-w-[240px]"
                                            title={att.original_name}
                                        >
                                            <div className="w-8 h-8 bg-white rounded border flex items-center justify-center text-indigo-600 shrink-0">
                                                <Paperclip className="w-4 h-4" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-xs font-medium text-gray-800 truncate">{att.original_name || "Attachment"}</div>
                                                <div className="text-[10px] text-gray-400">
                                                    {att.size ? `${(att.size / 1024).toFixed(0)} KB` : "Download"}
                                                </div>
                                            </div>
                                        </a>
                                    ))}
                                </div>
                            )}

                            {/* Attachments Placeholder */}
                            {isAssignmentLike(post.type) && (
                                <>
                                    {/* PREVIOUS CODE (Commented out): 
                                    <div className="border border-gray-200 rounded-lg p-3 flex items-center gap-3 bg-gray-50 mb-4">
                                        <div className="w-10 h-10 bg-white rounded border flex items-center justify-center text-indigo-600 font-bold text-xs uppercase shadow-sm">
                                            <StickyNote className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-sm font-medium text-indigo-600">{post.displayType || 'Assignment'}</div>
                                            <div className="text-xs text-gray-600">{post.title}</div>
                                        </div>
                                        <span className="text-sm font-medium text-indigo-600">Open</span>
                                    </div>
                                    */}

                                    {/* NEW CODE (FIX): Made the assignment card clickable and functional */}
                                    <Link 
                                        to={`/teacher/assignment/${post.id}?tab=questions`} 
                                        className="border border-gray-200 rounded-lg p-3 flex items-center gap-3 bg-gray-50 mb-4 cursor-pointer hover:bg-gray-100 transition-colors block"
                                        title="View Questions"
                                    >
                                        <div className="w-10 h-10 bg-white rounded border flex items-center justify-center text-indigo-600 font-bold text-xs uppercase shadow-sm">
                                            <StickyNote className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-sm font-medium text-indigo-600">{post.displayType || 'Assignment'}</div>
                                            <div className="text-xs text-gray-600">{post.title}</div>
                                        </div>
                                        <span className="text-sm font-medium text-indigo-600 font-semibold underline decoration-2 underline-offset-4">View Questions</span>
                                    </Link>
                                </>
                            )}
                        </div>

                        {/* Comments Section */}
                        <div className="bg-gray-50 border-t rounded-b-lg">
                            <div className="px-6 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => toggleComments(post)}>
                                <Users className="w-4 h-4 text-gray-400" />
                                <span className="text-xs font-medium text-gray-500">
                                    {(post.commentsCount || 0)} class comments
                                </span>
                            </div>

                            {post.showComments && (
                                <div className="px-6 pb-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
                                    {Array.isArray(post.comments) && post.comments.map(comment => (
                                        <div key={comment.id} className="flex gap-3">
                                            <Avatar className="w-8 h-8">
                                                <AvatarImage src={comment.author?.avatar_url} />
                                                <AvatarFallback className="bg-indigo-100 text-indigo-700 text-xs font-bold">
                                                    {comment.author?.first_name?.charAt(0) || "U"}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold text-gray-900">{comment.author?.first_name} {comment.author?.last_name}</span>
                                                    <RoleBadge role={comment.author_role} />
                                                    <span className="text-[10px] text-gray-400">{new Date(comment.created_at).toLocaleDateString()}</span>
                                                </div>
                                                <p className="text-sm text-gray-600 mt-0.5">{comment.content || comment.text}</p>
                                            </div>
                                        </div>
                                    ))}
                                    <CommentInput post={post} onAddComment={handleAddComment} />
                                </div>
                            )}
                        </div>
                    </Card>
                ))}

                <div className="text-center py-8">
                    <p className="text-gray-400 text-sm">You've reached the end of the stream.</p>
                </div>
            </div>
        </div>
    );
}

function CommentInput({ post, onAddComment }) {
    const [text, setText] = useState("");

    const handleSend = () => {
        if (!text.trim()) return;
        onAddComment(post, text);
        setText("");
    };

    return (
        <div className="flex gap-3 pt-2">
            <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0" />
            <div className="relative flex-1">
                <Input
                    placeholder="Add a class comment..."
                    className="h-9 text-xs pr-8"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                />
                <Send
                    className="w-3 h-3 text-gray-400 absolute right-3 top-3 cursor-pointer hover:text-indigo-600"
                    onClick={handleSend}
                />
            </div>
        </div>
    );
}
