import type { ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, PlusCircle, Ticket, CheckCircle2, BarChart3, Settings, Bell, Search, User } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

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

  const pageTitle = (() => {
    if (location.pathname.startsWith('/tickets/new')) return 'Create Ticket';
    if (location.pathname.startsWith('/tickets')) return 'Tickets';
    if (location.pathname.startsWith('/approvals')) return 'Approvals';
    if (location.pathname.startsWith('/reports')) return 'Reports';
    if (location.pathname.startsWith('/admin')) return 'Admin Panel';
    return 'Dashboard';
  })();

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex">
      {/* Sidebar: visible on desktop, hidden on smaller screens */}
      <aside className="hidden lg:flex lg:w-60 lg:flex-col bg-gray-900 text-gray-100">
        <div className="px-4 py-4 border-b border-gray-800 flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-indigo-600 flex items-center justify-center text-xs font-semibold">
            PPF
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">Rejection Control</span>
            <span className="text-[11px] text-gray-400">Daily loss governance</span>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 text-sm">
          <div className="px-2 text-[11px] uppercase tracking-wide text-gray-500 mb-1">
            Operations
          </div>
          <SidebarLink to="/" icon={<LayoutDashboard className="w-4 h-4" />} label="Dashboard" />
          <SidebarLink to="/tickets/new" icon={<PlusCircle className="w-4 h-4" />} label="Create Ticket" />
          <SidebarLink to="/tickets" icon={<Ticket className="w-4 h-4" />} label="Tickets" />
          {(user?.role === 'manager' || user?.role === 'admin') && (
            <>
              <div className="px-2 pt-4 text-[11px] uppercase tracking-wide text-gray-500 mb-1">
                Control
              </div>
              <SidebarLink to="/approvals" icon={<CheckCircle2 className="w-4 h-4" />} label="Approvals" />
              <SidebarLink to="/reports" icon={<BarChart3 className="w-4 h-4" />} label="Reports" />
            </>
          )}
          {user?.role === 'admin' && (
            <>
              <div className="px-2 pt-4 text-[11px] uppercase tracking-wide text-gray-500 mb-1">
                Admin
              </div>
              <SidebarLink to="/admin" icon={<Settings className="w-4 h-4" />} label="Admin Panel" />
            </>
          )}
        </nav>
        <div className="px-4 py-4 border-t border-gray-800 text-xs text-gray-400">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-gray-700 flex items-center justify-center">
              <User className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="font-medium text-gray-100 truncate">{user?.name}</div>
              <div className="capitalize text-gray-400">{user?.role}</div>
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

      <main className="flex-1 flex flex-col min-w-0">
        {/* Top header bar */}
        <header className="h-14 sm:h-16 border-b border-gray-200 bg-white flex items-center px-4 sm:px-6 justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
              Rejection Ticket Management
            </span>
            <span className="text-sm sm:text-base text-gray-700">{pageTitle}</span>
          </div>
          <div className="flex items-center gap-4">
            {/* Search: hide on very small screens to keep header compact */}
            <div className="hidden sm:flex items-center gap-2 bg-gray-100 rounded-full px-3 py-1.5 text-xs text-gray-500 w-40 md:w-56">
              <Search className="w-3.5 h-3.5" />
              <input
                type="text"
                placeholder="Search tickets..."
                className="bg-transparent border-none outline-none placeholder:text-gray-400 text-xs w-full"
              />
            </div>
            <button className="relative rounded-full p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100">
              <Bell className="w-4 h-4" />
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500" />
            </button>
          </div>
        </header>

        {/* Mobile primary nav for quick access (desktop uses sidebar) */}
        <nav className="border-b border-gray-200 bg-white px-4 py-2 lg:hidden">
          <div className="flex gap-2 overflow-x-auto text-xs">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `inline-flex items-center rounded-full border px-3 py-1 whitespace-nowrap ${
                  isActive
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 bg-gray-50 text-gray-600'
                }`
              }
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/tickets/new"
              className={({ isActive }) =>
                `inline-flex items-center rounded-full border px-3 py-1 whitespace-nowrap ${
                  isActive
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 bg-gray-50 text-gray-600'
                }`
              }
            >
              New ticket
            </NavLink>
            <NavLink
              to="/tickets"
              className={({ isActive }) =>
                `inline-flex items-center rounded-full border px-3 py-1 whitespace-nowrap ${
                  isActive
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 bg-gray-50 text-gray-600'
                }`
              }
            >
              Tickets
            </NavLink>
            {(user?.role === 'manager' || user?.role === 'admin') && (
              <>
                <NavLink
                  to="/approvals"
                  className={({ isActive }) =>
                    `inline-flex items-center rounded-full border px-3 py-1 whitespace-nowrap ${
                      isActive
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 bg-gray-50 text-gray-600'
                    }`
                  }
                >
                  Approvals
                </NavLink>
                <NavLink
                  to="/reports"
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
            )}
            {user?.role === 'admin' && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `inline-flex items-center rounded-full border px-3 py-1 whitespace-nowrap ${
                    isActive
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 bg-gray-50 text-gray-600'
                  }`
                }
              >
                Admin
              </NavLink>
            )}
          </div>
        </nav>

        <section className="flex-1 px-4 py-4 sm:p-6 overflow-auto">
          <div className="max-w-6xl mx-auto space-y-6">
            <Outlet />
          </div>
        </section>
      </main>
    </div>
  );
}

