import type { ParsedPollData, Party, PollRow } from './types';
import { parseWikiDateRange } from './dateUtils';
import { buildPartyFromHeader, type Affiliation } from './partyColors';
import { applyPartyColors, type PartyCountry } from './partyRegistry';
import { classifyHeader, hasRequiredColumns, type ColumnRole } from './pollHeaderTerms';
import { toSampleSize } from './wikitextParser';

/**
 * Tab-separated reader that understands quoted cells — Google Sheets wraps a cell holding a
 * line break (a "Date(s)\nadministered" header, say) in double quotes, which a naive
 * split('\n') would tear in two.
 */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === '\t') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function splitLine(line: string): string[] {
  return line.includes('\t') ? line.split('\t') : line.split(/ {2,}/); // 2+ spaces as a fallback separator
}

function cleanCell(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\[[a-z0-9]{1,3}\]/gi, '') // footnote markers [a], [2]
    .replace(/\s+/g, ' ')
    .trim();
}

function toNumber(raw: string): number | null {
  const m = cleanCell(raw).replace(/\s/g, '').match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0].replace(',', '.'));
  return isNaN(n) ? null : n;
}

export function parsePlainTable(raw: string, opts: { country?: PartyCountry } = {}): ParsedPollData {
  const warnings: string[] = [];
  const rawRows = raw.includes('\t') ? parseTsv(raw) : raw.split(/\r?\n/).filter((l) => l.trim() !== '').map(splitLine);
  if (rawRows.length < 2) return { parties: [], rows: [], warnings: ['Not enough rows found.'], format: 'plain' };

  // The header is the first of the opening lines that has BOTH a poll-source and a date column
  // (so a pasted page title or caption above the table doesn't derail parsing).
  let headerIdx = 0;
  for (let i = 0; i < Math.min(rawRows.length, 8); i++) {
    if (hasRequiredColumns(rawRows[i].map((h) => classifyHeader(cleanCell(h)).role))) { headerIdx = i; break; }
  }
  const headerCells = rawRows[headerIdx].map(cleanCell);
  const colRoles: ColumnRole[] = [];
  const partyDefs: { colIndex: number; header: string }[] = [];
  headerCells.forEach((h, i) => {
    const { role } = classifyHeader(h);
    colRoles[i] = role;
    if (role === 'party' || role === 'others') partyDefs.push({ colIndex: i, header: role === 'others' ? 'Others' : h });
  });
  if (!hasRequiredColumns(colRoles)) {
    warnings.push(
      `Could not find the poll-source and date columns in the header (saw: ${headerCells.filter(Boolean).slice(0, 6).join(' | ')}). ` +
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
    return { ...built, id };
  });

  const rows: PollRow[] = [];
  for (let li = headerIdx + 1; li < rawRows.length; li++) {
    const cells = rawRows[li].map(cleanCell);
    if (cells.every((c) => c === '')) continue;

    let firm = '';
    let dateRaw = '';
    let sample: number | null = null;
    colRoles.forEach((role, i) => {
      const cell = cells[i] ?? '';
      if (role === 'firm') firm = cell;
      else if (role === 'date') dateRaw = cell;
      else if (role === 'sample') sample = toSampleSize(cell);
    });
    const values: Record<string, number> = {};
    partyDefs.forEach((p, k) => {
      const v = toNumber(cells[p.colIndex] ?? '');
      if (v !== null) values[parties[k].id] = v;
    });
    if (!firm && !dateRaw) continue;

    const { start, end } = parseWikiDateRange(dateRaw);
    if (!end && Object.keys(values).length === 0) continue;
    const isElectionResult = sample === null && /election|result/i.test(firm);
    rows.push({
      id: `row-${li}`,
      firm: firm || (isElectionResult ? 'Election result' : 'Unknown'),
      fieldworkStart: start ?? '',
      fieldworkEnd: end ?? '',
      fieldworkRaw: dateRaw,
      sampleSize: sample,
      values,
      isElectionResult,
    });
  }
  if (rows.filter((r) => !r.isElectionResult && r.fieldworkEnd).length === 0) {
    warnings.push('No poll rows had a parseable fieldwork date — dates may need a year, e.g. "23 Feb 2025" or "Sep 2–5, 2024".');
  }
  return { parties: applyPartyColors(parties, opts.country), rows, warnings, format: 'plain' };
}
