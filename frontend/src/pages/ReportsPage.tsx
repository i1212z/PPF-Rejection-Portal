import { Fragment, useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { BarChart, Bar, PieChart, Pie, Cell, Legend } from 'recharts';
import * as XLSX from 'xlsx';
import { apiClient } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Card } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/StatusBadge';

function defaultToDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultFromDateStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

type TicketStatus = 'pending' | 'approved' | 'rejected';

type CreditNoteStatus = 'pending' | 'approved' | 'rejected';

interface ReportCreditNote {
  id: string;
  delivery_date: string;
  customer_name: string;
  market_area: string;
  amount: number;
  status: CreditNoteStatus;
  created_at: string;
  created_by: string;
  approval_remarks?: string | null;
  rejection_remarks?: string | null;
}

const CN_DISPLAY_PREFIX = 'CN-B2B';

function buildCreditNoteDisplayIdMap(notes: ReportCreditNote[]): Map<string, string> {
  const sorted = [...notes].sort((a, b) => {
    const tA = new Date(a.created_at).getTime();
    const tB = new Date(b.created_at).getTime();
    if (tA !== tB) return tA - tB;
    return a.id.localeCompare(b.id);
  });
  const map = new Map<string, string>();
  sorted.forEach((n, idx) => {
    map.set(n.id, `${CN_DISPLAY_PREFIX}-${String(idx + 1).padStart(3, '0')}`);
  });
  return map;
}

interface Ticket {
  id: string;
  product_name: string;
  quantity: number;
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

function groupTickets(list: Ticket[]): TicketGroup[] {
  const groups: Record<string, TicketGroup> = {};
  list.forEach((t) => {
    const key = `${t.delivery_batch}|${t.delivery_date}|${t.channel}|${t.created_at.slice(0, 16)}`;
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
    if (tB !== tA) return tB - tA; // newest first
    return (a.id || '').localeCompare(b.id || ''); // stable: same created_at → sort by id
  });
}

/** Stable key for a group so lookups work across filtered lists (section vs all) */
function groupKey(g: TicketGroup): string {
  return `${g.delivery_batch}|${g.delivery_date}|${g.channel}|${g.created_at.slice(0, 16)}`;
}

const CHART_COLORS = ['#3b82f6', '#f97316', '#22c55e', '#ef4444'];

export default function ReportsPage() {
  const { user } = useAuth();
  const canFilterByDate = user?.role === 'manager' || user?.role === 'admin';
  const [fromDate, setFromDate] = useState(defaultFromDateStr);
  const [toDate, setToDate] = useState(defaultToDateStr);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [creditNotes, setCreditNotes] = useState<ReportCreditNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const ticketParams: Record<string, string | number> = { limit: 500 };
        const cnParams: Record<string, string | number> = { limit: 500 };
        if (canFilterByDate) {
          if (fromDate) ticketParams.from_date = fromDate;
          if (toDate) ticketParams.to_date = toDate;
          if (fromDate) cnParams.from_date = fromDate;
          if (toDate) cnParams.to_date = toDate;
        }
        const [tRes, cnRes] = await Promise.all([
          apiClient.get<{ items: Ticket[]; total: number }>('/tickets', {
            params: ticketParams,
          }),
          apiClient
            .get<{ items: ReportCreditNote[]; total: number }>('/credit-notes', {
              params: cnParams,
            })
            .catch(() => ({ data: { items: [] as ReportCreditNote[], total: 0 } })),
        ]);
        setTickets(tRes.data.items);
        setCreditNotes(cnRes.data.items ?? []);
      } catch {
        setTickets([]);
        setCreditNotes([]);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [canFilterByDate, fromDate, toDate]);

