import { useEffect, useState } from "react";
import { Loader2, AlertCircle, ArchiveRestore, Trash2, Archive } from "lucide-react";
import { motion } from "framer-motion";

import TeacherLayout from "../../components/layout/TeacherLayout";
import { classService } from "../../services/classService";
import { Button } from "../../components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../../components/ui/dialog";
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

export default function ArchivedClasses() {
    const [classes, setClasses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [classToRestore, setClassToRestore] = useState(null);
    const [classToDelete, setClassToDelete] = useState(null);
    const [isRestoring, setIsRestoring] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const fetchArchivedClasses = async () => {
        try {
            setLoading(true);
            const response = await classService.getArchivedClasses();
            if (response.success && response.data) {
                const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
                setClasses(data);
            } else {
                setClasses([]);
                if (!response.success) setError("Failed to load archived classes.");
            }
            setError(null);
        } catch (err) {
            console.error("Failed to fetch archived classes:", err);
            setError("Failed to load archived classes. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchArchivedClasses();
    }, []);

    const handleRestoreClick = (cl) => {
        setClassToRestore(cl);
    };

    const handleDeleteClick = (cl) => {
        setClassToDelete(cl);
    };

    const confirmRestore = async () => {
        if (!classToRestore) return;

        setIsRestoring(true);
        try {
            await classService.archiveClass(classToRestore.id); // Toggle back to unarchived
            setClasses(prev => prev.filter(c => c.id !== classToRestore.id));
            setClassToRestore(null);
        } catch (err) {
            console.error("Failed to restore class:", err);
        } finally {
            setIsRestoring(false);
        }
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
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <TeacherLayout>
            <motion.div
                className="flex items-center justify-between mb-8"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Archived Classes</h1>
                    <p className="text-muted-foreground mt-1 text-lg">Manage your archived classes. Restore them to make them active again.</p>
                </div>
            </motion.div>

            {loading ? (
                <div className="flex justify-center items-center h-64">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                </div>
            ) : error ? (
                <div className="flex flex-col items-center justify-center h-64 text-red-500">
                    <AlertCircle className="w-10 h-10 mb-2" />
                    <p>{error}</p>
                    <Button variant="outline" onClick={fetchArchivedClasses} className="mt-4">Retry</Button>
                </div>
            ) : classes.length === 0 ? (
                <div className="text-center py-20 bg-gray-50/50 dark:bg-gray-900 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                    <ArchiveRestore className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-700">No archived classes</h3>
                    <p className="text-gray-500 mt-2">Classes you archive will appear here.</p>
                </div>
            ) : (
                <motion.div
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                >
                    {classes.map((cl) => (
                        <ClassCard
                            key={cl.id}
                            cl={cl}
                            // No Edit on archived classes usually, but user didn't specify. 
                            // Usually you restore then edit. I will omit onEdit to disable editing in archive.
                            onDelete={() => handleDeleteClick(cl)}
                            onArchive={() => handleRestoreClick(cl)} // Reusing onArchive prop for restore action
                            showArchiveOption={true}
                        />
                    ))}
                </motion.div>
            )}

            {/* Restore Confirmation Dialog */}
            <Dialog open={!!classToRestore} onOpenChange={(open) => !open && setClassToRestore(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Restore Class</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to restore <strong>{classToRestore?.name}</strong>?
                            It will appear on your main dashboard again.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setClassToRestore(null)} disabled={isRestoring}>
                            Cancel
                        </Button>
                        <Button onClick={confirmRestore} disabled={isRestoring}>
                            {isRestoring ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ArchiveRestore className="w-4 h-4 mr-2" />}
                            Restore Class
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!classToDelete} onOpenChange={(open) => !open && setClassToDelete(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Class</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete <strong>{classToDelete?.name}</strong>?
                            This action cannot be undone and will permanently remove this class and all associated data.
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
        </TeacherLayout>
    );
}
