import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/client';
import { Card } from '../components/ui/Card';

type TicketStatus = 'pending' | 'approved' | 'rejected';

interface Ticket {
  id: string;
  product_name: string;
  quantity: number;
  uom?: string | null;
  reason: string;
  channel: 'B2B' | 'B2C';
  status: TicketStatus;
  delivery_batch: string;
  delivery_date: string;
  created_at: string;
  approval_remarks?: string | null;
  rejection_remarks?: string | null;
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
    uom?: string | null;
    reason: string;
    status: TicketStatus;
    approval_remarks?: string | null;
    rejection_remarks?: string | null;
  }[];
}

function groupTickets(list: Ticket[]): TicketGroup[] {
  const groups: Record<string, TicketGroup> = {};
  list.forEach((t) => {
    const key = `${t.delivery_batch}|${t.delivery_date}|${t.channel}|${t.created_at.slice(0, 16)}`;
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
      uom: t.uom,
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

export default function TallyPendingPage() {
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [postedIds, setPostedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [postingId, setPostingId] = useState<string | null>(null);

  const loadTickets = useCallback(async () => {
    try {
      const res = await apiClient.get<{ items: Ticket[]; total: number }>('/tickets', {
        params: { limit: 500 },
      });
      setAllTickets(res.data.items);
    } catch {
      setAllTickets([]);
    }
  }, []);

  const loadPosted = useCallback(async () => {
    try {
      const res = await apiClient.get<{ ticket_ids: string[] }>('/tally/posted');
      setPostedIds(new Set(res.data.ticket_ids || []));
    } catch {
      setPostedIds(new Set());
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadTickets(), loadPosted()]).finally(() => setLoading(false));
  }, [loadTickets, loadPosted]);

  const postToTally = async (ticketId: string) => {
    setPostingId(ticketId);
    try {
      await apiClient.post('/tally/post', { ticket_ids: [ticketId] });
      setPostedIds((s) => new Set(s).add(ticketId));
    } catch {
      // keep state on error
    } finally {
      setPostingId(null);
    }
  };

  const tickets = useMemo(
    () => allTickets.filter((t) => t.status === 'approved' || t.status === 'rejected'),
    [allTickets],
  );
  const pendingTickets = useMemo(
    () => tickets.filter((t) => !postedIds.has(t.id)),
    [tickets, postedIds],
  );
  const allGroupsNewest = useMemo(() => groupTickets(allTickets), [allTickets]);
  const allGroupsAsc = useMemo(
    () =>
      [...allGroupsNewest].sort((a, b) => {
        const tA = new Date(a.created_at).getTime();
        const tB = new Date(b.created_at).getTime();
        if (tA !== tB) return tA - tB;
        return groupKey(a).localeCompare(groupKey(b));
      }),
    [allGroupsNewest],
  );
  const { globalDisplayByKey, globalItemLineByItemId } = useMemo(() => {
    const byKey = new Map<string, number>();
    const byItemId = new Map<string, number>();
    const channelCounters: Record<string, number> = {};
    allGroupsAsc.forEach((g) => {
      const chan = g.channel;
      const next = (channelCounters[chan] ?? 0) + 1;
      channelCounters[chan] = next;
      byKey.set(groupKey(g), next);
      const itemsSorted = [...g.items].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
      itemsSorted.forEach((item, lineIdx) => byItemId.set(item.id, lineIdx + 1));
    });
    return { globalDisplayByKey: byKey, globalItemLineByItemId: byItemId };
  }, [allGroupsAsc]);
  const getDisplayId = (g: TicketGroup) => {
    const num = globalDisplayByKey.get(groupKey(g));
    return num != null ? `${g.channel}-${String(num).padStart(3, '0')}` : `${g.channel}-???`;
  };
  const getLineId = (displayId: string, itemId: string) => {
    const lineNum = globalItemLineByItemId.get(itemId);
    return lineNum != null ? `${displayId}-${lineNum}` : `${displayId}-?`;
  };
  const groups = useMemo(() => {
    const pendingIdsSet = new Set(pendingTickets.map((t) => t.id));
    return groupTickets(pendingTickets).filter((g) =>
      g.items.some((item) => pendingIdsSet.has(item.id)),
    );
  }, [pendingTickets]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Pending (Tally)</h2>
        <p className="text-sm text-gray-500">
          Approved and rejected records waiting to be posted to Tally. Click &quot;Post&quot; to move
          to Posted.
        </p>
      </div>
      <Card title="Pending records" subtitle="Click Post to move to Posted page.">
        {loading ? (
          <p className="text-sm text-gray-500 py-4">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">No pending records. All have been posted.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 text-[11px] font-medium text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Ticket</th>
                  <th className="px-4 py-2 text-left">Delivery date</th>
                  <th className="px-4 py-2 text-left">Customer</th>
                  <th className="px-4 py-2 text-left">Channel</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {groups.map((g) => {
                  const displayId = getDisplayId(g);
                  const rowKey = g.id;
                  const isExpanded = expandedGroupId === rowKey;
                  return (
                    <Fragment key={g.id}>
                      <tr
                        role="button"
                        tabIndex={0}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() =>
                          setExpandedGroupId((id) => (id === rowKey ? null : rowKey))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setExpandedGroupId((id) => (id === rowKey ? null : rowKey));
                          }
                        }}
                      >
                        <td className="px-4 py-2 font-medium text-[11px] text-gray-700">
                          {displayId}
                        </td>
                        <td className="px-4 py-2">
                          {new Date(g.delivery_date).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2">{g.delivery_batch}</td>
                        <td className="px-4 py-2">
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
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              g.items[0]?.status === 'approved'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-red-50 text-red-700'
                            }`}
                          >
                            {g.items[0]?.status === 'approved' ? 'Approved' : 'Rejected'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-[11px] text-gray-500">
                          {new Date(g.created_at).toLocaleString()}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-gray-50 border-l-4 border-l-amber-300">
                          <td colSpan={6} className="px-4 py-3 text-xs">
                            <div className="font-medium text-gray-700 mb-2">
                              Products (Ticket ID: {displayId})
                            </div>
                            <table className="min-w-full text-[11px]">
                              <thead className="bg-gray-50 text-gray-500 uppercase">
                                <tr>
                                  <th className="px-3 py-1 text-left">Line</th>
                                  <th className="px-3 py-1 text-left">Product</th>
                                  <th className="px-3 py-1 text-left">Qty</th>
                                  <th className="px-3 py-1 text-left">Creator reason</th>
                                  <th className="px-3 py-1 text-left">Admin remark</th>
                                  <th className="px-3 py-1 text-left">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {g.items
                                  .filter((item) => !postedIds.has(item.id))
                                  .map((item) => (
                                    <tr key={item.id}>
                                      <td className="px-3 py-1 font-medium text-gray-700">
                                        {getLineId(displayId, item.id)}
                                      </td>
                                      <td className="px-3 py-1">{item.product_name}</td>
                                      <td className="px-3 py-1">
                                        {item.quantity} {item.uom ?? 'EA'}
                                      </td>
                                      <td
                                        className="px-3 py-1 text-gray-700 max-w-[140px] truncate"
                                        title={item.reason}
                                      >
                                        {item.reason.length > 40
                                          ? `${item.reason.slice(0, 40)}…`
                                          : item.reason}
                                      </td>
                                      <td className="px-3 py-1 text-gray-700 max-w-[140px] truncate">
                                        {item.approval_remarks ??
                                          item.rejection_remarks ??
                                          '–'}
                                      </td>
                                      <td
                                        className="px-3 py-1"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <button
                                          type="button"
                                          disabled={postingId === item.id}
                                          onClick={() => void postToTally(item.id)}
                                          className="rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 px-2.5 py-1 text-[11px] text-white"
                                        >
                                          {postingId === item.id ? 'Posting…' : 'Post'}
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
