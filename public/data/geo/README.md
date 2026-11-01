# Region-preset boundaries & baselines

| File | Region preset | Source |
|---|---|---|
| `de-wahlkreise.topo.json` / `.baseline.json` | 299 German Wahlkreise, Bundestag 2025 Zweitstimmen (+2021 recomputed) | © Die Bundeswahlleiterin 2025, Datenlizenz Deutschland – Namensnennung 2.0. Built by `scripts/prepare-germany.mjs` from the release files `btw25_kerg.csv` + `wahlkreise.zip` |
| `sk-obce.topo.json` / `.baseline.json` | 2,926 Slovak municipalities, NRSR 2023 valid votes | Štatistický úrad SR (tab. 08d); boundaries ÚGKK SR. Built by `scripts/prepare-slovakia.mjs` from `NRSR2023_SK_tab08d.xlsx` + `obec_0.zip` |
| `uk-constituencies.topo.json` / `.baseline.json` | 650 UK parliamentary constituencies (July 2024 boundaries), GE2024 valid votes + winner/majority | House of Commons Library, GE2024 results by constituency (OPL v3.0); boundaries © ONS / Ordnance Survey (OGL v3.0). Built by `scripts/prepare-uk.mjs` from the release files `HoC-GE2024-results-by-constituency.1.xlsx` + the `Westminster_Parliamentary_Constituencies_July_2024_Boundaries_UK_BFC_…zip` (235 MB, simplified in the script) |
| `bg-provinces.topo.json` | 28 Bulgarian provinces (geometry only) | dimitara/bulgaria-interactive-map (MIT) — built by `scripts/build-geo.mjs` |
| `us-cd118.topo.json` | 435 US House districts, 118th Congress lines | civic-interconnect/civic-data-boundaries-us-cd118 (MIT), Census TIGER/Line 2022 — `scripts/build-geo.mjs`. States that redrew for 2026 are not reflected |
| `us-states-10m.json` | US states | us-atlas (Census) |

The German, Slovak and UK files are regenerated in CI on every deploy (see `.github/workflows/deploy.yml`);
the committed copies exist so `npm run dev` works without network access.
US precincts (smallest US division) are handled separately under `public/data/precincts/`.
