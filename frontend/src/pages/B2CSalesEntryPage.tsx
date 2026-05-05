import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/client';
import { Card } from '../components/ui/Card';

const B2C_LOCATION_OPTIONS = ['Calicut', 'Kochi', 'Thrissur', 'Coimbatore', 'Bangalore'] as const;

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

type Subsection = 'daily' | 'overview';

function fileSizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

  const loadScans = useCallback(async () => {
    try {
      const res = await apiClient.get<B2CWorkbookScanBrief[]>('/b2c-sales/scans');
      setScans(res.data ?? []);
      if (!activeScanId && res.data && res.data.length > 0) {
        setActiveScanId(res.data[0].id);
      }
    } catch {
      setScans([]);
    }
  }, [activeScanId]);

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
      const nextScans = scans.filter((s) => s.id !== activeScanId);
      setScans(nextScans);
      const nextId = nextScans[0]?.id ?? null;
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

  return (
    <div className="space-y-4">
      <Card
        title="Overview"
        subtitle="Upload .xlsx/.xls and scan all workbook sheets. Each upload is saved in history."
      >
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:items-end gap-2">
            <label className="text-xs text-gray-700">
              Excel file
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
            <div className="text-[11px] text-gray-500">{uploading ? 'Scanning workbook...' : 'All sheets are parsed.'}</div>
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

      <Card title="Scan history" subtitle="Saved uploads (latest first), open or download anytime">
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

      <Card title="Workbook output" subtitle="Spreadsheet-style preview with one tab per sheet">
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
    </div>
  );
}

export default function B2CSalesEntryPage() {
  const [subsection, setSubsection] = useState<Subsection>('daily');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [location, setLocation] = useState('');
  const [noOfOrder, setNoOfOrder] = useState<number | ''>('');
  const [totalSaleValue, setTotalSaleValue] = useState<number | ''>('');
  const [entries, setEntries] = useState<B2CDailyEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="space-y-4 min-w-0 max-w-full">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">B2C daily entry</h2>
        <p className="text-sm text-gray-500">Enter daily numbers and review workbook scans in Overview.</p>
      </div>

      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setSubsection('daily')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
            subsection === 'daily' ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-50'
          }`}
        >
          Daily entry
        </button>
        <button
          type="button"
          onClick={() => setSubsection('overview')}
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
