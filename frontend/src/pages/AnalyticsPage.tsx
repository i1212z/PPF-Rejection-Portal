import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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

interface DetailRow {
  id: string;
  primary: string;
  secondary?: string;
  kg?: number;
  inr?: number;
  date?: string;
}

interface MonthlyProductChartData {
  rows: Array<{ month: string; [product: string]: string | number }>;
  products: string[];
  topByMonth: Array<{ month: string; product: string; kg: number }>;
}

function fmtQty(n: number): string {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function fmtMoney(n: number): string {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function toKg(quantity: number, uomRaw?: string | null): number {
  const q = Number(quantity || 0);
  const u = (uomRaw || 'EA').toUpperCase();
  if (u === 'KG' || u === 'KGS') return q;
  if (u === 'EA100') return q * 0.1;
  if (u === 'EA150') return q * 0.15;
  if (u === 'EA200' || u === 'EA' || u === 'BOX') return q * 0.2; // default EA = EA200
  if (u === 'EA250') return q * 0.25;
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
  const customerDetailsByKg: Record<string, DetailRow[]> = {};
  const productDetailsByKg: Record<string, DetailRow[]> = {};
  const customerDetailsByRupees: Record<string, DetailRow[]> = {};
  const productDetailsByRupees: Record<string, DetailRow[]> = {};

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

    const row: DetailRow = {
      id: t.id,
      primary: p,
      secondary: c,
      kg: qKg,
      inr: rs,
      date: t.delivery_date,
    };
    (customerDetailsByKg[c] ??= []).push(row);
    (productDetailsByKg[p] ??= []).push(row);
    (customerDetailsByRupees[c] ??= []).push(row);
    (productDetailsByRupees[p] ??= []).push(row);
  });

  const topCustomersKg = topN(byCustomerKg, 10);
  const topProductsKg = topN(byProductKg, 10);
  const topCustomersRupees = topN(byCustomerRupees, 10);
  const topProductsRupees = topN(byProductRupees, 10);
  return {
    totalConfirmedQtyKg: approved.reduce((a, t) => a + toKg(Number(t.quantity || 0), t.uom), 0),
    totalConfirmedRupees: approved.reduce((a, t) => a + Number(t.cost || 0), 0),
    topCustomersKg,
    topProductsKg,
    topCustomersRupees,
    topProductsRupees,
    customerDetailsByKg,
    productDetailsByKg,
    customerDetailsByRupees,
    productDetailsByRupees,
    highestCustomerKg: topCustomersKg[0] ?? null,
    highestCustomerRupees: topCustomersRupees[0] ?? null,
  };
}

function monthSortKey(isoDate: string): string | null {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec((isoDate || '').trim());
  if (!m) return null;
  return `${m[1]}-${m[2]}`;
}

