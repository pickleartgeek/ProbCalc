import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { generateSyntheticPrecincts, SYNTHETIC_BBOX } from '../lib/precinct/synthetic';
import { projectFeatures, createReferenceProjection } from '../lib/precinct/project';
import { loadGermanyGrid } from '../lib/precinct/germanyGrid';
import { PrecinctCanvas } from '../components/precinct/PrecinctCanvas';
import type { ProjectedFeature, ProjectedLayer } from '../lib/precinct/types';

type Dataset = 'synthetic' | 'germany';
const COUNTS = [1000, 10000, 25000, 50000, 100000];

// Diverging blue -> gray -> red scale, bucketed into 9 bands so the renderer
// only ever needs 9 distinct fill colors regardless of polygon count — see
// PrecinctCanvas's batching comment for why that matters at this scale.
const BANDS = [
  '#1d4ed8', '#3b82f6', '#7ab0f5', '#a9c9f5', '#8b8fa3',
  '#f0a8a8', '#ea7373', '#e14b4b', '#b91c1c',
];
function bandColor(value: number | undefined): string {
  if (value == null) return '#1a2233';
  const idx = Math.max(0, Math.min(BANDS.length - 1, Math.floor(value * BANDS.length)));
  return BANDS[idx];
}

const GERMANY_LAT_RANGE: [number, number] = [47.27, 55.06];

// Fit ONE reference projection to the fixed synthetic bounding box and reuse
// it across every count — same reasoning as the Germany path: fitting fresh
// per load streams all N features through the resampling pipeline, which is
// the exact thing that made "Build time" spike to ~7s at 100k earlier.
const syntheticProjection = createReferenceProjection(SYNTHETIC_BBOX, 1600, 1000, 'mercator');

