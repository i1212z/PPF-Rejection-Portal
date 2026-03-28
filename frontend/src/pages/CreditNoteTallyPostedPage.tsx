import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/client';
import { Card } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/StatusBadge';

type CNStatus = 'pending' | 'approved' | 'rejected';

interface CreditNote {
  id: string;
  delivery_date: string;
  customer_name: string;
  amount: number;
  status: CNStatus;
  created_at: string;
  approval_remarks?: string | null;
  rejection_remarks?: string | null;
}

const PREFIX = 'CN-B2B';

export default function CreditNoteTallyPostedPage() {
  const [allNotes, setAllNotes] = useState<CreditNote[]>([]);
  const [postedIds, setPostedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [unpostingId, setUnpostingId] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    try {
      const res = await apiClient.get<{ items: CreditNote[]; total: number }>('/credit-notes', {
        params: { limit: 500 },
      });
      setAllNotes(res.data.items);
    } catch {
      setAllNotes([]);
    }
  }, []);

  const loadPosted = useCallback(async () => {
    try {
      const res = await apiClient.get<{ credit_note_ids: string[] }>('/credit-note-tally/posted');
      setPostedIds(new Set(res.data.credit_note_ids || []));
    } catch {
      setPostedIds(new Set());
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadNotes(), loadPosted()]).finally(() => setLoading(false));
  }, [loadNotes, loadPosted]);

  const displayIdById = useMemo(() => {
    const sorted = [...allNotes].sort((a, b) => {
      const tA = new Date(a.created_at).getTime();
      const tB = new Date(b.created_at).getTime();
      if (tA !== tB) return tA - tB;
      return a.id.localeCompare(b.id);
    });
    const map = new Map<string, string>();
    sorted.forEach((n, idx) => map.set(n.id, `${PREFIX}-${String(idx + 1).padStart(3, '0')}`));
    return map;
  }, [allNotes]);

  const approved = useMemo(() => allNotes.filter((n) => n.status === 'approved'), [allNotes]);
  const rows = useMemo(() => approved.filter((n) => postedIds.has(n.id)), [approved, postedIds]);

  const unpost = async (id: string) => {
    setUnpostingId(id);
    try {
      await apiClient.delete(`/credit-note-tally/pending/${id}`);
      setPostedIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    } finally {
      setUnpostingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Credit notes — Posted (Tally)</h2>
        <p className="text-sm text-gray-500">Approved credit notes already marked as posted in Tally.</p>
      </div>
      <Card title="Posted credit notes" subtitle="Unpost to send back to the pending list.">
        {loading ? (
          <p className="text-sm text-gray-500 py-4">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">No posted credit notes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 text-[11px] font-medium text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Credit note ID</th>
                  <th className="px-4 py-2 text-left">Delivery date</th>
                  <th className="px-4 py-2 text-left">Customer</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Created</th>
                  <th className="px-4 py-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((n) => {
                  const did = displayIdById.get(n.id) ?? `${PREFIX}-???`;
                  return (
                    <tr key={n.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-[11px]">{did}</td>
                      <td className="px-4 py-2">{new Date(n.delivery_date).toLocaleDateString()}</td>
                      <td className="px-4 py-2">{n.customer_name}</td>
                      <td className="px-4 py-2 text-right font-medium">
                        {Number(n.amount).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-4 py-2">
                        <StatusBadge status={n.status} />
                      </td>
                      <td className="px-4 py-2 text-gray-500">{new Date(n.created_at).toLocaleString()}</td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          disabled={unpostingId === n.id}
                          onClick={() => void unpost(n.id)}
                          className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                        >
                          {unpostingId === n.id ? 'Unposting…' : 'Unpost'}
                        </button>
                      </td>
                    </tr>
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
