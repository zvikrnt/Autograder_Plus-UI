import { useState, useEffect } from "react";
import ReactMarkdown from 'react-markdown';
import { Link, useNavigate } from "react-router-dom";
import {
    CheckCircle2,
    AlertCircle,
    ArrowRight,
    Loader2,
    Timer
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "../../ui/button";
import { Card, CardContent } from "../../ui/card";
import { Badge } from "../../ui/badge";

import { assignmentService } from "../../../services/assignmentService";
import { submissionService } from "../../../services/submissionService";

export default function StudentClassworkTab({ classId }) {
    const navigate = useNavigate();
    const [assignments, setAssignments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showStartConfirmation, setShowStartConfirmation] = useState(false);
    const [selectedAssignment, setSelectedAssignment] = useState(null);
    const [showFullDescription, setShowFullDescription] = useState(false);
    const [gradebookStatusMap, setGradebookStatusMap] = useState({});

    useEffect(() => {
        const fetchAssignments = async () => {
            try {
                setLoading(true);
                const [response, gradebookRes] = await Promise.all([
                    assignmentService.getClassAssignments(classId),
                    submissionService.getGradebookEntries()
                ]);
                const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
                const gradebookRows = Array.isArray(gradebookRes.data) ? gradebookRes.data : (gradebookRes.data?.results || []);
                const statusByAssignment = {};
                gradebookRows.forEach((entry) => {
                    if (entry?.content_item) {
                        statusByAssignment[String(entry.content_item)] = entry.status;
                    }
                });

                const hydrated = data.map((item) => {
                    const gradeStatus = statusByAssignment[String(item.id)];
                    return {
                        ...item,
                        is_graded: gradeStatus === "graded",
                        is_submitted: gradeStatus === "submitted" || gradeStatus === "graded",
                    };
                });

                console.log('StudentClassworkTab - Assignments fetched:', data.map(a => ({ id: a.id, title: a.title, type: a.type, mode: a.mode })));
                setGradebookStatusMap(statusByAssignment);
                setAssignments(hydrated);
            } catch (err) {
                console.error("Failed to load assignments:", err);
            } finally {
                setLoading(false);
            }
        };

        if (classId) fetchAssignments();
    }, [classId]);

    const handleStartAssignment = (assignment, e) => {
        e.preventDefault(); // Prevent Link navigation
        setSelectedAssignment(assignment);
        setShowFullDescription(false);
        setShowStartConfirmation(true);
    };

    const handleConfirmStart = () => {
        if (selectedAssignment) {
            navigate(`/student/workspace/${selectedAssignment.id}`);
        }
        setShowStartConfirmation(false);
        setSelectedAssignment(null);
        setShowFullDescription(false);
    };

    const getExcerpt = (text, limit = 300) => {
        if (!text) return "";
        if (text.length <= limit) return text;
        return text.slice(0, limit).trim() + '...';
    };

    const getStatusBadge = (item) => {
        if (item.is_graded) return <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-green-200">Graded</Badge>;
        if (item.is_submitted) return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200">Submitted</Badge>;
        const isOverdue = new Date(item.due_date) < new Date();
        if (isOverdue) return <Badge variant="destructive">Missing</Badge>;
        return <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">Assigned</Badge>;
    };

    const getTypeBadge = (item) => {
        const displayType = item.type === 'quiz' ? 'Quiz' : item.mode === 'exam' ? 'Exam' : 'Assignment';
        const typeColors = {
            quiz: 'bg-purple-100 text-purple-700 border-purple-200',
            exam: 'bg-red-100 text-red-700 border-red-200',
            assignment: 'bg-blue-100 text-blue-700 border-blue-200'
        };
        const typeKey = item.type === 'quiz' ? 'quiz' : item.mode === 'exam' ? 'exam' : 'assignment';
        return <Badge className={`${typeColors[typeKey]} hover:opacity-90`}>{displayType}</Badge>;
    };

    if (loading) {
        return <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;
    }

    if (assignments.length === 0) {
        return (
            <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                No assignments posted yet.
            </div>
        );
    }

    // Group by Topic? For now, simple list.
    return (
        <div className="space-y-4">
            {assignments.map((assignment, idx) => (
                <motion.div
                    key={assignment.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                >
                    <Card className="hover:shadow-md transition-shadow group cursor-pointer border-l-4 border-l-transparent hover:border-l-indigo-600">
                        <div onClick={(e) => handleStartAssignment(assignment, e)} className="block">
                            <CardContent className="p-5 flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold shrink-0">
                                    {idx + 1}
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
                                            {assignment.title}
                                        </h3>
                                        {getTypeBadge(assignment)}
                                        {getStatusBadge(assignment)}
                                    </div>
                                    <div className="text-xs text-gray-500 flex gap-3 flex-wrap">
                                        {assignment.start_time && (
                                            <span>Starts: {new Date(assignment.start_time).toLocaleDateString()}</span>
                                        )}
                                        <span>Due: {new Date(assignment.due_date).toLocaleDateString()}</span>
                                        {assignment.duration_minutes && (
                                            <span>• {assignment.duration_minutes} min</span>
                                        )}
                                        <span>• {assignment.points_total || assignment.points} pts</span>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" className="text-gray-300 group-hover:text-indigo-600">
                                    <ArrowRight className="w-5 h-5" />
                                </Button>
                                {(gradebookStatusMap[String(assignment.id)] === "graded" || assignment.is_graded) && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="ml-2"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            navigate(`/student/assignment/${assignment.id}/report`);
                                        }}
                                    >
                                        View Report
                                    </Button>
                                )}
                            </CardContent>
                        </div>
                    </Card>
                </motion.div>
            ))}

            {/* Start Assignment Confirmation Modal */}
            <AnimatePresence>
                {showStartConfirmation && selectedAssignment && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[1px]"
                    >
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.8, opacity: 0 }}
                            className="bg-white p-8 rounded-2xl shadow-2xl text-center max-w-md w-full mx-4"
                        >
                            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Timer className="w-8 h-8 text-indigo-600" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">
                                {selectedAssignment.is_submitted ? 'View Submission?' : `Start ${selectedAssignment.type === 'quiz' ? 'Quiz' : selectedAssignment.mode === 'exam' ? 'Exam' : 'Assignment'}?`}
                            </h2>
                            <p className="text-gray-500 mb-2">
                                <strong>{selectedAssignment.title}</strong>
                            </p>

                            {selectedAssignment.description ? (
                                <div className="text-left text-sm text-gray-600 mb-4 max-h-40 overflow-hidden">
                                    <ReactMarkdown>
                                        {showFullDescription ? selectedAssignment.description : getExcerpt(selectedAssignment.description, 400)}
                                    </ReactMarkdown>
                                    {selectedAssignment.description.length > 400 && (
                                        <div className="mt-2 text-right">
                                            <button
                                                onClick={() => setShowFullDescription(s => !s)}
                                                className="text-indigo-600 text-sm font-medium"
                                            >
                                                {showFullDescription ? 'Show less' : 'Show more'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : null}
                            {selectedAssignment.start_time && new Date(selectedAssignment.start_time) > new Date() ? (
                                <p className="text-amber-600 mb-4 font-medium">
                                    This {selectedAssignment.type === 'quiz' ? 'quiz' : selectedAssignment.mode === 'exam' ? 'exam' : 'assignment'} starts at{' '}
                                    {new Date(selectedAssignment.start_time).toLocaleString()}
                                </p>
                            ) : (
                                <div className="text-left text-sm text-gray-600 mb-4 space-y-1">
                                    {selectedAssignment.duration_minutes && (
                                        <p>⏱ You have <strong>{selectedAssignment.duration_minutes} minutes</strong> to complete this {selectedAssignment.type === 'quiz' ? 'quiz' : selectedAssignment.mode === 'exam' ? 'exam' : 'assignment'}.</p>
                                    )}
                                    <p>
                                        Once you start, the timer will begin and you can only exit by submitting your solution. 
                                        Are you ready to begin?
                                    </p>
                                </div>
                            )}
                            <div className="flex gap-3">
                                <Button 
                                    variant="outline" 
                                    onClick={() => setShowStartConfirmation(false)}
                                    className="flex-1"
                                >
                                    Cancel
                                </Button>
                                <Button 
                                    onClick={handleConfirmStart}
                                    disabled={selectedAssignment.start_time && new Date(selectedAssignment.start_time) > new Date()}
                                    className={`flex-1 text-white ${selectedAssignment.is_submitted ? 'bg-green-600 hover:bg-green-700' : selectedAssignment.mode === 'exam' ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                                    {selectedAssignment.start_time && new Date(selectedAssignment.start_time) > new Date()
                                        ? `Starts ${new Date(selectedAssignment.start_time).toLocaleDateString()}`
                                        : selectedAssignment.is_submitted ? 'View Submission' : `Start ${selectedAssignment.type === 'quiz' ? 'Quiz' : selectedAssignment.mode === 'exam' ? 'Exam' : 'Assignment'}`
                                    }
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
