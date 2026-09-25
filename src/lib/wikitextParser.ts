import type { ParsedPollData, Party, PollRow } from './types';
import { parseOpdrtsParams, parseWikiDateRange } from './dateUtils';
import { buildPartyFromHeader, isGenericHeader, matchesCandidate, slugify, type Affiliation } from './partyColors';
import { applyPartyColors, type PartyCountry } from './partyRegistry';
import { classifyHeader, hasRequiredColumns, type ColumnRole } from './pollHeaderTerms';

/**
 * Turns one wikitext cell into plain text. Order matters: the text-wrapper templates
 * ({{nowrap|X}}, {{small|X}}, {{abbr|X|Y}}) are unwrapped BEFORE templates are stripped,
 * otherwise a pollster written as {{nowrap|Emerson College}} would come out empty.
 */
export function stripWikiMarkup(text: string): string {
  let t = text;
  t = t.replace(/<ref[^>]*\/>/gi, '');
  t = t.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  t = t.replace(/<!--[\s\S]*?-->/g, '');
  t = t.replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, ''); // footnote superscripts
  t = t.replace(/<br\s*\/?>/gi, ' ');
  t = t.replace(/\{\{efn\|[\s\S]*?\}\}/gi, '');
  for (let i = 0; i < 4; i++) {
    // {{nowrap|X}} {{small|X}} {{sort|key|X}} {{abbr|X|long}} — keep the visible text
    t = t.replace(/\{\{\s*abbr\s*\|([^|{}]*)\|[^{}]*\}\}/gi, '$1');
    t = t.replace(/\{\{\s*(?:nowrap|nobr|small|smaller|big|center|nowrap begin)\s*\|([^{}]*)\}\}/gi, '$1');
    t = t.replace(/\{\{\s*sort\s*\|[^|{}]*\|([^{}]*)\}\}/gi, '$1');
  }
  t = t.replace(/\{\{[^{}]*\}\}/g, ''); // any remaining templates carry no cell text
  t = t.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2'); // [[link|display]]
  t = t.replace(/\[\[([^\]]+)\]\]/g, '$1'); // [[link]]
  t = t.replace(/\[(?:https?:)?\/\/\S+\s+([^\]]+)\]/g, '$1'); // [https://url text] -> text
  t = t.replace(/\[(?:https?:)?\/\/\S+\]/g, ''); // bare [https://url]
  t = t.replace(/'''''/g, '').replace(/'''/g, '').replace(/''/g, '');
  t = t.replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&[a-z]+dash;/gi, '–');
  t = t.replace(/<[^>]+>/g, ''); // stray html tags
  return t.replace(/\s+/g, ' ').trim();
}

/** Extracts the last "|"-delimited segment of a cell (handles "attr | attr | content"). */
function lastPipeSegment(text: string): string {
  const placeholders: string[] = [];
  const hold = (m: string) => {
    placeholders.push(m);
    return `\u0001${placeholders.length - 1}\u0001`;
  };
  let protectedText = text;
  for (let i = 0; i < 3; i++) protectedText = protectedText.replace(/\{\{[^{}]*\}\}/g, hold);
  protectedText = protectedText.replace(/\[\[[^[\]]*\]\]/g, hold);
  const parts = protectedText.split('|');
  let last = parts[parts.length - 1];
  // placeholders may nest (a template inside a template) — unwrap until stable
  for (let i = 0; i < 4 && /\u0001\d+\u0001/.test(last); i++) {
    last = last.replace(/\u0001(\d+)\u0001/g, (_, idx) => placeholders[parseInt(idx, 10)]);
  }
  return last;
}

function extractOpdrtsDate(text: string): { start: string | null; end: string | null } | null {
  const m = text.match(/\{\{\s*opdrts\s*\|([^}]+)\}\}/i);
  return m ? parseOpdrtsParams(m[1].split('|').map((p) => p.trim())) : null;
}

