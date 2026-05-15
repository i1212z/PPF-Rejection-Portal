import type { FormEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Card } from './ui/Card';

export type ComplaintChannel = 'B2B' | 'B2C';

interface ComplaintCreator {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface GeneralComplaintRow {
  id: string;
  channel: ComplaintChannel;
  complaint_text: string;
  customer_name: string;
  complaint_date: string;
  remark?: string | null;
  created_at: string;
  creator?: ComplaintCreator | null;
}

interface Props {
  /** Card heading (default: General complaints). */
  cardTitle?: string;
  /** Used for section subtitle only; API channel is enforced server-side by role. */
  channelLabel: ComplaintChannel;
  /** B2C/B2B users can create; managers/admins use view-only lists here. */
  allowCreate: boolean;
  /** When set (manager/admin), list is filtered to this channel via API. */
  listChannel?: ComplaintChannel;
}

export function GeneralComplaintsSection({
  cardTitle = 'General complaints',
  channelLabel,
  allowCreate,
  listChannel,
}: Props) {
  const { user } = useAuth();
  const [complaintText, setComplaintText] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [complaintDate, setComplaintDate] = useState('');
  const [remark, setRemark] = useState('');
  const [rows, setRows] = useState<GeneralComplaintRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showCreator = user?.role === 'manager' || user?.role === 'admin';

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<GeneralComplaintRow[]>('/general-complaints', {
        params: listChannel ? { channel: listChannel } : undefined,
      });
      setRows(res.data ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [listChannel]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!complaintText.trim() || !customerName.trim() || !complaintDate) {
      setError('Please fill complaint, customer name, and date.');
      return;
    }
    setSaving(true);
    try {
      await apiClient.post('/general-complaints', {
        complaint_text: complaintText.trim(),
        customer_name: customerName.trim(),
        complaint_date: complaintDate,
        remark: remark.trim() || null,
      });
      setComplaintText('');
      setCustomerName('');
      setRemark('');
      await loadRows();
    } catch {
      setError('Could not save complaint. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    setDeletingId(id);
    try {
      await apiClient.delete(`/general-complaints/${id}`);
      await loadRows();
    } catch {
      setError('Could not delete complaint.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card title={cardTitle}>
      {allowCreate ? (
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-700 mb-1">General complaint</label>
          <textarea
            value={complaintText}
            onChange={(e) => setComplaintText(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            placeholder="Describe the complaint"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Customer name</label>
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
          <input
            type="date"
            value={complaintDate}
            onChange={(e) => setComplaintDate(e.target.value)}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            required
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-700 mb-1">Remark</label>
          <textarea
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            placeholder="Optional follow-up / resolution note"
          />
        </div>
        <div className="md:col-span-2 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save complaint'}
          </button>
        </div>
      </form>
      ) : (
        <p className="text-xs text-gray-500 mb-4">
          View-only for your role — new complaints are submitted by {channelLabel} desk users.
        </p>
      )}
      {error && (
        <div className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      <div className="border-t border-gray-100 pt-4">
        <div className="text-xs font-semibold text-gray-700 mb-2">Recorded complaints</div>
        {loading ? (
          <div className="text-sm text-gray-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-gray-500">No complaints yet.</div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Complaint</th>
                  <th className="px-3 py-2 text-left">Customer</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Remark</th>
                  {showCreator && <th className="px-3 py-2 text-left">Recorded by</th>}
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 max-w-[200px] whitespace-pre-wrap">{r.complaint_text}</td>
                    <td className="px-3 py-2">{r.customer_name}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(r.complaint_date).toLocaleDateString('en-GB')}
                    </td>
                    <td className="px-3 py-2 max-w-[160px] whitespace-pre-wrap text-gray-600">
                      {r.remark || '–'}
                    </td>
                    {showCreator && (
                      <td className="px-3 py-2 text-gray-600">{r.creator?.name ?? '–'}</td>
                    )}
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={deletingId === r.id}
                        onClick={() => void handleDelete(r.id)}
                        className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                      >
                        {deletingId === r.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}
