import { Fragment, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Card } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/StatusBadge';

type TicketStatus = 'pending' | 'approved' | 'rejected';

interface Ticket {
  id: string;
  product_name: string;
  quantity: number;
  reason: string;
  delivery_batch: string;
  delivery_date: string;
  channel: 'B2B' | 'B2C';
  status: TicketStatus;
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

export default function TicketsPage() {
  const { user } = useAuth();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketsB2B, setTicketsB2B] = useState<Ticket[]>([]);
  const [ticketsB2C, setTicketsB2C] = useState<Ticket[]>([]);

  const [loading, setLoading] = useState(false);
  const [loadingB2B, setLoadingB2B] = useState(false);
  const [loadingB2C, setLoadingB2C] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [errorB2B, setErrorB2B] = useState<string | null>(null);
  const [errorB2C, setErrorB2C] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('all');
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  const isManagerView =
    user?.role === 'manager' || user?.role === 'admin';

  const groupTickets = (list: Ticket[]): TicketGroup[] => {
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
  };

  const groupKey = (g: TicketGroup): string =>
    `${g.delivery_batch}|${g.delivery_date}|${g.channel}|${g.created_at.slice(0, 16)}`;

  const mergedTickets = useMemo(() => {
    const byId = new Map<string, Ticket>();
    [...tickets, ...ticketsB2B, ...ticketsB2C].forEach((t) => byId.set(t.id, t));
    return Array.from(byId.values());
  }, [tickets, ticketsB2B, ticketsB2C]);

  const { getDisplayId, getLineId } = useMemo(() => {
    const allGroupsNewest = groupTickets(mergedTickets);
    const allGroupsAsc = [...allGroupsNewest].sort((a, b) => {
      const tA = new Date(a.created_at).getTime();
      const tB = new Date(b.created_at).getTime();
      if (tA !== tB) return tA - tB;
      return groupKey(a).localeCompare(groupKey(b));
    });
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
    const getDisplayId = (g: TicketGroup) => {
      const num = byKey.get(groupKey(g));
      return num != null ? `${g.channel}-${String(num).padStart(3, "0")}` : `${g.channel}-???`;
    };
    const getLineId = (displayId: string, itemId: string) => {
      const lineNum = byItemId.get(itemId);
      return lineNum != null ? `${displayId}-${lineNum}` : `${displayId}-?`;
    };
    return { getDisplayId, getLineId };
  }, [mergedTickets]);

