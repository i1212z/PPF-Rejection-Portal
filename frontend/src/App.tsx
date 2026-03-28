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
import TallyPendingPage from './pages/TallyPendingPage';
import TallyPostedPage from './pages/TallyPostedPage';
import CreateCreditNotePage from './pages/CreateCreditNotePage';
import CreditNotesPage from './pages/CreditNotesPage';
import CreditNoteApprovalsPage from './pages/CreditNoteApprovalsPage';
import CreditNoteTallyPendingPage from './pages/CreditNoteTallyPendingPage';
import CreditNoteTallyPostedPage from './pages/CreditNoteTallyPostedPage';
import DueCreditNotesPage from './pages/DueCreditNotesPage';
import DuePaidCreditNotesPage from './pages/DuePaidCreditNotesPage';
import AppLayout from './layout/AppLayout';
import { RequireRoles } from './auth/RequireRoles';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isInitialized } = useAuth();
  if (!isInitialized) {
    return (
      <div className="min-h-screen min-w-0 flex items-center justify-center bg-gray-50 px-4">
        <div className="text-sm text-gray-500">Loading…</div>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function DefaultPage() {
  const { user } = useAuth();
  if (user?.role === 'tally') {
    return <Navigate to="/tally/pending" replace />;
  }
  if (user?.role === 'due') {
    return <Navigate to="/due/credit-notes" replace />;
  }
  return <DashboardPage />;
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
            <Route index element={<DefaultPage />} />
            <Route path="tickets" element={<TicketsPage />} />
            <Route path="tickets/new" element={<CreateTicketPage />} />
            <Route
              path="credit-notes"
              element={
                <RequireRoles roles={['b2b', 'manager', 'admin']}>
                  <CreditNotesPage />
                </RequireRoles>
              }
            />
            <Route
              path="credit-notes/new"
              element={
                <RequireRoles roles={['b2b', 'manager', 'admin']}>
                  <CreateCreditNotePage />
                </RequireRoles>
              }
            />
            <Route path="approvals" element={<ApprovalsPage />} />
            <Route
              path="credit-note-approvals"
              element={
                <RequireRoles roles={['manager', 'admin']}>
                  <CreditNoteApprovalsPage />
                </RequireRoles>
              }
            />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="tally/pending" element={<TallyPendingPage />} />
            <Route path="tally/posted" element={<TallyPostedPage />} />
            <Route
              path="due/credit-notes"
              element={
                <RequireRoles roles={['due']}>
                  <DueCreditNotesPage />
                </RequireRoles>
              }
            />
            <Route
              path="due/paid-credit-notes"
              element={
                <RequireRoles roles={['due']}>
                  <DuePaidCreditNotesPage />
                </RequireRoles>
              }
            />
            <Route
              path="tally/credit-notes/pending"
              element={
                <RequireRoles roles={['tally', 'manager', 'admin']}>
                  <CreditNoteTallyPendingPage />
                </RequireRoles>
              }
            />
            <Route
              path="tally/credit-notes/posted"
              element={
                <RequireRoles roles={['tally', 'manager', 'admin']}>
                  <CreditNoteTallyPostedPage />
                </RequireRoles>
              }
            />
            <Route path="admin" element={<AdminPanelPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
