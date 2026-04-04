import { useMemo, useState } from 'react';
import { apiClient } from '../api/client';
import { Card } from '../components/ui/Card';

function defaultToDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultFromDateStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

export default function DueReportPage() {
  const [fromDate, setFromDate] = useState(defaultFromDateStr);
  const [toDate, setToDate] = useState(defaultToDateStr);
  const [basis, setBasis] = useState<'delivery' | 'approved'>('delivery');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const basisHint = useMemo(() => {
    if (basis === 'delivery') {
      return 'Includes rows whose credit note delivery date falls in the range (open and paid registers).';
    }
    return 'Includes rows whose manager approval date falls in the range (open and paid registers).';
  }, [basis]);

  const downloadCsv = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiClient.get<Blob>('/due/report.csv', {
        params: {
          date_from: fromDate,
          date_to: toDate,
          basis,
        },
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `due-account-report-${fromDate}-to-${toDate}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err && (err as { response?: { data?: unknown } }).response?.data
          ? await tryBlobErrorDetail((err as { response: { data: Blob } }).response.data)
          : 'Could not download report.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 min-w-0 max-w-full">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Credit notes CSV export</h2>
        <p className="text-sm text-gray-500">
          Download approved B2B credit notes as CSV (separate from the Excel aging sheet). The file includes a{' '}
          <strong>Due Account</strong> column
          plus CN ID, particulars, buckets, phase, custom columns, and register status.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      <Card title="Date range & basis" subtitle={basisHint} className="text-sm">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3 sm:gap-4">
          <div className="w-full sm:w-auto sm:min-w-[10rem]">
            <label className="block text-xs font-medium text-gray-700 mb-1">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full rounded border border-gray-200 px-3 py-2 text-sm min-w-0"
            />
          </div>
          <div className="w-full sm:w-auto sm:min-w-[10rem]">
            <label className="block text-xs font-medium text-gray-700 mb-1">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full rounded border border-gray-200 px-3 py-2 text-sm min-w-0"
            />
          </div>
          <div className="w-full sm:w-auto sm:min-w-[12rem]">
            <label className="block text-xs font-medium text-gray-700 mb-1">Match date by</label>
            <select
              value={basis}
              onChange={(e) => setBasis(e.target.value as 'delivery' | 'approved')}
              className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              <option value="delivery">Delivery date</option>
              <option value="approved">Approval date</option>
            </select>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => void downloadCsv()}
            className="w-full sm:w-auto rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 px-4 py-2.5 sm:py-2 text-sm font-semibold text-white"
          >
            {loading ? 'Preparing…' : 'Download CSV'}
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            setFromDate(defaultFromDateStr());
            setToDate(defaultToDateStr());
          }}
          className="mt-3 text-xs text-indigo-700 hover:underline"
        >
          Reset to last 30 days → today
        </button>
      </Card>

      <Card title="CSV columns" className="text-sm text-gray-600">
        <p className="text-xs leading-relaxed">
          <strong>Due Account</strong> (Due desk), <strong>CN ID</strong>, <strong>Particulars</strong>,{' '}
          <strong>Market Area</strong>, <strong>Delivery Date</strong>, <strong>Phase Length (Days)</strong>,{' '}
          <strong>Phase</strong>, <strong>Timer Label</strong>, <strong>Safe</strong>–<strong>Doubtful</strong>,{' '}
          <strong>Total</strong>, <strong>Approved At</strong>, <strong>Register Status</strong> (Open / Paid),{' '}
          <strong>Paid At</strong>, then each custom Due column in order.
        </p>
      </Card>
    </div>
  );
}

async function tryBlobErrorDetail(data: Blob): Promise<string> {
  try {
    const text = await data.text();
    const j = JSON.parse(text) as { detail?: string };
    if (typeof j.detail === 'string') return j.detail;
  } catch {
    /* ignore */
  }
  return 'Could not download report.';
}
