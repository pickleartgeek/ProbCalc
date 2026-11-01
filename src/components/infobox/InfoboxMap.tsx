import { forwardRef, useMemo } from 'react';
import { geoAlbersUsa, geoMercator, geoPath } from 'd3-geo';
import type { LoadedGeometry } from '../../lib/geo/loadGeo';
import { isParticipant } from '../../lib/geo/loadGeo';

interface Props {
  geo: LoadedGeometry;
  participants: 'all' | string[];
  /** region id -> colour of the winner. Missing = no data (light grey). */
  fills: Record<string, string>;
  width?: number;
}

const NO_DATA = '#d4d4d8';

/**
 * The results map of a Wikipedia election infobox: flat colour per region (the winner's party colour), thin white borders,
 * white background, no interaction. Rendered as plain SVG so it can be downloaded as a file and uploaded to Commons.
 */
export const InfoboxMap = forwardRef<SVGSVGElement, Props>(function InfoboxMap({ geo, participants, fills, width = 320 }, ref) {
  const { paths, height } = useMemo(() => {
    const active = geo.features.filter((f) => isParticipant(f, participants));
    const feats = active.length ? active : geo.features;
    const fc = { type: 'FeatureCollection' as const, features: feats };
    const proj = geo.preset.projection === 'albersUsa' ? geoAlbersUsa() : geoMercator();
    // fit the projection to a 1-unit-wide box first to learn the aspect ratio, then to the real size
    proj.fitWidth(width, fc);
    const path = geoPath(proj);
    const [[, y0], [, y1]] = path.bounds(fc);
    const h = Math.ceil(y1 - Math.min(0, y0)) + 2;
    return { paths: feats.map((f) => ({ id: f.properties.id, name: f.properties.name, d: path(f) ?? '' })), height: Math.max(80, h) };
  }, [geo, participants, width]);
  const dense = paths.length > 300;
  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="Results map" style={{ display: 'block', background: '#fff', maxHeight: 440 }}>
      <rect width={width} height={height} fill="#fff" />
      {paths.map((p) => (
        <path key={p.id} d={p.d} fill={fills[p.id] ?? NO_DATA} stroke="#fff" strokeWidth={dense ? 0.2 : 0.6} strokeLinejoin="round"><title>{p.name}</title></path>
      ))}
    </svg>
  );
});
