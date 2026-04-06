import type { FormEvent } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Card } from '../components/ui/Card';
import { CustomerNameField } from '../components/CustomerNameField';
import { CUSTOMER_SUGGESTIONS, PRODUCT_SUGGESTIONS } from '../data/rejectionTicketSuggestions';
import type { CustomerStorageKey } from '../lib/savedCustomerNames';
import { rememberCustomerNameAfterSubmit } from '../lib/savedCustomerNames';

export default function CreateTicketPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canChooseChannel = user?.role === 'admin' || user?.role === 'manager';
  const [channel, setChannel] = useState<'B2B' | 'B2C'>('B2B');
  const ticketCustomerStorageKey: CustomerStorageKey = canChooseChannel
    ? channel === 'B2B'
      ? 'b2b_ticket'
      : 'b2c_ticket'
    : user?.role === 'b2c'
      ? 'b2c_ticket'
      : 'b2b_ticket';
  const [productType, setProductType] = useState<'single' | 'multiple'>('single');
  const [productName, setProductName] = useState('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [uom, setUom] = useState<'EA' | 'KG' | 'G' | 'GM' | 'L' | 'ML' | 'BOX'>('EA');
  const [reason, setReason] = useState('');
  const [deliveryBatch, setDeliveryBatch] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [lineItems, setLineItems] = useState<
    { productName: string; quantity: number | ''; uom: 'EA' | 'KG' | 'G' | 'GM' | 'L' | 'ML' | 'BOX'; reason: string }[]
  >([{ productName: '', quantity: '', uom: 'EA', reason: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (!deliveryDate || !deliveryBatch) {
          setError('Please fill all required fields.');
          setSubmitting(false);
          return;
        }

      if (productType === 'single') {
        if (!productName || !quantity || !reason) {
          setError('Please fill all required fields.');
          setSubmitting(false);
          return;
        }

        await apiClient.post('/tickets', {
          product_name: productName,
          quantity,
          uom,
          reason,
          delivery_batch: deliveryBatch,
          delivery_date: deliveryDate,
          ...(canChooseChannel && { channel }),
        });
        rememberCustomerNameAfterSubmit(ticketCustomerStorageKey, deliveryBatch, CUSTOMER_SUGGESTIONS);
      } else {
        const validItems = lineItems.filter(
          (item) =>
            item.productName &&
            item.quantity &&
            Number(item.quantity) > 0 &&
            item.reason,
        );

        if (validItems.length === 0) {
          setError('Please add at least one valid rejected product.');
          setSubmitting(false);
          return;
        }

        await Promise.all(
          validItems.map((item) =>
            apiClient.post('/tickets', {
              product_name: item.productName,
              quantity: Number(item.quantity),
              uom: item.uom,
              reason: item.reason,
              delivery_batch: deliveryBatch,
              delivery_date: deliveryDate,
              ...(canChooseChannel && { channel }),
            }),
          ),
        );
        rememberCustomerNameAfterSubmit(ticketCustomerStorageKey, deliveryBatch, CUSTOMER_SUGGESTIONS);
      }
      navigate('/tickets');
    } catch (err) {
      setError('Could not create ticket. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-3xl min-w-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4 min-w-0">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900">Create rejection ticket</h2>
          <p className="text-sm text-gray-500">
            Capture quantity and reason for today&apos;s rejections.
          </p>
        </div>
        <div className="rounded-full border border-gray-200 bg-gray-50 px-3 py-2 sm:py-1 text-[11px] text-gray-600 w-full sm:w-auto text-center sm:text-left shrink-0">
          Delivery frequency: every 2 days
        </div>
      </div>
      <Card
        title="Ticket details"
        subtitle="Product, delivery, and rejection information"
        className="text-sm"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                Customer Name
              </label>
              <CustomerNameField
                storageKey={ticketCustomerStorageKey}
                value={deliveryBatch}
                onChange={setDeliveryBatch}
                required
                placeholder="Customer or account name"
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Product type
              </label>
              <select
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                value={productType}
                onChange={(e) => setProductType(e.target.value as 'single' | 'multiple')}
              >
                <option value="single">Single product</option>
                <option value="multiple">Multiple products</option>
              </select>
            </div>
            {canChooseChannel && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Channel
                </label>
                <select
                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as 'B2B' | 'B2C')}
                >
                  <option value="B2B">B2B</option>
                  <option value="B2C">B2C</option>
                </select>
              </div>
            )}
          </div>

          {productType === 'single' ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Product Name
                  </label>
                  <input
                    className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    required
                    list="product-suggestions"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Quantity Rejected
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.001"
                    className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Unit
                  </label>
                  <select
                    className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                    value={uom}
                    onChange={(e) => setUom(e.target.value as typeof uom)}
                  >
                    <option value="EA">EA</option>
                    <option value="KG">KG</option>
                    <option value="G">G</option>
                    <option value="GM">GM</option>
                    <option value="L">L</option>
                    <option value="ML">ML</option>
                    <option value="BOX">BOX</option>
                  </select>
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
            </>
          ) : (
            <>
              <div className="border border-gray-200 rounded-md">
                <div className="bg-gray-50 px-3 py-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-700">Rejected products</span>
                </div>
                <div className="divide-y divide-gray-200">
                  {lineItems.map((item, idx) => (
                    <div key={idx} className="px-3 py-2 grid grid-cols-1 md:grid-cols-5 gap-3 items-start">
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">
                          Product
                        </label>
                        <input
                          className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900"
                          value={item.productName}
                          onChange={(e) =>
                            setLineItems((prev) =>
                              prev.map((li, i) =>
                                i === idx ? { ...li, productName: e.target.value } : li,
                              ),
                            )
                          }
                          placeholder="e.g. Strawberry Box"
                          list="product-suggestions"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">
                          Quantity
                        </label>
                        <input
                          type="number"
                          min={0}
                          step="0.001"
                          className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900"
                          value={item.quantity}
                          onChange={(e) =>
                            setLineItems((prev) =>
                              prev.map((li, i) =>
                                i === idx
                                  ? {
                                      ...li,
                                      quantity: e.target.value === '' ? '' : Number(e.target.value),
                                    }
                                  : li,
                              ),
                            )
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">
                          Unit
                        </label>
                        <select
                          className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900"
                          value={item.uom}
                          onChange={(e) =>
                            setLineItems((prev) =>
                              prev.map((li, i) =>
                                i === idx ? { ...li, uom: e.target.value as typeof item.uom } : li,
                              ),
                            )
                          }
                        >
                          <option value="EA">EA</option>
                          <option value="KG">KG</option>
                          <option value="G">G</option>
                          <option value="GM">GM</option>
                          <option value="L">L</option>
                          <option value="ML">ML</option>
                          <option value="BOX">BOX</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">
                          Reason
                        </label>
                        <textarea
                          className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 min-h-[40px]"
                          value={item.reason}
                          onChange={(e) =>
                            setLineItems((prev) =>
                              prev.map((li, i) =>
                                i === idx ? { ...li, reason: e.target.value } : li,
                              ),
                            )
                          }
                        />
                      </div>
                      <div className="md:col-span-5 flex justify-end">
                        {lineItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setLineItems((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="text-[11px] text-red-600 hover:text-red-700"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-3 py-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() =>
                      setLineItems((prev) => [
                        ...prev,
                        { productName: '', quantity: '', uom: 'EA', reason: '' },
                      ])
                    }
                    className="w-full sm:w-auto rounded-md bg-indigo-50 px-3 py-2 sm:py-1.5 text-[11px] text-indigo-700 hover:bg-indigo-100"
                  >
                    + Add product
                  </button>
                  <div className="flex flex-col items-stretch sm:items-end text-xs text-gray-700 w-full sm:w-auto text-left sm:text-right">
                    <span className="font-semibold">
                      Total lines: {lineItems.filter((i) => i.productName).length}
                    </span>
                    <span className="text-[11px] text-gray-500">
                      One ticket = one customer + delivery; add multiple rejected products below.
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-2">
          <button
            type="button"
            onClick={() => navigate('/tickets')}
            className="w-full sm:w-auto rounded-md border border-gray-300 px-4 py-2.5 sm:py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="w-full sm:w-auto rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed px-4 py-2.5 sm:py-2 text-xs font-medium text-white"
          >
            {submitting ? 'Submitting…' : 'Raise Ticket'}
          </button>
        </div>
        </form>
      </Card>

      <datalist id="product-suggestions">
        {PRODUCT_SUGGESTIONS.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </div>
  );
}


