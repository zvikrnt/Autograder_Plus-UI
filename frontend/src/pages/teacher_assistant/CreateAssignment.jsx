import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MoveLeft, Plus, Save, Trash2, GripVertical, Pencil, Loader2, AlertCircle } from "lucide-react";
import { motion, Reorder } from "framer-motion";

import TeacherAssistantLayout from "../../components/layout/TeacherAssistantLayout";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import QuestionEditorDialog from "../../components/features/teacher/QuestionEditorDialog";

import { assignmentService } from "../../services/assignmentService";
import { classService } from "../../services/classService";
import { tokenManager } from "../../utils/tokenManager";

import { useSearchParams } from "react-router-dom";

export default function CreateAssignment() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const copyId = searchParams.get("copy_id");
    const editId = searchParams.get("id");
    const isEditMode = searchParams.get("edit") === "true";

    // Form State
    const [title, setTitle] = useState("");
    const [instructions, setInstructions] = useState("");
    const [selectedClassId, setSelectedClassId] = useState("");
    const [difficulty, setDifficulty] = useState("Medium");
    const [points, setPoints] = useState(100);
    const [dueDate, setDueDate] = useState("");

    // Data State
    const [classes, setClasses] = useState([]);
    const [questions, setQuestions] = useState([]);

    // UI State
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isQuestionDialogOpen, setIsQuestionDialogOpen] = useState(false);
    const [editingQuestion, setEditingQuestion] = useState(null);
    const [saveStatus, setSaveStatus] = useState(""); // "Saved" | "Saving..."

    // 1. Auto-save is disabled in Edit Mode to avoid overwriting new drafts with old edits or vice versa? 
    // Actually, we might want to autosave edits too? For complexity, let's disable autosave for Edit Mode for now or treat it differently.
    // Or just let it save to a different key?

    useEffect(() => {
        if (isEditMode) return; // Don't auto-save to "draft" when editing an existing assignment

        // Debounce save logic
        const timer = setTimeout(() => {
            if (title || instructions || questions.length > 0) {
                const draft = { title, instructions, selectedClassId, difficulty, points, dueDate, questions };
                const draftKey = `assignment_draft_${tokenManager.getUserFromToken()?.userId || 'guest'}`;
                localStorage.setItem(draftKey, JSON.stringify(draft));
                setSaveStatus("Saved to draft");
            }
        }, 1000);
        return () => clearTimeout(timer);
    }, [title, instructions, selectedClassId, difficulty, points, dueDate, questions, isEditMode]);

    // 2. Load Classes & Handle Copy/Edit/Draft
    useEffect(() => {
        const init = async () => {
            try {
                // Fetch classes
                const response = await classService.getClasses();
                const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
                setClasses(data);

                // Priority 1: Edit Mode
                if (isEditMode && editId) {
                    const assignRes = await assignmentService.getAssignment(editId);
                    const source = assignRes.data;

                    setTitle(source.title);
                    setInstructions(source.description);
                    setDifficulty(source.difficulty || "Medium");
                    setPoints(source.points || source.points_total);
                    setDueDate(source.due_date ? new Date(source.due_date).toISOString().slice(0, 16) : "");
                    if (source.class_id || source.module?.class_id) {
                        // Find class
                        const cId = source.class_id || source.module?.class_obj?.id;
                        setSelectedClassId(cId ? cId.toString() : "");
                    }

                    // Existing questions
                    const existingQuestions = source.questions.map(q => ({
                        ...q.question,
                        id: q.question.id, // Keep ID for editing? Or treating as value object? 
                        // If we edit questions, do we update the original question?
                        // Ideally yes, or creating new versions.
                        // For simplicity in this MV, let's keep IDs. 
                        testCases: q.question.test_cases?.map(tc => ({
                            input: tc.input,
                            output: tc.expected_output, // Mapping back from backend format?
                            // Backend has expected_output, frontend seems to use 'output' in some places or 'expected_output'.
                            // Let's ensure consistency.
                            expected_output: tc.expected_output,
                            explanation: tc.explanation,
                            concept: tc.concept,
                            points: tc.points
                        })) || []
                    }));
                    setQuestions(existingQuestions);
                }
                // Priority 2: Duplicate logic
                else if (copyId) {
                    const assignRes = await assignmentService.getAssignment(copyId);
                    const source = assignRes.data;
                    setTitle(`${source.title} (Copy)`);
                    setInstructions(source.description);
                    setDifficulty(source.questions?.[0]?.question?.difficulty || "Medium");
                    setPoints(source.points);

                    // Transform existing questions to editor format
                    const existingQuestions = source.questions.map(q => ({
                        ...q.question,
                        id: `copy-${q.question.id}-${Date.now()}`, // New IDs for copy
                        testCases: q.question.test_cases?.map(tc => ({
                            input: tc.input,
                            expected_output: tc.expected_output,
                            explanation: tc.explanation,
                            concept: tc.concept,
                            points: tc.points
                        })) || []
                    }));
                    setQuestions(existingQuestions);

                    if (data.length > 0) setSelectedClassId(data[0].id.toString());
                    const draftKey = `assignment_draft_${tokenManager.getUserFromToken()?.userId || 'guest'}`;
                    localStorage.removeItem(draftKey);
                }
                // Priority 3: Restore Draft
                else {
                    const draftKey = `assignment_draft_${tokenManager.getUserFromToken()?.userId || 'guest'}`;
                    const saved = localStorage.getItem(draftKey);
                    if (saved) {
                        const parsed = JSON.parse(saved);
                        setTitle(parsed.title || "");
                        setInstructions(parsed.instructions || "");
                        setDifficulty(parsed.difficulty || "Medium");
                        setPoints(parsed.points || 100);
                        setDueDate(parsed.dueDate || "");
                        setQuestions(parsed.questions || []);
                        if (parsed.selectedClassId) setSelectedClassId(parsed.selectedClassId);
                    }
                    if (!selectedClassId && data.length > 0) {
                        setSelectedClassId(data[0].id.toString());
                    }
                }
            } catch (err) {
                console.error("Initialization failed", err);
                setError("Failed to load initial data.");
            } finally {
                setInitialLoading(false);
            }
        };
        init();
    }, [copyId]);

    const handleSave = async (isPublished = false) => {
        if (!selectedClassId || !title) {
            setError("Please select a class and enter a title.");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // 1. Process Questions (Create or Update)
            const finalQuestionIds = [];

            for (const q of questions) {
                // Prepare Test Cases for this question
                const testCases = (q.testCases || []).filter(tc => tc.input || tc.output).map(tc => ({
                    input: tc.input || "",
                    expected_output: tc.expected_output || tc.output || "", // Handle both keys
                    explanation: tc.explanation || "",
                    concept: tc.concept || "",
                    is_hidden: false,
                    points: tc.points || 10
                }));

                const questionPayload = {
                    title: q.title,
                    description: q.description,
                    difficulty: q.difficulty,
                    test_cases: testCases,
                    time_limit: 1.0,
                    memory_limit: 128,
                    allowed_languages: ["python"],
                    starter_code: q.starterCode || "",
                };

                // Check if it's a new question or existing one
                const isTemp = !q.id || q.id.toString().startsWith('temp-') || q.id.toString().startsWith('copy-');
                // Also check if it's a valid UUID. If not (e.g. timestamp from old drafts), treat as new.
                const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q.id);

                const isNew = isTemp || !isUUID;

                if (isNew) {
                    const qResponse = await assignmentService.createQuestion(questionPayload);
                    if (qResponse?.data?.id) {
                        finalQuestionIds.push(qResponse.data.id);
                    } else {
                        throw new Error("Failed to create question: No ID returned.");
                    }
                } else {
                    // Update existing question
                    await assignmentService.updateQuestion(q.id, questionPayload);
                    finalQuestionIds.push(q.id);
                }
            }

            // 2. Create or Update Assignment
            const payload = {
                class_obj_id: selectedClassId,
                title: title,
                description: instructions,
                question_ids: finalQuestionIds,
                points: points,
                due_date: dueDate ? new Date(dueDate).toISOString() : null,
                is_published: isPublished // Toggle status
            };

            if (isEditMode && editId) {
                await assignmentService.updateAssignment(editId, payload);
            } else {
                await assignmentService.createAssignment(payload);
            }

            // Clear draft after successful save
            const draftKey = `assignment_draft_${tokenManager.getUserFromToken()?.userId || 'guest'}`;
            localStorage.removeItem(draftKey);

            navigate(`/teacher/class/${selectedClassId}`);
        } catch (err) {
            console.error("Failed to save assignment:", err);
            const msg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
            setError(`Failed to ${isEditMode ? 'update' : 'create'} assignment. ` + msg);
        } finally {
            setLoading(false);
        }
    };

    const handleAddQuestion = () => {
        setEditingQuestion(null);
        setIsQuestionDialogOpen(true);
    };

    const handleEditQuestion = (question) => {
        setEditingQuestion(question);
        setIsQuestionDialogOpen(true);
    };

    const handleSaveQuestion = (questionData) => {
        if (editingQuestion) {
            setQuestions(questions.map(q => q.id === questionData.id ? questionData : q));
        } else {
            const newQuestion = { ...questionData, id: questionData.id || `temp-${Date.now()}` };
            setQuestions([...questions, newQuestion]);
        }
    };

    const handleDeleteQuestion = (id) => {
        setQuestions(questions.filter(q => q.id !== id));
    };

    if (initialLoading) {
        return (
            <TeacherAssistantLayout>
                <div className="flex items-center justify-center h-screen">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                </div>
            </TeacherAssistantLayout>
        );
    }

    return (
        <TeacherAssistantLayout>
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-4xl mx-auto pb-20"
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" asChild>
                            <Link to="/teacher/dashboard">
                                <MoveLeft className="w-5 h-5" />
                            </Link>
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Create Assignment</h1>
                            <p className="text-gray-500 text-sm">Draft a new coding assignment for your class</p>
                        </div>
                    </div>
                    <div className="flex gap-2 items-center">
                        {saveStatus && (
                            <span className="text-xs text-gray-400 mr-2 transition-opacity duration-300">
                                {saveStatus}
                            </span>
                        )}
                        <Button
                            variant="outline"
                            onClick={() => handleSave(false)}
                            disabled={loading}
                        >
                            Save Draft
                        </Button>
                        <Button
                            onClick={() => handleSave(true)}
                            disabled={loading}
                            className="gap-2 min-w-[120px]"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Publish Assignment
                        </Button>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6 flex items-center gap-3 border border-red-200">
                        <AlertCircle className="w-5 h-5" />
                        {error}
                    </div>
                )}

                <div className="space-y-8">
                    {/* Basic Info */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Assignment Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label>Select Class</Label>
                                    <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select a class" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {classes.map(c => (
                                                <SelectItem key={c.id} value={c.id.toString()}>{c.name} ({c.section})</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="title">Assignment Title</Label>
                                    <Input
                                        id="title"
                                        placeholder="e.g. Dynamic Programming Basics"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="space-y-2">
                                    <Label>Difficulty</Label>
                                    <Select value={difficulty} onValueChange={setDifficulty}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Easy">Easy</SelectItem>
                                            <SelectItem value="Medium">Medium</SelectItem>
                                            <SelectItem value="Hard">Hard</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Total Points</Label>
                                    <Input
                                        type="number"
                                        value={points}
                                        onChange={(e) => setPoints(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Due Date</Label>
                                    <Input
                                        type="datetime-local"
                                        value={dueDate}
                                        onChange={(e) => setDueDate(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="instructions">Instructions</Label>
                                <Textarea
                                    id="instructions"
                                    placeholder="Enter detailed instructions (Markdown supported)..."
                                    className="min-h-[150px] font-mono text-sm"
                                    value={instructions}
                                    onChange={(e) => setInstructions(e.target.value)}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Questions Section */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">Coding Problems</h2>
                                <p className="text-sm text-gray-500">Add at least one problem to this assignment.</p>
                            </div>
                            <Button variant="secondary" size="sm" className="gap-2" onClick={handleAddQuestion}>
                                <Plus className="w-4 h-4" />
                                Add Question
                            </Button>
                        </div>

                        {questions.length === 0 ? (
                            <div className="text-center py-12 bg-gray-50 dark:bg-gray-900 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-indigo-300 transition-colors">
                                <p className="text-gray-500 mb-2">No questions added yet.</p>
                                <Button variant="link" onClick={handleAddQuestion} className="text-indigo-600">
                                    Add your first question
                                </Button>
                            </div>
                        ) : (
                            <Reorder.Group axis="y" values={questions} onReorder={setQuestions} className="space-y-3">
                                {questions.map((q) => (
                                    <Reorder.Item key={q.id} value={q}>
                                        <div className="bg-white dark:bg-gray-800 border rounded-lg p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow cursor-move group">
                                            <GripVertical className="w-5 h-5 text-gray-400 group-hover:text-gray-600" />
                                            <div className="flex-1">
                                                <h3 className="font-medium text-gray-900">{q.title}</h3>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${q.difficulty === "Easy" ? "bg-green-100 text-green-700" :
                                                        q.difficulty === "Medium" ? "bg-yellow-100 text-yellow-700" :
                                                            "bg-red-100 text-red-700"
                                                        }`}>
                                                        {q.difficulty}
                                                    </span>
                                                    <span className="text-xs text-gray-400">• {q.testCases?.length || 0} Test Cases</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Button variant="ghost" size="sm" onClick={() => handleEditQuestion(q)}>
                                                    <Pencil className="w-4 h-4 mr-1" /> Edit
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-gray-400 hover:text-red-600 hover:bg-red-50"
                                                    onClick={() => handleDeleteQuestion(q.id)}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </Reorder.Item>
                                ))}
                            </Reorder.Group>
                        )}
                    </div>
                </div>
            </motion.div>

            <QuestionEditorDialog
                open={isQuestionDialogOpen}
                onOpenChange={setIsQuestionDialogOpen}
                questionToEdit={editingQuestion}
                onSave={handleSaveQuestion}
            />
        </TeacherAssistantLayout>
    );
}
