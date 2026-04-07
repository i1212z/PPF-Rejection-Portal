import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { Card } from '../components/ui/Card';

export default function DueSettingsPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetAllScans = async () => {
    setError(null);
    const ok = window.confirm(
      'This will permanently delete every report scan (Scan 1, 2, …), all customer lines, paid/unpaid data, and zone adjustment history. Workbook title and date range will be cleared.\n\nContinue?',
    );
    if (!ok) return;
    const typed = window.prompt('Type RESET SCANS in capital letters to confirm.');
    if (typed !== 'RESET SCANS') {
      if (typed !== null) setError('Confirmation text did not match. Nothing was deleted.');
      return;
    }
    setBusy(true);
    try {
      await apiClient.delete('/due/aging/reset-scans');
      navigate('/due/credit-notes');
    } catch (err: unknown) {
      const msg =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          ? String((err as { response: { data: { detail: string } } }).response.data.detail)
          : 'Could not reset scans.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 min-w-0 max-w-full sm:max-w-lg">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Due — settings</h2>
        <p className="text-sm text-gray-500">Dangerous actions for the Excel aging register and scan timeline.</p>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <Card title="Report scans" subtitle="Scanning &amp; upload history" className="text-sm">
        <p className="text-xs text-slate-600 mb-3">
          Use <strong>Reset all report scans</strong> to wipe the entire due register: all snapshots, lines, and audit
          history. Use this when you need a clean slate (not for removing only open lines — use “Reset open sheet” on the
          open sheet for that).
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void resetAllScans()}
          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900 hover:bg-red-100 disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Reset all report scans'}
        </button>
      </Card>
    </div>
  );
}
