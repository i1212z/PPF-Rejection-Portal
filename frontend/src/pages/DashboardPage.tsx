import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { apiClient } from '../api/client';
import { Card } from '../components/ui/Card';
import { ApprovedVsRejectedChart } from '../components/charts/ApprovedVsRejectedChart';
import type { ApprovedRejectedPoint } from '../components/charts/ApprovedVsRejectedChart';
import { StatusBadge } from '../components/ui/StatusBadge';

type TicketStatus = 'pending' | 'approved' | 'rejected';

interface Ticket {
  id: string;
  product_name: string;
  quantity: number;
  uom?: string | null;
  reason: string;
  channel: 'B2B' | 'B2C';
  status: TicketStatus;
  delivery_batch: string;
  delivery_date: string;
  created_at: string;
  rejection_remarks?: string | null;
  approval_remarks?: string | null;
}

interface TicketGroup {
  id: string;
  delivery_batch: string;
  delivery_date: string;
  channel: 'B2B' | 'B2C';
  created_at: string;
  items: {
    id: string;
    product_name: string;
    quantity: number;
    reason: string;
    status: TicketStatus;
    approval_remarks?: string | null;
    rejection_remarks?: string | null;
  }[];
}

interface CreditNote {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
}

function truncate(s: string, len: number) {
  if (!s) return '–';
  return s.length <= len ? s : `${s.slice(0, len)}…`;
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
  if (u === 'ML') return q / 1000; // fallback density approximation
  if (u === 'L') return q; // fallback density approximation
  return q;
}

function fmtNoRound(value: number, decimals = 3): string {
  const n = Number(value || 0);
  const factor = 10 ** decimals;
  const truncated = Math.trunc(n * factor) / factor;
  const s = truncated.toString();
  if (!s.includes('.')) return s;
  return s.replace(/\.?0+$/, '');
}

function groupTickets(list: Ticket[]): TicketGroup[] {
  const groups: Record<string, TicketGroup> = {};
  list.forEach((t) => {
    const key = `${t.delivery_batch}|${t.delivery_date}|${t.channel}|${t.created_at.slice(
      0,
      16,
    )}`;
    if (!groups[key]) {
      groups[key] = {
        id: t.id,
        delivery_batch: t.delivery_batch,
        delivery_date: t.delivery_date,
        channel: t.channel,
        created_at: t.created_at,
        items: [],
      };
    }
    groups[key].items.push({
      id: t.id,
      product_name: t.product_name,
      quantity: t.quantity,
      reason: t.reason,
      status: t.status,
      approval_remarks: t.approval_remarks,
      rejection_remarks: t.rejection_remarks,
    });
  });
  return Object.values(groups).sort((a, b) => {
    const tA = new Date(a.created_at).getTime();
    const tB = new Date(b.created_at).getTime();
    if (tB !== tA) return tB - tA;
    return (a.id || '').localeCompare(b.id || '');
  });
}

function groupKey(g: TicketGroup): string {
  return `${g.delivery_batch}|${g.delivery_date}|${g.channel}|${g.created_at.slice(0, 16)}`;
}

