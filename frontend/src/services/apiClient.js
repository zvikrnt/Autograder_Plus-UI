import axios from 'axios';
import { API_CONFIG } from '../config/api.js';
import { tokenManager } from '../utils/tokenManager.js';

// Create axios instance
const apiClient = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = tokenManager.getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // When sending FormData, remove Content-Type so the browser sets the
    // correct multipart boundary automatically. An explicit Content-Type
    // without the boundary parameter causes the server to reject the upload.
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }

    // Debug logging for registration requests
    if (config.url?.includes('register')) {
      console.log('=== REGISTRATION REQUEST ===');
      console.log('URL:', config.url);
      console.log('Method:', config.method);
      console.log('Data:', config.data);
      console.log('Headers:', config.headers);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle token refresh and errors
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 errors (token expired)
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = tokenManager.getRefreshToken();
        if (refreshToken) {
          // Try to refresh the token
          const response = await axios.post(
            `${API_CONFIG.BASE_URL}/auth/token/refresh/`,
            { refresh: refreshToken }
          );

          const { access } = response.data;
          tokenManager.setTokens(access, refreshToken);

          // Retry the original request with new token
          originalRequest.headers.Authorization = `Bearer ${access}`;
          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed, clear tokens and redirect to login
        tokenManager.clearTokens();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    // Handle other errors
    if (error.response?.status === 403) {
      console.error('Access forbidden:', error.response.data);
    } else if (error.response?.status >= 500) {
      console.error('Server error:', error.response.data);
    }

    return Promise.reject(error);
  }
);

// API response wrapper
const handleApiResponse = (response) => {
  return {
    data: response.data,
    status: response.status,
    success: response.status >= 200 && response.status < 300,
  };
};

// API error wrapper
const handleApiError = (error) => {
  // Django REST Framework returns validation errors directly in response.data
  // e.g., { "username": ["This field is required."], "password": ["..."] }
  const responseData = error.response?.data || {};
  
  const errorResponse = {
    success: false,
    status: error.response?.status || 500,
    message: error.response?.data?.message || error.message || 'An error occurred',
    // If response data has validation errors (object with field names), use it directly
    errors: typeof responseData === 'object' && !responseData.message ? responseData : {},
  };

  // Enhanced logging for debugging
  console.error('=== API ERROR ===');
  console.error('Status:', errorResponse.status);
  console.error('Message:', errorResponse.message);
  console.error('Errors:', errorResponse.errors);
  console.error('Full response data:', responseData);
  
  return errorResponse;
};

// Generic API methods
export const api = {
  // GET request
  get: async (url, config = {}) => {
    try {
      const response = await apiClient.get(url, config);
      return handleApiResponse(response);
    } catch (error) {
      return handleApiError(error);
    }
  },

  // POST request
  post: async (url, data = {}, config = {}) => {
    try {
      const response = await apiClient.post(url, data, config);
      return handleApiResponse(response);
    } catch (error) {
      return handleApiError(error);
    }
  },

  // PUT request
  put: async (url, data = {}, config = {}) => {
    try {
      const response = await apiClient.put(url, data, config);
      return handleApiResponse(response);
    } catch (error) {
      return handleApiError(error);
    }
  },

  // PATCH request
  patch: async (url, data = {}, config = {}) => {
    try {
      const response = await apiClient.patch(url, data, config);
      return handleApiResponse(response);
    } catch (error) {
      return handleApiError(error);
    }
  },

  // DELETE request
  delete: async (url, config = {}) => {
    try {
      const response = await apiClient.delete(url, config);
      return handleApiResponse(response);
    } catch (error) {
      return handleApiError(error);
    }
  },
};

export default apiClient;