function buildMonthlyProductChart(tickets: Ticket[], channel: Channel): MonthlyProductChartData {
  const approved = tickets.filter((t) => t.channel === channel && t.status === 'approved');
  const monthProductKg: Record<string, Record<string, number>> = {};
  const productTotalKg: Record<string, number> = {};

  for (const t of approved) {
    const mk = monthSortKey(t.delivery_date);
    if (!mk) continue;
    const product = (t.product_name || '').trim() || 'Unknown product';
    const kg = toKg(Number(t.quantity || 0), t.uom);
    if (!monthProductKg[mk]) monthProductKg[mk] = {};
    monthProductKg[mk][product] = (monthProductKg[mk][product] ?? 0) + kg;
    productTotalKg[product] = (productTotalKg[product] ?? 0) + kg;
  }

  const monthKeys = Object.keys(monthProductKg).sort();
  const products = Object.entries(productTotalKg)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([p]) => p)
    .slice(0, 8);

  const rows: Array<{ month: string; [product: string]: string | number }> = monthKeys.map((mk) => {
    const [y, m] = mk.split('-').map((v) => Number(v));
    const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-IN', { month: 'short', year: 'numeric' });
    const row: { month: string; [product: string]: string | number } = { month: label };
    for (const p of products) row[p] = monthProductKg[mk][p] ?? 0;
    return row;
  });

  const topByMonth = monthKeys
    .map((mk) => {
      const perProduct = monthProductKg[mk];
      let topProduct = '';
      let topKg = 0;
      for (const [p, kg] of Object.entries(perProduct)) {
        if (kg > topKg) {
          topKg = kg;
          topProduct = p;
        }
      }
      if (!topProduct || topKg <= 0) return null;
      const [y, m] = mk.split('-').map((v) => Number(v));
      const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-IN', { month: 'short', year: 'numeric' });
      return { month: label, product: topProduct, kg: topKg };
    })
    .filter((x): x is { month: string; product: string; kg: number } => Boolean(x));

  return { rows, products, topByMonth };
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

    const timer = window.setInterval(() => {
      void load();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [canCN]);

  const b2b = useMemo(() => channelAnalytics(tickets, 'B2B'), [tickets]);
  const b2c = useMemo(() => channelAnalytics(tickets, 'B2C'), [tickets]);
  const b2bMonthlyChart = useMemo(() => buildMonthlyProductChart(tickets, 'B2B'), [tickets]);
  const b2cMonthlyChart = useMemo(() => buildMonthlyProductChart(tickets, 'B2C'), [tickets]);

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
          <MonthlyProductReturnsCard data={b2bMonthlyChart} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <Metric label="Confirmed qty (kg)" value={fmtQty(b2b.totalConfirmedQtyKg)} />
            <Metric label="Confirmed value (INR)" value={fmtMoney(b2b.totalConfirmedRupees)} />
            <Metric
              label="Highest customer returning"
              value={b2b.highestCustomerKg ? `${b2b.highestCustomerKg.key} (${fmtQty(b2b.highestCustomerKg.value)} kg)` : '—'}
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
            <ExpandableTopList
              title="Who is returning the most (kg)"
              rows={b2b.topCustomersKg}
              valueFormatter={fmtQty}
              suffix=" kg"
              detailBuilder={(customer) =>
                (b2b.customerDetailsByKg[customer] ?? [])
                  .slice()
                  .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                  .map((d) => ({
                    id: d.id,
                    line1: d.primary,
                    line2: `${fmtDate(d.date)}${d.kg !== undefined ? ` · ${fmtQty(d.kg)} kg` : ''}`,
                  }))
              }
            />
            <ExpandableTopList
              title="Which products are getting return (kg)"
              rows={b2b.topProductsKg}
              valueFormatter={fmtQty}
              suffix=" kg"
              detailBuilder={(product) =>
                (b2b.productDetailsByKg[product] ?? [])
                  .slice()
                  .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                  .map((d) => ({
                    id: d.id,
                    line1: d.secondary || 'Unknown customer',
                    line2: `${fmtDate(d.date)}${d.kg !== undefined ? ` · ${fmtQty(d.kg)} kg` : ''}`,
                  }))
              }
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
            <ExpandableTopList
              title="Top customers by value (INR)"
              rows={b2b.topCustomersRupees}
              valueFormatter={fmtMoney}
              detailBuilder={(customer) =>
                (b2b.customerDetailsByRupees[customer] ?? [])
                  .slice()
                  .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                  .map((d) => ({
                    id: d.id,
                    line1: d.primary,
                    line2: `${fmtDate(d.date)}${d.inr !== undefined ? ` · INR ${fmtMoney(d.inr)}` : ''}`,
                  }))
              }
            />
            <ExpandableTopList
              title="Top products by value (INR)"
              rows={b2b.topProductsRupees}
              valueFormatter={fmtMoney}
              detailBuilder={(product) =>
                (b2b.productDetailsByRupees[product] ?? [])
                  .slice()
                  .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                  .map((d) => ({
                    id: d.id,
                    line1: d.secondary || 'Unknown customer',
                    line2: `${fmtDate(d.date)}${d.inr !== undefined ? ` · INR ${fmtMoney(d.inr)}` : ''}`,
                  }))
              }
            />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <ChartCard title="Top customers (kg)" data={b2b.topCustomersKg.slice(0, 6)} color="#0284c7" />
            <ChartCard title="Top products (kg)" data={b2b.topProductsKg.slice(0, 6)} color="#0369a1" />
          </div>

        </Card>
      )}

      {showB2C && (
        <Card title="B2C analytics" subtitle="Confirmed returns only (approved tickets)" className="text-sm">
          <MonthlyProductReturnsCard data={b2cMonthlyChart} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <Metric label="Confirmed qty (kg)" value={fmtQty(b2c.totalConfirmedQtyKg)} />
            <Metric label="Confirmed value (INR)" value={fmtMoney(b2c.totalConfirmedRupees)} />
            <Metric
              label="Highest customer returning"
              value={b2c.highestCustomerKg ? `${b2c.highestCustomerKg.key} (${fmtQty(b2c.highestCustomerKg.value)} kg)` : '—'}
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
            <ExpandableTopList
              title="Who is returning the most (kg)"
              rows={b2c.topCustomersKg}
              valueFormatter={fmtQty}
              suffix=" kg"
              detailBuilder={(customer) =>
                (b2c.customerDetailsByKg[customer] ?? [])
                  .slice()
                  .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                  .map((d) => ({
                    id: d.id,
                    line1: d.primary,
                    line2: `${fmtDate(d.date)}${d.kg !== undefined ? ` · ${fmtQty(d.kg)} kg` : ''}`,
                  }))
              }
            />
            <ExpandableTopList
              title="Which products are getting return (kg)"
              rows={b2c.topProductsKg}
              valueFormatter={fmtQty}
              suffix=" kg"
              detailBuilder={(product) =>
                (b2c.productDetailsByKg[product] ?? [])
                  .slice()
                  .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                  .map((d) => ({
                    id: d.id,
                    line1: d.secondary || 'Unknown customer',
                    line2: `${fmtDate(d.date)}${d.kg !== undefined ? ` · ${fmtQty(d.kg)} kg` : ''}`,
                  }))
              }
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
            <ExpandableTopList
              title="Top customers by value (INR)"
              rows={b2c.topCustomersRupees}
              valueFormatter={fmtMoney}
              detailBuilder={(customer) =>
                (b2c.customerDetailsByRupees[customer] ?? [])
                  .slice()
                  .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                  .map((d) => ({
                    id: d.id,
                    line1: d.primary,
                    line2: `${fmtDate(d.date)}${d.inr !== undefined ? ` · INR ${fmtMoney(d.inr)}` : ''}`,
                  }))
              }
            />
            <ExpandableTopList
              title="Top products by value (INR)"
              rows={b2c.topProductsRupees}
              valueFormatter={fmtMoney}
              detailBuilder={(product) =>
                (b2c.productDetailsByRupees[product] ?? [])
                  .slice()
                  .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                  .map((d) => ({
                    id: d.id,
                    line1: d.secondary || 'Unknown customer',
                    line2: `${fmtDate(d.date)}${d.inr !== undefined ? ` · INR ${fmtMoney(d.inr)}` : ''}`,
                  }))
              }
            />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <ChartCard title="Top customers (kg)" data={b2c.topCustomersKg.slice(0, 6)} color="#ea580c" />
            <ChartCard title="Top products (kg)" data={b2c.topProductsKg.slice(0, 6)} color="#f97316" />
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

function MonthlyProductReturnsCard({ data }: { data: MonthlyProductChartData }) {
  const palette = ['#2563eb', '#16a34a', '#ea580c', '#7c3aed', '#0891b2', '#be123c', '#ca8a04', '#334155'];
  if (data.rows.length === 0 || data.products.length === 0) {
    return (
      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        Monthly Product Returns (KG): no approved return data yet.
      </div>
    );
  }
  return (
    <div className="mb-4 rounded-lg border border-slate-200 p-3">
      <div className="text-sm font-semibold text-slate-800 mb-1">Monthly Product Returns (KG)</div>
      <div className="text-[11px] text-slate-500 mb-2">X-axis: Month · Y-axis: Returned KG</div>
      <div style={{ width: '100%', height: 320 }}>
        <ResponsiveContainer>
          <BarChart data={data.rows} margin={{ left: 12, right: 12, top: 8, bottom: 28 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} label={{ value: 'Returned KG', angle: -90, position: 'insideLeft' }} />
            <Tooltip formatter={(v) => `${fmtQty(Number(v ?? 0))} kg`} />
            {data.products.map((p, idx) => (
              <Bar
                key={p}
                dataKey={p}
                name={p}
                fill={palette[idx % palette.length]}
                radius={[3, 3, 0, 0]}
                maxBarSize={36}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
        {data.products.map((p, idx) => (
          <div key={p} className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: palette[idx % palette.length] }} />
            <span className="truncate max-w-[180px]">{p}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
        {data.topByMonth.map((x) => `${x.month}: ${x.product} (${fmtQty(x.kg)} kg)`).join(' | ')}
      </div>
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

function ExpandableTopList({
  title,
  rows,
  valueFormatter = fmtQty,
  suffix = '',
  detailBuilder,
}: {
  title: string;
  rows: TopRow[];
  valueFormatter?: (n: number) => string;
  suffix?: string;
  detailBuilder: (key: string) => { id: string; line1: string; line2?: string }[];
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-700">{title}</div>
      <div className="divide-y divide-slate-100">
        {rows.length === 0 && <div className="px-3 py-2 text-xs text-slate-500">No data.</div>}
        {rows.map((r, i) => {
          const isOpen = openKey === r.key;
          const details = isOpen ? detailBuilder(r.key).slice(0, 30) : [];
          return (
            <div key={`${r.key}-${i}`} className="px-3 py-2 text-xs">
              <button
                type="button"
                onClick={() => setOpenKey((prev) => (prev === r.key ? null : r.key))}
                className="w-full flex items-start justify-between gap-3 text-left"
              >
                <div className="min-w-0 text-slate-700 truncate">
                  <span className="font-semibold">{r.key}</span>
                  <span className="ml-2 text-[10px] text-slate-500">{isOpen ? 'Hide details' : 'Show details'}</span>
                </div>
                <div className="shrink-0 font-semibold text-slate-900 tabular-nums">
                  {valueFormatter(r.value)}{suffix}
                </div>
              </button>
              {isOpen && (
                <div className="mt-2 rounded-md border border-slate-200 bg-white divide-y divide-slate-100">
                  {details.length === 0 ? (
                    <div className="px-2 py-1.5 text-[11px] text-slate-500">No details.</div>
                  ) : (
                    details.map((d) => (
                      <div key={d.id} className="px-2 py-1.5 text-[11px]">
                        <div className="text-slate-800 font-medium truncate">{d.line1}</div>
                        {d.line2 ? <div className="text-slate-500 truncate">{d.line2}</div> : null}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
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


