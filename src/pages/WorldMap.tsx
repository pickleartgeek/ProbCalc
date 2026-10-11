import { useEffect, useMemo, useState } from 'react';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry } from 'geojson';
import { Link } from 'react-router-dom';
import worldTopo from '../data/countries-110m.json';
import { loadRace, hasUsablePolls } from '../lib/races/loader';
import { configForRace, GALLERY_RACES, type RaceDef } from '../lib/races/registry';
import { computeBaseCalcBundle } from '../state/store';
import { RaceCardActions } from '../components/races/RaceTrend';

const WIDTH = 960;
const HEIGHT = 500;

// The one headline race that stands for each country on a WORLD map — the same national races Gallery already
// fetches and models, just reused here instead of the hand-written 2024/placeholder table this page used to run
// on (a Pennsylvania Senate race that was already decided, a Slovak leader figure months out of date). Picking
// these by id keeps this page on the exact same live pipeline as every other page, so a number never disagrees
// with what Gallery or Split Ticket says about the same race.
const byId = (id: string) => GALLERY_RACES.find((d) => d.id === id)!;
const WORLD_ANCHORS: { isoNumeric: string; def: RaceDef }[] = [
  { isoNumeric: '840', def: byId('gcb-2026') },
  { isoNumeric: '276', def: byId('de-next') },
  { isoNumeric: '100', def: byId('bg-2026') },
  { isoNumeric: '703', def: byId('sk-next') },
  { isoNumeric: '826', def: byId('uk-next') },
];

interface AnchorResult {
  def: RaceDef;
  leaderName: string;
  leaderColor: string;
  leadPct: string;
  live: boolean;
}

/** Loads each anchor race once (live → cache → fallback, same as everywhere else) and reduces it to "who's ahead,
 *  by how much" for the map fill and the sidebar — undefined while loading, null if it loaded but has no usable polls. */
function useWorldLeaders(): Record<string, AnchorResult | null | undefined> {
  const [byIso, setByIso] = useState<Record<string, AnchorResult | null | undefined>>({});
  useEffect(() => {
    let cancelled = false;
    for (const { isoNumeric, def } of WORLD_ANCHORS) {
      loadRace(def).then((load) => {
        if (cancelled) return;
        if (!hasUsablePolls(load.parsed, def.cutoffDate)) { setByIso((r) => ({ ...r, [isoNumeric]: null })); return; }
        const bundle = computeBaseCalcBundle(configForRace(def, load.parsed), load.parsed);
        const ranked = [...bundle.results].sort((a, b) => b.percentage - a.percentage);
        const partyById = Object.fromEntries(load.parsed.parties.map((p) => [p.id, p]));
        const top = partyById[ranked[0].partyId];
        const gap = (ranked[0].percentage - (ranked[1]?.percentage ?? 0)) * 100;
        setByIso((r) => ({
          ...r,
          [isoNumeric]: { def, leaderName: top.name, leaderColor: top.color, leadPct: `+${gap.toFixed(1)}`, live: load.source === 'live' },
        }));
      });
    }
    return () => { cancelled = true; };
  }, []);
  return byIso;
}

