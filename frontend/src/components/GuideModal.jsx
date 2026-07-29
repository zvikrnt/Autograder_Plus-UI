import { useState } from "react";
import { X, BookOpen, GraduationCap, Users, Bell, Star, ChevronRight, Code, LayoutDashboard, FileText, MessageSquare, Trophy, Layers } from "lucide-react";

const Section = ({ icon: Icon, title, children }) => (
    <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 bg-indigo-100 rounded-lg">
                <Icon className="w-4 h-4 text-indigo-600" />
            </div>
            <h3 className="font-semibold text-gray-900 text-base">{title}</h3>
        </div>
        <div className="space-y-2 pl-8">{children}</div>
    </div>
);

const Step = ({ number, text }) => (
    <div className="flex items-start gap-3">
        <span className="flex-shrink-0 w-5 h-5 bg-indigo-600 text-white text-xs font-bold rounded-full flex items-center justify-center mt-0.5">{number}</span>
        <p className="text-sm text-gray-700 leading-relaxed">{text}</p>
    </div>
);

const Tip = ({ text }) => (
    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
        <span className="text-amber-500 text-xs mt-0.5">💡</span>
        <p className="text-xs text-amber-800 leading-relaxed">{text}</p>
    </div>
);

const Note = ({ text }) => (
    <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mt-2">
        <span className="text-blue-500 text-xs mt-0.5">ℹ️</span>
        <p className="text-xs text-blue-800 leading-relaxed">{text}</p>
    </div>
);