/** Percentages: "48%", "48.5", "48,5" (European decimal comma). */
function toNumber(raw: string): number | null {
  const m = raw.replace(/\s/g, '').match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0].replace(',', '.'));
  return isNaN(n) ? null : n;
}

/** Sample sizes: "1,000 (LV)", "2,005", "600 (A)", "~1 200". Commas/spaces are thousands separators. */
export function toSampleSize(raw: string): number | null {
  const m = raw.match(/\d[\d,\s]*/);
  if (!m) return null;
  const n = parseInt(m[0].replace(/[,\s]/g, ''), 10);
  return isNaN(n) || n <= 0 ? null : n;
}

/** Splits a wikitable row's wikitext into individual cell strings. */
function extractRowCells(rowText: string, cellPrefix: '|' | '!'): string[] {
  const cells: string[] = [];
  const otherPrefix = cellPrefix === '|' ? '!' : '|';
  for (const rawLine of rowText.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith(cellPrefix)) continue;
    if (line.startsWith(cellPrefix + '-') || line.startsWith(cellPrefix + '}')) continue;
    const body = line.slice(cellPrefix.length);
    for (const seg of body.split(cellPrefix + cellPrefix)) cells.push(seg.trim());
  }
  return cells.filter((c) => !c.startsWith(otherPrefix));
}

/** Top-level `{| … |}` blocks. A section fetched from Wikipedia often holds several (aggregates, one per matchup, …). */
export function splitWikiTables(text: string): string[] {
  const tables: string[] = [];
  let depth = 0;
  let current: string[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t.startsWith('{|')) {
      if (depth === 0) current = [];
      depth++;
    }
    if (depth > 0) current.push(line);
    if (t.startsWith('|}') && depth > 0) {
      depth--;
      if (depth === 0) tables.push(current.join('\n'));
    }
  }
  return tables;
}

interface TableParse {
  parties: Party[];
  rows: PollRow[];
  warnings: string[];
  score: number;
  label: string;
}

interface TableContext {
  known?: KnownNominees;
  cutoffDate?: string | null;
}