function TicketRow({
  group: g,
  displayId,
  getLineId,
  expanded,
  onToggle,
}: {
  group: TicketGroup;
  displayId: string;
  getLineId: (itemId: string) => string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const statuses = Array.from(new Set(g.items.map((i) => i.status)));
  const singleStatus = statuses.length === 1 ? statuses[0] : null;

  return (
    <>
      <tr
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onToggle()}
        className="hover:bg-gray-50 cursor-pointer"
      >
        <td className="px-4 py-2 font-medium text-xs text-gray-700">
          {displayId}
        </td>
        <td className="px-4 py-2">{g.delivery_batch}</td>
        <td className="px-4 py-2">
          {new Date(g.delivery_date).toLocaleDateString('en-GB')}
        </td>
        <td className="px-4 py-2 text-xs">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
              g.channel === 'B2B'
                ? 'bg-sky-50 text-sky-700'
                : 'bg-orange-50 text-orange-700'
            }`}
          >
            {g.channel}
          </span>
        </td>
        <td className="px-4 py-2">
          {singleStatus ? (
            <StatusBadge status={singleStatus} />
          ) : (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
              Multiple
            </span>
          )}
        </td>
        <td className="px-4 py-2 text-xs text-gray-500">
          {new Date(g.created_at).toLocaleString('en-GB')}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50 border-l-4 border-l-indigo-300">
          <td colSpan={6} className="px-4 py-3 text-xs">
            <div className="space-y-2">
              <div className="font-medium text-gray-700">
                Products on this ticket (Ticket ID: {displayId})
              </div>
              <div className="border border-gray-200 rounded-md bg-white overflow-x-auto max-w-full min-w-0">
                <table className="min-w-full text-[11px]">
                  <thead className="bg-gray-50 text-gray-500 uppercase">
                    <tr>
                      <th className="px-3 py-1 text-left">Line</th>
                      <th className="px-3 py-1 text-left">Product</th>
                      <th className="px-3 py-1 text-left">Qty</th>
                      <th className="px-3 py-1 text-left">Status</th>
                      <th className="px-3 py-1 text-left">Creator reason</th>
                      <th className="px-3 py-1 text-left">Admin remark</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {g.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-1 font-medium text-gray-700">{getLineId(item.id)}</td>
                        <td className="px-3 py-1">{item.product_name}</td>
                        <td className="px-3 py-1">{item.quantity}</td>
                        <td className="px-3 py-1">
                          <StatusBadge status={item.status} />
                        </td>
                        <td
                          className="px-3 py-1 text-gray-700 max-w-[180px]"
                          title={item.reason}
                        >
                          {truncate(item.reason || '', 60)}
                        </td>
                        <td
                          className="px-3 py-1 text-gray-700 max-w-[180px]"
                          title={
                            item.approval_remarks ?? item.rejection_remarks ?? ''
                          }
                        >
                          {truncate(
                            item.approval_remarks ?? item.rejection_remarks ?? '',
                            60,
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const isManagerOrAdmin = user?.role === 'manager' || user?.role === 'admin';
  const isB2B = user?.role === 'b2b';
  const isB2C = user?.role === 'b2c';
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [tallyPostedIds, setTallyPostedIds] = useState<Set<string>>(new Set());
  const [cnTallyPostedIds, setCnTallyPostedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showB2BUnits, setShowB2BUnits] = useState(false);
  const [showB2CUnits, setShowB2CUnits] = useState(false);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const canSeeTallyPostedEndpoints =
        user?.role === 'manager' ||
        user?.role === 'admin' ||
        user?.role === 'b2b' ||
        user?.role === 'b2c';
      const canSeeCreditNotes =
        user?.role === 'manager' || user?.role === 'admin' || user?.role === 'b2b';
      const canSeeCreditNoteTallyPostedEndpoints =
        user?.role === 'manager' ||
        user?.role === 'admin' ||
        user?.role === 'b2b' ||
        user?.role === 'b2c';

      const ticketParams: Record<string, string | number> = { limit: 500 };
      if (appliedFrom) ticketParams.from_date = appliedFrom;
      if (appliedTo) ticketParams.to_date = appliedTo;

      const creditNoteParams: Record<string, string | number> = { limit: 500 };
      if (appliedFrom) creditNoteParams.from_date = appliedFrom;
      if (appliedTo) creditNoteParams.to_date = appliedTo;

      const [ticketsResult, tallyResult, creditNotesResult, cnTallyResult] =
        await Promise.allSettled([
          apiClient.get<{ items: Ticket[]; total: number }>('/tickets', {
            params: ticketParams,
          }),
          canSeeTallyPostedEndpoints
            ? apiClient.get<{ ticket_ids: string[] }>('/tally/posted')
            : Promise.resolve({ data: { ticket_ids: [] as string[] } }),
          canSeeCreditNotes
            ? apiClient.get<{ items: CreditNote[]; total: number }>('/credit-notes', {
                params: creditNoteParams,
              })
            : Promise.resolve({ data: { items: [] as CreditNote[], total: 0 } }),
          canSeeCreditNoteTallyPostedEndpoints
            ? apiClient.get<{ credit_note_ids: string[] }>('/credit-note-tally/posted')
            : Promise.resolve({ data: { credit_note_ids: [] as string[] } }),
        ]);

      if (ticketsResult.status === 'fulfilled') {
        setTickets(ticketsResult.value.data.items || []);
      } else {
        setTickets([]);
        // eslint-disable-next-line no-console
        console.warn('Dashboard tickets load failed', ticketsResult.reason);
      }

      if (tallyResult.status === 'fulfilled') {
        setTallyPostedIds(new Set(tallyResult.value.data.ticket_ids || []));
      } else {
        setTallyPostedIds(new Set());
      }

      if (creditNotesResult.status === 'fulfilled') {
        setCreditNotes(creditNotesResult.value.data.items || []);
      } else {
        setCreditNotes([]);
      }

      if (cnTallyResult.status === 'fulfilled') {
        setCnTallyPostedIds(new Set(cnTallyResult.value.data.credit_note_ids || []));
      } else {
        setCnTallyPostedIds(new Set());
      }

      setLoading(false);
    };
    void load();
  }, [user?.role, appliedFrom, appliedTo]);

  const channelFilter = user?.role === 'b2b' ? 'B2B' : user?.role === 'b2c' ? 'B2C' : null;

  const {
    totalTickets,
    pendingCount,
    recentGroups,
    globalDisplayByKey,
    globalItemLineByItemId,
    approvedVsRejectedData,
    rejectedByUnit,
    tallyPostedB2BCount,
    tallyPostedB2CCount,
    tallyTotalB2BCount,
    tallyTotalB2CCount,
    cnTallyPostedCount,
    cnTallyTotalCount,
  } =
    useMemo(() => {
      const total = tickets.length;
      let pending = 0;
      let confirmedKgB2B = 0;
      let confirmedKgB2C = 0;
      let dismissedKgB2B = 0;
      let dismissedKgB2C = 0;

      const rejectedByUnit: Record<'B2B' | 'B2C', Record<string, number>> = {
        B2B: {},
        B2C: {},
      };

      tickets.forEach((t) => {
        const qty = Number(t.quantity || 0);
        const u = (t.uom || 'EA').toUpperCase();
        const qtyKg = toKg(qty, u);
        if (t.channel === 'B2B') {
          if (t.status === 'approved') {
            confirmedKgB2B += qtyKg;
            rejectedByUnit.B2B[u] = (rejectedByUnit.B2B[u] ?? 0) + qty;
          } else if (t.status === 'rejected') {
            dismissedKgB2B += qtyKg;
          }
        } else if (t.channel === 'B2C') {
          if (t.status === 'approved') {
            confirmedKgB2C += qtyKg;
            rejectedByUnit.B2C[u] = (rejectedByUnit.B2C[u] ?? 0) + qty;
          } else if (t.status === 'rejected') {
            dismissedKgB2C += qtyKg;
          }
        }
        if (t.status === 'pending') pending += 1;
      });

      const approvedVsRejected: ApprovedRejectedPoint[] = [];
      if (channelFilter === 'B2B') {
        approvedVsRejected.push(
          { name: 'Confirmed', value: confirmedKgB2B },
          { name: 'Dismissed', value: dismissedKgB2B },
        );
      } else if (channelFilter === 'B2C') {
        approvedVsRejected.push(
          { name: 'Confirmed', value: confirmedKgB2C },
          { name: 'Dismissed', value: dismissedKgB2C },
        );
      } else {
        approvedVsRejected.push(
          { name: 'B2B Confirmed', value: confirmedKgB2B },
          { name: 'B2B Dismissed', value: dismissedKgB2B },
          { name: 'B2C Confirmed', value: confirmedKgB2C },
          { name: 'B2C Dismissed', value: dismissedKgB2C },
        );
      }

      const allGroupsNewest = groupTickets(tickets);
      const recentTickets = allGroupsNewest.slice(0, 5);
      const allGroupsAsc = [...allGroupsNewest].sort((a, b) => {
        const tA = new Date(a.created_at).getTime();
        const tB = new Date(b.created_at).getTime();
        if (tA !== tB) return tA - tB;
        return groupKey(a).localeCompare(groupKey(b));
      });
      const globalDisplayByKey = new Map<string, number>();
      const globalItemLineByItemId = new Map<string, number>();
      const channelCounters: Record<string, number> = {};
      allGroupsAsc.forEach((g) => {
        const chan = g.channel;
        const next = (channelCounters[chan] ?? 0) + 1;
        channelCounters[chan] = next;
        globalDisplayByKey.set(groupKey(g), next);
        const itemsSorted = [...g.items].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
        itemsSorted.forEach((item, lineIdx) => globalItemLineByItemId.set(item.id, lineIdx + 1));
      });

      // Tally: posted = in tally_pending; pending = decided but not posted
      const postedB2BCount = tickets.filter(
        (t) => tallyPostedIds.has(t.id) && t.channel === 'B2B',
      ).length;
      const postedB2CCount = tickets.filter(
        (t) => tallyPostedIds.has(t.id) && t.channel === 'B2C',
      ).length;
      const decidedB2BCount = tickets.filter(
        (t) => (t.status === 'approved' || t.status === 'rejected') && t.channel === 'B2B',
      ).length;
      const decidedB2CCount = tickets.filter(
        (t) => (t.status === 'approved' || t.status === 'rejected') && t.channel === 'B2C',
      ).length;
      const approvedCreditNotes = creditNotes.filter((n) => n.status === 'approved');
      const postedCnCount = approvedCreditNotes.filter((n) => cnTallyPostedIds.has(n.id)).length;

      return {
        totalTickets: total,
        pendingCount: pending,
        recentGroups: recentTickets,
        globalDisplayByKey,
        globalItemLineByItemId,
        approvedVsRejectedData: approvedVsRejected,
        rejectedByUnit,
        tallyPostedB2BCount: postedB2BCount,
        tallyPostedB2CCount: postedB2CCount,
        tallyTotalB2BCount: decidedB2BCount,
        tallyTotalB2CCount: decidedB2CCount,
        cnTallyPostedCount: postedCnCount,
        cnTallyTotalCount: approvedCreditNotes.length,
      };
    }, [tickets, channelFilter, tallyPostedIds, creditNotes, cnTallyPostedIds]);

  const totalB2BUnits = useMemo(
    () =>
      Object.entries(rejectedByUnit.B2B || {}).reduce(
        (acc, [u, v]) => acc + toKg(Number(v || 0), u),
        0,
      ),
    [rejectedByUnit.B2B],
  );

  const totalB2CUnits = useMemo(
    () =>
      Object.entries(rejectedByUnit.B2C || {}).reduce(
        (acc, [u, v]) => acc + toKg(Number(v || 0), u),
        0,
      ),
    [rejectedByUnit.B2C],
  );

  const dateRangeBar = (
    <div className="mt-3 flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="block text-[11px] font-medium text-gray-600 mb-0.5">From</label>
          <input
            type="date"
            value={rangeFrom}
            onChange={(e) => setRangeFrom(e.target.value)}
            className="rounded-md border border-gray-200 px-2 py-1.5 text-xs bg-white min-h-[36px]"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-600 mb-0.5">To</label>
          <input
            type="date"
            value={rangeTo}
            onChange={(e) => setRangeTo(e.target.value)}
            className="rounded-md border border-gray-200 px-2 py-1.5 text-xs bg-white min-h-[36px]"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setAppliedFrom(rangeFrom);
            setAppliedTo(rangeTo);
          }}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 min-h-[36px]"
        >
          Apply range
        </button>
        <button
          type="button"
          onClick={() => {
            setRangeFrom('');
            setRangeTo('');
            setAppliedFrom('');
            setAppliedTo('');
          }}
          className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 min-h-[36px]"
        >
          Clear
        </button>
      </div>
      {(appliedFrom || appliedTo) && (
        <p className="text-[11px] text-gray-500 sm:ml-1">
          Dashboard metrics use ticket and credit-note delivery dates in range; B2C daily analytics uses entry delivery
          dates.
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-3 md:space-y-6 min-w-0 max-w-full">
      {/* Header */}
      <div className="space-y-3 md:space-y-0">
        <div className="hidden md:flex flex-col gap-3 md:flex-row md:items-center md:justify-between min-w-0">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 tracking-tight">
              Dashboard
            </h2>
            <p className="text-sm text-gray-500">
              Rejection overview for {user?.role} across B2B and B2C.
            </p>
            {dateRangeBar}
          </div>
          <div className="inline-flex w-full md:w-auto justify-center md:justify-start items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-[11px] text-emerald-700 shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="truncate">Live rejection tracking</span>
          </div>
        </div>
        {(user?.role === 'manager' || user?.role === 'admin' || user?.role === 'b2b' || user?.role === 'b2c') && (
          <div className="hidden md:flex">
            <Link
              to="/analytics"
              className="inline-flex items-center rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              Open analytics
            </Link>
          </div>
        )}

        {/* Mobile quick actions */}
        <div className="md:hidden space-y-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-gray-900 tracking-tight">Dashboard</h2>
            <p className="text-sm text-gray-500">
              Rejection overview for {user?.role} across B2B and B2C.
            </p>
            {dateRangeBar}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Link
              to="/tickets/new"
              className="flex items-center justify-center rounded-2xl border border-indigo-100 bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm min-h-[44px]"
            >
              New Ticket
            </Link>
            <Link
              to="/credit-notes/new"
              className="flex items-center justify-center rounded-2xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 shadow-sm min-h-[44px]"
            >
              New CN
            </Link>
          </div>
          {(user?.role === 'manager' || user?.role === 'admin' || user?.role === 'b2b' || user?.role === 'b2c') && (
            <Link
              to="/analytics"
              className="flex items-center justify-center rounded-2xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 shadow-sm min-h-[44px]"
            >
              Analytics
            </Link>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 md:gap-6 min-w-0">
        <Card
          title="Total tickets"
          subtitle="All B2B & B2C tickets"
          className="border-t-4 border-t-amber-400"
        >
          <div className="text-2xl font-bold text-gray-900">
            {loading ? '…' : totalTickets || '0'}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {totalTickets ? `${totalTickets} active` : 'No tickets yet'}
          </p>
        </Card>
        <Card
          title="B2B confirmed rejected qty"
          subtitle="Confirmed rejections (B2B)"
          className="border-t-4 border-t-sky-400"
        >
          <button
            type="button"
            onClick={() => setShowB2BUnits((v) => !v)}
            className="w-full text-left min-h-[44px]"
          >
            <div className="text-2xl font-bold text-gray-900">
              {loading ? '…' : fmtNoRound(totalB2BUnits)} <span className="text-base font-semibold">kg</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">{showB2BUnits ? 'Hide unit breakdown' : 'Click for unit breakdown'}</p>
            {showB2BUnits && <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(rejectedByUnit?.B2B ?? {})
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([u, v]) => (
                  <span
                    key={u}
                    className="inline-flex items-center rounded-full bg-sky-50 border border-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-800"
                  >
                    {fmtNoRound(Number(v), 6)} {u} → {fmtNoRound(toKg(Number(v), u), 6)} kg
                  </span>
                ))}
              {Object.keys(rejectedByUnit?.B2B ?? {}).length === 0 && (
                <span className="text-[11px] text-gray-500">No confirmed rejections yet.</span>
              )}
            </div>}
          </button>
        </Card>
        <Card
          title="B2C confirmed rejected qty"
          subtitle="Confirmed rejections (B2C)"
          className="border-t-4 border-t-rose-400"
        >
          <button
            type="button"
            onClick={() => setShowB2CUnits((v) => !v)}
            className="w-full text-left min-h-[44px]"
          >
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-2xl font-bold text-gray-900">
                {loading ? '…' : fmtNoRound(totalB2CUnits)} <span className="text-base font-semibold">kg</span>
              </div>
              <span className="text-xs text-gray-400">→</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">{showB2CUnits ? 'Hide unit breakdown' : 'Click for unit breakdown'}</p>
            {showB2CUnits && <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(rejectedByUnit?.B2C ?? {})
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([u, v]) => (
                  <span
                    key={u}
                    className="inline-flex items-center rounded-full bg-rose-50 border border-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-800"
                  >
                    {fmtNoRound(Number(v), 6)} {u} → {fmtNoRound(toKg(Number(v), u), 6)} kg
                  </span>
                ))}
              {Object.keys(rejectedByUnit?.B2C ?? {}).length === 0 && (
                <span className="text-[11px] text-gray-500">No confirmed rejections yet.</span>
              )}
            </div>}
          </button>
        </Card>
        <Card
          title="Pending"
          subtitle="Waiting for manager / admin"
          className="border-t-4 border-t-emerald-400"
        >
          <div className="text-2xl font-bold text-gray-900">
            {loading ? '…' : pendingCount || '0'}
          </div>
          <p className="mt-1 text-xs text-gray-500 hidden md:block">
            Use Approvals tab to action these.
          </p>
        </Card>
      </div>

      {(isManagerOrAdmin || isB2B || isB2C) && (
        <Card
          title="Tally posted view"
          subtitle="Quick posted counts by channel and credit notes"
          className="border-l-4 border-l-sky-300"
        >
          <div
            className={`grid grid-cols-1 ${
              isManagerOrAdmin ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
            } gap-4`}
          >
            {(isManagerOrAdmin || isB2B) && (
              <div className="rounded-lg bg-sky-50 border border-sky-100 px-4 py-3">
                <div className="text-xs font-medium text-sky-700 uppercase tracking-wide">
                  B2B posted
                </div>
                <div className="mt-1 text-2xl font-semibold text-gray-900">
                  {loading ? '…' : tallyPostedB2BCount}
                </div>
                <div className="mt-1 text-[11px] text-sky-800">
                  {loading ? 'Loading…' : `${tallyPostedB2BCount} posted out of ${tallyTotalB2BCount}`}
                </div>
              </div>
            )}
            {(isManagerOrAdmin || isB2C) && (
              <div className="rounded-lg bg-orange-50 border border-orange-100 px-4 py-3">
                <div className="text-xs font-medium text-orange-700 uppercase tracking-wide">
                  B2C posted
                </div>
                <div className="mt-1 text-2xl font-semibold text-gray-900">
                  {loading ? '…' : tallyPostedB2CCount}
                </div>
                <div className="mt-1 text-[11px] text-orange-800">
                  {loading ? 'Loading…' : `${tallyPostedB2CCount} posted out of ${tallyTotalB2CCount}`}
                </div>
              </div>
            )}
            <div className="rounded-lg bg-violet-50 border border-violet-100 px-4 py-3">
              <div className="text-xs font-medium text-violet-700 uppercase tracking-wide">
                CN posted
              </div>
              <div className="mt-1 text-2xl font-semibold text-gray-900">
                {loading ? '…' : cnTallyPostedCount}
              </div>
              <div className="mt-1 text-[11px] text-violet-800">
                {loading ? 'Loading…' : `${cnTallyPostedCount} posted out of ${cnTallyTotalCount}`}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Approved vs Rejected chart — all accounts */}
      <Card
        title="Confirmed vs Dismissed"
        subtitle="Confirmed (approved) vs dismissed (rejected) quantities"
        className="border-l-4 border-l-emerald-300"
      >
        {approvedVsRejectedData.length > 0 && approvedVsRejectedData.some((d) => d.value > 0) ? (
          <ApprovedVsRejectedChart data={approvedVsRejectedData} />
        ) : (
          <div className="text-sm text-gray-500 py-4">No approved or rejected tickets yet.</div>
        )}
      </Card>

      {/* Recent tickets table */}
      <Card
        title="Recent tickets"
        subtitle="Latest tickets — click a row to see full Creator reason and Admin remark"
      >
        {loading ? (
          <div className="text-sm text-gray-500">Loading tickets…</div>
        ) : recentGroups.length === 0 ? (
          <div className="text-sm text-gray-500">No tickets yet.</div>
        ) : (
          <div className="w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain -mx-1 px-1 sm:mx-0 sm:px-0">
            <table className="min-w-full text-xs sm:text-sm">
              <thead className="bg-gray-50 text-xs font-medium text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Ticket ID</th>
                  <th className="px-4 py-2 text-left">Customer</th>
                  <th className="px-4 py-2 text-left">Delivery date</th>
                  <th className="px-4 py-2 text-left">Channel</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentGroups.map((g) => {
                  const num = globalDisplayByKey.get(groupKey(g));
                  const displayId = num != null ? `${g.channel}-${String(num).padStart(3, "0")}` : `${g.channel}-???`;
                  const getLineId = (itemId: string) => {
                    const lineNum = globalItemLineByItemId.get(itemId);
                    return lineNum != null ? `${displayId}-${lineNum}` : `${displayId}-?`;
                  };
                  return (
                    <TicketRow
                      key={g.id}
                      group={g}
                      displayId={displayId}
                      getLineId={getLineId}
                      expanded={expandedId === g.id}
                      onToggle={() =>
                        setExpandedId((id) => (id === g.id ? null : g.id))
                      }
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

