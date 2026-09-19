// Column-header terminology used across Wikipedia opinion-polling tables.
// Different countries/pages/editors use very different wording for the same
// four column roles, so each list below is intentionally broad. Shared by
// both wikitextParser.ts and plainTableParser.ts so they can't drift apart.
//
// Anything that matches none of these becomes a "party" column by default
// (see PARTY_ROLE fallback in each parser) — so IGNORE_HEADERS in particular
// is worth keeping broad: an unmatched metadata column (margin of error,
// a Ref. column, turnout) would otherwise get treated as a party's vote
// share, which silently corrupts BaseCalc's totals.

export const FIRM_HEADERS =
  /^(polling firms?|firms?|pollsters?|institutes?|polling organi[sz]ations?(\s*\/\s*clients?)?|polling organi[sz]ation|conducted by|agenc(y|ies)|polling agenc(y|ies)|research institutes?|survey organi[sz]ations?|fieldwork (by|organi[sz]ation)|sources?|company|companies|polls?ter\/client)$/i;

export const DATE_HEADERS =
  /^(fieldwork dates?|fieldwork period|fieldwork|dates?( ?\(?s\)?)?|date\(?s\)? conducted|dates? administered|polling period|poll(ing)? dates?|field dates?|last date of fieldwork|survey period|administered|conducted|period)$/i;

export const SAMPLE_HEADERS =
  /^(sample ?sizes?|samples?|no\.? of respondents( surveyed)?|respondents?|sampled|persons? polled|panel ?size|size|n)$/i;

export const IGNORE_HEADERS =
  /^(abs\.?|abstention|leads?|spreads?|margins?( of error)?|moe|confidence( level| interval)?|turnout|refs?\.?|references?|notes?|clients?|type|methods?|mode|polling method|n\/a|und\.?|undecided|dk\/na|don'?t know|refused|blank\/(invalid|void)|none of the above|others?\/none)$/i;

export const OTHERS_HEADER = /^others?$/i;