function parseOneTable(tableText: string, ctx: TableContext = {}): TableParse {
  const warnings: string[] = [];
  const empty = (msg: string): TableParse => ({ parties: [], rows: [], warnings: [msg], score: -1000, label: '' });

  // blocks[0] is the "{| class=…" open line; the header row is the first block with "!" cells.
  const blocks = tableText.split(/\n\s*\|-/).map((b) => b.trim());
  if (blocks.length < 2) return empty('No "|-" row separators found — is this a wikitable?');
  const headerBlockIndex = blocks.findIndex((b) => /(^|\n)\s*!/.test(b));
  if (headerBlockIndex === -1) return empty('No header row (starting with "!") found.');

  // Skip further purely-decorative header rows (party colour swatches etc.).
  let dataStartIndex = headerBlockIndex + 1;
  while (dataStartIndex < blocks.length) {
    const b = blocks[dataStartIndex];
    if (/(^|\n)\s*!/.test(b) && !/(^|\n)\s*\|(?!\})/.test(b)) dataStartIndex++;
    else break;
  }

  const headerText = extractRowCells(blocks[headerBlockIndex], '!').map((c) => stripWikiMarkup(lastPipeSegment(c)));
  const colRoles: ColumnRole[] = [];
  const partyDefs: { colIndex: number; header: string; isOthers: boolean }[] = [];
  headerText.forEach((h, i) => {
    const { role } = classifyHeader(h);
    colRoles[i] = role;
    if (role === 'party' || role === 'others') partyDefs.push({ colIndex: i, header: role === 'others' ? 'Others' : h, isOthers: role === 'others' });
  });

  if (!hasRequiredColumns(colRoles)) {
    warnings.push(
      `Could not find the poll-source and date columns in the header (saw: ${headerText.filter(Boolean).slice(0, 6).join(' | ') || 'nothing'}). ` +
        'Recognised: Poll source / Pollster / Source / Polling firm and Date(s) administered / Dates / Fieldwork.'
    );
  }

  const seen: Partial<Record<Affiliation, number>> = {};
  const usedIds = new Set<string>();
  const parties: Party[] = partyDefs.map((p, idx) => {
    const built = buildPartyFromHeader(p.header, idx, seen);
    let id = built.id || `col${idx}`;
    while (usedIds.has(id)) id += '_';
    usedIds.add(id);
    (p as { id?: string }).id = id;
    return { ...built, id };
  });

  const rows: PollRow[] = [];
  for (let bi = dataStartIndex; bi < blocks.length; bi++) {
    const block = blocks[bi];
    if (!block || block.startsWith('}')) continue;
    const cellsRaw = extractRowCells(block, '|');
    if (cellsRaw.length === 0) continue;

    let firm = '';
    let dateRaw = '';
    let sample: number | null = null;
    let start: string | null = null;
    let end: string | null = null;
    colRoles.forEach((role, i) => {
      const raw = cellsRaw[i] ?? '';
      if (role === 'firm') firm = stripWikiMarkup(lastPipeSegment(raw));
      else if (role === 'date') {
        dateRaw = raw;
        const op = extractOpdrtsDate(raw);
        if (op) ({ start, end } = op);
      } else if (role === 'sample') sample = toSampleSize(stripWikiMarkup(lastPipeSegment(raw)));
    });

    const values: Record<string, number> = {};
    partyDefs.forEach((p, k) => {
      const v = toNumber(stripWikiMarkup(lastPipeSegment(cellsRaw[p.colIndex] ?? '')));
      if (v !== null) values[parties[k].id] = v;
    });

    const dateText = stripWikiMarkup(lastPipeSegment(dateRaw));
    if (!start && !end) ({ start, end } = parseWikiDateRange(dateText));
    if (!firm && !dateText) continue;
    if (!end && Object.keys(values).length === 0) continue; // sub-heading / note row

    const isElectionResult = sample === null && /election|result/i.test(firm);
    rows.push({
      id: `wrow-${bi}`,
      firm: firm || (isElectionResult ? 'Election result' : 'Unknown'),
      fieldworkStart: start ?? '',
      fieldworkEnd: end ?? '',
      fieldworkRaw: dateText,
      sampleSize: sample,
      values,
      isElectionResult,
    });
  }

  const cut = ctx.cutoffDate || '';
  const isPoll = (r: PollRow) => !r.isElectionResult && r.fieldworkEnd && r.sampleSize && Object.keys(r.values).length > 0;
  const usable = rows.filter((r) => isPoll(r) && (!cut || r.fieldworkEnd >= cut)).length; // polls that will actually count
  if (rows.filter((r) => !r.isElectionResult && r.fieldworkEnd).length === 0) warnings.push('No poll rows had a parseable fieldwork date.');

  // Which table is "the" polling table? Real polls with sample sizes, a D-vs-R pairing (US) and a
  // sane column count beat aggregator tables, primaries with a dozen candidates, etc.
  const hasD = parties.some((p) => p.affiliation === 'D');
  const hasR = parties.some((p) => p.affiliation === 'R');
  let score = usable + (colRoles.includes('sample') ? 5 : 0) + (hasD && hasR ? 20 : 0) - (parties.length > 6 ? 15 : 0);
  if (usable === 0) score -= 50; // aggregator tables, empty tables, tables whose every poll predates the cutoff

  // A state page holds many tables: the head-to-head between the actual nominees, hypothetical matchups with people who
  // dropped out, "vs. generic Democrat" tables. Only the first is the race. So when the caller knows the nominees, a table
  // that names both of them beats any table that doesn't, however many polls the other one has — and a table built on
  // "Generic Democrat / Generic Republican" columns is a last resort.
  const named = partyDefs.map((d, k) => ({ d, party: parties[k] })).filter((x) => !x.d.isOthers);
  // A side (D or R) whose every named column is generic makes this a "vs. generic Democrat" table. Such a table is only
  // ever a last resort, however many polls it has: it must lose to ANY table of real candidates.
  const genericOnlySide = (['D', 'R'] as const).some((aff) => {
    const side = named.filter((x) => x.party.affiliation === aff);
    return side.length > 0 && side.every((x) => isGenericHeader(x.d.header));
  });
  if (genericOnlySide) score -= 1000;
  else if (named.some((x) => isGenericHeader(x.d.header))) score -= 60; // a stray generic column beside real candidates: cheap to drop later
  const dem = ctx.known?.demCandidate, rep = ctx.known?.repCandidate;
  const wanted = (dem ? 1 : 0) + (rep ? 1 : 0);
  if (wanted > 0) {
    const hits = (dem && named.some((x) => matchesCandidate(x.party, dem)) ? 1 : 0) + (rep && named.some((x) => matchesCandidate(x.party, rep)) ? 1 : 0);
    score += hits === wanted ? 100 : hits * 40;
  }

  if (!hasRequiredColumns(colRoles)) score = -500 + usable;
  const label = hasD || hasR ? parties.filter((p) => p.affiliation).map((p) => p.shortName).join(' vs ') : parties.slice(0, 4).map((p) => p.shortName).join(' · ');
  return { parties, rows, warnings, score, label };
}

