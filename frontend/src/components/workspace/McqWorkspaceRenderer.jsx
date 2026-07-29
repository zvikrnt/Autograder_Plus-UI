import React from "react";
import ReactMarkdown from "react-markdown";

export default function McqWorkspaceRenderer({ question, selectedOption, onChange, disabled }) {
    if (!question) return null;

    const options = question.config?.options || [];

    return (
        <div className="flex flex-col h-full bg-white dark:bg-gray-800 text-gray-900 p-8 overflow-y-auto">
            <div className="max-w-3xl mx-auto w-full space-y-8">
                {/* Question Prompt */}
                <div className="prose prose-indigo max-w-none">
                    <ReactMarkdown>{question.description || ""}</ReactMarkdown>
                </div>

                {/* Options List */}
                <div className="space-y-4 mt-8">
                    {options.map((option, index) => {
                        const isSelected = selectedOption === option;

                        return (
                            <label
                                key={index}
                                className={`flex items-start p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${isSelected
                                        ? "border-indigo-600 bg-indigo-50 shadow-sm"
                                        : disabled
                                            ? "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 opacity-70 cursor-not-allowed"
                                            : "border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                                    }`}
                            >
                                <div className="flex items-center h-5 mt-0.5">
                                    <input
                                        type="radio"
                                        name={`question-${question.id}`}
                                        value={option}
                                        checked={isSelected}
                                        onChange={() => {
                                            if (!disabled) {
                                                onChange(option);
                                            }
                                        }}
                                        disabled={disabled}
                                        className="w-5 h-5 text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-600 disabled:opacity-50"
                                    />
                                </div>
                                <div className="ml-4 flex-1">
                                    <span className={`block text-base ${isSelected ? 'text-indigo-900 font-medium' : 'text-gray-900'}`}>
                                        {option}
                                    </span>
                                </div>
                            </label>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
