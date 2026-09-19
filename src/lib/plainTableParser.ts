import type { ParsedPollData, Party, PollRow } from './types';
import { parseWikiDateRange } from './dateUtils';
import { assignColor, slugify } from './partyColors';

const IGNORE_HEADERS = /^(abs\.?|abstention|lead|undecided|others?\/none|und\.?)$/i;
const FIRM_HEADERS = /^(polling firm|firm|pollster|institute)$/i;
const DATE_HEADERS = /^(fieldwork date|date|fieldwork)$/i;
const SAMPLE_HEADERS = /^(sample\s*size|sample)$/i;
const OTHERS_HEADER = /^others?$/i;

function splitLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t');
  // fallback: 2+ spaces as a column separator
  return line.split(/ {2,}/);
}

function cleanCell(raw: string): string {
  return raw
    .replace(/\[[a-z0-9]+\]/gi, '') // footnote markers [a], [2]
    .replace(/\[\d+\]/g, '')
    .trim();
}

function toNumber(raw: string): number | null {
  const c = cleanCell(raw).replace(',', '.');
  if (c === '' || c === '–' || c === '-' || c === '—') return null;
  const n = parseFloat(c);
  return isNaN(n) ? null : n;
}

/** Sample sizes use commas as thousands separators ("2,005" = 2005), never decimals. */
function toSampleSize(raw: string): number | null {
  const c = cleanCell(raw).replace(/,/g, '');
  if (c === '' || c === '–' || c === '-' || c === '—') return null;
  const n = parseInt(c, 10);
  return isNaN(n) ? null : n;
}

export function parsePlainTable(raw: string): ParsedPollData {
  const warnings: string[] = [];
  const lines = raw.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim() !== '');
  if (lines.length < 2) {
    return { parties: [], rows: [], warnings: ['Not enough rows found.'], format: 'plain' };
  }

  const headerCells = splitLine(lines[0]).map((h) => cleanCell(h));
  const colRoles: ('firm' | 'date' | 'sample' | 'ignore' | 'party')[] = [];
  const partyDefs: { colIndex: number; name: string }[] = [];

  headerCells.forEach((h, i) => {
    if (FIRM_HEADERS.test(h)) colRoles[i] = 'firm';
    else if (DATE_HEADERS.test(h)) colRoles[i] = 'date';
    else if (SAMPLE_HEADERS.test(h)) colRoles[i] = 'sample';
    else if (IGNORE_HEADERS.test(h)) colRoles[i] = 'ignore';
    else {
      colRoles[i] = 'party';
      partyDefs.push({ colIndex: i, name: OTHERS_HEADER.test(h) ? 'Others' : h });
    }
  });

  if (!colRoles.includes('firm') || !colRoles.includes('date')) {
    warnings.push('Could not confidently find "Polling firm" and "Fieldwork date" columns — check the header row.');
  }

  const parties: Party[] = partyDefs.map((p, idx) => {
    const id = slugify(p.name);
    return { id, name: p.name, shortName: p.name.length > 6 ? p.name.slice(0, 6) : p.name, color: assignColor(idx, p.name) };
  });

  const rows: PollRow[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cells = splitLine(lines[li]).map((c) => cleanCell(c));
    if (cells.every((c) => c === '')) continue;

    let firm = '';
    let dateRaw = '';
    let sample: number | null = null;
    const values: Record<string, number> = {};

    colRoles.forEach((role, i) => {
      const cell = cells[i] ?? '';
      if (role === 'firm') firm = cell;
      else if (role === 'date') dateRaw = cell;
      else if (role === 'sample') sample = toSampleSize(cell);
    });

    partyDefs.forEach((p) => {
      const v = toNumber(cells[p.colIndex] ?? '');
      if (v !== null) values[slugify(p.name)] = v;
    });

    if (!firm && !dateRaw) continue;

    const { start, end } = parseWikiDateRange(dateRaw);
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
    warnings.push('No poll rows had a parseable fieldwork date — dates may need a year, e.g. "23 Feb 2025".');
  }

  return { parties, rows, warnings, format: 'plain' };
}
