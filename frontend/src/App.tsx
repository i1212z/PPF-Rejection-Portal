import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import { AuthProvider, useAuth } from './auth/AuthContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TicketsPage from './pages/TicketsPage';
import CreateTicketPage from './pages/CreateTicketPage';
import ApprovalsPage from './pages/ApprovalsPage';
import ReportsPage from './pages/ReportsPage';
import AdminPanelPage from './pages/AdminPanelPage';
import AppLayout from './layout/AppLayout';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isInitialized } = useAuth();
  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">Loading…</div>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="tickets" element={<TicketsPage />} />
            <Route path="tickets/new" element={<CreateTicketPage />} />
            <Route path="approvals" element={<ApprovalsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="admin" element={<AdminPanelPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
