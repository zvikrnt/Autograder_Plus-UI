import { useEffect, useState } from "react";
import { MoreVertical, Users, Loader2, AlertCircle, Pencil, Trash2, Archive, ArchiveRestore } from "lucide-react";
import { Link } from "react-router-dom";
import { motion as Motion } from "framer-motion";

import TeacherLayout from "../../components/layout/TeacherLayout";
import { classService } from "../../services/classService";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "../../components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../../components/ui/dialog";
import CreateClassDialog from "../../components/features/teacher/CreateClassDialog";
import EditClassDialog from "../../components/features/teacher/EditClassDialog";
import ClassCard from "../../components/features/teacher/ClassCard";

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

export default function TeacherDashboard() {
    const [classes, setClasses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [classToEdit, setClassToEdit] = useState(null);
    const [classToDelete, setClassToDelete] = useState(null);
    const [classToArchive, setClassToArchive] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isArchiving, setIsArchiving] = useState(false);

    const fetchClasses = async () => {
        try {
            setLoading(true);
            const response = await classService.getClasses();
            if (response.success && response.data) {
                const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
                setClasses(data);
            } else {
                setClasses([]);
                if (!response.success) setError("Failed to load classes.");
            }
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
        setClasses(prev => [newClass, ...prev]);
    };

    const handleClassUpdated = (updatedClass) => {
        setClasses(prev => prev.map(c => c.id === updatedClass.id ? { ...c, ...updatedClass } : c));
        setClassToEdit(null);
    };

    const handleDeleteClick = (cl) => {
        setClassToDelete(cl);
    };

    const handleArchiveClick = (cl) => {
        setClassToArchive(cl);
    };

    const confirmDelete = async () => {
        if (!classToDelete) return;

        setIsDeleting(true);
        try {
            await classService.deleteClass(classToDelete.id);
            setClasses(prev => prev.filter(c => c.id !== classToDelete.id));
            setClassToDelete(null);
        } catch (err) {
            console.error("Failed to delete class:", err);
            // Optionally set global error or toast here
        } finally {
            setIsDeleting(false);
        }
    };

    const confirmArchive = async () => {
        if (!classToArchive) return;

        setIsArchiving(true);
        try {
            await classService.archiveClass(classToArchive.id);
            // If we are showing "active" classes, archiving it should remove it from the list
            // If unarchiving, it might stay or move depending on the view. 
            // For now assuming dashboard shows active classes, so removing it is correct behavior for archive.
            // But if it was unarchive action (which is rare here but possible if we reusing this), logic might differ.
            // Since dashboard usually filters archived=false, we remove it.
            setClasses(prev => prev.filter(c => c.id !== classToArchive.id));
            setClassToArchive(null);
        } catch (err) {
            console.error("Failed to archive class:", err);
        } finally {
            setIsArchiving(false);
        }
    };

    return (
        <TeacherLayout>
            <Motion.div
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
            </Motion.div>

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
                <Motion.div
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                >
                    {classes.map((cl) => (
                        <ClassCard
                            key={cl.id}
                            cl={cl}
                            onEdit={() => setClassToEdit(cl)}
                            onDelete={() => handleDeleteClick(cl)}
                            onArchive={() => handleArchiveClick(cl)}
                        />
                    ))}
                </Motion.div>
            )}

            {/* Edit Dialog */}
            <EditClassDialog
                classData={classToEdit}
                open={!!classToEdit}
                onOpenChange={(open) => !open && setClassToEdit(null)}
                onClassUpdated={handleClassUpdated}
            />

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!classToDelete} onOpenChange={(open) => !open && setClassToDelete(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Class</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete <strong>{classToDelete?.name}</strong>?
                            This action cannot be undone and will remove all assignments and student data associated with this class.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setClassToDelete(null)} disabled={isDeleting}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={confirmDelete} disabled={isDeleting}>
                            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                            Delete Class
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Archive Confirmation Dialog */}
            <Dialog open={!!classToArchive} onOpenChange={(open) => !open && setClassToArchive(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Archive Class</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to archive <strong>{classToArchive?.name}</strong>?
                            Archived classes will still be accessible but won&apos;t appear on your main dashboard.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setClassToArchive(null)} disabled={isArchiving}>
                            Cancel
                        </Button>
                        <Button onClick={confirmArchive} disabled={isArchiving}>
                            {isArchiving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Archive className="w-4 h-4 mr-2" />}
                            Archive Class
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </TeacherLayout>
    );
}
