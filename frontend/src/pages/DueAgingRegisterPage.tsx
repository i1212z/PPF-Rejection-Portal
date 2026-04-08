import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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

interface DueAgingScanBrief {
  id: string;
  scan_number: number;
  company_title: string;
  date_range_label: string;
  bucket_order: string[];
  uploaded_at: string;
  source_filename?: string | null;
}

interface DueAgingSheetResponse {
  scan: DueAgingScanBrief | null;
  is_latest_scan: boolean;
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

interface DueAgingScanListItem {
  id: string;
  scan_number: number;
  company_title: string;
  date_range_label: string;
  uploaded_at: string;
  source_filename?: string | null;
  open_lines: number;
  paid_lines: number;
  is_latest: boolean;
}

interface DueAgingHistoryItem {
  id: string;
  row_id: string;
  zone: BucketKey;
  action: 'add' | 'subtract' | 'paid' | string;
  delta: number;
  value_before: number;
  value_after: number;
  note?: string | null;
  created_at: string;
}

const BUCKET_LABELS: Record<BucketKey, string> = {
  safe: 'Safe',
  warning: 'Warning',
  danger: 'Danger',
  doubtful: 'Doubtful',
};

const ZONE_HEADER_CLASSES: Record<BucketKey, string> = {
  safe: 'bg-green-700 border-green-600',
  warning: 'bg-yellow-700 border-yellow-600',
  danger: 'bg-orange-700 border-orange-600',
  doubtful: 'bg-red-700 border-red-600',
};

const ZONE_CELL_CLASSES: Record<BucketKey, string> = {
  safe: 'bg-green-50',
  warning: 'bg-yellow-50',
  danger: 'bg-orange-50',
  doubtful: 'bg-red-50',
};

const MANUAL_LOC_OPTIONS = [
  { value: 'CLT', label: 'CLT / Calicut' },
  { value: 'KOCHI', label: 'Kochi' },
  { value: 'TN', label: 'Tamil Nadu' },
  { value: 'OTHER', label: 'Other' },
] as const;

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
  const [searchParams, setSearchParams] = useSearchParams();
  const scanIdParam = searchParams.get('scan');
  const [scans, setScans] = useState<DueAgingScanListItem[]>([]);
  const [sheet, setSheet] = useState<DueAgingSheetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragRowId, setDragRowId] = useState<string | null>(null);
  const [dragBucket, setDragBucket] = useState<BucketKey | null>(null);
  const [zonePick, setZonePick] = useState<{ rowId: string; zone: BucketKey } | null>(null);
  const [rowDataPick, setRowDataPick] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [zoneFilter, setZoneFilter] = useState<'all' | BucketKey>('all');
  const [historyForRow, setHistoryForRow] = useState<string | null>(null);
  const [historyMap, setHistoryMap] = useState<Record<string, DueAgingHistoryItem[]>>({});
  const [addRowOpen, setAddRowOpen] = useState(false);
  const [addRowBusy, setAddRowBusy] = useState(false);
  const [addParticulars, setAddParticulars] = useState('');
  const [addLoc, setAddLoc] = useState<string>('OTHER');
  const [addLocLabel, setAddLocLabel] = useState('');

  const endpoint = paidOnly ? '/due/aging/paid' : '/due/aging/open';

  const loadScans = useCallback(async () => {
    try {
      const res = await apiClient.get<DueAgingScanListItem[]>('/due/aging/scans');
      setScans(res.data ?? []);
    } catch {
      setScans([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<DueAgingSheetResponse>(endpoint, {
        params: scanIdParam ? { scan_id: scanIdParam } : {},
      });
      setSheet(res.data ?? null);
    } catch (err: unknown) {
      setSheet(null);
      const msg =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          ? String((err as { response: { data: { detail: string } } }).response.data.detail)
          : 'Could not load due sheet.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [endpoint, scanIdParam]);

  const readOnly = Boolean(sheet && sheet.is_latest_scan === false);
  const canManualAddRow = Boolean(!paidOnly && !readOnly && sheet?.scan && sheet.is_latest_scan);

  const scanQuerySuffix = scanIdParam ? `?scan=${encodeURIComponent(scanIdParam)}` : '';

  useEffect(() => {
    void loadScans();
  }, [loadScans]);

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

  const visibleBuckets = useMemo(
    () => (zoneFilter === 'all' ? bucketOrder : bucketOrder.filter((z) => z === zoneFilter)),
    [zoneFilter, bucketOrder],
  );

  const onUpload = async (file: File | null) => {
    if (!file || readOnly) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiClient.post<DueAgingSheetResponse>('/due/aging/upload', fd);
      setSheet(res.data ?? null);
      setSearchParams({});
      void loadScans();
    } catch (err: unknown) {
      const msg =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          ? String((err as { response: { data: { detail: string } } }).response.data.detail)
          : 'Upload failed.';
      setError(msg);
    } finally {
      setUploading(false);
    }
  };

  const persistBucketOrder = async (next: BucketKey[]) => {
    if (readOnly) return;
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
    if (readOnly) return;
    if (!zonePick) {
      setZonePick({ rowId, zone });
      return;
    }
    if (zonePick.rowId === rowId && zonePick.zone === zone) {
      setZonePick(null);
      return;
    }
    if (zone !== zonePick.zone) {
      setError('Zone swap: choose another row in the same column.');
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
    if (readOnly) return;
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
    if (readOnly) return;
    if (!dragRowId || dragRowId === targetId) {
      setDragRowId(null);
      return;
    }
    try {
      await apiClient.post('/due/aging/swap-rows-order', { row_id_a: dragRowId, row_id_b: targetId });
      await load();
    } catch {
      setError('Reorder only works within the same location block.');
    }
    setDragRowId(null);
  };

  const payRow = async (row: DueAgingRow) => {
    if (readOnly) return;
    if (row.total <= 0.000001) return;

    const raw = window.prompt(
      `Pay amount for ${row.particulars}\n(blank = full ${fmt(row.total)}; deduction happens from right-most zone first)`,
      '',
    );
    if (raw === null) return;

    let amountToPay: number;
    if (!raw.trim()) {
      amountToPay = row.total;
    } else {
      const n = parseMoneyInput(raw);
      if (n === null || n <= 0) {
        setError('Invalid amount.');
        return;
      }
      amountToPay = n;
    }

    if (amountToPay - row.total > 0.000001) {
      setError('Amount exceeds outstanding total.');
      return;
    }

    const note = (window.prompt('Optional note for history', 'Paid') ?? '').trim();
    setPayingId(row.id);
    setError(null);
    try {
      await apiClient.post(`/due/aging/rows/${row.id}/pay`, {
        amount: amountToPay,
        ...(note ? { note } : {}),
      });
      await load();
      if (historyForRow === row.id) await toggleHistory(row.id, true);
    } catch {
      setError('Could not apply payment.');
    } finally {
      setPayingId(null);
    }
  };

  const markUnpaid = async (id: string) => {
    if (readOnly) return;
    try {
      await apiClient.post(`/due/aging/rows/${id}/mark-unpaid`);
      await load();
    } catch {
      setError('Could not restore to open register.');
    }
  };

  const submitAddRow = async () => {
    const p = addParticulars.trim();
    if (!p) {
      setError('Enter a customer name.');
      return;
    }
    setAddRowBusy(true);
    setError(null);
    try {
      await apiClient.post('/due/aging/rows', {
        particulars: p,
        location_group: addLoc,
        location_label: addLocLabel.trim() || null,
        safe: 0,
        warning: 0,
        danger: 0,
        doubtful: 0,
      });
      setAddRowOpen(false);
      setAddParticulars('');
      setAddLoc('OTHER');
      setAddLocLabel('');
      await load();
      void loadScans();
    } catch (err: unknown) {
      const msg =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          ? String((err as { response: { data: { detail: string } } }).response.data.detail)
          : 'Could not add row.';
      setError(msg);
    } finally {
      setAddRowBusy(false);
    }
  };

  const resetOpenSheet = async () => {
    if (readOnly) return;
    if (!window.confirm('Clear all open rows? Paid rows are not removed.')) return;
    setResetting(true);
    setError(null);
    try {
      await apiClient.delete('/due/aging/clear-open');
      await load();
      void loadScans();
    } catch {
      setError('Could not reset open sheet.');
    } finally {
      setResetting(false);
    }
  };

  const runAdjust = async (row: DueAgingRow, zone: BucketKey, sign: 1 | -1) => {
    if (readOnly) return;
    const label = sign > 0 ? 'Add amount' : 'Subtract amount';
    const raw = window.prompt(`${label} in ${BUCKET_LABELS[zone]} for ${row.particulars}`, '');
    if (!raw) return;
    const amount = parseMoneyInput(raw);
    if (amount === null || amount <= 0) return;
    const note = window.prompt('Optional note for history', '') ?? '';
    try {
      await apiClient.post(`/due/aging/rows/${row.id}/adjust-zone`, {
        zone,
        delta: sign * amount,
        note,
      });
      await load();
      if (historyForRow === row.id) await toggleHistory(row.id, true);
    } catch (err: unknown) {
      const msg =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          ? String((err as { response: { data: { detail: string } } }).response.data.detail)
          : 'Could not adjust zone.';
      setError(msg);
    }
  };

  const toggleHistory = async (rowId: string, forceOpen = false) => {
    if (!forceOpen && historyForRow === rowId) {
      setHistoryForRow(null);
      return;
    }
    try {
      const res = await apiClient.get<DueAgingHistoryItem[]>(`/due/aging/rows/${rowId}/history`);
      setHistoryMap((prev) => ({ ...prev, [rowId]: res.data ?? [] }));
      setHistoryForRow(rowId);
    } catch {
      setError('Could not load history.');
    }
  };

  const undoHistoryItem = async (rowId: string, historyId: string) => {
    if (readOnly) return;
    try {
      await apiClient.post(`/due/aging/adjustments/${historyId}/undo`);
      await load();
      await toggleHistory(rowId, true);
    } catch (err: unknown) {
      const msg =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          ? String((err as { response: { data: { detail: string } } }).response.data.detail)
          : 'Could not undo this history item.';
      setError(msg);
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
    const picked = zonePick?.rowId === r.id && zonePick?.zone === zone ? 'ring-2 ring-indigo-400 ring-inset' : '';
    return (
      <td
        key={zone}
        className={`px-2 py-1.5 border border-slate-200 text-right align-top ${picked} ${ZONE_CELL_CLASSES[zone]}`}
        onClick={() => void onZoneCellClick(r.id, zone)}
      >
        <input
          defaultValue={val === 0 ? '' : fmt(val)}
          key={`${r.id}-${zone}-${val}`}
          onClick={(e) => e.stopPropagation()}
          readOnly={readOnly}
          disabled={readOnly}
          onBlur={(e) => {
            const n = parseMoneyInput(e.target.value);
            if (n === null) return;
            if (Math.abs(n - val) < 0.005) return;
            void patchRow(r.id, { [zone]: n }).then(() => load());
          }}
          inputMode="decimal"
          className="w-full min-w-[4.6rem] max-w-[7rem] ml-auto rounded border border-transparent bg-transparent px-1 py-0.5 text-right tabular-nums text-[11px] hover:border-slate-300 focus:border-indigo-400 focus:outline-none disabled:opacity-80 disabled:cursor-default"
        />
        {!paidOnly && !readOnly && (
          <div className="mt-1 flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => void runAdjust(r, zone, -1)}
              className="rounded border border-slate-300 bg-white px-1 text-[10px] text-slate-700 hover:bg-slate-50"
              title="Subtract and log history"
            >
              -
            </button>
            <button
              type="button"
              onClick={() => void runAdjust(r, zone, 1)}
              className="rounded border border-slate-300 bg-white px-1 text-[10px] text-slate-700 hover:bg-slate-50"
              title="Add and log history"
            >
              +
            </button>
          </div>
        )}
      </td>
    );
  };

  return (
    <div className="space-y-4 min-w-0 max-w-full pb-20 md:pb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between min-w-0">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900">{paidOnly ? 'Due — paid sheet' : 'Due — open sheet'}</h2>
          <p className="text-sm text-gray-500">
            {paidOnly
              ? 'Paid rows. You can send a row back to open.'
              : 'Customer-wise due sheet with zone colors, add/subtract with history, drag row swap, and zone filter. Use row-level Paid to deduct from the right-most zones first.'}
          </p>
          {zonePick && (
            <p className="text-xs text-indigo-700 font-medium mt-1">Select another cell in the same zone to swap amounts.</p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full sm:w-auto shrink-0">
          {!paidOnly && (
            <label
              className={`w-full sm:w-auto inline-flex items-center justify-center rounded-md px-3 py-2.5 sm:py-2 text-sm font-semibold text-white ${
                readOnly ? 'bg-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 cursor-pointer'
              }`}
            >
              <input
                type="file"
                accept=".xlsx,.xlsm"
                className="hidden"
                disabled={uploading || readOnly}
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
              onClick={() => void navigate(`/due/paid-credit-notes${scanQuerySuffix}`)}
              className="w-full sm:w-auto rounded-md bg-emerald-700 px-3 py-2.5 sm:py-2 text-sm font-semibold text-white hover:bg-emerald-600"
            >
              Paid sheet
            </button>
          )}
          {!paidOnly && (
            <button
              type="button"
              disabled={resetting || readOnly}
              onClick={() => void resetOpenSheet()}
              className="w-full sm:w-auto rounded-md border border-red-300 bg-white px-3 py-2.5 sm:py-2 text-sm font-medium text-red-800 hover:bg-red-50 disabled:opacity-60"
            >
              {resetting ? 'Resetting…' : 'Reset open sheet'}
            </button>
          )}
          {paidOnly && (
            <button
              type="button"
              onClick={() => void navigate(`/due/credit-notes${scanQuerySuffix}`)}
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
            Reports
          </button>
          {!paidOnly && (
            <button
              type="button"
              onClick={() => void navigate('/due/settings')}
              className="w-full sm:w-auto rounded-md border border-slate-300 bg-white px-3 py-2.5 sm:py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Settings
            </button>
          )}
          {!paidOnly && (
            <button
              type="button"
              disabled={!canManualAddRow || addRowBusy}
              onClick={() => {
                setAddRowOpen(true);
                setError(null);
              }}
              className="w-full sm:w-auto rounded-md border border-slate-700 bg-white px-3 py-2.5 sm:py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              title={!canManualAddRow ? 'Upload a workbook first (latest scan only)' : 'Add a manual line to the open register'}
            >
              Add row
            </button>
          )}
        </div>
      </div>

      {scans.length > 0 && (
        <Card
          title="Report scans (timeline)"
          subtitle="Each Excel upload adds Scan 1, Scan 2, … as a new snapshot. Older scans are not changed."
          className="text-sm"
        >
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[11px] text-slate-500 w-full sm:w-auto sm:mr-1">View:</span>
            <button
              type="button"
              onClick={() => setSearchParams({})}
              className={`rounded-full px-3 py-1 text-xs font-semibold border ${
                !scanIdParam
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              Latest (working)
            </button>
            {scans.map((s) => {
              const active = scanIdParam === s.id;
              const label = `Scan ${s.scan_number}`;
              const uploaded = new Date(s.uploaded_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSearchParams({ scan: s.id })}
                  title={s.source_filename || undefined}
                  className={`rounded-full px-3 py-1 text-xs font-semibold border max-w-full truncate ${
                    active
                      ? 'border-amber-600 bg-amber-50 text-amber-900'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {label}
                  <span className="font-normal text-slate-500">
                    {' '}
                    · {s.open_lines} open / {s.paid_lines} paid
                  </span>
                  {uploaded ? <span className="hidden sm:inline font-normal text-slate-400"> · {uploaded}</span> : null}
                </button>
              );
            })}
          </div>
          {readOnly ? (
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-3">
              You are viewing a past snapshot (read-only). Upload, reset, edits, Paid, and zone tools apply only to the{' '}
              <strong>latest</strong> report.
            </p>
          ) : null}
        </Card>
      )}

      <Card title="Zone visibility" className="text-sm">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setZoneFilter('all')}
            className={`rounded-full px-3 py-1 text-xs font-semibold border ${
              zoneFilter === 'all' ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700'
            }`}
          >
            All
          </button>
          {(['safe', 'warning', 'danger', 'doubtful'] as BucketKey[]).map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZoneFilter(z)}
              className={`rounded-full px-3 py-1 text-xs font-semibold border ${
                zoneFilter === z ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              {BUCKET_LABELS[z]}
            </button>
          ))}
        </div>
      </Card>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      {sheet?.meta.company_title && (
        <div className="text-center space-y-1 px-2">
          <div className="text-sm sm:text-base font-bold text-gray-900 tracking-tight">{sheet.meta.company_title}</div>
          {sheet.meta.date_range_label ? <div className="text-xs text-gray-600">{sheet.meta.date_range_label}</div> : null}
          {sheet.scan ? (
            <div className="text-[11px] font-semibold text-indigo-800">
              Report scan #{sheet.scan.scan_number}
              {sheet.is_latest_scan ? ' (latest)' : ' (snapshot)'}
            </div>
          ) : null}
        </div>
      )}

      {sheet && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {(['safe', 'warning', 'danger', 'doubtful', 'total'] as const).map((k) => (
            <Card key={k} title={k === 'total' ? 'Total outstanding' : BUCKET_LABELS[k as BucketKey]} className="text-sm">
              <div className="text-lg font-semibold tabular-nums text-gray-900">
                {fmt(sheet.grand_totals[k === 'total' ? 'total' : k])}
              </div>
            </Card>
          ))}
          <Card title="Customers" className="text-sm">
            <div className="text-lg font-semibold text-gray-900">{sheet.grand_totals.row_count}</div>
          </Card>
        </div>
      )}

      <Card title={paidOnly ? 'Paid register' : 'Aging register'} className="text-sm">
        {loading && !sheet ? (
          <p className="text-gray-500 py-4">Loading…</p>
        ) : !sheet?.locations.length ? (
          <p className="text-gray-500 py-4">{paidOnly ? 'No paid rows yet.' : 'No open rows. Upload an .xlsx workbook.'}</p>
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
                  <table className="min-w-[720px] w-full text-xs border-collapse select-none">
                    <thead>
                      <tr className="bg-slate-800 text-white">
                        <th className="px-2 py-2 border border-slate-600 w-14 text-center text-[10px] font-semibold">⋮</th>
                        {!paidOnly && <th className="px-2 py-2 border border-slate-600 w-16 text-center text-[10px] font-semibold">Paid</th>}
                        {paidOnly && <th className="px-2 py-2 border border-slate-600 w-16 text-center text-[10px] font-semibold">Unpaid</th>}
                        <th className="px-2 py-2 border border-slate-600 text-left text-[10px] font-semibold min-w-[140px]">Customer</th>
                        <th className="px-2 py-2 border border-slate-600 text-center text-[10px] font-semibold w-14">History</th>
                        <th colSpan={visibleBuckets.length} className="px-2 py-1 border border-slate-600 text-center text-[10px] font-bold tracking-wide">
                          Zone
                        </th>
                        <th className="px-2 py-2 border border-slate-600 text-right text-[10px] font-semibold">Total</th>
                      </tr>
                      <tr className="bg-slate-700 text-white">
                        <th className="border border-slate-600" />
                        {!paidOnly && <th className="border border-slate-600" />}
                        {paidOnly && <th className="border border-slate-600" />}
                        <th className="border border-slate-600" />
                        <th className="border border-slate-600" />
                        {visibleBuckets.map((bk) => (
                          <th
                            key={bk}
                            draggable={!readOnly && zoneFilter === 'all'}
                            onDragStart={() => !readOnly && zoneFilter === 'all' && setDragBucket(bk)}
                            onDragOver={(e) => !readOnly && zoneFilter === 'all' && e.preventDefault()}
                            onDrop={() => !readOnly && zoneFilter === 'all' && onDropBucket(bk)}
                            className={`px-2 py-2 border text-right text-[10px] font-semibold whitespace-nowrap ${ZONE_HEADER_CLASSES[bk]}`}
                            title={!readOnly && zoneFilter === 'all' ? 'Drag to reorder zone columns' : undefined}
                          >
                            {BUCKET_LABELS[bk].toUpperCase()}
                          </th>
                        ))}
                        <th className="border border-slate-600" />
                      </tr>
                    </thead>
                    <tbody>
                      {block.rows.map((r) => (
                        <Fragment key={r.id}>
                          <tr
                            key={r.id}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => void onDropRow(r.id)}
                            className={`hover:bg-slate-50 ${dragRowId === r.id ? 'opacity-70' : ''} ${rowDataPick === r.id ? 'bg-amber-50' : ''}`}
                          >
                            <td
                              className="px-1 py-2 border border-slate-200 text-center align-middle text-slate-400"
                              draggable={!readOnly}
                              onDragStart={() => !readOnly && setDragRowId(r.id)}
                              onDragEnd={() => setDragRowId(null)}
                            >
                              <div className="flex flex-col items-center gap-0.5">
                                <span className={readOnly ? 'cursor-default opacity-50' : 'cursor-grab'}>⠿</span>
                                <button
                                  type="button"
                                  disabled={readOnly}
                                  onClick={() => void onRowDataSwapClick(r.id)}
                                  className={`rounded border px-1 py-0 text-[10px] font-semibold leading-tight ${
                                    rowDataPick === r.id
                                      ? 'border-amber-500 bg-amber-100 text-amber-900'
                                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                                  }`}
                                  title="Swap all zone amounts and customer name with another row"
                                >
                                  ⇄
                                </button>
                              </div>
                            </td>
                            {!paidOnly && (
                              <td className="px-2 py-2 border border-slate-200 text-center align-middle">
                                <button
                                  type="button"
                                  disabled={payingId === r.id || readOnly}
                                  onClick={() => void payRow(r)}
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
                                  disabled={readOnly}
                                  onClick={() => void markUnpaid(r.id)}
                                  className="rounded-full border border-slate-400 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap disabled:opacity-50"
                                >
                                  Unpaid
                                </button>
                              </td>
                            )}
                            <td className="px-2 py-1.5 border border-slate-200 align-middle min-w-[120px]">
                              <input
                                defaultValue={r.particulars}
                                key={`${r.id}-p-${r.particulars}`}
                                readOnly={readOnly}
                                disabled={readOnly}
                                onBlur={(e) => {
                                  const v = e.target.value.trim();
                                  if (v === r.particulars) return;
                                  void patchRow(r.id, { particulars: v }).then(() => load());
                                }}
                                className="w-full min-w-[8rem] rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] hover:border-slate-200 focus:border-indigo-400 focus:outline-none disabled:opacity-80"
                              />
                            </td>
                            <td className="px-2 py-1.5 border border-slate-200 text-center">
                              <button
                                type="button"
                                onClick={() => void toggleHistory(r.id)}
                                className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                {historyForRow === r.id ? 'Hide' : 'Show'}
                              </button>
                            </td>
                            {visibleBuckets.map((bk) => renderAmountCell(r, bk))}
                            <td className="px-2 py-1.5 border border-slate-200 text-right tabular-nums font-medium text-[11px]">{fmt(r.total)}</td>
                          </tr>
                          {historyForRow === r.id && (
                            <tr>
                              <td colSpan={5 + visibleBuckets.length + 1} className="border border-slate-200 bg-slate-50 px-3 py-2">
                                {(historyMap[r.id] ?? []).length === 0 ? (
                                  <div className="text-[11px] text-slate-500">No history yet.</div>
                                ) : (
                                  <div className="space-y-1.5">
                                    {(historyMap[r.id] ?? []).slice(0, 20).map((h) => (
                                      <div key={h.id} className="text-[11px] text-slate-700 flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                          <span className="font-semibold capitalize">{h.zone}</span>{' '}
                                          <span className="uppercase text-[10px]">{h.action}</span>{' '}
                                          <span className={`${h.delta >= 0 ? 'text-emerald-700' : 'text-red-700'} font-semibold`}>
                                            {h.delta >= 0 ? '+' : ''}{fmt(h.delta)}
                                          </span>{' '}
                                          ({fmt(h.value_before)} → {fmt(h.value_after)}){' '}
                                          <span className="text-slate-500">{new Date(h.created_at).toLocaleString('en-GB')}</span>
                                          {h.note ? <span className="text-slate-600"> — {h.note}</span> : null}
                                        </div>
                                        {h.action !== 'undo' && !paidOnly && !readOnly && (
                                          <button
                                            type="button"
                                            onClick={() => void undoHistoryItem(r.id, h.id)}
                                            className="shrink-0 rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                                          >
                                            Undo
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 font-semibold text-gray-900">
                        <td colSpan={5} className="px-2 py-2 border border-slate-200 text-right text-[11px]">Block total</td>
                        {visibleBuckets.map((bk) => (
                          <td key={bk} className="px-2 py-2 border border-slate-200 text-right tabular-nums text-[11px]">{fmt(bt[bk])}</td>
                        ))}
                        <td className="px-2 py-2 border border-slate-200 text-right tabular-nums text-[11px]">{fmt(bt.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </Card>

      {addRowOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div
            className="w-full sm:max-w-md rounded-t-xl sm:rounded-xl bg-white shadow-lg border border-slate-200 p-4 space-y-3"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-row-title"
          >
            <h3 id="add-row-title" className="text-sm font-semibold text-gray-900">
              Add row manually
            </h3>
            <p className="text-xs text-gray-500">Adds an open line to the latest report scan. Zone amounts can be edited in the grid.</p>
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-1">Customer</label>
              <input
                value={addParticulars}
                onChange={(e) => setAddParticulars(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                placeholder="Customer name"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-1">Location block</label>
              <select
                value={addLoc}
                onChange={(e) => setAddLoc(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white"
              >
                {MANUAL_LOC_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-1">Location label (optional)</label>
              <input
                value={addLocLabel}
                onChange={(e) => setAddLocLabel(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                placeholder="Override display label for this block"
              />
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-2">
              <button
                type="button"
                disabled={addRowBusy}
                onClick={() => setAddRowOpen(false)}
                className="w-full sm:w-auto rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={addRowBusy}
                onClick={() => void submitAddRow()}
                className="w-full sm:w-auto rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {addRowBusy ? 'Adding…' : 'Add row'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

