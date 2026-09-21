import { useEffect, useMemo, useState } from 'react';
import type { ElectionConfig, RegionBinding } from '../lib/types';
import { inferPreset, resolveScene, presetById, type PresetId } from '../lib/geo/presets';
import { loadGeometry, isParticipant, type LoadedGeometry, type RegionFeature } from '../lib/geo/loadGeo';
import { loadBaseline, parseBaselineCsv, type RegionBaseline } from '../lib/geo/baselines';
import { matchPartiesToBaseline } from '../lib/geo/partyMatch';
import { unitsFromBaseline, type UnitInput } from '../lib/geo/returns';

export interface GeoScene {
  /** 'abstract' = no geography attached */
  presetId: PresetId | 'abstract';
  /** the geometry preset actually drawn (a single-state US race drills from us-states into us-house) */
  scene: { presetId: PresetId; participants: 'all' | string[]; drilled: boolean } | null;
  geo: LoadedGeometry | null;
  baseline: RegionBaseline | null;
  features: RegionFeature[];
  /** party id -> baseline key ('__rest__' = Others, null = nothing to compare against) after manual overrides */
  mapping: Record<string, string | null>;
  units: UnitInput[];
  prevNational: Record<string, number | undefined>;
  loading: boolean;
  error: string | null;
}

/**
 * The geography a race is attached to, loaded once and shared by the Results maps and Election Night:
 * boundaries, previous-election baseline (a CSV pasted on Build wins over the bundled file), the party↔baseline
 * mapping (auto-matched, then the user's manual overrides), and the per-region previous shares that drive the shifts.
 */
export function useGeoScene(config: ElectionConfig | null, opts: { presetId?: string; focus?: string } = {}): GeoScene {
  const binding: RegionBinding | undefined = config?.regionBinding;
  const presetId = (opts.presetId ?? binding?.presetId ?? inferPreset(config?.region ?? '') ?? 'abstract') as PresetId | 'abstract';
  const focus = opts.focus && opts.focus !== 'all' ? opts.focus : null;
  const participantsKey = focus ?? (binding?.presetId === presetId && binding.participants !== 'all' ? binding.participants.join('|') : 'all');
  const participants: 'all' | string[] = participantsKey === 'all' ? 'all' : participantsKey.split('|');

  const scene = useMemo(() => (presetId === 'abstract' ? null : resolveScene({ presetId, participants })), [presetId, participantsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [state, setState] = useState<{ geo: LoadedGeometry | null; baseline: RegionBaseline | null; error: string | null; loading: boolean }>({ geo: null, baseline: null, error: null, loading: false });
  const csv = binding?.presetId === scene?.presetId ? binding?.baselineCsv : undefined;

  useEffect(() => {
    if (!scene) { setState({ geo: null, baseline: null, error: null, loading: false }); return; }
    let live = true;
    setState((s) => ({ ...s, geo: null, baseline: null, error: null, loading: true }));
    Promise.all([loadGeometry(scene.presetId), loadBaseline(scene.presetId)])
      .then(([geo, bundled]) => {
        if (!live) return;
        let baseline = bundled;
        if (csv) { try { baseline = parseBaselineCsv(csv, geo.features, scene.presetId).baseline; } catch { /* keep the bundled baseline */ } }
        setState({ geo, baseline, error: null, loading: false });
      })
      .catch((e) => live && setState({ geo: null, baseline: null, error: e instanceof Error ? e.message : String(e), loading: false }));
    return () => { live = false; };
  }, [scene?.presetId, csv]); // eslint-disable-line react-hooks/exhaustive-deps

  const partyMap = binding?.partyMap;
  const derived = useMemo(() => {
    if (!config || !scene || !state.geo || !state.baseline) return { features: [] as RegionFeature[], mapping: {} as Record<string, string | null>, units: [] as UnitInput[], prevNational: {} as Record<string, number | undefined> };
    const features = state.geo.features.filter((f) => isParticipant(f, scene.participants));
    const mapping = { ...matchPartiesToBaseline(config.parties, state.baseline.keys), ...(partyMap ?? {}) };
    const { units, prevNational } = unitsFromBaseline(features.map((f) => f.properties), state.baseline, mapping);
    return { features, mapping, units, prevNational };
  }, [config?.parties, scene, state.geo, state.baseline, partyMap]); // eslint-disable-line react-hooks/exhaustive-deps

  return { presetId, scene, geo: state.geo, baseline: state.baseline, loading: state.loading, error: state.error, ...derived };
}

export const presetLabel = (id: string) => presetById(id)?.label ?? id;
