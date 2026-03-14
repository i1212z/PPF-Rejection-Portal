import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { apiClient } from '../api/client';
import { Card } from '../components/ui/Card';
import { RejectionValueVsQuantityChart } from '../components/charts/RejectionValueVsQuantityChart';
import { ChannelDistributionPie } from '../components/charts/ChannelDistributionPie';
import { ApprovedVsRejectedChart } from '../components/charts/ApprovedVsRejectedChart';
import type { ApprovedRejectedPoint } from '../components/charts/ApprovedVsRejectedChart';
import { StatusBadge } from '../components/ui/StatusBadge';

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

function truncate(s: string, len: number) {
  if (!s) return '–';
  return s.length <= len ? s : `${s.slice(0, len)}…`;
}

function TicketRow({ ticket: t, expanded, onToggle }: { ticket: Ticket; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onToggle()}
        className="hover:bg-gray-50 cursor-pointer"
      >
        <td className="px-4 py-2 font-mono text-xs text-gray-600">{t.id.slice(0, 8)}</td>
        <td className="px-4 py-2">{t.product_name}</td>
        <td className="px-4 py-2">{t.delivery_batch}</td>
        <td className="px-4 py-2">{t.quantity}</td>
        <td className="px-4 py-2">
          {Number(t.cost || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
        </td>
        <td className="px-4 py-2 text-xs">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${t.channel === 'B2B' ? 'bg-sky-50 text-sky-700' : 'bg-orange-50 text-orange-700'}`}>
            {t.channel}
          </span>
        </td>
        <td className="px-4 py-2">
          <StatusBadge status={t.status} />
        </td>
        <td className="px-4 py-2 text-xs text-gray-700 max-w-[140px]" title={t.reason}>
          {truncate(t.reason || '', 50)}
        </td>
        <td className="px-4 py-2 text-xs text-gray-700 max-w-[140px]" title={t.approval_remarks ?? t.rejection_remarks ?? ''}>
          {truncate(t.approval_remarks ?? t.rejection_remarks ?? '', 50)}
        </td>
        <td className="px-4 py-2 text-xs text-gray-500">{new Date(t.created_at).toLocaleString()}</td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50 border-l-4 border-l-indigo-300">
          <td colSpan={10} className="px-4 py-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="font-medium text-gray-600">Creator reason (B2B/B2C):</span>
                <p className="mt-0.5 text-gray-800 whitespace-pre-wrap">{t.reason || '–'}</p>
              </div>
              <div>
                <span className="font-medium text-gray-600">Admin remark (approve/reject):</span>
                <p className="mt-0.5 text-gray-800 whitespace-pre-wrap">{t.approval_remarks ?? t.rejection_remarks ?? '–'}</p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await apiClient.get<{ items: Ticket[]; total: number }>('/tickets', {
          params: { limit: 200 },
        });
        setTickets(res.data.items);
      } catch (err: unknown) {
        // If unauthorized, just show empty state instead of spamming errors.
        // Other errors also degrade gracefully to an empty dashboard.
        setTickets([]);
        // eslint-disable-next-line no-console
        console.warn('Dashboard tickets load failed', err);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const channelFilter = user?.role === 'b2b' ? 'B2B' : user?.role === 'b2c' ? 'B2C' : null;

  const { totalTickets, totalB2B, totalB2C, pendingCount, chartData, pieData, recent, approvedVsRejectedData } =
    useMemo(() => {
      const total = tickets.length;
      let b2bValue = 0;
      let b2cValue = 0;
      let pending = 0;
      let qtyB2B = 0;
      let qtyB2C = 0;
      let rejectedB2BValue = 0;
      let rejectedB2CValue = 0;
      let rejectedQtyB2B = 0;
      let rejectedQtyB2C = 0;
      let approvedB2BValue = 0;
      let approvedB2CValue = 0;
      let approvedQtyB2B = 0;
      let approvedQtyB2C = 0;

      tickets.forEach((t) => {
        if (t.channel === 'B2B') {
          b2bValue += Number(t.cost || 0);
          qtyB2B += Number(t.quantity || 0);
          if (t.status === 'rejected') {
            rejectedB2BValue += Number(t.cost || 0);
            rejectedQtyB2B += Number(t.quantity || 0);
          } else if (t.status === 'approved') {
            approvedB2BValue += Number(t.cost || 0);
            approvedQtyB2B += Number(t.quantity || 0);
          }
        } else if (t.channel === 'B2C') {
          b2cValue += Number(t.cost || 0);
          qtyB2C += Number(t.quantity || 0);
          if (t.status === 'rejected') {
            rejectedB2CValue += Number(t.cost || 0);
            rejectedQtyB2C += Number(t.quantity || 0);
          } else if (t.status === 'approved') {
            approvedB2CValue += Number(t.cost || 0);
            approvedQtyB2C += Number(t.quantity || 0);
          }
        }
        if (t.status === 'pending') pending += 1;
      });

      const formatter = new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
      });

      const chart = [
        { channel: 'B2B', value: b2bValue, quantity: qtyB2B },
        { channel: 'B2C', value: b2cValue, quantity: qtyB2C },
      ];

      const pie = [
        { channel: 'B2B', value: b2bValue },
        { channel: 'B2C', value: b2cValue },
      ];

      const approvedVsRejected: ApprovedRejectedPoint[] = [];
      if (channelFilter === 'B2B') {
        approvedVsRejected.push(
          { name: 'Approved', value: approvedB2BValue, count: approvedQtyB2B },
          { name: 'Rejected', value: rejectedB2BValue, count: rejectedQtyB2B },
        );
      } else if (channelFilter === 'B2C') {
        approvedVsRejected.push(
          { name: 'Approved', value: approvedB2CValue, count: approvedQtyB2C },
          { name: 'Rejected', value: rejectedB2CValue, count: rejectedQtyB2C },
        );
      } else {
        approvedVsRejected.push(
          { name: 'B2B Approved', value: approvedB2BValue, count: approvedQtyB2B },
          { name: 'B2B Rejected', value: rejectedB2BValue, count: rejectedQtyB2B },
          { name: 'B2C Approved', value: approvedB2CValue, count: approvedQtyB2C },
          { name: 'B2C Rejected', value: rejectedB2CValue, count: rejectedQtyB2C },
        );
      }

      const recentTickets = [...tickets]
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        .slice(0, 5);

      const filterByChannel = <T extends { channel: string }>(arr: T[]): T[] =>
        channelFilter ? arr.filter((x) => x.channel === channelFilter) : arr;

      return {
        totalTickets: total,
        totalB2B: b2bValue ? formatter.format(b2bValue) : '–',
        totalB2C: b2cValue ? formatter.format(b2cValue) : '–',
        pendingCount: pending,
        chartData: filterByChannel(chart),
        pieData: filterByChannel(pie),
        recent: recentTickets,
        approvedVsRejectedData: approvedVsRejected,
      };
    }, [tickets, channelFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 tracking-tight">
            Dashboard
          </h2>
          <p className="text-sm text-gray-500">
            Rejection overview for {user?.role} across B2B and B2C.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Live rejection tracking
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <Card
          title="Total tickets"
          subtitle="All B2B & B2C rejection tickets"
          className="border-t-4 border-t-amber-400"
        >
          <div className="text-2xl font-semibold text-gray-900">
            {loading ? '…' : totalTickets || '0'}
          </div>
          <p className="mt-1 text-[11px] text-emerald-700">
            {totalTickets ? `${totalTickets} tickets in the system` : 'No tickets yet'}
          </p>
        </Card>
        <Card
          title="B2B rejection value"
          subtitle="Across all B2B customers"
          className="border-t-4 border-t-sky-400"
        >
          <div className="text-2xl font-semibold text-gray-900">
            {loading ? '…' : totalB2B}
          </div>
          <p className="mt-1 text-[11px] text-gray-500">Updated from latest tickets</p>
        </Card>
        <Card
          title="B2C rejection value"
          subtitle="Across all B2C orders"
          className="border-t-4 border-t-rose-400"
        >
          <div className="text-2xl font-semibold text-gray-900">
            {loading ? '…' : totalB2C}
          </div>
          <p className="mt-1 text-[11px] text-gray-500">Retail / D2C channel losses</p>
        </Card>
        <Card
          title="Pending approvals"
          subtitle="Waiting for manager / admin"
          className="border-t-4 border-t-emerald-400"
        >
          <div className="text-2xl font-semibold text-gray-900">
            {loading ? '…' : pendingCount || '0'}
          </div>
          <p className="mt-1 text-[11px] text-gray-500">
            Use Approvals tab to action these.
          </p>
        </Card>
      </div>

      {/* Current delivery window by channel – summary (overall ticket value) */}
      <Card
        title="Current delivery window by channel"
        subtitle="This week — quantity and ticket value per channel"
        className="border-l-4 border-l-indigo-400"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(!channelFilter || channelFilter === 'B2B') && (
            <div className="rounded-lg bg-sky-50 border border-sky-100 px-4 py-3">
              <div className="text-xs font-medium text-sky-700 uppercase tracking-wide">B2B</div>
              <div className="mt-1 flex gap-4 text-sm">
                <span><strong>Quantity:</strong> {chartData?.find((c) => c.channel === 'B2B')?.quantity ?? 0}</span>
                <span><strong>Ticket value:</strong> {chartData?.find((c) => c.channel === 'B2B')?.value != null ? Number(chartData.find((c) => c.channel === 'B2B')!.value).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }) : '–'}</span>
              </div>
            </div>
          )}
          {(!channelFilter || channelFilter === 'B2C') && (
            <div className="rounded-lg bg-orange-50 border border-orange-100 px-4 py-3">
              <div className="text-xs font-medium text-orange-700 uppercase tracking-wide">B2C</div>
              <div className="mt-1 flex gap-4 text-sm">
                <span><strong>Quantity:</strong> {chartData?.find((c) => c.channel === 'B2C')?.quantity ?? 0}</span>
                <span><strong>Ticket value:</strong> {chartData?.find((c) => c.channel === 'B2C')?.value != null ? Number(chartData.find((c) => c.channel === 'B2C')!.value).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }) : '–'}</span>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Overall ticket value chart */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card
          title="Overall ticket value"
          subtitle="Current delivery window by channel"
          rightSlot={
            <span className="rounded-full border border-gray-200 px-3 py-1 text-[11px] text-gray-600 bg-gray-50">
              This week
            </span>
          }
          className="xl:col-span-2 min-h-[280px]"
        >
          {chartData && chartData.length > 0 && chartData.some((c) => (c?.value ?? 0) > 0) ? (
            <div className="w-full" style={{ minHeight: 240, height: 240 }}>
              <RejectionValueVsQuantityChart data={chartData} />
            </div>
          ) : (
            <div className="card-placeholder text-[11px] text-gray-500 py-8">
              No data yet.
            </div>
          )}
        </Card>
        <Card
          title="Channel distribution"
          subtitle="Share of total ticket value"
          className="min-h-[280px]"
        >
          <div className="w-full" style={{ minHeight: 240, height: 240 }}>
            {pieData.length > 0 ? (
              <ChannelDistributionPie data={pieData} />
            ) : (
              <div className="card-placeholder text-[11px] text-gray-500 py-8">No data yet.</div>
            )}
          </div>
        </Card>
      </div>

      {/* Approved vs Rejected chart — all accounts */}
      <Card
        title="Approved vs Rejected"
        subtitle="Ticket value and quantity by decision (all accounts)"
        className="border-l-4 border-l-emerald-300"
      >
        {approvedVsRejectedData.length > 0 && approvedVsRejectedData.some((d) => d.value > 0 || d.count > 0) ? (
          <ApprovedVsRejectedChart data={approvedVsRejectedData} />
        ) : (
          <div className="text-sm text-gray-500 py-4">No approved or rejected tickets yet.</div>
        )}
      </Card>

      {/* Recent tickets table */}
      <Card
        title="Recent tickets"
        subtitle="Latest tickets — click a row to see full Creator reason and Admin remark"
      >
        {loading ? (
          <div className="text-sm text-gray-500">Loading tickets…</div>
        ) : recent.length === 0 ? (
          <div className="text-sm text-gray-500">No tickets yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs font-medium text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Ticket ID</th>
                  <th className="px-4 py-2 text-left">Product</th>
                  <th className="px-4 py-2 text-left">Customer</th>
                  <th className="px-4 py-2 text-left">Qty</th>
                  <th className="px-4 py-2 text-left">Cost</th>
                  <th className="px-4 py-2 text-left">Channel</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Creator reason</th>
                  <th className="px-4 py-2 text-left">Admin remark</th>
                  <th className="px-4 py-2 text-left">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recent.map((t) => (
                  <TicketRow
                    key={t.id}
                    ticket={t}
                    expanded={expandedId === t.id}
                    onToggle={() => setExpandedId((id) => (id === t.id ? null : t.id))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

