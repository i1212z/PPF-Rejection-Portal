import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { apiClient } from '../api/client';
import { Card } from '../components/ui/Card';

const B2C_LOCATION_OPTIONS = ['Calicut', 'Kochi', 'Thrissur', 'Coimbatore', 'Bangalore'] as const;
const MONTHS = [
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
  'January',
  'February',
  'March',
] as const;

type MonthName = (typeof MONTHS)[number];
type Subsection = 'daily' | 'overview';

interface B2CDailyEntry {
  id: string;
  delivery_date: string;
  location: string;
  no_of_order: number;
  total_sale_value: number;
  created_at: string;
}

interface B2CWorkbookSheet {
  name: string;
  rows: string[][];
  row_count: number;
  column_count: number;
}

interface B2CWorkbookScanBrief {
  id: string;
  source_filename: string;
  file_size: number;
  sheet_count: number;
  created_by: string;
  created_at: string;
}

interface B2CWorkbookScanDetail {
  scan: B2CWorkbookScanBrief;
  sheets: B2CWorkbookSheet[];
}

interface MonthlyPoint {
  sheet: string;
  location: string;
  month: MonthName;
  orders: number;
  amount: number;
  avgBillValue: number;
}

function fileSizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeCell(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseNum(raw: string | undefined): number | null {
  const text = (raw ?? '').replace(/,/g, '').replace(/[^\d.-]/g, '').trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function isLikelyTotalLabel(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === 'total' || v === 'grand total' || v === 'totals';
}

function extractMonthlyPoints(sheet: B2CWorkbookSheet): MonthlyPoint[] {
  const rows = sheet.rows ?? [];
  if (rows.length === 0) return [];

  let monthHeaderIdx = -1;
  for (let r = 0; r < Math.min(rows.length, 30); r += 1) {
    const cells = rows[r] ?? [];
    const seen = new Set<MonthName>();
    for (const cell of cells) {
      const n = normalizeCell(cell);
      for (const m of MONTHS) {
        if (n.includes(m.toLowerCase())) seen.add(m);
      }
    }
    if (seen.size >= 4) {
      monthHeaderIdx = r;
      break;
    }
  }
  if (monthHeaderIdx < 0) return [];

  const monthHeader = rows[monthHeaderIdx] ?? [];
  const subHeader = rows[monthHeaderIdx + 1] ?? [];
  const monthPositions: Array<{ month: MonthName; col: number }> = [];
  MONTHS.forEach((m) => {
    const idx = monthHeader.findIndex((c) => normalizeCell(c).includes(m.toLowerCase()));
    if (idx >= 0) monthPositions.push({ month: m, col: idx });
  });
  monthPositions.sort((a, b) => a.col - b.col);
  if (monthPositions.length === 0) return [];

  const findByKeyword = (cells: string[], keyword: string): number =>
    cells.findIndex((c) => normalizeCell(c).includes(keyword));

  let locationCol = findByKeyword(subHeader, 'location');
  if (locationCol < 0) locationCol = findByKeyword(monthHeader, 'location');
  if (locationCol < 0) locationCol = 0;

  let avgBillCol = findByKeyword(subHeader, 'avgbill');
  if (avgBillCol < 0) avgBillCol = findByKeyword(monthHeader, 'avgbill');
  if (avgBillCol < 0 && rows[monthHeaderIdx + 2]) {
    avgBillCol = findByKeyword(rows[monthHeaderIdx + 2], 'avgbill');
  }

  const points: MonthlyPoint[] = [];
  const dataStart = monthHeaderIdx + 2;
  for (let r = dataStart; r < rows.length; r += 1) {
    const row = rows[r] ?? [];
    const location = (row[locationCol] ?? row[0] ?? '').trim();
    if (!location || isLikelyTotalLabel(location)) continue;

    monthPositions.forEach((entry, idx) => {
      const endCol = idx < monthPositions.length - 1 ? monthPositions[idx + 1].col - 1 : row.length - 1;
      let orderCol = -1;
      let amountCol = -1;
      for (let c = entry.col; c <= endCol; c += 1) {
        const sh = normalizeCell(subHeader[c] ?? '');
        if (orderCol < 0 && sh.includes('order')) orderCol = c;
        if (amountCol < 0 && sh.includes('amount')) amountCol = c;
      }
      if (orderCol < 0 && entry.col + 1 <= endCol) orderCol = entry.col + 1;
      if (amountCol < 0 && entry.col + 2 <= endCol) amountCol = entry.col + 2;

      const orders = orderCol >= 0 ? parseNum(row[orderCol]) : null;
      const amount = amountCol >= 0 ? parseNum(row[amountCol]) : null;
      if (orders === null && amount === null) return;

      const avgRaw = avgBillCol >= 0 ? parseNum(row[avgBillCol]) : null;
      const avg = avgRaw ?? (orders && orders > 0 && amount !== null ? amount / orders : 0);
      points.push({
        sheet: sheet.name,
        location,
        month: entry.month,
        orders: Number(orders ?? 0),
        amount: Number(amount ?? 0),
        avgBillValue: Number(avg ?? 0),
      });
    });
  }
  return points;
}

function B2COverviewScannerSection() {
  const [scans, setScans] = useState<B2CWorkbookScanBrief[]>([]);
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [scanDetail, setScanDetail] = useState<B2CWorkbookScanDetail | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyticsView, setAnalyticsView] = useState<'location' | 'month' | 'dataset'>('location');

  const loadScans = useCallback(async () => {
    try {
      const res = await apiClient.get<B2CWorkbookScanBrief[]>('/b2c-sales/scans');
      const list = res.data ?? [];
      setScans(list);
      setActiveScanId((prev) => prev ?? list[0]?.id ?? null);
    } catch {
      setScans([]);
    }
  }, []);

  const loadScan = useCallback(async (scanId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<B2CWorkbookScanDetail>(`/b2c-sales/scans/${scanId}`);
      setScanDetail(res.data ?? null);
      setActiveSheetIndex(0);
    } catch {
      setScanDetail(null);
      setError('Could not load scan details.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadScans();
  }, [loadScans]);

  useEffect(() => {
    if (activeScanId) {
      void loadScan(activeScanId);
    } else {
      setScanDetail(null);
      setActiveSheetIndex(0);
    }
  }, [activeScanId, loadScan]);

  const onUpload = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiClient.post<B2CWorkbookScanDetail>('/b2c-sales/scans/upload', fd);
      const detail = res.data;
      setScanDetail(detail);
      setActiveScanId(detail.scan.id);
      setActiveSheetIndex(0);
      await loadScans();
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

  const onDeleteActive = async () => {
    if (!activeScanId) return;
    if (!window.confirm('Delete selected scan?')) return;
    setDeleting(true);
    setError(null);
    try {
      await apiClient.delete(`/b2c-sales/scans/${activeScanId}`);
      const next = scans.filter((s) => s.id !== activeScanId);
      setScans(next);
      const nextId = next[0]?.id ?? null;
      setActiveScanId(nextId);
      if (!nextId) setScanDetail(null);
    } catch {
      setError('Could not delete scan.');
    } finally {
      setDeleting(false);
    }
  };

  const onDownload = async (scanId: string, fileName: string) => {
    try {
      const res = await apiClient.get(`/b2c-sales/scans/${scanId}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'b2c-scan.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('Could not download file.');
    }
  };

  const activeSheet = useMemo(() => {
    if (!scanDetail) return null;
    return scanDetail.sheets[activeSheetIndex] ?? null;
  }, [scanDetail, activeSheetIndex]);

  const monthlyPoints = useMemo(
    () => (scanDetail?.sheets ?? []).flatMap((sheet) => extractMonthlyPoints(sheet)),
    [scanDetail],
  );

  const locationSummary = useMemo(() => {
    const map = new Map<string, { orders: number; amount: number }>();
    monthlyPoints.forEach((p) => {
      const prev = map.get(p.location) ?? { orders: 0, amount: 0 };
      prev.orders += p.orders;
      prev.amount += p.amount;
      map.set(p.location, prev);
    });
    return Array.from(map.entries())
      .map(([location, v]) => ({
        location,
        orders: v.orders,
        amount: v.amount,
        avgBillValue: v.orders > 0 ? v.amount / v.orders : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [monthlyPoints]);

  const monthSummary = useMemo(() => {
    const base = MONTHS.map((m) => ({ month: m, orders: 0, amount: 0 }));
    const index = new Map<MonthName, number>();
    MONTHS.forEach((m, i) => index.set(m, i));
    monthlyPoints.forEach((p) => {
      const idx = index.get(p.month);
      if (idx == null) return;
      base[idx].orders += p.orders;
      base[idx].amount += p.amount;
    });
    return base.map((r) => ({
      ...r,
      avgBillValue: r.orders > 0 ? r.amount / r.orders : 0,
    }));
  }, [monthlyPoints]);

  const exportPowerBIWorkbook = () => {
    if (!monthlyPoints.length) return;
    const wb = XLSX.utils.book_new();

    const datasetRows = [
      ['Sheet', 'Location', 'Month', 'Orders', 'Amount', 'Avg Bill Value'],
      ...monthlyPoints.map((p) => [p.sheet, p.location, p.month, p.orders, p.amount, p.avgBillValue]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(datasetRows), 'dataset');

    const locRows = [
      ['Location', 'Orders', 'Amount', 'Avg Bill Value'],
      ...locationSummary.map((r) => [r.location, r.orders, r.amount, r.avgBillValue]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(locRows), 'location_summary');

    const monthRows = [
      ['Month', 'Orders', 'Amount', 'Avg Bill Value'],
      ...monthSummary.map((r) => [r.month, r.orders, r.amount, r.avgBillValue]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(monthRows), 'month_summary');

    XLSX.writeFile(wb, `b2c-powerbi-analytics-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <Card title="Overview" subtitle="Excel scanner + cross-sheet analytics (April to March)">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:items-end gap-2">
            <label className="text-xs text-gray-700">
              Upload Excel (.xlsx, .xls)
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  void onUpload(f);
                  e.currentTarget.value = '';
                }}
                className="mt-1 block text-xs"
              />
            </label>
            <div className="text-[11px] text-gray-500">{uploading ? 'Scanning workbook...' : 'Scans all sheets in the workbook.'}</div>
          </div>
          <button
            type="button"
            disabled={!activeScanId || deleting}
            onClick={() => void onDeleteActive()}
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
          >
            {deleting ? 'Deleting...' : 'Delete selected scan'}
          </button>
        </div>
        {error && (
          <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>
        )}
      </Card>

      <Card title="Scan history" subtitle="Saved files with open / download actions">
        {scans.length === 0 ? (
          <div className="text-sm text-gray-500">No scans yet.</div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">File</th>
                  <th className="px-3 py-2 text-left">Sheets</th>
                  <th className="px-3 py-2 text-left">Size</th>
                  <th className="px-3 py-2 text-left">Scanned at</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {scans.map((s) => (
                  <tr key={s.id} className={activeScanId === s.id ? 'bg-indigo-50/40' : ''}>
                    <td className="px-3 py-2">{s.source_filename}</td>
                    <td className="px-3 py-2">{s.sheet_count}</td>
                    <td className="px-3 py-2">{fileSizeLabel(Number(s.file_size || 0))}</td>
                    <td className="px-3 py-2 text-gray-500">{new Date(s.created_at).toLocaleString('en-GB')}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          onClick={() => setActiveScanId(s.id)}
                          className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDownload(s.id, s.source_filename)}
                          className="rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                        >
                          Download
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Workbook output" subtitle="Spreadsheet-like tabs for each sheet">
        {loading ? (
          <div className="text-sm text-gray-500">Loading scan...</div>
        ) : !scanDetail || scanDetail.sheets.length === 0 ? (
          <div className="text-sm text-gray-500">Upload and open a scan to view sheet tabs.</div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {scanDetail.sheets.map((sheet, idx) => (
                <button
                  key={`${sheet.name}-${idx}`}
                  type="button"
                  onClick={() => setActiveSheetIndex(idx)}
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold border ${
                    idx === activeSheetIndex
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {sheet.name}
                </button>
              ))}
            </div>
            {activeSheet && (
              <div className="space-y-2">
                <div className="text-[11px] text-gray-500">
                  Rows: {activeSheet.row_count} · Columns: {activeSheet.column_count}
                </div>
                <div className="w-full overflow-x-auto border border-gray-200 rounded-md">
                  <table className="min-w-full text-xs">
                    <tbody className="divide-y divide-gray-100">
                      {activeSheet.rows.map((row, rIdx) => (
                        <tr key={rIdx}>
                          {row.map((cell, cIdx) => (
                            <td key={`${rIdx}-${cIdx}`} className="px-2 py-1.5 border-r border-gray-100 whitespace-pre-wrap">
                              {cell || <span className="text-gray-300"> </span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card title="Power BI analytics options" subtitle="Monthly/location analytics extracted from related sheets">
        {!monthlyPoints.length ? (
          <div className="text-sm text-gray-500">
            No monthly matrix detected yet. Expected columns like April..March with Orders/Amount (and optional Avg bill Value).
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-gray-600">Analytics view</label>
              <select
                value={analyticsView}
                onChange={(e) => setAnalyticsView(e.target.value as 'location' | 'month' | 'dataset')}
                className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs"
              >
                <option value="location">By location</option>
                <option value="month">By month</option>
                <option value="dataset">Normalized dataset</option>
              </select>
              <button
                type="button"
                onClick={exportPowerBIWorkbook}
                className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                Download Power BI workbook
              </button>
            </div>

            {analyticsView === 'location' && (
              <div className="w-full overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Location</th>
                      <th className="px-3 py-2 text-right">Orders</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-right">Avg bill value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {locationSummary.map((r) => (
                      <tr key={r.location}>
                        <td className="px-3 py-2">{r.location}</td>
                        <td className="px-3 py-2 text-right">{r.orders.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right">{r.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        <td className="px-3 py-2 text-right">{r.avgBillValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {analyticsView === 'month' && (
              <div className="w-full overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Month</th>
                      <th className="px-3 py-2 text-right">Orders</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-right">Avg bill value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {monthSummary.map((r) => (
                      <tr key={r.month}>
                        <td className="px-3 py-2">{r.month}</td>
                        <td className="px-3 py-2 text-right">{r.orders.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right">{r.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        <td className="px-3 py-2 text-right">{r.avgBillValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {analyticsView === 'dataset' && (
              <div className="w-full overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Sheet</th>
                      <th className="px-3 py-2 text-left">Location</th>
                      <th className="px-3 py-2 text-left">Month</th>
                      <th className="px-3 py-2 text-right">Orders</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-right">Avg bill value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {monthlyPoints.map((r, idx) => (
                      <tr key={`${r.sheet}-${r.location}-${r.month}-${idx}`}>
                        <td className="px-3 py-2">{r.sheet}</td>
                        <td className="px-3 py-2">{r.location}</td>
                        <td className="px-3 py-2">{r.month}</td>
                        <td className="px-3 py-2 text-right">{r.orders.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right">{r.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        <td className="px-3 py-2 text-right">{r.avgBillValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

export default function B2CSalesEntryPage({ startSection = 'daily' }: { startSection?: Subsection }) {
  const navigate = useNavigate();
  const [subsection, setSubsection] = useState<Subsection>(startSection);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [location, setLocation] = useState('');
  const [noOfOrder, setNoOfOrder] = useState<number | ''>('');
  const [totalSaleValue, setTotalSaleValue] = useState<number | ''>('');
  const [entries, setEntries] = useState<B2CDailyEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSubsection(startSection);
  }, [startSection]);

  const loadEntries = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<B2CDailyEntry[]>('/b2c-sales');
      setEntries(res.data ?? []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    setDeletingId(id);
    try {
      await apiClient.delete(`/b2c-sales/${id}`);
      await loadEntries();
    } catch {
      setError('Could not delete entry. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    void loadEntries();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!deliveryDate || !location || noOfOrder === '' || totalSaleValue === '') {
      setError('Please fill all required fields.');
      return;
    }
    setSaving(true);
    try {
      await apiClient.post('/b2c-sales', {
        delivery_date: deliveryDate,
        location,
        no_of_order: Number(noOfOrder),
        total_sale_value: Number(totalSaleValue),
      });
      setLocation('');
      setNoOfOrder('');
      setTotalSaleValue('');
      await loadEntries();
    } catch {
      setError('Could not save entry. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const switchSection = (next: Subsection) => {
    setSubsection(next);
    navigate(next === 'overview' ? '/b2c-sales/overview' : '/b2c-sales');
  };

  return (
    <div className="space-y-4 min-w-0 max-w-full">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">B2C daily entry</h2>
        <p className="text-sm text-gray-500">Use Daily entry or Overview scanner section.</p>
      </div>

      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
        <button
          type="button"
          onClick={() => switchSection('daily')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
            subsection === 'daily' ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-50'
          }`}
        >
          Daily entry
        </button>
        <button
          type="button"
          onClick={() => switchSection('overview')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
            subsection === 'overview' ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-50'
          }`}
        >
          Overview
        </button>
      </div>

      {subsection === 'overview' ? (
        <B2COverviewScannerSection />
      ) : (
        <>
          <Card title="New entry" subtitle="Delivery date, location, order count, and sale value">
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Delivery date</label>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Location</label>
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white"
                  required
                >
                  <option value="">Select location</option>
                  {B2C_LOCATION_OPTIONS.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">No of order</label>
                <input
                  type="number"
                  min={0}
                  value={noOfOrder}
                  onChange={(e) => setNoOfOrder(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Total sale value</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={totalSaleValue}
                  onChange={(e) => setTotalSaleValue(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                  required
                />
              </div>
              <div className="md:col-span-4 flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save entry'}
                </button>
              </div>
            </form>
            {error && (
              <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>
            )}
          </Card>

          <Card title="Recent entries" subtitle="Latest 500 rows">
            {loading ? (
              <div className="text-sm text-gray-500">Loading entries...</div>
            ) : entries.length === 0 ? (
              <div className="text-sm text-gray-500">No entries yet.</div>
            ) : (
              <div className="w-full overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase">
                    <tr>
                      <th className="px-3 py-2 text-left">Delivery date</th>
                      <th className="px-3 py-2 text-left">Location</th>
                      <th className="px-3 py-2 text-right">No of order</th>
                      <th className="px-3 py-2 text-right">Total sale value</th>
                      <th className="px-3 py-2 text-left">Created</th>
                      <th className="px-3 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {entries.map((e) => (
                      <tr key={e.id}>
                        <td className="px-3 py-2">{new Date(e.delivery_date).toLocaleDateString('en-GB')}</td>
                        <td className="px-3 py-2">{e.location}</td>
                        <td className="px-3 py-2 text-right">{e.no_of_order}</td>
                        <td className="px-3 py-2 text-right">
                          {Number(e.total_sale_value).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-3 py-2 text-gray-500">{new Date(e.created_at).toLocaleString('en-GB')}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            disabled={deletingId === e.id}
                            onClick={() => void handleDelete(e.id)}
                            className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                          >
                            {deletingId === e.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
