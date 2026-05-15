import {
  calendarMonthForFyMonth,
  calendarYearForFyMonth,
  monthNameFromCalMonth,
  ymKey,
  type B2cFyMonthName,
  type FiscalYearId,
} from './b2cFiscal';
import type { MonthlyPoint } from './b2cWorkbookParse';

export interface B2CDailyEntryRow {
  delivery_date: string;
  location: string;
  no_of_order: number;
  total_sale_value: number;
}

export interface MergedMonthLocation {
  location: string;
  year: number;
  calMonth: number;
  month: B2cFyMonthName;
  orders: number;
  amount: number;
  source: 'daily' | 'workbook' | 'daily+workbook';
}

type AggMap = Map<string, MergedMonthLocation>;

function cellKey(location: string, year: number, calMonth: number): string {
  return `${location.trim().toLowerCase()}|${year}|${calMonth}`;
}

function normalizeLocation(loc: string): string {
  return loc.trim();
}

export function mergeWorkbookAndDaily(
  workbookPoints: MonthlyPoint[],
  dailyEntries: B2CDailyEntryRow[],
  workbookFy: FiscalYearId = 'FY25-26',
): MergedMonthLocation[] {
  const map: AggMap = new Map();

  for (const p of workbookPoints) {
    const location = normalizeLocation(p.location);
    if (!location) continue;
    const n = location.toLowerCase();
    if (n.includes('total') || n.includes('share')) continue;

    const year = calendarYearForFyMonth(workbookFy, p.month);
    const calMonth = calendarMonthForFyMonth(workbookFy, p.month);
    const key = cellKey(location, year, calMonth);
    map.set(key, {
      location,
      year,
      calMonth,
      month: p.month,
      orders: p.orders,
      amount: p.amount,
      source: 'workbook',
    });
  }

  const dailyAgg = new Map<string, { location: string; year: number; calMonth: number; orders: number; amount: number }>();
  for (const e of dailyEntries) {
    const location = normalizeLocation(e.location);
    if (!location) continue;
    const d = new Date(e.delivery_date);
    if (Number.isNaN(d.getTime())) continue;
    const year = d.getFullYear();
    const calMonth = d.getMonth() + 1;
    const key = cellKey(location, year, calMonth);
    const prev = dailyAgg.get(key) ?? { location, year, calMonth, orders: 0, amount: 0 };
    prev.orders += Number(e.no_of_order || 0);
    prev.amount += Number(e.total_sale_value || 0);
    dailyAgg.set(key, prev);
  }

  for (const [key, d] of dailyAgg) {
    const existing = map.get(key);
    const month = monthNameFromCalMonth(d.calMonth);
    if (existing) {
      map.set(key, {
        ...existing,
        orders: d.orders,
        amount: d.amount,
        source: 'daily+workbook',
      });
    } else {
      map.set(key, {
        location: d.location,
        year: d.year,
        calMonth: d.calMonth,
        month,
        orders: d.orders,
        amount: d.amount,
        source: 'daily',
      });
    }
  }

  return Array.from(map.values());
}

export interface LocationKpi {
  location: string;
  orders: number;
  sale_value: number;
  avg_order_value: number;
}

export function aggregateByLocation(rows: MergedMonthLocation[], ymKeys: string[]): LocationKpi[] {
  const keySet = new Set(ymKeys);
  const byLoc = new Map<string, { orders: number; amount: number }>();

  for (const r of rows) {
    const k = ymKey(r.year, r.calMonth);
    if (!keySet.has(k)) continue;
    const prev = byLoc.get(r.location) ?? { orders: 0, amount: 0 };
    prev.orders += r.orders;
    prev.amount += r.amount;
    byLoc.set(r.location, prev);
  }

  return Array.from(byLoc.entries())
    .map(([location, v]) => ({
      location,
      orders: v.orders,
      sale_value: v.amount,
      avg_order_value: v.orders > 0 ? Math.round((v.amount / v.orders) * 100) / 100 : 0,
    }))
    .filter((r) => r.location && !r.location.toLowerCase().includes('total'));
}

export function totalsForYmKeys(rows: MergedMonthLocation[], ymKeys: string[]): {
  orders: number;
  revenue: number;
  avg: number;
} {
  const locs = aggregateByLocation(rows, ymKeys);
  const orders = locs.reduce((a, x) => a + x.orders, 0);
  const revenue = locs.reduce((a, x) => a + x.sale_value, 0);
  return {
    orders,
    revenue,
    avg: orders > 0 ? Math.round((revenue / orders) * 100) / 100 : 0,
  };
}

export function topAndBottom(locs: LocationKpi[], n = 5) {
  const byOrders = [...locs].sort((a, b) => b.orders - a.orders || b.sale_value - a.sale_value);
  const byRevenue = [...locs].sort((a, b) => b.sale_value - a.sale_value || b.orders - a.orders);
  const bottomOrders = [...locs].filter((x) => x.orders > 0 || x.sale_value > 0).sort((a, b) => a.orders - b.orders || a.sale_value - b.sale_value);
  const bottomRevenue = [...locs].filter((x) => x.orders > 0 || x.sale_value > 0).sort((a, b) => a.sale_value - b.sale_value || a.orders - b.orders);
  return {
    topOrders: byOrders.slice(0, n),
    bottomOrders: bottomOrders.slice(0, n),
    topRevenue: byRevenue.slice(0, n),
    bottomRevenue: bottomRevenue.slice(0, n),
  };
}
