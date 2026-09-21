import { useEffect, useMemo, useRef, useState, useCallback, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { select } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity, type D3ZoomEvent, type ZoomTransform } from 'd3-zoom';
import { PrecinctIndex } from '../../lib/precinct/spatialIndex';
import type { ColorScale, ProjectedFeature, ProjectedLayer } from '../../lib/precinct/types';

interface Props {
  layer: ProjectedLayer | null;
  /** Fill color per feature. Return the SAME string for features that should share a fill batch — this is what keeps 100k polygons fast: far fewer canvas fill() calls than polygons. */
  colorScale: ColorScale;
  values?: Record<string, number | undefined>;
  onHover?: (feature: ProjectedFeature | null) => void;
  onClick?: (feature: ProjectedFeature, event: ReactMouseEvent) => void;
  strokeColor?: string;
  background?: string;
  className?: string;
  /** Floating tooltip content for the precinct under the cursor. Owned by the canvas, so hovering never re-renders (or re-fits) the parent. */
  tooltip?: (feature: ProjectedFeature) => ReactNode;
  /** Bump to force a repaint when colours changed but the layer did not (e.g. election-night playback). */
  drawVersion?: number;
  /** Zoom +/−/reset buttons. Default on. */
  controls?: boolean;
  /** Surfaces perf numbers for tuning — the demo/stress-test page uses this. */
  onFrameStats?: (stats: { drawn: number; total: number; ms: number }) => void;
}

// A dedicated hidden canvas rendered with one flat, unique color per feature.
// Reading back a single pixel under the cursor is an O(1) hit test regardless
// of polygon count — no per-polygon point-in-polygon math needed at 100k scale.
function idToColor(i: number): [number, number, number] {
  return [(i >> 16) & 255, (i >> 8) & 255, i & 255];
}
function colorToId(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}

