import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiClient } from '../../api/client';
import {
  aggregateByLocation,
  mergeWorkbookAndDaily,
  topAndBottom,
  totalsForYmKeys,
  type LocationKpi,
} from '../../lib/b2cDataMerge';
import {
  COMPARE_MODE_LABELS,
  comparisonPeriodKeys,
  defaultFocusYmKey,
  FISCAL_YEAR_OPTIONS,
  fiscalYearForDate,
  fyMonthKeysForYear,
  monthNameFromCalMonth,
  parseYmKey,
  pctChange,
  ymKey,
  type CompareMode,
  type FiscalYearId,
} from '../../lib/b2cFiscal';
import { extractMonthlyPoints, type B2CWorkbookSheet } from '../../lib/b2cWorkbookParse';
import { Card } from '../ui/Card';

interface B2CDailyEntry {
  id: string;
  delivery_date: string;
  location: string;
  no_of_order: number;
  total_sale_value: number;
}

interface B2CWorkbookScanBrief {
  id: string;
  source_filename: string;
}

interface B2CWorkbookScanDetail {
  scan: B2CWorkbookScanBrief;
  sheets: B2CWorkbookSheet[];
}

function fmtMoney(n: number) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: number | null) {
  if (n == null) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

function ChangeBadge({ label, value }: { label: string; value: number | null }) {
  const up = value != null && value > 0;
  const down = value != null && value < 0;
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div
        className={`text-sm font-semibold mt-0.5 ${
          value == null ? 'text-gray-700' : up ? 'text-emerald-700' : down ? 'text-red-700' : 'text-gray-700'
        }`}
      >
        {fmtPct(value)}
      </div>
    </div>
  );
}

