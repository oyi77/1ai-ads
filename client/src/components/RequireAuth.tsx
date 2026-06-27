import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../lib/api';

export function RequireAuth({ children }: { children: ReactNode }) {
  if (!api.isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
