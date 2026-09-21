# United Kingdom — what is in, what is waiting

**In already**
- Party colours and aliases (Labour, Conservative, Reform UK, Lib Dem, Green, SNP, Plaid, DUP, Sinn Féin, SDLP, Alliance, UUP …) in `src/data/partyColors.ts`.
- Poll parsing for Wikipedia's UK table layout: `Pollster | Client | Area | Dates conducted | Sample size | party columns | Lead`
  (`Client`, `Area` and `Lead` are treated as metadata, not parties).
- Gallery race `uk-next` ("Opinion polling for the next United Kingdom general election", live fetch + bundled fallback).
  Its seed is anchored on the real 2024 vote shares and is labelled synthetic; the general-election date is a placeholder.
- Election Night shows how many regions each party currently leads (= seats on a constituency map).

**Waiting on data (same pattern as Germany / Slovakia — drop the files in the `united-states` release)**
1. 2024 general-election results by constituency (House of Commons Library CSV: one row per constituency, votes per party).
2. 2024 Westminster constituency boundaries (ONS "Westminster Parliamentary Constituencies (July 2024) Boundaries" — GeoJSON or shapefile).
Then: `scripts/prepare-uk.mjs` (join by ONS code, party-key mapping), a `uk-constituencies` preset in `src/lib/geo/presets.ts`,
and the same CI curl step as DE/SK.

**Decisions to make first**
- Northern Ireland (18 seats) has its own party system and is not covered by GB-wide polls: include as its own regional bucket, or exclude?
- Scotland/Wales: GB polls understate SNP/Plaid strength locally, so the regional lean has to carry that (it does, from the 2024 baseline).
