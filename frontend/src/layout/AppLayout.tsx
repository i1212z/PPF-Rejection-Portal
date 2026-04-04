import type { ReactNode } from 'react';
import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, PlusCircle, Ticket, CheckCircle2, BarChart3, Settings, Bell, Search, User, CheckCircle, XCircle, LogOut, FileText, MoreHorizontal } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { apiClient } from '../api/client';

const navItemBase =
  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors';

interface SidebarLinkProps {
  to: string;
  icon: ReactNode;
  label: string;
}

function SidebarLink({ to, icon, label }: SidebarLinkProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `${navItemBase} ${isActive ? 'bg-gray-800 text-white border-l-2 border-l-indigo-500 pl-2.5' : 'border-l-2 border-l-transparent'}`
      }
    >
      <span className="w-4 h-4 flex items-center justify-center">{icon}</span>
      <span>{label}</span>
    </NavLink>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [isPwModalOpen, setIsPwModalOpen] = useState(false);
  const [pwOld, setPwOld] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);

  const pageTitle = (() => {
    if (location.pathname.startsWith('/tally/credit-notes/pending')) return 'CN Pending (Tally)';
    if (location.pathname.startsWith('/tally/credit-notes/posted')) return 'CN Posted (Tally)';
    if (location.pathname.startsWith('/tally/pending')) return 'Pending (Tally)';
    if (location.pathname.startsWith('/tally/posted')) return 'Posted (Tally)';
    if (location.pathname.startsWith('/tickets/new')) return 'Create Ticket';
    if (location.pathname.startsWith('/tickets')) return 'Tickets';
    if (location.pathname.startsWith('/credit-notes/new')) return 'New credit note';
    if (location.pathname.startsWith('/credit-notes')) return 'Credit notes';
    if (location.pathname.startsWith('/credit-note-approvals')) return 'Credit note approvals';
    if (location.pathname.startsWith('/due/paid')) return 'Due — paid sheet';
    if (location.pathname.startsWith('/due/report')) return 'Due — reports';
    if (location.pathname.startsWith('/due/')) return 'Due — open sheet';
    if (location.pathname.startsWith('/approvals')) return 'Approvals';
    if (location.pathname.startsWith('/reports')) return 'Reports';
    if (location.pathname.startsWith('/admin')) return 'Admin Panel';
    return 'Dashboard';
  })();

  const isTally = user?.role === 'tally';
  const isDue = user?.role === 'due';
  const isManager = user?.role === 'manager' || user?.role === 'admin';
  const showMobileTopNav = isTally || isDue;
  const canChangePassword =
    user?.role === 'manager' || user?.role === 'admin' || user?.role === 'due';
  const canCreditNotes = user?.role === 'b2b' || user?.role === 'manager' || user?.role === 'admin';

  const submitPasswordChange = async () => {
    setPwError(null);
    setPwSuccess(null);
    setPwLoading(true);
    try {
      await apiClient.post('/auth/change-password', {
        old_password: pwOld,
        new_password: pwNew,
      });
      setPwSuccess('Password updated.');
      setPwOld('');
      setPwNew('');
      setIsPwModalOpen(false);
    } catch (err: unknown) {
      const msg =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as any).response?.data?.detail &&
        typeof (err as any).response.data.detail === 'string'
          ? (err as any).response.data.detail
          : 'Could not change password.';
      setPwError(msg);
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-w-0 bg-gray-50 text-gray-900 flex overflow-x-hidden">
      {/* Sidebar: visible on desktop, hidden on smaller screens */}
      <aside className="hidden lg:flex lg:w-60 lg:flex-col bg-gray-900 text-gray-100">
        <div className="px-4 py-4 border-b border-gray-800 flex items-center gap-3">
          <div
            className={`h-9 w-9 rounded-xl flex items-center justify-center text-[10px] font-bold tracking-tight ${
              isDue ? 'bg-emerald-700 text-white' : 'bg-indigo-600 text-white'
            }`}
          >
            {isDue ? 'DUE' : 'CLS'}
          </div>
          <div className="flex flex-col min-w-0">
            {isDue ? (
              <>
                <span className="text-sm font-semibold truncate">Due account</span>
                <span className="text-[11px] text-gray-400">Excel sheet, zones, paid register</span>
              </>
            ) : (
              <>
                <span className="text-sm font-semibold truncate">Complaint Log System</span>
                <span className="text-[11px] text-gray-400">Daily complaint tracking</span>
              </>
            )}
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 text-sm">
          {isDue ? (
            <>
              <div className="px-2 text-[11px] uppercase tracking-wide text-gray-500 mb-1">Due desk</div>
              <SidebarLink
                to="/due/credit-notes"
                icon={<FileText className="w-4 h-4" />}
                label="Open due sheet"
              />
              <SidebarLink
                to="/due/paid-credit-notes"
                icon={<FileText className="w-4 h-4" />}
                label="Paid due sheet"
              />
              <SidebarLink
                to="/due/report"
                icon={<BarChart3 className="w-4 h-4" />}
                label="Reports"
              />
            </>
          ) : isTally ? (
            <>
              <div className="px-2 text-[11px] uppercase tracking-wide text-gray-500 mb-1">
                Tickets (Tally)
              </div>
              <SidebarLink to="/tally/pending" icon={<CheckCircle className="w-4 h-4" />} label="Pending" />
              <SidebarLink to="/tally/posted" icon={<XCircle className="w-4 h-4" />} label="Posted" />
              <div className="px-2 pt-4 text-[11px] uppercase tracking-wide text-gray-500 mb-1">
                Credit notes
              </div>
              <SidebarLink
                to="/tally/credit-notes/pending"
                icon={<FileText className="w-4 h-4" />}
                label="CN pending"
              />
              <SidebarLink
                to="/tally/credit-notes/posted"
                icon={<FileText className="w-4 h-4" />}
                label="CN posted"
              />
            </>
          ) : (
            <>
              <div className="px-2 text-[11px] uppercase tracking-wide text-gray-500 mb-1">
                Operations
              </div>
              <SidebarLink to="/" icon={<LayoutDashboard className="w-4 h-4" />} label="Dashboard" />
              <SidebarLink to="/tickets/new" icon={<PlusCircle className="w-4 h-4" />} label="Create Ticket" />
              <SidebarLink to="/tickets" icon={<Ticket className="w-4 h-4" />} label="Tickets" />
              {canCreditNotes && (
                <>
                  <SidebarLink to="/credit-notes/new" icon={<FileText className="w-4 h-4" />} label="New credit note" />
                  <SidebarLink to="/credit-notes" icon={<FileText className="w-4 h-4" />} label="Credit notes" />
                </>
              )}
              {(user?.role === 'manager' || user?.role === 'admin') && (
            <>
              <div className="px-2 pt-4 text-[11px] uppercase tracking-wide text-gray-500 mb-1">
                Control
              </div>
              <SidebarLink to="/approvals" icon={<CheckCircle2 className="w-4 h-4" />} label="Approvals" />
              <SidebarLink
                to="/credit-note-approvals"
                icon={<FileText className="w-4 h-4" />}
                label="CN approvals"
              />
              <SidebarLink to="/reports" icon={<BarChart3 className="w-4 h-4" />} label="Reports" />
            </>
          )}
          {user?.role === 'admin' && !isTally && !isDue && (
            <>
              <div className="px-2 pt-4 text-[11px] uppercase tracking-wide text-gray-500 mb-1">
                Admin
              </div>
              <SidebarLink to="/admin" icon={<Settings className="w-4 h-4" />} label="Admin Panel" />
            </>
          )}
            </>
          )}
        </nav>
        <div className="px-4 py-4 border-t border-gray-800 text-xs text-gray-400">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-gray-700 flex items-center justify-center">
              <User className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="font-medium text-gray-100 truncate">{user?.name}</div>
              <div className="text-gray-400 truncate">
                {user?.role === 'due'
                  ? 'Due desk'
                  : user?.role === 'tally'
                    ? 'Tally'
                    : user?.role === 'b2b'
                      ? 'B2B'
                      : user?.role === 'b2c'
                        ? 'B2C'
                        : user?.role
                          ? `${user.role.charAt(0).toUpperCase()}${user.role.slice(1)}`
                          : ''}
              </div>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full rounded-md border border-gray-700 px-3 py-1.5 text-[11px] hover:bg-gray-800 transition-colors"
          >
            Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 max-w-full">
        {/* Top header bar */}
        <header className="min-h-12 sm:min-h-16 border-b border-gray-200 bg-white flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between px-3 sm:px-6 py-1.5 sm:py-0 min-w-0">
          <div className="flex flex-col min-w-0">
            <span className="hidden sm:inline text-xs font-medium text-gray-400 uppercase tracking-wide">
              {isDue ? 'Due desk' : 'Rejection ticket management'}
            </span>
            <span className="text-base sm:text-base font-semibold text-gray-900 truncate">
              {pageTitle}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 sm:gap-4 min-w-0">
            {/* Ticket search — not used on Due desk */}
            {!isDue && (
              <div className="hidden sm:flex items-center gap-2 bg-gray-100 rounded-full px-3 py-1.5 text-xs text-gray-500 w-40 md:w-56 min-w-0 shrink-0">
                <Search className="w-3.5 h-3.5" />
                <input
                  type="text"
                  placeholder="Search tickets..."
                  className="bg-transparent border-none outline-none placeholder:text-gray-400 text-xs w-full"
                />
              </div>
            )}
            <button className="relative rounded-full p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100">
              <Bell className="w-4 h-4" />
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500" />
            </button>
            {canChangePassword && (
              <button
                type="button"
                onClick={() => {
                  setPwError(null);
                  setPwSuccess(null);
                  setIsPwModalOpen(true);
                }}
                className="hidden sm:inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-100"
              >
                Change password
              </button>
            )}
            {/* Compact logout for mobile (always visible, but mainly helps on small screens) */}
            <button
              onClick={logout}
              className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] text-gray-600 hover:bg-gray-100 hover:text-gray-900 sm:hidden"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </header>

        {/* Mobile primary nav for quick access (desktop uses sidebar) */}
        {showMobileTopNav && (
        <nav className="border-b border-gray-200 bg-white px-3 py-2 lg:hidden min-w-0">
          <div className="flex flex-wrap gap-2 text-xs pb-0.5">
            {isDue ? (
              <>
                <NavLink
                  to="/due/credit-notes"
                  className={({ isActive }) =>
                    `inline-flex items-center rounded-full border px-3 py-1 whitespace-nowrap ${
                      isActive
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 bg-gray-50 text-gray-600'
                    }`
                  }
                >
                  Open sheet
                </NavLink>
                <NavLink
                  to="/due/paid-credit-notes"
                  className={({ isActive }) =>
                    `inline-flex items-center rounded-full border px-3 py-1 whitespace-nowrap ${
                      isActive
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                        : 'border-gray-200 bg-gray-50 text-gray-600'
                    }`
                  }
                >
                  Paid sheet
                </NavLink>
                <NavLink
                  to="/due/report"
                  className={({ isActive }) =>
                    `inline-flex items-center rounded-full border px-3 py-1 whitespace-nowrap ${
                      isActive
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 bg-gray-50 text-gray-600'
                    }`
                  }
                >
                  Reports
                </NavLink>
              </>
            ) : isTally ? (
              <>
                <NavLink
                  to="/tally/pending"
                  className={({ isActive }) =>
                    `inline-flex items-center rounded-full border px-3 py-1 whitespace-nowrap ${
                      isActive
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 bg-gray-50 text-gray-600'
                    }`
                  }
                >
                  Tkt pending
                </NavLink>
                <NavLink
                  to="/tally/posted"
                  className={({ isActive }) =>
                    `inline-flex items-center rounded-full border px-3 py-1 whitespace-nowrap ${
                      isActive
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 bg-gray-50 text-gray-600'
                    }`
                  }
                >
                  Tkt posted
                </NavLink>
                <NavLink
                  to="/tally/credit-notes/pending"
                  className={({ isActive }) =>
                    `inline-flex items-center rounded-full border px-3 py-1 whitespace-nowrap ${
                      isActive
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 bg-gray-50 text-gray-600'
                    }`
                  }
                >
                  CN pending
                </NavLink>
                <NavLink
                  to="/tally/credit-notes/posted"
                  className={({ isActive }) =>
                    `inline-flex items-center rounded-full border px-3 py-1 whitespace-nowrap ${
                      isActive
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 bg-gray-50 text-gray-600'
                    }`
                  }
                >
                  CN posted
                </NavLink>
              </>
            ) : null}
          </div>
        </nav>
        )}

        <section className="flex-1 px-3 py-4 sm:px-4 sm:py-6 md:px-6 pb-20 md:pb-6 overflow-auto min-w-0">
          <div className="max-w-6xl mx-auto space-y-6 w-full min-w-0">
            <Outlet />
          </div>
        </section>

        {isPwModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white shadow-lg">
              <div className="border-b border-gray-100 px-4 py-3">
                <div className="text-sm font-semibold text-gray-900">Change password</div>
                <div className="mt-0.5 text-[11px] text-gray-500">
                  For manager, admin, and Due desk accounts.
                </div>
              </div>
              <div className="px-4 py-3 space-y-3">
                {pwError && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                    {pwError}
                  </div>
                )}
                {pwSuccess && (
                  <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
                    {pwSuccess}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Current password
                  </label>
                  <input
                    type="password"
                    value={pwOld}
                    onChange={(e) => setPwOld(e.target.value)}
                    className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    New password
                  </label>
                  <input
                    type="password"
                    value={pwNew}
                    onChange={(e) => setPwNew(e.target.value)}
                    className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                  />
                  <div className="mt-1 text-[11px] text-gray-500">Minimum 6 characters.</div>
                </div>
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end border-t border-gray-100 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setIsPwModalOpen(false)}
                  className="w-full sm:w-auto rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={pwLoading || !pwOld || !pwNew}
                  onClick={() => void submitPasswordChange()}
                  className="w-full sm:w-auto rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 px-3 py-2 text-xs font-semibold text-white"
                >
                  {pwLoading ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
      {/* Mobile bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white md:hidden">
        <div className="mx-auto max-w-6xl flex justify-around px-2 py-1.5 text-[11px] text-gray-500">
          {/* Item 1: Due users land on open sheet; others use dashboard home */}
          <NavLink
            to={isDue ? '/due/credit-notes' : '/'}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 ${
                isActive ? 'text-indigo-600' : 'text-gray-500'
              }`
            }
          >
            <LayoutDashboard className="w-4 h-4" />
            <span className="truncate">{isDue ? 'Open sheet' : 'Home'}</span>
          </NavLink>

          {/* Items 2 & 3: role-specific */}
          {isDue ? (
            <>
              <NavLink
                to="/due/paid-credit-notes"
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 ${
                    isActive ? 'text-indigo-600' : 'text-gray-500'
                  }`
                }
              >
                <FileText className="w-4 h-4" />
                <span className="truncate">Paid sheet</span>
              </NavLink>
              <NavLink
                to="/due/report"
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 ${
                    isActive ? 'text-indigo-600' : 'text-gray-500'
                  }`
                }
              >
                <BarChart3 className="w-4 h-4" />
                <span className="truncate">Reports</span>
              </NavLink>
            </>
          ) : (
            <>
              <NavLink
                to={isManager ? '/approvals' : '/tickets'}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 ${
                    isActive ? 'text-indigo-600' : 'text-gray-500'
                  }`
                }
              >
                {isManager ? <CheckCircle2 className="w-4 h-4" /> : <Ticket className="w-4 h-4" />}
                <span className="truncate">{isManager ? 'Approvals' : 'Tickets'}</span>
              </NavLink>
              <NavLink
                to={isManager ? '/credit-note-approvals' : '/credit-notes'}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 ${
                    isActive ? 'text-indigo-600' : 'text-gray-500'
                  }`
                }
              >
                <FileText className="w-4 h-4" />
                <span className="truncate">{isManager ? 'CN approvals' : 'Credit notes'}</span>
              </NavLink>
            </>
          )}

          {/* Item 4: More (all non-Due roles) */}
          {!isDue && (
            <NavLink
              to="/more"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 ${
                  isActive ? 'text-indigo-600' : 'text-gray-500'
                }`
              }
            >
              <MoreHorizontal className="w-4 h-4" />
              <span className="truncate">More</span>
            </NavLink>
          )}
        </div>
      </nav>
    </div>
  );
}

