import type { FormEvent } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { Card } from '../components/ui/Card';

export default function CreateTicketPage() {
  const navigate = useNavigate();
  const [productName, setProductName] = useState('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [cost, setCost] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [deliveryBatch, setDeliveryBatch] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!quantity || !cost || !deliveryDate) {
      setError('Please fill all required fields.');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post('/tickets', {
        product_name: productName,
        quantity,
        cost,
        reason,
        delivery_batch: deliveryBatch,
        delivery_date: deliveryDate,
        photo_proof_url: photoUrl || null,
      });
      navigate('/tickets');
    } catch (err) {
      setError('Could not create ticket. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Create rejection ticket</h2>
          <p className="text-sm text-gray-500">
            Capture quantity, value, and reason for today&apos;s rejections.
          </p>
        </div>
        <div className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] text-gray-600">
          Delivery frequency: every 2 days
        </div>
      </div>
      <Card
        title="Ticket details"
        subtitle="Product, delivery, and rejection information"
        className="text-sm"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Product Name
            </label>
            <input
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Quantity Rejected
            </label>
            <input
              type="number"
              min={0}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Cost of Rejection
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
              value={cost}
              onChange={(e) => setCost(e.target.value === '' ? '' : Number(e.target.value))}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Customer Name
            </label>
            <input
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
              value={deliveryBatch}
              onChange={(e) => setDeliveryBatch(e.target.value)}
              required
              placeholder="Customer or account name"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Delivery Date
            </label>
            <input
              type="date"
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Photo Proof URL (optional)
            </label>
            <input
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              placeholder="Link to uploaded image"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Reason for Rejection
          </label>
          <textarea
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 min-h-[80px]"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
        </div>
        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => navigate('/tickets')}
            className="rounded-md border border-gray-300 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed px-4 py-2 text-xs font-medium text-white"
          >
            {submitting ? 'Submitting…' : 'Raise Ticket'}
          </button>
        </div>
        </form>
      </Card>
    </div>
  );
}


