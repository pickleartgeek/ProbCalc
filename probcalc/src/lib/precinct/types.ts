// The precinct engine is deliberately decoupled from where geometry comes from
// (TopoJSON file, synthetic generator, future vector-tile source — anything).
// Everything downstream (spatial index, canvas renderer, picking) only ever
// touches `ProjectedFeature[]`: geometry that's already been run through a
// projection ONCE at load time and cached as flat pixel-space rings. Pan/zoom
// afterwards is pure canvas transform math, not re-projection — that's what
// makes 100k+ polygons tractable in a browser.

/** A ring of [x, y] points in projected "world pixel" space (pre-zoom). */
export type ProjectedRing = Float64Array; // flat [x0,y0,x1,y1,...]

export interface ProjectedFeature {
  id: string;
  /** Outer ring first, holes after — same convention as GeoJSON Polygon/MultiPolygon rings, flattened. */
  rings: ProjectedRing[];
  /** [minX, minY, maxX, maxY] in the same projected pixel space, used for culling + picking. */
  bbox: [number, number, number, number];
  /** Arbitrary properties carried through from the source data (name, FIPS, etc.) */
  properties: Record<string, unknown>;
}

export interface ProjectedLayer {
  features: ProjectedFeature[];
  /** Bounds of the whole layer in projected pixel space. */
  bounds: [number, number, number, number];
  /** Reference canvas size the projection was fit to (see project.ts). */
  width: number;
  height: number;
}

/** A LOD tier: which pre-simplified file to load at which zoom range. */
export interface PrecinctLodTier {
  minZoom: number;
  maxZoom: number;
  url: string;
}

export type ColorScale = (value: number | undefined, feature: ProjectedFeature) => string;