/** The real nominees, when the caller knows them (RaceDef.demCandidate / repCandidate). */
export interface KnownNominees {
  demCandidate?: string | null;
  repCandidate?: string | null;
}

export interface ParseOptions {
  /** Where the race is, when the caller knows. Otherwise it is detected from the parties themselves. */
  country?: PartyCountry;
  /** Steers which table on a multi-table page is treated as the race's polling (see parseOneTable). */
  known?: KnownNominees;
  /** Polls fielded before this ISO date won't count downstream, so they don't count towards choosing a table either. */
  cutoffDate?: string | null;
}

export function parseWikitext(raw: string, opts: ParseOptions = {}): ParsedPollData {
  const text = raw
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    // footnote superscripts like <sup>[[#Poll_source|[a]]]</sup> hold nested brackets and a "|" that would
    // otherwise be mistaken for an attribute separator when a cell is cut down to its last segment
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, '');

  let tables = splitWikiTables(text);
  if (tables.length === 0) tables = [text]; // headless paste: rows only, no {| wrapper
  const parsed = tables.map((t) => parseOneTable(t, { known: opts.known, cutoffDate: opts.cutoffDate }));
  // US state pages keep one table per matchup, and pollsters keep testing candidates who have since dropped out. Without
  // knowing the nominees, the best tell is which table is still being updated: prefer the one holding the newest polls.
  if (opts.country === 'US' && parsed.length > 1) {
    const newest = (t: TableParse) => t.rows.filter((r) => !r.isElectionResult && r.fieldworkEnd && r.sampleSize).reduce((m, r) => (r.fieldworkEnd > m ? r.fieldworkEnd : m), '');
    const latest = parsed.map(newest).reduce((m, d) => (d > m ? d : m), '');
    if (latest) parsed.forEach((t) => { const n = newest(t); if (n) t.score -= Math.min((Date.parse(latest) - Date.parse(n)) / 86_400_000, 90) * 0.5; });
  }
  let best = 0;
  parsed.forEach((t, i) => {
    if (t.score > parsed[best].score) best = i;
  });
  const chosen = parsed[best];
  const out: ParsedPollData = { parties: applyPartyColors(chosen.parties, opts.country), rows: chosen.rows, warnings: [...chosen.warnings], format: 'wikitext' };
  if (tables.length > 1) {
    out.meta = { tablesFound: tables.length, tableIndex: best, label: chosen.label };
    out.warnings.push(`Found ${tables.length} tables; using #${best + 1}${chosen.label ? ` (${chosen.label})` : ''}.`);
  }
  return out;
}

export { slugify };
