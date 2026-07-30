import { api } from './apiClient.js';

// Admin portal — only reachable by users with role='admin'; every call here
// hits a backend endpoint gated with IsAuthenticated + IsAdmin
// (backend/adminportal/views.py). api.* never throws — callers must check
// `.success` on the returned envelope, not use try/catch.
export const adminService = {
    getOverview: async () => api.get('/admin/overview/'),

    getHealth: async () => api.get('/admin/health/'),

    runMaintenance: async (actionName) => api.post(`/admin/maintenance/${actionName}/`, {}),

    // --- Users ---
    getUsers: async ({ search = '', role = '', isActive = '', page = 1 } = {}) => {
        const params = new URLSearchParams();
        if (search) params.set('search', search);
        if (role) params.set('role', role);
        if (isActive !== '') params.set('is_active', isActive);
        if (page) params.set('page', page);
        return api.get(`/admin/users/?${params.toString()}`);
    },
    createUser: async (payload) => api.post('/admin/users/', payload),
    updateUser: async (id, payload) => api.patch(`/admin/users/${id}/`, payload),
    deleteUser: async (id) => api.delete(`/admin/users/${id}/`),
    setUserPassword: async (id, newPassword) =>
        api.post(`/admin/users/${id}/set-password/`, { new_password: newPassword }),

    // --- Classes ---
    getClasses: async (page = 1) => api.get(`/admin/classes/?page=${page}`),
    setClassArchived: async (id, isArchived) =>
        api.patch(`/admin/classes/${id}/`, { is_archived: isArchived }),

    // --- Backups ---
    getBackups: async () => api.get('/admin/backups/'),
    createBackup: async () => api.post('/admin/backups/', {}),
    getBackupDownloadUrl: (id) => `/api/admin/backups/${id}/download/`,
};