function CityRankList({
  title,
  rows,
  metric,
}: {
  title: string;
  rows: LocationKpi[];
  metric: 'orders' | 'revenue';
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-3">
      <div className="text-xs font-semibold text-gray-800 mb-2">{title}</div>
      {rows.length === 0 ? (
        <div className="text-[11px] text-gray-500">No data for this period.</div>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={r.location} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-gray-700 min-w-0 truncate">
                <span className="font-semibold text-gray-400 mr-1">{i + 1}.</span>
                {r.location}
              </span>
              <span className="font-semibold text-gray-900 shrink-0">
                {metric === 'orders' ? r.orders.toLocaleString() : fmtMoney(r.sale_value)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PerCityTable({ rows }: { rows: LocationKpi[] }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase">
          <tr>
            <th className="px-3 py-2 text-left">City</th>
            <th className="px-3 py-2 text-right">Orders</th>
            <th className="px-3 py-2 text-right">Revenue</th>
            <th className="px-3 py-2 text-right">Avg order value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.location}>
              <td className="px-3 py-2 font-medium text-gray-800">{r.location}</td>
              <td className="px-3 py-2 text-right">{r.orders.toLocaleString()}</td>
              <td className="px-3 py-2 text-right">{fmtMoney(r.sale_value)}</td>
              <td className="px-3 py-2 text-right">{fmtMoney(r.avg_order_value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function B2CFusedOverviewAnalytics() {
  const [entries, setEntries] = useState<B2CDailyEntry[]>([]);
  const [scanDetail, setScanDetail] = useState<B2CWorkbookScanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fiscalYear, setFiscalYear] = useState<FiscalYearId>(() => fiscalYearForDate(new Date()));
  const [focusYm, setFocusYm] = useState(() => defaultFocusYmKey());
  const [compareMode, setCompareMode] = useState<CompareMode>('previous_month');
  const [comparePickYm, setComparePickYm] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [entRes, scansRes] = await Promise.all([
        apiClient.get<B2CDailyEntry[]>('/b2c-sales'),
        apiClient.get<B2CWorkbookScanBrief[]>('/b2c-sales/scans').catch(() => ({ data: [] as B2CWorkbookScanBrief[] })),
      ]);
      setEntries(entRes.data ?? []);
      const scans = scansRes.data ?? [];
      if (scans[0]?.id) {
        const detail = await apiClient.get<B2CWorkbookScanDetail>(`/b2c-sales/scans/${scans[0].id}`);
        setScanDetail(detail.data ?? null);
      } else {
        setScanDetail(null);
      }
    } catch {
      setError('Could not load analytics data.');
      setEntries([]);
      setScanDetail(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const workbookPoints = useMemo(
    () => (scanDetail?.sheets ?? []).flatMap((s) => extractMonthlyPoints(s)),
    [scanDetail],
  );

  const merged = useMemo(
    () => mergeWorkbookAndDaily(workbookPoints, entries, 'FY25-26'),
    [workbookPoints, entries],
  );

  const fyMonthOptions = useMemo(() => fyMonthKeysForYear(fiscalYear), [fiscalYear]);

  const allYmWithData = useMemo(() => {
    const keys = new Set<string>();
    merged.forEach((r) => {
      if (r.orders > 0 || r.amount > 0) keys.add(ymKey(r.year, r.calMonth));
    });
    return Array.from(keys)
      .map((key) => {
        const { year, calMonth } = parseYmKey(key);
        return { key, label: `${monthNameFromCalMonth(calMonth)} ${year}` };
      })
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [merged]);

  useEffect(() => {
    const inFy = fyMonthOptions.some((o) => o.key === focusYm);
    if (!inFy && fyMonthOptions.length) {
      const todayKey = defaultFocusYmKey();
      const inToday = fyMonthOptions.find((o) => o.key === todayKey);
      setFocusYm(inToday?.key ?? fyMonthOptions[fyMonthOptions.length - 1]?.key ?? todayKey);
    }
  }, [fiscalYear, fyMonthOptions, focusYm]);

  useEffect(() => {
    if (compareMode === 'pick_month' && !comparePickYm && allYmWithData.length) {
      const idx = allYmWithData.findIndex((o) => o.key === focusYm);
      setComparePickYm(allYmWithData[Math.max(0, idx - 1)]?.key ?? allYmWithData[0].key);
    }
  }, [compareMode, comparePickYm, allYmWithData, focusYm]);

  const focus = parseYmKey(focusYm);
  const focusLabel = `${monthNameFromCalMonth(focus.calMonth)} ${focus.year}`;

  const comparePeriod = useMemo(
    () => comparisonPeriodKeys(focus.year, focus.calMonth, compareMode, comparePickYm || null),
    [focus.year, focus.calMonth, compareMode, comparePickYm],
  );

  const focusLocs = useMemo(
    () => aggregateByLocation(merged, [focusYm]).sort((a, b) => b.sale_value - a.sale_value),
    [merged, focusYm],
  );

  const compareLocs = useMemo(
    () =>
      comparePeriod.keys.length
        ? aggregateByLocation(merged, comparePeriod.keys)
        : ([] as LocationKpi[]),
    [merged, comparePeriod.keys],
  );

  const focusTotals = useMemo(() => totalsForYmKeys(merged, [focusYm]), [merged, focusYm]);
  const compareTotals = useMemo(
    () => (comparePeriod.keys.length ? totalsForYmKeys(merged, comparePeriod.keys) : null),
    [merged, comparePeriod.keys],
  );

  const ranks = useMemo(() => topAndBottom(focusLocs, 5), [focusLocs]);

  const ordersChart = useMemo(
    () => focusLocs.map((r) => ({ location: r.location, orders: r.orders, revenue: r.sale_value })),
    [focusLocs],
  );

  const dataSourcesNote = useMemo(() => {
    const inFocus = merged.filter((r) => ymKey(r.year, r.calMonth) === focusYm);
    const daily = inFocus.filter((r) => r.source === 'daily' || r.source === 'daily+workbook').length;
    const wb = inFocus.filter((r) => r.source === 'workbook' || r.source === 'daily+workbook').length;
    if (daily > 0 && wb > 0) return 'This month uses daily entries (live) where entered; workbook fills other cities/months.';
    if (daily > 0) return 'This month is built from B2C daily entries (FY 2026-27 live data).';
    if (wb > 0) return 'This month is from the uploaded workbook (FY 2025-26).';
    return 'No data for this month yet — add daily entries or upload workbook.';
  }, [merged, focusYm]);

  if (loading) {
    return <div className="text-sm text-gray-500">Loading analytics…</div>;
  }

  if (error) {
    return <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 space-y-3">
        <p className="text-xs text-indigo-900">
          <span className="font-semibold">FY 2025-26 workbook</span> (Apr 2025 – Mar 2026) plus{' '}
          <span className="font-semibold">FY 2026-27 daily entries</span> (current months update as you save).
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <div>
            <label className="block text-[10px] font-medium text-gray-600 mb-1">Financial year</label>
            <select
              value={fiscalYear}
              onChange={(e) => setFiscalYear(e.target.value as FiscalYearId)}
              className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs"
            >
              {FISCAL_YEAR_OPTIONS.map((fy) => (
                <option key={fy.id} value={fy.id}>
                  {fy.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-600 mb-1">Show analytics for month</label>
            <select
              value={focusYm}
              onChange={(e) => setFocusYm(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs"
            >
              {fyMonthOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-600 mb-1">Compare to</label>
            <select
              value={compareMode}
              onChange={(e) => setCompareMode(e.target.value as CompareMode)}
              className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs"
            >
              {(Object.keys(COMPARE_MODE_LABELS) as CompareMode[]).map((m) => (
                <option key={m} value={m}>
                  {COMPARE_MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          {compareMode === 'pick_month' && (
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-1">Compare month</label>
              <select
                value={comparePickYm || allYmWithData[0]?.key || ''}
                onChange={(e) => setComparePickYm(e.target.value)}
                className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs"
              >
                {allYmWithData.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <p className="text-[11px] text-indigo-800">{dataSourcesNote}</p>
        {scanDetail && (
          <p className="text-[10px] text-gray-500">
            Workbook: {scanDetail.scan.source_filename} ({scanDetail.sheets.length} sheets)
          </p>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700">
        <span className="font-semibold text-gray-900">Viewing:</span> {focusLabel}
        {compareMode !== 'none' && compareTotals && (
          <>
            {' '}
            <span className="text-gray-400">vs</span> {comparePeriod.label}
          </>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="rounded-lg border border-gray-100 bg-white px-3 py-2.5 shadow-sm">
          <div className="text-[10px] uppercase tracking-wide text-gray-500">Total orders</div>
          <div className="text-lg font-bold text-gray-900 mt-0.5">{focusTotals.orders.toLocaleString()}</div>
          {compareTotals && (
            <div className="text-[10px] text-gray-500 mt-0.5">
              vs {compareTotals.orders.toLocaleString()} ({comparePeriod.label})
            </div>
          )}
        </div>
        <div className="rounded-lg border border-gray-100 bg-white px-3 py-2.5 shadow-sm">
          <div className="text-[10px] uppercase tracking-wide text-gray-500">Total revenue</div>
          <div className="text-lg font-bold text-gray-900 mt-0.5">{fmtMoney(focusTotals.revenue)}</div>
          {compareTotals && (
            <div className="text-[10px] text-gray-500 mt-0.5">vs {fmtMoney(compareTotals.revenue)}</div>
          )}
        </div>
        <div className="rounded-lg border border-gray-100 bg-white px-3 py-2.5 shadow-sm">
          <div className="text-[10px] uppercase tracking-wide text-gray-500">Avg order value</div>
          <div className="text-lg font-bold text-gray-900 mt-0.5">{fmtMoney(focusTotals.avg)}</div>
          {compareTotals && (
            <div className="text-[10px] text-gray-500 mt-0.5">vs {fmtMoney(compareTotals.avg)}</div>
          )}
        </div>
      </div>

      {compareTotals && compareMode !== 'none' && (
        <div className="grid grid-cols-2 gap-2">
          <ChangeBadge label="Orders change" value={pctChange(focusTotals.orders, compareTotals.orders)} />
          <ChangeBadge label="Revenue change" value={pctChange(focusTotals.revenue, compareTotals.revenue)} />
        </div>
      )}

      <Card title="Location performance — orders" subtitle={focusLabel} className="text-sm">
        {ordersChart.length === 0 ? (
          <div className="text-sm text-gray-500">No data for this month.</div>
        ) : (
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={ordersChart} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="location" tick={{ fontSize: 10 }} angle={-28} textAnchor="end" height={56} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => [Number(v ?? 0).toLocaleString(), 'Orders']} />
                <Bar dataKey="orders" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card title="Location performance — revenue" subtitle={focusLabel} className="text-sm">
        {ordersChart.length === 0 ? (
          <div className="text-sm text-gray-500">No data for this month.</div>
        ) : (
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={ordersChart} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="location" tick={{ fontSize: 10 }} angle={-28} textAnchor="end" height={56} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => [fmtMoney(Number(v ?? 0)), 'Revenue']} />
                <Bar dataKey="revenue" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card title="Per city KPIs" subtitle={focusLabel} className="text-sm">
        <PerCityTable rows={focusLocs} />
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <CityRankList title="Top 5 cities — orders" rows={ranks.topOrders} metric="orders" />
        <CityRankList title="Worst 5 cities — orders" rows={ranks.bottomOrders} metric="orders" />
        <CityRankList title="Top 5 cities — revenue" rows={ranks.topRevenue} metric="revenue" />
        <CityRankList title="Worst 5 cities — revenue" rows={ranks.bottomRevenue} metric="revenue" />
      </div>

      {compareMode !== 'none' && compareLocs.length > 0 && (
        <Card title="Comparison period totals by city" subtitle={comparePeriod.label} className="text-sm">
          <PerCityTable rows={compareLocs.sort((a, b) => b.sale_value - a.sale_value)} />
        </Card>
      )}

      <button
        type="button"
        onClick={() => void load()}
        className="text-xs text-indigo-600 hover:text-indigo-500 font-medium"
      >
        Refresh data
      </button>
    </div>
  );
}
