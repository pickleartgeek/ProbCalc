/** "01001-10 JONES COMM_ CTR_" -> { county: "01001", name: "10 Jones Comm Ctr" } — the ids are FIPS-prefixed and shouty. */
export function prettyPrecinctId(id: string): { county?: string; name: string } {
  const m = id.match(/^(\d{5})-(.*)$/);
  const raw = (m ? m[2] : id).replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const name = raw === raw.toUpperCase() ? raw.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()) : raw;
  return { county: m?.[1], name: name || id };
}
