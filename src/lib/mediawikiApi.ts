// Thin client for the MediaWiki Action API (https://www.mediawiki.org/wiki/API:Action_API),
// used to pull a page's "Opinion polling" section straight from Wikipedia instead
// of copy-pasting it by hand. Runs entirely client-side — the API supports CORS
// via the `origin=*` param, so no backend/proxy is needed.

export interface WikiSection {
  index: string; // section index, or "" for the lead section
  line: string; // section heading text (HTML-stripped)
  level: string; // "2", "3", ...
}

export interface WikiPollingFetchResult {
  wikitext: string;
  sectionTitle: string;
  pageTitle: string;
  wiki: string;
}

function apiUrl(wiki: string, params: Record<string, string>): string {
  const usp = new URLSearchParams({ format: 'json', origin: '*', ...params });
  return `https://${wiki}/w/api.php?${usp.toString()}`;
}

async function apiGet<T = any>(wiki: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(apiUrl(wiki, params));
  if (!res.ok) throw new Error(`MediaWiki API request failed: ${res.status} ${res.statusText}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.info || 'MediaWiki API error');
  return data;
}

/** Lists a page's sections (action=parse&prop=sections). */
export async function listSections(pageTitle: string, wiki = 'en.wikipedia.org'): Promise<WikiSection[]> {
  const data = await apiGet(wiki, { action: 'parse', page: pageTitle, prop: 'sections' });
  return (data.parse?.sections ?? []).map((s: any) => ({
    index: String(s.index),
    line: stripHtml(String(s.line)),
    level: String(s.level),
  }));
}

/** Fetches raw wikitext for one section (or the whole page if sectionIndex is omitted). */
export async function fetchWikitext(
  pageTitle: string,
  sectionIndex?: string,
  wiki = 'en.wikipedia.org'
): Promise<string> {
  const params: Record<string, string> = { action: 'parse', page: pageTitle, prop: 'wikitext' };
  if (sectionIndex !== undefined) params.section = sectionIndex;
  const data = await apiGet(wiki, params);
  const wikitext = data.parse?.wikitext?.['*'];
  if (typeof wikitext !== 'string') throw new Error(`No wikitext returned for "${pageTitle}"`);
  return wikitext;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').trim();
}

const POLLING_SECTION_RE = /opinion poll|polling|poll aggregation/i;

/**
 * Convenience helper for the common case: given an election/race page title,
 * find its "Opinion polling" (or similarly-named) section and return that
 * section's wikitext, ready to hand to wikitextParser.ts / parsePollData().
 * Falls back to the full page's wikitext if no matching heading is found —
 * the existing parser already tolerates extra surrounding content.
 */
export async function fetchWikipediaPolling(
  pageTitle: string,
  wiki = 'en.wikipedia.org',
  sectionHint?: string
): Promise<WikiPollingFetchResult> {
  const sections = await listSections(pageTitle, wiki);

  let match: WikiSection | undefined;
  if (sectionHint) {
    const hint = sectionHint.toLowerCase();
    match = sections.find((s) => s.line.toLowerCase().includes(hint));
  }
  if (!match) {
    match = sections.find((s) => POLLING_SECTION_RE.test(s.line));
  }

  if (match) {
    const wikitext = await fetchWikitext(pageTitle, match.index, wiki);
    return { wikitext, sectionTitle: match.line, pageTitle, wiki };
  }

  // No obviously-named section — hand back the whole page and let the
  // existing parser find the table; still useful for smaller/simpler pages.
  const wikitext = await fetchWikitext(pageTitle, undefined, wiki);
  return { wikitext, sectionTitle: '(full page — no polling section heading found)', pageTitle, wiki };
}
