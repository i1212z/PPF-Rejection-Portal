import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
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
  comparisonPeriodKeys,
  defaultFocusYmKey,
  FISCAL_YEAR_OPTIONS,
  fiscalYearForDate,
  fyMonthKeysForYear,
  monthNameFromCalMonth,
  parseYmKey,
  pctChange,
  ymKey,
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

type MonthOption = { key: string; label: string };

function useClickOutside(ref: RefObject<HTMLElement | null>, onClose: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [enabled, onClose, ref]);
}

function monthSummary(
  selectedKeys: string[],
  options: MonthOption[],
  allKeys: string[],
  emptyLabel: string,
): string {
  if (selectedKeys.length === 0) return emptyLabel;
  if (allKeys.length > 0 && allKeys.every((k) => selectedKeys.includes(k))) return 'All months';
  if (selectedKeys.length === 1) {
    return options.find((o) => o.key === selectedKeys[0])?.label ?? '1 month';
  }
  return `${selectedKeys.length} months`;
}

function MonthMultiSelectDropdown({
  label,
  options,
  selectedKeys,
  allKeys,
  hasDataKeys,
  onToggle,
  onSelectAll,
  onClearAll,
}: {
  label: string;
  options: MonthOption[];
  selectedKeys: string[];
  allKeys: string[];
  hasDataKeys: Set<string>;
  onToggle: (key: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selectedKeys.includes(k));
  useClickOutside(ref, () => setOpen(false), open);

  const summary = monthSummary(selectedKeys, options, allKeys, 'Select month');

  return (
    <div ref={ref} className="relative">
      <label className="block text-[10px] font-medium text-gray-600 mb-1">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-left hover:border-indigo-300"
      >
        <span className="truncate text-gray-900">{summary}</span>
        <span className="text-gray-400 shrink-0">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[12rem] rounded-md border border-gray-200 bg-white shadow-lg max-h-60 overflow-y-auto">
          <label className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 hover:bg-gray-50 cursor-pointer font-medium text-xs">
            <input
              type="checkbox"
              className="rounded border-gray-300 text-indigo-600"
              checked={allSelected}
              onChange={() => (allSelected ? onClearAll() : onSelectAll())}
            />
            <span>Select all</span>
          </label>
          {options.map((o) => (
            <label
              key={o.key}
              className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                className="rounded border-gray-300 text-indigo-600"
                checked={selectedKeys.includes(o.key)}
                onChange={() => onToggle(o.key)}
              />
              <span className={hasDataKeys.has(o.key) ? 'text-gray-900' : 'text-gray-400'}>{o.label}</span>
              {hasDataKeys.has(o.key) ? (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" title="Has data" />
              ) : null}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function MonthCompareDropdown({
  label,
  options,
  selectedKey,
  disabledKeys,
  hasDataKeys,
  onSelect,
}: {
  label: string;
  options: MonthOption[];
  selectedKey: string;
  disabledKeys: Set<string>;
  hasDataKeys: Set<string>;
  onSelect: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  const summary = selectedKey
    ? (options.find((o) => o.key === selectedKey)?.label ?? 'Compare month')
    : 'None';

  return (
    <div ref={ref} className="relative">
      <label className="block text-[10px] font-medium text-gray-600 mb-1">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-left hover:border-indigo-300"
      >
        <span className="truncate text-gray-900">{summary}</span>
        <span className="text-gray-400 shrink-0">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[12rem] rounded-md border border-gray-200 bg-white shadow-lg max-h-60 overflow-y-auto">
          <label className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 hover:bg-gray-50 cursor-pointer text-xs">
            <input
              type="checkbox"
              className="rounded border-gray-300 text-indigo-600"
              checked={!selectedKey}
              onChange={() => onSelect('')}
            />
            <span className="text-gray-600">None</span>
          </label>
          {options.map((o) => {
            const disabled = disabledKeys.has(o.key);
            const checked = selectedKey === o.key;
            return (
              <label
                key={o.key}
                className={`flex items-center gap-2 px-3 py-2 text-xs ${
                  disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50 cursor-pointer'
                }`}
              >
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-indigo-600"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => {
                    if (disabled) return;
                    onSelect(checked ? '' : o.key);
                  }}
                />
                <span className={hasDataKeys.has(o.key) ? 'text-gray-900' : 'text-gray-400'}>{o.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
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
  const [focusYmKeys, setFocusYmKeys] = useState<string[]>(() => [defaultFocusYmKey()]);
  const [comparePickYm, setComparePickYm] = useState<string>('');
  const compareMode = comparePickYm ? ('pick_month' as const) : ('none' as const);

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
    const valid = focusYmKeys.filter((k) => fyMonthOptions.some((o) => o.key === k));
    if (valid.length === 0 && fyMonthOptions.length) {
      const todayKey = defaultFocusYmKey();
      const inToday = fyMonthOptions.find((o) => o.key === todayKey);
      setFocusYmKeys([inToday?.key ?? fyMonthOptions[0].key]);
    } else if (valid.length !== focusYmKeys.length) {
      setFocusYmKeys(valid.length ? valid : [fyMonthOptions[0].key]);
    }
  }, [fiscalYear, fyMonthOptions, focusYmKeys]);

  const ymWithDataSet = useMemo(() => new Set(allYmWithData.map((o) => o.key)), [allYmWithData]);

  const allFyMonthKeys = useMemo(() => fyMonthOptions.map((o) => o.key), [fyMonthOptions]);
  const primaryFocus = parseYmKey(focusYmKeys[0] ?? defaultFocusYmKey());
  const focusDisabledForCompare = useMemo(() => new Set(focusYmKeys), [focusYmKeys]);

  const comparePeriod = useMemo(
    () => comparisonPeriodKeys(primaryFocus.year, primaryFocus.calMonth, compareMode, comparePickYm || null),
    [primaryFocus.year, primaryFocus.calMonth, compareMode, comparePickYm],
  );

  const toggleFocusMonth = (key: string) => {
    setFocusYmKeys((prev) => {
      const has = prev.includes(key);
      if (has) {
        const next = prev.filter((k) => k !== key);
        return next.length > 0 ? next : prev;
      }
      if (comparePickYm === key) setComparePickYm('');
      return [...prev, key];
    });
  };

  const focusLocs = useMemo(
    () => aggregateByLocation(merged, focusYmKeys).sort((a, b) => b.sale_value - a.sale_value),
    [merged, focusYmKeys],
  );

  const compareLocs = useMemo(
    () =>
      comparePeriod.keys.length
        ? aggregateByLocation(merged, comparePeriod.keys)
        : ([] as LocationKpi[]),
    [merged, comparePeriod.keys],
  );

  const focusTotals = useMemo(() => totalsForYmKeys(merged, focusYmKeys), [merged, focusYmKeys]);
  const compareTotals = useMemo(
    () => (comparePeriod.keys.length ? totalsForYmKeys(merged, comparePeriod.keys) : null),
    [merged, comparePeriod.keys],
  );

  const ranks = useMemo(() => topAndBottom(focusLocs, 5), [focusLocs]);

  const ordersChart = useMemo(
    () => focusLocs.map((r) => ({ location: r.location, orders: r.orders, revenue: r.sale_value })),
    [focusLocs],
  );

  if (loading) {
    return <div className="text-sm text-gray-500">Loading analytics…</div>;
  }

  if (error) {
    return <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 space-y-3">
        <div>
          <label className="block text-[10px] font-medium text-gray-600 mb-1">Financial year</label>
          <select
            value={fiscalYear}
            onChange={(e) => {
              const fy = e.target.value as FiscalYearId;
              setFiscalYear(fy);
              setComparePickYm('');
              const opts = fyMonthKeysForYear(fy);
              const todayKey = defaultFocusYmKey();
              const pick = opts.find((o) => o.key === todayKey) ?? opts[0];
              setFocusYmKeys(pick ? [pick.key] : []);
            }}
            className="w-full max-w-xs rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs"
          >
            {FISCAL_YEAR_OPTIONS.map((fy) => (
              <option key={fy.id} value={fy.id}>
                {fy.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <MonthMultiSelectDropdown
            label="Select month"
            options={fyMonthOptions}
            selectedKeys={focusYmKeys}
            allKeys={allFyMonthKeys}
            hasDataKeys={ymWithDataSet}
            onToggle={toggleFocusMonth}
            onSelectAll={() => setFocusYmKeys(allFyMonthKeys)}
            onClearAll={() => {
              const todayKey = defaultFocusYmKey();
              const inToday = fyMonthOptions.find((o) => o.key === todayKey);
              setFocusYmKeys([inToday?.key ?? fyMonthOptions[0]?.key ?? todayKey]);
            }}
          />
          <MonthCompareDropdown
            label="Compare to"
            options={fyMonthOptions}
            selectedKey={comparePickYm}
            disabledKeys={focusDisabledForCompare}
            hasDataKeys={ymWithDataSet}
            onSelect={setComparePickYm}
          />
        </div>

      </div>


      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="rounded-lg border border-gray-100 bg-white px-3 py-2.5 shadow-sm">
          <div className="text-[10px] uppercase tracking-wide text-gray-500">Total orders</div>
          <div className="text-lg font-bold text-gray-900 mt-0.5">{focusTotals.orders.toLocaleString()}</div>
          {compareTotals && (
            <div className="text-[10px] text-gray-500 mt-0.5">vs {compareTotals.orders.toLocaleString()}</div>
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

      <Card title="Location performance — orders" className="text-sm">
        {ordersChart.length === 0 ? (
          <div className="text-sm text-gray-500">No data for selected month(s).</div>
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

      <Card title="Location performance — revenue" className="text-sm">
        {ordersChart.length === 0 ? (
          <div className="text-sm text-gray-500">No data for selected month(s).</div>
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

      <Card title="Per city KPIs" className="text-sm">
        <PerCityTable rows={focusLocs} />
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <CityRankList title="Top 5 cities — orders" rows={ranks.topOrders} metric="orders" />
        <CityRankList title="Worst 5 cities — orders" rows={ranks.bottomOrders} metric="orders" />
        <CityRankList title="Top 5 cities — revenue" rows={ranks.topRevenue} metric="revenue" />
        <CityRankList title="Worst 5 cities — revenue" rows={ranks.bottomRevenue} metric="revenue" />
      </div>

      {compareMode !== 'none' && compareLocs.length > 0 && (
        <Card title="Comparison period totals by city" className="text-sm">
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
