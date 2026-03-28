import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

type Role = 'b2b' | 'b2c' | 'manager' | 'admin' | 'tally' | 'due';

export function RequireRoles({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, isInitialized } = useAuth();
  if (!isInitialized) {
    return (
      <div className="min-h-[40vh] min-w-0 px-4 flex items-center justify-center text-sm text-gray-500 text-center">
        Loading…
      </div>
    );
  }
  if (!user || !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return children;
}
