import { useEffect, useMemo, useState } from 'react';
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
import { Card } from '../ui/Card';

export interface B2CLocationKpi {
  location: string;
  orders: number;
  sale_value: number;
  avg_order_value: number;
}

export interface B2CDailyOverviewAnalytics {
  period_label: string;
  previous_period_label: string;
  total_orders: number;
  total_sale_value: number;
  avg_order_value: number;
  previous_total_orders: number;
  previous_total_sale_value: number;
  previous_avg_order_value: number;
  mom_orders_pct: number | null;
  mom_revenue_pct: number | null;
  locations: B2CLocationKpi[];
  top_orders: B2CLocationKpi[];
  bottom_orders: B2CLocationKpi[];
  top_revenue: B2CLocationKpi[];
  bottom_revenue: B2CLocationKpi[];
}

function fmtMoney(n: number) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: number | null) {
  if (n == null) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

function MomBadge({ label, value }: { label: string; value: number | null }) {
  const neutral = value == null;
  const up = value != null && value > 0;
  const down = value != null && value < 0;
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div
        className={`text-sm font-semibold mt-0.5 ${
          neutral ? 'text-gray-700' : up ? 'text-emerald-700' : down ? 'text-red-700' : 'text-gray-700'
        }`}
      >
        {fmtPct(value)} <span className="text-[10px] font-normal text-gray-500">MoM</span>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-white px-3 py-2.5 shadow-sm">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-lg font-bold text-gray-900 mt-0.5">{value}</div>
      {sub ? <div className="text-[10px] text-gray-500 mt-0.5">{sub}</div> : null}
    </div>
  );
}

function CityRankList({
  title,
  rows,
  metric,
}: {
  title: string;
  rows: B2CLocationKpi[];
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
                {metric === 'orders'
                  ? r.orders.toLocaleString()
                  : fmtMoney(r.sale_value)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PerCityTable({ rows }: { rows: B2CLocationKpi[] }) {
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

export default function B2CDailyOverviewAnalyticsPanel() {
  const [data, setData] = useState<B2CDailyOverviewAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get<B2CDailyOverviewAnalytics>('/b2c-sales/overview-analytics');
        if (!cancelled) setData(res.data ?? null);
      } catch {
        if (!cancelled) {
          setData(null);
          setError('Could not load overview analytics.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const ordersChart = useMemo(
    () =>
      (data?.locations ?? []).map((r) => ({
        location: r.location,
        orders: r.orders,
        revenue: r.sale_value,
      })),
    [data?.locations],
  );

  if (loading) {
    return <div className="text-sm text-gray-500">Loading daily entry analytics…</div>;
  }

  if (error) {
    return (
      <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>
    );
  }

  if (!data) {
    return <div className="text-sm text-gray-500">No analytics available.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-xs text-indigo-900">
        <span className="font-semibold">{data.period_label}</span>
        <span className="text-indigo-700"> vs {data.previous_period_label}</span>
        <span className="text-indigo-600"> — from B2C daily entries</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <KpiCard label="Total orders" value={data.total_orders.toLocaleString()} sub={data.period_label} />
        <KpiCard label="Total revenue (INR)" value={fmtMoney(data.total_sale_value)} sub={data.period_label} />
        <KpiCard label="Avg order value" value={fmtMoney(data.avg_order_value)} sub={data.period_label} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MomBadge label="Orders" value={data.mom_orders_pct} />
        <MomBadge label="Revenue" value={data.mom_revenue_pct} />
      </div>

      <Card title="Location performance — orders" subtitle="Current month by city" className="text-sm">
        {ordersChart.length === 0 ? (
          <div className="text-sm text-gray-500">No entries this month yet.</div>
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

      <Card title="Location performance — revenue" subtitle="Current month by city" className="text-sm">
        {ordersChart.length === 0 ? (
          <div className="text-sm text-gray-500">No entries this month yet.</div>
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

      <Card title="Per city KPIs" subtitle="Orders, revenue, and average order value" className="text-sm">
        <PerCityTable rows={data.locations} />
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <CityRankList title="Top 5 cities — orders" rows={data.top_orders} metric="orders" />
        <CityRankList title="Worst 5 cities — orders" rows={data.bottom_orders} metric="orders" />
        <CityRankList title="Top 5 cities — revenue" rows={data.top_revenue} metric="revenue" />
        <CityRankList title="Worst 5 cities — revenue" rows={data.bottom_revenue} metric="revenue" />
      </div>
    </div>
  );
}
