import { api } from './apiClient.js';

// Adaptive practice (MARS) — sessions, ratings, leaderboards.
export const adaptiveService = {
    getMyRating: async () => api.get('/adaptive/my-rating/'),

    getActiveSession: async () => api.get('/adaptive/active/'),

    getLanguages: async () => api.get('/adaptive/languages/'),

    startSession: async (language = 'python') => api.post('/adaptive/start/', { language }),

    // Run code against the current question WITHOUT changing rating (a "try").
    run: async (sessionId, code) => api.post(`/adaptive/${sessionId}/run/`, { code }),

    getHistory: async () => api.get('/adaptive/history/'),

    // Submit code for the current question in a session.
    submit: async (sessionId, { code, time_taken_sec, run_attempts }) =>
        api.post(`/adaptive/${sessionId}/submit/`, { code, time_taken_sec, run_attempts }),

    skip: async (sessionId, { time_taken_sec } = {}) =>
        api.post(`/adaptive/${sessionId}/skip/`, { time_taken_sec }),

    end: async (sessionId) => api.post(`/adaptive/${sessionId}/end/`),

    // scope: undefined = global; pass classId for class board.
    getLeaderboard: async (classId) =>
        api.get(`/adaptive/leaderboard/${classId ? `?class_id=${classId}` : ''}`),
};
