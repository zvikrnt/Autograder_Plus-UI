/**
 * WebSocket Service for Real-time Gamification Features
 * 
 * This service provides a centralized WebSocket connection manager for:
 * - Leaderboard updates
 * - Achievement notifications
 * - Points updates
 * - Practice completion notifications
 */

import { API_CONFIG } from '../config/api.js';

class WebSocketService {
  constructor() {
    this.connections = new Map(); // Store multiple connections by type
    this.reconnectAttempts = new Map();
    this.reconnectTimers = new Map(); // Track pending reconnect timers so they can be cancelled
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Start with 1 second
    this.maxReconnectDelay = 30000; // Max 30 seconds
    this.listeners = new Map(); // Event listeners by connection type
    this.isAuthenticated = false;
    this.authToken = null;
  }

  /**
   * Set authentication token for WebSocket connections
   * @param {string} token - JWT token
   */
  setAuthToken(token) {
    this.authToken = token;
    this.isAuthenticated = !!token;
  }

  /**
   * Clear authentication token and close all connections
   */
  clearAuth() {
    this.authToken = null;
    this.isAuthenticated = false;
    this.disconnectAll();
  }

  /**
   * Connect to a specific WebSocket endpoint
   * @param {string} type - Connection type ('leaderboard' or 'game')
   * @param {Object} options - Connection options
   * @returns {Promise<WebSocket>} - Promise that resolves when connected
   */
  connect(type, options = {}) {
    return new Promise((resolve, reject) => {
      if (!this.isAuthenticated) {
        reject(new Error('Authentication required for WebSocket connection'));
        return;
      }

      // Close existing connection of this type
      this.disconnect(type);

      const wsUrl = this.buildWebSocketUrl(type);

      try {
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log(`WebSocket connected: ${type}`);
          this.connections.set(type, ws);
          this.reconnectAttempts.set(type, 0);

          // Send initial authentication if needed
          if (options.sendAuth) {
            this.sendMessage(type, {
              type: 'authenticate',
              token: this.authToken
            });
          }

          resolve(ws);
        };

        ws.onmessage = (event) => {
          this.handleMessage(type, event);
        };

        ws.onerror = (error) => {
          console.error(`WebSocket error (${type}):`, error);
          reject(error);
        };

        ws.onclose = (event) => {
          console.log(`WebSocket closed (${type}):`, event.code, event.reason);
          this.connections.delete(type);

          // Attempt reconnection if not a clean close
          if (event.code !== 1000 && this.isAuthenticated) {
            this.scheduleReconnect(type, options);
          }
        };

      } catch (error) {
        console.error(`Failed to create WebSocket connection (${type}):`, error);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from a specific WebSocket endpoint
   * @param {string} type - Connection type
   */
  disconnect(type) {
    // Cancel any pending reconnect timer for this type
    const timer = this.reconnectTimers.get(type);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(type);
    }

    const ws = this.connections.get(type);
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close(1000, 'Client disconnect');
    }
    this.connections.delete(type);
    this.reconnectAttempts.delete(type);
  }

  /**
   * Disconnect from all WebSocket endpoints
   */
  disconnectAll() {
    // Cancel all pending reconnect timers first
    for (const [, timer] of this.reconnectTimers) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();

    for (const type of this.connections.keys()) {
      this.disconnect(type);
    }
    this.listeners.clear();
  }

  /**
   * Send a message to a specific WebSocket connection
   * @param {string} type - Connection type
   * @param {Object} message - Message to send
   */
  sendMessage(type, message) {
    const ws = this.connections.get(type);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    } else {
      console.warn(`Cannot send message to ${type}: connection not open`);
    }
  }

