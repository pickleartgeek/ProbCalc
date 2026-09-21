import { memo, useEffect, useMemo, useRef } from 'react';
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
  hoverId?: string | null;
}

const W = 900;

/**
 * Interactive vector map (D3 + GeoJSON). Only participating regions are drawn as individual, colourable paths;
 * everything else is one muted background path. Colours are written straight onto the path elements when
 * `fills` changes — for ~2,900 municipalities that is far cheaper than re-rendering React children each tick.
 */
function GeoMapImpl({ geo, participants, fills, waitingFill = '#1c2536', height = 520, onHover, hoverId }: Props) {
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
  }, [geo, participants, height]);

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
  }, [geo, participants]);

  const resetZoom = () => svgRef.current && zoomRef.current && select(svgRef.current).call(zoomRef.current.transform, zoomIdentity);

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${height}`}
        className="w-full h-auto block bg-void rounded touch-none"
        role="img"
        aria-label={`Map of ${geo.preset.label}`}
        onPointerMove={(e) => onHover?.((e.target as SVGElement).dataset?.id ?? null)}
        onPointerLeave={() => onHover?.(null)}
      >
        <g ref={gRef}>
          <path d={backgroundD} fill="#0f1522" stroke="#1a2233" strokeWidth={0.4} vectorEffect="non-scaling-stroke" pointerEvents="none" />
          {activeD.map(({ id, d }) => (
            <path
              key={id}
              ref={(el) => { if (el) pathRefs.current.set(id, el); else pathRefs.current.delete(id); }}
              d={d}
              data-id={id}
              fill={waitingFill}
              stroke={hoverId === id ? '#f2b705' : '#05080f'}
              strokeWidth={hoverId === id ? 1.6 : active.length > 1500 ? 0.25 : 0.5}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
      </svg>
      <button onClick={resetZoom} className="absolute top-2 right-2 px-2 py-1 text-[11px] font-data bg-panel/90 border border-hairline rounded text-ink-muted hover:text-ink">Reset view</button>
    </div>
  );
}

export const GeoMap = memo(GeoMapImpl);
