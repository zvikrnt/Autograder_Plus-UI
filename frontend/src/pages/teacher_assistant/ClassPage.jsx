import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { MoveLeft, Settings, Loader2, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

import TeacherAssistantLayout from "../../components/layout/TeacherAssistantLayout";
import { Button } from "../../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import StreamTab from "../../components/features/teacher/StreamTab";
import ClassworkTab from "../../components/features/teacher/ClassworkTab";
import PeopleTab from "../../components/features/teacher/PeopleTab";
import MarksTabV2 from "../../components/features/teacher/MarksTabV2";
import { classService } from "../../services/classService";

export default function ClassPage() {
    const { classId } = useParams();
    const [activeTab, setActiveTab] = useState("stream");
    const [classData, setClassData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchClassDetails = async () => {
            try {
                setLoading(true);
                const response = await classService.getClass(classId);
                setClassData(response.data);
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

    if (loading) {
        return (
            <TeacherAssistantLayout>
                <div className="flex h-[80vh] items-center justify-center">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
                </div>
            </TeacherAssistantLayout>
        );
    }

    if (error || !classData) {
        return (
            <TeacherAssistantLayout>
                <div className="flex flex-col h-[80vh] items-center justify-center text-red-500">
                    <AlertCircle className="w-12 h-12 mb-4" />
                    <h2 className="text-xl font-bold">Error</h2>
                    <p>{error || "Class not found"}</p>
                    <Button variant="outline" className="mt-4" asChild>
                        <Link to="/teacher-assistant/dashboard">Back to Dashboard</Link>
                    </Button>
                </div>
            </TeacherAssistantLayout>
        );
    }

    return (
        <TeacherAssistantLayout>
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6 max-w-5xl mx-auto px-4"
            >
                {/* Header */}
                <div className="flex flex-col gap-4 md:flex-row md:items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" asChild>
                            <Link to="/teacher-assistant/dashboard">
                                <MoveLeft className="w-5 h-5" />
                            </Link>
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">{classData.name}</h1>
                            <p className="text-gray-500 text-sm mt-1">{classData.section || "No Section"} • {classData.term || "Current Term"}</p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" className="gap-2">
                        <Settings className="w-4 h-4" />
                        Class Settings
                    </Button>
                </div>

                {/* Class Tabs */}
                <Tabs defaultValue="stream" className="w-full" onValueChange={setActiveTab}>
                    <TabsList className="bg-transparent p-0 border-b w-full justify-start h-auto rounded-none mb-6 overflow-x-auto">
                        {[
                            { key: "stream", label: "Stream" },
                            { key: "classwork", label: "Classwork" /* no count available */ },
                            { key: "people", label: "People" },
                            { key: "marks", label: "Marks" },
                        ].map((tab) => (
                            <TabsTrigger
                                key={tab.key}
                                value={tab.key}
                                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none px-4 pb-3 pt-2 text-sm font-medium text-gray-500 data-[state=active]:text-indigo-600 transition-colors capitalize whitespace-nowrap"
                            >
                                {tab.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    <TabsContent value="stream" className="mt-0">
                        <StreamTab />
                    </TabsContent>

                    <TabsContent value="classwork">
                        <ClassworkTab />
                    </TabsContent>

                    <TabsContent value="people">
                        <PeopleTab />
                    </TabsContent>

                    <TabsContent value="marks">
                        <MarksTabV2 />
                    </TabsContent>
                </Tabs>

            </motion.div>
        </TeacherAssistantLayout>
    );
}
