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
  reason: string;
  channel: 'B2B' | 'B2C';
  status: TicketStatus;
  delivery_batch: string;
  delivery_date: string;
  created_at: string;
  rejection_remarks?: string | null;
  approval_remarks?: string | null;
}

interface TicketGroup {
  id: string;
  delivery_batch: string;
  delivery_date: string;
  channel: 'B2B' | 'B2C';
  created_at: string;
  items: {
    id: string;
    product_name: string;
    quantity: number;
    reason: string;
    status: TicketStatus;
    approval_remarks?: string | null;
    rejection_remarks?: string | null;
  }[];
}

function truncate(s: string, len: number) {
  if (!s) return '–';
  return s.length <= len ? s : `${s.slice(0, len)}…`;
}

function groupTickets(list: Ticket[]): TicketGroup[] {
  const groups: Record<string, TicketGroup> = {};
  list.forEach((t) => {
    const key = `${t.delivery_batch}|${t.delivery_date}|${t.channel}|${t.created_at.slice(
      0,
      16,
    )}`;
    if (!groups[key]) {
      groups[key] = {
        id: t.id,
        delivery_batch: t.delivery_batch,
        delivery_date: t.delivery_date,
        channel: t.channel,
        created_at: t.created_at,
        items: [],
      };
    }
    groups[key].items.push({
      id: t.id,
      product_name: t.product_name,
      quantity: t.quantity,
      reason: t.reason,
      status: t.status,
      approval_remarks: t.approval_remarks,
      rejection_remarks: t.rejection_remarks,
    });
  });
  return Object.values(groups).sort((a, b) => {
    const tA = new Date(a.created_at).getTime();
    const tB = new Date(b.created_at).getTime();
    if (tB !== tA) return tB - tA;
    return (a.id || '').localeCompare(b.id || '');
  });
}

function groupKey(g: TicketGroup): string {
  return `${g.delivery_batch}|${g.delivery_date}|${g.channel}|${g.created_at.slice(0, 16)}`;
}

