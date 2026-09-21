import { useEffect, useMemo, useState } from 'react';
import type { RegionBinding } from '../../lib/types';
import { REGION_PRESETS, inferPreset, presetById } from '../../lib/geo/presets';
import { loadGeometry, type LoadedGeometry } from '../../lib/geo/loadGeo';
import { parseBaselineCsv } from '../../lib/geo/baselines';

interface Props {
  value: RegionBinding | undefined;
  regionText: string;
  onChange: (b: RegionBinding | undefined) => void;
}

/** "Region / Geography Preset" — links a race to real boundaries + previous-election data for election night. */
export function RegionPresetPicker({ value, regionText, onChange }: Props) {
  const [geo, setGeo] = useState<LoadedGeometry | null>(null);
  const [filter, setFilter] = useState('');
  const [csvNote, setCsvNote] = useState<string | null>(null);
  const preset = presetById(value?.presetId);
  const suggested = !value ? inferPreset(regionText) : null;

  useEffect(() => {
    if (!value) { setGeo(null); return; }
    let live = true;
    loadGeometry(value.presetId).then((g) => live && setGeo(g)).catch(() => live && setGeo(null));
    return () => { live = false; };
  }, [value?.presetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => (geo ? [...new Set(geo.features.map((f) => f.properties.group).filter((g): g is string => !!g))].sort() : []), [geo]);
  const selected = value && value.participants !== 'all' ? value.participants : [];
  const shown = groups.filter((g) => g.toLowerCase().includes(filter.toLowerCase()));

  const toggle = (g: string) => {
    if (!value) return;
    const next = selected.includes(g) ? selected.filter((x) => x !== g) : [...selected, g];
    onChange({ ...value, participants: next.length ? next : 'all' });
  };

  function handleCsv(text: string) {
    if (!value || !geo) return;
    if (!text.trim()) { setCsvNote(null); onChange({ ...value, baselineCsv: undefined }); return; }
    try {
      const { baseline, unmatched } = parseBaselineCsv(text, geo.features, value.presetId);
      setCsvNote(`Matched ${Object.keys(baseline.regions).length} ${preset?.unit ?? 'region'}s${unmatched.length ? `; ${unmatched.length} unmatched (${unmatched.slice(0, 3).join(', ')}${unmatched.length > 3 ? '…' : ''})` : ''}.`);
      onChange({ ...value, baselineCsv: text });
    } catch (e) {
      setCsvNote(e instanceof Error ? e.message : 'Could not read that CSV.');
    }
  }

  return (
    <div className="bg-panel border border-hairline rounded-lg p-5">
      <h2 className="font-display font-700 text-lg mb-1">Region / Geography preset</h2>
      <p className="text-ink-dim text-xs mb-3">
        Attach real boundaries and previous-election results so Election Night lands on the map at the smallest division available.
      </p>
      <select
        value={value?.presetId ?? ''}
        onChange={(e) => onChange(e.target.value ? { presetId: e.target.value, participants: 'all' } : undefined)}
        className="w-full bg-panel-raised border border-hairline rounded px-3 py-2 text-sm outline-none focus:border-hairline-bright"
        aria-label="Region / Geography preset"
      >
        <option value="">None (abstract grid)</option>
        {REGION_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      {suggested && (
        <button onClick={() => onChange({ presetId: suggested, participants: 'all' })} className="mt-2 text-xs text-cyan hover:underline">
          “{regionText}” looks like {presetById(suggested)?.label} — attach it
        </button>
      )}
      {preset && (
        <div className="mt-3 space-y-3">
          <p className="text-[11px] font-data text-ink-dim leading-snug">{preset.baselineNote}</p>
          {groups.length > 1 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-ink-dim font-data uppercase">Participating {preset.groupLabel.toLowerCase()}s</span>
                <button onClick={() => onChange({ ...value!, participants: 'all' })} className={`text-xs ${selected.length === 0 ? 'text-gold' : 'text-cyan hover:underline'}`}>
                  {selected.length === 0 ? 'All participate' : `Clear (${selected.length})`}
                </button>
              </div>
              {groups.length > 12 && (
                <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter…" className="w-full mb-1.5 bg-panel-raised border border-hairline rounded px-2 py-1 text-xs" />
              )}
              <div className="max-h-36 overflow-y-auto grid grid-cols-2 gap-x-3 gap-y-0.5 pr-1">
                {shown.map((g) => (
                  <label key={g} className="flex items-center gap-1.5 text-xs cursor-pointer truncate">
                    <input type="checkbox" checked={selected.includes(g)} onChange={() => toggle(g)} className="accent-gold" />
                    <span className="truncate">{g}</span>
                  </label>
                ))}
              </div>
              {preset.id === 'us-states' && selected.length > 0 && selected.length <= 4 && (
                <p className="text-[11px] text-ink-dim mt-1.5">Election Night will drill into these states' House districts.</p>
              )}
            </div>
          )}
          <details>
            <summary className="text-xs text-ink-muted cursor-pointer hover:text-ink">Use my own previous results (CSV)</summary>
            <textarea
              defaultValue={value?.baselineCsv ?? ''}
              onChange={(e) => handleCsv(e.target.value)}
              rows={4}
              placeholder={`${preset.unit} id or name, then one column per party (counts or %), optional votes column\nVarna,30,20,250000`}
              className="w-full mt-2 bg-panel-raised border border-hairline rounded px-2 py-1.5 text-[11px] font-data"
            />
            {csvNote && <p className="text-[11px] font-data text-ink-dim mt-1">{csvNote}</p>}
          </details>
        </div>
      )}
    </div>
  );
}
