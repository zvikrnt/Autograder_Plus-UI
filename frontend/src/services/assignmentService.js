import { api } from './apiClient.js';
import { API_CONFIG } from '../config/api.js';

export const assignmentService = {
  // Get all assignments
  getAssignments: async (params = {}) => {
    const queryParams = new URLSearchParams(params).toString();
    const url = queryParams ? `${API_CONFIG.ENDPOINTS.ASSIGNMENTS.LIST}?${queryParams}` : API_CONFIG.ENDPOINTS.ASSIGNMENTS.LIST;
    return await api.get(url);
  },

  // Get assignments for a specific class
  getClassAssignments: async (classId, params = {}) => {
    const allParams = { ...params, class_id: classId };
    const queryParams = new URLSearchParams(allParams).toString();
    const url = `${API_CONFIG.ENDPOINTS.ASSIGNMENTS.LIST}?${queryParams}`;
    return await api.get(url);
  },

  // Get assignment by ID
  getAssignment: async (assignmentId) => {
    return await api.get(API_CONFIG.ENDPOINTS.ASSIGNMENTS.DETAIL(assignmentId));
  },

  // Create new assignment
  createAssignment: async (assignmentData) => {
    return await api.post(API_CONFIG.ENDPOINTS.ASSIGNMENTS.LIST, assignmentData);
  },

  // Update assignment
  updateAssignment: async (assignmentId, assignmentData) => {
    return await api.put(API_CONFIG.ENDPOINTS.ASSIGNMENTS.DETAIL(assignmentId), assignmentData);
  },

  // Delete assignment
  deleteAssignment: async (assignmentId) => {
    return await api.delete(API_CONFIG.ENDPOINTS.ASSIGNMENTS.DETAIL(assignmentId));
  },

  // Publish assignment
  publishAssignment: async (assignmentId) => {
    return await api.post(API_CONFIG.ENDPOINTS.ASSIGNMENTS.PUBLISH(assignmentId));
  },

  // Close assignment
  closeAssignment: async (assignmentId) => {
    return await api.post(API_CONFIG.ENDPOINTS.ASSIGNMENTS.CLOSE(assignmentId));
  },

  // Create Question
  createQuestion: async (questionData) => {
    return await api.post(API_CONFIG.ENDPOINTS.ASSIGNMENTS.QUESTIONS, questionData);
  },

  // Bulk import questions from JSON
  bulkImportQuestions: async (jsonFile) => {
    const formData = new FormData();
    formData.append('json_file', jsonFile);

    return await api.post(
      API_CONFIG.ENDPOINTS.ASSIGNMENTS.QUESTIONS_BULK_IMPORT,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
  },

  // Update Question
  updateQuestion: async (questionId, questionData) => {
    return await api.put(API_CONFIG.ENDPOINTS.ASSIGNMENTS.QUESTION_DETAIL(questionId), questionData);
  },

  // Trigger AI Analysis for Assignment
  triggerAIAnalysis: async (assignmentId, force = false) => {
    return await api.post(`${API_CONFIG.ENDPOINTS.ASSIGNMENTS.DETAIL(assignmentId)}analyze-ai/`, { force });
  },

  // Get per-question Word Clouds (full + partial tiers) as base64 images
  getWordCloud: async (assignmentId, questionId) => {
    return await api.get(`${API_CONFIG.ENDPOINTS.ASSIGNMENTS.DETAIL(assignmentId)}word-cloud/`, {
      params: { question_id: questionId },
    });
  },

  // Get AI Analysis Progress
  getAnalysisProgress: async (assignmentId) => {
    return await api.get(`${API_CONFIG.ENDPOINTS.ASSIGNMENTS.DETAIL(assignmentId)}analysis-progress/`);
  },

  // Cancel running AI Analysis
  cancelAIAnalysis: async (assignmentId) => {
    return await api.post(`${API_CONFIG.ENDPOINTS.ASSIGNMENTS.DETAIL(assignmentId)}cancel-ai/`);
  },

  // Admin: list active AI analysis tasks
  getAIAnalysisTasks: async () => {
    return await api.get(API_CONFIG.ENDPOINTS.ASSIGNMENTS.AI_ANALYSIS_TASKS);
  },

  // ── Cluster Grading ──────────────────────────────────────────────────
  // Trigger behavior-aware cluster grading for an assignment
  runClusterGrade: async (assignmentId, force = false, config = {}) => {
    return await api.post(
      `${API_CONFIG.ENDPOINTS.ASSIGNMENTS.DETAIL(assignmentId)}run-cluster-grade/`,
      { force, config }
    );
  },

  // Cancel a running cluster grading run
  cancelClusterGrade: async (assignmentId) => {
    return await api.post(`${API_CONFIG.ENDPOINTS.ASSIGNMENTS.DETAIL(assignmentId)}cancel-cluster-grade/`);
  },

  // Poll cluster grading progress
  getClusterProgress: async (assignmentId) => {
    return await api.get(`${API_CONFIG.ENDPOINTS.ASSIGNMENTS.DETAIL(assignmentId)}cluster-progress/`);
  },

  // Fetch parsed clusters + insights + plot URLs
  getClusterResults: async (assignmentId) => {
    return await api.get(`${API_CONFIG.ENDPOINTS.ASSIGNMENTS.DETAIL(assignmentId)}cluster-results/`);
  },

  // Save a teacher's grade for one SAFE cluster (propagates to members)
  saveClusterGrade: async (assignmentId, questionSlug, clusterId, grade) => {
    return await api.post(
      `${API_CONFIG.ENDPOINTS.ASSIGNMENTS.DETAIL(assignmentId)}save-cluster-grade/`,
      { question_slug: questionSlug, cluster_id: clusterId, grade }
    );
  },

  // Fetch a cluster member's (e.g. representative's) source code for the popup
  getClusterMemberCode: async (assignmentId, questionSlug, username) => {
    return await api.get(
      `${API_CONFIG.ENDPOINTS.ASSIGNMENTS.DETAIL(assignmentId)}cluster-member-code/`,
      { params: { question_slug: questionSlug, username } }
    );
  },

  // List active cluster grading tasks (admin task page)
  getClusterGradingTasks: async () => {
    return await api.get(API_CONFIG.ENDPOINTS.ASSIGNMENTS.CLUSTER_GRADING_TASKS);
  },

  // Automatic grading from test-case pass percentage.
  // options: { strategy, min_marks, max_marks, full_marks_on_all_pass,
  //            multiplier, offset, overwrite_manual, preview }
  autoGrade: async (assignmentId, options = {}) => {
    return await api.post(
      `${API_CONFIG.ENDPOINTS.ASSIGNMENTS.DETAIL(assignmentId)}auto-grade/`,
      options
    );
  },
};
