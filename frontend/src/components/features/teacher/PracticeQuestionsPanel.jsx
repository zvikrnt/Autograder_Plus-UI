import React, { useState, useEffect, useCallback } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Search, Filter, GripVertical, Plus } from 'lucide-react';
import { Input } from '../../ui/input';
import { Button } from '../../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Badge } from '../../ui/badge';
import { practiceService } from '../../../services/practiceService';

function DraggableQuestion({ question, onAdd }) {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id: `bank-${question.id}`,
        data: {
            type: 'question',
            question: question,
        },
    });

    const style = transform
        ? {
            transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        }
        : undefined;

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm mb-3 cursor-move hover:border-indigo-300 hover:shadow-md transition-all group"
        >
            <div className="flex items-start gap-3">
                <GripVertical className="w-5 h-5 text-gray-400 mt-1 flex-shrink-0 group-hover:text-indigo-500" />
                <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm text-gray-900 line-clamp-1">{question.title}</h4>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{question.description}</p>
                    <div className="flex items-center gap-2 mt-2">
                        <Badge
                            variant="secondary"
                            className={`text-[10px] px-1.5 py-0 ${question.difficulty === 'Easy'
                                ? 'bg-green-50 text-green-700'
                                : question.difficulty === 'Medium'
                                    ? 'bg-yellow-50 text-yellow-700'
                                    : 'bg-red-50 text-red-700'
                                }`}
                        >
                            {question.difficulty}
                        </Badge>
                        <span className="text-[10px] text-gray-400">{question.category}</span>
                    </div>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 -mr-1 -mt-1 text-gray-400 hover:text-indigo-600"
                    onClick={(e) => {
                        e.stopPropagation(); // Prevent drag start
                        onAdd(question);
                    }}
                    title="Add to assignment"
                >
                    <Plus className="w-4 h-4" />
                </Button>
            </div>
        </div>
    );
}

export default function PracticeQuestionsPanel({ onAddQuestion, questionType, refreshKey = 0 }) {
    const [questions, setQuestions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [difficultyFilter, setDifficultyFilter] = useState('all');
    const [categoryFilter, setCategoryFilter] = useState('all');

    const loadQuestions = useCallback(async () => {
        try {
            setLoading(true);
            const res = await practiceService.getPracticeLibrary();
            const rawData = Array.isArray(res.data) ? res.data : res.data.results || [];
            // Extract the actual question objects from the library entries
            const extractedQuestions = rawData.map(item => item.question).filter(Boolean);
            console.log("Extracted Questions:", extractedQuestions);
            console.log("Expected questionType:", questionType);

            // Filter by question_type if provided
            const typeFiltered = questionType
                ? extractedQuestions.filter(q => q.question_type === questionType)
                : extractedQuestions;

            console.log("Type Filtered Questions:", typeFiltered);

            setQuestions(typeFiltered);
        } catch (err) {
            console.error('Failed to load practice questions:', err);
        } finally {
            setLoading(false);
        }
    }, [questionType]);

    const categories = [...new Set(questions.map((q) => q.category).filter(Boolean))];

    const filteredQuestions = questions.filter((q) => {
        const matchesSearch =
            q.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            q.description.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesDifficulty =
            difficultyFilter === 'all' || q.difficulty.toLowerCase() === difficultyFilter.toLowerCase();
        const matchesCategory = categoryFilter === 'all' || q.category === categoryFilter;

        return matchesSearch && matchesDifficulty && matchesCategory;
    });

    useEffect(() => {
        loadQuestions();
    }, [loadQuestions, refreshKey]);

    return (
        <div className="flex flex-col h-full bg-gray-50/50 rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-white">
                <h3 className="font-semibold text-gray-900 mb-1">Question Bank</h3>
                <p className="text-xs text-gray-500 mb-3">Drag questions to add them to the assignment</p>

                <div className="space-y-3">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <Input
                            placeholder="Search..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-8 h-8 text-sm"
                        />
                    </div>
                    <div className="flex gap-2">
                        <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
                            <SelectTrigger className="h-7 text-xs flex-1">
                                <SelectValue placeholder="Diff" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Levels</SelectItem>
                                <SelectItem value="easy">Easy</SelectItem>
                                <SelectItem value="medium">Medium</SelectItem>
                                <SelectItem value="hard">Hard</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                            <SelectTrigger className="h-7 text-xs flex-1">
                                <SelectValue placeholder="Cat" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Cats</SelectItem>
                                {categories.map((cat) => (
                                    <SelectItem key={cat} value={cat}>
                                        {cat}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
                {loading ? (
                    <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                    </div>
                ) : filteredQuestions.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 text-sm">
                        No questions found
                    </div>
                ) : (
                    filteredQuestions.map((q) => (
                        <DraggableQuestion key={q.id} question={q} onAdd={onAddQuestion} />
                    ))
                )}
            </div>
        </div>
    );
}
