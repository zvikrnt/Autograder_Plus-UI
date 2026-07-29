import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Info, BookOpen, MessageSquare, LogOut } from "lucide-react";
import { motion } from "framer-motion";

import StudentLayout from "../../components/layout/StudentLayout";
import { Button } from "../../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";

// Reusing teacher components (Read-Only mode where applicable)
// Ideally we should make separate student-specific components, but for speed:
import StudentStreamTab from "../../components/features/student/StudentStreamTab";
import StudentClassworkTab from "../../components/features/student/StudentClassworkTab"; // We need to create this
import ResourcesTab from "../../components/features/teacher/ResourcesTab";
import DiscussionTab from "../../components/features/teacher/DiscussionTab";

import { classService } from "../../services/classService";

export default function StudentClassPage() {
    const { classId } = useParams();
    const navigate = useNavigate();
    const [classData, setClassData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [leaving, setLeaving] = useState(false);
    const [leaveError, setLeaveError] = useState(null);
    const [activeTab, setActiveTab] = useState("stream");

    useEffect(() => {
        const fetchClass = async () => {
            try {
                const response = await classService.getClass(classId);
                setClassData(response.data);
            } catch (err) {
                console.error("Failed to load class:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchClass();
    }, [classId]);

    const handleLeaveClass = async () => {
        if (!window.confirm("Are you sure you want to leave this class? You can rejoin with the class code.")) return;
        setLeaving(true);
        setLeaveError(null);
        try {
            const response = await classService.leaveClass(classId);
            if (response.success) {
                navigate("/student/dashboard");
                return;
            }
            setLeaveError(response.message || "Failed to leave class");
        } catch (err) {
            setLeaveError(err?.message || "Failed to leave class");
        }
        setLeaving(false);
    };

    if (loading) {
        return (
            <StudentLayout>
                <div className="flex justify-center py-20">Loading...</div>
            </StudentLayout>
        );
    }

    if (!classData) {
        return (
            <StudentLayout>
                <div className="text-center py-20 text-red-500">Class not found</div>
            </StudentLayout>
        );
    }

    return (
        <StudentLayout>
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-6xl mx-auto space-y-6"
            >
                {/* 1. Class Header (Student View) */}
                <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-indigo-600 to-violet-700 text-white min-h-[200px] flex flex-col justify-end p-8 shadow-lg">
                    <div className="absolute top-0 right-0 p-32 bg-white/5 dark:bg-gray-800/5 rounded-full blur-3xl" />
                    <div className="absolute bottom-0 left-0 p-24 bg-black/10 rounded-full blur-2xl" />

                    <div className="relative z-10">
                        <div className="flex items-start justify-between">
                            <div>
                                <h1 className="text-4xl font-bold tracking-tight mb-2">{classData.name}</h1>
                                <div className="flex items-center gap-3 text-white/90">
                                    <Badge variant="outline" className="text-white border-white/30 bg-white/10 dark:bg-gray-800/10">{classData.section}</Badge>
                                    <span className="text-sm font-medium opacity-80 flex items-center gap-1">
                                        <Info className="w-4 h-4" />
                                        {classData.class_code}
                                    </span>
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                {leaveError && (
                                    <span className="text-xs text-red-200 bg-red-500/20 px-3 py-1 rounded-md">
                                        {leaveError}
                                    </span>
                                )}
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    className="shadow-sm"
                                    onClick={handleLeaveClass}
                                    disabled={leaving}
                                >
                                    <LogOut className="w-4 h-4 mr-1.5" />
                                    {leaving ? "Leaving..." : "Leave Class"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. Tabs */}
                <Tabs defaultValue="stream" value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 mb-6">
                        <TabsList className="bg-transparent p-0 -mb-[1px] gap-8">
                            <TabsTrigger
                                value="stream"
                                className="data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 border-b-2 border-transparent px-1 pb-4 pt-2 rounded-none text-gray-500 font-medium"
                            >
                                Stream
                            </TabsTrigger>
                            <TabsTrigger
                                value="classwork"
                                className="data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 border-b-2 border-transparent px-1 pb-4 pt-2 rounded-none text-gray-500 font-medium"
                            >
                                Classwork
                            </TabsTrigger>
                            <TabsTrigger
                                value="resources"
                                className="data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 border-b-2 border-transparent px-1 pb-4 pt-2 rounded-none text-gray-500 font-medium"
                            >
                                Resources
                            </TabsTrigger>
                            <TabsTrigger
                                value="discussion"
                                className="data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 border-b-2 border-transparent px-1 pb-4 pt-2 rounded-none text-gray-500 font-medium"
                            >
                                Discussion
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="stream" className="mt-0">
                        <StudentStreamTab />
                    </TabsContent>

                    <TabsContent value="classwork">
                        <StudentClassworkTab classId={classId} />
                    </TabsContent>

                    <TabsContent value="resources">
                        <ResourcesTab classId={classId} canManage={false} />
                    </TabsContent>

                    <TabsContent value="discussion">
                        <DiscussionTab classId={classId} canManage={false} />
                    </TabsContent>
                </Tabs>
            </motion.div>
        </StudentLayout>
    );
}
