import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { Card } from '../components/ui/Card';

type BucketKey = 'safe' | 'warning' | 'danger' | 'doubtful';

interface DueAgingRow {
  id: string;
  location_group: string;
  location_sort: number;
  location_label: string;
  particulars: string;
  safe: number;
  warning: number;
  danger: number;
  doubtful: number;
  total: number;
  sort_order: number;
  paid_at?: string | null;
}

interface DueAgingLocationBlock {
  location_group: string;
  location_sort: number;
  location_label: string;
  rows: DueAgingRow[];
}

interface DueAgingMeta {
  company_title: string;
  date_range_label: string;
  bucket_order: string[];
}

interface DueAgingSheetResponse {
  meta: DueAgingMeta;
  locations: DueAgingLocationBlock[];
  grand_totals: {
    safe: number;
    warning: number;
    danger: number;
    doubtful: number;
    total: number;
    row_count: number;
  };
}

const BUCKET_LABELS: Record<BucketKey, string> = {
  safe: 'Safe',
  warning: 'Warning',
  danger: 'Danger',
  doubtful: 'Doubtful',
};

function fmt(n: number) {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseMoneyInput(raw: string): number | null {
  const t = raw.replace(/,/g, '').trim();
  if (t === '' || t === '-') return 0;
  const v = Number.parseFloat(t);
  return Number.isFinite(v) ? v : null;
}

export default function DueAgingRegisterPage({ mode }: { mode: 'open' | 'paid' }) {
  const paidOnly = mode === 'paid';
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<DueAgingSheetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragRowId, setDragRowId] = useState<string | null>(null);
  const [dragBucket, setDragBucket] = useState<BucketKey | null>(null);
  const [zonePick, setZonePick] = useState<{ rowId: string; zone: BucketKey } | null>(null);
  const [rowDataPick, setRowDataPick] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);

  const endpoint = paidOnly ? '/due/aging/paid' : '/due/aging/open';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<DueAgingSheetResponse>(endpoint);
      setSheet(res.data ?? null);
    } catch (err: unknown) {
      setSheet(null);
      const msg =
        err && typeof err === 'object' && 'response' in err && (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          ? String((err as { response: { data: { detail: string } } }).response.data.detail)
          : 'Could not load due sheet.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  const bucketOrder = useMemo((): BucketKey[] => {
    const raw = sheet?.meta.bucket_order ?? ['safe', 'warning', 'danger', 'doubtful'];
    const allowed: BucketKey[] = ['safe', 'warning', 'danger', 'doubtful'];
    const out: BucketKey[] = [];
    for (const k of raw) {
      const kk = String(k).toLowerCase() as BucketKey;
      if (allowed.includes(kk) && !out.includes(kk)) out.push(kk);
    }
    for (const k of allowed) {
      if (!out.includes(k)) out.push(k);
    }
    return out.slice(0, 4) as BucketKey[];
  }, [sheet?.meta.bucket_order]);

  const onUpload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiClient.post<DueAgingSheetResponse>('/due/aging/upload', fd);
      setSheet(res.data ?? null);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err && (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          ? String((err as { response: { data: { detail: string } } }).response.data.detail)
          : 'Upload failed.';
      setError(msg);
    } finally {
      setUploading(false);
    }
  };

  const persistBucketOrder = async (next: BucketKey[]) => {
    try {
      const res = await apiClient.put<{ bucket_order: string[] }>('/due/aging/bucket-order', { bucket_order: next });
      setSheet((prev) =>
        prev
          ? {
              ...prev,
              meta: {
                ...prev.meta,
                bucket_order: res.data.bucket_order as string[],
              },
            }
          : prev,
      );
    } catch {
      setError('Could not update column order.');
      void load();
    }
    setDragBucket(null);
  };

  const onDropBucket = (target: BucketKey) => {
    if (!dragBucket || dragBucket === target) {
      setDragBucket(null);
      return;
    }
    const ids = [...bucketOrder];
    const i = ids.indexOf(dragBucket);
    const j = ids.indexOf(target);
    if (i < 0 || j < 0) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    void persistBucketOrder(next);
  };

  const patchRow = async (
    id: string,
    body: Partial<Record<'particulars' | BucketKey | 'total', string | number>>,
  ) => {
    try {
      await apiClient.patch(`/due/aging/rows/${id}`, body);
    } catch {
      setError('Could not save cell.');
    }
  };

  const onZoneCellClick = async (rowId: string, zone: BucketKey) => {
    if (!zonePick) {
      setZonePick({ rowId, zone });
      return;
    }
    if (zonePick.rowId === rowId && zonePick.zone === zone) {
      setZonePick(null);
      return;
    }
    if (zone !== zonePick.zone) {
      setError('Zone swap: choose another row in the same column (Safe, Warning, Danger, or Doubtful).');
      return;
    }
    try {
      await apiClient.post('/due/aging/swap-zone-cells', {
        row_id_a: zonePick.rowId,
        row_id_b: rowId,
        zone: zonePick.zone,
      });
      setZonePick(null);
      await load();
    } catch {
      setError('Could not swap zone amounts.');
    }
  };

  const onRowDataSwapClick = async (rowId: string) => {
    if (!rowDataPick) {
      setRowDataPick(rowId);
      return;
    }
    if (rowDataPick === rowId) {
      setRowDataPick(null);
      return;
    }
    try {
      await apiClient.post('/due/aging/swap-rows-data', { row_id_a: rowDataPick, row_id_b: rowId });
      setRowDataPick(null);
      await load();
    } catch {
      setError('Could not swap row data.');
    }
  };

  const onDropRow = async (targetId: string) => {
    if (!dragRowId || dragRowId === targetId) {
      setDragRowId(null);
      return;
    }
    try {
      await apiClient.post('/due/aging/swap-rows-order', { row_id_a: dragRowId, row_id_b: targetId });
      await load();
    } catch {
      setError('Reorder: drop on another row in the same location block (open with open, paid with paid).');
    }
    setDragRowId(null);
  };

  const markPaid = async (id: string) => {
    setPayingId(id);
    try {
      await apiClient.post(`/due/aging/rows/${id}/mark-paid`);
      await load();
      void navigate('/due/paid-credit-notes');
    } catch {
      setError('Could not mark paid.');
    } finally {
      setPayingId(null);
    }
  };

  const markUnpaid = async (id: string) => {
    try {
      await apiClient.post(`/due/aging/rows/${id}/mark-unpaid`);
      await load();
    } catch {
      setError('Could not restore to open register.');
    }
  };

  const blockTotals = (rows: DueAgingRow[]) =>
    rows.reduce(
      (a, r) => ({
        safe: a.safe + r.safe,
        warning: a.warning + r.warning,
        danger: a.danger + r.danger,
        doubtful: a.doubtful + r.doubtful,
        total: a.total + r.total,
      }),
      { safe: 0, warning: 0, danger: 0, doubtful: 0, total: 0 },
    );

  const renderAmountCell = (r: DueAgingRow, zone: BucketKey) => {
    const val = r[zone];
    const picked =
      zonePick?.rowId === r.id && zonePick?.zone === zone ? 'ring-2 ring-amber-400 ring-inset' : '';
    return (
      <td
        key={zone}
        className={`px-2 py-1.5 border border-slate-200 text-right align-middle ${picked}`}
        onClick={() => void onZoneCellClick(r.id, zone)}
      >
        <input
          defaultValue={val === 0 ? '' : fmt(val)}
          key={`${r.id}-${zone}-${val}`}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => {
            const n = parseMoneyInput(e.target.value);
            if (n === null) return;
            if (Math.abs(n - val) < 0.005) return;
            void patchRow(r.id, { [zone]: n }).then(() => load());
          }}
          inputMode="decimal"
          className="w-full min-w-[4.5rem] max-w-[7rem] ml-auto rounded border border-transparent bg-transparent px-1 py-0.5 text-right tabular-nums text-[11px] hover:border-slate-200 focus:border-indigo-400 focus:outline-none"
        />
      </td>
    );
  };

  return (
    <div className="space-y-4 min-w-0 max-w-full pb-20 md:pb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between min-w-0">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900">
            {paidOnly ? 'Due — paid sheet' : 'Due — open sheet'}
          </h2>
          <p className="text-sm text-gray-500">
            {paidOnly
              ? 'Rows marked paid from the open register. Use Unpaid to send a row back.'
              : 'Upload an Excel file with location bands (Calicut / Kochi / Tamil Nadu) and columns Particulars, Safe, Warning, Danger, Doubtful, Total. Amounts in each zone stay exactly as imported or as you edit them—nothing moves automatically over time. Drag row handles to swap order within a location; drag zone headers to reorder columns; tap two cells in the same zone column to swap that amount between rows; use ⇄ to swap all zone amounts and particulars between two rows; or type directly in any cell to move balances manually.'}
          </p>
          {zonePick && (
            <p className="text-xs text-amber-800 font-medium mt-1">Select another cell in the same zone column to swap amounts.</p>
          )}
          {rowDataPick && (
            <p className="text-xs text-amber-800 font-medium mt-1">Select another row ⇄ to swap full row data.</p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full sm:w-auto shrink-0">
          {!paidOnly && (
            <label className="w-full sm:w-auto inline-flex items-center justify-center rounded-md bg-indigo-600 px-3 py-2.5 sm:py-2 text-sm font-semibold text-white hover:bg-indigo-500 cursor-pointer disabled:opacity-60">
              <input
                type="file"
                accept=".xlsx,.xlsm"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  e.target.value = '';
                  void onUpload(f);
                }}
              />
              {uploading ? 'Uploading…' : 'Upload Excel'}
            </label>
          )}
          {!paidOnly && (
            <button
              type="button"
              onClick={() => void navigate('/due/paid-credit-notes')}
              className="w-full sm:w-auto rounded-md bg-emerald-700 px-3 py-2.5 sm:py-2 text-sm font-semibold text-white hover:bg-emerald-600"
            >
              Paid sheet
            </button>
          )}
          {paidOnly && (
            <button
              type="button"
              onClick={() => void navigate('/due/credit-notes')}
              className="w-full sm:w-auto rounded-md border border-slate-300 bg-white px-3 py-2.5 sm:py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Open sheet
            </button>
          )}
          <button
            type="button"
            onClick={() => void navigate('/due/report')}
            className="w-full sm:w-auto rounded-md border border-slate-300 bg-white px-3 py-2.5 sm:py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            CN report
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {sheet?.meta.company_title && (
        <div className="text-center space-y-1 px-2">
          <div className="text-sm sm:text-base font-bold text-gray-900 tracking-tight">{sheet.meta.company_title}</div>
          {sheet.meta.date_range_label ? (
            <div className="text-xs text-gray-600">{sheet.meta.date_range_label}</div>
          ) : null}
        </div>
      )}

      {sheet && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {(['safe', 'warning', 'danger', 'doubtful', 'total'] as const).map((k) => (
            <Card
              key={k}
              title={k === 'total' ? 'Total outstanding' : BUCKET_LABELS[k as BucketKey]}
              className="text-sm"
            >
              <div className="text-lg font-semibold tabular-nums text-gray-900">
                {fmt(sheet.grand_totals[k === 'total' ? 'total' : k])}
              </div>
            </Card>
          ))}
          <Card title="Rows" className="text-sm">
            <div className="text-lg font-semibold text-gray-900">{sheet.grand_totals.row_count}</div>
          </Card>
        </div>
      )}

      <Card
        title={paidOnly ? 'Paid register' : 'Aging register'}
        subtitle={
          paidOnly
            ? 'Imported rows you marked as paid.'
            : 'Paid clears only from the open sheet; upload replaces open rows and keeps paid history.'
        }
        className="text-sm"
      >
        {loading && !sheet ? (
          <p className="text-gray-500 py-4">Loading…</p>
        ) : !sheet?.locations.length ? (
          <p className="text-gray-500 py-4">
            {paidOnly
              ? 'No paid rows yet.'
              : 'No open rows. Upload an .xlsx workbook that matches your due sheet layout.'}
          </p>
        ) : (
          sheet.locations.map((block) => {
            const bt = blockTotals(block.rows);
            return (
              <div key={block.location_group} className="mb-8 last:mb-0">
                <h3 className="text-sm font-bold text-gray-900 border-b border-slate-300 pb-2 mb-2">
                  {block.location_label}
                  <span className="ml-2 text-xs font-normal text-gray-500">({block.location_group})</span>
                </h3>
                <div className="w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain -mx-1 px-1 sm:mx-0 sm:px-0">
                  <table className="min-w-[640px] w-full text-xs border-collapse select-none">
                    <thead>
                      <tr className="bg-slate-800 text-white">
                        <th
                          className="px-2 py-2 border border-slate-600 w-14 text-center text-[10px] font-semibold"
                          title="Drag to swap row order with another row in this block"
                        >
                          ⋮
                        </th>
                        {!paidOnly && (
                          <th className="px-2 py-2 border border-slate-600 w-16 text-center text-[10px] font-semibold">
                            Paid
                          </th>
                        )}
                        {paidOnly && (
                          <th className="px-2 py-2 border border-slate-600 w-16 text-center text-[10px] font-semibold">
                            Unpaid
                          </th>
                        )}
                        <th className="px-2 py-2 border border-slate-600 text-left text-[10px] font-semibold min-w-[140px]">
                          Particulars
                        </th>
                        <th
                          colSpan={bucketOrder.length}
                          className="px-2 py-1 border border-slate-600 text-center text-[10px] font-bold tracking-wide"
                        >
                          Zone
                        </th>
                        <th className="px-2 py-2 border border-slate-600 text-right text-[10px] font-semibold">Total</th>
                      </tr>
                      <tr className="bg-slate-700 text-white">
                        <th className="border border-slate-600" />
                        {!paidOnly && <th className="border border-slate-600" />}
                        {paidOnly && <th className="border border-slate-600" />}
                        <th className="border border-slate-600" />
                        {bucketOrder.map((bk) => (
                          <th
                            key={bk}
                            draggable
                            onDragStart={() => setDragBucket(bk)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => onDropBucket(bk)}
                            className="px-2 py-2 border border-slate-600 text-right text-[10px] font-semibold cursor-grab whitespace-nowrap"
                            title="Drag to reorder zone columns"
                          >
                            {BUCKET_LABELS[bk].toUpperCase()}
                          </th>
                        ))}
                        <th className="border border-slate-600" />
                      </tr>
                    </thead>
                    <tbody>
                      {block.rows.map((r) => (
                        <tr
                          key={r.id}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => void onDropRow(r.id)}
                          className={`hover:bg-slate-50 ${dragRowId === r.id ? 'opacity-70' : ''} ${
                            rowDataPick === r.id ? 'bg-amber-50' : ''
                          }`}
                        >
                          <td
                            className="px-1 py-2 border border-slate-200 text-center align-middle text-slate-400"
                            draggable
                            onDragStart={() => setDragRowId(r.id)}
                            onDragEnd={() => setDragRowId(null)}
                          >
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="cursor-grab" title="Drag to swap order">
                                ⠿
                              </span>
                              <button
                                type="button"
                                onClick={() => void onRowDataSwapClick(r.id)}
                                className={`rounded border px-1 py-0 text-[10px] font-semibold leading-tight ${
                                  rowDataPick === r.id
                                    ? 'border-amber-500 bg-amber-100 text-amber-900'
                                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                                }`}
                                title="Swap all zone amounts and particulars with another row"
                              >
                                ⇄
                              </button>
                            </div>
                          </td>
                          {!paidOnly && (
                            <td className="px-2 py-2 border border-slate-200 text-center align-middle">
                              <button
                                type="button"
                                disabled={payingId === r.id}
                                onClick={() => void markPaid(r.id)}
                                className="rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 whitespace-nowrap"
                              >
                                {payingId === r.id ? '…' : 'Paid'}
                              </button>
                            </td>
                          )}
                          {paidOnly && (
                            <td className="px-2 py-2 border border-slate-200 text-center align-middle">
                              <button
                                type="button"
                                onClick={() => void markUnpaid(r.id)}
                                className="rounded-full border border-slate-400 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                              >
                                Unpaid
                              </button>
                            </td>
                          )}
                          <td className="px-2 py-1.5 border border-slate-200 align-middle min-w-[120px]">
                            <input
                              defaultValue={r.particulars}
                              key={`${r.id}-p-${r.particulars}`}
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                if (v === r.particulars) return;
                                void patchRow(r.id, { particulars: v }).then(() => load());
                              }}
                              className="w-full min-w-[8rem] rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] hover:border-slate-200 focus:border-indigo-400 focus:outline-none"
                            />
                          </td>
                          {bucketOrder.map((bk) => renderAmountCell(r, bk))}
                          <td className="px-2 py-1.5 border border-slate-200 text-right tabular-nums font-medium text-[11px]">
                            {fmt(r.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 font-semibold text-gray-900">
                        <td
                          colSpan={3}
                          className="px-2 py-2 border border-slate-200 text-right text-[11px]"
                        >
                          Block total
                        </td>
                        {bucketOrder.map((bk) => (
                          <td key={bk} className="px-2 py-2 border border-slate-200 text-right tabular-nums text-[11px]">
                            {fmt(bt[bk])}
                          </td>
                        ))}
                        <td className="px-2 py-2 border border-slate-200 text-right tabular-nums text-[11px]">
                          {fmt(bt.total)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}
