import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Line, LineChart } from 'recharts';
import { apiClient } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Card } from '../components/ui/Card';

type Channel = 'B2B' | 'B2C';
type TicketStatus = 'pending' | 'approved' | 'rejected';

interface Ticket {
  id: string;
  product_name: string;
  quantity: number;
  uom?: string | null;
  cost?: number;
  delivery_batch: string;
  delivery_date: string;
  channel: Channel;
  status: TicketStatus;
}

interface CreditNote {
  id: string;
  customer_name: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
}

interface TopRow {
  key: string;
  value: number;
}

interface UnitBucketRow {
  unit: string;
  rawQty: number;
  kgEquivalent: number;
}

interface TrendPoint {
  day: string;
  value: number;
}

function fmtQty(n: number): string {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function fmtMoney(n: number): string {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toKg(quantity: number, uomRaw?: string | null): number {
  const q = Number(quantity || 0);
  const u = (uomRaw || 'EA').toUpperCase();
  if (u === 'KG' || u === 'KGS') return q;
  if (u === 'EA' || u === 'BOX') return q * 0.2; // treat BOX same as EA unless specified otherwise
  if (u === 'G' || u === 'GM' || u === 'GRAM' || u === 'GRAMS') return q / 1000;
  if (u === 'ML') return q / 1000;
  if (u === 'L') return q;
  return q;
}

function topN(map: Record<string, number>, n = 8): TopRow[] {
  return Object.entries(map)
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key))
    .slice(0, n);
}

function channelAnalytics(tickets: Ticket[], channel: Channel) {
  const approved = tickets.filter((t) => t.channel === channel && t.status === 'approved');
  const byCustomerKg: Record<string, number> = {};
  const byProductKg: Record<string, number> = {};
  const byCustomerRupees: Record<string, number> = {};
  const byProductRupees: Record<string, number> = {};
  const byUnitQty: Record<string, number> = {};

  approved.forEach((t) => {
    const c = (t.delivery_batch || '').trim() || 'Unknown customer';
    const p = (t.product_name || '').trim() || 'Unknown product';
    const q = Number(t.quantity || 0);
    const u = (t.uom || 'EA').toUpperCase();
    const qKg = toKg(q, u);
    const rs = Number(t.cost || 0);
    byCustomerKg[c] = (byCustomerKg[c] ?? 0) + qKg;
    byProductKg[p] = (byProductKg[p] ?? 0) + qKg;
    byCustomerRupees[c] = (byCustomerRupees[c] ?? 0) + rs;
    byProductRupees[p] = (byProductRupees[p] ?? 0) + rs;
    byUnitQty[u] = (byUnitQty[u] ?? 0) + q;
  });

  const topCustomersKg = topN(byCustomerKg, 10);
  const topProductsKg = topN(byProductKg, 10);
  const topCustomersRupees = topN(byCustomerRupees, 10);
  const topProductsRupees = topN(byProductRupees, 10);
  const unitBreakdown = topN(byUnitQty, 12);
  const unitBuckets: UnitBucketRow[] = Object.entries(byUnitQty)
    .map(([unit, rawQty]) => {
      const u = (unit || 'EA').toUpperCase();
      return { unit: u, rawQty, kgEquivalent: toKg(rawQty, u) };
    })
    .sort((a, b) => Math.abs(b.kgEquivalent) - Math.abs(a.kgEquivalent) || a.unit.localeCompare(b.unit));
  return {
    totalConfirmedQtyKg: approved.reduce((a, t) => a + toKg(Number(t.quantity || 0), t.uom), 0),
    totalConfirmedRupees: approved.reduce((a, t) => a + Number(t.cost || 0), 0),
    topCustomersKg,
    topProductsKg,
    topCustomersRupees,
    topProductsRupees,
    unitBreakdown,
    unitBuckets,
    highestCustomerKg: topCustomersKg[0] ?? null,
    highestCustomerRupees: topCustomersRupees[0] ?? null,
  };
}

