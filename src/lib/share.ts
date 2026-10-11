import type { ElectionConfig, ParsedPollData, PollRow, VotingSystem } from './types';

/**
 * Shareable race links: the loaded race (config + polls) is packed into a URL fragment so a link restores it on
 * any browser, with no server. Layout: compact JSON -> deflate-raw -> base64url. Rows are stored as arrays with
 * values in party order, which is most of the size win before compression even starts.
 *
 * Links come from anywhere (a chat message, a stranger), so decode treats the payload as untrusted: bounded
 * decompression, strict shape checks, clamped sizes, and colours/strings validated before they reach the UI.
 */

const VERSION = 1;
const MAX_INFLATED_BYTES = 2_000_000;
const MAX_ROWS = 5000;
const MAX_PARTIES = 40;
const VOTING_SYSTEMS: VotingSystem[] = ['FPTP', 'RCV', 'STAR', 'DHondt', 'PartyList'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEX = /^#[0-9a-f]{3,8}$/i;

type Packed = {
  v: number;
  c: ElectionConfig;
  f: ParsedPollData['format'];
  m?: ParsedPollData['meta'];
  /** party ids in column order for the rows below */
  p: string[];
  /** [firm, fieldworkStart, fieldworkEnd, sampleSize|null, isElectionResult(0|1), ...values (null = absent)] */
  r: (string | number | null)[][];
};

const toB64Url = (bytes: Uint8Array): string => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64Url = (s: string): Uint8Array => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit = Infinity): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  const reader = out.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) { await reader.cancel(); throw new Error('Shared race is too large'); }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { merged.set(c, off); off += c.length; }
  return merged;
}

export async function encodeRace(config: ElectionConfig, pollData: ParsedPollData): Promise<string> {
  const ids = pollData.parties.map((p) => p.id);
  const packed: Packed = {
    v: VERSION,
    c: config,
    f: pollData.format,
    m: pollData.meta,
    p: ids,
    r: pollData.rows.map((row) => [
      row.firm, row.fieldworkStart, row.fieldworkEnd, row.sampleSize, row.isElectionResult ? 1 : 0,
      ...ids.map((id) => row.values[id] ?? null),
    ]),
  };
  const json = new TextEncoder().encode(JSON.stringify(packed));
  return toB64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

const str = (x: unknown, max = 300): string => (typeof x === 'string' ? x.slice(0, max) : '');
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

function cleanParty(raw: unknown, i: number): ElectionConfig['parties'][number] {
  const p = (raw ?? {}) as Record<string, unknown>;
  const aff = p.affiliation === 'D' || p.affiliation === 'R' || p.affiliation === 'I' ? p.affiliation : undefined;
  return { id: str(p.id, 60) || `p${i}`, name: str(p.name, 120), shortName: str(p.shortName, 40), color: typeof p.color === 'string' && HEX.test(p.color) ? p.color : '#8994ac', ...(aff ? { affiliation: aff } : {}) };
}

export async function decodeRace(payload: string): Promise<{ config: ElectionConfig; pollData: ParsedPollData }> {
  let packed: Packed;
  try {
    const inflated = await pipe(fromB64Url(payload), new DecompressionStream('deflate-raw'), MAX_INFLATED_BYTES);
    packed = JSON.parse(new TextDecoder().decode(inflated));
  } catch (e) {
    if (e instanceof Error && e.message === 'Shared race is too large') throw e;
    throw new Error('This link is damaged or incomplete');
  }
  if (!packed || packed.v !== VERSION || !packed.c || !Array.isArray(packed.p) || !Array.isArray(packed.r)) throw new Error('This link was made by a different version of ProbCalc');
  if (packed.p.length > MAX_PARTIES || packed.r.length > MAX_ROWS) throw new Error('Shared race is too large');

  const c = packed.c as unknown as Record<string, unknown>;
  if (!Array.isArray(c.parties) || c.parties.length > MAX_PARTIES) throw new Error('This link is damaged or incomplete');
  const sim = (c.sim ?? {}) as Record<string, unknown>;
  const dw = (sim.dateWeighting ?? {}) as Record<string, unknown>;
  const config: ElectionConfig = {
    id: str(c.id, 80) || 'shared',
    title: str(c.title, 200) || 'Shared race',
    region: str(c.region, 120),
    electionDate: typeof c.electionDate === 'string' && ISO_DATE.test(c.electionDate) ? c.electionDate : new Date().toISOString().slice(0, 10),
    votingSystem: VOTING_SYSTEMS.includes(c.votingSystem as VotingSystem) ? (c.votingSystem as VotingSystem) : 'FPTP',
    parties: c.parties.map(cleanParty),
    sim: {
      simulations: Math.min(Math.max(num(sim.simulations) ?? 1000, 10), 20000),
      beta: Math.min(Math.max(num(sim.beta) ?? 1, 0.01), 100),
      dateWeighting: {
        enabled: dw.enabled !== false,
        divisor: Math.max(num(dw.divisor) ?? 100, 1),
        cutoffDate: typeof dw.cutoffDate === 'string' && ISO_DATE.test(dw.cutoffDate) ? dw.cutoffDate : null,
        minSampleSize: num(dw.minSampleSize) ?? undefined,
        maxSampleSize: num(dw.maxSampleSize),
        dateBasis: dw.dateBasis === 'midpoint' ? 'midpoint' : 'end',
        recencyWindowDays: num(dw.recencyWindowDays),
      },
    },
  };

  const ids = packed.p.map((x) => str(x, 60));
  const rows: PollRow[] = [];
  packed.r.forEach((r, i) => {
    if (!Array.isArray(r) || r.length < 5) return;
    const values: Record<string, number> = {};
    ids.forEach((id, k) => { const v = num(r[5 + k]); if (v !== null && v >= 0 && v <= 100) values[id] = v; });
    const start = typeof r[1] === 'string' && ISO_DATE.test(r[1]) ? r[1] : '';
    const end = typeof r[2] === 'string' && ISO_DATE.test(r[2]) ? r[2] : '';
    rows.push({ id: `r${i}`, firm: str(r[0], 120), fieldworkStart: start, fieldworkEnd: end, fieldworkRaw: end, sampleSize: num(r[3]), values, ...(r[4] === 1 ? { isElectionResult: true } : {}) });
  });

  const byId = new Map(config.parties.map((p) => [p.id, p]));
  const pollParties = ids.map((id, i) => byId.get(id) ?? cleanParty({ id, name: id }, i));
  const pollData: ParsedPollData = { parties: pollParties, rows, warnings: [], format: packed.f === 'wikitext' || packed.f === 'plain' ? packed.f : 'unknown' };
  return { config, pollData };
}

/** Full shareable URL for a race, honouring wherever the app is hosted (GitHub Pages subpath etc.). */
export const shareUrl = (payload: string): string => `${location.origin}${location.pathname}#/r/${payload}`;
