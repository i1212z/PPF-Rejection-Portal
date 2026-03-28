import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/client';
import { Card } from '../components/ui/Card';

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
}

function fmt(n: number) {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DueCreditNotesPage() {
  const [rows, setRows] = useState<DueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<DueRow[]>('/due/approved-credit-notes');
      setRows(res.data ?? []);
    } catch (err: unknown) {
      setRows([]);
      const msg =
        err && typeof err === 'object' && 'response' in err && (err as any).response?.data?.detail
          ? String((err as any).response.data.detail)
          : 'Could not load approved credit notes.';
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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Due — approved credit notes</h2>
        <p className="text-sm text-gray-500">
          Tabular register of all approved B2B credit notes (Particulars, date, classification amounts, total).
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      <Card title="Particulars" subtitle="DATE = delivery date. SAFE / WARNING / DANGER / DOUBTFUL / TOTAL as captured on the credit note." className="text-sm">
        {loading ? (
          <p className="text-gray-500 py-4">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-gray-500 py-4">No approved credit notes yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-800 text-white text-[10px] uppercase tracking-wide">
                  <th className="px-3 py-2 text-left font-semibold border border-slate-600">CN ID</th>
                  <th className="px-3 py-2 text-left font-semibold border border-slate-600">Particulars</th>
                  <th className="px-3 py-2 text-left font-semibold border border-slate-600">Market area</th>
                  <th className="px-3 py-2 text-left font-semibold border border-slate-600">Date</th>
                  <th className="px-3 py-2 text-right font-semibold border border-slate-600">Safe</th>
                  <th className="px-3 py-2 text-right font-semibold border border-slate-600">Warning</th>
                  <th className="px-3 py-2 text-right font-semibold border border-slate-600">Danger</th>
                  <th className="px-3 py-2 text-right font-semibold border border-slate-600">Doubtful</th>
                  <th className="px-3 py-2 text-right font-semibold border border-slate-600">Total</th>
                  <th className="px-3 py-2 text-left font-semibold border border-slate-600">Approved</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 border border-slate-200 font-mono text-[11px] whitespace-nowrap">
                      {r.display_id}
                    </td>
                    <td className="px-3 py-2 border border-slate-200 text-gray-900">{r.particulars}</td>
                    <td className="px-3 py-2 border border-slate-200 text-gray-700">{r.market_area}</td>
                    <td className="px-3 py-2 border border-slate-200 whitespace-nowrap">
                      {new Date(r.date).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 border border-slate-200 text-right tabular-nums">{fmt(r.safe)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right tabular-nums">{fmt(r.warning)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right tabular-nums">{fmt(r.danger)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right tabular-nums">{fmt(r.doubtful)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right tabular-nums font-medium">{fmt(r.total)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-[11px] text-gray-500 whitespace-nowrap">
                      {new Date(r.approved_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-semibold text-gray-900">
                  <td colSpan={4} className="px-3 py-2 border border-slate-200 text-right">
                    Totals
                  </td>
                  <td className="px-3 py-2 border border-slate-200 text-right tabular-nums">{fmt(totals.safe)}</td>
                  <td className="px-3 py-2 border border-slate-200 text-right tabular-nums">{fmt(totals.warning)}</td>
                  <td className="px-3 py-2 border border-slate-200 text-right tabular-nums">{fmt(totals.danger)}</td>
                  <td className="px-3 py-2 border border-slate-200 text-right tabular-nums">{fmt(totals.doubtful)}</td>
                  <td className="px-3 py-2 border border-slate-200 text-right tabular-nums">{fmt(totals.total)}</td>
                  <td className="px-3 py-2 border border-slate-200" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
