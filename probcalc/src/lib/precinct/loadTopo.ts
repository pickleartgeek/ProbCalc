import { feature as topoFeature } from 'topojson-client';
import type { Topology, GeometryObject } from 'topojson-specification';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import { projectFeatures, type ProjectionKind, type RawFeature } from './project';
import type { ProjectedLayer } from './types';

/**
 * Fetches a TopoJSON file and projects it into a ready-to-render layer.
 *
 * Expected data-prep pipeline for real precinct shapefiles (see
 * scripts/prepare-precincts.mjs and the README): shapefile -> GeoJSON ->
 * mapshaper simplify -> topojson quantize -> gzip. This function is the
 * runtime half — it doesn't care how the file was produced, only that it's
 * valid TopoJSON with polygon/multipolygon geometries.
 */
export async function loadTopoLayer(
  url: string,
  objectName: string,
  opts: { width?: number; height?: number; projection?: ProjectionKind; idProperty?: string } = {}
): Promise<ProjectedLayer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const topology = (await res.json()) as Topology;

  const object = topology.objects[objectName] as GeometryObject | undefined;
  if (!object) {
    throw new Error(`Object "${objectName}" not found in ${url}. Available: ${Object.keys(topology.objects).join(', ')}`);
  }

  const collection = topoFeature(topology, object) as unknown as
    | Feature<Polygon | MultiPolygon>
    | { type: 'FeatureCollection'; features: Feature<Polygon | MultiPolygon>[] };

  const rawFeatures: Feature<Polygon | MultiPolygon>[] =
    collection.type === 'FeatureCollection' ? collection.features : [collection];

  const idProp = opts.idProperty;
  const raw: RawFeature[] = rawFeatures.map((f, i) => {
    const rings: [number, number][][] =
      f.geometry.type === 'Polygon'
        ? (f.geometry.coordinates as [number, number][][])
        : (f.geometry.coordinates as [number, number][][][]).flat();
    const id =
      (idProp && f.properties && String(f.properties[idProp])) ||
      (f.id != null ? String(f.id) : null) ||
      `feature-${i}`;
    return { id, rings, properties: f.properties ?? {} };
  });

  return projectFeatures(raw, opts);
}