  const handleDelete = async (e: React.MouseEvent, ticketId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm('Delete this ticket? This cannot be undone.')) return;
    setDeleteLoadingId(ticketId);
    setError(null);
    try {
      await apiClient.delete(`/tickets/${ticketId}`);
      if (isManagerView) {
        await loadTicketsByChannel();
      } else {
        await loadTickets();
      }
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err && err.response && typeof err.response === 'object' && 'data' in err.response && typeof (err.response as { data?: { detail?: string } }).data?.detail === 'string'
        ? (err.response as { data: { detail: string } }).data.detail
        : 'Failed to delete ticket.';
      setError(msg);
    } finally {
      setDeleteLoadingId(null);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTicket) return;
    const form = e.currentTarget;
    const get = (name: string) => form.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement | null;
    const payload = {
      product_name: get('product_name')?.value ?? '',
      quantity: Number(get('quantity')?.value ?? 0),
      reason: get('reason')?.value ?? '',
      delivery_batch: get('delivery_batch')?.value ?? '',
      delivery_date: get('delivery_date')?.value ?? '',
      photo_proof_url: null,
    };
    setError(null);
    try {
      await apiClient.patch(`/tickets/${editingTicket.id}`, payload);
      setEditingTicket(null);
      if (isManagerView) await loadTicketsByChannel();
      else await loadTickets();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err && err.response && typeof err.response === 'object' && 'data' in err.response && typeof (err.response as { data?: { detail?: string } }).data?.detail === 'string'
        ? (err.response as { data: { detail: string } }).data.detail
        : 'Failed to update ticket.';
      setError(msg);
    }
  };

  const loadTickets = async () => {
    // For B2B/B2C users, backend already filters by channel.
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ items: Ticket[]; total: number }>(
        '/tickets',
        {
          params: {
            limit: 100,
            status: statusFilter === 'all' ? undefined : statusFilter,
          },
        },
      );
      setTickets(res.data.items);
    } catch (err: unknown) {
      // Degrade gracefully when unauthorized or backend unavailable.
      setTickets([]);
      setError(null);
      // eslint-disable-next-line no-console
      console.warn('Tickets load failed', err);
    } finally {
      setLoading(false);
    }
  };

  const loadTicketsByChannel = async () => {
    // Manager/Admin: fetch B2B and B2C separately for two sections
    setLoadingB2B(true);
    setLoadingB2C(true);
    setErrorB2B(null);
    setErrorB2C(null);
    try {
      const [b2bRes, b2cRes] = await Promise.all([
        apiClient.get<{ items: Ticket[]; total: number }>('/tickets', {
          params: {
            limit: 100,
            status: statusFilter === 'all' ? undefined : statusFilter,
            channel: 'B2B',
          },
        }),
        apiClient.get<{ items: Ticket[]; total: number }>('/tickets', {
          params: {
            limit: 100,
            status: statusFilter === 'all' ? undefined : statusFilter,
            channel: 'B2C',
          },
        }),
      ]);
      setTicketsB2B(b2bRes.data.items);
      setTicketsB2C(b2cRes.data.items);
    } catch (err: unknown) {
      // Degrade gracefully without surfacing 401s to the user.
      setTicketsB2B([]);
      setTicketsB2C([]);
      setErrorB2B(null);
      setErrorB2C(null);
      // eslint-disable-next-line no-console
      console.warn('Tickets by channel load failed', err);
    } finally {
      setLoadingB2B(false);
      setLoadingB2C(false);
    }
  };

  useEffect(() => {
    if (isManagerView) {
      void loadTicketsByChannel();
    } else {
      void loadTickets();
    }
  }, [statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Tickets register</h2>
          <p className="text-sm text-gray-500">
            Channel-filtered view of all rejection tickets you have access to.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <label className="text-gray-500">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TicketStatus | 'all')}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-800"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {(error || errorB2B || errorB2C) && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error || errorB2B || errorB2C}
        </div>
      )}

      {!isManagerView && (
        <Card title="All tickets" subtitle="Based on your role and channel access" className="text-sm">
          {loading && <div className="text-gray-500">Loading tickets…</div>}
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">
              {error}
            </div>
          )}
          {!loading && !error && tickets.length === 0 && (
            <div className="text-gray-500 text-sm">No tickets yet.</div>
          )}
          {!loading && tickets.length > 0 && (
            <>
              {/* Mobile-friendly card list */}
              <div className="space-y-3 md:hidden">
                {groupTickets(tickets).map((g) => (
                  <div
                    key={g.id}
                    className="rounded-lg border border-gray-100 bg-white px-3 py-2 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-gray-900">
                        {g.delivery_batch}
                      </div>
                      {(() => {
                        const statuses = Array.from(new Set(g.items.map((i) => i.status)));
                        if (statuses.length === 1) {
                          return <StatusBadge status={statuses[0]} />;
                        }
                        return (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                            Multiple
                          </span>
                        );
                      })()}
                    </div>
                    <div className="mt-1 text-[11px] text-gray-500">
                      {g.channel} • {new Date(g.delivery_date).toLocaleDateString()}
                    </div>
                    <div className="mt-2 space-y-1 text-[11px] text-gray-600">
                      {g.items.map((item) => (
                        <div key={item.id} className="flex justify-between items-start gap-2">
                          <div>
                            <div>{item.product_name}</div>
                            <div className="text-[10px] text-gray-500">
                              {item.reason.length > 40 ? `${item.reason.slice(0, 40)}…` : item.reason}
                            </div>
                          </div>
                          <div className="text-right">
                            <div>
                              Qty:{' '}
                              <span className="font-medium">
                                {item.quantity}
                              </span>
                            </div>
                            <div className="mt-0.5">
                              <StatusBadge status={item.status} />
                            </div>
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

              {/* Desktop table - grouped with expandable product details */}
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 text-[11px] font-medium text-gray-500 uppercase">
                    <tr>
                      <th className="px-4 py-2 text-left">Ticket</th>
                      <th className="px-4 py-2 text-left">Delivery date</th>
                      <th className="px-4 py-2 text-left">Customer</th>
                      <th className="px-4 py-2 text-left">Channel</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2 text-left">Admin remark</th>
                      <th className="px-4 py-2 text-left">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {groupTickets(tickets).map((g) => {
                      const displayId = getDisplayId(g);
                      const statuses = Array.from(
                        new Set(g.items.map((i) => i.status)),
                      );
                      const singleStatus =
                        statuses.length === 1 ? statuses[0] : null;
                      const allRemarks = g.items
                        .map((i) => i.approval_remarks ?? i.rejection_remarks)
                        .filter(Boolean) as string[];
                      const remarksSummary = allRemarks.join(' | ');
                      const isExpanded = expandedGroupId === g.id;
                      return (
                        <>
                          <tr
                            key={g.id}
                            role="button"
                            tabIndex={0}
                            className="hover:bg-gray-50 cursor-pointer"
                            onClick={() =>
                              setExpandedGroupId((id) =>
                                id === g.id ? null : g.id,
                              )
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setExpandedGroupId((id) =>
                                  id === g.id ? null : g.id,
                                );
                              }
                            }}
                          >
                            <td className="px-4 py-2 font-medium text-[11px] text-gray-700">
                              {displayId}
                            </td>
                            <td className="px-4 py-2">
                              {new Date(g.delivery_date).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-2">
                              <span>{g.delivery_batch}</span>
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
                            <td
                              className="px-4 py-2 text-[11px] text-gray-600 max-w-[180px]"
                              title={remarksSummary || ''}
                            >
                              {remarksSummary
                                ? remarksSummary.length > 60
                                  ? `${remarksSummary.slice(0, 60)}…`
                                  : remarksSummary
                                : '–'}
                            </td>
                            <td className="px-4 py-2 text-[11px] text-gray-500">
                              {new Date(g.created_at).toLocaleString()}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-gray-50 border-l-4 border-l-indigo-300">
                              <td colSpan={7} className="px-4 py-3 text-xs">
                                <div className="space-y-2">
                                  <div className="font-medium text-gray-700">
                                    Products on this ticket (Ticket ID: {displayId})
                                  </div>
                                  <div className="border border-gray-200 rounded-md bg-white">
                                    <table className="min-w-full text-[11px]">
                                      <thead className="bg-gray-50 text-gray-500 uppercase">
                                        <tr>
                                          <th className="px-3 py-1 text-left">Line</th>
                                          <th className="px-3 py-1 text-left">
                                            Product
                                          </th>
                                          <th className="px-3 py-1 text-left">
                                            Qty
                                          </th>
                                          <th className="px-3 py-1 text-left">
                                            Status
                                          </th>
                                          <th className="px-3 py-1 text-left">
                                            Creator reason
                                          </th>
                                          <th className="px-3 py-1 text-left">
                                            Admin remark
                                          </th>
                                          {isManagerView && (
                                            <th className="px-3 py-1 text-left">
                                              Action
                                            </th>
                                          )}
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100">
                                        {g.items.map((item) => (
                                          <tr key={item.id}>
                                            <td className="px-3 py-1 font-medium text-gray-700">{getLineId(displayId, item.id)}</td>
                                            <td className="px-3 py-1">
                                              {item.product_name}
                                            </td>
                                            <td className="px-3 py-1">
                                              {item.quantity}
                                            </td>
                                            <td className="px-3 py-1">
                                              <StatusBadge
                                                status={item.status}
                                              />
                                            </td>
                                            <td
                                              className="px-3 py-1 text-gray-700 max-w-[180px]"
                                              title={item.reason}
                                            >
                                              {item.reason.length > 60
                                                ? `${item.reason.slice(0, 60)}…`
                                                : item.reason}
                                            </td>
                                            <td
                                              className="px-3 py-1 text-gray-700 max-w-[180px]"
                                              title={
                                                item.approval_remarks ??
                                                item.rejection_remarks ??
                                                ''
                                              }
                                            >
                                              {(item.approval_remarks ??
                                                item.rejection_remarks ??
                                                ''
                                              ).length > 60
                                                ? `${(
                                                    item.approval_remarks ??
                                                    item.rejection_remarks ??
                                                    ''
                                                  ).slice(0, 60)}…`
                                                : item.approval_remarks ??
                                                  item.rejection_remarks ??
                                                  '–'}
                                            </td>
                                            {isManagerView && (
                                              <td
                                                className="px-3 py-1"
                                                onClick={(e) => e.stopPropagation()}
                                              >
                                                <div className="flex gap-1">
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      const base = tickets.find((t) => t.id === item.id);
                                                      if (base) setEditingTicket(base);
                                                    }}
                                                    className="rounded px-2 py-1 text-[11px] bg-sky-100 text-sky-700 hover:bg-sky-200"
                                                  >
                                                    Edit
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      void handleDelete(e, item.id);
                                                    }}
                                                    disabled={deleteLoadingId === item.id}
                                                    className="rounded px-2 py-1 text-[11px] bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                                                  >
                                                    {deleteLoadingId === item.id ? '…' : 'Delete'}
                                                  </button>
                                                </div>
                                              </td>
                                            )}
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
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      )}

      {isManagerView && (
        <div className="grid grid-cols-1 gap-4">
          <Card
            title="B2B tickets"
            subtitle="Rejection tickets for B2B customers"
            className="text-sm"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-gray-500">
                {ticketsB2B.length} records
              </span>
            </div>
            {loadingB2B && (
              <div className="text-gray-500">Loading B2B tickets…</div>
            )}
            {errorB2B && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">
                {errorB2B}
              </div>
            )}
            {!loadingB2B && !errorB2B && ticketsB2B.length === 0 && (
              <div className="text-gray-500 text-sm">No B2B tickets.</div>
            )}
            {!loadingB2B && ticketsB2B.length > 0 && (
              <>
                {/* Mobile cards */}
                <div className="space-y-3 md:hidden">
                  {groupTickets(ticketsB2B).map((g) => {
                    const statuses = Array.from(new Set(g.items.map((i) => i.status)));
                    const singleStatus = statuses.length === 1 ? statuses[0] : null;
                    return (
                      <div
                        key={g.id}
                        className="rounded-lg border border-gray-100 bg-white px-3 py-2.5 shadow-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium text-gray-900">
                            {g.delivery_batch}
                          </div>
                          {singleStatus ? (
                            <StatusBadge status={singleStatus} />
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                              Multiple
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-[11px] text-gray-500">
                          {new Date(g.delivery_date).toLocaleDateString()}
                        </div>
                        <div className="mt-2 space-y-2 text-[11px] text-gray-600">
                          {g.items.map((item) => {
                            const baseItem = ticketsB2B.find((t) => t.id === item.id);
                            return (
                              <div key={item.id} className="rounded-md border border-gray-100 bg-gray-50 px-2 py-2">
                                <div className="flex justify-between items-start gap-2">
                                  <div>
                                    <div className="font-medium text-gray-800">{item.product_name}</div>
                                    <div className="text-[10px] text-gray-500">
                                      {item.reason.length > 40
                                        ? `${item.reason.slice(0, 40)}…`
                                        : item.reason}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div>
                                      Qty:{' '}
                                      <span className="font-medium">
                                        {item.quantity}
                                      </span>
                                    </div>
                                    <div className="mt-0.5">
                                      <StatusBadge status={item.status} />
                                    </div>
                                  </div>
                                </div>
                                {isManagerView && baseItem && (
                                  <div className="mt-2 flex gap-2">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingTicket(baseItem);
                                      }}
                                      className="flex-1 rounded-full bg-sky-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-sky-500"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void handleDelete(e, item.id);
                                      }}
                                      disabled={deleteLoadingId === item.id}
                                      className="flex-1 rounded-full bg-red-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-red-500 disabled:opacity-60"
                                    >
                                      {deleteLoadingId === item.id ? 'Deleting…' : 'Delete'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-1 text-[11px] text-gray-400">
                          {new Date(g.created_at).toLocaleString()}
                        </div>
                        {/* Each subticket has actions above */}
                      </div>
                    );
                  })}
                </div>

                {/* Desktop table - grouped for B2B, clickable expandable rows */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50 text-[11px] font-medium text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">Ticket</th>
                        <th className="px-4 py-2 text-left">Delivery date</th>
                        <th className="px-4 py-2 text-left">Customer</th>
                        <th className="px-4 py-2 text-left">Channel</th>
                        <th className="px-4 py-2 text-left">Status</th>
                        <th className="px-4 py-2 text-left">Admin remark</th>
                        <th className="px-4 py-2 text-left">Created</th>
                        {isManagerView && <th className="px-4 py-2 text-left">Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {groupTickets(ticketsB2B).map((g) => {
                        const displayId = getDisplayId(g);
                        const statuses = Array.from(
                          new Set(g.items.map((i) => i.status)),
                        );
                        const singleStatus =
                          statuses.length === 1 ? statuses[0] : null;
                        const allRemarks = g.items
                          .map((i) => i.approval_remarks ?? i.rejection_remarks)
                          .filter(Boolean) as string[];
                        const remarksSummary = allRemarks.join(' | ');
                        const isExpanded = expandedGroupId === g.id;
                        return (
                        <Fragment key={g.id}>
                          <tr
                            role="button"
                            tabIndex={0}
                            className="hover:bg-gray-50 cursor-pointer"
                            onClick={() =>
                              setExpandedGroupId((id) =>
                                id === g.id ? null : g.id,
                              )
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setExpandedGroupId((id) =>
                                  id === g.id ? null : g.id,
                                );
                              }
                            }}
                          >
                            <td className="px-4 py-2 font-medium text-[11px] text-gray-700">
                              {displayId}
                            </td>
                            <td className="px-4 py-2">
                              {new Date(g.delivery_date).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-2">
                              <span>{g.delivery_batch}</span>
                            </td>
                            <td className="px-4 py-2 text-xs">
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-sky-50 text-sky-700">
                                B2B
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
                            <td
                              className="px-4 py-2 text-[11px] text-gray-600 max-w-[180px]"
                              title={remarksSummary || ''}
                            >
                              {remarksSummary
                                ? remarksSummary.length > 60
                                  ? `${remarksSummary.slice(0, 60)}…`
                                  : remarksSummary
                                : '–'}
                            </td>
                            <td className="px-4 py-2 text-[11px] text-gray-500">
                              {new Date(g.created_at).toLocaleString()}
                            </td>
                            {isManagerView && (
                              <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const firstId = g.items[0]?.id;
                                      if (!firstId) return;
                                      const base = ticketsB2B.find(
                                        (t) => t.id === firstId,
                                      );
                                      if (base) setEditingTicket(base);
                                    }}
                                    className="rounded px-2 py-1 text-[11px] bg-sky-100 text-sky-700 hover:bg-sky-200"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      const firstId = g.items[0]?.id;
                                      if (!firstId) return;
                                      void handleDelete(e, firstId);
                                    }}
                                    disabled={deleteLoadingId === g.items[0]?.id}
                                    className="rounded px-2 py-1 text-[11px] bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                                  >
                                    {deleteLoadingId === g.items[0]?.id
                                      ? '…'
                                      : 'Delete'}
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                          {isExpanded && (
                            <tr className="bg-gray-50 border-l-4 border-l-indigo-300">
                              <td colSpan={isManagerView ? 8 : 7} className="px-4 py-3 text-xs">
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
                                          {isManagerView && <th className="px-3 py-1 text-left">Action</th>}
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100">
                                        {g.items.map((item) => (
                                          <tr key={item.id}>
                                            <td className="px-3 py-1 font-medium text-gray-700">{getLineId(displayId, item.id)}</td>
                                            <td className="px-3 py-1">{item.product_name}</td>
                                            <td className="px-3 py-1">{item.quantity}</td>
                                            <td className="px-3 py-1">
                                              <StatusBadge status={item.status} />
                                            </td>
                                            <td
                                              className="px-3 py-1 text-gray-700 max-w-[180px]"
                                              title={item.reason}
                                            >
                                              {item.reason.length > 60
                                                ? `${item.reason.slice(0, 60)}…`
                                                : item.reason}
                                            </td>
                                            <td
                                              className="px-3 py-1 text-gray-700 max-w-[180px]"
                                              title={
                                                item.approval_remarks ??
                                                item.rejection_remarks ??
                                                ''
                                              }
                                            >
                                              {(item.approval_remarks ??
                                                item.rejection_remarks ??
                                                ''
                                              ).length > 60
                                                ? `${(
                                                    item.approval_remarks ??
                                                    item.rejection_remarks ??
                                                    ''
                                                  ).slice(0, 60)}…`
                                                : item.approval_remarks ??
                                                  item.rejection_remarks ??
                                                  '–'}
                                            </td>
                                            {isManagerView && (
                                              <td className="px-3 py-1" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex gap-1">
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      const base = ticketsB2B.find((t) => t.id === item.id);
                                                      if (base) setEditingTicket(base);
                                                    }}
                                                    className="rounded px-2 py-1 text-[11px] bg-sky-100 text-sky-700 hover:bg-sky-200"
                                                  >
                                                    Edit
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      void handleDelete(e, item.id);
                                                    }}
                                                    disabled={deleteLoadingId === item.id}
                                                    className="rounded px-2 py-1 text-[11px] bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                                                  >
                                                    {deleteLoadingId === item.id ? '…' : 'Delete'}
                                                  </button>
                                                </div>
                                              </td>
                                            )}
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );})}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>

          <Card
            title="B2C tickets"
            subtitle="Rejection tickets for B2C orders"
            className="text-sm"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-gray-500">
                {ticketsB2C.length} records
              </span>
            </div>
            {loadingB2C && (
              <div className="text-gray-500">Loading B2C tickets…</div>
            )}
            {errorB2C && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">
                {errorB2C}
              </div>
            )}
            {!loadingB2C && !errorB2C && ticketsB2C.length === 0 && (
              <div className="text-gray-500 text-sm">No B2C tickets.</div>
            )}
            {!loadingB2C && ticketsB2C.length > 0 && (
              <>
                {/* Mobile cards - grouped */}
                <div className="space-y-3 md:hidden">
                  {groupTickets(ticketsB2C).map((g) => {
                    const statuses = Array.from(new Set(g.items.map((i) => i.status)));
                    const singleStatus = statuses.length === 1 ? statuses[0] : null;
                    return (
                      <div
                        key={g.id}
                        className="rounded-lg border border-gray-100 bg-white px-3 py-2.5 shadow-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium text-gray-900">
                            {g.delivery_batch}
                          </div>
                          {singleStatus ? (
                            <StatusBadge status={singleStatus} />
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                              Multiple
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-[11px] text-gray-500">
                          {new Date(g.delivery_date).toLocaleDateString()}
                        </div>
                        <div className="mt-2 space-y-2 text-[11px] text-gray-600">
                          {g.items.map((item) => {
                            const baseItem = ticketsB2C.find((t) => t.id === item.id);
                            return (
                              <div key={item.id} className="rounded-md border border-gray-100 bg-gray-50 px-2 py-2">
                                <div className="flex justify-between items-start gap-2">
                                  <div>
                                    <div className="font-medium text-gray-800">{item.product_name}</div>
                                    <div className="text-[10px] text-gray-500">
                                      {item.reason.length > 40
                                        ? `${item.reason.slice(0, 40)}…`
                                        : item.reason}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div>
                                      Qty: <span className="font-medium">{item.quantity}</span>
                                    </div>
                                    <div className="mt-0.5">
                                      <StatusBadge status={item.status} />
                                    </div>
                                  </div>
                                </div>
                                {isManagerView && baseItem && (
                                  <div className="mt-2 flex gap-2">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingTicket(baseItem);
                                      }}
                                      className="flex-1 rounded-full bg-sky-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-sky-500"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void handleDelete(e, item.id);
                                      }}
                                      disabled={deleteLoadingId === item.id}
                                      className="flex-1 rounded-full bg-red-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-red-500 disabled:opacity-60"
                                    >
                                      {deleteLoadingId === item.id ? 'Deleting…' : 'Delete'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-1 text-[11px] text-gray-400">
                          {new Date(g.created_at).toLocaleString()}
                        </div>
                        {/* Each subticket has actions above */}
                      </div>
                    );
                  })}
                </div>

                {/* Desktop table - grouped for B2C, clickable expandable rows */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50 text-[11px] font-medium text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">Ticket</th>
                        <th className="px-4 py-2 text-left">Delivery date</th>
                        <th className="px-4 py-2 text-left">Customer</th>
                        <th className="px-4 py-2 text-left">Channel</th>
                        <th className="px-4 py-2 text-left">Status</th>
                        <th className="px-4 py-2 text-left">Admin remark</th>
                        <th className="px-4 py-2 text-left">Created</th>
                        {isManagerView && <th className="px-4 py-2 text-left">Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {groupTickets(ticketsB2C).map((g) => {
                        const displayId = getDisplayId(g);
                        const statuses = Array.from(
                          new Set(g.items.map((i) => i.status)),
                        );
                        const singleStatus =
                          statuses.length === 1 ? statuses[0] : null;
                        const allRemarks = g.items
                          .map((i) => i.approval_remarks ?? i.rejection_remarks)
                          .filter(Boolean) as string[];
                        const remarksSummary = allRemarks.join(' | ');
                        const isExpanded = expandedGroupId === g.id;
                        return (
                          <Fragment key={g.id}>
                            <tr
                              role="button"
                              tabIndex={0}
                              className="hover:bg-gray-50 cursor-pointer"
                              onClick={() =>
                                setExpandedGroupId((id) =>
                                  id === g.id ? null : g.id,
                                )
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setExpandedGroupId((id) =>
                                    id === g.id ? null : g.id,
                                  );
                                }
                              }}
                            >
                              <td className="px-4 py-2 font-medium text-[11px] text-gray-700">
                                {displayId}
                              </td>
                              <td className="px-4 py-2">
                                {new Date(g.delivery_date).toLocaleDateString()}
                              </td>
                              <td className="px-4 py-2">
                                <span>{g.delivery_batch}</span>
                              </td>
                              <td className="px-4 py-2 text-xs">
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-orange-50 text-orange-700">
                                  B2C
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
                              <td
                                className="px-4 py-2 text-[11px] text-gray-600 max-w-[180px]"
                                title={remarksSummary || ''}
                              >
                                {remarksSummary
                                  ? remarksSummary.length > 60
                                    ? `${remarksSummary.slice(0, 60)}…`
                                    : remarksSummary
                                  : '–'}
                              </td>
                              <td className="px-4 py-2 text-[11px] text-gray-500">
                                {new Date(g.created_at).toLocaleString()}
                              </td>
                              {isManagerView && (
                                <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex gap-1">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const firstId = g.items[0]?.id;
                                        if (!firstId) return;
                                        const base = ticketsB2C.find(
                                          (t) => t.id === firstId,
                                        );
                                        if (base) setEditingTicket(base);
                                      }}
                                      className="rounded px-2 py-1 text-[11px] bg-sky-100 text-sky-700 hover:bg-sky-200"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        const firstId = g.items[0]?.id;
                                        if (!firstId) return;
                                        void handleDelete(e, firstId);
                                      }}
                                      disabled={deleteLoadingId === g.items[0]?.id}
                                      className="rounded px-2 py-1 text-[11px] bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                                    >
                                      {deleteLoadingId === g.items[0]?.id
                                        ? '…'
                                        : 'Delete'}
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                            {isExpanded && (
                              <tr className="bg-gray-50 border-l-4 border-l-indigo-300">
                                <td colSpan={isManagerView ? 8 : 7} className="px-4 py-3 text-xs">
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
                                            {isManagerView && <th className="px-3 py-1 text-left">Action</th>}
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                          {g.items.map((item) => (
                                            <tr key={item.id}>
                                              <td className="px-3 py-1 font-medium text-gray-700">{getLineId(displayId, item.id)}</td>
                                              <td className="px-3 py-1">{item.product_name}</td>
                                              <td className="px-3 py-1">{item.quantity}</td>
                                              <td className="px-3 py-1">
                                                <StatusBadge status={item.status} />
                                              </td>
                                              <td
                                                className="px-3 py-1 text-gray-700 max-w-[180px]"
                                                title={item.reason}
                                              >
                                                {item.reason.length > 60
                                                  ? `${item.reason.slice(0, 60)}…`
                                                  : item.reason}
                                              </td>
                                              <td
                                                className="px-3 py-1 text-gray-700 max-w-[180px]"
                                                title={
                                                  item.approval_remarks ??
                                                  item.rejection_remarks ??
                                                  ''
                                                }
                                              >
                                                {(item.approval_remarks ??
                                                  item.rejection_remarks ??
                                                  ''
                                                ).length > 60
                                                  ? `${(
                                                      item.approval_remarks ??
                                                      item.rejection_remarks ??
                                                      ''
                                                    ).slice(0, 60)}…`
                                                  : item.approval_remarks ??
                                                    item.rejection_remarks ??
                                                    '–'}
                                              </td>
                                              {isManagerView && (
                                                <td className="px-3 py-1" onClick={(e) => e.stopPropagation()}>
                                                  <div className="flex gap-1">
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        const base = ticketsB2C.find((t) => t.id === item.id);
                                                        if (base) setEditingTicket(base);
                                                      }}
                                                      className="rounded px-2 py-1 text-[11px] bg-sky-100 text-sky-700 hover:bg-sky-200"
                                                    >
                                                      Edit
                                                    </button>
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        void handleDelete(e, item.id);
                                                      }}
                                                      disabled={deleteLoadingId === item.id}
                                                      className="rounded px-2 py-1 text-[11px] bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                                                    >
                                                      {deleteLoadingId === item.id ? '…' : 'Delete'}
                                                    </button>
                                                  </div>
                                                </td>
                                              )}
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      {/* Edit ticket modal */}
      {editingTicket && (() => {
        const groups = groupTickets(mergedTickets);
        const group = groups.find((gg) => gg.items.some((it) => it.id === editingTicket.id));
        const displayId = group ? getDisplayId(group) : `${editingTicket.channel}-???`;
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Edit ticket</h3>
              <p className="text-xs text-gray-500 mt-0.5">Ticket ID: {displayId}</p>
            </div>
            <form onSubmit={handleEditSubmit} className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Product name</label>
                <input name="product_name" defaultValue={editingTicket.product_name} className="w-full rounded border border-gray-200 px-3 py-2 text-sm" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Quantity</label>
                <input name="quantity" type="number" min={0} defaultValue={editingTicket.quantity} className="w-full rounded border border-gray-200 px-3 py-2 text-sm" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Customer</label>
                <input name="delivery_batch" defaultValue={editingTicket.delivery_batch} className="w-full rounded border border-gray-200 px-3 py-2 text-sm" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Delivery date</label>
                <input name="delivery_date" type="date" defaultValue={editingTicket.delivery_date} className="w-full rounded border border-gray-200 px-3 py-2 text-sm" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Creator reason</label>
                <textarea name="reason" defaultValue={editingTicket.reason} className="w-full rounded border border-gray-200 px-3 py-2 text-sm min-h-[60px]" required />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditingTicket(null)} className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" className="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-500">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
        );
      })()}
    </div>
  );
}


