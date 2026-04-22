import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/client';
import { useAuth } from '../auth/AuthContext';
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

interface PendingCreditNote {
  id: string;
  delivery_date: string;
  customer_name: string;
  market_area: string;
  amount: number;
  created_at: string;
}

type MixedQueueRow =
  | {
      kind: 'ticket';
      created_at: string;
      group: PendingGroup;
      displayId: string;
    }
  | {
      kind: 'cn';
      created_at: string;
      note: PendingCreditNote;
      displayId: string;
    };

export default function ApprovalsPage() {
  const { user } = useAuth();
  const isManagerOnly = user?.role === 'manager';
  const [tickets, setTickets] = useState<PendingTicket[]>([]);
  const [allTickets, setAllTickets] = useState<PendingTicket[]>([]);
  const [pendingCreditNotes, setPendingCreditNotes] = useState<PendingCreditNote[]>([]);
  const [allCreditNotes, setAllCreditNotes] = useState<PendingCreditNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadPending = async () => {
    setLoading(true);
    setError(null);
    try {
      const ticketPendingReq = apiClient.get<PendingTicket[]>('/approvals/pending');
      const ticketAllReq = apiClient.get<{ items: PendingTicket[]; total: number }>('/tickets', {
        params: { limit: 500 },
      });
      const cnPendingReq = isManagerOnly
        ? apiClient.get<PendingCreditNote[]>('/credit-note-approvals/pending')
        : Promise.resolve({ data: [] as PendingCreditNote[] });
      const cnAllReq = isManagerOnly
        ? apiClient.get<{ items: PendingCreditNote[]; total: number }>('/credit-notes', {
            params: { limit: 500 },
          })
        : Promise.resolve({ data: { items: [] as PendingCreditNote[], total: 0 } });

      const [ticketPendingRes, ticketAllRes, cnPendingRes, cnAllRes] = await Promise.all([
        ticketPendingReq,
        ticketAllReq,
        cnPendingReq,
        cnAllReq,
      ]);

      setTickets(ticketPendingRes.data);
      setAllTickets(ticketAllRes.data.items);
      setPendingCreditNotes(cnPendingRes.data);
      setAllCreditNotes(cnAllRes.data.items);
    } catch (err: unknown) {
      setTickets([]);
      setAllTickets([]);
      setPendingCreditNotes([]);
      setAllCreditNotes([]);
      setError(null);
      // eslint-disable-next-line no-console
      console.warn('Approvals load failed', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPending();
  }, [isManagerOnly]);

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

  const displayIdByCreditNoteId = useMemo(() => {
    const sorted = [...allCreditNotes].sort((a, b) => {
      const tA = new Date(a.created_at).getTime();
      const tB = new Date(b.created_at).getTime();
      if (tA !== tB) return tA - tB;
      return a.id.localeCompare(b.id);
    });
    const map = new Map<string, string>();
    sorted.forEach((n, idx) => {
      map.set(n.id, `CN-B2B-${String(idx + 1).padStart(3, '0')}`);
    });
    return map;
  }, [allCreditNotes]);

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

  const handleCreditNoteDecision = async (creditNoteId: string, decision: Decision) => {
    const remarks =
      decision === 'approved'
        ? 'Approved'
        : window.prompt('Remarks for rejection?') || 'Rejected';
    setActionLoadingId(`cn:${creditNoteId}`);
    setError(null);
    try {
      await apiClient.post(`/credit-note-approvals/${creditNoteId}/decision`, {
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
  const mixedQueue = useMemo<MixedQueueRow[]>(() => {
    const ticketRows: MixedQueueRow[] = groups.map((group) => ({
      kind: 'ticket',
      created_at: group.created_at,
      group,
      displayId: getDisplayId(group),
    }));
    const cnRows: MixedQueueRow[] = isManagerOnly
      ? pendingCreditNotes.map((note) => ({
          kind: 'cn',
          created_at: note.created_at,
          note,
          displayId: displayIdByCreditNoteId.get(note.id) ?? 'CN-B2B-???',
        }))
      : [];
    return [...ticketRows, ...cnRows].sort((a, b) => {
      const tA = new Date(a.created_at).getTime();
      const tB = new Date(b.created_at).getTime();
      return tA - tB;
    });
  }, [displayIdByCreditNoteId, groups, isManagerOnly, pendingCreditNotes]);
  const pendingCount = tickets.length + (isManagerOnly ? pendingCreditNotes.length : 0);

  return (
    <div className="space-y-4 min-w-0 max-w-full">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between min-w-0">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900">TKTS and CN approvals</h2>
          <p className="text-sm text-gray-500">
            Managers can review both pending tickets and credit notes in one queue. Admin view stays
            ticket-focused.
          </p>
        </div>
        <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 md:py-1 text-[11px] text-amber-700 w-full md:w-auto text-center md:text-left shrink-0">
          {pendingCount || 'No'} item(s) awaiting decision
        </div>
      </div>
      <Card
        title="Approval queue"
        subtitle="Tickets currently waiting for a decision"
        className="text-sm"
      >
        {loading && <div className="text-gray-500">Loading pending approvals…</div>}
        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">
            {error}
          </div>
        )}
        {!loading && mixedQueue.length === 0 && (
          <div className="text-gray-500 text-sm">No pending approvals.</div>
        )}
        {!loading && mixedQueue.length > 0 && (
          <>
            {/* Mobile card list - per product */}
            <div className="space-y-3 md:hidden">
              {mixedQueue.map((entry) =>
                entry.kind === 'ticket' ? (
                  <div
                    key={entry.group.key}
                    className="rounded-2xl border border-gray-100 bg-white px-3 py-3 shadow-sm"
                  >
                    <div className="text-sm font-medium text-gray-900">{entry.displayId}</div>
                    <div className="mt-0.5 text-[11px] text-gray-500">
                      Ticket • {entry.group.delivery_batch} • {entry.group.channel} •{' '}
                      {new Date(entry.group.delivery_date).toLocaleDateString('en-GB')}
                    </div>
                    <div className="mt-3 space-y-2">
                      {entry.group.items.map((item) => (
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
                      {new Date(entry.group.created_at).toLocaleString('en-GB')}
                    </div>
                  </div>
                ) : (
                  <div
                    key={entry.note.id}
                    className="rounded-2xl border border-gray-100 bg-white px-3 py-3 shadow-sm"
                  >
                    <div className="text-sm font-medium text-gray-900">{entry.displayId}</div>
                    <div className="mt-0.5 text-[11px] text-gray-500">
                      Credit note • {entry.note.customer_name} •{' '}
                      {new Date(entry.note.delivery_date).toLocaleDateString('en-GB')}
                    </div>
                    <div className="mt-2 text-[11px] text-gray-600">
                      {entry.note.market_area} • Amount:{' '}
                      {Number(entry.note.amount).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        disabled={actionLoadingId === `cn:${entry.note.id}`}
                        onClick={() => void handleCreditNoteDecision(entry.note.id, 'approved')}
                        className="flex-1 rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 px-3 py-1.5 text-[11px] font-semibold text-white"
                      >
                        Approve
                      </button>
                      <button
                        disabled={actionLoadingId === `cn:${entry.note.id}`}
                        onClick={() => void handleCreditNoteDecision(entry.note.id, 'rejected')}
                        className="flex-1 rounded-full bg-red-600 hover:bg-red-500 disabled:opacity-60 px-3 py-1.5 text-[11px] font-semibold text-white"
                      >
                        Reject
                      </button>
                    </div>
                    <div className="mt-1 text-[11px] text-gray-400">
                      {new Date(entry.note.created_at).toLocaleString('en-GB')}
                    </div>
                  </div>
                ),
              )}
            </div>

            {/* Desktop table - one row per product, proper headings */}
            <div className="hidden md:block w-full min-w-0 overflow-x-auto overscroll-x-contain">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 text-[11px] font-medium text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">Type</th>
                    <th className="px-4 py-2 text-left">Approval ID</th>
                    <th className="px-4 py-2 text-left">Customer</th>
                    <th className="px-4 py-2 text-left">Delivery date</th>
                    <th className="px-4 py-2 text-left">Details</th>
                    <th className="px-4 py-2 text-left">Source</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Created</th>
                    <th className="px-4 py-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {mixedQueue.flatMap((entry) => {
                    if (entry.kind === 'ticket') {
                      return entry.group.items.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-gray-50 align-top">
                          <td className="px-4 py-2">
                            {idx === 0 ? (
                              <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                                Ticket
                              </span>
                            ) : (
                              ''
                            )}
                          </td>
                          <td className="px-4 py-2 font-mono text-[11px] text-gray-700">
                            {idx === 0 ? entry.displayId : ''}
                          </td>
                          <td className="px-4 py-2">{idx === 0 ? entry.group.delivery_batch : ''}</td>
                          <td className="px-4 py-2">
                            {idx === 0
                              ? new Date(entry.group.delivery_date).toLocaleDateString('en-GB')
                              : ''}
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
                                  entry.group.channel === 'B2B'
                                    ? 'bg-sky-50 text-sky-700'
                                    : 'bg-orange-50 text-orange-700'
                                }`}
                              >
                                {entry.group.channel}
                              </span>
                            ) : (
                              ''
                            )}
                          </td>
                          <td className="px-4 py-2">
                            <StatusBadge status="pending" />
                          </td>
                          <td className="px-4 py-2 text-[11px] text-gray-500">
                            {idx === 0
                              ? new Date(entry.group.created_at).toLocaleString('en-GB')
                              : ''}
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
                    }

                    return (
                      <tr key={entry.note.id} className="hover:bg-gray-50 align-top">
                        <td className="px-4 py-2">
                          <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                            CN
                          </span>
                        </td>
                        <td className="px-4 py-2 font-mono text-[11px] text-gray-700">{entry.displayId}</td>
                        <td className="px-4 py-2">{entry.note.customer_name}</td>
                        <td className="px-4 py-2">
                          {new Date(entry.note.delivery_date).toLocaleDateString('en-GB')}
                        </td>
                        <td className="px-4 py-2 text-[11px] text-gray-700">
                          <div>{entry.note.market_area}</div>
                          <div className="font-medium">
                            Amount:{' '}
                            {Number(entry.note.amount).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                            B2B
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <StatusBadge status="pending" />
                        </td>
                        <td className="px-4 py-2 text-[11px] text-gray-500">
                          {new Date(entry.note.created_at).toLocaleString('en-GB')}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex gap-2">
                            <button
                              disabled={actionLoadingId === `cn:${entry.note.id}`}
                              onClick={() => void handleCreditNoteDecision(entry.note.id, 'approved')}
                              className="rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 px-2.5 py-1 text-[11px] text-white"
                            >
                              Approve
                            </button>
                            <button
                              disabled={actionLoadingId === `cn:${entry.note.id}`}
                              onClick={() => void handleCreditNoteDecision(entry.note.id, 'rejected')}
                              className="rounded-md bg-red-600 hover:bg-red-500 disabled:opacity-60 px-2.5 py-1 text-[11px] text-white"
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
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
