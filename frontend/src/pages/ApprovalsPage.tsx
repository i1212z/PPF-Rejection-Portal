import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/client';
import { Card } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/StatusBadge';

type Decision = 'approved' | 'rejected';

interface PendingTicket {
  id: string;
  product_name: string;
  quantity: number;
  uom?: string | null;
  reason: string;
  delivery_batch: string;
  delivery_date: string;
  channel: 'B2B' | 'B2C';
  created_at: string;
}

interface PendingGroup {
  key: string;
  ids: string[];
  delivery_batch: string;
  delivery_date: string;
  channel: 'B2B' | 'B2C';
  created_at: string;
  items: { id: string; product_name: string; quantity: number; uom?: string | null; reason: string }[];
}

export default function ApprovalsPage() {
  const [tickets, setTickets] = useState<PendingTicket[]>([]);
  const [allTickets, setAllTickets] = useState<PendingTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadPending = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<PendingTicket[]>('/approvals/pending');
      setTickets(res.data);
      const allRes = await apiClient.get<{ items: PendingTicket[]; total: number }>('/tickets', {
        params: { limit: 500 },
      });
      setAllTickets(allRes.data.items);
    } catch (err: unknown) {
      setTickets([]);
      setAllTickets([]);
      setError(null);
      // eslint-disable-next-line no-console
      console.warn('Approvals load failed', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPending();
  }, []);

  const groupTickets = (list: PendingTicket[]): PendingGroup[] => {
    const groups: Record<string, PendingGroup> = {};
    list.forEach((t) => {
      const key = `${t.delivery_batch}|${t.delivery_date}|${t.channel}|${t.created_at.slice(0, 16)}`;
      if (!groups[key]) {
        groups[key] = {
          key,
          ids: [],
          delivery_batch: t.delivery_batch,
          delivery_date: t.delivery_date,
          channel: t.channel,
          created_at: t.created_at,
          items: [],
        };
      }
      groups[key].ids.push(t.id);
      groups[key].items.push({
        id: t.id,
        product_name: t.product_name,
        quantity: t.quantity,
        uom: t.uom,
        reason: t.reason,
      });
    });
    return Object.values(groups).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  };

  const displayIdByGroupKey = useMemo(() => {
    const groups = groupTickets(allTickets);
    const groupsAsc = [...groups].sort((a, b) => {
      const tA = new Date(a.created_at).getTime();
      const tB = new Date(b.created_at).getTime();
      if (tA !== tB) return tA - tB;
      return a.key.localeCompare(b.key);
    });
    const counters: Record<string, number> = {};
    const map = new Map<string, number>();
    groupsAsc.forEach((g) => {
      const chan = g.channel;
      const next = (counters[chan] ?? 0) + 1;
      counters[chan] = next;
      map.set(g.key, next);
    });
    return map;
  }, [allTickets]);

  const getDisplayId = (g: PendingGroup) => {
    const num = displayIdByGroupKey.get(g.key);
    return num != null ? `${g.channel}-${String(num).padStart(3, '0')}` : `${g.channel}-???`;
  };

  const extractApiDetail = (err: unknown): string => {
    if (!err || typeof err !== 'object' || !('response' in err)) return 'Could not submit decision.';
    const res = (err as { response?: { data?: { detail?: unknown } } }).response;
    if (!res?.data?.detail) return 'Could not submit decision.';
    const d = res.data.detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d)) return d.map((x) => (typeof x === 'object' && x && 'msg' in x ? String((x as { msg: string }).msg) : String(x))).join(', ');
    return 'Could not submit decision.';
  };

  const handleItemDecision = async (ticketId: string, decision: Decision) => {
    const remarks =
      decision === 'approved'
        ? 'Approved'
        : window.prompt('Remarks for rejection?') || 'Rejected';
    setActionLoadingId(ticketId);
    setError(null);
    try {
      await apiClient.post(`/approvals/${ticketId}/decision`, {
        decision,
        remarks,
      });
      await loadPending();
    } catch (err: unknown) {
      setError(extractApiDetail(err));
      await loadPending();
    } finally {
      setActionLoadingId(null);
    }
  };

  const groups = groupTickets(tickets);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Pending approvals</h2>
          <p className="text-sm text-gray-500">
            Manager and Admin can review, approve, or reject pending tickets here. Each product line
            can be approved or rejected independently.
          </p>
        </div>
        <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] text-amber-700">
          {tickets.length || 'No'} product(s) awaiting decision
        </div>
      </div>
      <Card
        title="Approval queue"
        subtitle="Tickets currently waiting for a decision"
        className="text-sm"
      >
        {loading && <div className="text-gray-500">Loading pending tickets…</div>}
        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">
            {error}
          </div>
        )}
        {!loading && tickets.length === 0 && (
          <div className="text-gray-500 text-sm">No pending tickets.</div>
        )}
        {!loading && tickets.length > 0 && (
          <>
            {/* Mobile card list - per product */}
            <div className="space-y-3 md:hidden">
              {groups.map((g) => (
                <div
                  key={g.key}
                  className="rounded-2xl border border-gray-100 bg-white px-3 py-3 shadow-sm"
                >
                  <div className="text-sm font-medium text-gray-900">{getDisplayId(g)}</div>
                  <div className="mt-0.5 text-[11px] text-gray-500">
                    {g.delivery_batch} • {g.channel} •{' '}
                    {new Date(g.delivery_date).toLocaleDateString()}
                  </div>
                  <div className="mt-3 space-y-2">
                    {g.items.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2"
                      >
                        <div className="text-[11px] font-medium text-gray-700">
                          {item.product_name}
                        </div>
                        <div className="text-[11px] text-gray-600">
                          Qty: {item.quantity} {item.uom ?? 'EA'}
                        </div>
                        <div className="text-[11px] text-gray-500 truncate" title={item.reason}>
                          {item.reason}
                        </div>
                        <div className="mt-2 flex gap-2">
                          <button
                            disabled={actionLoadingId === item.id}
                            onClick={() => void handleItemDecision(item.id, 'approved')}
                            className="flex-1 rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 px-3 py-1.5 text-[11px] font-semibold text-white"
                          >
                            Approve
                          </button>
                          <button
                            disabled={actionLoadingId === item.id}
                            onClick={() => void handleItemDecision(item.id, 'rejected')}
                            className="flex-1 rounded-full bg-red-600 hover:bg-red-500 disabled:opacity-60 px-3 py-1.5 text-[11px] font-semibold text-white"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-1 text-[11px] text-gray-400">
                    {new Date(g.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table - one row per product, proper headings */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 text-[11px] font-medium text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">Ticket ID</th>
                    <th className="px-4 py-2 text-left">Customer</th>
                    <th className="px-4 py-2 text-left">Delivery date</th>
                    <th className="px-4 py-2 text-left">Products (name / qty / reason)</th>
                    <th className="px-4 py-2 text-left">Channel</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Created</th>
                    <th className="px-4 py-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {groups.flatMap((g) => {
                    const displayId = getDisplayId(g);
                    return g.items.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-gray-50 align-top">
                        <td className="px-4 py-2 font-mono text-[11px] text-gray-700">
                          {idx === 0 ? displayId : ''}
                        </td>
                        <td className="px-4 py-2">{idx === 0 ? g.delivery_batch : ''}</td>
                        <td className="px-4 py-2">
                          {idx === 0 ? new Date(g.delivery_date).toLocaleDateString() : ''}
                        </td>
                        <td className="px-4 py-2">
                          <div className="text-[11px] text-gray-700">
                            <div className="font-medium">{item.product_name}</div>
                            <div className="text-gray-600">
                              Qty: {item.quantity} {item.uom ?? 'EA'}
                            </div>
                            <div className="text-gray-500 max-w-[220px]" title={item.reason}>
                              {item.reason}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          {idx === 0 ? (
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                g.channel === 'B2B'
                                  ? 'bg-sky-50 text-sky-700'
                                  : 'bg-orange-50 text-orange-700'
                              }`}
                            >
                              {g.channel}
                            </span>
                          ) : (
                            ''
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <StatusBadge status="pending" />
                        </td>
                        <td className="px-4 py-2 text-[11px] text-gray-500">
                          {idx === 0 ? new Date(g.created_at).toLocaleString() : ''}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex gap-2">
                            <button
                              disabled={actionLoadingId === item.id}
                              onClick={() => void handleItemDecision(item.id, 'approved')}
                              className="rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 px-2.5 py-1 text-[11px] text-white"
                            >
                              Approve
                            </button>
                            <button
                              disabled={actionLoadingId === item.id}
                              onClick={() => void handleItemDecision(item.id, 'rejected')}
                              className="rounded-md bg-red-600 hover:bg-red-500 disabled:opacity-60 px-2.5 py-1 text-[11px] text-white"
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