const TeacherGuide = () => (
    <div className="space-y-1">
        <Section icon={LayoutDashboard} title="Dashboard & Overview">
            <p className="text-sm text-gray-600 mb-2">Your dashboard shows all active classes, recent submissions, and quick stats.</p>
            <Step number="1" text="Click '+ New Class' to create a class. Enter the name and section." />
            <Step number="2" text="A unique 6-character join code is auto-generated. Share it with your students." />
            <Step number="3" text="Click on any class card to enter the class workspace." />
        </Section>

        <Section icon={BookOpen} title="Creating Assignments">
            <Step number="1" text="Inside a class, go to the Assignments tab → click '+ Create Assignment'." />
            <Step number="2" text="Set Title, Description, Type (Assignment / Quiz / Exam), Module, and Due Date." />
            <Step number="3" text="Add questions: write a problem description, select language (Python / C / Java), set execution mode (Program or Function), and add test cases with expected outputs." />
            <Step number="4" text="For Function Mode, set the Entry Point — the exact function name students must write." />
            <Step number="5" text="Mark some test cases as 'Hidden' — these are used for grading but not shown during practice runs." />
            <Step number="6" text="Save as Draft (invisible to students) or Publish immediately." />
            <Tip text="When you publish, all enrolled students automatically receive a bell notification and the assignment appears in their stream." />
        </Section>

        <Section icon={Users} title="Managing Students & Roster">
            <Step number="1" text="Go to the Roster tab inside a class to see all enrolled students." />
            <Step number="2" text="Add Teaching Assistants (TAs) directly from the Roster tab — they get grading access but cannot publish or delete." />
            <Step number="3" text="Students self-enroll using the join code — you don't need to add them manually." />
        </Section>

        <Section icon={FileText} title="Grading Submissions">
            <Step number="1" text="From the Assignments tab, click on any assignment to open its Dashboard." />
            <Step number="2" text="The dashboard shows: total students, submission count, graded count, average score, and a progress overview." />
            <Step number="3" text="Click any student's row to open the Grading View." />
            <Step number="4" text="Review the student's code in the read-only Monaco editor, check per-question test results, and read the AI-generated feedback." />
            <Step number="5" text="Enter a Final Score and optional comment, then click 'Save Grade'. The student is notified instantly." />
            <Tip text="Click 'Run AI Analysis' on the dashboard to trigger Autograder+ feedback for all submissions. A progress bar shows the status." />
        </Section>

        <Section icon={MessageSquare} title="Stream & Announcements">
            <Step number="1" text="Go to the Stream tab in any class to see the class feed." />
            <Step number="2" text="Assignment cards appear automatically when published. Use the ⋮ menu on cards to Edit or Delete assignments." />
            <Step number="3" text="Type in the announcement box at the top and click 'Post' to broadcast a message to all students." />
            <Note text="All enrolled students receive a notification when you post an announcement." />
        </Section>

        <Section icon={Trophy} title="Gamification & Leaderboard">
            <Step number="1" text="Students earn points for correct practice submissions, streaks, speed, and first solves." />
            <Step number="2" text="Badges are auto-awarded for milestones (e.g., '7-day streak', 'Perfect Score')." />
            <Step number="3" text="View the class leaderboard from the class dashboard to see student rankings." />
        </Section>

        <Section icon={Bell} title="Notifications">
            <Step number="1" text="The bell icon in the top bar shows unread notifications with a red badge." />
            <Step number="2" text="Click the bell to see the dropdown list. Click any notification to navigate to the relevant page." />
            <Step number="3" text="Use 'Mark all read' to clear all notifications." />
            <Note text="Notifications refresh every 60 seconds automatically." />
        </Section>

        <Section icon={Code} title="AI Analysis (Autograder+)">
            <Step number="1" text="From the Assignment Dashboard, click 'Run AI Analysis'." />
            <Step number="2" text="The system runs static code checks, executes all test cases in a secure Docker sandbox, and generates LLM-based feedback." />
            <Step number="3" text="If a student passed all tests: they receive a quality review with complexity analysis." />
            <Step number="4" text="If a student failed tests: they receive a precise debugging hint that guides without giving away the answer." />
            <Step number="5" text="An interactive Plagiarism Report (plagiarism.csv + scatter plot) is also generated per assignment." />
            <Tip text="The AI worker runs at concurrency=1. Large classes (100+ students) may take a few minutes. You can track progress on the assignment dashboard." />
        </Section>

        <Section icon={Layers} title="Cluster Grading">
            <p className="text-sm text-gray-600 mb-2">Grade faster by grouping similar submissions. Instead of grading everyone, you grade one representative per cluster and the mark propagates to the whole group.</p>
            <Step number="1" text="Run Autograder+ first (Cluster Grading uses its code embeddings). Then open the 'Cluster Grading' tab on the Assignment Dashboard." />
            <Step number="2" text="Click 'Run Cluster Grade'. A worker groups students per question by code similarity + test-case pass/fail behavior. Live logs are shown in the collapsible log panel." />
            <Step number="3" text="Review the Insights row: number of clusters, SAFE vs UNSAFE counts, and how much grading workload is reduced." />
            <Step number="4" text="Inspect the interactive Cluster Maps (grading view, code-similarity view, failure-behavior view). Stars mark each cluster's representative." />
            <Step number="5" text="In the Grading Module, use 'View' to open the representative's code in a popup, enter a grade, and click 'Apply' — it applies to every member of that SAFE cluster." />
            <Note text="Only SAFE and singleton clusters propagate a grade to all members. UNSAFE clusters (mixed behavior or wide score spread) must be graded per-student in the normal grading interface." />
            <Tip text="Track running cluster jobs — with live logs — from the Background Tasks page (admin/teacher), alongside AI Analysis jobs." />
        </Section>
    </div>
);

