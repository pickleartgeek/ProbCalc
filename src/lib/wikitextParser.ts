import type { ParsedPollData, Party, PollRow } from './types';
import { parseOpdrtsParams, parseWikiDateRange } from './dateUtils';
import { assignColor, slugify } from './partyColors';

const IGNORE_HEADERS = /^(abs\.?|abstention|lead|undecided|others?\/none|und\.?)$/i;
const FIRM_HEADERS = /^(polling firm|firm|pollster|institute)$/i;
const DATE_HEADERS = /^(fieldwork date|date|fieldwork)$/i;
const SAMPLE_HEADERS = /^(sample\s*size|sample)$/i;
const OTHERS_HEADER = /^others?$/i;

function stripWikiMarkup(text: string): string {
  let t = text;
  t = t.replace(/<ref[^>]*\/>/gi, '');
  t = t.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  t = t.replace(/<!--[\s\S]*?-->/g, '');
  t = t.replace(/\{\{efn\|[\s\S]*?\}\}/gi, '');
  t = t.replace(/\{\{abbr\|([^|{}]+)\|[^{}]*\}\}/gi, '$1'); // {{abbr|Abs.|Abstention}} -> Abs.
  t = t.replace(/\{\{[^{}]*\}\}/g, ''); // strip any remaining templates entirely
  t = t.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2'); // [[link|display]]
  t = t.replace(/\[\[([^\]]+)\]\]/g, '$1'); // [[link]]
  t = t.replace(/'''''/g, '').replace(/'''/g, '').replace(/''/g, '');
  t = t.replace(/<[^>]+>/g, ''); // stray html tags
  return t.trim();
}

/** Extracts the last "|"-delimited segment of a cell (handles "attr | attr | content"). */
function lastPipeSegment(text: string): string {
  // Protect template calls {{...}} and wikilinks [[...]] from naive splitting on "|"
  const placeholders: string[] = [];
  let protectedText = text.replace(/\{\{[^{}]*\}\}/g, (m) => {
    placeholders.push(m);
    return `\u0001${placeholders.length - 1}\u0001`;
  });
  protectedText = protectedText.replace(/\[\[[^[\]]*\]\]/g, (m) => {
    placeholders.push(m);
    return `\u0001${placeholders.length - 1}\u0001`;
  });
  const parts = protectedText.split('|');
  let last = parts[parts.length - 1];
  last = last.replace(/\u0001(\d+)\u0001/g, (_, idx) => placeholders[parseInt(idx, 10)]);
  return last;
}

function extractOpdrtsDate(text: string): { start: string | null; end: string | null } | null {
  const m = text.match(/\{\{\s*opdrts\s*\|([^}]+)\}\}/i);
  if (!m) return null;
  const params = m[1].split('|').map((p) => p.trim());
  return parseOpdrtsParams(params);
}

function toNumber(raw: string): number | null {
  const c = raw.replace(',', '.').trim();
  if (c === '' || c === '–' || c === '-' || c === '—') return null;
  const n = parseFloat(c);
  return isNaN(n) ? null : n;
}

/** Sample sizes use commas as thousands separators ("2,005" = 2005), never decimals. */
function toSampleSize(raw: string): number | null {
  const c = raw.replace(/,/g, '').trim();
  if (c === '' || c === '–' || c === '-' || c === '—') return null;
  const n = parseInt(c, 10);
  return isNaN(n) ? null : n;
}

/** Splits a wikitable row's wikitext into individual cell strings. */
function extractRowCells(rowText: string, cellPrefix: '|' | '!'): string[] {
  const cells: string[] = [];
  const lines = rowText.split('\n');
  const otherPrefix = cellPrefix === '|' ? '!' : '|';
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith(cellPrefix)) continue;
    if (line.startsWith(cellPrefix + '-') || line.startsWith(cellPrefix + '}')) continue;
    const doubleSep = cellPrefix + cellPrefix;
    // remove leading marker
    const body = line.slice(cellPrefix.length);
    const segments = body.split(doubleSep);
    for (const seg of segments) cells.push(seg.trim());
  }
  return cells.filter((c) => !c.startsWith(otherPrefix));
}

