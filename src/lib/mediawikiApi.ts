// Client for the MediaWiki Action API (https://www.mediawiki.org/wiki/API:Action_API), used to pull a page's
// polling section straight from Wikipedia. Runs entirely client-side (CORS via `origin=*`, no custom headers
// so requests stay "simple" and skip the preflight), and is equally usable from Node (scripts/fetch-polls.mts).
//
// It is built to fail well: every request has a timeout, transient failures (429, 5xx, maxlag, timeouts) are
// retried with backoff, and every failure is classified so the UI can say what happened and fall back to a
// cached copy (see races/loader.ts) instead of showing a blank card.

export interface WikiSection {
  index: string; // section index, or "" for the lead section
  line: string; // heading text (HTML-stripped)
  level: string; // "2", "3", ...
  number: string; // TOC number, e.g. "6.2.1" — encodes ancestry
}

export interface WikiPollingFetchResult {
  wikitext: string;
  sectionTitle: string;
  pageTitle: string;
  wiki: string;
  /** set when the requested title didn't exist and a search result was used instead */
  resolvedFrom?: string;
}

export type WikiFailureKind = 'timeout' | 'network' | 'rate-limit' | 'http' | 'api' | 'missing-page' | 'no-table';

export class WikiFetchError extends Error {
  kind: WikiFailureKind;
  status?: number;
  constructor(kind: WikiFailureKind, message: string, status?: number) {
    super(message);
    this.name = 'WikiFetchError';
    this.kind = kind;
    this.status = status;
  }
}

