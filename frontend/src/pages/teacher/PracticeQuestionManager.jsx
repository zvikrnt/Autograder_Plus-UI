import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { 
  Plus, Search, Filter, MoreVertical, Edit, Trash2, 
  BookOpen, Users, Clock, Award, Loader2, AlertCircle 
} from "lucide-react";
import { motion } from "framer-motion";

import TeacherLayout from "../../components/layout/TeacherLayout";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "../../components/ui/dropdown-menu";

import { practiceService } from "../../services/practiceService";
import CreatePracticeQuestionDialog from "../../components/features/teacher/CreatePracticeQuestionDialog";
import PracticeLibraryDialog from "../../components/features/teacher/PracticeLibraryDialog";

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

const getDifficultyColor = (difficulty) => {
  switch (difficulty?.toLowerCase()) {
    case 'easy':
      return 'bg-green-100 text-green-700 border-green-200';
    case 'medium':
      return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    case 'hard':
      return 'bg-red-100 text-red-700 border-red-200';
    default:
      return 'bg-gray-100 dark:bg-gray-800 text-gray-700 border-gray-200 dark:border-gray-700';
  }
};

const PracticeQuestionCard = ({ question, onEdit, onDelete }) => {
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${question.title}"? This action cannot be undone.`)) {
      return;
    }

    setLoading(true);
    try {
      await practiceService.deletePracticeQuestion(question.id);
      onDelete(question.id);
    } catch (error) {
      console.error('Failed to delete practice question:', error);
      alert('Failed to delete practice question. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div variants={itemVariants}>
      <Card className="h-full hover:shadow-lg transition-all duration-300 border border-gray-200 dark:border-gray-700 hover:border-gray-300">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg font-semibold text-gray-900 truncate">
                {question.title}
              </CardTitle>
              <div className="flex items-center gap-2 mt-2">
                <Badge className={`text-xs font-medium ${getDifficultyColor(question.difficulty)}`}>
                  {question.difficulty}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {question.category}
                </Badge>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(question)}>
                  <Edit className="w-4 h-4 mr-2" />
                  Edit Question
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={handleDelete}
                  className="text-red-600 focus:text-red-600"
                  disabled={loading}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {loading ? 'Deleting...' : 'Delete Question'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-gray-600 mb-4 line-clamp-2">
            {question.description}
          </p>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2 text-gray-500">
              <Award className="w-4 h-4" />
              <span>{question.point_value} points</span>
            </div>
            <div className="flex items-center gap-2 text-gray-500">
              <BookOpen className="w-4 h-4" />
              <span>{question.test_cases?.length || 0} test cases</span>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>Created {new Date(question.created_at).toLocaleDateString()}</span>
              <span className={question.is_active ? 'text-green-600' : 'text-gray-400'}>
                {question.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default function PracticeQuestionManager() {
  const navigate = useNavigate();
  
  // Data State
  const [questions, setQuestions] = useState([]);
  const [filteredQuestions, setFilteredQuestions] = useState([]);
  
  // UI State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isLibraryDialogOpen, setIsLibraryDialogOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);

  // Derived data
  const categories = [...new Set(questions.map(q => q.category).filter(Boolean))];

  // Load practice questions
  const fetchQuestions = async () => {
    try {
      setLoading(true);
      const response = await practiceService.getPracticeQuestions();
      const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
      setQuestions(data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch practice questions:', err);
      setError('Failed to load practice questions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuestions();
  }, []);

  // Filter questions based on search and filters
  useEffect(() => {
    let filtered = questions;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(q => 
        q.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        q.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        q.category.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Difficulty filter
    if (difficultyFilter !== 'all') {
      filtered = filtered.filter(q => q.difficulty.toLowerCase() === difficultyFilter);
    }

    // Category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(q => q.category === categoryFilter);
    }

    setFilteredQuestions(filtered);
  }, [questions, searchTerm, difficultyFilter, categoryFilter]);

  const handleQuestionCreated = (newQuestion) => {
    setQuestions(prev => [newQuestion, ...prev]);
    setIsCreateDialogOpen(false);
  };

  const handleQuestionUpdated = (updatedQuestion) => {
    setQuestions(prev => prev.map(q => 
      q.id === updatedQuestion.id ? updatedQuestion : q
    ));
    setEditingQuestion(null);
    setIsCreateDialogOpen(false);
  };

  const handleQuestionDeleted = (questionId) => {
    setQuestions(prev => prev.filter(q => q.id !== questionId));
  };

  const handleEditQuestion = (question) => {
    setEditingQuestion(question);
    setIsCreateDialogOpen(true);
  };

  const handleLibraryQuestionAdded = (libraryQuestion) => {
    // Add the library question to our list
    setQuestions(prev => [libraryQuestion.question, ...prev]);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setDifficultyFilter('all');
    setCategoryFilter('all');
  };

  return (
    <TeacherLayout>
      <motion.div
        className="max-w-7xl mx-auto"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
              Practice Questions
            </h1>
            <p className="text-gray-500 mt-1 text-lg">
              Create and manage practice questions for your students
            </p>
          </div>
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              onClick={() => setIsLibraryDialogOpen(true)}
              className="gap-2"
            >
              <BookOpen className="w-4 h-4" />
              Browse Library
            </Button>
            <Button 
              onClick={() => setIsCreateDialogOpen(true)}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Create Question
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="Search questions by title, description, or category..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Difficulty" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Levels</SelectItem>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map(category => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(searchTerm || difficultyFilter !== 'all' || categoryFilter !== 'all') && (
                  <Button variant="outline" onClick={clearFilters} size="sm">
                    Clear Filters
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 text-red-500">
            <AlertCircle className="w-10 h-10 mb-2" />
            <p>{error}</p>
            <Button variant="outline" onClick={fetchQuestions} className="mt-4">
              Retry
            </Button>
          </div>
        ) : filteredQuestions.length === 0 ? (
          <div className="text-center py-20 bg-gray-50/50 dark:bg-gray-900 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
            {questions.length === 0 ? (
              <>
                <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-700 mb-2">
                  No practice questions yet
                </h3>
                <p className="text-gray-500 mb-6">
                  Create your first practice question or browse the library to get started
                </p>
                <div className="flex gap-3 justify-center">
                  <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
                    <Plus className="w-4 h-4" />
                    Create Question
                  </Button>
                  <Button variant="outline" onClick={() => setIsLibraryDialogOpen(true)} className="gap-2">
                    <BookOpen className="w-4 h-4" />
                    Browse Library
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-xl font-semibold text-gray-700 mb-2">
                  No questions match your filters
                </h3>
                <p className="text-gray-500 mb-4">
                  Try adjusting your search terms or filters
                </p>
                <Button variant="outline" onClick={clearFilters}>
                  Clear Filters
                </Button>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Results Summary */}
            <div className="flex items-center justify-between mb-6">
              <p className="text-sm text-gray-600">
                Showing {filteredQuestions.length} of {questions.length} questions
              </p>
            </div>

            {/* Questions Grid */}
            <motion.div
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              variants={containerVariants}
              initial="hidden"
              animate="show"
            >
              {filteredQuestions.map((question) => (
                <PracticeQuestionCard
                  key={question.id}
                  question={question}
                  onEdit={handleEditQuestion}
                  onDelete={handleQuestionDeleted}
                />
              ))}
            </motion.div>
          </>
        )}
      </motion.div>

      {/* Dialogs */}
      <CreatePracticeQuestionDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        questionToEdit={editingQuestion}
        onQuestionCreated={handleQuestionCreated}
        onQuestionUpdated={handleQuestionUpdated}
      />

      <PracticeLibraryDialog
        open={isLibraryDialogOpen}
        onOpenChange={setIsLibraryDialogOpen}
        onQuestionAdded={handleLibraryQuestionAdded}
      />
    </TeacherLayout>
  );
}