export function WorldMap() {
  const [hoveredIso, setHoveredIso] = useState<string | null>(null);
  const [pinnedIso, setPinnedIso] = useState<string | null>(null);
  const leaders = useWorldLeaders();
  const shownIso = hoveredIso ?? pinnedIso;

  const paths = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const topology = worldTopo as any;
    const geo = feature(topology, topology.objects.countries) as unknown as FeatureCollection<Geometry>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const projection = geoNaturalEarth1().fitSize([WIDTH, HEIGHT], geo as any);
    const pathGen = geoPath(projection);
    return geo.features.map((f) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      id: String((f as any).id),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      name: (f.properties as any)?.name as string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      d: pathGen(f as any) ?? '',
    }));
  }, []);

  const shown = shownIso ? leaders[shownIso] : null;
  const shownCountryName = shownIso ? paths.find((p) => p.id === shownIso)?.name : null;
  const pin = (iso: string | null) => setPinnedIso((cur) => (cur === iso ? null : iso));

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="font-display font-800 text-3xl mb-1">Polling world map</h1>
      <p className="text-ink-muted mb-8 max-w-2xl">
        The leading party in this engine's headline race for each tracked country — the same live Wikipedia
        average Gallery shows, read off the map. Countries in grey aren't tracked yet; head to{' '}
        <Link to="/build" className="text-cyan hover:underline">Build</Link> to add one.
      </p>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-panel border border-hairline rounded-lg p-4">
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" style={{ background: '#0a0e17' }}>
            {paths.map((p) => {
              const anchor = leaders[p.id];
              const isTracked = WORLD_ANCHORS.some((a) => a.isoNumeric === p.id);
              const isPinned = pinnedIso === p.id;
              const isHovered = hoveredIso === p.id;
              const fill = anchor === undefined ? (isTracked ? '#263049' : '#1a2233') : anchor === null ? '#1a2233' : anchor.leaderColor;
              return (
                <path
                  key={p.id}
                  d={p.d}
                  fill={fill}
                  fillOpacity={anchor ? (isHovered || isPinned ? 1 : 0.85) : isTracked ? 0.6 : 1}
                  stroke={isPinned ? '#f2b705' : isHovered ? '#8994ac' : '#0a0e17'}
                  strokeWidth={isPinned ? 2 : isHovered ? 1 : 0.5}
                  className={isTracked ? 'cursor-pointer transition-all duration-150' + (anchor === undefined ? ' animate-pulse' : '') : ''}
                  onMouseEnter={() => isTracked && setHoveredIso(p.id)}
                  onMouseLeave={() => setHoveredIso(null)}
                  onClick={() => isTracked && pin(p.id)}
                  role={isTracked ? 'button' : undefined}
                  aria-label={isTracked ? `${p.name} — ${anchor ? `${anchor.leaderName} leads` : 'loading'}` : undefined}
                >
                  <title>{anchor ? `${p.name} — ${anchor.leaderName} leads (${anchor.leadPct})` : isTracked ? `${p.name} — loading…` : p.name}</title>
                </path>
              );
            })}
          </svg>
          <p className="text-ink-dim text-[11px] font-data mt-2 text-center">
            country-level leader only — district-level detail lives on each race's own map
          </p>
        </div>

        <div className="space-y-4">
          <div className="bg-panel border border-hairline rounded-lg p-5 min-h-[140px]">
            {shown ? (
              <>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-ink-dim text-xs font-data uppercase tracking-wide">{shownCountryName}</p>
                  {pinnedIso === shownIso && !hoveredIso && (
                    <button onClick={() => pin(null)} className="text-ink-dim hover:text-ink text-xs" aria-label="Unpin">✕</button>
                  )}
                </div>
                <h2 className="font-display font-700 text-lg mb-2">{shown.def.title}</h2>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: shown.leaderColor }} />
                  <span className="font-medium">{shown.leaderName}</span>
                  <span className="font-data text-cyan">{shown.leadPct}</span>
                </div>
                <span className={`inline-block text-[10px] font-data uppercase tracking-wide px-1.5 py-0.5 rounded-sm mt-1 ${shown.live ? 'bg-cyan/15 text-cyan' : 'bg-gold/15 text-gold'}`}>
                  {shown.live ? 'Live' : 'Cached'}
                </span>
                <RaceCardActions def={shown.def} />
              </>
            ) : shownIso ? (
              <p className="text-ink-dim text-sm">Loading…</p>
            ) : (
              <p className="text-ink-dim text-sm">Tap a colored country — or a race below — to see who's leading and its live trend.</p>
            )}
          </div>

          <div className="bg-panel border border-hairline rounded-lg p-5">
            <h3 className="font-display font-700 text-sm mb-3">Tracked races</h3>
            <div className="space-y-2">
              {WORLD_ANCHORS.map(({ isoNumeric, def }) => {
                const anchor = leaders[isoNumeric];
                return (
                  <button
                    key={isoNumeric}
                    onMouseEnter={() => setHoveredIso(isoNumeric)}
                    onMouseLeave={() => setHoveredIso(null)}
                    onClick={() => pin(isoNumeric)}
                    className={`w-full text-left flex items-center justify-between gap-2 px-2.5 py-2 rounded text-sm transition ${
                      (hoveredIso ?? pinnedIso) === isoNumeric ? 'bg-panel-raised border border-hairline-bright' : 'hover:bg-panel-raised border border-transparent'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: anchor?.leaderColor ?? '#3a4562' }} />
                      <span className="truncate">{def.region}</span>
                    </span>
                    <span className="font-data text-ink-muted text-xs shrink-0">{anchor ? anchor.leaderName : anchor === null ? 'no data' : '…'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
