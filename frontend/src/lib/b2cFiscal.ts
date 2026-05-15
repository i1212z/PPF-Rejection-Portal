/** Indian financial year: April → March */

export const B2C_FY_MONTHS = [
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
  'January',
  'February',
  'March',
] as const;

export type B2cFyMonthName = (typeof B2C_FY_MONTHS)[number];

export type FiscalYearId = 'FY25-26' | 'FY26-27';

export const FISCAL_YEAR_OPTIONS: { id: FiscalYearId; label: string; startYear: number; endYear: number }[] = [
  { id: 'FY25-26', label: 'FY 2025-26 (workbook: Apr 2025 – Mar 2026)', startYear: 2025, endYear: 2026 },
  { id: 'FY26-27', label: 'FY 2026-27 (daily entries: Apr 2026 – Mar 2027)', startYear: 2026, endYear: 2027 },
];

export type CompareMode =
  | 'previous_month'
  | 'previous_quarter'
  | 'previous_half'
  | 'previous_year'
  | 'previous_fiscal_year'
  | 'pick_month'
  | 'none';

export const COMPARE_MODE_LABELS: Record<CompareMode, string> = {
  previous_month: 'Previous month',
  previous_quarter: 'Previous quarter (3 months)',
  previous_half: 'Previous half-year (6 months)',
  previous_year: 'Same month last year',
  previous_fiscal_year: 'Previous full financial year (12 months)',
  pick_month: 'Pick a month to compare',
  none: 'No comparison',
};

const MONTH_TO_CAL: Record<B2cFyMonthName, number> = {
  April: 4,
  May: 5,
  June: 6,
  July: 7,
  August: 8,
  September: 9,
  October: 10,
  November: 11,
  December: 12,
  January: 1,
  February: 2,
  March: 3,
};

const CAL_TO_MONTH: Record<number, B2cFyMonthName> = Object.fromEntries(
  Object.entries(MONTH_TO_CAL).map(([k, v]) => [v, k]),
) as Record<number, B2cFyMonthName>;

export function calendarMonthForFyMonth(_fy: FiscalYearId, month: B2cFyMonthName): number {
  return MONTH_TO_CAL[month];
}

export function calendarYearForFyMonth(fy: FiscalYearId, month: B2cFyMonthName): number {
  const cfg = FISCAL_YEAR_OPTIONS.find((f) => f.id === fy)!;
  const calMonth = MONTH_TO_CAL[month];
  return calMonth >= 4 ? cfg.startYear : cfg.endYear;
}

export function ymKey(year: number, calMonth: number): string {
  return `${year}-${String(calMonth).padStart(2, '0')}`;
}

export function parseYmKey(key: string): { year: number; calMonth: number } {
  const [y, m] = key.split('-');
  return { year: Number(y), calMonth: Number(m) };
}

export function monthNameFromCalMonth(calMonth: number): B2cFyMonthName {
  return CAL_TO_MONTH[calMonth] ?? 'April';
}

export function fyMonthKeysForYear(fy: FiscalYearId): { key: string; year: number; calMonth: number; month: B2cFyMonthName; label: string }[] {
  return B2C_FY_MONTHS.map((month) => {
    const year = calendarYearForFyMonth(fy, month);
    const calMonth = MONTH_TO_CAL[month];
    return {
      key: ymKey(year, calMonth),
      year,
      calMonth,
      month,
      label: `${month} ${year}`,
    };
  });
}

/** Which FY label applies to a calendar month (for defaults). */
export function fiscalYearForDate(d: Date): FiscalYearId {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (y < 2026 || (y === 2026 && m < 4)) return 'FY25-26';
  return 'FY26-27';
}

export function defaultFocusYmKey(today = new Date()): string {
  return ymKey(today.getFullYear(), today.getMonth() + 1);
}

export function addCalendarMonths(year: number, calMonth: number, delta: number): { year: number; calMonth: number } {
  const d = new Date(year, calMonth - 1 + delta, 1);
  return { year: d.getFullYear(), calMonth: d.getMonth() + 1 };
}

/** Fiscal quarter 1–4 (Q1 = Apr–Jun). */
export function fiscalQuarterForMonth(month: B2cFyMonthName): number {
  const idx = B2C_FY_MONTHS.indexOf(month);
  return Math.floor(idx / 3) + 1;
}

export function monthsInFiscalQuarter(fy: FiscalYearId, quarter: number): { year: number; calMonth: number }[] {
  const startIdx = (quarter - 1) * 3;
  return B2C_FY_MONTHS.slice(startIdx, startIdx + 3).map((m) => ({
    year: calendarYearForFyMonth(fy, m),
    calMonth: MONTH_TO_CAL[m],
  }));
}

export function comparisonPeriodKeys(
  focusYear: number,
  focusCalMonth: number,
  mode: CompareMode,
  pickYm: string | null,
): { keys: string[]; label: string } {
  const focusMonth = monthNameFromCalMonth(focusCalMonth);
  const fy = fiscalYearForDate(new Date(focusYear, focusCalMonth - 1, 15));

  if (mode === 'none') {
    return { keys: [], label: '—' };
  }
  if (mode === 'previous_month') {
    const prev = addCalendarMonths(focusYear, focusCalMonth, -1);
    return {
      keys: [ymKey(prev.year, prev.calMonth)],
      label: `${monthNameFromCalMonth(prev.calMonth)} ${prev.year}`,
    };
  }
  if (mode === 'previous_year') {
    return {
      keys: [ymKey(focusYear - 1, focusCalMonth)],
      label: `${focusMonth} ${focusYear - 1}`,
    };
  }
  if (mode === 'pick_month' && pickYm) {
    const p = parseYmKey(pickYm);
    return {
      keys: [pickYm],
      label: `${monthNameFromCalMonth(p.calMonth)} ${p.year}`,
    };
  }
  if (mode === 'previous_quarter') {
    const q = fiscalQuarterForMonth(focusMonth);
    const prevQ = q === 1 ? 4 : q - 1;
    let useFy: FiscalYearId = fy;
    if (q === 1) {
      useFy = fy === 'FY26-27' ? 'FY25-26' : 'FY25-26';
    }
    const months = monthsInFiscalQuarter(useFy, prevQ);
    return {
      keys: months.map((m) => ymKey(m.year, m.calMonth)),
      label: `Previous quarter (Q${prevQ}, ${useFy})`,
    };
  }
  if (mode === 'previous_half') {
    const idx = B2C_FY_MONTHS.indexOf(focusMonth);
    const inH2 = idx >= 6;
    const prevHalfStart = inH2 ? 0 : 6;
    let useFy: FiscalYearId = fy;
    if (!inH2) {
      useFy = fy === 'FY26-27' ? 'FY25-26' : 'FY25-26';
    }
    const slice = B2C_FY_MONTHS.slice(prevHalfStart, prevHalfStart + 6);
    const keys = slice.map((m) => ymKey(calendarYearForFyMonth(useFy, m), MONTH_TO_CAL[m]));
    const halfLabel = prevHalfStart === 0 ? 'H1 (Apr–Sep)' : 'H2 (Oct–Mar)';
    return { keys, label: `Previous ${halfLabel}, ${useFy}` };
  }
  if (mode === 'previous_fiscal_year') {
    const prevFy: FiscalYearId = fy === 'FY26-27' ? 'FY25-26' : 'FY25-26';
    const keys = fyMonthKeysForYear(prevFy).map((o) => o.key);
    return { keys, label: FISCAL_YEAR_OPTIONS.find((f) => f.id === prevFy)?.label ?? prevFy };
  }
  return { keys: [], label: '—' };
}

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
