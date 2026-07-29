import React from "react";
import { ChevronLeft, ChevronDown } from "lucide-react";
import { Button } from "../ui/button";

const QuestionPalette = ({
    currentQuestionIndex,
    totalQuestions,
    questionStatusMap = {},
    onSelectQuestion,
    onNext,
    onPrev
}) => {
    // Generate array of question indices [0, 1, 2...]
    const questions = Array.from({ length: totalQuestions }, (_, i) => i);

    const getQuestionClassName = (idx) => {
        const isActive = currentQuestionIndex === idx;
        const status = questionStatusMap[idx];

        if (status === "success") {
            return isActive
                ? "bg-green-600 text-white shadow-md scale-110"
                : "bg-green-100 text-green-700 hover:bg-green-200";
        }

        if (status === "fail") {
            return isActive
                ? "bg-red-600 text-white shadow-md scale-110"
                : "bg-red-100 text-red-700 hover:bg-red-200";
        }

        return isActive
            ? "bg-indigo-600 text-white shadow-md scale-110"
            : "hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600";
    };

    return (
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
            {/* Previous Button */}
            <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-md"
                onClick={onPrev}
                disabled={currentQuestionIndex === 0}
            >
                <ChevronLeft className="w-4 h-4" />
            </Button>

            {/* Question Numbers */}
            <div className="flex items-center gap-1 px-2">
                {questions.map((idx) => (
                    <button
                        key={idx}
                        onClick={() => onSelectQuestion(idx)}
                        className={`w-6 h-6 rounded flex items-center justify-center text-xs font-medium transition-all ${getQuestionClassName(idx)}`}
                        title={`Question ${idx + 1}`}
                    >
                        {idx + 1}
                    </button>
                ))}
            </div>

            {/* Next Button */}
            <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-md"
                onClick={onNext}
                disabled={currentQuestionIndex === totalQuestions - 1}
            >
                <ChevronDown className="w-4 h-4 -rotate-90" />
            </Button>
        </div>
    );
};

export default QuestionPalette;
