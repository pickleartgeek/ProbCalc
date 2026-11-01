import { useMemo, useRef, useState } from 'react';
import { geoAlbersUsa, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry } from 'geojson';
import usStatesTopo from '../../data/us-states-10m.json';
import { STATE_NAMES } from '../../lib/midterms/stateGrid';
import { RATING_COLOR, RATING_LABEL, DEM, REP, type Rating } from '../../lib/midterms/ratings';
import type { Party } from '../../lib/midterms/types';
import { fmtMargin, marginColor, probabilityColor, type MapView } from '../../lib/midterms/mapViews';
import { MapLegend } from './MapViewToggle';

/** One race on the map, with the Monte Carlo tally from simulateChamber (raceRWins / iterations). */
export interface StateMapRace {
  abbr: string;
  kind: string; // "Senate" | "Governor"
  special?: boolean;
  rating: Rating;
  iterations: number;
  rWins: number;
  /** the model's projected margin for this race, points, R positive (computedMargin) */
  margin?: number;
  incumbentParty: Party;
  incumbentName: string | null;
  demCandidate?: string | null;
  repCandidate?: string | null;
}

interface Props {
  races: StateMapRace[];
  onSelect?: (abbr: string) => void;
  selected?: string | null;
  /** what the states are coloured by (default: rating) */
  view?: MapView;
}

const W = 975;
const H = 610;
const NAME_TO_ABBR: Record<string, string> = Object.fromEntries(Object.entries(STATE_NAMES).map(([a, n]) => [n, a]));

// The real state outlines (Albers USA, with the usual AK/HI insets). Built once — the geometry never changes.
const STATE_PATHS: { abbr: string; name: string; d: string }[] = (() => {
  const topo = usStatesTopo as any;
  const geo = feature(topo, topo.objects.states) as unknown as FeatureCollection<Geometry>;
  const states = { ...geo, features: geo.features.filter((f) => NAME_TO_ABBR[(f.properties as any)?.name]) };
  const path = geoPath(geoAlbersUsa().fitSize([W, H], states as any));
  return states.features.map((f) => {
    const name = (f.properties as any).name as string;
    return { abbr: NAME_TO_ABBR[name], name, d: path(f as any) ?? '' };
  });
})();

function fillFor(r: StateMapRace, view: MapView): string {
  if (view === 'margin' && r.margin !== undefined) return marginColor(r.margin);
  if (view === 'probability') return probabilityColor(r.rWins / r.iterations);
  return RATING_COLOR[r.rating];
}

/** Who the D/R sides are called: the named nominee when known, else the sitting incumbent of that party, else just the party. */
function sideName(r: StateMapRace, side: 'D' | 'R'): string {
  const named = side === 'D' ? r.demCandidate : r.repCandidate;
  if (named) return named;
  if (r.incumbentParty === side && r.incumbentName) return r.incumbentName;
  return side === 'D' ? 'Democrat' : 'Republican';
}
const isIncumbent = (r: StateMapRace, side: 'D' | 'R', name: string) => r.incumbentParty === side && !!r.incumbentName && name === r.incumbentName;
const fmt = (n: number) => n.toLocaleString('en-US');