export interface WikiRequestOptions {
  timeoutMs?: number;
  /** extra attempts after the first for transient failures */
  retries?: number;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function apiUrl(wiki: string, params: Record<string, string>): string {
  const usp = new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', redirects: '1', ...params });
  return `https://${wiki}/w/api.php?${usp.toString()}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function apiGet(wiki: string, params: Record<string, string>, opts: WikiRequestOptions = {}): Promise<any> {
  const { timeoutMs = 12_000, retries = 2, fetchImpl = fetch, signal, sleep = defaultSleep } = opts;
  let lastErr: WikiFetchError | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);
    const onAbort = () => ctrl.abort();
    signal?.addEventListener('abort', onAbort);
    try {
      const res = await fetchImpl(apiUrl(wiki, params), { signal: ctrl.signal });
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers?.get?.('retry-after'));
        lastErr = new WikiFetchError(res.status === 429 ? 'rate-limit' : 'http', `MediaWiki API returned ${res.status}`, res.status);
        if (attempt < retries) { await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(5000, retryAfter * 1000) : 600 * 2 ** attempt); continue; }
        throw lastErr;
      }
      if (!res.ok) throw new WikiFetchError('http', `MediaWiki API request failed: ${res.status} ${res.statusText}`, res.status);
      const data = await res.json();
      if (data.error) {
        const code = String(data.error.code ?? '');
        if (code === 'missingtitle' || code === 'invalidtitle') throw new WikiFetchError('missing-page', data.error.info || 'Page not found');
        if (code === 'ratelimited' || code === 'maxlag') {
          lastErr = new WikiFetchError('rate-limit', data.error.info || 'Rate limited');
          if (attempt < retries) { await sleep(600 * 2 ** attempt); continue; }
          throw lastErr;
        }
        throw new WikiFetchError('api', data.error.info || `MediaWiki API error (${code})`);
      }
      return data;
    } catch (e) {
      if (e instanceof WikiFetchError) throw e;
      if (signal?.aborted && !timedOut) throw new WikiFetchError('network', 'Request cancelled');
      lastErr = timedOut
        ? new WikiFetchError('timeout', `Wikipedia did not answer within ${Math.round(timeoutMs / 1000)}s`)
        // in a browser a CORS block, an offline device and a DNS failure are all the same opaque TypeError
        : new WikiFetchError('network', 'Could not reach Wikipedia (offline, blocked, or CORS)');
      if (attempt < retries) { await sleep(500 * 2 ** attempt); continue; }
      throw lastErr;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
  throw lastErr ?? new WikiFetchError('network', 'Request failed');
}

/** Lists a page's sections (action=parse&prop=sections). */
export async function listSections(pageTitle: string, wiki = 'en.wikipedia.org', opts?: WikiRequestOptions): Promise<{ title: string; sections: WikiSection[] }> {
  const data = await apiGet(wiki, { action: 'parse', page: pageTitle, prop: 'sections' }, opts);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sections: WikiSection[] = (data.parse?.sections ?? []).map((s: any) => ({
    index: String(s.index), line: stripHtml(String(s.line)), level: String(s.level), number: String(s.number ?? ''),
  }));
  return { title: String(data.parse?.title ?? pageTitle), sections };
}

/** Fetches raw wikitext for one section (or the whole page if sectionIndex is omitted). */
export async function fetchWikitext(pageTitle: string, sectionIndex?: string, wiki = 'en.wikipedia.org', opts?: WikiRequestOptions): Promise<string> {
  const params: Record<string, string> = { action: 'parse', page: pageTitle, prop: 'wikitext' };
  if (sectionIndex !== undefined) params.section = sectionIndex;
  const data = await apiGet(wiki, params, opts);
  const w = data.parse?.wikitext;
  const wikitext = typeof w === 'string' ? w : w?.['*']; // formatversion=2 vs legacy shape
  if (typeof wikitext !== 'string') throw new WikiFetchError('api', `No wikitext returned for "${pageTitle}"`);
  return wikitext;
}

/** Best-match page title via search — rescues a slightly-off title ("…for the next Slovak election"). */
export async function searchTitle(query: string, wiki = 'en.wikipedia.org', opts?: WikiRequestOptions): Promise<string | null> {
  const data = await apiGet(wiki, { action: 'query', list: 'search', srsearch: query, srlimit: '3', srnamespace: '0' }, opts);
  return data.query?.search?.[0]?.title ?? null;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').trim();
}

const POLLING_SECTION_RE = /opinion poll|polling|poll aggregation|polls?$/i;
const NOT_GENERAL_RE = /primary|primaries|runoff|run-off|caucus|convention|nominat|straw|endorse/i;

/**
 * Orders candidate sections best-first. A US race page has polling sections under the primaries AND under
 * "General election"; the general-election one wins because its ancestry says so. Ancestry comes from the
 * TOC number ("6.2.1" sits under "6.2" and "6"), and MediaWiki returns a parent section together with all
 * of its subsections, so a parent scores at least as well as its children.
 */
export function rankPollingSections(sections: WikiSection[], sectionHint?: string): WikiSection[] {
  const byNumber = new Map(sections.map((s) => [s.number, s]));
  const ancestors = (s: WikiSection) => {
    const out: WikiSection[] = [];
    const parts = s.number.split('.');
    for (let i = parts.length - 1; i >= 1; i--) { const a = byNumber.get(parts.slice(0, i).join('.')); if (a) out.push(a); }
    return out;
  };
  const hint = sectionHint?.toLowerCase();
  return sections
    .map((s, order) => {
      const chain = [s, ...ancestors(s)];
      let score = 0;
      if (hint && s.line.toLowerCase().includes(hint)) score += 50;
      if (POLLING_SECTION_RE.test(s.line)) score += 10;
      else score -= 100; // not a polling heading at all
      if (chain.some((c) => /general election/i.test(c.line))) score += 8;
      if (chain.some((c) => NOT_GENERAL_RE.test(c.line))) score -= 12;
      score -= Number(s.level) * 0.1; // ties: prefer the shallower (parent) section
      return { s, score, order };
    })
    .filter((x) => x.score > -50)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((x) => x.s);
}

/**
 * Given an election/race page title, find its polling section and return that section's wikitext, ready for
 * parsePollData(). Tries up to `maxCandidates` ranked sections until one actually holds a table, falls back to
 * the whole page when no heading matches, and resolves a missing title through search when `searchQuery` is given.
 */
export async function fetchWikipediaPolling(
  pageTitle: string,
  wiki = 'en.wikipedia.org',
  sectionHint?: string,
  opts?: WikiRequestOptions & { searchQuery?: string; maxCandidates?: number }
): Promise<WikiPollingFetchResult> {
  let title = pageTitle;
  let resolvedFrom: string | undefined;
  let listed: { title: string; sections: WikiSection[] };
  try {
    listed = await listSections(title, wiki, opts);
  } catch (e) {
    if (!(e instanceof WikiFetchError) || e.kind !== 'missing-page' || !opts?.searchQuery) throw e;
    const found = await searchTitle(opts.searchQuery, wiki, opts);
    if (!found) throw e;
    resolvedFrom = pageTitle;
    title = found;
    listed = await listSections(title, wiki, opts);
  }
  const ranked = rankPollingSections(listed.sections, sectionHint).slice(0, opts?.maxCandidates ?? 3);
  for (const sec of ranked) {
    const wikitext = await fetchWikitext(listed.title, sec.index, wiki, opts);
    if (wikitext.includes('{|')) return { wikitext, sectionTitle: sec.line, pageTitle: listed.title, wiki, resolvedFrom };
  }
  // No obviously-named section with a table: hand back the whole page; the parser picks the best table.
  const wikitext = await fetchWikitext(listed.title, undefined, wiki, opts);
  return { wikitext, sectionTitle: '(full page — no polling section found)', pageTitle: listed.title, wiki, resolvedFrom };
}
