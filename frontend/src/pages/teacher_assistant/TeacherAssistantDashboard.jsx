import { useEffect, useState } from "react";
import { MoreVertical, Users, Loader2, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

import TeacherAssistantLayout from "../../components/layout/TeacherAssistantLayout";
import { classService } from "../../services/classService";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "../../components/ui/card";
import CreateClassDialog from "../../components/features/teacher/CreateClassDialog";

// Motion Variants
const containerVariants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1
        }
    }
};

const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
};

const ClassCard = ({ cl }) => {
    // Unique color accent based on class ID
    const colors = [
        "bg-indigo-600",
        "bg-emerald-600",
        "bg-rose-600",
        "bg-amber-600",
        "bg-cyan-600",
        "bg-violet-600"
    ];
    const accentColor = colors[(cl.id || 0) % colors.length];

    return (
        <motion.div variants={itemVariants} className="h-full">
            <Link to={`/teacher/class/${cl.id}`} className="block h-full group">
                <Card className="h-full flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700 transition-all duration-300 hover:shadow-xl hover:border-gray-300 hover:-translate-y-1">
                    <div className="flex h-full">
                        {/* Colored Side Accent */}
                        <div className={`w-1.5 ${accentColor} group-hover:w-3 transition-all duration-300`} />

                        <div className="flex-1 flex flex-col">
                            <CardContent className="p-6 flex-1">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">{cl.section || "TERM 1"}</p>
                                        <h3 className="text-xl font-bold text-gray-900 leading-tight group-hover:text-indigo-600 transition-colors">
                                            {cl.name}
                                        </h3>
                                    </div>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <MoreVertical className="w-4 h-4" />
                                    </Button>
                                </div>

                                <div className="space-y-3 mt-6">
                                    <div className="flex items-center text-sm text-gray-600">
                                        <div className="bg-gray-100 p-1.5 rounded-md mr-3">
                                            <Users className="w-4 h-4 text-gray-500" />
                                        </div>
                                        <span className="font-medium">{cl.student_count || 0}</span>
                                        <span className="text-gray-400 ml-1">Students enrolled</span>
                                    </div>

                                    <div className="flex items-center text-sm text-gray-600">
                                        <div className="bg-gray-100 p-1.5 rounded-md mr-3">
                                            <Loader2 className="w-4 h-4 text-gray-500" />
                                        </div>
                                        <span className="font-medium">{cl.assignment_count || 0}</span>
                                        <span className="text-gray-400 ml-1">Active assignments</span>
                                    </div>
                                </div>
                            </CardContent>

                            {/* Footer Area with Action or Status */}
                            <div className="p-4 bg-gray-50/50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                                {cl.has_pending_grading ? (
                                    <div className="flex items-center gap-2 text-xs font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-100">
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                        </span>
                                        Grading Pending
                                    </div>
                                ) : (
                                    <div className="text-xs text-gray-400 font-medium px-2">
                                        All caught up
                                    </div>
                                )}

                                <span className="text-xs font-bold text-indigo-600 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0 flex items-center">
                                    OPEN CLASS →
                                </span>
                            </div>
                        </div>
                    </div>
                </Card>
            </Link>
        </motion.div>
    );
};

export default function TeacherDashboard() {
    const [classes, setClasses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchClasses = async () => {
        try {
            setLoading(true);
            const response = await classService.getClasses();
            // Backend returns array directly or { results: ... } depending on pagination
            // Assuming DRF default: it might be array if no pagination, or .results
            const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
            setClasses(data);
            setError(null);
        } catch (err) {
            console.error("Failed to fetch classes:", err);
            setError("Failed to load classes. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchClasses();
    }, []);

    const handleClassCreated = (newClass) => {
        // Optimistic update or refetch
        setClasses(prev => [...prev, newClass]);
    };

    return (
        <TeacherAssistantLayout>
            <motion.div
                className="flex items-center justify-between mb-8"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
                    <p className="text-muted-foreground mt-1 text-lg">Overview of your active classes</p>
                </div>
                {/* Pass callback to update list after creation */}
                <CreateClassDialog onClassCreated={handleClassCreated} />
            </motion.div>

            {loading ? (
                <div className="flex justify-center items-center h-64">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                </div>
            ) : error ? (
                <div className="flex flex-col items-center justify-center h-64 text-red-500">
                    <AlertCircle className="w-10 h-10 mb-2" />
                    <p>{error}</p>
                    <Button variant="outline" onClick={fetchClasses} className="mt-4">Retry</Button>
                </div>
            ) : classes.length === 0 ? (
                <div className="text-center py-20 bg-gray-50/50 dark:bg-gray-900 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                    <h3 className="text-xl font-semibold text-gray-700">No classes yet</h3>
                    <p className="text-gray-500 mt-2">Create your first class to get started</p>
                </div>
            ) : (
                <motion.div
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                >
                    {classes.map((cl) => (
                        <ClassCard key={cl.id} cl={cl} />
                    ))}
                </motion.div>
            )}
        </TeacherAssistantLayout>
    );
}
