import { api } from './apiClient.js';

// Stats, resources (materials), discussions, and announcement attachments.
export const classContentService = {
    // ── Class overview stats (teacher/TA) ──────────────────────────────
    getClassStats: async (classId) => {
        return await api.get(`/classes/${classId}/stats/`);
    },

    // ── Announcement attachments ───────────────────────────────────────
    uploadAnnouncementAttachment: async (announcementId, file) => {
        const fd = new FormData();
        fd.append('file', file);
        return await api.post(`/classes/announcements/${announcementId}/attachments/`, fd);
    },

    // ── Class resources / materials ────────────────────────────────────
    getResources: async (classId) => {
        return await api.get(`/classes/resources/?class_id=${classId}`);
    },
    uploadResource: async (classId, { title, description, category, file, link_url }) => {
        const fd = new FormData();
        fd.append('class_obj', classId);
        fd.append('title', title);
        if (description) fd.append('description', description);
        if (category) fd.append('category', category);
        if (file) fd.append('file', file);
        if (link_url) fd.append('link_url', link_url);
        return await api.post('/classes/resources/', fd);
    },
    deleteResource: async (resourceId) => {
        return await api.delete(`/classes/resources/${resourceId}/`);
    },

    // ── Discussion board ───────────────────────────────────────────────
    getThreads: async (classId) => {
        return await api.get(`/classes/discussions/?class_id=${classId}`);
    },
    createThread: async (classId, { title, body }) => {
        return await api.post('/classes/discussions/', { class_obj: classId, title, body });
    },
    replyToThread: async (threadId, content) => {
        return await api.post(`/classes/discussions/${threadId}/reply/`, { content });
    },
    toggleResolved: async (threadId) => {
        return await api.post(`/classes/discussions/${threadId}/toggle-resolved/`);
    },
    deleteThread: async (threadId) => {
        return await api.delete(`/classes/discussions/${threadId}/`);
    },
};
