/** Time window for register lists (filters by record `created_at`). */
export type TimeRangeFilter = 'all' | 'day' | 'week' | 'month';

export const TIME_RANGE_LABELS: Record<TimeRangeFilter, string> = {
  all: 'All time',
  day: 'Previous day',
  week: 'Last 7 days',
  month: 'Last 30 days',
};

/**
 * Returns true if `isoDateString` (typically `created_at`) falls in the selected range.
 * - `day`: calendar yesterday (local)
 * - `week`: rolling last 7 days from now
 * - `month`: rolling last 30 days from now
 */
export function matchesCreatedTimeRange(isoDateString: string, range: TimeRangeFilter): boolean {
  if (range === 'all') return true;
  const d = new Date(isoDateString);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  if (range === 'day') {
    const start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return d >= start && d <= end;
  }
  if (range === 'week') {
    const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return d >= cutoff;
  }
  if (range === 'month') {
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return d >= cutoff;
  }
  return true;
}

export function uniqueSortedStrings(values: string[]): string[] {
  const set = new Set<string>();
  values.forEach((v) => {
    const t = v.trim();
    if (t) set.add(t);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}
