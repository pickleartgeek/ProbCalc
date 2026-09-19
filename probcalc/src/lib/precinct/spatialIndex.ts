import RBush from 'rbush';
import type { ProjectedFeature, ProjectedLayer } from './types';

interface IndexEntry {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  feature: ProjectedFeature;
}

export class PrecinctIndex {
  private tree: RBush<IndexEntry>;

  constructor(layer: ProjectedLayer) {
    this.tree = new RBush<IndexEntry>();
    this.tree.load(
      layer.features.map((f) => ({
        minX: f.bbox[0],
        minY: f.bbox[1],
        maxX: f.bbox[2],
        maxY: f.bbox[3],
        feature: f,
      }))
    );
  }

  /** Features whose bbox intersects the given pixel-space viewport rectangle. */
  query(minX: number, minY: number, maxX: number, maxY: number): ProjectedFeature[] {
    return this.tree.search({ minX, minY, maxX, maxY }).map((e) => e.feature);
  }
}