function TicketRow({
  group: g,
  displayId,
  getLineId,
  expanded,
  onToggle,
}: {
  group: TicketGroup;
  displayId: string;
  getLineId: (itemId: string) => string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const statuses = Array.from(new Set(g.items.map((i) => i.status)));
  const singleStatus = statuses.length === 1 ? statuses[0] : null;

  return (
    <>
      <tr
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onToggle()}
        className="hover:bg-gray-50 cursor-pointer"
      >
        <td className="px-4 py-2 font-medium text-xs text-gray-700">
          {displayId}
        </td>
        <td className="px-4 py-2">{g.delivery_batch}</td>
        <td className="px-4 py-2">
          {new Date(g.delivery_date).toLocaleDateString()}
        </td>
        <td className="px-4 py-2 text-xs">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
              g.channel === 'B2B'
                ? 'bg-sky-50 text-sky-700'
                : 'bg-orange-50 text-orange-700'
            }`}
          >
            {g.channel}
          </span>
        </td>
        <td className="px-4 py-2">
          {singleStatus ? (
            <StatusBadge status={singleStatus} />
          ) : (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
              Multiple
            </span>
          )}
        </td>
        <td className="px-4 py-2 text-xs text-gray-500">
          {new Date(g.created_at).toLocaleString()}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50 border-l-4 border-l-indigo-300">
          <td colSpan={6} className="px-4 py-3 text-xs">
            <div className="space-y-2">
              <div className="font-medium text-gray-700">
                Products on this ticket (Ticket ID: {displayId})
              </div>
              <div className="border border-gray-200 rounded-md bg-white">
                <table className="min-w-full text-[11px]">
                  <thead className="bg-gray-50 text-gray-500 uppercase">
                    <tr>
                      <th className="px-3 py-1 text-left">Line</th>
                      <th className="px-3 py-1 text-left">Product</th>
                      <th className="px-3 py-1 text-left">Qty</th>
                      <th className="px-3 py-1 text-left">Status</th>
                      <th className="px-3 py-1 text-left">Creator reason</th>
                      <th className="px-3 py-1 text-left">Admin remark</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {g.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-1 font-medium text-gray-700">{getLineId(item.id)}</td>
                        <td className="px-3 py-1">{item.product_name}</td>
                        <td className="px-3 py-1">{item.quantity}</td>
                        <td className="px-3 py-1">
                          <StatusBadge status={item.status} />
                        </td>
                        <td
                          className="px-3 py-1 text-gray-700 max-w-[180px]"
                          title={item.reason}
                        >
                          {truncate(item.reason || '', 60)}
                        </td>
                        <td
                          className="px-3 py-1 text-gray-700 max-w-[180px]"
                          title={
                            item.approval_remarks ?? item.rejection_remarks ?? ''
                          }
                        >
                          {truncate(
                            item.approval_remarks ?? item.rejection_remarks ?? '',
                            60,
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
          params: { limit: 500 },
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

  const { totalTickets, totalB2B, totalB2C, pendingCount, chartData, pieData, recentGroups, globalDisplayByKey, globalItemLineByItemId, approvedVsRejectedData } =
    useMemo(() => {
      const total = tickets.length;
      let pending = 0;
      let qtyB2B = 0;
      let qtyB2C = 0;
      let rejectedQtyB2B = 0;
      let rejectedQtyB2C = 0;
      let approvedQtyB2B = 0;
      let approvedQtyB2C = 0;

      tickets.forEach((t) => {
        if (t.channel === 'B2B') {
          qtyB2B += Number(t.quantity || 0);
          if (t.status === 'rejected') {
            rejectedQtyB2B += Number(t.quantity || 0);
          } else if (t.status === 'approved') {
            approvedQtyB2B += Number(t.quantity || 0);
          }
        } else if (t.channel === 'B2C') {
          qtyB2C += Number(t.quantity || 0);
          if (t.status === 'rejected') {
            rejectedQtyB2C += Number(t.quantity || 0);
          } else if (t.status === 'approved') {
            approvedQtyB2C += Number(t.quantity || 0);
          }
        }
        if (t.status === 'pending') pending += 1;
      });

      const chart = [
        { channel: 'B2B', value: qtyB2B, quantity: qtyB2B },
        { channel: 'B2C', value: qtyB2C, quantity: qtyB2C },
      ];

      const pie = [
        { channel: 'B2B', value: qtyB2B },
        { channel: 'B2C', value: qtyB2C },
      ];

      const approvedVsRejected: ApprovedRejectedPoint[] = [];
      if (channelFilter === 'B2B') {
        approvedVsRejected.push(
          { name: 'Approved', value: approvedQtyB2B, count: approvedQtyB2B },
          { name: 'Rejected', value: rejectedQtyB2B, count: rejectedQtyB2B },
        );
      } else if (channelFilter === 'B2C') {
        approvedVsRejected.push(
          { name: 'Approved', value: approvedQtyB2C, count: approvedQtyB2C },
          { name: 'Rejected', value: rejectedQtyB2C, count: rejectedQtyB2C },
        );
      } else {
        approvedVsRejected.push(
          { name: 'B2B Approved', value: approvedQtyB2B, count: approvedQtyB2B },
          { name: 'B2B Rejected', value: rejectedQtyB2B, count: rejectedQtyB2B },
          { name: 'B2C Approved', value: approvedQtyB2C, count: approvedQtyB2C },
          { name: 'B2C Rejected', value: rejectedQtyB2C, count: rejectedQtyB2C },
        );
      }

      const allGroupsNewest = groupTickets(tickets);
      const recentTickets = allGroupsNewest.slice(0, 5);
      const allGroupsAsc = [...allGroupsNewest].sort((a, b) => {
        const tA = new Date(a.created_at).getTime();
        const tB = new Date(b.created_at).getTime();
        if (tA !== tB) return tA - tB;
        return groupKey(a).localeCompare(groupKey(b));
      });
      const globalDisplayByKey = new Map<string, number>();
      const globalItemLineByItemId = new Map<string, number>();
      const channelCounters: Record<string, number> = {};
      allGroupsAsc.forEach((g) => {
        const chan = g.channel;
        const next = (channelCounters[chan] ?? 0) + 1;
        channelCounters[chan] = next;
        globalDisplayByKey.set(groupKey(g), next);
        const itemsSorted = [...g.items].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
        itemsSorted.forEach((item, lineIdx) => globalItemLineByItemId.set(item.id, lineIdx + 1));
      });

      const filterByChannel = <T extends { channel: string }>(arr: T[]): T[] =>
        channelFilter ? arr.filter((x) => x.channel === channelFilter) : arr;

      return {
        totalTickets: total,
        totalB2B: qtyB2B,
        totalB2C: qtyB2C,
        pendingCount: pending,
        chartData: filterByChannel(chart),
        pieData: filterByChannel(pie),
        recentGroups: recentTickets,
        globalDisplayByKey,
        globalItemLineByItemId,
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
          title="B2B rejected quantity"
          subtitle="Across all B2B customers"
          className="border-t-4 border-t-sky-400"
        >
          <div className="text-2xl font-semibold text-gray-900">
            {loading ? '…' : totalB2B}
          </div>
          <p className="mt-1 text-[11px] text-gray-500">Sum of quantities for B2B tickets</p>
        </Card>
        <Card
          title="B2C rejected quantity"
          subtitle="Across all B2C orders"
          className="border-t-4 border-t-rose-400"
        >
          <div className="text-2xl font-semibold text-gray-900">
            {loading ? '…' : totalB2C}
          </div>
          <p className="mt-1 text-[11px] text-gray-500">Sum of quantities for B2C tickets</p>
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
        subtitle="This week — quantity per channel"
        className="border-l-4 border-l-indigo-400"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(!channelFilter || channelFilter === 'B2B') && (
            <div className="rounded-lg bg-sky-50 border border-sky-100 px-4 py-3">
              <div className="text-xs font-medium text-sky-700 uppercase tracking-wide">B2B</div>
              <div className="mt-1 flex gap-4 text-sm">
                <span><strong>Quantity:</strong> {chartData?.find((c) => c.channel === 'B2B')?.quantity ?? 0}</span>
              </div>
            </div>
          )}
          {(!channelFilter || channelFilter === 'B2C') && (
            <div className="rounded-lg bg-orange-50 border border-orange-100 px-4 py-3">
              <div className="text-xs font-medium text-orange-700 uppercase tracking-wide">B2C</div>
              <div className="mt-1 flex gap-4 text-sm">
                <span><strong>Quantity:</strong> {chartData?.find((c) => c.channel === 'B2C')?.quantity ?? 0}</span>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Overall ticket value chart */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card
        title="Overall rejected quantity"
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
        ) : recentGroups.length === 0 ? (
          <div className="text-sm text-gray-500">No tickets yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs font-medium text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Ticket ID</th>
                  <th className="px-4 py-2 text-left">Customer</th>
                  <th className="px-4 py-2 text-left">Delivery date</th>
                  <th className="px-4 py-2 text-left">Channel</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentGroups.map((g) => {
                  const num = globalDisplayByKey.get(groupKey(g));
                  const displayId = num != null ? `${g.channel}-${String(num).padStart(3, "0")}` : `${g.channel}-???`;
                  const getLineId = (itemId: string) => {
                    const lineNum = globalItemLineByItemId.get(itemId);
                    return lineNum != null ? `${displayId}-${lineNum}` : `${displayId}-?`;
                  };
                  return (
                    <TicketRow
                      key={g.id}
                      group={g}
                      displayId={displayId}
                      getLineId={getLineId}
                      expanded={expandedId === g.id}
                      onToggle={() =>
                        setExpandedId((id) => (id === g.id ? null : g.id))
                      }
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

