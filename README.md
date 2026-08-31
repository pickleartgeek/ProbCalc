# ProbCalc Engine

A web app version of the ProbCalc election-modeling workflow: paste a Wikipedia polling
table, get a weighted BaseCalc aggregate, then run a gamma-distribution Monte Carlo
ProbCalc simulation with a scenario browser, a Wikipedia-infobox generator, a live
precinct-playback election night, a polling world map, and a trend tracker.

## Pages

- **Home** — hero + tracked-race ticker + pre-made country cards (with decorative mosaic
  backgrounds in each country's party colors)
- **Build** — paste Wikipedia polling data (plain copy-paste *or* raw wikitext source),
  auto-detects the format, parses firm/date/sample/party columns, lets you edit party
  names/colors/short codes, set the election date, voting system, and date-weighting
  divisor, then runs BaseCalc
- **Results** — BaseCalc/ProbCalc toggle, donut chart, %/win-probability list, an
  abstract "district mosaic" placeholder map, simulation controls (simulation count,
  gamma β), and a "log snapshot" button that feeds the Tracker page
- **Scenarios** — browse every individual ProbCalc simulation outcome, filter by winner,
  margin type (Plurality/Majority/Supermajority), and "upsets only"
- **Infobox** — generates a Wikipedia-style results infobox from either the BaseCalc
  aggregate or any single scenario. Branches by voting system: FPTP/RCV/STAR get the
  classic two-nominee head-to-head layout (popular vote, percentage, swing); D'Hondt/
  Party List get a hemicycle + seats table layout. Both support optional "previous %"
  inputs to compute real ▲/▼ swing arrows, and both embed the district mosaic as the
  infobox's "results map" section, matching how real Wikipedia infoboxes are laid out
- **Election Night** — a simulated precinct-by-precinct playback seeded from your
  BaseCalc weights, with play/pause/speed controls, a live-updating tally, and a call
- **Gallery** — country picker shell with mosaic-background cards; currently just points
  back to Build (no pre-baked datasets loaded yet — see Next steps)
- **World map** — a real world map (actual country borders, not a placeholder) colored by
  which party/candidate is currently leading in each tracked race. Hover or tap a country
  for details. Only shows country-level leader; district-level detail lives on each
  race's own Results page map
- **Tracker** — line-chart trends of BaseCalc poll aggregate and ProbCalc win probability
  over time, per race, with a toggle to flip between the two. Your own built races show
  up here once you've logged at least one snapshot from the Results page; the four seed
  races (Germany/US/Bulgaria/Slovakia) show clearly-labeled synthetic example trends so
  the page isn't empty on first visit

### About the map(s)

Three different "map" concepts live in this app, intentionally:

1. **District mosaic** (`PlaceholderMap`) — an abstract grid of tiles allocated
   proportionally to vote share/win probability, used on Election Night, the Infobox,
   and Results for any race that isn't the real United States. Not real geography.
2. **World map** (`WorldMap.tsx`) — a *real* map using actual country border data
   (`world-atlas`'s 110m topojson, bundled locally in `src/data/`, no runtime network
   fetch) rendered with `d3-geo` + `topojson-client`.
3. **US precinct map** (`USPrecinctMap.tsx`) — real 2024 precinct-level geometry and
   results, wired into the *regular* Results view whenever `config.region === 'United
   States'` (no separate tab). National choropleth (`us-atlas` states-10m + real
   per-state vote totals) as the entry view; click a state to drill into its actual
   precincts, loaded on demand from `public/data/precincts/<STATE>.json`. The
   `base`/`prob` toggle switches between real 2024 returns and a fresh **precinct-level
   ProbCalc simulation** — an independent gamma draw per precinct (`simulatePrecinct` in
   `src/lib/precinct/results.ts`), using that precinct's own real vote count as the
   BaseCalc alpha input. This is the guide's II.II math applied at precinct scale
   instead of national-poll scale; a "Draw new simulation" button re-rolls it.

   `public/data/precincts/` ships all 50 states + DC (163,925 real precincts, ~605MB
   total, largest single file ~51MB) split from the full NYT precinct file via
   `scripts/split-precincts-by-state.mjs` — a streaming converter built specifically
   because the source file (640MB decompressed) is too large for `JSON.parse` or a
   naive in-memory pass; see that script's header comment for the two-pass /
   disk-spill approach and why it's structured that way. `scripts/enrich-manifest.mjs`
   adds real per-state vote totals to `manifest.json` for the national choropleth's
   coloring, as a fast second pass over the (much smaller) per-state outputs.

- **ProbCalc**: `src/lib/gamma.ts` (Marsaglia-Tsang gamma sampling) + `src/lib/probCalc.ts`
  (runs N simulations, tracks winner + margin type per run). This samples directly from
  the Gamma distribution rather than inverting `GAMMA.INV(RAND(); ...)`, which is
  equivalent but avoids needing an inverse-gamma CDF in the browser.
- **World map**: `src/data/countries-110m.json` is a copy of `world-atlas`'s bundled
  110m-resolution topojson (committed to source so the build doesn't depend on
  `node_modules` staying intact). `WorldMap.tsx` converts it to GeoJSON with
  `topojson-client`, projects it with `d3-geo`'s `geoNaturalEarth1`, and colors each
  country by matching its ISO 3166-1 numeric code (`isoNumeric` on `TrackedRace` in
  `seedData.ts`) against the currently tracked races.
- **Precinct engine** (`src/lib/precinct/`, `src/components/precinct/PrecinctCanvas.tsx`):
  a separate rendering path built for real precinct-scale maps — tens of thousands of
  polygons, up to 100k+ — where `WorldMap`'s SVG-per-country approach would fall over.
  Not wired to any specific dataset yet; `PrecinctLab.tsx` (nav: "Precinct Lab") is the
  stress-test/demo harness proving it holds up, with a live perf readout.

  **The Germany grid** (`scripts/generate-germany-grid.mjs`, `germanyGrid.ts`,
  loaded by default in Precinct Lab) is a worked example end to end: Germany's real
  boundary (`scripts/data/germany.geojson`, simplified from a GADM source via
  `mapshaper`) is projected into a true spherical Lambert Azimuthal Equal-Area space
  centered on Germany (`scripts/laea.mjs` / `src/lib/precinct/laea.ts` — 1 projected
  unit = 1 km by construction, so no calibration step is needed), tiled with exact
  1.889502580045870167 km squares (chosen so 100,000 of them equal Germany's real
  357,022 km² area), and each candidate cell is tested against the real border with
  an even-odd point-in-polygon test across all ~2,449 boundary points. That test is
  the expensive part (~5s for ~156k candidates) and runs once, offline; the output
  is just 100k `[x, y]` centers in km-space (~1.8MB). At runtime, `germanyGrid.ts`
  reconstructs each square's 4 corners and inverse-projects them back to lon/lat —
  cheap, and the only thing that needs to happen in the browser. Result: 99,696
  squares actually land inside the border (99.7% of the target 100,000, the gap
  being ordinary fixed-grid boundary rounding), covering 355,937 km² against
  Germany's official 357,022 km².


## Next steps / ideas

- Real per-country GeoJSON district maps (swap into `PlaceholderMap`'s slot) — separate
  from the world map above, which already uses real country-level geography
- Pre-baked datasets for the Gallery countries (Germany/US/Bulgaria/Slovakia)
- **A dedicated US midterms page** — charts, graphs, and fundamentals-based insights
  specifically for the upcoming US midterms (Senate/House/Governors), pulling together
  BaseCalc aggregates across many individual races into one overview. Flagged as a
  future item, not started yet.
- Wire the World map and Tracker together more tightly — e.g. clicking a country on the
  World map could jump to that race's Tracker card or Results page directly
- RCV/STAR-aware BaseCalc + ProbCalc (currently the math is FPTP/party-list shaped;
  ranked systems need round-by-round logic layered on top)
- Structured majority/margin config (Safe/Likely/Lean/Tilt bands) per the guide's
  exercises, as an alternative to the fixed Plurality/Majority/Supermajority bands
- Cloud/account-based sync for tracked race history, instead of per-browser localStorage
