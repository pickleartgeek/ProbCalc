const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function monthIndex(m: string): number | null {
  const key = m.slice(0, 3).toLowerCase();
  return key in MONTHS ? MONTHS[key] : null;
}

const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const WEEKDAY = /\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(day|sday|nesday|rsday|urday)?\b\.?,?/gi;

function toIso(year: number, month: number | null, day: number): string | null {
  if (month === null) return null;
  const d = new Date(Date.UTC(year, month, day));
  // reject roll-over ("31 Feb" would silently become 3 Mar)
  if (isNaN(d.getTime()) || d.getUTCMonth() !== month || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

function cleanDateText(raw: string): string {
  let t = raw;
  t = t.replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  t = t.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '');
  t = t.replace(/\[[^\]]*\]/g, ''); // footnote markers [a], [12]
  t = t.replace(/&nbsp;|&#160;|\u00a0/gi, ' ').replace(/&[a-z]+dash;/gi, '-');
  t = t.replace(/[\u2010-\u2015\u2212]/g, '-'); // en/em dashes, minus
  t = t.replace(/\s+(to|through|thru)\s+/gi, '-');
  t = t.replace(WEEKDAY, ' ');
  t = t.replace(/(\d)(st|nd|rd|th)\b/gi, '$1');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

/**
 * Parses messy Wikipedia-style date ranges — both the European day-first form
 * ("23 Feb 2025", "21–22 Feb 2025", "30 Mar–2 Apr 2025") and the US
 * month-first form ("Sep 2–5, 2024", "Aug 30 – Sep 2, 2024", "Oct 30–Nov 1,
 * 2024", "Dec 28, 2023 – Jan 3, 2024"), plus ISO dates. Returns the start and
 * END date of the range (the guide uses the latest date as the reference
 * fieldwork date, since that's closer to publication).
 */
export function parseWikiDateRange(raw: string): { start: string | null; end: string | null } {
  const none = { start: null, end: null };
  if (!raw) return none;
  const text = cleanDateText(raw);
  if (!text || /^-+$/.test(text)) return none;
  const mi = (m?: string) => (m ? monthIndex(m) : null);
  let m: RegExpMatchArray | null;

  // ISO: 2024-09-02 or 2024-09-02 - 2024-09-05
  m = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s*-\s*(\d{4})-(\d{2})-(\d{2}))?$/);
  if (m) {
    const s = toIso(+m[1], +m[2] - 1, +m[3]);
    const e = m[4] ? toIso(+m[4], +m[5] - 1, +m[6]) : s;
    return s && e ? { start: s, end: e } : none;
  }

  // Month-first (US): "Sep 2-5, 2024" | "Aug 30 - Sep 2, 2024" | "Dec 28, 2023 - Jan 3, 2024" | "Sep 2, 2024"
  m = text.match(new RegExp(`^${MON}\\s+(\\d{1,2})(?:\\s*,?\\s*(\\d{4}))?\\s*-\\s*(?:${MON}\\s+)?(\\d{1,2})\\s*,?\\s*(\\d{4})$`, 'i'));
  if (m) {
    const [, mon1, d1, y1, mon2, d2, y2] = m;
    const endYear = +y2;
    const endMonth = mi(mon2) ?? mi(mon1);
    const startMonth = mi(mon1);
    let startYear = y1 ? +y1 : endYear;
    let start = toIso(startYear, startMonth, +d1);
    const end = toIso(endYear, endMonth, +d2);
    if (!y1 && start && end && start > end) {
      startYear -= 1; // "Dec 28 - Jan 3, 2024" -> Dec 28 of the year before
      start = toIso(startYear, startMonth, +d1);
    }
    return start && end ? { start, end } : none;
  }
  m = text.match(new RegExp(`^${MON}\\s+(\\d{1,2})\\s*,?\\s*(\\d{4})$`, 'i'));
  if (m) {
    const iso = toIso(+m[3], mi(m[1]), +m[2]);
    return iso ? { start: iso, end: iso } : none;
  }
  // "Sep 2024" — month only: pin to the 15th so it sits mid-month.
  m = text.match(new RegExp(`^${MON}\\s+(\\d{4})$`, 'i'));
  if (m) {
    const iso = toIso(+m[2], mi(m[1]), 15);
    return iso ? { start: iso, end: iso } : none;
  }

  // Day-first, cross-year: "28 Dec 2023 - 3 Jan 2024"
  m = text.match(new RegExp(`^(\\d{1,2})\\s*${MON}\\s*(\\d{4})\\s*-\\s*(\\d{1,2})\\s*${MON}\\s*(\\d{4})$`, 'i'));
  if (m) {
    const start = toIso(+m[3], mi(m[2]), +m[1]);
    const end = toIso(+m[6], mi(m[5]), +m[4]);
    return start && end ? { start, end } : none;
  }
  // Day-first: "21-22 Feb 2025" | "30 Mar-2 Apr 2025" | "23 Feb 2025"
  m = text.match(new RegExp(`^(\\d{1,2})(?:\\s*${MON})?(?:\\s*-\\s*(\\d{1,2}))?\\s*${MON}\\s*(\\d{4})$`, 'i'));
  if (m) {
    const [, d1, monA, d2, monB, y] = m;
    const endMonth = mi(monB);
    const startMonth = monA ? mi(monA) : endMonth;
    const start = toIso(+y, startMonth, +d1);
    const end = toIso(+y, endMonth, d2 ? +d2 : +d1);
    return start && end ? { start, end } : none;
  }

  // Last resort: the original tolerant matcher (kept so nothing that parsed before stops parsing).
  const full = text.match(/(\d{1,2})\s*([A-Za-z]{3,})?\s*-?\s*(\d{1,2})?\s*([A-Za-z]{3,})?\s*(\d{4})/);
  if (!full) return none;
  const [, d1, mon1, d2, mon2, yearStr] = full;
  const year = parseInt(yearStr, 10);
  const endMonth = mon2 ? monthIndex(mon2) : mon1 ? monthIndex(mon1) : null;
  const startMonth = mon1 ? monthIndex(mon1) : endMonth;
  if (endMonth === null) return none;
  const end = toIso(year, endMonth, d2 ? parseInt(d2, 10) : parseInt(d1, 10));
  const start = toIso(year, startMonth ?? endMonth, parseInt(d1, 10));
  return { start, end };
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