export function PrecinctCanvas({
  layer,
  colorScale,
  values,
  onHover,
  onClick,
  strokeColor = 'rgba(10,14,23,0.5)',
  background = 'transparent',
  className,
  tooltip,
  drawVersion = 0,
  controls = true,
  onFrameStats,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pickCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const indexRef = useRef<PrecinctIndex | null>(null);
  const rafRef = useRef<number | null>(null);
  const zoomBehaviorRef = useRef<ReturnType<typeof d3zoom<HTMLDivElement, unknown>> | null>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [fitTick, setFitTick] = useState(0);
  const hoverCanvasRef = useRef<HTMLCanvasElement>(null);
  const hoverRef = useRef<ProjectedFeature | null>(null);
  const [hover, setHover] = useState<{ f: ProjectedFeature; x: number; y: number } | null>(null);

  // What "the same layer" means for view purposes: same geometry footprint. A caller that hands over a fresh
  // object with identical content on every render (this used to reset zoom on every hover) must not move the camera.
  const layerKey = useMemo(() => {
    if (!layer) return '';
    const f = layer.features;
    return `${f.length}|${layer.bounds.map((n) => Math.round(n)).join(',')}|${f[0]?.id}|${f[f.length - 1]?.id}`;
  }, [layer]);

  useEffect(() => {
    indexRef.current = layer ? new PrecinctIndex(layer) : null;
  }, [layer]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setSize({ w: Math.max(1, box.width), h: Math.max(1, box.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Latest render-time values, read fresh inside drawMain/drawPick without
  // making those callbacks (and therefore the zoom-listener effect below)
  // change identity on every prop update. Recreating the zoom behavior on
  // every render was the actual bug behind the bad perf numbers earlier —
  // it kept cancelling the debounced picking-canvas rebuild before it could
  // ever fire, and re-scheduled draws in a feedback loop with onFrameStats.
  const colorScaleRef = useRef(colorScale);
  colorScaleRef.current = colorScale;
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const strokeColorRef = useRef(strokeColor);
  strokeColorRef.current = strokeColor;
  const backgroundRef = useRef(background);
  backgroundRef.current = background;
  const onFrameStatsRef = useRef(onFrameStats);
  onFrameStatsRef.current = onFrameStats;

  // Fast path: batched-fill main canvas only. This is what runs on every
  // rAF tick during an active pan/zoom, so it has to stay cheap regardless
  // of polygon count — a handful of fill() calls (one per color bucket),
  // never one per polygon.
  const drawMain = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layer || !indexRef.current) return;
    const t0 = performance.now();
    const colorScale = colorScaleRef.current;
    const values = valuesRef.current;
    const strokeColor = strokeColorRef.current;
    const background = backgroundRef.current;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    const ctx = canvas.getContext('2d')!;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (background !== 'transparent') {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, size.w, size.h);
    } else {
      ctx.clearRect(0, 0, size.w, size.h);
    }

    const t = transformRef.current;
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);

    const vx0 = -t.x / t.k;
    const vy0 = -t.y / t.k;
    const vx1 = (size.w - t.x) / t.k;
    const vy1 = (size.h - t.y) / t.k;
    const visible = indexRef.current.query(vx0, vy0, vx1, vy1);

    const buckets = new Map<string, ProjectedFeature[]>();
    for (const f of visible) {
      const color = colorScale(values?.[f.id], f);
      if (!buckets.has(color)) buckets.set(color, []);
      buckets.get(color)!.push(f);
    }

    ctx.lineWidth = 1 / t.k;
    ctx.strokeStyle = strokeColor;

    // Counterintuitively, one mega-path per color bucket is *slower* than
    // many small ones — Skia's fill cost scales worse than linearly with
    // subpath count once a path has thousands of disjoint contours.
    // Benchmarked: 29k polygons as 1 path ≈ 4.4s; as ~2,900 paths of 10 ≈
    // 8ms. CHUNK below is that empirical sweet spot, not a guess.
    const CHUNK = 10;
    for (const [color, feats] of buckets) {
      ctx.fillStyle = color;
      for (let i = 0; i < feats.length; i += CHUNK) {
        ctx.beginPath();
        for (let j = i; j < Math.min(i + CHUNK, feats.length); j++) {
          for (const ring of feats[j].rings) {
            ctx.moveTo(ring[0], ring[1]);
            for (let k = 2; k < ring.length; k += 2) ctx.lineTo(ring[k], ring[k + 1]);
            ctx.closePath();
          }
        }
        ctx.fill();
        if (t.k > 3) ctx.stroke();
      }
    }
    ctx.restore();

    onFrameStatsRef.current?.({ drawn: visible.length, total: layer.features.length, ms: performance.now() - t0 });
    return visible;
  }, [layer, size]);

  // Slow path: the picking canvas needs a unique flat color per polygon, so
  // it needs one fill() call per polygon — genuinely can't be batched. Only
  // rebuild it once interaction has settled, not on every drag frame.
  const drawPick = useCallback(() => {
    const pickCanvas = pickCanvasRef.current;
    if (!pickCanvas || !layer || !indexRef.current) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    pickCanvas.width = size.w * dpr;
    pickCanvas.height = size.h * dpr;
    const pctx = pickCanvas.getContext('2d', { willReadFrequently: true })!;
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pctx.clearRect(0, 0, size.w, size.h);

    const t = transformRef.current;
    pctx.translate(t.x, t.y);
    pctx.scale(t.k, t.k);

    const vx0 = -t.x / t.k;
    const vy0 = -t.y / t.k;
    const vx1 = (size.w - t.x) / t.k;
    const vy1 = (size.h - t.y) / t.k;
    const visible = indexRef.current.query(vx0, vy0, vx1, vy1);

    const idOf = new Map<number, ProjectedFeature>();
    visible.forEach((f, i) => {
      idOf.set(i + 1, f);
      const [r, g, b] = idToColor(i + 1);
      pctx.beginPath();
      for (const ring of f.rings) {
        pctx.moveTo(ring[0], ring[1]);
        for (let j = 2; j < ring.length; j += 2) pctx.lineTo(ring[j], ring[j + 1]);
        pctx.closePath();
      }
      pctx.fillStyle = `rgb(${r},${g},${b})`;
      pctx.fill();
    });
    (pickCanvas as unknown as { __idOf?: Map<number, ProjectedFeature> }).__idOf = idOf;
  }, [layer, size]);

  const pickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedulePick = useCallback(() => {
    if (pickTimerRef.current) clearTimeout(pickTimerRef.current);
    pickTimerRef.current = setTimeout(() => latestDrawPickRef.current(), 150);
  }, []);

  // Always call the LATEST drawMain/schedulePick from inside a pending rAF,
  // never the closure that scheduled it. Without this, two prop updates
  // landing in the same animation frame (e.g. a ResizeObserver measurement
  // and an async fetch resolving into a new `layer`, both of which happen
  // here) can silently drop the second draw: scheduleDraw's own dedup guard
  // (`if (rafRef.current != null) return`) coalesces the second request
  // into the first, but the first request's callback closed over the FIRST
  // commit's (stale) drawMain — so the frame fires, "succeeds," and the
  // canvas is left showing the pre-data-arriving state indefinitely, with
  // no further redraw ever triggered since nothing else changes afterward.
  const latestDrawMainRef = useRef(drawMain);
  latestDrawMainRef.current = drawMain;
  const latestDrawPickRef = useRef(drawPick);
  latestDrawPickRef.current = drawPick;

  // Outline of the precinct under the cursor, on its own transparent canvas so moving the mouse never repaints the map.
  const drawHighlight = useCallback(() => {
    const c = hoverCanvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== size.w * dpr || c.height !== size.h * dpr) { c.width = size.w * dpr; c.height = size.h * dpr; }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    const f = hoverRef.current;
    if (!f) return;
    const t = transformRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);
    ctx.beginPath();
    for (const ring of f.rings) {
      ctx.moveTo(ring[0], ring[1]);
      for (let j = 2; j < ring.length; j += 2) ctx.lineTo(ring[j], ring[j + 1]);
      ctx.closePath();
    }
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3 / t.k;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.stroke();
    ctx.lineWidth = 1.6 / t.k;
    ctx.strokeStyle = '#f2b705';
    ctx.stroke();
  }, [size]);
  const latestHighlightRef = useRef(drawHighlight);
  latestHighlightRef.current = drawHighlight;

  const scheduleDraw = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      latestDrawMainRef.current();
      schedulePick();
    });
  }, [schedulePick]);

  useEffect(() => {
    scheduleDraw();
  }, [scheduleDraw, layer, drawVersion]);

  useEffect(() => {
    const overlay = containerRef.current;
    if (!overlay) return;
    const sel = select(overlay);
    const zoomBehavior = d3zoom<HTMLDivElement, unknown>()
      .scaleExtent([0.02, 40])
      .on('zoom', (event: D3ZoomEvent<HTMLDivElement, unknown>) => {
        transformRef.current = event.transform;
        latestHighlightRef.current();
        // During active drag/zoom, only the cheap batched-fill canvas
        // repaints every frame; picking catches up 150ms after it settles.
        // Same latest-ref indirection as scheduleDraw above, for the same reason.
        if (rafRef.current == null) {
          rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            latestDrawMainRef.current();
          });
        }
        schedulePick();
      });
    sel.call(zoomBehavior);
    zoomBehaviorRef.current = zoomBehavior;
    return () => {
      sel.on('.zoom', null);
      if (pickTimerRef.current) clearTimeout(pickTimerRef.current);
    };
  }, [drawMain, schedulePick]);

  // Fit the view to whatever layer just loaded. Without this, a new layer
  // starts at zoomIdentity (scale 1, no translate) — fine by coincidence for
  // data that's spread uniformly across the full reference canvas, but wrong
  // for anything concentrated in one region of that space (a single country's
  // shape sitting inside a larger reference bounding box, say), where you'd
  // otherwise be looking at an empty corner.
  const fittedKeyRef = useRef('');
  const layerRef = useRef(layer);
  layerRef.current = layer;
  const fittedSizeRef = useRef({ w: 0, h: 0 });
  useEffect(() => {
    const overlay = containerRef.current;
    const zoomBehavior = zoomBehaviorRef.current;
    const layer = layerRef.current;
    if (!overlay || !zoomBehavior || !layer) return;
    const sizeChangedALot =
      Math.abs(size.w - fittedSizeRef.current.w) > fittedSizeRef.current.w * 0.2 ||
      Math.abs(size.h - fittedSizeRef.current.h) > fittedSizeRef.current.h * 0.2;
    if (fittedKeyRef.current === layerKey && !sizeChangedALot) return; // never fight the user's own pan/zoom
    fittedKeyRef.current = layerKey;
    fittedSizeRef.current = { w: size.w, h: size.h };
    const [minX, minY, maxX, maxY] = layer.bounds;
    const contentW = Math.max(1, maxX - minX);
    const contentH = Math.max(1, maxY - minY);
    const pad = 0.92; // small margin so edges aren't flush against the frame
    const k = Math.min((size.w / contentW) * pad, (size.h / contentH) * pad);
    const tx = size.w / 2 - k * (minX + contentW / 2);
    const ty = size.h / 2 - k * (minY + contentH / 2);
    const fitTransform = zoomIdentity.translate(tx, ty).scale(k);
    select(overlay).call(zoomBehavior.transform, fitTransform);
  }, [layerKey, size.w, size.h, fitTick]);

  function pick(clientX: number, clientY: number): ProjectedFeature | null {
    const pickCanvas = pickCanvasRef.current;
    // Use the container's rect, not the (display:none) pick canvas's own —
    // a display:none element always reports a zeroed bounding rect.
    const rect = containerRef.current?.getBoundingClientRect();
    if (!pickCanvas || !rect) return null;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const x = (clientX - rect.left) * dpr;
    const y = (clientY - rect.top) * dpr;
    const pctx = pickCanvas.getContext('2d', { willReadFrequently: true })!;
    const data = pctx.getImageData(x, y, 1, 1).data;
    const id = colorToId(data[0], data[1], data[2]);
    if (id === 0) return null;
    const idOf = (pickCanvas as unknown as { __idOf?: Map<number, ProjectedFeature> }).__idOf;
    return idOf?.get(id) ?? null;
  }

  const lastPickRef = useRef({ x: -99, y: -99 });
  function handleMove(e: ReactMouseEvent<HTMLDivElement>) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // pick() reads a pixel back from the picking canvas — skip it for sub-pixel jitter
    if (Math.abs(x - lastPickRef.current.x) < 1.5 && Math.abs(y - lastPickRef.current.y) < 1.5) return;
    lastPickRef.current = { x, y };
    const f = pick(e.clientX, e.clientY);
    onHover?.(f);
    if (hoverRef.current !== f) {
      hoverRef.current = f;
      latestHighlightRef.current();
    }
    setHover((prev) => (f ? { f, x, y } : prev ? null : prev));
  }
  function handleLeave() {
    hoverRef.current = null;
    latestHighlightRef.current();
    setHover(null);
    onHover?.(null);
  }
  const zoomBy = (factor: number) => {
    const overlay = containerRef.current;
    const zb = zoomBehaviorRef.current;
    if (overlay && zb) select(overlay).call(zb.scaleBy, factor);
  };
  const resetView = () => {
    fittedKeyRef.current = '';
    setFitTick((t) => t + 1); // re-run the fit effect
  };

  // keep the tooltip inside the frame: flip to the left / above near the right / bottom edge
  const tipStyle = hover
    ? {
        left: hover.x > size.w - 250 ? Math.max(4, hover.x - 236) : hover.x + 14,
        top: hover.y > size.h - 170 ? Math.max(4, hover.y - 150) : hover.y + 14,
      }
    : undefined;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'relative', width: '100%', height: '100%', touchAction: 'none' }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <canvas ref={pickCanvasRef} style={{ display: 'none' }} />
      <canvas ref={hoverCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
      <div
        style={{ position: 'absolute', inset: 0, cursor: 'pointer' }}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        onClick={(e) => {
          const f = pick(e.clientX, e.clientY);
          if (f) onClick?.(f, e);
        }}
      />
      {controls && (
        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4, zIndex: 5 }} onMouseMove={(e) => e.stopPropagation()}>
          {([['+', () => zoomBy(1.6), 'Zoom in'], ['−', () => zoomBy(1 / 1.6), 'Zoom out'], ['⤢', resetView, 'Reset view']] as const).map(([label, fn, title]) => (
            <button key={title} title={title} aria-label={title} onClick={fn}
              style={{ width: 26, height: 26, borderRadius: 4, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(10,14,23,0.85)', color: '#cbd5e1', fontSize: 14, lineHeight: 1, cursor: 'pointer' }}>
              {label}
            </button>
          ))}
        </div>
      )}
      {hover && tooltip && tipStyle && (
        <div
          role="tooltip"
          data-testid="precinct-tooltip"
          style={{ position: 'absolute', zIndex: 20, pointerEvents: "none", maxWidth: 270, ...tipStyle }}
          className="bg-panel-raised/95 border border-hairline-bright rounded-md shadow-lg px-3 py-2 text-xs font-data"
        >
          {tooltip(hover.f)}
        </div>
      )}
    </div>
  );
}
