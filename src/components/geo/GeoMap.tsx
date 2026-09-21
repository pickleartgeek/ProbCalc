import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { geoAlbersUsa, geoMercator, geoPath } from 'd3-geo';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type D3ZoomEvent } from 'd3-zoom';
import type { LoadedGeometry } from '../../lib/geo/loadGeo';
import { isParticipant } from '../../lib/geo/loadGeo';

interface Props {
  geo: LoadedGeometry;
  participants: 'all' | string[];
  /** region id -> CSS colour for participating regions that have started reporting. Missing = still waiting. */
  fills: Record<string, string>;
  waitingFill?: string;
  height?: number;
  onHover?: (id: string | null) => void;
  /** kept for callers that track hover themselves; the outline is drawn imperatively so this no longer re-renders the map */
  hoverId?: string | null;
  /** Floating tooltip for the region under the cursor. */
  tooltip?: (id: string) => ReactNode;
}

const W = 900;

/**
 * Interactive vector map (D3 + GeoJSON). Only participating regions are drawn as individual, colourable paths;
 * everything else is one muted background path. Colours are written straight onto the path elements when
 * `fills` changes — for ~2,900 municipalities that is far cheaper than re-rendering React children each tick.
 */
const Paths = memo(function Paths({ items, dense, refs }: { items: { id: string; d: string }[]; dense: boolean; refs: React.MutableRefObject<Map<string, SVGPathElement>> }) {
  return (
    <>
      {items.map(({ id, d }) => (
        <path
          key={id}
          ref={(el) => { if (el) refs.current.set(id, el); else refs.current.delete(id); }}
          d={d}
          data-id={id}
          fill="#1c2536"
          stroke="#05080f"
          strokeWidth={dense ? 0.25 : 0.5}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </>
  );
});

function GeoMapImpl({ geo, participants, fills, waitingFill = '#1c2536', height = 520, onHover, tooltip }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null);
  const hoveredEl = useRef<SVGPathElement | null>(null);
  const pkey = participants === 'all' ? 'all' : participants.join('|');
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const pathRefs = useRef(new Map<string, SVGPathElement>());

  const { active, backgroundD, activeD } = useMemo(() => {
    const act = geo.features.filter((f) => isParticipant(f, participants));
    const focus = act.length ? act : geo.features;
    const proj = geo.preset.projection === 'albersUsa' ? geoAlbersUsa() : geoMercator();
    const pad = 14;
    proj.fitExtent([[pad, pad], [W - pad, height - pad]], { type: 'FeatureCollection', features: focus });
    const path = geoPath(proj);
    const ids = new Set(act.map((f) => f.properties.id));
    const bg: string[] = [];
    for (const f of geo.features) if (!ids.has(f.properties.id)) { const d = path(f); if (d) bg.push(d); }
    const ad = act.map((f) => ({ id: f.properties.id, d: path(f) ?? '' })).filter((x) => x.d);
    return { active: act, backgroundD: bg.join(''), activeD: ad };
  }, [geo, pkey, height]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    pathRefs.current.forEach((el, id) => el.setAttribute('fill', fills[id] ?? waitingFill));
  }, [fills, waitingFill, activeD]);

  // wheel / drag zoom
  const zoomRef = useRef<ReturnType<typeof zoom<SVGSVGElement, unknown>> | null>(null);
  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    const g = select(gRef.current);
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 40])
      .on('zoom', (e: D3ZoomEvent<SVGSVGElement, unknown>) => g.attr('transform', e.transform.toString()));
    zoomRef.current = z;
    select(svgRef.current).call(z);
    return () => { select(svgRef.current!).on('.zoom', null); };
  }, [geo, pkey]);

  const resetZoom = () => svgRef.current && zoomRef.current && select(svgRef.current).call(zoomRef.current.transform, zoomIdentity);

  return (
    <div className="relative" ref={wrapRef}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${height}`}
        className="w-full h-auto block bg-void rounded touch-none"
        role="img"
        aria-label={`Map of ${geo.preset.label}`}
        onPointerMove={(e) => {
          const id = (e.target as SVGElement).dataset?.id ?? null;
          const el = id ? pathRefs.current.get(id) ?? null : null;
          if (el !== hoveredEl.current) {
            hoveredEl.current?.setAttribute('stroke', '#05080f');
            hoveredEl.current?.setAttribute('stroke-width', active.length > 1500 ? '0.25' : '0.5');
            if (el) { el.setAttribute('stroke', '#f2b705'); el.setAttribute('stroke-width', '1.6'); el.parentNode?.appendChild(el); } // raise so the outline isn't covered by neighbours
            hoveredEl.current = el;
            onHover?.(id);
          }
          const box = wrapRef.current?.getBoundingClientRect();
          setTip(id && box ? { id, x: e.clientX - box.left, y: e.clientY - box.top } : null);
        }}
        onPointerLeave={() => {
          hoveredEl.current?.setAttribute('stroke', '#05080f');
          hoveredEl.current?.setAttribute('stroke-width', active.length > 1500 ? '0.25' : '0.5');
          hoveredEl.current = null;
          setTip(null);
          onHover?.(null);
        }}
      >
        <g ref={gRef}>
          <path d={backgroundD} fill="#0f1522" stroke="#1a2233" strokeWidth={0.4} vectorEffect="non-scaling-stroke" pointerEvents="none" />
          <Paths items={activeD} dense={active.length > 1500} refs={pathRefs} />
        </g>
      </svg>
      {tip && tooltip && (
        <div
          role="tooltip"
          data-testid="geo-tooltip"
          className="absolute z-20 pointer-events-none bg-panel-raised/95 border border-hairline-bright rounded-md shadow-lg px-3 py-2 text-xs font-data max-w-[250px]"
          style={{ left: tip.x > (wrapRef.current?.clientWidth ?? 900) - 270 ? Math.max(4, tip.x - 258) : tip.x + 14, top: tip.y > 330 ? Math.max(4, tip.y - 130) : tip.y + 14 }}
        >
          {tooltip(tip.id)}
        </div>
      )}
      <button onClick={resetZoom} className="absolute top-2 right-2 px-2 py-1 text-[11px] font-data bg-panel/90 border border-hairline rounded text-ink-muted hover:text-ink">Reset view</button>
    </div>
  );
}

export const GeoMap = memo(GeoMapImpl);
