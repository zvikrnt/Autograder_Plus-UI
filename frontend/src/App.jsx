import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";

// Auth & Theme
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import LoginForm from "./components/auth/LoginForm";
import RegisterForm from "./components/auth/RegisterForm";
import ForgotPassword from "./components/auth/ForgotPassword";
import ResetPassword from "./components/auth/ResetPassword";

// Test Components
import CodeRunnerTest from "./pages/CodeRunnerTest";

// Pages
import Landing from "./pages/Landing";

// Teacher Pages
import TeacherDashboard from "./pages/teacher/TeacherDashboard";
import ClassPage from "./pages/teacher/ClassPage";
import CreateAssignment from "./pages/teacher/CreateAssignment";
import ArchivedClasses from "./pages/teacher/ArchivedClasses";
import AssignmentDashboard from "./pages/teacher/AssignmentDashboard";
import GradingInterface from "./pages/teacher/GradingInterface";
import Settings from "./pages/teacher/Settings";
import TeacherProfile from "./pages/teacher/TeacherProfile";
import AllAssignments from "./pages/teacher/AllAssignments";
import TeacherCalendar from "./pages/teacher/TeacherCalendar";
import PracticeQuestionManager from "./pages/teacher/PracticeQuestionManager";
import ClassSettings from "./pages/teacher/ClassSettings";
import AIAnalysisTasks from "./pages/admin/AIAnalysisTasks";

// Student Pages
import StudentDashboard from "./pages/student/StudentDashboard";
import StudentWorkspace from "./pages/student/StudentWorkspace";
import StudentAssignments from "./pages/student/StudentAssignments";
import StudentClassPage from "./pages/student/StudentClassPage";
import StudentCalendar from "./pages/student/StudentCalendar";
import StudentPerformance from "./pages/student/StudentPerformance";
import StudentPractice from "./pages/student/StudentPractice";
import AdaptivePractice from "./pages/student/AdaptivePractice";
import StudentLeaderboard from "./pages/student/StudentLeaderboard";
import Blackboard from "./pages/student/Blackboard";
import StudentAssignmentReport from "./pages/student/StudentAssignmentReport";
import StudentProfile from "./pages/student/StudentProfile";
import StudentSettings from "./pages/student/StudentSettings";
import PracticeWorkspace from "./components/features/student/PracticeWorkspace";

/* -----------------------------
   App Root
------------------------------*/
function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <Routes>

            {/* Public Routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<LoginForm />} />
            <Route path="/register" element={<RegisterForm />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password/:uid/:token" element={<ResetPassword />} />

            {/* Test Route - Remove in production */}
            <Route path="/test-runner" element={<CodeRunnerTest />} />


            {/* Teacher Routes */}
            <Route
              path="/teacher/dashboard"
              element={
                <ProtectedRoute requiredRole={['teacher', 'ta']}>
                  <TeacherDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/archived"
              element={
                <ProtectedRoute requiredRole={['teacher', 'ta']}>
                  <ArchivedClasses />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/class/:classId"
              element={
                <ProtectedRoute requiredRole={['teacher', 'ta']}>
                  <ClassPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/class/:classId/settings"
              element={
                <ProtectedRoute requiredRole={['teacher', 'ta']}>
                  <ClassSettings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/assignment/create"
              element={
                <ProtectedRoute requiredRole={['teacher', 'ta']}>
                  <CreateAssignment />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/assignment/:id"
              element={
                <ProtectedRoute requiredRole={['teacher', 'ta']}>
                  <AssignmentDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/grading/assignment/:assignmentId/student/:studentId"
              element={
                <ProtectedRoute requiredRole={['teacher', 'ta']}>
                  <GradingInterface />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/assignments"
              element={
                <ProtectedRoute requiredRole={['teacher', 'ta']}>
                  <AllAssignments />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/calendar"
              element={
                <ProtectedRoute requiredRole={['teacher', 'ta']}>
                  <TeacherCalendar />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/settings"
              element={
                <ProtectedRoute requiredRole={['teacher', 'ta']}>
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/profile"
              element={
                <ProtectedRoute requiredRole={['teacher', 'ta']}>
                  <TeacherProfile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/practice"
              element={
                <ProtectedRoute requiredRole={['teacher', 'ta']}>
                  <PracticeQuestionManager />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/ai-analysis-tasks"
              element={
                <ProtectedRoute requiredRole={['admin', 'teacher', 'ta']}>
                  <AIAnalysisTasks />
                </ProtectedRoute>
              }
            />

            {/* Student Routes */}
            <Route
              path="/student/dashboard"
              element={
                <ProtectedRoute requiredRole="student">
                  <StudentDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/workspace/:assignmentId"
              element={
                <ProtectedRoute requiredRole="student">
                  <StudentWorkspace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/assignments"
              element={
                <ProtectedRoute requiredRole="student">
                  <StudentAssignments />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/class/:classId"
              element={
                <ProtectedRoute requiredRole="student">
                  <StudentClassPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/calendar"
              element={
                <ProtectedRoute requiredRole="student">
                  <StudentCalendar />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/performance"
              element={
                <ProtectedRoute requiredRole="student">
                  <StudentPerformance />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/practice"
              element={
                <ProtectedRoute requiredRole="student">
                  <StudentPractice />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/adaptive"
              element={
                <ProtectedRoute requiredRole="student">
                  <AdaptivePractice />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/leaderboard"
              element={
                <ProtectedRoute requiredRole="student">
                  <StudentLeaderboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/blackboard"
              element={
                <ProtectedRoute requiredRole="student">
                  <Blackboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/practice/:questionId"
              element={
                <ProtectedRoute requiredRole="student">
                  <PracticeWorkspace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/assignment/:assignmentId/report"
              element={
                <ProtectedRoute requiredRole="student">
                  <StudentAssignmentReport />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/profile"
              element={
                <ProtectedRoute requiredRole="student">
                  <StudentProfile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/settings"
              element={
                <ProtectedRoute requiredRole="student">
                  <StudentSettings />
                </ProtectedRoute>
              }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />

          </Routes>
        </Router>
        <Toaster richColors />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
