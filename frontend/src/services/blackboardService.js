import { api } from './apiClient.js';

// Blackboard — free-practice online compiler. Nothing is saved server-side.
export const blackboardService = {
    getLanguages: async () => api.get('/blackboard/languages/'),

    run: async ({ language, code, stdin }) =>
        api.post('/blackboard/run/', { language, code, stdin }),
};
