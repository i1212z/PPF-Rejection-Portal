import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { Card } from '../components/ui/Card';

interface DueCol {
  id: string;
  label: string;
}

interface DueRow {
  id: string;
  display_id: string;
  particulars: string;
  market_area: string;
  date: string;
  approved_at: string;
  safe: number;
  warning: number;
  danger: number;
  doubtful: number;
  total: number;
  phase: string;
  timer_label: string;
  phase_length_days: number;
  paid_at?: string | null;
  custom_cells: Record<string, string>;
}

function fmt(n: number) {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DuePaidCreditNotesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<DueRow[]>([]);
  const [cols, setCols] = useState<DueCol[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rRes, cRes] = await Promise.all([
        apiClient.get<DueRow[]>('/due/paid-credit-notes'),
        apiClient.get<DueCol[]>('/due/custom-columns'),
      ]);
      setRows(rRes.data ?? []);
      setCols(cRes.data ?? []);
    } catch (err: unknown) {
      setRows([]);
      setCols([]);
      const msg =
        err && typeof err === 'object' && 'response' in err && (err as any).response?.data?.detail
          ? String((err as any).response.data.detail)
          : 'Could not load paid credit notes.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        safe: acc.safe + r.safe,
        warning: acc.warning + r.warning,
        danger: acc.danger + r.danger,
        doubtful: acc.doubtful + r.doubtful,
        total: acc.total + r.total,
      }),
      { safe: 0, warning: 0, danger: 0, doubtful: 0, total: 0 },
    );
  }, [rows]);

  const markUnpaid = async (id: string) => {
    setBusyId(id);
    try {
      await apiClient.post(`/due/credit-notes/${id}/mark-unpaid`);
      await load();
    } catch {
      setError('Could not move back to open.');
    } finally {
      setBusyId(null);
    }
  };

  const deleteColumn = async (colId: string, label: string) => {
    if (!window.confirm(`Remove column "${label}" and all its cell values?`)) return;
    try {
      await apiClient.delete(`/due/custom-columns/${colId}`);
      await load();
    } catch {
      setError('Could not remove column.');
    }
  };

  return (
    <div className="space-y-4 min-w-0 max-w-full">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between min-w-0">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900">Paid credit notes</h2>
          <p className="text-sm text-gray-500">
            Settled items (aging frozen at paid time). Move back to open if needed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/due/credit-notes')}
          className="w-full sm:w-auto rounded-md border border-slate-300 bg-white px-3 py-2.5 sm:py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 shrink-0"
        >
          Back to open
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      <Card title="Paid register" className="text-sm">
        {loading && rows.length === 0 ? (
          <p className="text-gray-500 py-4">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-gray-500 py-4">No paid credit notes yet.</p>
        ) : (
          <div className="w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain -mx-1 px-1 sm:mx-0 sm:px-0">
            <table className="min-w-full text-xs border-collapse">
              <thead>
                <tr className="bg-emerald-900 text-white text-[10px] uppercase tracking-wide">
                  <th className="px-3 py-2 text-left font-semibold border border-emerald-700">CN ID</th>
                  <th className="px-3 py-2 text-left font-semibold border border-emerald-700">Particulars</th>
                  <th className="px-3 py-2 text-left font-semibold border border-emerald-700">Market</th>
                  <th className="px-3 py-2 text-left font-semibold border border-emerald-700">Date</th>
                  <th className="px-3 py-2 text-left font-semibold border border-emerald-700">Phase @ paid</th>
                  <th className="px-3 py-2 text-right font-semibold border border-emerald-700">Safe</th>
                  <th className="px-3 py-2 text-right font-semibold border border-emerald-700">Warning</th>
                  <th className="px-3 py-2 text-right font-semibold border border-emerald-700">Danger</th>
                  <th className="px-3 py-2 text-right font-semibold border border-emerald-700">Doubtful</th>
                  <th className="px-3 py-2 text-right font-semibold border border-emerald-700">Total</th>
                  <th className="px-3 py-2 text-left font-semibold border border-emerald-700">Paid at</th>
                  <th className="px-3 py-2 text-center font-semibold border border-emerald-700">Action</th>
                  {cols.map((c) => (
                    <th key={c.id} className="px-3 py-2 text-left font-semibold border border-emerald-700 min-w-[100px]">
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate">{c.label}</span>
                        <button
                          type="button"
                          className="shrink-0 rounded px-1 leading-none text-red-200 hover:bg-white/10 hover:text-white"
                          title="Remove column"
                          onClick={() => void deleteColumn(c.id, c.label)}
                        >
                          ×
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-emerald-50/30">
                    <td className="px-3 py-2 border border-slate-200 font-mono text-[11px]">{r.display_id}</td>
                    <td className="px-3 py-2 border border-slate-200">{r.particulars}</td>
                    <td className="px-3 py-2 border border-slate-200">{r.market_area}</td>
                    <td className="px-3 py-2 border border-slate-200 whitespace-nowrap">
                      {new Date(r.date).toLocaleDateString('en-GB')}
                    </td>
                    <td className="px-3 py-2 border border-slate-200 capitalize text-[11px]">
                      {r.phase}
                      <span className="block text-slate-500">{r.timer_label}</span>
                    </td>
                    <td className="px-3 py-2 border border-slate-200 text-right tabular-nums">{fmt(r.safe)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right tabular-nums">{fmt(r.warning)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right tabular-nums">{fmt(r.danger)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right tabular-nums">{fmt(r.doubtful)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right tabular-nums font-medium">{fmt(r.total)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-[11px] text-gray-600 whitespace-nowrap">
                      {r.paid_at ? new Date(r.paid_at).toLocaleString('en-GB') : '–'}
                    </td>
                    <td className="px-3 py-2 border border-slate-200 text-center">
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void markUnpaid(r.id)}
                        className="rounded-full border border-slate-300 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {busyId === r.id ? '…' : 'Unpaid'}
                      </button>
                    </td>
                    {cols.map((c) => (
                      <td key={c.id} className="px-3 py-2 border border-slate-200 text-[11px]">
                        {r.custom_cells[c.id] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-semibold">
                  <td colSpan={5} className="px-3 py-2 border border-slate-200 text-right">
                    Totals
                  </td>
                  <td className="px-3 py-2 border border-slate-200 text-right tabular-nums">{fmt(totals.safe)}</td>
                  <td className="px-3 py-2 border border-slate-200 text-right tabular-nums">{fmt(totals.warning)}</td>
                  <td className="px-3 py-2 border border-slate-200 text-right tabular-nums">{fmt(totals.danger)}</td>
                  <td className="px-3 py-2 border border-slate-200 text-right tabular-nums">{fmt(totals.doubtful)}</td>
                  <td className="px-3 py-2 border border-slate-200 text-right tabular-nums">{fmt(totals.total)}</td>
                  <td colSpan={2 + cols.length} className="px-3 py-2 border border-slate-200" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
