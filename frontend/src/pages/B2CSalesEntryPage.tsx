import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { Card } from '../components/ui/Card';

interface B2CDailyEntry {
  id: string;
  delivery_date: string;
  location: string;
  no_of_order: number;
  total_sale_value: number;
  created_at: string;
}

export default function B2CSalesEntryPage() {
  const [deliveryDate, setDeliveryDate] = useState('');
  const [location, setLocation] = useState('');
  const [noOfOrder, setNoOfOrder] = useState<number | ''>('');
  const [totalSaleValue, setTotalSaleValue] = useState<number | ''>('');
  const [entries, setEntries] = useState<B2CDailyEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEntries = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<B2CDailyEntry[]>('/b2c-sales');
      setEntries(res.data ?? []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEntries();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!deliveryDate || !location || noOfOrder === '' || totalSaleValue === '') {
      setError('Please fill all required fields.');
      return;
    }
    setSaving(true);
    try {
      await apiClient.post('/b2c-sales', {
        delivery_date: deliveryDate,
        location,
        no_of_order: Number(noOfOrder),
        total_sale_value: Number(totalSaleValue),
      });
      setLocation('');
      setNoOfOrder('');
      setTotalSaleValue('');
      await loadEntries();
    } catch {
      setError('Could not save entry. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 min-w-0 max-w-full">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">B2C daily entry</h2>
        <p className="text-sm text-gray-500">
          Enter daily B2C operational numbers for dashboard analytics.
        </p>
      </div>

      <Card title="New entry" subtitle="Delivery date, location, order count, and sale value">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Delivery date</label>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Location</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              placeholder="e.g. Calicut"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">No of order</label>
            <input
              type="number"
              min={0}
              value={noOfOrder}
              onChange={(e) => setNoOfOrder(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Total sale value</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={totalSaleValue}
              onChange={(e) =>
                setTotalSaleValue(e.target.value === '' ? '' : Number(e.target.value))
              }
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              required
            />
          </div>
          <div className="md:col-span-4 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save entry'}
            </button>
          </div>
        </form>
        {error && (
          <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}
      </Card>

      <Card title="Recent entries" subtitle="Latest 500 rows">
        {loading ? (
          <div className="text-sm text-gray-500">Loading entries…</div>
        ) : entries.length === 0 ? (
          <div className="text-sm text-gray-500">No entries yet.</div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Delivery date</th>
                  <th className="px-3 py-2 text-left">Location</th>
                  <th className="px-3 py-2 text-right">No of order</th>
                  <th className="px-3 py-2 text-right">Total sale value</th>
                  <th className="px-3 py-2 text-left">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="px-3 py-2">{new Date(e.delivery_date).toLocaleDateString('en-GB')}</td>
                    <td className="px-3 py-2">{e.location}</td>
                    <td className="px-3 py-2 text-right">{e.no_of_order}</td>
                    <td className="px-3 py-2 text-right">
                      {Number(e.total_sale_value).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-3 py-2 text-gray-500">
                      {new Date(e.created_at).toLocaleString('en-GB')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
