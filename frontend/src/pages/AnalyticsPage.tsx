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

interface MonthOption {
  key: string; // YYYY-MM
  label: string;
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
    highestCustomerKg: topCustomersKg[0] ?? null,
    highestCustomerRupees: topCustomersRupees[0] ?? null,
  };
}

function monthKeyFromISODate(iso: string): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(iso.trim());
  if (!m) return null;
  return `${m[1]}-${m[2]}`;
}

function buildMonthOptions(tickets: Ticket[]): MonthOption[] {
  const keys = new Set<string>();
  for (const t of tickets) {
    const k = monthKeyFromISODate(t.delivery_date);
    if (k) keys.add(k);
  }
  const arr = Array.from(keys).sort().reverse();
  return arr.map((k) => {
    const [y, m] = k.split('-').map((x) => Number(x));
    const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-IN', { month: 'short', year: 'numeric' });
    return { key: k, label };
  });
}

function monthScopedAnalytics(tickets: Ticket[], channel: Channel, status: TicketStatus, monthKey: string | null) {
  const byCustomerKg: Record<string, number> = {};
  const byProductKg: Record<string, number> = {};
  const byCustomerProductsKg: Record<string, Record<string, number>> = {};

  tickets
    .filter((t) => t.channel === channel && t.status === status)
    .forEach((t) => {
      if (monthKey) {
        const mk = monthKeyFromISODate(t.delivery_date);
        if (mk !== monthKey) return;
      }
      const customer = (t.delivery_batch || '').trim() || 'Unknown customer';
      const product = (t.product_name || '').trim() || 'Unknown product';
      const kg = toKg(Number(t.quantity || 0), t.uom);

      byCustomerKg[customer] = (byCustomerKg[customer] ?? 0) + kg;
      byProductKg[product] = (byProductKg[product] ?? 0) + kg;
      if (!byCustomerProductsKg[customer]) byCustomerProductsKg[customer] = {};
      byCustomerProductsKg[customer][product] = (byCustomerProductsKg[customer][product] ?? 0) + kg;
    });

  const topCustomersKg = topN(byCustomerKg, 50);
  const topProductsKg = topN(byProductKg, 50);
  const totalKg = Object.values(byCustomerKg).reduce((a, v) => a + v, 0);
  return { totalKg, topCustomersKg, topProductsKg, byCustomerProductsKg };
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [topNSize, setTopNSize] = useState<number>(10);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);

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
  const monthOptions = useMemo(() => buildMonthOptions(tickets), [tickets]);
  useEffect(() => {
    if (!selectedMonth && monthOptions.length > 0) setSelectedMonth(monthOptions[0].key);
  }, [monthOptions, selectedMonth]);

  const b2bApprovedMonth = useMemo(
    () => monthScopedAnalytics(tickets, 'B2B', 'approved', selectedMonth),
    [tickets, selectedMonth],
  );
  const b2cApprovedMonth = useMemo(
    () => monthScopedAnalytics(tickets, 'B2C', 'approved', selectedMonth),
    [tickets, selectedMonth],
  );
  const b2bRejectedMonth = useMemo(
    () => monthScopedAnalytics(tickets, 'B2B', 'rejected', selectedMonth),
    [tickets, selectedMonth],
  );
  const b2cRejectedMonth = useMemo(
    () => monthScopedAnalytics(tickets, 'B2C', 'rejected', selectedMonth),
    [tickets, selectedMonth],
  );

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

      {monthOptions.length > 0 && (
        <Card title="Timeline" subtitle="Pick a month to analyze returns/rejections" className="text-sm">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="text-xs text-slate-600 font-medium">Month</div>
            <select
              value={selectedMonth ?? ''}
              onChange={(e) => {
                setSelectedMonth(e.target.value || null);
                setExpandedCustomer(null);
              }}
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              {monthOptions.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
            <div className="sm:ml-auto flex items-center gap-2">
              <div className="text-xs text-slate-600 font-medium">Show</div>
              <select
                value={topNSize}
                onChange={(e) => setTopNSize(Number(e.target.value))}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {[10, 25, 50].map((n) => (
                  <option key={n} value={n}>
                    Top {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>
      )}

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
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <ChartCard title="Top customers (kg)" data={b2b.topCustomersKg.slice(0, 6)} color="#0284c7" />
            <ChartCard title="Top products (kg)" data={b2b.topProductsKg.slice(0, 6)} color="#0369a1" />
          </div>

          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Metric label="Approved returns in month (kg)" value={fmtQty(b2bApprovedMonth.totalKg)} />
              <Metric label="Rejected in month (kg)" value={fmtQty(b2bRejectedMonth.totalKg)} />
              <Metric
                label="Most rejected product (month)"
                value={
                  b2bRejectedMonth.topProductsKg[0]
                    ? `${b2bRejectedMonth.topProductsKg[0].key} (${fmtQty(b2bRejectedMonth.topProductsKg[0].value)} kg)`
                    : '—'
                }
              />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <CustomerDrilldownList
                title="Who is returning the most (kg)"
                rows={b2bApprovedMonth.topCustomersKg.slice(0, topNSize)}
                expandedKey={expandedCustomer}
                onToggle={(k) => setExpandedCustomer((prev) => (prev === k ? null : k))}
                byCustomerProductsKg={b2bApprovedMonth.byCustomerProductsKg}
              />
              <TopList title="Which products are getting return (kg)" rows={b2bApprovedMonth.topProductsKg.slice(0, topNSize)} valueFormatter={fmtQty} suffix=" kg" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <TopList title="Top rejected products (kg)" rows={b2bRejectedMonth.topProductsKg.slice(0, topNSize)} valueFormatter={fmtQty} suffix=" kg" />
              <TopList title="Top rejected customers (kg)" rows={b2bRejectedMonth.topCustomersKg.slice(0, topNSize)} valueFormatter={fmtQty} suffix=" kg" />
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
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <ChartCard title="Top customers (kg)" data={b2c.topCustomersKg.slice(0, 6)} color="#ea580c" />
            <ChartCard title="Top products (kg)" data={b2c.topProductsKg.slice(0, 6)} color="#f97316" />
          </div>

          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Metric label="Approved returns in month (kg)" value={fmtQty(b2cApprovedMonth.totalKg)} />
              <Metric label="Rejected in month (kg)" value={fmtQty(b2cRejectedMonth.totalKg)} />
              <Metric
                label="Most rejected product (month)"
                value={
                  b2cRejectedMonth.topProductsKg[0]
                    ? `${b2cRejectedMonth.topProductsKg[0].key} (${fmtQty(b2cRejectedMonth.topProductsKg[0].value)} kg)`
                    : '—'
                }
              />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <CustomerDrilldownList
                title="Who is returning the most (kg)"
                rows={b2cApprovedMonth.topCustomersKg.slice(0, topNSize)}
                expandedKey={expandedCustomer}
                onToggle={(k) => setExpandedCustomer((prev) => (prev === k ? null : k))}
                byCustomerProductsKg={b2cApprovedMonth.byCustomerProductsKg}
              />
              <TopList title="Which products are getting return (kg)" rows={b2cApprovedMonth.topProductsKg.slice(0, topNSize)} valueFormatter={fmtQty} suffix=" kg" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <TopList title="Top rejected products (kg)" rows={b2cRejectedMonth.topProductsKg.slice(0, topNSize)} valueFormatter={fmtQty} suffix=" kg" />
              <TopList title="Top rejected customers (kg)" rows={b2cRejectedMonth.topCustomersKg.slice(0, topNSize)} valueFormatter={fmtQty} suffix=" kg" />
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

function CustomerDrilldownList({
  title,
  rows,
  expandedKey,
  onToggle,
  byCustomerProductsKg,
}: {
  title: string;
  rows: TopRow[];
  expandedKey: string | null;
  onToggle: (key: string) => void;
  byCustomerProductsKg: Record<string, Record<string, number>>;
}) {
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-700">{title}</div>
      <div className="divide-y divide-slate-100">
        {rows.length === 0 && <div className="px-3 py-2 text-xs text-slate-500">No data.</div>}
        {rows.map((r, i) => {
          const isOpen = expandedKey === r.key;
          const prodMap = byCustomerProductsKg[r.key] ?? {};
          const prodTop = topN(prodMap, 10);
          return (
            <div key={`${r.key}-${i}`} className="px-3 py-2 text-xs">
              <button
                type="button"
                onClick={() => onToggle(r.key)}
                className="w-full flex items-start justify-between gap-3 text-left"
              >
                <div className="min-w-0 text-slate-700 truncate">
                  <span className="font-semibold">{r.key}</span>
                  <span className="ml-2 text-[10px] text-slate-500">{isOpen ? 'Hide' : 'Show'} products</span>
                </div>
                <div className="shrink-0 font-semibold text-slate-900 tabular-nums">{fmtQty(r.value)} kg</div>
              </button>
              {isOpen && (
                <div className="mt-2 rounded-md border border-slate-200 bg-white">
                  <div className="px-2 py-1 text-[11px] font-semibold text-slate-700 bg-slate-50 border-b border-slate-200">
                    Products (kg)
                  </div>
                  <div className="divide-y divide-slate-100">
                    {prodTop.length === 0 ? (
                      <div className="px-2 py-1.5 text-[11px] text-slate-500">No product data.</div>
                    ) : (
                      prodTop.map((p) => (
                        <div key={p.key} className="px-2 py-1.5 flex items-start justify-between gap-3 text-[11px]">
                          <div className="min-w-0 truncate text-slate-700">{p.key}</div>
                          <div className="shrink-0 tabular-nums font-semibold text-slate-900">{fmtQty(p.value)} kg</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

