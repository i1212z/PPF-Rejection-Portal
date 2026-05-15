import type { B2cFyMonthName } from './b2cFiscal';
import { B2C_FY_MONTHS } from './b2cFiscal';

export interface B2CWorkbookSheet {
  name: string;
  rows: string[][];
  row_count: number;
  column_count: number;
}

export interface MonthlyPoint {
  sheet: string;
  location: string;
  month: B2cFyMonthName;
  orders: number;
  amount: number;
  avgBillValue: number;
}

function normalizeCell(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseNum(raw: string | undefined): number | null {
  const text = (raw ?? '').replace(/,/g, '').replace(/[^\d.-]/g, '').trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function isLikelyTotalLabel(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === 'total' || v === 'grand total' || v === 'totals';
}

/** Trailing workbook summary rows (e.g. HAMPER SALES, TOTAL B2C Share). */
export function isWorkbookSummaryRow(row: string[]): boolean {
  const first = String(row[0] ?? '').trim().toUpperCase();
  const joined = row.map((c) => String(c ?? '').trim()).join(' ');
  if (first.includes('HAMPER SALES')) return true;
  if (/TOTAL.*B2C\s*SHARE/i.test(joined)) return true;
  if (first.includes('TOTAL') && /B2C\s*SHARE/i.test(joined)) return true;
  return false;
}

function isBlankRow(row: string[]): boolean {
  return row.every((c) => {
    const normalized = String(c || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\t/g, ' ')
      .trim();
    return normalized === '';
  });
}

/** Sheet preview rows: drop blanks; on first sheet drop summary footer rows. */
export function filterWorkbookDisplayRows(sheetIndex: number, rows: string[][]): string[][] {
  const compact = rows.filter((r) => !isBlankRow(r));
  if (sheetIndex !== 0) return compact;
  return compact.filter((r) => !isWorkbookSummaryRow(r));
}

export function extractMonthlyPoints(sheet: B2CWorkbookSheet): MonthlyPoint[] {
  const rows = sheet.rows ?? [];
  if (rows.length === 0) return [];

  let monthHeaderIdx = -1;
  for (let r = 0; r < Math.min(rows.length, 30); r += 1) {
    const cells = rows[r] ?? [];
    const seen = new Set<B2cFyMonthName>();
    for (const cell of cells) {
      const n = normalizeCell(cell);
      for (const m of B2C_FY_MONTHS) {
        if (n.includes(m.toLowerCase())) seen.add(m);
      }
    }
    if (seen.size >= 4) {
      monthHeaderIdx = r;
      break;
    }
  }
  if (monthHeaderIdx < 0) return [];

  const monthHeader = rows[monthHeaderIdx] ?? [];
  const subHeader = rows[monthHeaderIdx + 1] ?? [];
  const monthPositions: Array<{ month: B2cFyMonthName; col: number }> = [];
  B2C_FY_MONTHS.forEach((m) => {
    const idx = monthHeader.findIndex((c) => normalizeCell(c).includes(m.toLowerCase()));
    if (idx >= 0) monthPositions.push({ month: m, col: idx });
  });
  monthPositions.sort((a, b) => a.col - b.col);
  if (monthPositions.length === 0) return [];

  const findByKeyword = (cells: string[], keyword: string): number =>
    cells.findIndex((c) => normalizeCell(c).includes(keyword));

  let locationCol = findByKeyword(subHeader, 'location');
  if (locationCol < 0) locationCol = findByKeyword(monthHeader, 'location');
  if (locationCol < 0) locationCol = 0;

  let avgBillCol = findByKeyword(subHeader, 'avgbill');
  if (avgBillCol < 0) avgBillCol = findByKeyword(monthHeader, 'avgbill');
  if (avgBillCol < 0 && rows[monthHeaderIdx + 2]) {
    avgBillCol = findByKeyword(rows[monthHeaderIdx + 2], 'avgbill');
  }

  const points: MonthlyPoint[] = [];
  const dataStart = monthHeaderIdx + 2;
  for (let r = dataStart; r < rows.length; r += 1) {
    const row = rows[r] ?? [];
    const location = (row[locationCol] ?? row[0] ?? '').trim();
    if (!location || isLikelyTotalLabel(location) || isWorkbookSummaryRow(row)) continue;

    monthPositions.forEach((entry, idx) => {
      const endCol = idx < monthPositions.length - 1 ? monthPositions[idx + 1].col - 1 : row.length - 1;
      let orderCol = -1;
      let amountCol = -1;
      for (let c = entry.col; c <= endCol; c += 1) {
        const sh = normalizeCell(subHeader[c] ?? '');
        if (orderCol < 0 && sh.includes('order')) orderCol = c;
        if (amountCol < 0 && sh.includes('amount')) amountCol = c;
      }
      if (orderCol < 0 && entry.col + 1 <= endCol) orderCol = entry.col + 1;
      if (amountCol < 0 && entry.col + 2 <= endCol) amountCol = entry.col + 2;

      const orders = orderCol >= 0 ? parseNum(row[orderCol]) : null;
      const amount = amountCol >= 0 ? parseNum(row[amountCol]) : null;
      if (orders === null && amount === null) return;

      const avgRaw = avgBillCol >= 0 ? parseNum(row[avgBillCol]) : null;
      const avg = avgRaw ?? (orders && orders > 0 && amount !== null ? amount / orders : 0);
      points.push({
        sheet: sheet.name,
        location,
        month: entry.month,
        orders: Number(orders ?? 0),
        amount: Number(amount ?? 0),
        avgBillValue: Number(avg ?? 0),
      });
    });
  }
  return points;
}
