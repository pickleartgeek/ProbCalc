# Region-preset boundaries & baselines

| File | Region preset | Source |
|---|---|---|
| `de-wahlkreise.topo.json` / `.baseline.json` | 299 German Wahlkreise, Bundestag 2025 Zweitstimmen (+2021 recomputed) | © Die Bundeswahlleiterin 2025, Datenlizenz Deutschland – Namensnennung 2.0. Built by `scripts/prepare-germany.mjs` from the release files `btw25_kerg.csv` + `wahlkreise.zip` |
| `sk-obce.topo.json` / `.baseline.json` | 2,926 Slovak municipalities, NRSR 2023 valid votes | Štatistický úrad SR (tab. 08d); boundaries ÚGKK SR. Built by `scripts/prepare-slovakia.mjs` from `NRSR2023_SK_tab08d.xlsx` + `obec_0.zip` |
| `bg-provinces.topo.json` | 28 Bulgarian provinces (geometry only) | dimitara/bulgaria-interactive-map (MIT) — built by `scripts/build-geo.mjs` |
| `us-cd118.topo.json` | 435 US House districts, 118th Congress lines | civic-interconnect/civic-data-boundaries-us-cd118 (MIT), Census TIGER/Line 2022 — `scripts/build-geo.mjs`. States that redrew for 2026 are not reflected |
| `us-states-10m.json` | US states | us-atlas (Census) |

The German and Slovak files are regenerated in CI on every deploy (see `.github/workflows/deploy.yml`);
the committed copies exist so `npm run dev` works without network access.
US precincts (smallest US division) are handled separately under `public/data/precincts/`.
