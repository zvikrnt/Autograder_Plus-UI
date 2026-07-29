import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Circle, Clock, MoreVertical, Filter, Loader2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import TeacherLayout from "../../components/layout/TeacherLayout";
import { assignmentService } from "../../services/assignmentService";

export default function AllAssignments() {
    const [activeTab, setActiveTab] = useState("all"); // 'all' | 'published' | 'draft'
    const [assignments, setAssignments] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAssignments = async () => {
            try {
                const response = await assignmentService.getAssignments();
                const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
                setAssignments(data);
            } catch (error) {
                console.error("Failed to fetch assignments:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchAssignments();
    }, []);

    // Helper for relative time
    const getRelativeTime = (dateString) => {
        if (!dateString) return null;
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = date - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return { text: `Ended ${Math.abs(diffDays)} days ago`, color: "text-gray-500 bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700" };
        if (diffDays === 0) return { text: "Due today", color: "text-amber-700 bg-amber-50 border-amber-200" };
        if (diffDays === 1) return { text: "Due tomorrow", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
        return { text: `Due in ${diffDays} days`, color: "text-indigo-700 bg-indigo-50 border-indigo-200" };
    };

    const filteredAssignments = assignments.filter(a => {
        const now = new Date();
        const dueDate = a.due_date ? new Date(a.due_date) : null;
        const isPublished = a.is_published; // Use is_published boolean

        if (activeTab === 'active') {
            // Active if published AND (no due date OR due date is in future)
            return isPublished && (!dueDate || dueDate >= now);
        }
        if (activeTab === 'draft') {
            return !isPublished; // Draft if NOT published
        }
        if (activeTab === 'past') {
            return isPublished && dueDate && dueDate < now;
        }
        return true;
    });

    // Counts for tabs
    const getCount = (tab) => {
        const now = new Date();
        return assignments.filter(a => {
            const dueDate = a.due_date ? new Date(a.due_date) : null;
            const isPublished = a.is_published;

            if (tab === 'active') return isPublished && (!dueDate || dueDate >= now);
            if (tab === 'draft') return !isPublished;
            if (tab === 'past') return isPublished && dueDate && dueDate < now;
            return false;
        }).length;
    };

    const counts = {
        active: getCount('active'),
        draft: getCount('draft'),
        past: getCount('past')
    };

    if (loading) {
        return (
            <TeacherLayout>
                <div className="flex justify-center items-center h-[50vh]">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
            </TeacherLayout>
        );
    }

    return (
        <TeacherLayout>
            <div className="max-w-5xl mx-auto space-y-8 pb-10">
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <h1 className="text-3xl font-bold tracking-tight text-gray-900">All Assignments</h1>
                        <p className="text-gray-500">Track and grade work across all your classes.</p>
                    </div>
                    {/* Previuse code : <Link to="/teacher/assignments/create">
                        <Button className="gap-2">
                            Create Assignment
                        </Button>
                    </Link> */}
                    <Link to="/teacher/assignment/create">
                        <Button className="gap-2">
                            Create Assignment
                        </Button>
                    </Link>
                </div>

                {/* Custom Tabs */}
                <div className="flex items-center space-x-1 rounded-xl bg-gray-100 dark:bg-gray-800 p-1 w-fit">
                    {['active', 'draft', 'past'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`
                                flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200
                                ${activeTab === tab
                                    ? "bg-white dark:bg-gray-800 text-indigo-600 shadow-sm ring-1 ring-black/5"
                                    : "text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200/50 dark:hover:bg-gray-700"
                                }
                            `}
                        >
                            <span className="capitalize">{tab}</span>
                            <span className={`
                                px-1.5 py-0.5 rounded-md text-[10px] font-bold
                                ${activeTab === tab ? "bg-indigo-50 text-indigo-700" : "bg-gray-200 dark:bg-gray-700 text-gray-600"}
                            `}>
                                {counts[tab] || 0}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Assignments List */}
                <div className="space-y-4">
                    {filteredAssignments.map((assignment) => {
                        const timeStatus = getRelativeTime(assignment.due_date);
                        const isDraft = !assignment.is_published;

                        return (
                            <div key={assignment.id} className="block group relative">
                                <Link to={isDraft ? `/teacher/assignment/${assignment.id}?edit=true` : `/teacher/assignment/${assignment.id}`} className="block">
                                    <Card className={`hover:shadow-md transition-shadow cursor-pointer border-l-4 ${isDraft ? "border-l-gray-300" : "border-l-transparent hover:border-l-indigo-500"}`}>
                                        <CardContent className="p-6">
                                            <div className="flex items-start justify-between">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="text-lg font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
                                                            {assignment.title}
                                                        </h3>
                                                        {isDraft && (
                                                            <Badge variant="outline" className="text-xs font-normal bg-gray-100 dark:bg-gray-800 text-gray-600 border-gray-300 dark:border-gray-600">
                                                                Draft
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-gray-500 font-medium">
                                                        {assignment.class_obj?.name || assignment.class_name || "Unknown Class"}
                                                    </p>

                                                    <div className="flex items-center gap-3 mt-3">
                                                        {timeStatus ? (
                                                            <span className={`text-xs px-2 py-0.5 rounded border font-medium flex items-center gap-1.5 ${timeStatus.color}`}>
                                                                <Clock className="w-3 h-3" />
                                                                {timeStatus.text}
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs text-gray-400 flex items-center gap-1.5">
                                                                <Clock className="w-3 h-3" />
                                                                No due date
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-8 mr-12">
                                                    {/* Stats - Hide for drafts? */}
                                                    {!isDraft && (
                                                        <>
                                                            <div className="text-center">
                                                                <p className="text-2xl font-light text-gray-900">--</p>
                                                                <p className="text-xs text-gray-500 uppercase tracking-wide">To Grade</p>
                                                            </div>
                                                            <div className="text-center border-l pl-8">
                                                                <p className="text-2xl font-light text-gray-900">--</p>
                                                                <p className="text-xs text-gray-500 uppercase tracking-wide">Graded</p>
                                                            </div>
                                                        </>
                                                    )}
                                                    <div className="text-center border-l pl-8 pr-4">
                                                        <p className="text-2xl font-light text-gray-900">{assignment.questions?.length || 0}</p>
                                                        <p className="text-xs text-gray-500 uppercase tracking-wide">Questions</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </Link>

                                {/* Action Dropdown - Positioned Absolute */}
                                <div className="absolute top-6 right-4">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-600 dark:hover:text-gray-400">
                                                <MoreVertical className="w-4 h-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem asChild>
                                                <Link to={`/teacher/assignment/create?edit=true&id=${assignment.id}`} className="w-full cursor-pointer">
                                                    Edit
                                                </Link>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem asChild>
                                                <Link to={`/teacher/assignment/create?copy_id=${assignment.id}`} className="w-full cursor-pointer">
                                                    Duplicate
                                                </Link>
                                            </DropdownMenuItem>
                                            {/* <DropdownMenuItem className="text-red-600">Delete</DropdownMenuItem> */}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        )
                    })}

                    {filteredAssignments.length === 0 && (
                        <div className="text-center py-12">
                            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                                <CheckCircle2 className="w-8 h-8" />
                            </div>
                            <h3 className="text-lg font-medium text-gray-900">All caught up!</h3>
                            <p className="text-gray-500">No work to review right now.</p>
                        </div>
                    )}
                </div>
            </div>
        </TeacherLayout>
    );
}