  const {
    dailyQtyData,
    channelComparisonData,
    approvalRejectionData,
    channelPieData,
    dailyChartSubtitle,
    channelChartSubtitle,
    approvalChartSubtitle,
    dailyEmptyMessage,
    channelEmptyMessage,
    approvalEmptyMessage,
  } = useMemo(() => {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStr = now.toISOString().slice(0, 10);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

    const rangeFiltered = Boolean(canFilterByDate && fromDate && toDate);
    let rangeStartStr: string;
    let rangeEndStr: string;
    if (rangeFiltered) {
      rangeStartStr = fromDate;
      rangeEndStr = toDate;
    } else {
      rangeStartStr = thirtyDaysAgoStr;
      rangeEndStr = todayStr;
    }

    const dailyMap: Record<string, number> = {};
    const startDay = new Date(`${rangeStartStr}T12:00:00`);
    const endDay = new Date(`${rangeEndStr}T12:00:00`);
    for (let d = new Date(startDay); d <= endDay; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      dailyMap[key] = 0;
    }

    let b2bQty = 0;
    let b2cQty = 0;
    const approvedQty = { B2B: 0, B2C: 0 };
    const rejectedQty = { B2B: 0, B2C: 0 };

    tickets.forEach((t) => {
      const dKey = t.delivery_date.slice(0, 10);
      if (dKey in dailyMap) {
        dailyMap[dKey] += Number(t.quantity || 0);
      }

      if (rangeFiltered) {
        if (dKey >= fromDate! && dKey <= toDate!) {
          if (t.channel === 'B2B') {
            b2bQty += Number(t.quantity || 0);
            if (t.status === 'approved') approvedQty.B2B += Number(t.quantity || 0);
            if (t.status === 'rejected') rejectedQty.B2B += Number(t.quantity || 0);
          } else {
            b2cQty += Number(t.quantity || 0);
            if (t.status === 'approved') approvedQty.B2C += Number(t.quantity || 0);
            if (t.status === 'rejected') rejectedQty.B2C += Number(t.quantity || 0);
          }
        }
      } else {
        const delivery = new Date(t.delivery_date);
        if (delivery >= thisMonthStart) {
          if (t.channel === 'B2B') {
            b2bQty += Number(t.quantity || 0);
            if (t.status === 'approved') approvedQty.B2B += Number(t.quantity || 0);
            if (t.status === 'rejected') rejectedQty.B2B += Number(t.quantity || 0);
          } else {
            b2cQty += Number(t.quantity || 0);
            if (t.status === 'approved') approvedQty.B2C += Number(t.quantity || 0);
            if (t.status === 'rejected') rejectedQty.B2C += Number(t.quantity || 0);
          }
        }
      }
    });

    const dailyQtyData = Object.entries(dailyMap)
      .map(([date, total_qty]) => ({ date, total_qty }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const channelComparisonData = [
      { channel: 'B2B', value: b2bQty },
      { channel: 'B2C', value: b2cQty },
    ];

    const channelPieData = [
      { name: 'B2B', value: b2bQty },
      { name: 'B2C', value: b2cQty },
    ].filter((d) => d.value > 0);

    const approvalRejectionData = [
      { name: 'B2B Approved', value: approvedQty.B2B },
      { name: 'B2B Rejected', value: rejectedQty.B2B },
      { name: 'B2C Approved', value: approvedQty.B2C },
      { name: 'B2C Rejected', value: rejectedQty.B2C },
    ].filter((d) => d.value > 0);

    const dailyChartSubtitle = rangeFiltered
      ? `By delivery date from ${fromDate} to ${toDate}`
      : 'By delivery date over the last 30 days';
    const channelChartSubtitle = rangeFiltered
      ? 'Channel split for tickets in the selected delivery date range'
      : 'Channel-level quantity by delivery date this calendar month';
    const approvalChartSubtitle = rangeFiltered
      ? 'By channel for tickets in the selected delivery date range'
      : 'By channel for this calendar month (delivery date)';
    const dailyEmptyMessage = rangeFiltered
      ? 'No ticket data in this range.'
      : 'No data for the last 30 days.';
    const channelEmptyMessage = rangeFiltered
      ? 'No ticket data in this range.'
      : 'No data for this month.';
    const approvalEmptyMessage = rangeFiltered
      ? 'No approved/rejected data in this range.'
      : 'No approved/rejected data this month.';

    return {
      dailyQtyData,
      channelComparisonData,
      approvalRejectionData,
      channelPieData,
      dailyChartSubtitle,
      channelChartSubtitle,
      approvalChartSubtitle,
      dailyEmptyMessage,
      channelEmptyMessage,
      approvalEmptyMessage,
    };
  }, [tickets, canFilterByDate, fromDate, toDate]);

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatDeliveryDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  /** Export columns match Dashboard product lines exactly: Line, Product, Qty, Status, Creator reason, Admin remark (+ Ticket ID for grouping) */
  const headers = [
    'Ticket ID',
    'Line',
    'Product',
    'Qty',
    'Status',
    'Creator reason',
    'Admin remark',
  ];

  const creditNoteExportHeaders = [
    'Credit note ID',
    'Customer',
    'Market area',
    'Delivery date',
    'Amount',
    'Status',
    'Remarks',
    'Created',
  ];

  const statusForExport = (s: string) =>
    s === 'approved' ? 'Approved' : s === 'rejected' ? 'Rejected' : s === 'pending' ? 'Pending' : s;

  const rowFromGroup = (
    _g: TicketGroup,
    item: TicketGroup['items'][0],
    displayId: string,
    lineId: string,
  ) => [
    displayId,
    lineId,
    item.product_name,
    item.quantity,
    statusForExport(item.status),
    item.reason ?? '',
    (item.approval_remarks ?? item.rejection_remarks ?? ''),
  ];

  const reportSections = useMemo(
    () => [
      { key: 'b2bApproved', title: 'B2B Approved', tickets: tickets.filter((t) => t.channel === 'B2B' && t.status === 'approved') },
      { key: 'b2bRejected', title: 'B2B Rejected', tickets: tickets.filter((t) => t.channel === 'B2B' && t.status === 'rejected') },
      { key: 'b2cApproved', title: 'B2C Approved', tickets: tickets.filter((t) => t.channel === 'B2C' && t.status === 'approved') },
      { key: 'b2cRejected', title: 'B2C Rejected', tickets: tickets.filter((t) => t.channel === 'B2C' && t.status === 'rejected') },
    ],
    [tickets],
  );

  const creditNoteDisplayIds = useMemo(() => buildCreditNoteDisplayIdMap(creditNotes), [creditNotes]);

  const creditNoteReportSections = useMemo(
    () => [
      {
        key: 'cnApproved',
        title: 'Credit notes — Approved',
        notes: creditNotes.filter((n) => n.status === 'approved'),
      },
      {
        key: 'cnRejected',
        title: 'Credit notes — Rejected',
        notes: creditNotes.filter((n) => n.status === 'rejected'),
      },
    ],
    [creditNotes],
  );

  const hasReportData = tickets.length > 0 || creditNotes.length > 0;

  /** Global display IDs and per-item line numbers from full groups so B2CT1-1 / B2CT1-2 are fixed everywhere */
  const { globalDisplayIdByGroupKey, globalItemLineByItemId } = useMemo(() => {
    const allGroupsNewest = groupTickets(tickets);
    const allGroupsAsc = [...allGroupsNewest].sort((a, b) => {
      const tA = new Date(a.created_at).getTime();
      const tB = new Date(b.created_at).getTime();
      if (tA !== tB) return tA - tB; // oldest first for stable numbering
      return groupKey(a).localeCompare(groupKey(b));
    });
    const byGroupKey = new Map<string, number>();
    const byItemId = new Map<string, number>();
    const channelCounters: Record<string, number> = {};
    allGroupsAsc.forEach((g) => {
      const chan = g.channel;
      const next = (channelCounters[chan] ?? 0) + 1;
      channelCounters[chan] = next;
      byGroupKey.set(groupKey(g), next);
      const itemsSorted = [...g.items].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
      itemsSorted.forEach((item, lineIdx) => byItemId.set(item.id, lineIdx + 1));
    });
    return { globalDisplayIdByGroupKey: byGroupKey, globalItemLineByItemId: byItemId };
  }, [tickets]);

  const getDisplayId = (g: TicketGroup): string => {
    const num = globalDisplayIdByGroupKey.get(groupKey(g));
    return num != null ? `${g.channel}-${String(num).padStart(3, "0")}` : `${g.channel}-???`;
  };

  const getLineId = (displayId: string, itemId: string): string => {
    const lineNum = globalItemLineByItemId.get(itemId);
    return lineNum != null ? `${displayId}-${lineNum}` : `${displayId}-?`;
  };

  const formatCreditNoteAmount = (n: number) =>
    Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /** CSV/Excel use same global Ticket ID (B2BT1, B2CT1) and Line ID (B2CT1-1, B2CT1-2) as Reports table */
  const exportCsv = () => {
    const sections: string[] = [];
    reportSections.forEach((sec) => {
      const groups = groupTickets(sec.tickets);
      sections.push(`\n=== ${sec.title} ===`);
      sections.push(headers.join(','));
      groups.forEach((g) => {
        const displayId = getDisplayId(g);
        g.items.forEach((item) => {
          const lineId = getLineId(displayId, item.id);
          sections.push(
            rowFromGroup(g, item, displayId, lineId)
              .map((c) => `"${String(c).replace(/"/g, '""')}"`)
              .join(','),
          );
        });
      });
    });
    creditNoteReportSections.forEach((sec) => {
      sections.push(`\n=== ${sec.title} ===`);
      sections.push(creditNoteExportHeaders.join(','));
      sec.notes.forEach((n) => {
        const did = creditNoteDisplayIds.get(n.id) ?? `${CN_DISPLAY_PREFIX}-???`;
        const remarks = (n.approval_remarks ?? n.rejection_remarks ?? '').replace(/"/g, '""');
        const row = [
          did,
          n.customer_name.replace(/"/g, '""'),
          (n.market_area ?? '').replace(/"/g, '""'),
          n.delivery_date.slice(0, 10),
          formatCreditNoteAmount(n.amount),
          n.status,
          remarks,
          n.created_at,
        ];
        sections.push(row.map((c) => `"${String(c)}"`).join(','));
      });
    });
    const csv = sections.join('\n').replace(/^\n/, '');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `reports-tickets-credit-notes-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    reportSections.forEach((sec) => {
      const groups = groupTickets(sec.tickets);
      const rows: (string | number)[][] = [];
      groups.forEach((g) => {
        const displayId = getDisplayId(g);
        g.items.forEach((item) => {
          const lineId = getLineId(displayId, item.id);
          rows.push(rowFromGroup(g, item, displayId, lineId));
        });
      });
      const wsData = [headers, ...rows];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, sec.title.replace(/\s/g, '_').slice(0, 31));
    });
    creditNoteReportSections.forEach((sec) => {
      const rows: (string | number)[][] = sec.notes.map((n) => {
        const did = creditNoteDisplayIds.get(n.id) ?? `${CN_DISPLAY_PREFIX}-???`;
        return [
          did,
          n.customer_name,
          n.market_area ?? '',
          n.delivery_date.slice(0, 10),
          formatCreditNoteAmount(n.amount),
          n.status,
          n.approval_remarks ?? n.rejection_remarks ?? '',
          n.created_at,
        ];
      });
      const wsData = [creditNoteExportHeaders, ...rows];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const name = sec.title.replace(/\s/g, '_').replace(/—/g, '-').slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, name);
    });
    XLSX.writeFile(wb, `reports-tickets-credit-notes-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Reports</h2>
          <p className="text-sm text-gray-500">
            Rejection tickets (B2B/B2C), credit notes (approved & rejected), charts, and CSV/Excel export.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCsv}
            disabled={loading || !hasReportData}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Export CSV
          </button>
          <button
            onClick={exportExcel}
            disabled={loading || !hasReportData}
            className="rounded-md bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-xs text-white disabled:opacity-50"
          >
            Export Excel
          </button>
        </div>
      </div>

      {canFilterByDate && (
        <Card
          title="Date range"
          subtitle="Filters tickets and credit notes by delivery date (same as API). Managers and admins only."
          className="text-sm"
        >
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">From</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="rounded border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">To</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="rounded border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setFromDate(defaultFromDateStr());
                setToDate(defaultToDateStr());
              }}
              className="rounded-md border border-gray-300 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
            >
              Last 30 days
            </button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="text-sm text-gray-500">Loading reports…</div>
      ) : (
        <>
          {/* B2B Approved, B2B Rejected, B2C Approved, B2C Rejected */}
          {tickets.length > 0 &&
            reportSections.map((sec) => {
              const groups = groupTickets(sec.tickets);
              return (
                <Card
                  key={sec.key}
                  title={sec.title}
                  subtitle="Ticket IDs (B2BT1, B2CT1…) are fixed globally. Export matches."
                  className="text-sm"
                >
                  {groups.length === 0 ? (
                    <p className="text-xs text-gray-500 py-2">No records.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead className="bg-gray-50 text-[11px] font-medium text-gray-500 uppercase">
                          <tr>
                            <th className="px-4 py-2 text-left">Ticket ID</th>
                            <th className="px-4 py-2 text-left">Customer</th>
                            <th className="px-4 py-2 text-left">Delivery date</th>
                            <th className="px-4 py-2 text-left">Channel</th>
                            <th className="px-4 py-2 text-left">Status</th>
                            <th className="px-4 py-2 text-left">Creator reason</th>
                            <th className="px-4 py-2 text-left">Admin remark</th>
                            <th className="px-4 py-2 text-left">Created</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {groups.map((g) => {
                            const displayId = getDisplayId(g);
                            const statuses = Array.from(new Set(g.items.map((i) => i.status)));
                            const singleStatus = statuses.length === 1 ? statuses[0] : null;
                            const rowKey = `${sec.key}:${g.id}`;
                            const isExpanded = expandedGroupId === rowKey;
                            return (
                              <Fragment key={g.id}>
                                <tr
                                  role="button"
                                  tabIndex={0}
                                  className="hover:bg-gray-50 cursor-pointer"
                                  onClick={() =>
                                    setExpandedGroupId((id) => (id === rowKey ? null : rowKey))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      setExpandedGroupId((id) => (id === rowKey ? null : rowKey));
                                    }
                                  }}
                                >
                                  <td className="px-4 py-2 font-medium text-[11px] text-gray-700">
                                    {displayId}
                                  </td>
                                  <td className="px-4 py-2">{g.delivery_batch}</td>
                                  <td className="px-4 py-2">{formatDeliveryDate(g.delivery_date)}</td>
                                  <td className="px-4 py-2">
                                    <span
                                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                        g.channel === 'B2B' ? 'bg-sky-50 text-sky-700' : 'bg-orange-50 text-orange-700'
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
                                  <td
                                    className="px-4 py-2 text-[11px] text-gray-700 max-w-[160px] truncate"
                                    title={g.items.map((i) => i.reason).filter(Boolean).join(' | ') || ''}
                                  >
                                    {(() => {
                                      const s = g.items.map((i) => i.reason).filter(Boolean).join(' | ');
                                      return s.length > 60 ? `${s.slice(0, 60)}…` : s || '–';
                                    })()}
                                  </td>
                                  <td
                                    className="px-4 py-2 text-[11px] text-gray-700 max-w-[160px] truncate"
                                    title={g.items.map((i) => i.approval_remarks ?? i.rejection_remarks ?? '').filter(Boolean).join(' | ') || ''}
                                  >
                                    {(() => {
                                      const s = g.items.map((i) => i.approval_remarks ?? i.rejection_remarks ?? '').filter(Boolean).join(' | ');
                                      return s.length > 60 ? `${s.slice(0, 60)}…` : s || '–';
                                    })()}
                                  </td>
                                  <td className="px-4 py-2 text-[11px] text-gray-500">
                                    {formatDateTime(g.created_at)}
                                  </td>
                                </tr>
                                {isExpanded && (
                                  <tr className="bg-gray-50 border-l-4 border-l-indigo-300">
                                    <td colSpan={8} className="px-4 py-3 text-xs">
                                      <div className="space-y-2">
                                        <div className="font-medium text-gray-700">
                                          Products on this ticket (Ticket ID: {displayId})
                                        </div>
                                        <div className="border border-gray-200 rounded-md bg-white">
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
                                                  <td className="px-3 py-1 font-medium text-gray-700">
                                                    {getLineId(displayId, item.id)}
                                                  </td>
                                                  <td className="px-3 py-1">{item.product_name}</td>
                                                  <td className="px-3 py-1">{item.quantity}</td>
                                                  <td className="px-3 py-1">
                                                    <StatusBadge status={item.status} />
                                                  </td>
                                                  <td
                                                    className="px-3 py-1 text-gray-700 max-w-[180px]"
                                                    title={item.reason}
                                                  >
                                                    {item.reason.length > 60
                                                      ? `${item.reason.slice(0, 60)}…`
                                                      : item.reason}
                                                  </td>
                                                  <td className="px-3 py-1 text-gray-700 max-w-[180px]">
                                                    {item.approval_remarks ??
                                                      item.rejection_remarks ??
                                                      '–'}
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
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              );
            })}

          {creditNotes.length > 0 &&
            creditNoteReportSections.map((sec) => (
              <Card
                key={sec.key}
                title={sec.title}
                subtitle="B2B credit notes — IDs match the credit notes register (CN-B2B-###)."
                className="text-sm"
              >
                {sec.notes.length === 0 ? (
                  <p className="text-xs text-gray-500 py-2">No records.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50 text-[11px] font-medium text-gray-500 uppercase">
                        <tr>
                          <th className="px-4 py-2 text-left">Credit note ID</th>
                          <th className="px-4 py-2 text-left">Customer</th>
                          <th className="px-4 py-2 text-left">Market</th>
                          <th className="px-4 py-2 text-left">Delivery date</th>
                          <th className="px-4 py-2 text-right">Amount</th>
                          <th className="px-4 py-2 text-left">Status</th>
                          <th className="px-4 py-2 text-left">Remarks</th>
                          <th className="px-4 py-2 text-left">Created</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {sec.notes
                          .slice()
                          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                          .map((n) => {
                            const did = creditNoteDisplayIds.get(n.id) ?? `${CN_DISPLAY_PREFIX}-???`;
                            const remark = n.approval_remarks ?? n.rejection_remarks ?? '';
                            return (
                              <tr key={n.id} className="hover:bg-gray-50">
                                <td className="px-4 py-2 font-mono font-medium text-[11px] text-gray-800">{did}</td>
                                <td className="px-4 py-2 text-gray-900">{n.customer_name}</td>
                                <td className="px-4 py-2 text-gray-700">{n.market_area}</td>
                                <td className="px-4 py-2">{formatDeliveryDate(n.delivery_date)}</td>
                                <td className="px-4 py-2 text-right tabular-nums font-medium">
                                  {formatCreditNoteAmount(n.amount)}
                                </td>
                                <td className="px-4 py-2">
                                  <StatusBadge status={n.status} />
                                </td>
                                <td
                                  className="px-4 py-2 text-[11px] text-gray-700 max-w-[200px]"
                                  title={remark || undefined}
                                >
                                  {remark.length > 80 ? `${remark.slice(0, 80)}…` : remark || '–'}
                                </td>
                                <td className="px-4 py-2 text-[11px] text-gray-500 whitespace-nowrap">
                                  {formatDateTime(n.created_at)}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            ))}

          <Card
            title="Daily quantity (tickets)"
            subtitle={dailyChartSubtitle}
            className="min-h-[280px]"
          >
            <div className="w-full" style={{ minHeight: 256, height: 256 }}>
              {dailyQtyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyQtyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: unknown) => [Number(v ?? 0), 'Total quantity']} />
                    <Line type="monotone" dataKey="total_qty" stroke="#4f46e5" strokeWidth={2} dot={false} name="Total quantity" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-gray-500">{dailyEmptyMessage}</div>
              )}
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card
              title="B2B vs B2C comparison"
              subtitle={channelChartSubtitle}
              className="min-h-[280px]"
            >
              <div className="w-full" style={{ minHeight: 256, height: 256 }}>
                {channelComparisonData.some((d) => d.value > 0) ? (
                  <>
                    <div className="w-full" style={{ minHeight: 128, height: 128 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={channelComparisonData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="channel" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(v: unknown) => [Number(v ?? 0), 'Quantity']} />
                          <Bar dataKey="value" fill="#4f46e5" radius={[4, 4, 0, 0]} name="Quantity" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="w-full mt-2" style={{ minHeight: 128, height: 128 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={channelPieData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={30}
                            outerRadius={45}
                            paddingAngle={2}
                          >
                            {channelPieData.map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: unknown) => [Number(v ?? 0), 'Quantity']} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-gray-500">{channelEmptyMessage}</div>
                )}
              </div>
            </Card>

            <Card
              title="Approved vs Rejected quantity"
              subtitle={approvalChartSubtitle}
              className="min-h-[280px]"
            >
              <div className="w-full" style={{ minHeight: 256, height: 256 }}>
                {approvalRejectionData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={approvalRejectionData} layout="vertical" margin={{ top: 8, right: 8, left: 80, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                      <Tooltip formatter={(v: unknown) => [Number(v ?? 0), 'Quantity']} />
                      <Bar dataKey="value" fill="#22c55e" radius={[0, 4, 4, 0]} name="Quantity" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-gray-500">{approvalEmptyMessage}</div>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
