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

const PHASE_LENGTH_MIN = 1;
const PHASE_LENGTH_MAX = 30;
const PHASE_LENGTH_OPTIONS = Array.from(
  { length: PHASE_LENGTH_MAX - PHASE_LENGTH_MIN + 1 },
  (_, i) => PHASE_LENGTH_MIN + i,
);

function fmt(n: number) {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DueCreditNotesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<DueRow[]>([]);
  const [cols, setCols] = useState<DueCol[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragRowId, setDragRowId] = useState<string | null>(null);
  const [dragColId, setDragColId] = useState<string | null>(null);
  const [swapPick, setSwapPick] =
    useState<{ kind: 'cell'; noteId: string; colId: string } | { kind: 'row'; noteId: string } | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rRes, cRes] = await Promise.all([
        apiClient.get<DueRow[]>('/due/approved-credit-notes'),
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
          : 'Could not load approved credit notes.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(t);
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

  const addColumn = async () => {
    const label = window.prompt('New column name?');
    if (!label?.trim()) return;
    try {
      await apiClient.post('/due/custom-columns', { label: label.trim() });
      await load();
    } catch {
      setError('Could not add column.');
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

  const persistPhaseDays = async (noteId: string, days: number) => {
    try {
      await apiClient.patch(`/due/credit-notes/${noteId}/phase-length`, { phase_length_days: days });
      await load();
    } catch {
      setError('Could not update phase length.');
    }
  };

  const markPaid = async (noteId: string) => {
    setPayingId(noteId);
    try {
      await apiClient.post(`/due/credit-notes/${noteId}/mark-paid`);
      await load();
      void navigate('/due/paid-credit-notes');
    } catch {
      setError('Could not mark paid.');
    } finally {
      setPayingId(null);
    }
  };

  const onDropRow = async (targetId: string) => {
    if (!dragRowId || dragRowId === targetId) {
      setDragRowId(null);
      return;
    }
    try {
      await apiClient.post('/due/swap-rows', {
        credit_note_id_a: dragRowId,
        credit_note_id_b: targetId,
      });
      await load();
    } catch {
      setError('Could not swap row order.');
    }
    setDragRowId(null);
  };

  const onDropColumn = async (targetColId: string) => {
    if (!dragColId || dragColId === targetColId) {
      setDragColId(null);
      return;
    }
    const ids = cols.map((c) => c.id);
    const i = ids.indexOf(dragColId);
    const j = ids.indexOf(targetColId);
    if (i < 0 || j < 0) return;
    const nextIds = [...ids];
    [nextIds[i], nextIds[j]] = [nextIds[j], nextIds[i]];
    try {
      await apiClient.put('/due/custom-columns/reorder', { ordered_column_ids: nextIds });
      await load();
    } catch {
      setError('Could not reorder columns.');
      await load();
    }
    setDragColId(null);
  };

  const swapRowsCustomData = async (noteIdA: string, noteIdB: string) => {
    try {
      await apiClient.post('/due/swap-rows-custom-data', {
        credit_note_id_a: noteIdA,
        credit_note_id_b: noteIdB,
      });
      setSwapPick(null);
      await load();
    } catch {
      setError('Could not swap custom data between rows.');
    }
  };

  const onCustomCellClick = async (noteId: string, colId: string) => {
    if (!swapPick) {
      setSwapPick({ kind: 'cell', noteId, colId });
      return;
    }
    if (swapPick.kind === 'row') {
      await swapRowsCustomData(swapPick.noteId, noteId);
      return;
    }
    if (swapPick.noteId === noteId && swapPick.colId === colId) {
      setSwapPick(null);
      return;
    }
    try {
      await apiClient.post('/due/swap-cells', {
        credit_note_id_a: swapPick.noteId,
        column_id_a: swapPick.colId,
        credit_note_id_b: noteId,
        column_id_b: colId,
      });
      setSwapPick(null);
      await load();
    } catch {
      setError('Could not swap cells.');
    }
  };

  const onRowSwapClick = async (noteId: string) => {
    if (!swapPick) {
      setSwapPick({ kind: 'row', noteId });
      return;
    }
    if (swapPick.kind === 'row') {
      if (swapPick.noteId === noteId) {
        setSwapPick(null);
        return;
      }
      await swapRowsCustomData(swapPick.noteId, noteId);
      return;
    }
    await swapRowsCustomData(swapPick.noteId, noteId);
  };

  const saveCell = async (noteId: string, colId: string, value: string) => {
    try {
      await apiClient.patch(`/due/credit-notes/${noteId}/cell`, { column_id: colId, value });
    } catch {
      setError('Could not save cell.');
    }
  };

  return (
    <div className="space-y-4 min-w-0 max-w-full">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between min-w-0">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900">Due — open credit notes</h2>
          <p className="text-sm text-gray-500">
            Timer runs from <strong>approval time</strong> (not from opening this page); the list refreshes every 30s.
            Amount sits in <strong>Safe</strong>, then moves through{' '}
            <strong>Warning → Danger → Doubtful</strong> by phase length (days). Drag the row grip to reorder rows;
            drag custom column headers to reorder columns. Click two custom cells to swap those values, or use{' '}
            <strong>⇄</strong> on a row then another row or custom cell to swap <em>all</em> custom values between those
            rows.{' '}
            {swapPick?.kind === 'cell' ? (
              <span className="text-amber-700 font-medium">Select second cell, or a row ⇄ / another row.</span>
            ) : swapPick?.kind === 'row' ? (
              <span className="text-amber-700 font-medium">Select another row ⇄ or any custom cell on another row.</span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full sm:w-auto shrink-0">
          <button
            type="button"
            onClick={() => void addColumn()}
            className="w-full sm:w-auto rounded-md border border-slate-300 bg-white px-3 py-2.5 sm:py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
          >
            Add column
          </button>
          <button
            type="button"
            onClick={() => navigate('/due/paid-credit-notes')}
            className="w-full sm:w-auto rounded-md bg-emerald-700 px-3 py-2.5 sm:py-1.5 text-xs font-semibold text-white hover:bg-emerald-600"
          >
            Paid credit notes
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      <Card
        title="Due register"
        subtitle="Phase length is 1–30 days per bucket (same days for Safe, Warning, Danger, then Doubtful). Paid moves the row to the Paid page."
        className="text-sm"
      >
        {loading && rows.length === 0 ? (
          <p className="text-gray-500 py-4">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-gray-500 py-4">No open credit notes. Approved items appear here; use Paid when settled.</p>
        ) : (
          <div className="w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain -mx-1 px-1 sm:mx-0 sm:px-0">
            <table className="min-w-full text-xs border-collapse select-none">
              <thead>
                <tr className="bg-slate-800 text-white text-[10px] uppercase tracking-wide">
                  <th className="px-2 py-2 border border-slate-600 w-16" title="Row grip: drag to reorder; ⇄ swaps custom data">
                    ⋮ / ⇄
                  </th>
                  <th className="px-3 py-2 text-left font-semibold border border-slate-600">CN ID</th>
                  <th className="px-3 py-2 text-left font-semibold border border-slate-600">Particulars</th>
                  <th className="px-3 py-2 text-left font-semibold border border-slate-600">Market</th>
                  <th className="px-3 py-2 text-left font-semibold border border-slate-600">Date</th>
                  <th className="px-3 py-2 text-left font-semibold border border-slate-600">Phase days</th>
                  <th className="px-3 py-2 text-left font-semibold border border-slate-600">Timer</th>
                  <th className="px-3 py-2 text-center font-semibold border border-slate-600">Paid</th>
                  <th className="px-3 py-2 text-right font-semibold border border-slate-600">Safe</th>
                  <th className="px-3 py-2 text-right font-semibold border border-slate-600">Warning</th>
                  <th className="px-3 py-2 text-right font-semibold border border-slate-600">Danger</th>
                  <th className="px-3 py-2 text-right font-semibold border border-slate-600">Doubtful</th>
                  <th className="px-3 py-2 text-right font-semibold border border-slate-600">Total</th>
                  <th className="px-3 py-2 text-left font-semibold border border-slate-600">Approved</th>
                  {cols.map((c) => (
                    <th
                      key={c.id}
                      draggable
                      onDragStart={() => setDragColId(c.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => void onDropColumn(c.id)}
                      className="px-3 py-2 text-left font-semibold border border-slate-600 cursor-grab min-w-[100px]"
                      title="Drag header to swap column order"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate">{c.label}</span>
                        <button
                          type="button"
                          className="shrink-0 rounded px-1 leading-none text-red-200 hover:bg-white/10 hover:text-white"
                          title="Remove column"
                          onClick={(e) => {
                            e.stopPropagation();
                            void deleteColumn(c.id, c.label);
                          }}
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
                  <tr
                    key={r.id}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => void onDropRow(r.id)}
                    className={`hover:bg-slate-50 ${dragRowId === r.id ? 'opacity-70' : ''} ${
                      swapPick?.kind === 'row' && swapPick.noteId === r.id ? 'bg-amber-50' : ''
                    }`}
                  >
                    <td
                      className="px-1 py-2 border border-slate-200 text-slate-500 text-center align-middle"
                      draggable
                      onDragStart={() => setDragRowId(r.id)}
                      onDragEnd={() => setDragRowId(null)}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="cursor-grab text-slate-400" title="Drag to swap row order">
                          ⠿
                        </span>
                        <button
                          type="button"
                          onClick={() => void onRowSwapClick(r.id)}
                          className={`rounded border px-1 py-0 text-[10px] font-semibold leading-tight ${
                            swapPick?.kind === 'row' && swapPick.noteId === r.id
                              ? 'border-amber-500 bg-amber-100 text-amber-900'
                              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                          title="Pick this row to swap all custom column values with another row or cell row"
                        >
                          ⇄
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2 border border-slate-200 font-mono text-[11px] whitespace-nowrap">
                      {r.display_id}
                    </td>
                    <td className="px-3 py-2 border border-slate-200 text-gray-900">{r.particulars}</td>
                    <td className="px-3 py-2 border border-slate-200 text-gray-700">{r.market_area}</td>
                    <td className="px-3 py-2 border border-slate-200 whitespace-nowrap">
                      {new Date(r.date).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 border border-slate-200" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={r.phase_length_days}
                        onChange={(e) => void persistPhaseDays(r.id, Number(e.target.value))}
                        className="w-full max-w-[4.5rem] min-w-0 rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px]"
                      >
                        {Array.from(new Set([...PHASE_LENGTH_OPTIONS, r.phase_length_days]))
                          .filter((d) => (d >= PHASE_LENGTH_MIN && d <= PHASE_LENGTH_MAX) || d === r.phase_length_days)
                          .sort((a, b) => a - b)
                          .map((d) => (
                            <option key={d} value={d}>
                              {d}d
                            </option>
                          ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 border border-slate-200 text-[11px] text-slate-700 whitespace-nowrap">
                      <span className="font-medium capitalize">{r.phase}</span>
                      <span className="text-slate-500 block">{r.timer_label}</span>
                    </td>
                    <td className="px-3 py-2 border border-slate-200 text-center">
                      <button
                        type="button"
                        disabled={payingId === r.id}
                        onClick={() => void markPaid(r.id)}
                        className="rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        {payingId === r.id ? '…' : 'Paid'}
                      </button>
                    </td>
                    <td className="px-3 py-2 border border-slate-200 text-right tabular-nums">{fmt(r.safe)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right tabular-nums">{fmt(r.warning)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right tabular-nums">{fmt(r.danger)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right tabular-nums">{fmt(r.doubtful)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right tabular-nums font-medium">{fmt(r.total)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-[11px] text-gray-500 whitespace-nowrap">
                      {new Date(r.approved_at).toLocaleString()}
                    </td>
                    {cols.map((c) => {
                      const picked =
                        swapPick?.kind === 'cell' && swapPick.noteId === r.id && swapPick.colId === c.id
                          ? 'ring-2 ring-amber-400'
                          : '';
                      return (
                        <td
                          key={c.id}
                          className={`px-2 py-1 border border-slate-200 min-w-[100px] ${picked}`}
                          onClick={() => void onCustomCellClick(r.id, c.id)}
                        >
                          <input
                            defaultValue={r.custom_cells[c.id] ?? ''}
                            key={`${r.id}-${c.id}-${r.custom_cells[c.id] ?? ''}`}
                            onBlur={(e) => void saveCell(r.id, c.id, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] hover:border-slate-200 focus:border-indigo-400 focus:outline-none"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-semibold text-gray-900">
                  <td colSpan={8} className="px-3 py-2 border border-slate-200 text-right">
                    Totals
                  </td>
                  <td className="px-3 py-2 border border-slate-200 text-right tabular-nums">{fmt(totals.safe)}</td>
                  <td className="px-3 py-2 border border-slate-200 text-right tabular-nums">{fmt(totals.warning)}</td>
                  <td className="px-3 py-2 border border-slate-200 text-right tabular-nums">{fmt(totals.danger)}</td>
                  <td className="px-3 py-2 border border-slate-200 text-right tabular-nums">{fmt(totals.doubtful)}</td>
                  <td className="px-3 py-2 border border-slate-200 text-right tabular-nums">{fmt(totals.total)}</td>
                  <td colSpan={1 + cols.length} className="px-3 py-2 border border-slate-200" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
