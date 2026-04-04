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
  const [loadingCn, setLoadingCn] = useState(false);
  const [loadingAging, setLoadingAging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const basisHint = useMemo(() => {
    if (basis === 'delivery') {
      return 'Only approved B2B credit notes whose delivery date is in the range.';
    }
    return 'Only approved B2B credit notes whose manager approval date is in the range.';
  }, [basis]);

  const downloadBlob = async (path: string, filename: string, params?: Record<string, string>) => {
    const res = await apiClient.get<Blob>(path, {
      params,
      responseType: 'blob',
    });
    const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const downloadAgingCsv = async () => {
    setError(null);
    setLoadingAging(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      await downloadBlob('/due/aging/report.csv', `due-aging-register-${stamp}.csv`);
    } catch (err: unknown) {
      setError(await blobErrorMessage(err));
    } finally {
      setLoadingAging(false);
    }
  };

  const downloadCnCsv = async () => {
    setError(null);
    if (fromDate > toDate) {
      setError('From date must be on or before To date.');
      return;
    }
    setLoadingCn(true);
    try {
      await downloadBlob('/due/report.csv', `due-credit-notes-${fromDate}-to-${toDate}.csv`, {
        date_from: fromDate,
        date_to: toDate,
        basis,
      });
    } catch (err: unknown) {
      setError(await blobErrorMessage(err));
    } finally {
      setLoadingCn(false);
    }
  };

  return (
    <div className="space-y-4 min-w-0 max-w-full">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Due desk — reports</h2>
        <p className="text-sm text-gray-500">
          Two separate exports: your <strong>uploaded aging workbook</strong> (open + paid lines) and{' '}
          <strong>approved B2B credit notes</strong> from the ticket system (filtered by date).
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      <Card
        title="Aging workbook (Excel register)"
        subtitle="Everything currently in the due sheet: all locations, open and paid rows, zone amounts, and grand total. UTF-8 with BOM for Excel."
        className="text-sm"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            type="button"
            disabled={loadingAging}
            onClick={() => void downloadAgingCsv()}
            className="w-full sm:w-auto rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 px-4 py-2.5 sm:py-2 text-sm font-semibold text-white"
          >
            {loadingAging ? 'Preparing…' : 'Download aging CSV'}
          </button>
          <p className="text-xs text-gray-500 sm:flex-1">
            Columns: location, register (Open/Paid), particulars, Safe–Doubtful, Total, paid time, imported time, then
            grand total row.
          </p>
        </div>
      </Card>

      <Card title="B2B credit notes" subtitle={basisHint} className="text-sm">
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
            disabled={loadingCn}
            onClick={() => void downloadCnCsv()}
            className="w-full sm:w-auto rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-60 px-4 py-2.5 sm:py-2 text-sm font-semibold text-white"
          >
            {loadingCn ? 'Preparing…' : 'Download credit notes CSV'}
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
          Reset dates to last 30 days → today
        </button>
        <p className="mt-3 text-xs text-gray-500 leading-relaxed">
          If the file only has a header row, no credit notes matched the range—widen the dates or switch{' '}
          <em>Match date by</em>. Includes CN ID, market area, phase/timer columns from the CN workflow, and custom Due
          columns.
        </p>
      </Card>
    </div>
  );
}

async function blobErrorMessage(err: unknown): Promise<string> {
  if (err && typeof err === 'object' && 'response' in err) {
    const r = (err as { response?: { data?: Blob } }).response;
    if (r?.data instanceof Blob) {
      try {
        const text = await r.data.text();
        const j = JSON.parse(text) as { detail?: string };
        if (typeof j.detail === 'string') return j.detail;
      } catch {
        /* ignore */
      }
    }
  }
  return 'Could not download file.';
}
