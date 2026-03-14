import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Card } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/StatusBadge';

type TicketStatus = 'pending' | 'approved' | 'rejected';

interface Ticket {
  id: string;
  product_name: string;
  quantity: number;
  cost: number;
  reason: string;
  delivery_batch: string;
  delivery_date: string;
  channel: 'B2B' | 'B2C';
  status: TicketStatus;
  created_at: string;
  rejection_remarks?: string | null;
  approval_remarks?: string | null;
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

  const isManagerView =
    user?.role === 'manager' || user?.role === 'admin';

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
      cost: Number(get('cost')?.value ?? 0),
      reason: get('reason')?.value ?? '',
      delivery_batch: get('delivery_batch')?.value ?? '',
      delivery_date: get('delivery_date')?.value ?? '',
      photo_proof_url: get('photo_proof_url')?.value || null,
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
                {tickets.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-lg border border-gray-100 bg-white px-3 py-2 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-gray-900">
                        {t.product_name}
                      </div>
                      <StatusBadge status={t.status} />
                    </div>
                    <div className="mt-1 text-[11px] text-gray-500">
                      {t.channel} • {t.delivery_batch}
                    </div>
                    <div className="mt-2 flex justify-between text-[11px] text-gray-600">
                      <span>
                        Qty: <span className="font-medium">{t.quantity}</span>
                      </span>
                      <span>
                        {Number(t.cost || 0).toLocaleString('en-IN', {
                          style: 'currency',
                          currency: 'INR',
                          maximumFractionDigits: 0,
                        })}
                      </span>
                    </div>
                    {(t.reason || t.approval_remarks) && (
                      <div className="mt-1 text-[11px] text-gray-600">
                        {t.reason && <span>Creator: {t.reason.length > 60 ? `${t.reason.slice(0, 60)}…` : t.reason}</span>}
                        {(t.approval_remarks ?? t.rejection_remarks) && <span className="block mt-0.5">Admin: {((t.approval_remarks ?? t.rejection_remarks)!.length > 60 ? `${(t.approval_remarks ?? t.rejection_remarks)!.slice(0, 60)}…` : (t.approval_remarks ?? t.rejection_remarks))}</span>}
                      </div>
                    )}
                    <div className="mt-1 text-[11px] text-gray-400">
                      {new Date(t.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 text-[11px] font-medium text-gray-500 uppercase">
                    <tr>
                      <th className="px-4 py-2 text-left">Ticket ID</th>
                      <th className="px-4 py-2 text-left">Product</th>
                      <th className="px-4 py-2 text-left">Qty</th>
                      <th className="px-4 py-2 text-left">Cost</th>
                      <th className="px-4 py-2 text-left">Channel</th>
                      <th className="px-4 py-2 text-left">Customer</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2 text-left">Creator reason</th>
                      <th className="px-4 py-2 text-left">Admin remark</th>
                      <th className="px-4 py-2 text-left">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tickets.map((t) => (
                      <tr key={t.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono text-[11px] text-gray-600">
                          {t.id.slice(0, 8)}
                        </td>
                        <td className="px-4 py-2">{t.product_name}</td>
                        <td className="px-4 py-2">{t.quantity}</td>
                        <td className="px-4 py-2">
                          {Number(t.cost || 0).toLocaleString('en-IN', {
                            style: 'currency',
                            currency: 'INR',
                            maximumFractionDigits: 0,
                          })}
                        </td>
                        <td className="px-4 py-2 text-xs">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              t.channel === 'B2B'
                                ? 'bg-sky-50 text-sky-700'
                                : 'bg-orange-50 text-orange-700'
                            }`}
                          >
                            {t.channel}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-col">
                            <span>{t.delivery_batch}</span>
                            <span className="text-[11px] text-gray-500">
                              {new Date(t.delivery_date).toLocaleDateString()}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <StatusBadge status={t.status} />
                        </td>
                        <td className="px-4 py-2 text-[11px] text-gray-600 max-w-[140px]" title={t.reason}>
                          {t.reason ? (t.reason.length > 40 ? `${t.reason.slice(0, 40)}…` : t.reason) : '–'}
                        </td>
                        <td className="px-4 py-2 text-[11px] text-gray-600 max-w-[140px]" title={t.approval_remarks ?? t.rejection_remarks ?? ''}>
                          {(t.approval_remarks ?? t.rejection_remarks) ? ((t.approval_remarks ?? t.rejection_remarks)!.length > 40 ? `${(t.approval_remarks ?? t.rejection_remarks)!.slice(0, 40)}…` : (t.approval_remarks ?? t.rejection_remarks)) : '–'}
                        </td>
                        <td className="px-4 py-2 text-[11px] text-gray-500">
                          {new Date(t.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      )}

      {isManagerView && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
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
                  {ticketsB2B.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-lg border border-gray-100 bg-white px-3 py-2 shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium text-gray-900">
                          {t.product_name}
                        </div>
                        <StatusBadge status={t.status} />
                      </div>
                      <div className="mt-1 text-[11px] text-gray-500">
                        {t.delivery_batch}
                      </div>
                      {(t.reason || t.approval_remarks) && (
                        <div className="mt-1 text-[11px] text-gray-600">
                          {t.reason && <span>Creator: {t.reason.length > 50 ? `${t.reason.slice(0, 50)}…` : t.reason}</span>}
                          {(t.approval_remarks ?? t.rejection_remarks) && <span className="block mt-0.5">Admin: {((t.approval_remarks ?? t.rejection_remarks)!.length > 50 ? `${(t.approval_remarks ?? t.rejection_remarks)!.slice(0, 50)}…` : (t.approval_remarks ?? t.rejection_remarks))}</span>}
                        </div>
                      )}
                      <div className="mt-2 flex justify-between text-[11px] text-gray-600">
                        <span>
                          Qty: <span className="font-medium">{t.quantity}</span>
                        </span>
                        <span>
                          {Number(t.cost || 0).toLocaleString('en-IN', {
                            style: 'currency',
                            currency: 'INR',
                            maximumFractionDigits: 0,
                          })}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-gray-400">
                        {new Date(t.delivery_date).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50 text-[11px] font-medium text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">Ticket ID</th>
                        <th className="px-4 py-2 text-left">Product</th>
                        <th className="px-4 py-2 text-left">Qty</th>
                        <th className="px-4 py-2 text-left">Cost</th>
                        <th className="px-4 py-2 text-left">Customer</th>
                        <th className="px-4 py-2 text-left">Status</th>
                        <th className="px-4 py-2 text-left">Creator reason</th>
                        <th className="px-4 py-2 text-left">Admin remark</th>
                        {isManagerView && <th className="px-4 py-2 text-left">Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {ticketsB2B.map((t) => (
                        <tr
                          key={t.id}
                          className="hover:bg-gray-50"
                        >
                          <td className="px-4 py-2 font-mono text-[11px] text-gray-600">
                            {t.id.slice(0, 8)}
                          </td>
                          <td className="px-4 py-2">{t.product_name}</td>
                          <td className="px-4 py-2">{t.quantity}</td>
                          <td className="px-4 py-2">
                            {Number(t.cost || 0).toLocaleString('en-IN', {
                              style: 'currency',
                              currency: 'INR',
                              maximumFractionDigits: 0,
                            })}
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex flex-col">
                              <span>{t.delivery_batch}</span>
                              <span className="text-[11px] text-gray-500">
                                {new Date(t.delivery_date).toLocaleDateString()}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <StatusBadge status={t.status} />
                          </td>
                          <td className="px-4 py-2 text-[11px] text-gray-600 max-w-[140px]" title={t.reason}>
                            {t.reason ? (t.reason.length > 40 ? `${t.reason.slice(0, 40)}…` : t.reason) : '–'}
                          </td>
                          <td className="px-4 py-2 text-[11px] text-gray-600 max-w-[140px]" title={t.approval_remarks ?? t.rejection_remarks ?? ''}>
                            {(t.approval_remarks ?? t.rejection_remarks) ? ((t.approval_remarks ?? t.rejection_remarks)!.length > 40 ? `${(t.approval_remarks ?? t.rejection_remarks)!.slice(0, 40)}…` : (t.approval_remarks ?? t.rejection_remarks)) : '–'}
                          </td>
                          {isManagerView && (
                            <td className="px-4 py-2">
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setEditingTicket(t); }}
                                  className="rounded px-2 py-1 text-[11px] bg-sky-100 text-sky-700 hover:bg-sky-200"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => void handleDelete(e, t.id)}
                                  disabled={deleteLoadingId === t.id}
                                  className="rounded px-2 py-1 text-[11px] bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                                >
                                  {deleteLoadingId === t.id ? '…' : 'Delete'}
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
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
                {/* Mobile cards */}
                <div className="space-y-3 md:hidden">
                  {ticketsB2C.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-lg border border-gray-100 bg-white px-3 py-2 shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium text-gray-900">
                          {t.product_name}
                        </div>
                        <StatusBadge status={t.status} />
                      </div>
                      <div className="mt-1 text-[11px] text-gray-500">
                        {t.delivery_batch}
                      </div>
                      {(t.reason || t.approval_remarks) && (
                        <div className="mt-1 text-[11px] text-gray-600">
                          {t.reason && <span>Creator: {t.reason.length > 50 ? `${t.reason.slice(0, 50)}…` : t.reason}</span>}
                          {(t.approval_remarks ?? t.rejection_remarks) && <span className="block mt-0.5">Admin: {((t.approval_remarks ?? t.rejection_remarks)!.length > 50 ? `${(t.approval_remarks ?? t.rejection_remarks)!.slice(0, 50)}…` : (t.approval_remarks ?? t.rejection_remarks))}</span>}
                        </div>
                      )}
                      <div className="mt-2 flex justify-between text-[11px] text-gray-600">
                        <span>
                          Qty: <span className="font-medium">{t.quantity}</span>
                        </span>
                        <span>
                          {Number(t.cost || 0).toLocaleString('en-IN', {
                            style: 'currency',
                            currency: 'INR',
                            maximumFractionDigits: 0,
                          })}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-gray-400">
                        {new Date(t.delivery_date).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50 text-[11px] font-medium text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">Ticket ID</th>
                        <th className="px-4 py-2 text-left">Product</th>
                        <th className="px-4 py-2 text-left">Qty</th>
                        <th className="px-4 py-2 text-left">Cost</th>
                        <th className="px-4 py-2 text-left">Customer</th>
                        <th className="px-4 py-2 text-left">Status</th>
                        <th className="px-4 py-2 text-left">Creator reason</th>
                        <th className="px-4 py-2 text-left">Admin remark</th>
                        {isManagerView && <th className="px-4 py-2 text-left">Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {ticketsB2C.map((t) => (
                        <tr
                          key={t.id}
                          className="hover:bg-gray-50"
                        >
                          <td className="px-4 py-2 font-mono text-[11px] text-gray-600">
                            {t.id.slice(0, 8)}
                          </td>
                          <td className="px-4 py-2">{t.product_name}</td>
                          <td className="px-4 py-2">{t.quantity}</td>
                          <td className="px-4 py-2">
                            {Number(t.cost || 0).toLocaleString('en-IN', {
                              style: 'currency',
                              currency: 'INR',
                              maximumFractionDigits: 0,
                            })}
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex flex-col">
                              <span>{t.delivery_batch}</span>
                              <span className="text-[11px] text-gray-500">
                                {new Date(t.delivery_date).toLocaleDateString()}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <StatusBadge status={t.status} />
                          </td>
                          <td className="px-4 py-2 text-[11px] text-gray-600 max-w-[140px]" title={t.reason}>
                            {t.reason ? (t.reason.length > 40 ? `${t.reason.slice(0, 40)}…` : t.reason) : '–'}
                          </td>
                          <td className="px-4 py-2 text-[11px] text-gray-600 max-w-[140px]" title={t.approval_remarks ?? t.rejection_remarks ?? ''}>
                            {(t.approval_remarks ?? t.rejection_remarks) ? ((t.approval_remarks ?? t.rejection_remarks)!.length > 40 ? `${(t.approval_remarks ?? t.rejection_remarks)!.slice(0, 40)}…` : (t.approval_remarks ?? t.rejection_remarks)) : '–'}
                          </td>
                          {isManagerView && (
                            <td className="px-4 py-2">
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setEditingTicket(t); }}
                                  className="rounded px-2 py-1 text-[11px] bg-sky-100 text-sky-700 hover:bg-sky-200"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => void handleDelete(e, t.id)}
                                  disabled={deleteLoadingId === t.id}
                                  className="rounded px-2 py-1 text-[11px] bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                                >
                                  {deleteLoadingId === t.id ? '…' : 'Delete'}
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      {/* Edit ticket modal */}
      {editingTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Edit ticket</h3>
              <p className="text-xs text-gray-500 mt-0.5">Ticket ID: {editingTicket.id.slice(0, 8)}</p>
            </div>
            <form onSubmit={handleEditSubmit} className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Product name</label>
                <input name="product_name" defaultValue={editingTicket.product_name} className="w-full rounded border border-gray-200 px-3 py-2 text-sm" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Quantity</label>
                  <input name="quantity" type="number" min={0} defaultValue={editingTicket.quantity} className="w-full rounded border border-gray-200 px-3 py-2 text-sm" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Cost</label>
                  <input name="cost" type="number" min={0} step="0.01" defaultValue={editingTicket.cost} className="w-full rounded border border-gray-200 px-3 py-2 text-sm" required />
                </div>
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
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Photo proof URL (optional)</label>
                <input name="photo_proof_url" defaultValue={(editingTicket as { photo_proof_url?: string }).photo_proof_url ?? ''} className="w-full rounded border border-gray-200 px-3 py-2 text-sm" />
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
      )}
    </div>
  );
}


