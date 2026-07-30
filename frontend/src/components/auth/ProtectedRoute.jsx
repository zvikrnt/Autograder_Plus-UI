import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

import { authService } from '../../services/authService';

const ProtectedRoute = ({ children, requiredRole = null }) => {
  const { isAuthenticated, user, isLoading } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const roles = requiredRole ? (Array.isArray(requiredRole) ? requiredRole : [requiredRole]) : null;
  // The admin portal (requiredRole=['admin']) has its own login page and its
  // own unauthenticated destination — an admin hitting /admin shouldn't
  // bounce through the regular student/teacher login flow.
  const isAdminOnlyRoute = roles && roles.length === 1 && roles[0] === 'admin';

  // Redirect to login if not authenticated or token is invalid
  // We check authService.isAuthenticated() directly to catch stale context states
  if (!isAuthenticated || !authService.isAuthenticated()) {
    return <Navigate to={isAdminOnlyRoute ? '/admin/login' : '/login'} state={{ from: location }} replace />;
  }

  // Check role-based access if required
  if (roles && !roles.includes(user?.role)) {
    const redirectPath =
      user?.role === 'admin' ? '/admin' :
        user?.role === 'student' ? '/student/dashboard' : '/teacher/dashboard';
    return <Navigate to={redirectPath} replace />;
  }

  return children;
};

export default ProtectedRoute;