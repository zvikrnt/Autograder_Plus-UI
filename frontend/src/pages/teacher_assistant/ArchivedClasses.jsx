import { Archive, MoreVertical, SlidersHorizontal, Search, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";

import TeacherAssistantLayout from "../../components/layout/TeacherAssistantLayout";
import { classService } from "../../services/classService";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";

// Motion Variants
const containerVariants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.1 }
    }
};

const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 }
};

const ArchivedClassCard = ({ cl }) => (
    <motion.div variants={itemVariants}>
        <Card className="group h-full flex flex-col overflow-hidden border-gray-200 dark:border-gray-700 hover:border-gray-300 transition-all hover:shadow-md bg-gray-50/50 dark:bg-gray-900">
            {/* Grayscale Header */}
            <div className={`h-28 relative p-5 flex flex-col justify-between overflow-hidden`}>
                <div className={`absolute inset-0 ${cl.bgPattern} opacity-20 grepayscale filter grayscale group-hover:grayscale-0 transition-all duration-500`} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />

                <div className="relative z-10 flex justify-between items-start">
                    <Link to={`/teacher/class/${cl.id}`} className="hover:underline decoration-gray-400">
                        <h3 className="text-xl font-bold text-gray-700 leading-tight tracking-tight group-hover:text-gray-900 transition-colors">
                            {cl.name}
                        </h3>
                    </Link>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-700 hover:bg-white/50">
                                <MoreVertical className="w-4 h-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem className="gap-2">
                                <RotateCcw className="w-4 h-4" />
                                Restore Class
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                <div className="relative z-10 flex justify-between items-end">
                    <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-500">{cl.section}</span>
                        <span className="text-xs text-gray-400 mt-1">{cl.assignments} Assignments • {cl.students} Students</span>
                    </div>
                </div>
            </div>

            <CardContent className="p-0">
                    <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800">
                    <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 w-fit px-2 py-1 rounded-full border border-amber-100">
                        <Archive className="w-3 h-3" />
                        <span className="font-medium uppercase tracking-wide">Archived</span>
                    </div>
                    <p className="mt-3 text-xs text-gray-500 line-clamp-2 leading-relaxed">
                        This class is in read-only mode. Assignments and submissions can be viewed but not edited.
                    </p>
                </div>
            </CardContent>

            <CardFooter className="p-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 flex justify-end">
                <Button variant="outline" size="sm" className="w-full text-gray-600 border-gray-300 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-800 hover:text-indigo-600" asChild>
                    <Link to={`/teacher/class/${cl.id}`}>View Records</Link>
                </Button>
            </CardFooter>
        </Card>
    </motion.div>
);

export default function ArchivedClasses() {
    const [archivedClasses, setArchivedClasses] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadArchivedClasses = async () => {
            try {
                setLoading(true);
                // For now, we'll show an empty state since we don't have archived classes in the API
                // In the future, this would call: const response = await classService.getArchivedClasses();
                setArchivedClasses([]);
            } catch (error) {
                console.error('Failed to load archived classes:', error);
                setArchivedClasses([]);
            } finally {
                setLoading(false);
            }
        };

        loadArchivedClasses();
    }, []);

    return (
        <TeacherAssistantLayout>
            <motion.div
                className="max-w-7xl mx-auto"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
            >
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
                            <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                                <Archive className="w-6 h-6 text-gray-500" />
                            </div>
                            Archived Classes
                        </h1>
                        <p className="text-gray-500 mt-2">
                            Access past course materials and student records.
                        </p>
                    </div>

                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <div className="relative flex-1 md:w-64">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                            <Input
                                type="search"
                                placeholder="Search archives..."
                                className="pl-9 bg-white"
                            />
                        </div>
                        <Button variant="outline" size="icon">
                            <SlidersHorizontal className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Content Grid */}
                {archivedClasses.length === 0 ? (
                    <motion.div
                        className="flex flex-col items-center justify-center py-24 px-4 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-200 dark:border-gray-700"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2 }}
                    >
                        <div className="w-16 h-16 rounded-full bg-gray-50 dark:bg-gray-900 flex items-center justify-center mb-4">
                            <Archive className="w-8 h-8 text-gray-300" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">No Archived Classes</h3>
                        <p className="text-gray-500 text-center max-w-sm text-sm">
                            Classes you archive will appear here for safe keeping.
                        </p>
                    </motion.div>
                ) : (
                    <motion.div
                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                        variants={containerVariants}
                        initial="hidden"
                        animate="show"
                    >
                        {archivedClasses.map((cl) => (
                            <ArchivedClassCard key={cl.id} cl={cl} />
                        ))}
                    </motion.div>
                )}
            </motion.div>
        </TeacherAssistantLayout>
    );
}
