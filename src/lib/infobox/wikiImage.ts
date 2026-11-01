// Finds a person's (or party's) lead image on Wikipedia, the way a Wikipedia infobox would use it. Client-side via the
// MediaWiki Action API (CORS through `origin=*`, no custom headers, so no preflight) — the same access pattern as
// mediawikiApi.ts. Returns the Commons file name too, because that is what `| image1 = …` wants in the wikitext.

export interface WikiImage {
  /** matched article title — shown so a wrong match (a namesake) is obvious */
  title: string;
  /** thumbnail URL on upload.wikimedia.org */
  url: string;
  /** Commons file name, e.g. "Jon Ossoff 2021.jpg" */
  file: string;
  pageUrl: string;
}

export type FetchLike = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

/** "Jon Ossoff (D)" -> "Jon Ossoff"; "Sir Keir Starmer, Labour" -> unchanged apart from the trailing party tag. */
export function cleanPersonName(raw: string): string {
  return raw.replace(/\s*\([A-Za-z]{1,4}\)\s*$/, '').replace(/\s+/g, ' ').trim();
}

interface PageHit { title?: string; index?: number; fullurl?: string; pageimage?: string; thumbnail?: { source?: string } }

export function wikiImageUrl(query: string, wiki = 'en.wikipedia.org', thumb = 280): string {
  const p = new URLSearchParams({
    action: 'query', format: 'json', origin: '*', generator: 'search', gsrsearch: query, gsrlimit: '5', gsrnamespace: '0',
    prop: 'pageimages|info', piprop: 'thumbnail|name', pithumbsize: String(thumb), inprop: 'url',
  });
  return `https://${wiki}/w/api.php?${p}`;
}

/** Best image-bearing hit for `query`: the highest-ranked search result that has a lead image. null = nothing found / offline. */
export async function fetchWikiImage(query: string, fetchImpl: FetchLike = (u) => fetch(u), wiki = 'en.wikipedia.org'): Promise<WikiImage | null> {
  const q = query.trim();
  if (!q) return null;
  try {
    const res = await fetchImpl(wikiImageUrl(q, wiki));
    if (!res.ok) return null;
    const body = (await res.json()) as { query?: { pages?: Record<string, PageHit> } };
    const hits = Object.values(body.query?.pages ?? {}).sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
    const hit = hits.find((h) => h.thumbnail?.source && h.pageimage);
    if (!hit) return null;
    return { title: hit.title ?? q, url: hit.thumbnail!.source!, file: hit.pageimage!.replace(/_/g, ' '), pageUrl: hit.fullurl ?? `https://${wiki}/wiki/${encodeURIComponent((hit.title ?? q).replace(/ /g, '_'))}` };
  } catch {
    return null;
  }
}
