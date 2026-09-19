const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function monthIndex(m: string): number | null {
  const key = m.slice(0, 3).toLowerCase();
  return key in MONTHS ? MONTHS[key] : null;
}

/**
 * Parses messy Wikipedia-style date ranges like:
 *  "23 Feb 2025", "21–22 Feb 2025", "9–20 Feb 2025", "30 Mar–2 Apr 2025"
 * Returns the END date of the range (the guide uses the latest date as the reference
 * fieldwork date, since that's closer to publication).
 */
export function parseWikiDateRange(raw: string): { start: string | null; end: string | null } {
  if (!raw) return { start: null, end: null };
  let text = raw.replace(/\[.*?\]/g, '').trim(); // strip footnote refs like [a]
  text = text.replace(/–/g, '-').replace(/—/g, '-');
  if (!text || text === '-' || /^–?\s*$/.test(text)) return { start: null, end: null };

  // Pattern: "D1-D2 Mon Year" or "D1 Mon-D2 Mon Year" or "D Mon Year"
  const full = text.match(/(\d{1,2})\s*([A-Za-z]{3,})?\s*-?\s*(\d{1,2})?\s*([A-Za-z]{3,})?\s*(\d{4})/);
  if (!full) return { start: null, end: null };

  const [, d1, mon1, d2, mon2, yearStr] = full;
  const year = parseInt(yearStr, 10);
  const endMonth = mon2 ? monthIndex(mon2) : mon1 ? monthIndex(mon1) : null;
  const startMonth = mon1 ? monthIndex(mon1) : endMonth;

  if (endMonth === null) return { start: null, end: null };

  const endDay = d2 ? parseInt(d2, 10) : parseInt(d1, 10);
  const startDay = parseInt(d1, 10);

  const end = new Date(Date.UTC(year, endMonth, endDay));
  const start = new Date(Date.UTC(year, startMonth ?? endMonth, startDay));

  return {
    start: isNaN(start.getTime()) ? null : start.toISOString().slice(0, 10),
    end: isNaN(end.getTime()) ? null : end.toISOString().slice(0, 10),
  };
}

/** Parses a {{opdrts|d1|d2|Mon|Year|year}}-style template's inner params (already split on |). */
export function parseOpdrtsParams(params: string[]): { start: string | null; end: string | null } {
  // Common forms: {{opdrts|21|22|Feb|2025|year}} -> d1,d2,Mon,Year
  //               {{opdrts|30|Mar|2|Apr|2025|year}} -> d1,Mon1,d2,Mon2,Year (cross-month)
  const nums = params.filter((p) => /^\d{1,2}$/.test(p));
  const months = params.filter((p) => monthIndex(p) !== null);
  const yearP = params.find((p) => /^\d{4}$/.test(p));
  if (!yearP) return { start: null, end: null };
  const year = parseInt(yearP, 10);

  if (months.length >= 2 && nums.length >= 2) {
    // cross-month range: d1 Mon1 - d2 Mon2 year
    const m1 = monthIndex(months[0])!;
    const m2 = monthIndex(months[1])!;
    const start = new Date(Date.UTC(year, m1, parseInt(nums[0], 10)));
    const end = new Date(Date.UTC(year, m2, parseInt(nums[1], 10)));
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }
  if (months.length >= 1 && nums.length >= 2) {
    const m = monthIndex(months[0])!;
    const start = new Date(Date.UTC(year, m, parseInt(nums[0], 10)));
    const end = new Date(Date.UTC(year, m, parseInt(nums[1], 10)));
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }
  if (months.length >= 1 && nums.length === 1) {
    const m = monthIndex(months[0])!;
    const d = new Date(Date.UTC(year, m, parseInt(nums[0], 10)));
    const iso = d.toISOString().slice(0, 10);
    return { start: iso, end: iso };
  }
  return { start: null, end: null };
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso + 'T00:00:00Z').getTime();
  const to = new Date(toIso + 'T00:00:00Z').getTime();
  return Math.round((to - from) / 86400000);
}
