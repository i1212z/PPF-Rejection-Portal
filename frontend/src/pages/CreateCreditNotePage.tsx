import type { FormEvent } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Card } from '../components/ui/Card';
import { CustomerNameField } from '../components/CustomerNameField';
import { CUSTOMER_SUGGESTIONS } from '../data/rejectionTicketSuggestions';
import { rememberCustomerNameAfterSubmit } from '../lib/savedCustomerNames';
import { CREDIT_NOTE_MARKET_AREAS } from '../data/creditNoteMarketAreas';

export default function CreateCreditNotePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [deliveryDate, setDeliveryDate] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [marketArea, setMarketArea] = useState<string>(CREDIT_NOTE_MARKET_AREAS[0]);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canUse = user?.role === 'b2b' || user?.role === 'manager' || user?.role === 'admin';

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canUse) return;
    setLoading(true);
    setError(null);
    const num = Number(amount);
    if (Number.isNaN(num) || num < 0) {
      setError('Enter a valid amount.');
      setLoading(false);
      return;
    }
    try {
      await apiClient.post('/credit-notes', {
        delivery_date: deliveryDate,
        customer_name: customerName.trim(),
        market_area: marketArea,
        amount: num,
      });
      rememberCustomerNameAfterSubmit('credit_note', customerName, CUSTOMER_SUGGESTIONS);
      navigate('/credit-notes');
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err && (err as any).response?.data?.detail
          ? String((err as any).response.data.detail)
          : 'Could not create credit note.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!canUse) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">New credit note</h2>
        <Card title="Not available" className="text-sm text-gray-600">
          Credit notes are only available for B2B accounts (and managers can manage them from the register).
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">New credit note</h2>
        <p className="text-sm text-gray-500">
          B2B credit note: delivery date, market area, customer name, and amount. Safe / Warning / Danger / Doubtful /
          Total breakdown appears only on the Due desk register after approval.
        </p>
      </div>
      <Card title="Credit note details" className="text-sm max-w-lg">
        {error && (
          <div className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>
        )}
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Delivery date</label>
            <input
              type="date"
              required
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Market area</label>
            <select
              required
              value={marketArea}
              onChange={(e) => setMarketArea(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
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
              value={customerName}
              onChange={setCustomerName}
              required
              placeholder="Customer / party name"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Amount</label>
            <input
              type="number"
              required
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              placeholder="0.00"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {loading ? 'Saving…' : 'Submit credit note'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/credit-notes')}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
