import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/client';
import { Card } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/StatusBadge';

type Decision = 'approved' | 'rejected';

interface CreditNoteRow {
  id: string;
  delivery_date: string;
  customer_name: string;
  amount: number;
  created_at: string;
}

const CHANNEL_PREFIX = 'CN-B2B';

export default function CreditNoteApprovalsPage() {
  const [pending, setPending] = useState<CreditNoteRow[]>([]);
  const [allForIds, setAllForIds] = useState<CreditNoteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const extractApiDetail = (err: unknown): string => {
    if (!err || typeof err !== 'object' || !('response' in err)) return 'Could not submit decision.';
    const res = (err as { response?: { data?: { detail?: unknown } } }).response;
    if (!res?.data?.detail) return 'Could not submit decision.';
    const d = res.data.detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d))
      return d.map((x) => (typeof x === 'object' && x && 'msg' in x ? String((x as { msg: string }).msg) : String(x))).join(', ');
    return 'Could not submit decision.';
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, allRes] = await Promise.all([
        apiClient.get<CreditNoteRow[]>('/credit-note-approvals/pending'),
        apiClient.get<{ items: CreditNoteRow[]; total: number }>('/credit-notes', { params: { limit: 500 } }),
      ]);
      setPending(pRes.data);
      setAllForIds(allRes.data.items);
    } catch {
      setPending([]);
      setAllForIds([]);
      setError(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const displayIdById = useMemo(() => {
    const sorted = [...allForIds].sort((a, b) => {
      const tA = new Date(a.created_at).getTime();
      const tB = new Date(b.created_at).getTime();
      if (tA !== tB) return tA - tB;
      return a.id.localeCompare(b.id);
    });
    const map = new Map<string, string>();
    sorted.forEach((n, idx) => map.set(n.id, `${CHANNEL_PREFIX}-${String(idx + 1).padStart(3, '0')}`));
    return map;
  }, [allForIds]);

  const handleDecision = async (id: string, decision: Decision) => {
    const remarks =
      decision === 'approved' ? 'Approved' : window.prompt('Remarks for rejection?') || 'Rejected';
    setActionId(id);
    setError(null);
    try {
      await apiClient.post(`/credit-note-approvals/${id}/decision`, { decision, remarks });
      await load();
    } catch (err: unknown) {
      setError(extractApiDetail(err));
      await load();
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Credit note approvals</h2>
          <p className="text-sm text-gray-500">
            Approve or reject pending B2B credit notes (separate from rejection tickets).
          </p>
        </div>
        <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] text-amber-700">
          {pending.length || 'No'} pending
        </div>
      </div>

      <Card title="Queue" subtitle="Pending credit notes awaiting decision" className="text-sm">
        {loading && <div className="text-gray-500">Loading…</div>}
        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">{error}</div>
        )}
        {!loading && pending.length === 0 && <div className="text-gray-500">No pending credit notes.</div>}
        {!loading && pending.length > 0 && (
          <>
            <div className="space-y-3 md:hidden">
              {pending.map((n) => {
                const did = displayIdById.get(n.id) ?? `${CHANNEL_PREFIX}-???`;
                return (
                  <div key={n.id} className="rounded-2xl border border-gray-100 bg-white px-3 py-3 shadow-sm">
                    <div className="text-sm font-mono font-medium">{did}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">{n.customer_name}</div>
                    <div className="text-[11px] text-gray-600">
                      Delivery: {new Date(n.delivery_date).toLocaleDateString()} • Amount:{' '}
                      {Number(n.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="mt-2">
                      <StatusBadge status="pending" />
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={actionId === n.id}
                        onClick={() => void handleDecision(n.id, 'approved')}
                        className="flex-1 rounded-full bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={actionId === n.id}
                        onClick={() => void handleDecision(n.id, 'rejected')}
                        className="flex-1 rounded-full bg-red-600 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 text-[11px] font-medium text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">Credit note ID</th>
                    <th className="px-4 py-2 text-left">Customer</th>
                    <th className="px-4 py-2 text-left">Delivery date</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Created</th>
                    <th className="px-4 py-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pending.map((n) => {
                    const did = displayIdById.get(n.id) ?? `${CHANNEL_PREFIX}-???`;
                    return (
                      <tr key={n.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono text-[11px]">{did}</td>
                        <td className="px-4 py-2">{n.customer_name}</td>
                        <td className="px-4 py-2">{new Date(n.delivery_date).toLocaleDateString()}</td>
                        <td className="px-4 py-2 text-right font-medium">
                          {Number(n.amount).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-4 py-2">
                          <StatusBadge status="pending" />
                        </td>
                        <td className="px-4 py-2 text-gray-500">{new Date(n.created_at).toLocaleString()}</td>
                        <td className="px-4 py-2">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={actionId === n.id}
                              onClick={() => void handleDecision(n.id, 'approved')}
                              className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] text-white disabled:opacity-60"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={actionId === n.id}
                              onClick={() => void handleDecision(n.id, 'rejected')}
                              className="rounded-md bg-red-600 px-2.5 py-1 text-[11px] text-white disabled:opacity-60"
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
