import { useState, useEffect } from "react";
import { useNavigate, useParams, Link, useSearchParams } from "react-router-dom";
import { MoveLeft, Settings, Loader2, AlertCircle, Archive, MoreVertical, Download } from "lucide-react";
import { toast } from "sonner";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from "../../components/ui/dropdown-menu";
import { motion as Motion } from "framer-motion";

import TeacherLayout from "../../components/layout/TeacherLayout";
import { Button } from "../../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import StreamTab from "../../components/features/teacher/StreamTab";
import ClassworkTab from "../../components/features/teacher/ClassworkTab";
import ResourcesTab from "../../components/features/teacher/ResourcesTab";
import DiscussionTab from "../../components/features/teacher/DiscussionTab";
import MarsLeaderboard from "../../components/features/analytics/MarsLeaderboard";
import PeopleTab from "../../components/features/teacher/PeopleTab";
// we now use only the improved marks view
import MarksTabV2 from "../../components/features/teacher/MarksTabV2";
import { classService } from "../../services/classService";

const VALID_CLASS_TABS = ["stream", "classwork", "people", "marks", "resources", "discussion", "leaderboard"];

export default function ClassPage() {
    const { classId } = useParams();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedTab = searchParams.get("tab");
    const initialTab = VALID_CLASS_TABS.includes(requestedTab) ? requestedTab : "stream";
    const [activeTab, setActiveTab] = useState(initialTab);
    const [classData, setClassData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchClassDetails = async () => {
            try {
                setLoading(true);
                const response = await classService.getClass(classId);
                if (response.success) {
                    setClassData(response.data);
                } else {
                    setError(response.error?.message || "Failed to load class details.");
                }
            } catch (err) {
                console.error("Failed to fetch class details", err);
                setError("Failed to load class details.");
            } finally {
                setLoading(false);
            }
        };

        if (classId) {
            fetchClassDetails();
        }
    }, [classId]);

    useEffect(() => {
        const nextTab = VALID_CLASS_TABS.includes(requestedTab) ? requestedTab : "stream";
        setActiveTab(nextTab);
    }, [requestedTab]);

    const handleTabChange = (value) => {
        setActiveTab(value);
        if (value === "stream") {
            setSearchParams({});
        } else {
            setSearchParams({ tab: value });
        }
    };

    const handleBack = () => {
        if (activeTab !== "stream") {
            setActiveTab("stream");
            setSearchParams({});
            return;
        }

        navigate(classData?.is_archived ? "/teacher/archived" : "/teacher/dashboard");
    };

    const handleExportGrades = async () => {
        try {
            toast.loading("Preparing gradebook CSV…", { id: "export-grades" });
            const res = await classService.exportGrades(classId);
            const blob = new Blob([res.data], { type: "text/csv" });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `gradebook_${(classData?.name || "class").replace(/\s+/g, "_").toLowerCase()}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            toast.success("Gradebook exported.", { id: "export-grades" });
        } catch (err) {
            console.error("Export failed", err);
            toast.error("Failed to export gradebook.", { id: "export-grades" });
        }
    };

    if (loading) {
        return (
            <TeacherLayout>
                <div className="flex h-[80vh] items-center justify-center">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
                </div>
            </TeacherLayout>
        );
    }

    if (error || !classData) {
        return (
            <TeacherLayout>
                <div className="flex flex-col h-[80vh] items-center justify-center text-red-500">
                    <AlertCircle className="w-12 h-12 mb-4" />
                    <h2 className="text-xl font-bold">Error</h2>
                    <p>{error || "Class not found"}</p>
                    <Button variant="outline" className="mt-4" asChild>
                        <Link to="/teacher/dashboard">Back to Dashboard</Link>
                    </Button>
                </div>
            </TeacherLayout>
        );
    }

    return (
        <TeacherLayout>
            <Motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6 max-w-5xl mx-auto px-4"
            >
                {/* Header */}
                <div className="flex flex-col gap-4">
                    {/* Archived Banner */}
                    {classData.is_archived && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-3 text-amber-800 mb-2">
                            <Archive className="w-5 h-5" />
                            <div className="flex-1">
                                <p className="font-medium text-sm">This class is archived</p>
                                <p className="text-xs text-amber-700 mt-0.5">
                                    You can restore it from the <Link to="/teacher/archived" className="underline hover:text-amber-900">Archived Classes</Link> page.
                                    Students can still view their work, but cannot make new submissions.
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <Button variant="ghost" size="icon" asChild>
                                <Link
                                    to={activeTab === "stream" ? (classData.is_archived ? "/teacher/archived" : "/teacher/dashboard") : `/teacher/class/${classId}`}
                                    onClick={(event) => {
                                        event.preventDefault();
                                        handleBack();
                                    }}
                                >
                                    <MoveLeft className="w-5 h-5" />
                                </Link>
                            </Button>
                            <div>
                                <div className="flex items-center gap-3">
                                    <h1 className="text-2xl font-bold text-gray-900">{classData.name}</h1>
                                    {classData.is_archived && (
                                        <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5 rounded border border-amber-200 uppercase tracking-wide">
                                            Archived
                                        </span>
                                    )}
                                </div>
                                <p className="text-gray-500 text-sm mt-1">{classData.section || "No Section"} • {classData.term || "Current Term"}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" className="gap-2" asChild>
                                <Link to={`/teacher/class/${classId}/settings`}>
                                    <Settings className="w-4 h-4" />
                                    Class Settings
                                </Link>
                            </Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="icon" title="More">
                                        <MoreVertical className="w-4 h-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={handleExportGrades} className="gap-2 cursor-pointer">
                                        <Download className="w-4 h-4" />
                                        Export grades (CSV)
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </div>

                {/* Class Tabs */}
                <Tabs value={activeTab} className="w-full" onValueChange={handleTabChange}>
                    <TabsList className="bg-transparent p-0 border-b w-full justify-start h-auto rounded-none mb-6 overflow-x-auto">
                        {[
                            { key: "stream", label: "Stream" },
                            { key: "classwork", label: "Classwork", count: classData.assignment_count },
                            { key: "people", label: "People", count: classData.student_count },
                            { key: "resources", label: "Resources" },
                            { key: "discussion", label: "Discussion" },
                            { key: "leaderboard", label: "Leaderboard" },
                            { key: "marks", label: "Marks" },
                        ].map((tab) => (
                            <TabsTrigger
                                key={tab.key}
                                value={tab.key}
                                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none px-4 pb-3 pt-2 text-sm font-medium text-gray-500 data-[state=active]:text-indigo-600 transition-colors capitalize whitespace-nowrap"
                            >
                                <>
                                    {tab.label}
                                    {tab.count !== undefined && (
                                        <span className="ml-1 inline-block text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 px-1.5 py-0.5 rounded-full">
                                            {tab.count}
                                        </span>
                                    )}
                                </>
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    <TabsContent value="stream" className="mt-0">
                        <StreamTab classId={classId} />
                    </TabsContent>

                    <TabsContent value="classwork">
                        <ClassworkTab classId={classId} />
                    </TabsContent>

                    <TabsContent value="people">
                        <PeopleTab classId={classId} />
                    </TabsContent>

                    <TabsContent value="resources">
                        <ResourcesTab classId={classId} canManage={true} />
                    </TabsContent>

                    <TabsContent value="discussion">
                        <DiscussionTab classId={classId} canManage={true} currentUserId={classData?.owner?.id} />
                    </TabsContent>

                    <TabsContent value="leaderboard">
                        <div className="max-w-2xl">
                            <MarsLeaderboard classId={classId} defaultScope="class" />
                        </div>
                    </TabsContent>

                    <TabsContent value="marks">
                        <MarksTabV2 classId={classId} />
                    </TabsContent>
                </Tabs>

            </Motion.div>
        </TeacherLayout>
    );
}
