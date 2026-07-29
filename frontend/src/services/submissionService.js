import { api } from './apiClient.js';
import { API_CONFIG } from '../config/api.js';

export const submissionService = {
  // Get all submissions
  getSubmissions: async (params = {}) => {
    const queryParams = new URLSearchParams(params).toString();
    const url = queryParams ? `${API_CONFIG.ENDPOINTS.SUBMISSIONS.LIST}?${queryParams}` : API_CONFIG.ENDPOINTS.SUBMISSIONS.LIST;
    return await api.get(url);
  },

  // Get submissions for a specific assignment
  getAssignmentSubmissions: async (assignmentId, params = {}) => {
    const allParams = { ...params, assignment_id: assignmentId };
    const queryParams = new URLSearchParams(allParams).toString();
    const url = `${API_CONFIG.ENDPOINTS.SUBMISSIONS.LIST}?${queryParams}`;
    return await api.get(url);
  },

  // Get lightweight analytics data for an assignment (no source code, minimal fields)
  getAnalyticsSubmissions: async (assignmentId) => {
    const url = `${API_CONFIG.ENDPOINTS.SUBMISSIONS.ANALYTICS}?assignment_id=${assignmentId}`;
    return await api.get(url);
  },

  // Assignment-level overview: per-question avg score, attempts, overall pass %
  getAssignmentOverview: async (assignmentId) => {
    return await api.get(`/submissions/attempts/overview/?assignment_id=${assignmentId}`);
  },

  // Live monitoring: per-assignment live/idle/inactive counts + per-student activity
  getLiveMonitor: async (assignmentId) => {
    return await api.get(`/submissions/progress/live-monitor/?assignment_id=${assignmentId}`);
  },

  // A single student's current draft code (for the live 'watch' view)
  getStudentLiveCode: async (assignmentId, studentId) => {
    return await api.get(
      `/submissions/progress/student-live-code/?assignment_id=${assignmentId}&student_id=${studentId}`
    );
  },

  // Get submission by ID
  getSubmission: async (submissionId) => {
    return await api.get(API_CONFIG.ENDPOINTS.SUBMISSIONS.DETAIL(submissionId));
  },

  // Create/submit code
  submitCode: async (submissionData) => {
    return await api.post(API_CONFIG.ENDPOINTS.SUBMISSIONS.LIST, submissionData);
  },

  // Run code without submitting (for testing) - Enhanced with better error handling
  runCode: async (data) => {
    try {
      const response = await api.post(API_CONFIG.ENDPOINTS.SUBMISSIONS.RUN_CODE, data);
      return response;
    } catch (error) {
      // Handle different types of errors
      if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded. Please wait before running code again.');
      } else if (error.response?.status === 400) {
        throw new Error(error.response.data.message || 'Invalid request');
      } else if (error.response?.status >= 500) {
        throw new Error('Server error. Please try again later.');
      } else {
        throw new Error(error.response?.data?.message || 'Failed to run code');
      }
    }
  },

  // Get sample questions for testing
  getSampleQuestions: async () => {
    try {
      const response = await api.get(API_CONFIG.ENDPOINTS.SUBMISSIONS.SAMPLE_QUESTIONS);
      return response;
    } catch (error) {
      throw new Error('Failed to load sample questions');
    }
  },

  // Get system status (for monitoring)
  getSystemStatus: async () => {
    try {
      const response = await api.get(API_CONFIG.ENDPOINTS.SUBMISSIONS.SYSTEM_STATUS);
      return response;
    } catch (error) {
      throw new Error('Failed to get system status');
    }
  },

  // Grade a submission (Teacher/TA only)
  gradeSubmission: async (submissionId, gradeData) => {
    return await api.put(API_CONFIG.ENDPOINTS.SUBMISSIONS.GRADE(submissionId), gradeData);
  },

  // Publish grade to student (Teacher/Admin only)
  publishGrade: async (submissionId) => {
    return await api.post(API_CONFIG.ENDPOINTS.SUBMISSIONS.PUBLISH(submissionId));
  },

  // Run autograder on all submissions for an assignment
  runAutograder: async (assignmentId) => {
    return await api.post(API_CONFIG.ENDPOINTS.SUBMISSIONS.RUN_AUTOGRADER, { assignment_id: assignmentId });
  },

  // Timer tracking methods
  startTimer: async (assignmentId, questionId, language = 'python') => {
    // questionId here should be assignment_question_id
    return await api.post('/submissions/progress/start-timer/', {
      assignment_id: assignmentId,
      assignment_question_id: questionId, // Mapping argument to expected backend field
      language: language
    });
  },

  updateTimer: async (assignmentId, questionId, timeSpent, language = 'python') => {
    return await api.post('/submissions/progress/update-timer/', {
      assignment_id: assignmentId,
      assignment_question_id: questionId,
      time_spent: timeSpent,
      language: language
    });
  },

  getTimer: async (assignmentId, questionId, language = 'python') => {
    // For getTimer, we might pass assignment_id AND question_id (raw) if we don't have AQ ID,
    // OR we pass questionId as AQ ID.
    // Backend get_timer handles both if implemented smartly, but I implemented logic to fallback.
    // Let's pass query params clearly
    return await api.get(`/submissions/progress/get-timer/?assignment_id=${assignmentId}&assignment_question_id=${questionId}&language=${language}`);
  },

  finishAssignment: async (assignmentId) => {
    return await api.post('/submissions/progress/finish-assignment/', { assignment_id: assignmentId });
  },

  getAssignmentStatus: async (assignmentId) => {
    return await api.get(`/submissions/progress/assignment-status/?assignment_id=${assignmentId}`);
  },

  // Teacher Endpoints
  getAssignmentSummary: async (assignmentId) => {
    return await api.get(`/submissions/attempts/summary/?assignment_id=${assignmentId}`);
  },

  getStudentReport: async (assignmentId, studentId) => {
    return await api.get(`/submissions/progress/student-report/?assignment_id=${assignmentId}&student_id=${studentId}`);
  },

  // Points and Performance Methods
  getPointsSummary: async () => {
    return await api.get('/submissions/progress/points-summary/');
  },

  getAssignmentProgressWithPoints: async (assignmentId) => {
    return await api.get(`/submissions/progress/assignment-progress-with-points/?assignment_id=${assignmentId}`);
  },

  // Student Report Endpoints
  getMyAssignmentReportSummary: async (assignmentId) => {
    return await api.get(`/submissions/progress/my-assignment-report-summary/?assignment_id=${assignmentId}`);
  },

  getMyAssignmentQuestionReport: async (assignmentId, assignmentQuestionId) => {
    return await api.get(
      `/submissions/progress/my-assignment-question-report/?assignment_id=${assignmentId}&assignment_question_id=${assignmentQuestionId}`
    );
  },

  // Gradebook Methods
  getGradebookSummary: async () => {
    return await api.get('/submissions/gradebook/student-summary/');
  },

  getGradebookEntries: async (params = {}) => {
    const queryParams = new URLSearchParams(params).toString();
    const url = queryParams ? `/submissions/gradebook/?${queryParams}` : '/submissions/gradebook/';
    return await api.get(url);
  },
};
