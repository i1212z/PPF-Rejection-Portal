import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { Card } from '../components/ui/Card';

interface SheetTotals {
  grand_totals: { row_count: number; safe: number; warning: number; danger: number; doubtful: number; total: number };
}

export default function DueReportPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unpaidCount, setUnpaidCount] = useState<number | null>(null);
  const [paidCount, setPaidCount] = useState<number | null>(null);

  const refreshSummary = useCallback(async () => {
    try {
      const [openRes, paidRes] = await Promise.all([
        apiClient.get<SheetTotals>('/due/aging/open'),
        apiClient.get<SheetTotals>('/due/aging/paid'),
      ]);
      setUnpaidCount(openRes.data?.grand_totals?.row_count ?? 0);
      setPaidCount(paidRes.data?.grand_totals?.row_count ?? 0);
    } catch {
      setUnpaidCount(null);
      setPaidCount(null);
    }
  }, []);

  useEffect(() => {
    void refreshSummary();
  }, [refreshSummary]);

  const downloadBlob = async (path: string, filename: string) => {
    const res = await apiClient.get<Blob>(path, { responseType: 'blob' });
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

  const downloadReport = async () => {
    setError(null);
    setLoading(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      await downloadBlob('/due/aging/report.csv', `due-register-unpaid-paid-${stamp}.csv`);
      await refreshSummary();
    } catch (err: unknown) {
      setError(await blobErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 min-w-0 max-w-full">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Due register — report</h2>
        <p className="text-sm text-gray-500">
          Download your current <strong>uploaded aging workbook</strong> only: every line with{' '}
          <strong>Unpaid</strong> or <strong>Paid</strong> status, zone amounts, subtotals by status, and grand total.
          This replaces the old credit-note CSV on this page.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {(unpaidCount !== null || paidCount !== null) && (
        <div className="grid grid-cols-2 gap-2 sm:max-w-md">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <div className="text-[11px] text-gray-500 uppercase tracking-wide">Unpaid (open)</div>
            <div className="text-lg font-semibold text-gray-900">{unpaidCount ?? '—'} lines</div>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2 text-sm">
            <div className="text-[11px] text-emerald-800 uppercase tracking-wide">Paid</div>
            <div className="text-lg font-semibold text-emerald-900">{paidCount ?? '—'} lines</div>
          </div>
        </div>
      )}

      <Card
        title="Export CSV (Unpaid + Paid)"
        subtitle="UTF-8 with BOM for Excel. Top of file: summary counts, subtotal UNPAID, subtotal PAID, then each row with Status column, then grand total."
        className="text-sm"
      >
        <button
          type="button"
          disabled={loading}
          onClick={() => void downloadReport()}
          className="w-full sm:w-auto rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 px-4 py-2.5 sm:py-2 text-sm font-semibold text-white"
        >
          {loading ? 'Preparing…' : 'Download register report'}
        </button>
        <p className="mt-3 text-xs text-gray-500 leading-relaxed">
          <strong>Status</strong> is either <code className="text-[11px] bg-gray-100 px-1 rounded">Unpaid</code> (still
          on the open sheet) or <code className="text-[11px] bg-gray-100 px-1 rounded">Paid</code>. Paid rows include{' '}
          <em>Paid at (UTC)</em>; unpaid rows leave that blank.
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
