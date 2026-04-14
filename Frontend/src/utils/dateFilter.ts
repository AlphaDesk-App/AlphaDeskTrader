export type DateRange = 'today' | 'yesterday' | 'this_week' | 'last_7' | 'last_week' | 'this_month' | 'last_month' | 'ytd' | 'custom';

export interface DateFilter {
  range: DateRange;
  customStart?: string;
  customEnd?: string;
}

export function getDateBounds(filter: DateFilter): { start: Date; end: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (filter.range) {
    case 'today':      return { start: today, end: now };
    case 'yesterday': {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      const ye = new Date(today); ye.setMilliseconds(-1);
      return { start: y, end: ye };
    }
    case 'this_week': {
      const s = new Date(today); s.setDate(today.getDate() - today.getDay());
      return { start: s, end: now };
    }
    case 'last_7': {
      const s = new Date(today); s.setDate(today.getDate() - 7);
      return { start: s, end: now };
    }
    case 'last_week': {
      const s = new Date(today); s.setDate(today.getDate() - today.getDay() - 7);
      const e = new Date(today); e.setDate(today.getDate() - today.getDay()); e.setMilliseconds(-1);
      return { start: s, end: e };
    }
    case 'this_month': {
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
    }
    case 'last_month': {
      return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59) };
    }
    case 'ytd': {
      return { start: new Date(now.getFullYear(), 0, 1), end: now };
    }
    case 'custom': {
      const s = filter.customStart ? new Date(filter.customStart) : today;
      const e = filter.customEnd   ? new Date(filter.customEnd + 'T23:59:59') : now;
      return { start: s, end: e };
    }
    default: return { start: today, end: now };
  }
}

export function filterByDate<T>(items: T[], getTime: (item: T) => string | null, filter: DateFilter): T[] {
  const { start, end } = getDateBounds(filter);
  return items.filter(item => {
    const t = getTime(item);
    if (!t) return false;
    const d = new Date(t);
    return d >= start && d <= end;
  });
}

export const DATE_RANGE_LABELS: Record<DateRange, string> = {
  today: 'Today', yesterday: 'Yesterday', this_week: 'This Week',
  last_7: 'Last 7 Days', last_week: 'Last Week', this_month: 'This Month',
  last_month: 'Last Month', ytd: 'YTD', custom: 'Custom Date',
};