export function PrecinctLab() {
  const [dataset, setDataset] = useState<Dataset>('germany');
  const [count, setCount] = useState(100000);
  const [layer, setLayer] = useState<ProjectedLayer | null>(null);
  const [featureCount, setFeatureCount] = useState<number | null>(null);
  const [buildMs, setBuildMs] = useState<number | null>(null);
  const [building, setBuilding] = useState(false);
  const [hovered, setHovered] = useState<ProjectedFeature | null>(null);
  const [stats, setStats] = useState<{ drawn: number; total: number; ms: number } | null>(null);
  const frameTimes = useRef<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    setBuilding(true);
    frameTimes.current = [];

    async function build() {
      const t0 = performance.now();

      if (dataset === 'germany') {
        const { features: raw, bbox } = await loadGermanyGrid();
        if (cancelled) return;
        // Fit ONE reference projection to Germany's real bounding box, then
        // reuse it — this is the fix from earlier: fitting per-load instead
        // of to a fixed reference is both slower (streams all 100k polygons
        // through the resampling pipeline) and, for any real multi-tile
        // dataset, wrong (different loads would land on different scales).
        const proj = createReferenceProjection(bbox, 1400, 1700, 'mercator');
        const projected = projectFeatures(raw, { width: 1400, height: 1700, projection: proj });
        setLayer(projected);
        setFeatureCount(raw.length);
      } else {
        // Yield a frame so "building…" actually paints before the
        // synchronous, CPU-bound generation + projection work runs.
        await new Promise((r) => setTimeout(r, 30));
        const raw = generateSyntheticPrecincts(count);
        const projected = projectFeatures(raw, { width: 1600, height: 1000, projection: syntheticProjection });
        if (cancelled) return;
        setLayer(projected);
        setFeatureCount(raw.length);
      }

      setBuildMs(performance.now() - t0);
      setBuilding(false);
    }
    build();
    return () => {
      cancelled = true;
    };
  }, [dataset, count]);

  const values = useMemo(() => {
    if (!layer) return {};
    const v: Record<string, number> = {};
    if (dataset === 'germany') {
      const [lo, hi] = GERMANY_LAT_RANGE;
      for (const f of layer.features) {
        const lat = f.properties.lat as number;
        v[f.id] = Math.max(0, Math.min(1, (lat - lo) / (hi - lo)));
      }
    } else {
      for (const f of layer.features) v[f.id] = f.properties.value as number;
    }
    return v;
  }, [layer, dataset]);

  const handleFrameStats = useCallback((s: { drawn: number; total: number; ms: number }) => {
    setStats(s);
    frameTimes.current.push(s.ms);
    if (frameTimes.current.length > 30) frameTimes.current.shift();
  }, []);
  const avgMs = frameTimes.current.length
    ? frameTimes.current.reduce((a, b) => a + b, 0) / frameTimes.current.length
    : null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-2 flex items-center gap-2.5">
        <h1 className="font-display font-800 text-3xl tracking-tight">Precinct Lab</h1>
        <span className="font-data text-[10px] text-ink-dim tracking-widest border border-hairline-bright rounded px-1.5 py-0.5">
          ENGINE STRESS TEST
        </span>
      </div>
      <p className="text-ink-muted mb-6 max-w-2xl">
        Proving the canvas renderer holds up at real precinct-count scale — viewport culling,
        batched fills, and offscreen-canvas picking. Drag to pan, scroll/pinch to zoom, hover a
        cell to pick it.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={() => setDataset('germany')}
          className={`px-3 py-1.5 rounded text-sm font-data transition-colors ${
            dataset === 'germany' ? 'bg-gold text-void font-semibold' : 'bg-panel border border-hairline text-ink-muted hover:text-ink'
          }`}
        >
          🇩🇪 Germany, ~100k real squares
        </button>
        <span className="text-ink-dim text-xs mx-1">or synthetic:</span>
        {COUNTS.map((c) => (
          <button
            key={c}
            onClick={() => {
              setDataset('synthetic');
              setCount(c);
            }}
            className={`px-3 py-1.5 rounded text-sm font-data transition-colors ${
              dataset === 'synthetic' && count === c
                ? 'bg-gold text-void font-semibold'
                : 'bg-panel border border-hairline text-ink-muted hover:text-ink'
            }`}
          >
            {c.toLocaleString()}
          </button>
        ))}
      </div>

      {dataset === 'germany' && (
        <div className="bg-gold/5 border border-gold/30 rounded-lg px-4 py-2.5 mb-4 text-xs text-ink-muted max-w-2xl">
          Real Germany boundary, tiled with squares of exactly{' '}
          <span className="font-data text-ink">1.889502580045870167 km</span> per side — chosen
          so that 100,000 of them equal Germany's real area (357,022 km²) exactly. Squares are
          built in a true equal-area projection (spherical Lambert Azimuthal, centered on
          Germany) so each one's area is exact by construction; which ones make the cut is
          decided by a real point-in-polygon test against Germany's actual border, precomputed
          offline (<code className="text-cyan">scripts/generate-germany-grid.mjs</code>).
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_260px] gap-4">
        <div className="bg-panel border border-hairline rounded-lg overflow-hidden relative" style={{ height: 640 }}>
          {building && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-void/70 font-data text-sm text-ink-muted">
              {dataset === 'germany' ? 'loading Germany grid…' : `building ${count.toLocaleString()} polygons…`}
            </div>
          )}
          <PrecinctCanvas
            layer={layer}
            colorScale={bandColor}
            values={values}
            onHover={setHovered}
            onFrameStats={handleFrameStats}
            background="#0a0e17"
          />
        </div>

        <div className="space-y-3">
          <div className="bg-panel border border-hairline rounded-lg p-4">
            <h3 className="font-display font-700 text-sm mb-2.5">Performance</h3>
            <dl className="space-y-1.5 text-xs font-data">
              <div className="flex justify-between">
                <dt className="text-ink-dim">Polygons</dt>
                <dd className="text-ink">{featureCount != null ? featureCount.toLocaleString() : '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-dim">{dataset === 'germany' ? 'Load + build' : 'Build time'}</dt>
                <dd className="text-ink">{buildMs != null ? `${buildMs.toFixed(0)}ms` : '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-dim">Frame time</dt>
                <dd className="text-ink">{stats ? `${stats.ms.toFixed(1)}ms` : '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-dim">Avg (30f)</dt>
                <dd className={avgMs != null && avgMs > 33 ? 'text-red-call' : 'text-cyan'}>
                  {avgMs != null ? `${avgMs.toFixed(1)}ms` : '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-dim">Drawn / total</dt>
                <dd className="text-ink">
                  {stats ? `${stats.drawn.toLocaleString()} / ${stats.total.toLocaleString()}` : '—'}
                </dd>
              </div>
            </dl>
          </div>

          <div className="bg-panel border border-hairline rounded-lg p-4">
            <h3 className="font-display font-700 text-sm mb-2.5">Hovered cell</h3>
            {hovered ? (
              <dl className="space-y-1 text-xs font-data">
                <div className="flex justify-between">
                  <dt className="text-ink-dim">ID</dt>
                  <dd className="text-ink">{hovered.id}</dd>
                </div>
                {dataset === 'germany' ? (
                  <div className="flex justify-between">
                    <dt className="text-ink-dim">Latitude</dt>
                    <dd className="text-ink">{(hovered.properties.lat as number).toFixed(3)}°N</dd>
                  </div>
                ) : (
                  <div className="flex justify-between">
                    <dt className="text-ink-dim">Value</dt>
                    <dd className="text-ink">{(hovered.properties.value as number).toFixed(3)}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-ink-dim text-xs">Hover the map</p>
            )}
          </div>

          <div className="bg-panel border border-hairline rounded-lg p-4 text-xs text-ink-dim leading-relaxed">
            "Drawn / total" only rises above the visible viewport count when zoomed out far
            enough to see everything — that's the spatial index doing its job, not a bug.
          </div>
        </div>
      </div>
    </div>
  );
}
