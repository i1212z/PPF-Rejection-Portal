import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Card } from '../components/ui/Card';

type Channel = 'B2B' | 'B2C';
type TicketStatus = 'pending' | 'approved' | 'rejected';

interface Ticket {
  id: string;
  product_name: string;
  quantity: number;
  delivery_batch: string;
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

function fmt(n: number): string {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function topN(map: Record<string, number>, n = 8): TopRow[] {
  return Object.entries(map)
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key))
    .slice(0, n);
}

function channelAnalytics(tickets: Ticket[], channel: Channel) {
  const approved = tickets.filter((t) => t.channel === channel && t.status === 'approved');
  const byCustomer: Record<string, number> = {};
  const byProduct: Record<string, number> = {};

  approved.forEach((t) => {
    const c = (t.delivery_batch || '').trim() || 'Unknown customer';
    const p = (t.product_name || '').trim() || 'Unknown product';
    const q = Number(t.quantity || 0);
    byCustomer[c] = (byCustomer[c] ?? 0) + q;
    byProduct[p] = (byProduct[p] ?? 0) + q;
  });

  const topCustomers = topN(byCustomer, 10);
  const topProducts = topN(byProduct, 10);
  return {
    totalConfirmedQty: approved.reduce((a, t) => a + Number(t.quantity || 0), 0),
    topCustomers,
    topProducts,
    highestCustomer: topCustomers[0] ?? null,
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
            <Metric label="Confirmed qty" value={fmt(b2b.totalConfirmedQty)} />
            <Metric
              label="Highest customer returning"
              value={b2b.highestCustomer ? `${b2b.highestCustomer.key} (${fmt(b2b.highestCustomer.value)})` : '—'}
            />
            <Metric label="Distinct returned products" value={String(b2b.topProducts.length)} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <TopList title="Who is returning the most (customer)" rows={b2b.topCustomers} />
            <TopList title="Which products are getting return" rows={b2b.topProducts} />
          </div>
        </Card>
      )}

      {showB2C && (
        <Card title="B2C analytics" subtitle="Confirmed returns only (approved tickets)" className="text-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <Metric label="Confirmed qty" value={fmt(b2c.totalConfirmedQty)} />
            <Metric
              label="Highest customer returning"
              value={b2c.highestCustomer ? `${b2c.highestCustomer.key} (${fmt(b2c.highestCustomer.value)})` : '—'}
            />
            <Metric label="Distinct returned products" value={String(b2c.topProducts.length)} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <TopList title="Who is returning the most (customer)" rows={b2c.topCustomers} />
            <TopList title="Which products are getting return" rows={b2c.topProducts} />
          </div>
        </Card>
      )}

      {canCN && (
        <Card title="CN analytics (approved only)" subtitle="Approved credit notes analytics" className="text-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <Metric label="Approved CN count" value={String(approvedCN.count)} />
            <Metric label="Approved CN amount" value={fmt(approvedCN.totalApprovedAmount)} />
            <Metric
              label="Highest customer (CN)"
              value={
                approvedCN.highestCustomer
                  ? `${approvedCN.highestCustomer.key} (${fmt(approvedCN.highestCustomer.value)})`
                  : '—'
              }
            />
          </div>
          <TopList title="Top customers by approved CN amount" rows={approvedCN.topCustomers} />
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

function TopList({ title, rows }: { title: string; rows: TopRow[] }) {
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-700">{title}</div>
      <div className="divide-y divide-slate-100">
        {rows.length === 0 && <div className="px-3 py-2 text-xs text-slate-500">No data.</div>}
        {rows.map((r, i) => (
          <div key={`${r.key}-${i}`} className="px-3 py-2 text-xs flex items-start justify-between gap-3">
            <div className="min-w-0 text-slate-700 truncate">{r.key}</div>
            <div className="shrink-0 font-semibold text-slate-900 tabular-nums">{fmt(r.value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

