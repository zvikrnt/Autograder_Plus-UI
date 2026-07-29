import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { MoveLeft, Plus, Save, Loader2, AlertCircle, GripVertical, Upload } from "lucide-react";
import { motion as Motion } from "framer-motion";
import {
    DndContext,
    DragOverlay,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    useDroppable,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';

import TeacherLayout from "../../components/layout/TeacherLayout";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { MarkdownEditor } from "../../components/ui/markdown-editor";
import QuestionEditorDialog from "../../components/features/teacher/QuestionEditorDialog";
import McqEditorDialog from "../../components/features/teacher/McqEditorDialog";
import PracticeQuestionsPanel from "../../components/features/teacher/PracticeQuestionsPanel";
import { SortableQuestionItem } from "../../components/features/teacher/SortableQuestionItem";
import BulkQuestionImporter from "../../components/features/teacher/BulkQuestionImporter";

import { assignmentService } from "../../services/assignmentService";
import { classService } from "../../services/classService";

import { useAuth } from "../../contexts/AuthContext";
import { tokenManager } from "../../utils/tokenManager";

// Droppable Wrapper Component
function DroppableQuestionList({ children }) {
    const { setNodeRef, isOver } = useDroppable({
        id: 'question-list-droppable',
    });

    return (
        <div
            ref={setNodeRef}
            className={`space-y-3 min-h-[150px] p-4 rounded-lg border-2 border-dashed transition-colors ${isOver ? 'border-indigo-400 bg-indigo-50' : 'border-transparent hover:border-gray-200'
                }`}
        >
            {children}
        </div>
    );
}

function localDatetimeInput(isoString) {
    if (!isoString) return "";
    const d = new Date(isoString);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CreateAssignment() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [searchParams] = useSearchParams();
    const copyId = searchParams.get("copy_id");
    const editId = searchParams.get("id");
    const paramClassId = searchParams.get("class_id");
    const isEditMode = searchParams.get("edit") === "true";
    const initialType = searchParams.get("type") || "assignment";
    const initialMode = searchParams.get("mode") || "practice";

    // Form State
    const [itemType, setItemType] = useState(initialType);
    const [itemMode, setItemMode] = useState(initialMode);
    const [title, setTitle] = useState("");
    const [instructions, setInstructions] = useState("");
    const [selectedClassId, setSelectedClassId] = useState("");
    const [difficulty, setDifficulty] = useState("Medium");
    const [points, setPoints] = useState(100);
    const [dueDate, setDueDate] = useState("");
    const [startTime, setStartTime] = useState("");
    const [durationMinutes, setDurationMinutes] = useState("");
    const [originalPublished, setOriginalPublished] = useState(null);

    // Data State
    const [classes, setClasses] = useState([]);
    const [questions, setQuestions] = useState([]);

    // UI State
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isQuestionDialogOpen, setIsQuestionDialogOpen] = useState(false);
    const [isBulkImporterOpen, setIsBulkImporterOpen] = useState(false);
    const [questionBankRefreshKey, setQuestionBankRefreshKey] = useState(0);
    const [editingQuestion, setEditingQuestion] = useState(null);
    const [saveStatus, setSaveStatus] = useState("");
    const [activeId, setActiveId] = useState(null); // For drag overlay

    // DnD Sensors
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Auto-save Logic
    useEffect(() => {
        if (isEditMode) return;

        const timer = setTimeout(() => {
            if (title || instructions || questions.length > 0) {
                const draft = { itemType, itemMode, title, instructions, selectedClassId, difficulty, points, dueDate, startTime, durationMinutes, questions };
                const draftKey = `assignment_draft_${tokenManager.getUserFromToken()?.userId || 'guest'}`;
                localStorage.setItem(draftKey, JSON.stringify(draft));
                setSaveStatus("Saved to draft");
            }
        }, 1000);
        return () => clearTimeout(timer);
    }, [itemType, itemMode, title, instructions, selectedClassId, difficulty, points, dueDate, questions, isEditMode]);

    // Load Data
    useEffect(() => {
        const init = async () => {
            try {
                const response = await classService.getClasses();
                const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
                setClasses(data);

                if (isEditMode && editId) {
                    const assignRes = await assignmentService.getAssignment(editId);
                    const source = assignRes.data;

                    setItemType(source.type || "assignment");
                    setItemMode(source.mode || "practice");
                    setTitle(source.title);
                    setInstructions(source.description);
                    setDifficulty(source.difficulty || "Medium");
                    setPoints(source.points || source.points_total);
                    setDueDate(source.due_date ? localDatetimeInput(source.due_date) : "");
                    setStartTime(source.start_time ? localDatetimeInput(source.start_time) : "");
                    setDurationMinutes(source.duration_minutes || "");
                    setOriginalPublished(source.is_published);
                    if (source.class_id || source.module?.class_id) {
                        const cId = source.class_id || source.module?.class_obj?.id;
                        setSelectedClassId(cId ? cId.toString() : "");
                    }

                    const existingQuestions = source.questions.map(q => ({
                        ...q.question,
                        id: q.question.id,
                        testCases: q.question.test_cases?.map(tc => ({
                            input: tc.input,
                            output: tc.expected_output,
                            expected_output: tc.expected_output,
                            explanation: tc.explanation,
                            concept: tc.concept,
                            points: tc.points
                        })) || []
                    }));
                    setQuestions(existingQuestions);
                }
                else if (copyId) {
                    const assignRes = await assignmentService.getAssignment(copyId);
                    const source = assignRes.data;
                    setItemType(source.type || "assignment");
                    setItemMode(source.mode || "practice");
                    setTitle(`${source.title} (Copy)`);
                    setInstructions(source.description);
                    setDifficulty(source.questions?.[0]?.question?.difficulty || "Medium");
                    setPoints(source.points);

                    const existingQuestions = source.questions.map(q => ({
                        ...q.question,
                        id: `copy-${q.question.id}-${Date.now()}`,
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
                else {
                    const draftKey = `assignment_draft_${tokenManager.getUserFromToken()?.userId || 'guest'}`;
                    const saved = localStorage.getItem(draftKey);
                    let parsedData = null;
                    if (saved) {
                        parsedData = JSON.parse(saved);
                        setItemType(parsedData.itemType || initialType);
                        setItemMode(parsedData.itemMode || initialMode);
                        setTitle(parsedData.title || "");
                        setInstructions(parsedData.instructions || "");
                        setDifficulty(parsedData.difficulty || "Medium");
                        setPoints(parsedData.points || 100);
                        setDueDate(parsedData.dueDate || "");
                        setStartTime(parsedData.startTime || "");
                        setDurationMinutes(parsedData.durationMinutes || "");
                        setQuestions(parsedData.questions || []);
                        if (parsedData.selectedClassId) setSelectedClassId(parsedData.selectedClassId);
                    }
                    if (!selectedClassId && !parsedData?.selectedClassId) {
                        if (paramClassId) {
                            setSelectedClassId(paramClassId);
                        } else if (data.length > 0) {
                            setSelectedClassId(data[0].id.toString());
                        }
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

    // Drag & Drop Handlers
    const handleDragStart = (event) => {
        setActiveId(event.active.id);
    };

    const handleDragEnd = (event) => {
        const { active, over } = event;
        setActiveId(null);

        if (!over) return;

        // Sorting logic (drag within list)
        if (active.id !== over.id && !active.id.toString().startsWith('bank-')) {
            const oldIndex = questions.findIndex((q) => q.id === active.id);
            const newIndex = questions.findIndex((q) => q.id === over.id);

            if (oldIndex !== -1 && newIndex !== -1) {
                setQuestions((items) => arrayMove(items, oldIndex, newIndex));
            }
        }

        // Drag from Bank to List logic
        if (active.id.toString().startsWith('bank-')) {
            // Check if dropped over the list area OR strictly over an item in the list
            const isOverList = over.id === 'question-list-droppable';
            // Also allow if dropped over any existing sortable item
            const isOverItem = questions.some(q => q.id === over.id);

            if (isOverList || isOverItem) {
                const questionData = active.data.current?.question;
                if (questionData) {
                    handleAddFromBank(questionData);
                }
            }
        }
    };

    const handleAddFromBank = (question) => {
        const mappedTestCases = (question.test_cases || []).map(tc => ({
            input: tc.input || "",
            output: tc.expected_output || tc.output || "",
            expected_output: tc.expected_output || tc.output || "",
            explanation: tc.explanation || "",
            concept: tc.concept || "",
            points: tc.points || 10
        }));

        const parsedFunctionName = question.config?.entry_point || question.functionName || "solution";

        // Check if already added
        if (questions.some(q => q.id === question.id)) {
            if (!confirm(`Question "${question.title}" is already in the assignment. Add it again?`)) {
                return;
            }
            // Add as copy
            const newQ = {
                ...question,
                id: `copy-${question.id}-${Date.now()}`,
                functionName: parsedFunctionName,
                testCases: mappedTestCases
            };
            setQuestions([...questions, newQ]);
        } else {
            // Add directly
            setQuestions([...questions, {
                ...question,
                functionName: parsedFunctionName,
                testCases: mappedTestCases
            }]);
        }
    };

    const handleSave = async (isPublished = false) => {
        if (!selectedClassId || !title) {
            setError("Please select a class and enter a title.");
            return;
        }

        if (isPublished && (user?.role === 'ta' || user?.roles?.includes('ta'))) {
            alert("TAs cannot publish assignments. Saving as Draft.");
            isPublished = false;
        }

        setLoading(true);
        setError(null);

        try {
            const finalQuestionIds = [];

            for (const q of questions) {
                // Prepare Test Cases — different logic for MCQ vs coding
                let testCases;
                if (q.question_type === 'mcq') {
                    // For MCQ, store the correct option index as an integer.
                    // McqEditorDialog emits testCases: [{ correct_option: N }]
                    const correctIdx = q.correctOptionIndex ?? q.testCases?.[0]?.correct_option ?? 0;
                    testCases = [{ correct_option: correctIdx, points: 10 }];
                } else {
                    testCases = (q.testCases || []).filter(tc => tc.input || tc.output).map(tc => ({
                        input: tc.input || "",
                        expected_output: tc.expected_output || tc.output || "",
                        explanation: tc.explanation || "",
                        concept: tc.concept || "",
                        is_hidden: false,
                        points: tc.points || 10
                    }));
                }

                const questionPayload = {
                    title: q.title,
                    description: q.description,
                    difficulty: q.difficulty,
                    question_type: q.question_type || "coding",
                    test_cases: testCases,
                    time_limit: 1.0,
                    memory_limit: 128,
                    allowed_languages: ["python"],
                    starter_code: q.starterCode || "",
                    config: q.config || {
                        entry_point: q.functionName || "solution",
                        timeout: 2.0,
                        memory: 128
                    }
                };

                const isTemp = !q.id || q.id.toString().startsWith('temp-') || q.id.toString().startsWith('copy-') || q.id.toString().startsWith('bank-');
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
                    await assignmentService.updateQuestion(q.id, questionPayload);
                    finalQuestionIds.push(q.id);
                }
            }

            const payload = {
                class_obj_id: selectedClassId,
                title: title,
                description: instructions,
                question_ids: finalQuestionIds,
                points: points,
                type: itemType,
                mode: itemMode,
                due_date: dueDate ? new Date(dueDate).toISOString() : null,
                start_time: startTime ? new Date(startTime).toISOString() : null,
                duration_minutes: durationMinutes ? parseInt(durationMinutes) : null,
                is_published: isPublished || (isEditMode ? originalPublished ?? false : false)
            };

            if (isEditMode && editId) {
                await assignmentService.updateAssignment(editId, payload);
            } else {
                await assignmentService.createAssignment(payload);
            }

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
            <TeacherLayout>
                <div className="flex items-center justify-center h-screen">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                </div>
            </TeacherLayout>
        );
    }

    return (
        <TeacherLayout>
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                <Motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="h-[calc(100vh-64px)] overflow-hidden flex flex-col"
                >
                    {/* Header */}
                    <div className="flex-none px-6 py-4 border-b bg-white dark:bg-gray-800 flex items-center justify-between z-10">
                        <div className="flex items-center gap-4">
                            {/* Previuse code : <Button variant="ghost" size="icon" asChild>
                                <Link to="/teacher/dashboard">
                                    <MoveLeft className="w-5 h-5" />
                                </Link>
                            </Button> */}
                            <Button variant="ghost" size="icon" asChild>
                                <Link to={selectedClassId ? `/teacher/class/${selectedClassId}?tab=classwork` : "/teacher/dashboard"}>
                                    <MoveLeft className="w-5 h-5" />
                                </Link>
                            </Button>
                            <div>
                                <h1 className="text-xl font-bold text-gray-900 capitalize">
                                    {isEditMode ? `Edit ${itemType}` : `Create ${itemType === 'quiz' ? 'Quiz' : itemMode === 'exam' ? 'Exam' : 'Assignment'}`}
                                </h1>
                                <p className="text-gray-500 text-sm">
                                    {isEditMode ? `Modify existing ${itemType}` : `Draft a new ${itemType === 'quiz' ? 'quiz' : itemMode === 'exam' ? 'exam' : 'coding assignment'}`}
                                </p>
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
                                size="sm"
                            >
                                Save Draft
                            </Button>
                            <Button
                                onClick={() => handleSave(true)}
                                disabled={loading}
                                className={`gap-2 ${user?.role === 'ta' ? 'opacity-90' : ''}`}
                                size="sm"
                                title={user?.role === 'ta' ? "TAs will save as Draft" : "Publish Assignment"}
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Publish
                            </Button>
                        </div>
                    </div>

                    {/* Main Content Grid */}
                    <div className="flex-1 flex overflow-hidden">
                        {/* Left Sidebar: Question Bank */}
                        <div className="w-1/3 min-w-[350px] max-w-[450px] border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex flex-col">
                            <div className="flex-none px-4 pt-4">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="w-full gap-2 bg-white dark:bg-gray-800"
                                    onClick={() => setIsBulkImporterOpen(true)}
                                >
                                    <Upload className="w-4 h-4" />
                                    Import Questions
                                </Button>
                            </div>
                            <div className="flex-1 p-4 overflow-hidden">
                                <PracticeQuestionsPanel
                                    onAddQuestion={handleAddFromBank}
                                    questionType={itemType === 'quiz' ? 'mcq' : 'coding'}
                                    refreshKey={questionBankRefreshKey}
                                />
                            </div>
                        </div>

                        {/* Right Content: Assignment Form */}
                        <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-800">
                            <div className="max-w-4xl mx-auto p-8 pb-20">
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
                                            <CardTitle className="capitalize">{itemType} Details</CardTitle>
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
                                                    <Label htmlFor="title" className="capitalize">{itemType} Title</Label>
                                                    <Input
                                                        id="title"
                                                        placeholder={`e.g. ${itemMode === 'exam' ? 'Midterm Exam 1' : 'Dynamic Programming Basics'}`}
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
                                                {(itemMode === 'exam' || itemType === 'quiz') && (
                                                    <div className="space-y-2">
                                                        <Label>Start Time</Label>
                                                        <Input
                                                            type="datetime-local"
                                                            value={startTime}
                                                            onChange={(e) => setStartTime(e.target.value)}
                                                        />
                                                    </div>
                                                )}
                                                {(itemMode === 'exam' || itemType === 'quiz') && (
                                                    <div className="space-y-2">
                                                        <Label>Duration (minutes)</Label>
                                                        <Input
                                                            type="number"
                                                            min="1"
                                                            placeholder="e.g. 30"
                                                            value={durationMinutes}
                                                            onChange={(e) => setDurationMinutes(e.target.value)}
                                                        />
                                                    </div>
                                                )}
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="instructions">Instructions</Label>
                                                <MarkdownEditor
                                                    id="instructions"
                                                    placeholder="Enter detailed instructions (Markdown supported)..."
                                                    className="min-h-[150px]"
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
                                                <h2 className="text-lg font-semibold text-gray-900">Selected Problems</h2>
                                                <p className="text-sm text-gray-500">
                                                    Drag questions here from the bank or click 'Add Question' to create new.
                                                </p>
                                            </div>
                                            <Button variant="secondary" size="sm" className="gap-2" onClick={handleAddQuestion}>
                                                <Plus className="w-4 h-4" />
                                                Create New
                                            </Button>
                                        </div>

                                        <SortableContext
                                            items={questions.map(q => q.id)}
                                            strategy={verticalListSortingStrategy}
                                        >
                                            <DroppableQuestionList>
                                                {questions.length === 0 ? (
                                                    <div className="text-center py-12">
                                                        <p className="text-gray-500 mb-2">No questions selected.</p>
                                                        <p className="text-sm text-gray-400">
                                                            Drag questions from the left panel or create a new one.
                                                        </p>
                                                    </div>
                                                ) : (
                                                    questions.map((q) => (
                                                        <SortableQuestionItem
                                                            key={q.id}
                                                            question={q}
                                                            onEdit={handleEditQuestion}
                                                            onDelete={handleDeleteQuestion}
                                                        />
                                                    ))
                                                )}
                                            </DroppableQuestionList>
                                        </SortableContext>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </Motion.div>

                <DragOverlay>
                    {activeId ? (
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-xl border border-indigo-200 opacity-90 cursor-grabbing w-[300px]">
                            <div className="flex items-center gap-3">
                                <GripVertical className="w-5 h-5 text-gray-400" />
                                <span className="font-medium text-gray-900">Moving Question...</span>
                            </div>
                        </div>
                    ) : null}
                </DragOverlay>

                {itemType === 'quiz' ? (
                    <McqEditorDialog
                        open={isQuestionDialogOpen}
                        onOpenChange={setIsQuestionDialogOpen}
                        questionToEdit={editingQuestion}
                        onSave={handleSaveQuestion}
                    />
                ) : (
                    <QuestionEditorDialog
                        open={isQuestionDialogOpen}
                        onOpenChange={setIsQuestionDialogOpen}
                        questionToEdit={editingQuestion}
                        onSave={handleSaveQuestion}
                    />
                )}
                <BulkQuestionImporter
                    open={isBulkImporterOpen}
                    onOpenChange={setIsBulkImporterOpen}
                    onSuccess={() => setQuestionBankRefreshKey((key) => key + 1)}
                />
            </DndContext>
        </TeacherLayout>
    );
}
