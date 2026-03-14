import { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { BarChart, Bar, PieChart, Pie, Cell, Legend } from 'recharts';
import * as XLSX from 'xlsx';
import { apiClient } from '../api/client';
import { Card } from '../components/ui/Card';

type TicketStatus = 'pending' | 'approved' | 'rejected';

interface Ticket {
  id: string;
  product_name: string;
  quantity: number;
  cost: number;
  reason: string;
  channel: 'B2B' | 'B2C';
  status: TicketStatus;
  delivery_batch: string;
  delivery_date: string;
  created_at: string;
  rejection_remarks?: string | null;
  approval_remarks?: string | null;
}

const CHART_COLORS = ['#3b82f6', '#f97316', '#22c55e', '#ef4444'];

export default function ReportsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await apiClient.get<{ items: Ticket[]; total: number }>('/tickets', {
          params: { limit: 500 },
        });
        setTickets(res.data.items);
      } catch {
        setTickets([]);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const {
    dailyCostData,
    channelComparisonData,
    approvalRejectionData,
    channelPieData,
  } = useMemo(() => {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyMap: Record<string, number> = {};
    for (let d = new Date(thirtyDaysAgo); d <= now; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      dailyMap[key] = 0;
    }

    let b2bValue = 0;
    let b2cValue = 0;
    const approvedValue = { B2B: 0, B2C: 0 };
    const rejectedValue = { B2B: 0, B2C: 0 };

    tickets.forEach((t) => {
      const created = new Date(t.created_at);
      const key = created.toISOString().slice(0, 10);
      if (key in dailyMap) {
        dailyMap[key] += Number(t.cost || 0);
      }

      if (created >= thisMonthStart) {
        if (t.channel === 'B2B') {
          b2bValue += Number(t.cost || 0);
          if (t.status === 'approved') approvedValue.B2B += Number(t.cost || 0);
          if (t.status === 'rejected') rejectedValue.B2B += Number(t.cost || 0);
        } else {
          b2cValue += Number(t.cost || 0);
          if (t.status === 'approved') approvedValue.B2C += Number(t.cost || 0);
          if (t.status === 'rejected') rejectedValue.B2C += Number(t.cost || 0);
        }
      }
    });

    const dailyCostData = Object.entries(dailyMap)
      .map(([date, total_cost]) => ({ date, total_cost }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const channelComparisonData = [
      { channel: 'B2B', value: b2bValue },
      { channel: 'B2C', value: b2cValue },
    ];

    const channelPieData = [
      { name: 'B2B', value: b2bValue },
      { name: 'B2C', value: b2cValue },
    ].filter((d) => d.value > 0);

    const approvalRejectionData = [
      { name: 'B2B Approved', value: approvedValue.B2B },
      { name: 'B2B Rejected', value: rejectedValue.B2B },
      { name: 'B2C Approved', value: approvedValue.B2C },
      { name: 'B2C Rejected', value: rejectedValue.B2C },
    ].filter((d) => d.value > 0);

    return {
      dailyCostData,
      channelComparisonData,
      approvalRejectionData,
      channelPieData,
    };
  }, [tickets]);

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatDeliveryDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const headers = [
    'Ticket ID',
    'Product',
    'Customer',
    'Qty',
    'Cost',
    'Channel',
    'Status',
    'Creator reason',
    'Admin remark',
    'Delivery Date',
    'Created',
  ];

  const row = (t: Ticket) => [
    t.id,
    t.product_name,
    t.delivery_batch,
    t.quantity,
    Number(t.cost),
    t.channel,
    t.status,
    t.reason ?? '',
    t.approval_remarks ?? '',
    formatDeliveryDate(t.delivery_date),
    formatDateTime(t.created_at),
  ];

  const segments = useMemo(() => ({
    b2bRejected: tickets.filter((t) => t.channel === 'B2B' && t.status === 'rejected'),
    b2bApproved: tickets.filter((t) => t.channel === 'B2B' && t.status === 'approved'),
    b2cRejected: tickets.filter((t) => t.channel === 'B2C' && t.status === 'rejected'),
    b2cApproved: tickets.filter((t) => t.channel === 'B2C' && t.status === 'approved'),
  }), [tickets]);

  const exportCsv = () => {
    const sections: string[] = [];
    const sectionNames = ['B2B Rejected', 'B2B Approved', 'B2C Rejected', 'B2C Approved'] as const;
    const segmentKeys = ['b2bRejected', 'b2bApproved', 'b2cRejected', 'b2cApproved'] as const;
    segmentKeys.forEach((key, i) => {
      const list = segments[key];
      sections.push(`\n=== ${sectionNames[i]} ===`);
      sections.push(headers.join(','));
      list.forEach((t) => {
        sections.push(row(t).map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
      });
    });
    const csv = sections.join('\n').replace(/^\n/, '');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `rejection-tickets-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const sheetNames = ['B2B Rejected', 'B2B Approved', 'B2C Rejected', 'B2C Approved'] as const;
    const segmentKeys = ['b2bRejected', 'b2bApproved', 'b2cRejected', 'b2cApproved'] as const;
    segmentKeys.forEach((key, i) => {
      const list = segments[key];
      const wsData = [headers, ...list.map((t) => row(t))];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, sheetNames[i].replace(/\s/g, '_').slice(0, 31));
    });
    XLSX.writeFile(wb, `rejection-tickets-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Reports</h2>
          <p className="text-sm text-gray-500">
            Export CSV/Excel and view rejection analytics for B2B and B2C.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCsv}
            disabled={loading || tickets.length === 0}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Export CSV
          </button>
          <button
            onClick={exportExcel}
            disabled={loading || tickets.length === 0}
            className="rounded-md bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-xs text-white disabled:opacity-50"
          >
            Export Excel
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading reports…</div>
      ) : (
        <>
          <Card
            title="Daily rejection cost"
            subtitle="Trend of total rejection value over the last 30 days"
            className="min-h-[280px]"
          >
            <div className="w-full" style={{ minHeight: 256, height: 256 }}>
              {dailyCostData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyCostData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
                    <Tooltip formatter={(v: unknown) => [`₹${Number(v ?? 0).toLocaleString('en-IN')}`, 'Total cost']} />
                    <Line type="monotone" dataKey="total_cost" stroke="#4f46e5" strokeWidth={2} dot={false} name="Total cost" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-gray-500">No data for the last 30 days.</div>
              )}
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card
              title="B2B vs B2C comparison"
              subtitle="Channel-level rejection value split for this month"
              className="min-h-[280px]"
            >
              <div className="w-full" style={{ minHeight: 256, height: 256 }}>
                {channelComparisonData.some((d) => d.value > 0) ? (
                  <>
                    <div className="w-full" style={{ minHeight: 128, height: 128 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={channelComparisonData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="channel" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
                          <Tooltip formatter={(v: unknown) => [`₹${Number(v ?? 0).toLocaleString('en-IN')}`, 'Value']} />
                          <Bar dataKey="value" fill="#4f46e5" radius={[4, 4, 0, 0]} name="Value" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="w-full mt-2" style={{ minHeight: 128, height: 128 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={channelPieData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={30}
                            outerRadius={45}
                            paddingAngle={2}
                          >
                            {channelPieData.map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: unknown) => [`₹${Number(v ?? 0).toLocaleString('en-IN')}`, 'Value']} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-gray-500">No data for this month.</div>
                )}
              </div>
            </Card>

            <Card
              title="Approved vs Rejected value"
              subtitle="By channel for this month"
              className="min-h-[280px]"
            >
              <div className="w-full" style={{ minHeight: 256, height: 256 }}>
                {approvalRejectionData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={approvalRejectionData} layout="vertical" margin={{ top: 8, right: 8, left: 80, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                      <Tooltip formatter={(v: unknown) => [`₹${Number(v ?? 0).toLocaleString('en-IN')}`, 'Value']} />
                      <Bar dataKey="value" fill="#22c55e" radius={[0, 4, 4, 0]} name="Value" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-gray-500">No approved/rejected data this month.</div>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
