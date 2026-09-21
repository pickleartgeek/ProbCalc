import type { ParsedPollData } from './types';
import type { PartyCountry } from './partyRegistry';
import { parsePlainTable } from './plainTableParser';
import { parseWikitext } from './wikitextParser';

export function detectFormat(raw: string): 'plain' | 'wikitext' | 'unknown' {
  const trimmed = raw.trim();
  if (!trimmed) return 'unknown';
  if (/\{\|[^\n]*wikitable/i.test(trimmed) || /\n\s*\|-/.test(trimmed)) return 'wikitext';
  if (trimmed.includes('\t') || /polling firm|poll source|pollster/i.test(trimmed)) return 'plain';
  return 'unknown';
}

export function parsePollData(raw: string, opts: { country?: PartyCountry } = {}): ParsedPollData {
  const format = detectFormat(raw);
  if (format === 'wikitext') return parseWikitext(raw, opts);
  if (format === 'plain') return parsePlainTable(raw, opts);
  return { parties: [], rows: [], warnings: ['Could not detect a table format. Paste either the plain copy-pasted table or the raw wikitext source.'], format: 'unknown' };
}
