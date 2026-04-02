import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { CustomerNameField } from '../components/CustomerNameField';
import { Card } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/StatusBadge';
import { CUSTOMER_SUGGESTIONS } from '../data/rejectionTicketSuggestions';
import { rememberCustomerNameAfterSubmit } from '../lib/savedCustomerNames';
import { CREDIT_NOTE_MARKET_AREAS } from '../data/creditNoteMarketAreas';

type CNStatus = 'pending' | 'approved' | 'rejected';

interface CreditNote {
  id: string;
  delivery_date: string;
  customer_name: string;
  market_area: string;
  amount: number;
  amount_safe: number;
  amount_warning: number;
  amount_danger: number;
  amount_doubtful: number;
  status: CNStatus;
  created_at: string;
  created_by: string;
  approval_remarks?: string | null;
  rejection_remarks?: string | null;
}

const CHANNEL_PREFIX = 'CN-B2B';

export default function CreditNotesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<CreditNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<CNStatus | 'all'>('all');
  const [editing, setEditing] = useState<CreditNote | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [revertId, setRevertId] = useState<string | null>(null);
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editDeliveryDate, setEditDeliveryDate] = useState('');
  const [editMarketArea, setEditMarketArea] = useState('');
  const [editAmount, setEditAmount] = useState('');

  const isManager = user?.role === 'manager' || user?.role === 'admin';
  const canAccess = user?.role === 'b2b' || isManager;

  const load = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ items: CreditNote[]; total: number }>('/credit-notes', {
        params: {
          limit: 200,
          status: statusFilter === 'all' ? undefined : statusFilter,
        },
      });
      setItems(res.data.items);
    } catch (err: unknown) {
      setItems([]);
      const msg =
        err && typeof err === 'object' && 'response' in err && (err as any).response?.data?.detail
          ? String((err as any).response.data.detail)
          : 'Could not load credit notes.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [canAccess, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (editing) {
      setEditCustomerName(editing.customer_name);
      setEditDeliveryDate(editing.delivery_date.slice(0, 10));
      setEditMarketArea(editing.market_area || CREDIT_NOTE_MARKET_AREAS[0]);
      setEditAmount(String(editing.amount));
    } else {
      setEditCustomerName('');
      setEditDeliveryDate('');
      setEditMarketArea('');
      setEditAmount('');
    }
  }, [editing]);

  const displayIdByNoteId = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      const tA = new Date(a.created_at).getTime();
      const tB = new Date(b.created_at).getTime();
      if (tA !== tB) return tA - tB;
      return a.id.localeCompare(b.id);
    });
    const map = new Map<string, string>();
    sorted.forEach((n, idx) => {
      map.set(n.id, `${CHANNEL_PREFIX}-${String(idx + 1).padStart(3, '0')}`);
    });
    return map;
  }, [items]);

  const canMutate = (n: CreditNote) => {
    if (!user) return false;
    if (isManager) return true;
    return n.status === 'pending';
  };

  const canUndo = (n: CreditNote) => isManager && (n.status === 'approved' || n.status === 'rejected');

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this credit note?')) return;
    setDeleteId(id);
    setError(null);
    try {
      await apiClient.delete(`/credit-notes/${id}`);
      await load();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err && (err as any).response?.data?.detail
          ? String((err as any).response.data.detail)
          : 'Delete failed.';
      setError(msg);
    } finally {
      setDeleteId(null);
    }
  };

  const handleRevert = async (id: string) => {
    if (!window.confirm('Undo decision? Returns to pending and removes from Tally if posted.')) return;
    setRevertId(id);
    setError(null);
    try {
      await apiClient.post(`/credit-notes/${id}/revert-to-pending`);
      await load();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err && (err as any).response?.data?.detail
          ? String((err as any).response.data.detail)
          : 'Undo failed.';
      setError(msg);
    } finally {
      setRevertId(null);
    }
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const payload = {
      delivery_date: editDeliveryDate,
      customer_name: editCustomerName.trim(),
      market_area: editMarketArea,
      amount: Number(editAmount),
      amount_safe: editing.amount_safe ?? 0,
      amount_warning: editing.amount_warning ?? 0,
      amount_danger: editing.amount_danger ?? 0,
      amount_doubtful: editing.amount_doubtful ?? 0,
    };
    setError(null);
    try {
      await apiClient.patch(`/credit-notes/${editing.id}`, payload);
      rememberCustomerNameAfterSubmit('credit_note', payload.customer_name, CUSTOMER_SUGGESTIONS);
      setEditing(null);
      await load();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err && (err as any).response?.data?.detail
          ? String((err as any).response.data.detail)
          : 'Update failed.';
      setError(msg);
    }
  };

  if (!canAccess) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Credit notes register</h2>
        <Card className="text-sm text-gray-600">Credit notes are only available for B2B accounts.</Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 min-w-0 max-w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 min-w-0">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Credit notes register</h2>
          <p className="text-sm text-gray-500">B2B credit notes (separate from rejection tickets).</p>
        </div>
        <div className="flex flex-col gap-1 w-full sm:w-auto sm:flex-row sm:items-center text-xs shrink-0">
          <label className="text-gray-500">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as CNStatus | 'all')}
            className="w-full sm:w-auto sm:min-w-[9rem] rounded-md border border-gray-200 bg-white px-2 py-2 sm:py-1 text-xs text-gray-800"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>
      <div className="md:hidden">
        <Link
          to="/credit-notes/new"
          className="inline-flex w-full items-center justify-center rounded-2xl bg-indigo-600 px-3 py-2.5 text-xs font-semibold text-white min-h-[44px]"
        >
          New CN
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      <Card title="All credit notes" className="text-sm">
        {loading && <div className="text-gray-500">Loading…</div>}
        {!loading && items.length === 0 && <div className="text-gray-500">No credit notes yet.</div>}
        {!loading && items.length > 0 && (
          <>
            <div className="space-y-3 md:hidden">
              {items.map((n) => {
                const did = displayIdByNoteId.get(n.id) ?? `${CHANNEL_PREFIX}-???`;
                const remark = n.approval_remarks ?? n.rejection_remarks ?? '';
                return (
                  <div key={n.id} className="rounded-xl border border-gray-100 bg-white px-3 py-3 shadow-sm">
                    <div className="text-sm font-mono font-medium text-gray-900">{did}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      {n.market_area} • {n.customer_name} • {new Date(n.delivery_date).toLocaleDateString('en-GB')}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-gray-800">
                      Amount: {Number(n.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="mt-1">
                      <StatusBadge status={n.status} />
                    </div>
                    {remark ? (
                      <div className="mt-1 text-[11px] text-gray-600 truncate" title={remark}>
                        {remark}
                      </div>
                    ) : null}
                    <div className="mt-2 text-[11px] text-gray-400">{new Date(n.created_at).toLocaleString('en-GB')}</div>
                    {(canMutate(n) || canUndo(n)) && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {canMutate(n) && (
                          <>
                            <button
                              type="button"
                              onClick={() => setEditing(n)}
                              className="flex-1 min-w-[4rem] rounded-full bg-sky-600 px-3 py-1.5 text-[11px] font-semibold text-white"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={deleteId === n.id}
                              onClick={() => void handleDelete(n.id)}
                              className="flex-1 min-w-[4rem] rounded-full bg-red-600 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60"
                            >
                              {deleteId === n.id ? '…' : 'Delete'}
                            </button>
                          </>
                        )}
                        {canUndo(n) && (
                          <button
                            type="button"
                            disabled={revertId === n.id}
                            onClick={() => void handleRevert(n.id)}
                            className="flex-1 min-w-[4rem] rounded-full bg-amber-500 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60"
                          >
                            {revertId === n.id ? '…' : 'Undo'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="hidden md:block w-full min-w-0 overflow-x-auto overscroll-x-contain">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 text-[11px] font-medium text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">Credit note ID</th>
                    <th className="px-4 py-2 text-left">Delivery date</th>
                    <th className="px-4 py-2 text-left">Market area</th>
                    <th className="px-4 py-2 text-left">Customer</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Admin remark</th>
                    <th className="px-4 py-2 text-left">Created</th>
                    <th className="px-4 py-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((n) => {
                    const did = displayIdByNoteId.get(n.id) ?? `${CHANNEL_PREFIX}-???`;
                    const remark = n.approval_remarks ?? n.rejection_remarks ?? '';
                    return (
                      <tr key={n.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono text-[11px]">{did}</td>
                        <td className="px-4 py-2">{new Date(n.delivery_date).toLocaleDateString('en-GB')}</td>
                        <td className="px-4 py-2 text-gray-700">{n.market_area}</td>
                        <td className="px-4 py-2">{n.customer_name}</td>
                        <td className="px-4 py-2 text-right font-medium tabular-nums">
                          {Number(n.amount).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-4 py-2">
                          <StatusBadge status={n.status} />
                        </td>
                        <td className="px-4 py-2 text-gray-600 max-w-[160px] truncate" title={remark}>
                          {remark || '–'}
                        </td>
                        <td className="px-4 py-2 text-gray-500">{new Date(n.created_at).toLocaleString('en-GB')}</td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap gap-1">
                            {canMutate(n) && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setEditing(n)}
                                  className="rounded px-2 py-1 text-[11px] bg-sky-100 text-sky-800"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  disabled={deleteId === n.id}
                                  onClick={() => void handleDelete(n.id)}
                                  className="rounded px-2 py-1 text-[11px] bg-red-100 text-red-800 disabled:opacity-50"
                                >
                                  {deleteId === n.id ? '…' : 'Delete'}
                                </button>
                              </>
                            )}
                            {canUndo(n) && (
                              <button
                                type="button"
                                disabled={revertId === n.id}
                                onClick={() => void handleRevert(n.id)}
                                className="rounded px-2 py-1 text-[11px] bg-amber-100 text-amber-900 disabled:opacity-50"
                              >
                                {revertId === n.id ? '…' : 'Undo'}
                              </button>
                            )}
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

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b">
              <h3 className="font-semibold text-gray-900">Edit credit note</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {displayIdByNoteId.get(editing.id) ?? CHANNEL_PREFIX}
              </p>
            </div>
            <form onSubmit={(e) => void submitEdit(e)} className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Delivery date</label>
                <input
                  type="date"
                  value={editDeliveryDate}
                  onChange={(e) => setEditDeliveryDate(e.target.value)}
                  className="w-full rounded border border-gray-200 px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Market area</label>
                <select
                  required
                  value={editMarketArea}
                  onChange={(e) => setEditMarketArea(e.target.value)}
                  className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm"
                >
                  {CREDIT_NOTE_MARKET_AREAS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Customer name</label>
                <CustomerNameField
                  storageKey="credit_note"
                  value={editCustomerName}
                  onChange={setEditCustomerName}
                  required
                  className="w-full rounded border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Amount</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="w-full rounded border border-gray-200 px-3 py-2 text-sm"
                  required
                />
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="w-full sm:w-auto rounded border border-gray-300 px-3 py-2 text-xs"
                >
                  Cancel
                </button>
                <button type="submit" className="w-full sm:w-auto rounded bg-indigo-600 px-3 py-2 text-xs text-white">
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