export function parseWikitext(raw: string): ParsedPollData {
  const warnings: string[] = [];
  let text = raw;
  text = text.replace(/<ref[^>]*\/>/gi, '');
  text = text.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // Split the table into row blocks on "|-". blocks[0] is everything before the first
  // row marker (the "{| class=..." open line); the real header row is whichever block
  // after that contains "!"-prefixed cells.
  const blocks = text.split(/\n\s*\|-/).map((b) => b.trim());
  if (blocks.length < 2) {
    return { parties: [], rows: [], warnings: ['No "|-" row separators found — is this a wikitable?'], format: 'wikitext' };
  }

  let headerBlockIndex = -1;
  for (let i = 0; i < blocks.length; i++) {
    if (/(^|\n)\s*!/.test(blocks[i])) {
      headerBlockIndex = i;
      break;
    }
  }
  if (headerBlockIndex === -1) {
    return { parties: [], rows: [], warnings: ['No header row (starting with "!") found.'], format: 'wikitext' };
  }

  // Skip any additional purely-decorative header rows (e.g. party colour swatch rows)
  // that follow immediately — they have "!" cells but no "|" data cells.
  let dataStartIndex = headerBlockIndex + 1;
  while (dataStartIndex < blocks.length) {
    const b = blocks[dataStartIndex];
    const hasHeaderMarker = /(^|\n)\s*!/.test(b);
    const hasDataMarker = /(^|\n)\s*\|(?!\})/.test(b);
    if (hasHeaderMarker && !hasDataMarker) {
      dataStartIndex++;
      continue;
    }
    break;
  }

  const headerCellsRaw = extractRowCells(blocks[headerBlockIndex], '!');
  const headerCells = headerCellsRaw.map((c) => stripWikiMarkup(lastPipeSegment(c)));

  const colRoles: ('firm' | 'date' | 'sample' | 'ignore' | 'party')[] = [];
  const partyDefs: { colIndex: number; name: string }[] = [];
  headerCells.forEach((h, i) => {
    const clean = h.trim();
    if (FIRM_HEADERS.test(clean)) colRoles[i] = 'firm';
    else if (DATE_HEADERS.test(clean)) colRoles[i] = 'date';
    else if (SAMPLE_HEADERS.test(clean)) colRoles[i] = 'sample';
    else if (IGNORE_HEADERS.test(clean) || clean === '') colRoles[i] = 'ignore';
    else {
      colRoles[i] = 'party';
      partyDefs.push({ colIndex: i, name: OTHERS_HEADER.test(clean) ? 'Others' : clean });
    }
  });

  if (!colRoles.includes('firm') || !colRoles.includes('date')) {
    warnings.push('Could not confidently find "Polling firm" and "Fieldwork date" columns in the wikitext header.');
  }

  const parties: Party[] = partyDefs.map((p, idx) => {
    const id = slugify(p.name);
    return { id, name: p.name, shortName: p.name.length > 6 ? p.name.slice(0, 6) : p.name, color: assignColor(idx, p.name) };
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
    const values: Record<string, number> = {};

    colRoles.forEach((role, i) => {
      const raw = cellsRaw[i] ?? '';
      if (role === 'firm') firm = stripWikiMarkup(lastPipeSegment(raw));
      else if (role === 'date') {
        dateRaw = raw;
        const opdrts = extractOpdrtsDate(raw);
        if (opdrts) {
          start = opdrts.start;
          end = opdrts.end;
        }
      } else if (role === 'sample') sample = toSampleSize(stripWikiMarkup(lastPipeSegment(raw)));
    });

    partyDefs.forEach((p) => {
      const raw = cellsRaw[p.colIndex] ?? '';
      const cleaned = stripWikiMarkup(lastPipeSegment(raw));
      const v = toNumber(cleaned);
      if (v !== null) values[slugify(p.name)] = v;
    });

    if (!start && !end) {
      const cleanedDate = stripWikiMarkup(dateRaw);
      const parsed = parseWikiDateRange(cleanedDate);
      start = parsed.start;
      end = parsed.end;
    }

    if (!firm && !dateRaw) continue;
    const isElectionResult = sample === null && /election/i.test(firm);

    rows.push({
      id: `wrow-${bi}`,
      firm: firm || (isElectionResult ? 'Election result' : 'Unknown'),
      fieldworkStart: start ?? '',
      fieldworkEnd: end ?? '',
      fieldworkRaw: stripWikiMarkup(dateRaw),
      sampleSize: sample,
      values,
      isElectionResult,
    });
  }

  if (rows.filter((r) => !r.isElectionResult && r.fieldworkEnd).length === 0) {
    warnings.push('No poll rows had a parseable fieldwork date.');
  }

  return { parties, rows, warnings, format: 'wikitext' };
}