function rejectionAnalytics(tickets: Ticket[], channel: Channel) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const monthStart = new Date(Date.UTC(year, month, 1));
  const monthEnd = new Date(Date.UTC(year, month + 1, 0));
  const daysInMonth = monthEnd.getUTCDate();

  const rejected = tickets.filter((t) => t.channel === channel && t.status === 'rejected');
  const dayTotals: Record<number, number> = {};
  const productTotals: Record<string, number> = {};

  rejected.forEach((t) => {
    if (!t.delivery_date) return;
    const d = new Date(`${t.delivery_date}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return;
    if (d < monthStart || d > monthEnd) return;

    const day = d.getUTCDate();
    const qKg = toKg(Number(t.quantity || 0), t.uom);
    const product = (t.product_name || '').trim() || 'Unknown product';

    dayTotals[day] = (dayTotals[day] ?? 0) + qKg;
    productTotals[product] = (productTotals[product] ?? 0) + qKg;
  });

  const trend: TrendPoint[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    trend.push({ day: String(day), value: dayTotals[day] ?? 0 });
  }

  const topProducts = topN(productTotals, 8);
  const totalRejectedQtyKg = trend.reduce((a, p) => a + p.value, 0);

  return {
    totalRejectedQtyKg,
    trend,
    topProducts,
    highestProduct: topProducts[0] ?? null,
  };
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);

  const isManager = user?.role === 'manager' || user?.role === 'admin';
  const isB2B = user?.role === 'b2b';
  const isB2C = user?.role === 'b2c';
  const canCN = isManager || isB2B;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [tRes, cnRes] = await Promise.all([
          apiClient.get<{ items: Ticket[]; total: number }>('/tickets', { params: { limit: 1000 } }),
          canCN
            ? apiClient.get<{ items: CreditNote[]; total: number }>('/credit-notes', { params: { limit: 1000 } })
            : Promise.resolve({ data: { items: [] as CreditNote[], total: 0 } }),
        ]);
        setTickets(tRes.data.items ?? []);
        setCreditNotes(cnRes.data.items ?? []);
      } catch {
        setTickets([]);
        setCreditNotes([]);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [canCN]);

  const b2b = useMemo(() => channelAnalytics(tickets, 'B2B'), [tickets]);
  const b2c = useMemo(() => channelAnalytics(tickets, 'B2C'), [tickets]);
  const b2bRejected = useMemo(() => rejectionAnalytics(tickets, 'B2B'), [tickets]);
  const b2cRejected = useMemo(() => rejectionAnalytics(tickets, 'B2C'), [tickets]);

  const approvedCN = useMemo(() => {
    const rows = creditNotes.filter((c) => c.status === 'approved');
    const byCustomer: Record<string, number> = {};
    rows.forEach((c) => {
      const k = (c.customer_name || '').trim() || 'Unknown customer';
      byCustomer[k] = (byCustomer[k] ?? 0) + Number(c.amount || 0);
    });
    const topCustomers = topN(byCustomer, 10);
    return {
      totalApprovedAmount: rows.reduce((a, c) => a + Number(c.amount || 0), 0),
      topCustomers,
      highestCustomer: topCustomers[0] ?? null,
      count: rows.length,
    };
  }, [creditNotes]);

  const showB2B = isManager || isB2B;
  const showB2C = isManager || isB2C;

  return (
    <div className="space-y-4 min-w-0 max-w-full">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Analytics</h2>
        <p className="text-sm text-gray-500">
          ERP-style rejection analytics: top returning customers, top returned products, and highest customer returns.
        </p>
      </div>

      {loading && <div className="text-sm text-gray-500">Loading analytics…</div>}

      {showB2B && (
        <Card title="B2B analytics" subtitle="Confirmed returns only (approved tickets)" className="text-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <Metric label="Confirmed qty (kg)" value={fmtQty(b2b.totalConfirmedQtyKg)} />
            <Metric label="Confirmed value (INR)" value={fmtMoney(b2b.totalConfirmedRupees)} />
            <Metric
              label="Highest customer returning"
              value={b2b.highestCustomerKg ? `${b2b.highestCustomerKg.key} (${fmtQty(b2b.highestCustomerKg.value)} kg)` : '—'}
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
            <TopList title="Who is returning the most (kg)" rows={b2b.topCustomersKg} valueFormatter={fmtQty} suffix=" kg" />
            <TopList title="Which products are getting return (kg)" rows={b2b.topProductsKg} valueFormatter={fmtQty} suffix=" kg" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
            <TopList title="Top customers by value (INR)" rows={b2b.topCustomersRupees} valueFormatter={fmtMoney} />
            <TopList title="Top products by value (INR)" rows={b2b.topProductsRupees} valueFormatter={fmtMoney} />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
            <ChartCard title="Top customers (kg)" data={b2b.topCustomersKg.slice(0, 6)} color="#0284c7" />
            <ChartCard title="Top products (kg)" data={b2b.topProductsKg.slice(0, 6)} color="#0369a1" />
            <ChartCard title="Unit distribution (raw qty)" data={b2b.unitBreakdown.slice(0, 6)} color="#0ea5e9" />
          </div>
          <div className="mt-3">
            <UnitBucketTable title="Unit breakdown (raw qty + kg equivalent)" rows={b2b.unitBuckets} />
          </div>

          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Metric label="Rejected this month (kg)" value={fmtQty(b2bRejected.totalRejectedQtyKg)} />
              <Metric
                label="Most rejected product"
                value={
                  b2bRejected.highestProduct
                    ? `${b2bRejected.highestProduct.key} (${fmtQty(b2bRejected.highestProduct.value)} kg)`
                    : '—'
                }
              />
              <Metric label="Top rejected products" value={String(b2bRejected.topProducts.length)} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <LineTrendCard title="Rejections trend (kg)" data={b2bRejected.trend} color="#0ea5e9" />
              <TopList
                title="Top rejected products (kg)"
                rows={b2bRejected.topProducts}
                valueFormatter={fmtQty}
                suffix=" kg"
              />
            </div>
          </div>
        </Card>
      )}

      {showB2C && (
        <Card title="B2C analytics" subtitle="Confirmed returns only (approved tickets)" className="text-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <Metric label="Confirmed qty (kg)" value={fmtQty(b2c.totalConfirmedQtyKg)} />
            <Metric label="Confirmed value (INR)" value={fmtMoney(b2c.totalConfirmedRupees)} />
            <Metric
              label="Highest customer returning"
              value={b2c.highestCustomerKg ? `${b2c.highestCustomerKg.key} (${fmtQty(b2c.highestCustomerKg.value)} kg)` : '—'}
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
            <TopList title="Who is returning the most (kg)" rows={b2c.topCustomersKg} valueFormatter={fmtQty} suffix=" kg" />
            <TopList title="Which products are getting return (kg)" rows={b2c.topProductsKg} valueFormatter={fmtQty} suffix=" kg" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
            <TopList title="Top customers by value (INR)" rows={b2c.topCustomersRupees} valueFormatter={fmtMoney} />
            <TopList title="Top products by value (INR)" rows={b2c.topProductsRupees} valueFormatter={fmtMoney} />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
            <ChartCard title="Top customers (kg)" data={b2c.topCustomersKg.slice(0, 6)} color="#ea580c" />
            <ChartCard title="Top products (kg)" data={b2c.topProductsKg.slice(0, 6)} color="#f97316" />
            <ChartCard title="Unit distribution (raw qty)" data={b2c.unitBreakdown.slice(0, 6)} color="#fb923c" />
          </div>
          <div className="mt-3">
            <UnitBucketTable title="Unit breakdown (raw qty + kg equivalent)" rows={b2c.unitBuckets} />
          </div>

          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Metric label="Rejected this month (kg)" value={fmtQty(b2cRejected.totalRejectedQtyKg)} />
              <Metric
                label="Most rejected product"
                value={
                  b2cRejected.highestProduct
                    ? `${b2cRejected.highestProduct.key} (${fmtQty(b2cRejected.highestProduct.value)} kg)`
                    : '—'
                }
              />
              <Metric label="Top rejected products" value={String(b2cRejected.topProducts.length)} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <LineTrendCard title="Rejections trend (kg)" data={b2cRejected.trend} color="#fb923c" />
              <TopList
                title="Top rejected products (kg)"
                rows={b2cRejected.topProducts}
                valueFormatter={fmtQty}
                suffix=" kg"
              />
            </div>
          </div>
        </Card>
      )}

      {canCN && (
        <Card title="CN analytics (approved only)" subtitle="Approved credit notes analytics" className="text-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <Metric label="Approved CN count" value={String(approvedCN.count)} />
            <Metric label="Approved CN amount (INR)" value={fmtMoney(approvedCN.totalApprovedAmount)} />
            <Metric
              label="Highest customer (CN)"
              value={
                approvedCN.highestCustomer
                  ? `${approvedCN.highestCustomer.key} (${fmtMoney(approvedCN.highestCustomer.value)})`
                  : '—'
              }
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <TopList title="Top customers by approved CN amount" rows={approvedCN.topCustomers} valueFormatter={fmtMoney} />
            <ChartCard title="Top customers (CN INR)" data={approvedCN.topCustomers.slice(0, 8)} color="#7c3aed" valueFormatter={fmtMoney} />
          </div>
        </Card>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-sm font-semibold text-gray-900 break-words">{value}</div>
    </div>
  );
}

function TopList({
  title,
  rows,
  valueFormatter = fmtQty,
  suffix = '',
}: {
  title: string;
  rows: TopRow[];
  valueFormatter?: (n: number) => string;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-700">{title}</div>
      <div className="divide-y divide-slate-100">
        {rows.length === 0 && <div className="px-3 py-2 text-xs text-slate-500">No data.</div>}
        {rows.map((r, i) => (
          <div key={`${r.key}-${i}`} className="px-3 py-2 text-xs flex items-start justify-between gap-3">
            <div className="min-w-0 text-slate-700 truncate">{r.key}</div>
            <div className="shrink-0 font-semibold text-slate-900 tabular-nums">
              {valueFormatter(r.value)}{suffix}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  data,
  color,
  valueFormatter = fmtQty,
}: {
  title: string;
  data: TopRow[];
  color: string;
  valueFormatter?: (n: number) => string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-2">
      <div className="text-xs font-semibold text-slate-700 mb-1">{title}</div>
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          <BarChart data={data.map((d) => ({ name: d.key, value: d.value }))} margin={{ left: 8, right: 8, top: 8, bottom: 36 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-20} textAnchor="end" interval={0} height={50} tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(t) => valueFormatter(Number(t))} />
            <Tooltip
              formatter={(v) => {
                const n = Number(v ?? 0);
                return [valueFormatter(n), ''];
              }}
            />
            <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function LineTrendCard({
  title,
  data,
  color,
  valueFormatter = fmtQty,
}: {
  title: string;
  data: TrendPoint[];
  color: string;
  valueFormatter?: (n: number) => string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-2">
      <div className="text-xs font-semibold text-slate-700 mb-1">{title}</div>
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 16 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={0} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(t) => valueFormatter(Number(t))} />
            <Tooltip
              formatter={(v) => {
                const n = Number(v ?? 0);
                return [valueFormatter(n), ''];
              }}
            />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function UnitBucketTable({ title, rows }: { title: string; rows: UnitBucketRow[] }) {
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-700">{title}</div>
      <div className="divide-y divide-slate-100">
        {rows.length === 0 && <div className="px-3 py-2 text-xs text-slate-500">No unit data.</div>}
        {rows.map((r) => (
          <div key={r.unit} className="px-3 py-2 text-xs flex items-start justify-between gap-3">
            <div className="min-w-0 text-slate-700 truncate">{r.unit}</div>
            <div className="shrink-0 text-right tabular-nums">
              <div className="font-semibold text-slate-900">
                {fmtQty(r.rawQty)} <span className="text-slate-500 font-medium">{r.unit}</span>
              </div>
              <div className="text-[11px] text-slate-500">~ {fmtQty(r.kgEquivalent)} kg</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

