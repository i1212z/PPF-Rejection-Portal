import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { Card } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/StatusBadge';

type Decision = 'approved' | 'rejected';

interface PendingTicket {
  id: string;
  product_name: string;
  quantity: number;
  cost: number;
  reason: string;
  delivery_batch: string;
  delivery_date: string;
  channel: 'B2B' | 'B2C';
  created_at: string;
}

export default function ApprovalsPage() {
  const [tickets, setTickets] = useState<PendingTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadPending = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<PendingTicket[]>('/approvals/pending');
      setTickets(res.data);
    } catch (err: unknown) {
      // If unauthorized, just show empty queue without noisy errors.
      setTickets([]);
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

  const handleDecision = async (ticketId: string, decision: Decision) => {
    const remarks =
      decision === 'approved'
        ? 'Approved'
        : window.prompt('Remarks for rejection?') || 'Rejected';
    setActionLoadingId(ticketId);
    try {
      await apiClient.post(`/approvals/${ticketId}/decision`, {
        decision,
        remarks,
      });
      await loadPending();
    } catch (err) {
      setError('Could not submit decision.');
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Pending approvals</h2>
          <p className="text-sm text-gray-500">
            Manager and Admin can review, approve, or reject pending tickets here.
          </p>
        </div>
        <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] text-amber-700">
          {tickets.length || 'No'} tickets awaiting decision
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
            {/* Mobile card list */}
            <div className="space-y-3 md:hidden">
              {tickets.map((t) => (
                <div
                  key={t.id}
                  className="rounded-lg border border-gray-100 bg-white px-3 py-2 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {t.product_name}
                      </div>
                      <div className="mt-0.5 text-[11px] text-gray-500">
                        {t.channel} • {t.delivery_batch}
                      </div>
                    </div>
                    <StatusBadge status="pending" />
                  </div>
                  <div className="mt-2 flex justify-between text-[11px] text-gray-600">
                    <span>Qty: {t.quantity}</span>
                    <span>
                      {Number(t.cost || 0).toLocaleString('en-IN', {
                        style: 'currency',
                        currency: 'INR',
                        maximumFractionDigits: 0,
                      })}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-gray-400">
                    {new Date(t.created_at).toLocaleString()}
                  </div>
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      disabled={actionLoadingId === t.id}
                      onClick={() => void handleDecision(t.id, 'approved')}
                      className="rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 px-2.5 py-1 text-[11px] text-white"
                    >
                      Approve
                    </button>
                    <button
                      disabled={actionLoadingId === t.id}
                      onClick={() => void handleDecision(t.id, 'rejected')}
                      className="rounded-md bg-red-600 hover:bg-red-500 disabled:opacity-60 px-2.5 py-1 text-[11px] text-white"
                    >
                      Reject
                    </button>
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
                    <th className="px-4 py-2 text-left">Created</th>
                    <th className="px-4 py-2 text-left">Action</th>
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
                        <StatusBadge status="pending" />
                      </td>
                      <td className="px-4 py-2 text-[11px] text-gray-500">
                        {new Date(t.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          <button
                            disabled={actionLoadingId === t.id}
                            onClick={() => void handleDecision(t.id, 'approved')}
                            className="rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 px-2.5 py-1 text-[11px] text-white"
                          >
                            Approve
                          </button>
                          <button
                            disabled={actionLoadingId === t.id}
                            onClick={() => void handleDecision(t.id, 'rejected')}
                            className="rounded-md bg-red-600 hover:bg-red-500 disabled:opacity-60 px-2.5 py-1 text-[11px] text-white"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