function Tooltip({ name, races }: { name: string; races: StateMapRace[] }) {
  return (
    <div className="min-w-[220px] max-w-[280px] rounded-md border border-hairline-bright bg-panel-raised px-3 py-2 shadow-xl text-xs">
      <div className="font-display font-700 text-sm mb-1">{name}</div>
      {races.length === 0 && <div className="text-ink-dim">No {'race'} on the ballot this cycle</div>}
      {races.map((r) => {
        const dWins = r.iterations - r.rWins;
        const rows = [
          { side: 'D' as const, color: DEM, wins: dWins },
          { side: 'R' as const, color: REP, wins: r.rWins },
        ].sort((a, b) => b.wins - a.wins);
        return (
          <div key={r.kind + (r.special ? '-sp' : '')} className="mt-2 first:mt-0">
            <div className="flex items-center justify-between gap-2 text-ink-muted">
              <span>{r.kind}{r.special ? ' (special)' : ''}</span>
              <span className="px-1.5 py-px rounded-sm text-[10px] font-semibold" style={{ background: RATING_COLOR[r.rating], color: '#0a0e17' }}>{RATING_LABEL[r.rating]}</span>
            </div>
            {r.margin !== undefined && <div className="text-ink-dim font-data text-[10px] mt-0.5">projected margin {fmtMargin(r.margin)}</div>}
            {rows.map(({ side, color, wins }) => {
              const nm = sideName(r, side);
              return (
                <div key={side} className="mt-1">
                  <div className="flex justify-between gap-2">
                    <span><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: color }} />{nm} <span className="text-ink-dim">({side}{isIncumbent(r, side, nm) ? ', inc.' : ''})</span></span>
                    <span className="font-data">{(wins / r.iterations * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-1 rounded-full bg-hairline mt-0.5 overflow-hidden"><div className="h-full" style={{ width: `${wins / r.iterations * 100}%`, background: color }} /></div>
                  <div className="text-ink-dim font-data text-[10px] mt-0.5">wins {fmt(wins)} of {fmt(r.iterations)} simulations</div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export function StateMap({ races, onSelect, selected, view = 'rating' }: Props) {
  const byState = useMemo(() => {
    const m = new Map<string, StateMapRace[]>();
    for (const r of races) m.set(r.abbr, [...(m.get(r.abbr) ?? []), r]);
    return m;
  }, [races]);
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ abbr: string; x: number; y: number; w: number; h: number } | null>(null);

  const place = (abbr: string, clientX: number, clientY: number) => {
    const box = wrap.current?.getBoundingClientRect();
    if (box) setHover({ abbr, x: clientX - box.left, y: clientY - box.top, w: box.width, h: box.height });
  };
  // keep the selected state last so its gold outline isn't covered by a neighbour's stroke
  const ordered = useMemo(() => [...STATE_PATHS].sort((a, b) => Number(a.abbr === selected) - Number(b.abbr === selected)), [selected]);
  const hovered = hover ? STATE_PATHS.find((s) => s.abbr === hover.abbr) : null;
  const boxW = hover?.w ?? 0;
  const flip = !!hover && hover.y > hover.h * 0.55; // tooltip opens upward in the lower half

  return (
    <div ref={wrap} className="relative w-full" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label="Map of US states coloured by race rating, margin or win probability">
        {ordered.map((s) => {
          const rs = byState.get(s.abbr);
          const has = !!rs?.length;
          // a state with two races in the same chamber is coloured by the more competitive one
          const top = has ? [...rs!].sort((a, b) => Math.abs(a.rWins / a.iterations - 0.5) - Math.abs(b.rWins / b.iterations - 0.5))[0] : null;
          const isSel = selected === s.abbr;
          return (
            <path
              key={s.abbr}
              d={s.d}
              tabIndex={has ? 0 : -1}
              role={has ? 'button' : undefined}
              aria-label={has ? `${s.name}: ${rs!.map((r) => `${r.kind} ${RATING_LABEL[r.rating]}`).join(', ')}` : s.name}
              onMouseMove={(e) => place(s.abbr, e.clientX, e.clientY)}
              onMouseEnter={(e) => place(s.abbr, e.clientX, e.clientY)}
              onFocus={() => { const b = wrap.current?.getBoundingClientRect(); const p = (document.activeElement as SVGPathElement | null)?.getBoundingClientRect(); if (b && p) setHover({ abbr: s.abbr, x: p.left - b.left + p.width / 2, y: p.top - b.top + p.height / 2, w: b.width, h: b.height }); }}
              onBlur={() => setHover(null)}
              onClick={(e) => { place(s.abbr, e.clientX, e.clientY); if (has) onSelect?.(s.abbr); }}
              onKeyDown={(e) => { if (has && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect?.(s.abbr); } }}
              fill={top ? fillFor(top, view) : '#1a2233'}
              fillOpacity={has ? 1 : 0.55}
              stroke={isSel ? 'var(--color-gold)' : '#0a0e17'}
              strokeWidth={isSel ? 2.5 : 0.8}
              strokeLinejoin="round"
              style={{ cursor: has ? 'pointer' : 'default', outline: 'none', filter: hover?.abbr === s.abbr && has ? 'brightness(1.15)' : undefined }}
            />
          );
        })}
      </svg>
      <div className="mt-2"><MapLegend view={view} /></div>
      {hover && hovered && (
        <div
          className="pointer-events-none absolute z-20"
          style={{ left: Math.min(Math.max(hover.x + 14, 4), Math.max(4, boxW - 290)), top: flip ? hover.y - 14 : hover.y + 14, transform: flip ? 'translateY(-100%)' : undefined }}
        >
          <Tooltip name={hovered.name} races={byState.get(hover.abbr) ?? []} />
        </div>
      )}
    </div>
  );
}
