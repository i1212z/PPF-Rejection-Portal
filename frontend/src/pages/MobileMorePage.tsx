import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard, PlusCircle, Ticket, FileText, CheckCircle2, BarChart3, Settings } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Card } from '../components/ui/Card';

interface MenuItem {
  to: string;
  label: string;
  icon: ReactElement;
}

interface Section {
  id: string;
  title: string;
  items: MenuItem[];
}

export default function MobileMorePage() {
  const { user } = useAuth();
  const role = user?.role;

  const canCreditNotes = role === 'b2b' || role === 'manager' || role === 'admin';
  const isManager = role === 'manager' || role === 'admin';
  const isAdmin = role === 'admin';
  const isDue = role === 'due';
  const isTally = role === 'tally';

  const sections: Section[] = (() => {
    if (isDue) {
      return [
        {
          id: 'due',
          title: 'Due desk',
          items: [
            {
              to: '/due/credit-notes',
              label: 'Open credit notes',
              icon: <FileText className="w-4 h-4" />,
            },
            {
              to: '/due/paid-credit-notes',
              label: 'Paid credit notes',
              icon: <FileText className="w-4 h-4" />,
            },
            {
              to: '/due/report',
              label: 'Due account report',
              icon: <BarChart3 className="w-4 h-4" />,
            },
          ],
        },
      ];
    }

    if (isTally) {
      return [
        {
          id: 'tally',
          title: 'Tally desk',
          items: [
            {
              to: '/tally/pending',
              label: 'Tickets pending',
              icon: <Ticket className="w-4 h-4" />,
            },
            {
              to: '/tally/posted',
              label: 'Tickets posted',
              icon: <Ticket className="w-4 h-4" />,
            },
            {
              to: '/tally/credit-notes/pending',
              label: 'CN pending',
              icon: <FileText className="w-4 h-4" />,
            },
            {
              to: '/tally/credit-notes/posted',
              label: 'CN posted',
              icon: <FileText className="w-4 h-4" />,
            },
          ],
        },
      ];
    }

    const ops: Section = {
      id: 'ops',
      title: 'Operations',
      items: [
        {
          to: '/',
          label: 'Dashboard',
          icon: <LayoutDashboard className="w-4 h-4" />,
        },
        {
          to: '/tickets/new',
          label: 'Create ticket',
          icon: <PlusCircle className="w-4 h-4" />,
        },
        {
          to: '/tickets',
          label: 'Tickets',
          icon: <Ticket className="w-4 h-4" />,
        },
        ...(canCreditNotes
          ? ([
              {
                to: '/credit-notes/new',
                label: 'New credit note',
                icon: <FileText className="w-4 h-4" />,
              },
              {
                to: '/credit-notes',
                label: 'Credit notes',
                icon: <FileText className="w-4 h-4" />,
              },
            ] as MenuItem[])
          : []),
      ],
    };

    const control: Section | null = isManager
      ? {
          id: 'control',
          title: 'Control',
          items: [
            {
              to: '/approvals',
              label: 'Approvals',
              icon: <CheckCircle2 className="w-4 h-4" />,
            },
            {
              to: '/credit-note-approvals',
              label: 'CN approvals',
              icon: <FileText className="w-4 h-4" />,
            },
            {
              to: '/reports',
              label: 'Reports',
              icon: <BarChart3 className="w-4 h-4" />,
            },
          ],
        }
      : null;

    const admin: Section | null = isAdmin
      ? {
          id: 'admin',
          title: 'Admin',
          items: [
            {
              to: '/admin',
              label: 'Admin Panel',
              icon: <Settings className="w-4 h-4" />,
            },
          ],
        }
      : null;

    return [ops, control, admin].filter(Boolean) as Section[];
  })();

  return (
    <div className="space-y-3 md:space-y-6 min-w-0 max-w-full">
      <div>
        <h2 className="text-base md:text-lg font-semibold text-gray-900">More</h2>
        <p className="text-xs md:text-sm text-gray-500">
          Quick access to other sections. Navigation adapts to your role.
        </p>
      </div>
      {sections.map((section) => (
        <Card key={section.id} title={section.title} className="text-sm">
          <div className="divide-y divide-gray-100">
            {section.items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center gap-3 px-1 py-2.5 md:py-2 hover:bg-gray-50 rounded-xl md:rounded-lg -mx-1 md:mx-0"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-700">
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{item.label}</div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