const StudentGuide = () => (
    <div className="space-y-1">
        <Section icon={LayoutDashboard} title="Getting Started">
            <Step number="1" text="Log in and you'll land on your Student Dashboard showing active classes and upcoming deadlines." />
            <Step number="2" text="To join a class, click '+ Join Class' and enter the 6-character code your teacher shared." />
            <Step number="3" text="The class immediately appears on your dashboard with all published assignments." />
        </Section>

        <Section icon={BookOpen} title="Finding & Opening Assignments">
            <Step number="1" text="Click on any class card → go to the Assignments tab." />
            <Step number="2" text="Assignments are organized by Module (e.g., 'Module 1: Basics', 'Module 2: Arrays')." />
            <Step number="3" text="Check the due date, type (Assignment / Quiz / Exam), and question count on each card." />
            <Step number="4" text="Click 'Start' or 'Continue' to open the workspace." />
            <Tip text="For Quizzes and Exams, a countdown timer starts when you first open the workspace. Make sure you're ready before clicking 'Start'!" />
        </Section>

        <Section icon={Code} title="Using the Code Workspace (IDE)">
            <Step number="1" text="The left panel shows the problem description, examples, and constraints." />
            <Step number="2" text="Use the question tabs at the top to switch between multiple questions in the same assignment." />
            <Step number="3" text="Write your solution in the Monaco editor on the right. Select your language from the dropdown." />
            <Step number="4" text="Click 'Run Code' (▶) to test against sample test cases. This does NOT count as a submission." />
            <Step number="5" text="Debug using the output panel. Red = fail, Green = pass." />
            <Step number="6" text="When ready, click 'Submit Assignment'. A confirmation dialog will appear." />
            <Note text="Your code is auto-saved as you type. If your browser crashes, your draft is preserved." />
        </Section>

        <Section icon={Star} title="Viewing Your Grades & AI Feedback">
            <Step number="1" text="After submission, the workspace goes into read-only mode." />
            <Step number="2" text="Once your teacher grades it, your score appears in the results panel." />
            <Step number="3" text="AI feedback is shown per question — either a debugging hint (if tests failed) or a quality review with complexity analysis (if you passed)." />
            <Step number="4" text="View all your grades in the class Gradebook tab or in your Performance page." />
        </Section>

        <Section icon={Trophy} title="Practice Library & Gamification">
            <Step number="1" text="Click 'Practice' in the sidebar to access the shared problem bank." />
            <Step number="2" text="Browse problems by language (Python / C / Java) and difficulty (Easy / Medium / Hard)." />
            <Step number="3" text="Click any problem to open the practice workspace. Submit to earn points and badges!" />
            <Step number="4" text="Maintain a daily streak for bonus multiplier points." />
            <Step number="5" text="Check the leaderboard in any class to see your rank vs. classmates." />
            <Tip text="Practice problems have no deadlines or grades — they're purely for skill-building and gamification rewards." />
        </Section>

        <Section icon={FileText} title="Stream & Announcements">
            <Step number="1" text="Go to the Stream tab inside any class to see the class feed." />
            <Step number="2" text="Assignment cards are posted automatically when your teacher publishes them." />
            <Step number="3" text="Announcements from your teacher appear as message cards in the stream." />
            <Note text="You receive a bell notification whenever a new assignment or announcement is posted." />
        </Section>

        <Section icon={LayoutDashboard} title="Performance & Calendar">
            <Step number="1" text="Click 'Performance' in the sidebar for your personal analytics: scores over time, topic heatmap, and leaderboard rank." />
            <Step number="2" text="Click 'Calendar' to see all assignment and exam due dates laid out on a monthly view." />
            <Step number="3" text="Click any calendar event to navigate directly to that assignment." />
        </Section>

        <Section icon={Bell} title="Notifications">
            <Step number="1" text="The bell icon in the top bar shows unread notifications." />
            <Step number="2" text="You are notified when: a new assignment is published, an assignment is updated, your grade is posted, or an announcement is made." />
            <Step number="3" text="Click any notification to go directly to the relevant page." />
        </Section>
    </div>
);

export default function GuideModal({ onClose }) {
    const [tab, setTab] = useState("teacher");

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-600 to-purple-600">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/20 rounded-lg">
                            <BookOpen className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">Autograder+ User Guide</h2>
                            <p className="text-indigo-200 text-xs">Complete feature walkthrough for all users</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/20 transition-colors"
                        aria-label="Close guide"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-100 bg-gray-50">
                    <button
                        onClick={() => setTab("teacher")}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${tab === "teacher"
                                ? "text-indigo-700 border-b-2 border-indigo-600 bg-white"
                                : "text-gray-500 hover:text-gray-700"
                            }`}
                    >
                        <GraduationCap className="w-4 h-4" />
                        Teacher / Instructor Guide
                    </button>
                    <button
                        onClick={() => setTab("student")}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${tab === "student"
                                ? "text-indigo-700 border-b-2 border-indigo-600 bg-white"
                                : "text-gray-500 hover:text-gray-700"
                            }`}
                    >
                        <Users className="w-4 h-4" />
                        Student Guide
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {tab === "teacher" ? <TeacherGuide /> : <StudentGuide />}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                    <p className="text-xs text-gray-400">Autograder+ v1.0 — Full documentation in <span className="font-mono">final_report.md</span></p>
                    <button
                        onClick={onClose}
                        className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                        Got it!
                    </button>
                </div>
            </div>
        </div>
    );
}
