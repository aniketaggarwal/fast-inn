import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../store/authContext';

/**
 * ProtectedRoute — guards routes by authentication and optional role check
 * @param {React.ReactNode} children
 * @param {string[]}        roles  - allowed roles (empty = any authenticated user)
 */
export default function ProtectedRoute({ children, roles = [] }) {
  const { isAuthenticated, user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles.length > 0 && !roles.includes(user?.role)) {
    // Redirect to appropriate dashboard
    const redirects = { guest: '/guest', hotel_staff: '/hotel', admin: '/admin' };
    return <Navigate to={redirects[user?.role] || '/'} replace />;
  }

  return children;
}
