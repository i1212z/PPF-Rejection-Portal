import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { apiClient } from '../api/client';
import B2CFusedOverviewAnalytics from '../components/b2c/B2CFusedOverviewAnalytics';
import { extractMonthlyPoints } from '../lib/b2cWorkbookParse';
import { Card } from '../components/ui/Card';

const B2C_LOCATION_OPTIONS = [
  'Calicut',
  'Kochi',
  'Thrissur',
  'Coimbatore',
  'Bangalore',
  'Ooty',
  'Aluva',
  'Kottayam',
  'Nilambur',
] as const;
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

function fileSizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSheetLabel(name: string): string {
  const raw = (name || '').trim();
  const m = raw.match(/^(\d{2}|\d{4})\s*[-_/]\s*(\d{2}|\d{4})$/);
  if (!m) return raw;
  const left = m[1].slice(-2);
  const right = m[2].slice(-2);
  return `FY ${left}-${right}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isBlankRow(row: string[]): boolean {
  return row.every((c) => {
    const normalized = String(c || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\t/g, ' ')
      .trim();
    return normalized === '';
  });
}

function compactSheetRows(rows: string[][]): string[][] {
  if (!rows.length) return [];
  return rows.filter((r) => !isBlankRow(r));
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
  const [showHistory, setShowHistory] = useState(false);

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

  const onDeleteScan = async (scanId: string) => {
    if (!scanId) return;
    if (!window.confirm('Delete selected scan?')) return;
    setDeleting(true);
    setError(null);
    try {
      await apiClient.delete(`/b2c-sales/scans/${scanId}`);
      const next = scans.filter((s) => s.id !== scanId);
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

  const onDeleteActive = async () => {
    if (!activeScanId) return;
    await onDeleteScan(activeScanId);
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

  const onDeleteSheet = async (sheetName: string) => {
    if (!scanDetail) return;
    if (!window.confirm(`Delete sheet "${formatSheetLabel(sheetName)}"?`)) return;
    setError(null);
    try {
      const res = await apiClient.delete<B2CWorkbookScanDetail>(
        `/b2c-sales/scans/${scanDetail.scan.id}/sheets/${encodeURIComponent(sheetName)}`,
      );
      setScanDetail(res.data ?? null);
      setActiveSheetIndex(0);
      await loadScans();
    } catch (err: unknown) {
      const msg =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          ? String((err as { response: { data: { detail: string } } }).response.data.detail)
          : 'Could not delete sheet.';
      setError(msg);
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

  const exportPowerBIWorkbook = () => {
    if (!monthlyPoints.length) return;
    const wb = XLSX.utils.book_new();
    const datasetRows = [
      ['Sheet', 'Location', 'Month', 'Orders', 'Amount', 'Avg Bill Value'],
      ...monthlyPoints.map((p) => [p.sheet, p.location, p.month, p.orders, p.amount, p.avgBillValue]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(datasetRows), 'dataset');
    XLSX.writeFile(wb, `b2c-workbook-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-cyan-50 p-3 sm:p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer">
            {uploading ? 'Scanning...' : 'Upload Excel (.xlsx, .xls)'}
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                void onUpload(f);
                e.currentTarget.value = '';
              }}
              className="hidden"
            />
          </label>
          <button
            type="button"
            disabled={!monthlyPoints.length}
            onClick={exportPowerBIWorkbook}
            className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
          >
            Export parsed data
          </button>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            {showHistory ? 'Hide scan history' : 'Scan history'}
          </button>
          <button
            type="button"
            disabled={!activeScanId || deleting}
            onClick={() => void onDeleteActive()}
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
          >
            {deleting ? 'Deleting...' : 'Delete selected scan'}
          </button>
        </div>
      </div>
      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>
      )}

      {showHistory && (
        <Card title="Scan history" subtitle="Saved uploads">
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
                          <button
                            type="button"
                            onClick={() => void onDeleteScan(s.id)}
                            className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100"
                          >
                            Delete
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
      )}

      <Card
        title="Workbook op"
        subtitle="Clean sheet preview (blank rows removed)"
        rightSlot={
          <button
            type="button"
            disabled={!activeScanId || deleting}
            onClick={() => void onDeleteActive()}
            className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
          >
            Delete scan
          </button>
        }
      >
        {loading ? (
          <div className="text-sm text-gray-500">Loading scan...</div>
        ) : !scanDetail || scanDetail.sheets.length === 0 ? (
          <div className="text-sm text-gray-500">Upload and open a scan to view sheet tabs.</div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {scanDetail.sheets.map((sheet, idx) => (
                <div
                  key={`${sheet.name}-${idx}`}
                  className={`inline-flex items-center rounded-full border ${
                    idx === activeSheetIndex
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-700 border-gray-200'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setActiveSheetIndex(idx)}
                    className="px-3 py-1 text-[11px] font-semibold"
                  >
                    {formatSheetLabel(sheet.name)}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDeleteSheet(sheet.name)}
                    className={`mr-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      idx === activeSheetIndex
                        ? 'bg-white/20 text-white hover:bg-white/30'
                        : 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                    }`}
                    title="Delete this sheet"
                  >
                    x
                  </button>
                </div>
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
                      {compactSheetRows(activeSheet.rows).map((row, rIdx) => (
                        <tr key={rIdx}>
                          <td className="px-2 py-1.5 border-r border-gray-100 text-[10px] text-gray-500 bg-gray-50 font-medium">{rIdx + 1}</td>
                          {Array.from({ length: Math.max(activeSheet.column_count, row.length) }).map((_, cIdx) => {
                            const cell = row[cIdx] ?? '';
                            return (
                              <td key={`${rIdx}-${cIdx}`} className="px-2 py-1.5 border-r border-gray-100 whitespace-pre-wrap">
                                {cell || <span className="text-gray-300"> </span>}
                              </td>
                            );
                          })}
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

    </div>
  );
}

export default function B2CSalesEntryPage({ startSection = 'daily' }: { startSection?: Subsection }) {
  const navigate = useNavigate();
  const [subsection, setSubsection] = useState<Subsection>(startSection);
  const [deliveryDate, setDeliveryDate] = useState(todayIso());
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
        <p className="text-sm text-gray-500">Use Daily entry or Overview scanner section (FY 2026-27 ready workflow).</p>
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
        <>
          <div className="md:hidden">
            <Card title="B2C analytics" subtitle="FY workbook + daily entries — pick month & compare">
              <B2CFusedOverviewAnalytics />
            </Card>
          </div>
          <div className="hidden md:block space-y-4">
            <Card title="B2C analytics" subtitle="FY workbook + daily entries — pick month & compare">
              <B2CFusedOverviewAnalytics />
            </Card>
            <B2COverviewScannerSection />
          </div>
        </>
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
