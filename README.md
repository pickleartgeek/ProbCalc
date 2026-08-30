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

Two different "map" concepts live in this app, intentionally:

1. **District mosaic** (`PlaceholderMap`) — an abstract grid of tiles allocated
   proportionally to vote share/win probability, used on Results, Election Night, and
   the Infobox. Not real geography. Swapping in real GeoJSON/shapefile-per-country later
   means writing a new component that consumes the same `shares: Record<partyId, number>`
   prop and replacing it in `Results.tsx` / `ElectionNight.tsx` / `Infobox.tsx`.
2. **World map** (`WorldMap.tsx`) — a *real* map using actual country border data
   (`world-atlas`'s 110m topojson, bundled locally in `src/data/`, no runtime network
   fetch) rendered with `d3-geo` + `topojson-client`. This one didn't need per-district
   shapefiles, just world borders, so it's the real thing rather than a placeholder.

### About the Tracker's persistence

Race history is stored in `localStorage`, keyed by the race's generated ID
(`probcalc:history:<id>` for snapshots, `probcalc:racemeta:<id>` for title/parties).
Every time you run BaseCalc on the Build page it logs an initial snapshot automatically;
after that, hit **📌 Log snapshot** on the Results page whenever you want to add another
data point (e.g. after pasting updated polling data). ProbCalc results get attached to
the most recent snapshot when you run them. There's no cross-device sync — it's your
browser's local storage, so it survives refreshes but not a different browser/device.

## Architecture notes

- **State**: a single React Context (`src/state/store.tsx`) holds the current race
  config, parsed poll data, BaseCalc/ProbCalc results, and simulation outcomes — this is
  in-memory only and resets on refresh. Separately, `src/lib/history.ts` persists race
  snapshots to `localStorage` for the Tracker page (see above) — that part *does*
  survive a refresh.
- **Parsing**: `src/lib/plainTableParser.ts` and `src/lib/wikitextParser.ts` are
  independent, `src/lib/parser.ts` auto-detects which one to use. Both were tested
  against real Wikipedia table structures (German federal election polling, with
  nested `{{opdrts|...}}` date templates, footnotes, `{{Party shading/...}}`, etc.) —
  but Wikipedia's table markup varies a lot page to page, so expect to need a few
  regex tweaks the first time you throw an unusual table at it. Warnings surface in
  the UI when key columns can't be found.
- **BaseCalc**: `src/lib/baseCalc.ts` implements the guide's exact formula — weight =
  (pollResult × sampleSize) / (daysTillElection × divisor), summed to alpha, normalized
  to percentage.
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

  How it stays fast at that scale, and why each piece is there:
  - **Project once, not per frame.** `project.ts` runs every point through a d3-geo
    projection exactly once at load time and caches the result as flat `Float64Array`
    rings (`ProjectedFeature`). Pan/zoom afterwards is pure canvas
    `translate`/`scale` — no re-projection.
  - **Fit to a reference extent, not to loaded data.** `createReferenceProjection(bbox, ...)`
    fits a projection to a *fixed* bounding box (a country, a state) once; every
    subsequent `projectFeatures()` call reuses it. Two bugs this avoids: (1) fitting
    per-load streams the *entire* geometry through d3-geo's resampling/clipping
    pipeline, which is dramatically more expensive than a raw point transform
    (measured: ~7s at 100k polygons vs. <5ms fitting to a 5-point bbox); (2) if two
    separately-loaded tiles each fit their own projection, they land on different
    scales and don't line up on screen.
  - **Viewport culling via spatial index.** `spatialIndex.ts` wraps `rbush` over every
    feature's bbox, built once per layer load. Every frame, the current pan/zoom
    transform is inverted to a pixel-space rectangle and only intersecting features
    are touched at all.
  - **Batch fills, but not too much.** Canvas `fill()` calls are genuinely expensive to
    minimize call *count* for — up to a point. Benchmarked: 29k tiny disjoint polygons
    filled as one mega-path ≈ 4.4s; the same 29k filled in chunks of ~10 ≈ 8ms. One
    fill() call per polygon (59ms) is also far worse than chunks of 10. `PrecinctCanvas`
    batches by color bucket (so a choropleth needs a handful of buckets, not one per
    polygon) *and* caps each batch at 10 polygons — measure before trusting either
    "batch everything" or "never batch" folklore.
  - **Picking without per-polygon hit-testing.** A hidden second canvas renders every
    visible feature in a unique flat RGB color (`idToColor`/`colorToId`); reading back
    one pixel under the cursor is an O(1) hit test regardless of polygon count. This
    canvas *can't* be batched (every polygon needs a distinct color, so it's one
    `fill()` call each) — so unlike the main canvas, it only rebuilds ~150ms after
    pan/zoom settles (`schedulePick`), not on every drag frame. Coordinate math for
    picking uses the *container's* bounding rect, not the pick canvas's own — a
    `display:none` element always reports a zeroed rect.
  - **Data prep is offline, not runtime.** `scripts/prepare-precincts.mjs` is the
    general path: raw GeoJSON → `mapshaper` simplify (3 LOD tiers) → quantized
    TopoJSON → gzip. `loadTopoLayer()` is the runtime counterpart. Anything
    genuinely expensive (simplification, or a large point-in-polygon test) belongs in
    the offline step, shipping a small precomputed file — see the Germany grid below
    for a concrete example of that split.

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
