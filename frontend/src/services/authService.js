import { api } from './apiClient.js';
import { API_CONFIG } from '../config/api.js';
import { tokenManager } from '../utils/tokenManager.js';

export const authService = {
  // User registration
  register: async (userData) => {
    const response = await api.post(API_CONFIG.ENDPOINTS.AUTH.REGISTER, userData);

    if (response.success && response.data.tokens) {
      const { access, refresh } = response.data.tokens;
      tokenManager.setTokens(access, refresh);
    }

    return response;
  },

  // User login
  login: async (credentials) => {
    const response = await api.post(API_CONFIG.ENDPOINTS.AUTH.LOGIN, credentials);

    if (response.success && response.data.tokens) {
      const { access, refresh } = response.data.tokens;
      tokenManager.setTokens(access, refresh);
    }

    return response;
  },

  // User logout
  logout: () => {
    tokenManager.clearTokens();
    sessionStorage.clear(); // Clear session storage (tokens live here now)
    return Promise.resolve({ success: true });
  },

  // Get current user
  getCurrentUser: async () => {
    return await api.get(API_CONFIG.ENDPOINTS.AUTH.ME);
  },

  // Update current user
  updateCurrentUser: async (userData) => {
    return await api.put(API_CONFIG.ENDPOINTS.AUTH.UPDATE_ME, userData);
  },

  // Update user settings
  updateSettings: async (settings) => {
    return await api.put(API_CONFIG.ENDPOINTS.AUTH.SETTINGS, { settings });
  },

  // Upload user avatar
  uploadAvatar: async (formData) => {
    return await api.post(API_CONFIG.ENDPOINTS.AUTH.AVATAR, formData);
  },

  // Check if user is authenticated
  isAuthenticated: () => {
    return tokenManager.isAuthenticated();
  },

  // Get user info from stored token
  getUserFromToken: () => {
    return tokenManager.getUserFromToken();
  },
  // Request password reset
  requestPasswordReset: async (email) => {
    return await api.post(API_CONFIG.ENDPOINTS.AUTH.REQUEST_PASSWORD_RESET, { email });
  },

  // Confirm password reset
  resetPasswordConfirm: async (uid, token, newPassword) => {
    return await api.post(API_CONFIG.ENDPOINTS.AUTH.RESET_PASSWORD_CONFIRM, { uid, token, new_password: newPassword });
  },
};