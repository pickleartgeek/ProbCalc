// Column-header terminology used across Wikipedia opinion-polling tables.
// Different countries/pages/editors use very different wording for the same
// four column roles, so each pattern below is intentionally broad. Shared by
// both wikitextParser.ts and plainTableParser.ts so they can't drift apart.
//
// Headers are run through normalizeHeader() FIRST, which is where most of the
// real-world mess gets absorbed: "Date(s)<br />administered", "Sample<sup>[a]</sup>
// size", "Poll&nbsp;source" and "Pollster" all reach the patterns below as
// plain lowercase words, so the patterns only have to describe vocabulary.
//
// Anything that matches none of them becomes a "party" column by default —
// so IGNORE_HEADERS in particular is worth keeping broad: an unmatched
// metadata column (margin of error, a Ref. column, turnout, "Dates updated")
// would otherwise be treated as a party's vote share, which silently corrupts
// BaseCalc's totals.

export type ColumnRole = 'firm' | 'date' | 'sample' | 'ignore' | 'others' | 'party';

/**
 * Collapses every header variant Wikipedia produces (line breaks via <br>,
 * footnote markers, <sup> refs, non-breaking spaces, "(s)" plurals) into a
 * single lowercase, single-spaced string.
 */
export function normalizeHeader(raw: string): string {
  let t = raw;
  t = t.replace(/<br\s*\/?>/gi, ' ');
  t = t.replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, '');
  t = t.replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  t = t.replace(/<[^>]+>/g, '');
  t = t.replace(/&nbsp;|&#160;|\u00a0/gi, ' ').replace(/&amp;/gi, '&').replace(/&[a-z]+dash;/gi, '-');
  t = t.replace(/\[[a-z0-9 ]{1,3}\]/gi, ''); // footnote markers: [a], [2]
  t = t.replace(/[*†‡§]+/g, '');
  t = t.replace(/\(s\)/gi, 's').replace(/\(es\)/gi, 'es'); // "Date(s)" -> "Dates"
  t = t.replace(/\s+/g, ' ').trim().toLowerCase();
  t = t.replace(/[:.]+$/, '').trim();
  return t;
}

// --- role vocabularies (all matched against normalizeHeader() output) ---------

/** "Poll source", "Pollster", "Source", "Polling firm", "Source of poll aggregation" … */
export const FIRM_HEADERS =
  /^(polling firms?( ?\/ ?(clients?|commissioners?))?|firms?|poll(ing)? ?(sources?|firms?|organi[sz]ations?|agenc(y|ies)|compan(y|ies))|pollsters?( ?\/ ?clients?)?|sources?( of poll(s|ing)?( aggregation)?)?|institutes?|research institutes?|conducted by|agenc(y|ies)|survey organi[sz]ations?|fieldwork (by|organi[sz]ation)|compan(y|ies)|organi[sz]ations?)$/i;

/** "Date(s) administered", "Dates", "Fieldwork", "Fieldwork date(s)", … */
export const DATE_HEADERS =
  /^(fieldwork( dates?| period)?|dates?( administered| conducted| of (fieldwork|poll(ing)?|survey))?|polling (period|dates?)|poll(ing)? dates?|field dates?|last date of fieldwork|survey (period|dates?)|administered|conducted|period|date (published|released)|publication date|release date)$/i;

export const SAMPLE_HEADERS =
  /^(sample ?sizes?|samples?( ?\(?[a-z]{1,3}\)?)?|no\.? of respondents( surveyed)?|respondents?|sampled|persons? polled|panel ?size|size|n)$/i;

export const IGNORE_HEADERS =
  /^(abs\.?|abstention|leads?|spreads?|margins?( of error)?|moe|±|confidence( level| interval)?|turnout|refs?\.?|references?|notes?|clients?|areas?|geograph(y|ies)|scope|type|methods?|mode|polling method|n\/a|und\.?|undecided|dk\/na|don'?t know|refused|blank\/(invalid|void)|none of the above|others?\/none|dates? updated|last updated|updated|sample type|population)$/i;

/** "Other", "Others", "Other / Undecided", "Undecided / Other" — a real party bucket (see the guide's BaseCalc sheet). */
export const OTHERS_HEADER =
  /^(others?( ?\/ ?(undecided|dk|unsure))?|others? ?(&|and) ?undecided|undecided ?\/ ?others?|others?,? ?undecided)$/i;

/**
 * Classifies one raw header cell. Order matters: metadata that merely
 * *contains* a role word ("Dates updated", "Margin of error") is ruled out
 * before the date/sample tests run.
 */
export function classifyHeader(raw: string): { role: ColumnRole; normalized: string } {
  const n = normalizeHeader(raw);
  if (n === '') return { role: 'ignore', normalized: n };
  if (IGNORE_HEADERS.test(n)) return { role: 'ignore', normalized: n };
  if (FIRM_HEADERS.test(n)) return { role: 'firm', normalized: n };
  if (DATE_HEADERS.test(n)) return { role: 'date', normalized: n };
  if (SAMPLE_HEADERS.test(n)) return { role: 'sample', normalized: n };
  if (OTHERS_HEADER.test(n)) return { role: 'others', normalized: n };
  return { role: 'party', normalized: n };
}

/** True when the roles found are enough to produce dated, weighted polls. */
export function hasRequiredColumns(roles: ColumnRole[]): boolean {
  return roles.includes('firm') && roles.includes('date');
}
