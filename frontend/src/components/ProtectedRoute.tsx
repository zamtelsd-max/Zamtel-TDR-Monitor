import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAppSelector } from '../hooks/useAppDispatch';
import type { Role } from '../types';

interface ProtectedRouteProps {
  children:  React.ReactNode;
  roles?:    Role[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, roles }) => {
  const { user, token } = useAppSelector(s => s.auth);

  if (!token || !user) return <Navigate to="/login" replace />;

  if (roles && !roles.includes(user.role)) {
    // Redirect to the appropriate dashboard
    if (user.role === 'TDR') return <Navigate to="/tdr" replace />;
    if (user.role === 'ZBM') return <Navigate to="/zbm" replace />;
    if (user.role === 'HSD') return <Navigate to="/hsd" replace />;
  }

  return <>{children}</>;
};
