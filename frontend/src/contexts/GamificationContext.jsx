/**
 * Gamification Context
 * 
 * Provides centralized state management for gamification features including:
 * - WebSocket connections
 * - Real-time notifications
 * - Points and achievements
 * - Leaderboard updates
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useGameWebSocket, useAuthenticatedWebSocket } from '../hooks/useWebSocket';
import { tokenManager } from '../utils/tokenManager';
import { NotificationContainer } from '../components/features/gamification/NotificationToast';

const GamificationContext = createContext();

export const useGamification = () => {
  const context = useContext(GamificationContext);
  if (!context) {
    throw new Error('useGamification must be used within a GamificationProvider');
  }
  return context;
};

export const GamificationProvider = ({ children }) => {
  // Authentication state
  const { isAuthenticated, setAuthToken, clearAuth, autoConnect } = useAuthenticatedWebSocket();

  // Game WebSocket for achievements, points, etc.
  const {
    connectionStatus: gameConnectionStatus,
    achievements,
    points,
    notifications,
    clearNotification,
    clearAllNotifications,
    connect: connectGame,
    disconnect: disconnectGame,
    isConnected: isGameConnected
  } = useGameWebSocket();

  // Local state
  const [isInitialized, setIsInitialized] = useState(false);
  const [connectionError, setConnectionError] = useState(null);

  // Initialize authentication from sessionStorage via tokenManager
  useEffect(() => {
    const token = tokenManager.getAccessToken();
    if (token) {
      setAuthToken(token);
    }
    setIsInitialized(true);
  }, [setAuthToken]);

  // Auto-connect when authenticated
  useEffect(() => {
    if (isAuthenticated && isInitialized) {
      autoConnect(['game', 'leaderboard']).then(connections => {
        if (connections.length === 0) {
          setConnectionError('Failed to establish real-time connections');
        } else {
          setConnectionError(null);
        }
      }).catch(error => {
        setConnectionError(error.message);
      });
    }
  }, [isAuthenticated, isInitialized, autoConnect]);

  // Handle authentication changes
  const handleLogin = useCallback((token) => {
    // Persist tokens per-tab using sessionStorage via tokenManager
    tokenManager.setTokens(token, tokenManager.getRefreshToken());
    setAuthToken(token);
  }, [setAuthToken]);

  const handleLogout = useCallback(() => {
    tokenManager.clearTokens();
    clearAuth();
    setConnectionError(null);
  }, [clearAuth]);

  // Notification management
  const showNotification = useCallback((type, data) => {
    // This could be extended to show custom notifications
    console.log('Custom notification:', type, data);
  }, []);

  // Connection status helpers
  const getConnectionStatus = useCallback(() => {
    return {
      game: gameConnectionStatus,
      isConnected: isGameConnected,
      hasError: !!connectionError,
      error: connectionError
    };
  }, [gameConnectionStatus, isGameConnected, connectionError]);

  // Retry connections
  const retryConnections = useCallback(async () => {
    if (!isAuthenticated) return false;

    try {
      setConnectionError(null);
      const connections = await autoConnect(['game']);
      return connections.length > 0;
    } catch (error) {
      setConnectionError(error.message);
      return false;
    }
  }, [isAuthenticated, autoConnect]);

  const contextValue = {
    // Authentication
    isAuthenticated,
    handleLogin,
    handleLogout,

    // Connection status
    connectionStatus: getConnectionStatus(),
    retryConnections,

    // Real-time data
    achievements,
    points,
    notifications,

    // Notification management
    clearNotification,
    clearAllNotifications,
    showNotification,

    // Connection management
    isGameConnected,
    connectGame,
    disconnectGame
  };

  return (
    <GamificationContext.Provider value={contextValue}>
      {children}

      {/* Global notification container */}
      <NotificationContainer
        notifications={notifications}
        onClearNotification={clearNotification}
      />
    </GamificationContext.Provider>
  );
};

export default GamificationContext;