  /**
   * Add event listener for a specific connection type
   * @param {string} type - Connection type
   * @param {string} eventType - Event type to listen for
   * @param {Function} callback - Callback function
   */
  addEventListener(type, eventType, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Map());
    }

    const typeListeners = this.listeners.get(type);
    if (!typeListeners.has(eventType)) {
      typeListeners.set(eventType, new Set());
    }

    typeListeners.get(eventType).add(callback);
  }

  /**
   * Remove event listener
   * @param {string} type - Connection type
   * @param {string} eventType - Event type
   * @param {Function} callback - Callback function to remove
   */
  removeEventListener(type, eventType, callback) {
    const typeListeners = this.listeners.get(type);
    if (typeListeners && typeListeners.has(eventType)) {
      typeListeners.get(eventType).delete(callback);
    }
  }

  /**
   * Handle incoming WebSocket messages
   * @param {string} type - Connection type
   * @param {MessageEvent} event - WebSocket message event
   */
  handleMessage(type, event) {
    try {
      const data = JSON.parse(event.data);
      const messageType = data.type;

      // Emit to registered listeners
      const typeListeners = this.listeners.get(type);
      if (typeListeners && typeListeners.has(messageType)) {
        const callbacks = typeListeners.get(messageType);
        callbacks.forEach(callback => {
          try {
            callback(data);
          } catch (error) {
            console.error(`Error in WebSocket callback for ${type}:${messageType}:`, error);
          }
        });
      }

      // Handle common message types
      this.handleCommonMessages(type, data);

    } catch (error) {
      console.error(`Error parsing WebSocket message (${type}):`, error);
    }
  }

  /**
   * Handle common message types across all connections
   * @param {string} type - Connection type
   * @param {Object} data - Parsed message data
   */
  handleCommonMessages(type, data) {
    switch (data.type) {
      case 'error':
        console.error(`WebSocket error (${type}):`, data.message);
        break;

      case 'ping':
        // Respond to ping with pong
        this.sendMessage(type, { type: 'pong' });
        break;

      case 'achievement_earned':
        // Show achievement notification
        this.showAchievementNotification(data.achievement);
        break;

      case 'points_update':
        // Trigger points update event
        this.triggerPointsUpdate(data);
        break;

      default:
        // Let specific handlers deal with other message types
        break;
    }
  }

  /**
   * Build WebSocket URL with authentication token
   * @param {string} type - Connection type
   * @returns {string} - Complete WebSocket URL
   */
  buildWebSocketUrl(type) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const baseUrl = API_CONFIG.WS_BASE_URL.replace(/^https?:/, '').replace(/^wss?:/, '');
    const endpoint = type === 'leaderboard' ? 'leaderboard' : 'game';

    let url = `${protocol}${baseUrl}/ws/${endpoint}/`;

    // Add authentication token as query parameter
    if (this.authToken) {
      const separator = url.includes('?') ? '&' : '?';
      url += `${separator}token=${encodeURIComponent(this.authToken)}`;
    }

    return url;
  }

  /**
   * Schedule reconnection attempt
   * @param {string} type - Connection type
   * @param {Object} options - Original connection options
   */
  scheduleReconnect(type, options) {
    // Cancel any existing pending reconnect for this type
    const existingTimer = this.reconnectTimers.get(type);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.reconnectTimers.delete(type);
    }

    const attempts = this.reconnectAttempts.get(type) || 0;

    if (attempts >= this.maxReconnectAttempts) {
      console.warn(`Max reconnection attempts (${this.maxReconnectAttempts}) reached for ${type}. Giving up.`);
      this.reconnectAttempts.delete(type);
      return;
    }

    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, attempts),
      this.maxReconnectDelay
    );

    console.log(`Scheduling reconnection for ${type} in ${delay}ms (attempt ${attempts + 1}/${this.maxReconnectAttempts})`);

    const timer = setTimeout(() => {
      this.reconnectTimers.delete(type);
      if (this.isAuthenticated) {
        this.reconnectAttempts.set(type, attempts + 1);
        this.connect(type, options).catch(error => {
          console.error(`Reconnection failed for ${type}:`, error);
        });
      }
    }, delay);

    this.reconnectTimers.set(type, timer);
  }

  /**
   * Show achievement notification (can be overridden)
   * @param {Object} achievement - Achievement data
   */
  showAchievementNotification(achievement) {
    // Default implementation - can be overridden by applications
    console.log('Achievement earned:', achievement);

    // Try to show browser notification if permission granted
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`Achievement Unlocked: ${achievement.name}`, {
        body: achievement.description,
        icon: '/favicon.ico'
      });
    }
  }

  /**
   * Trigger points update event (can be overridden)
   * @param {Object} data - Points update data
   */
  triggerPointsUpdate(data) {
    // Default implementation - can be overridden by applications
    console.log('Points updated:', data);

    // Dispatch custom event for components to listen to
    window.dispatchEvent(new CustomEvent('pointsUpdate', { detail: data }));
  }

  /**
   * Get connection status
   * @param {string} type - Connection type
   * @returns {string} - Connection status
   */
  getConnectionStatus(type) {
    const ws = this.connections.get(type);
    if (!ws) return 'disconnected';

    switch (ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return 'connected';
      case WebSocket.CLOSING: return 'closing';
      case WebSocket.CLOSED: return 'disconnected';
      default: return 'unknown';
    }
  }

  /**
   * Check if a connection is active
   * @param {string} type - Connection type
   * @returns {boolean} - True if connected
   */
  isConnected(type) {
    return this.getConnectionStatus(type) === 'connected';
  }
}

// Create singleton instance
const websocketService = new WebSocketService();

export default websocketService;

// Export specific connection helpers
export const connectToLeaderboard = (options) => websocketService.connect('leaderboard', options);
export const connectToGame = (options) => websocketService.connect('game', options);
export const disconnectFromLeaderboard = () => websocketService.disconnect('leaderboard');
export const disconnectFromGame = () => websocketService.disconnect('game');