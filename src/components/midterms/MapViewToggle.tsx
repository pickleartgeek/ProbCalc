import { RATING_COLOR, RATING_LABEL, RATING_ORDER } from '../../lib/midterms/ratings';
import { MAP_VIEWS, UNIT_VIEWS, marginColor, probabilityColor, rampStops, type MapView, type UnitView } from '../../lib/midterms/mapViews';

interface SegProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: { key: T; label: string; hint?: string }[];
  label: string;
}

/** A small segmented control — the same look wherever a map offers more than one way to read it. */
function Segmented<T extends string>({ value, onChange, options, label }: SegProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-hairline-bright overflow-hidden text-[11px] font-display font-700">
      {options.map((o) => (
        <button
          key={o.key}
          role="radio"
          aria-checked={value === o.key}
          title={o.hint}
          onClick={() => onChange(o.key)}
          className={`px-2.5 py-1 transition-colors ${value === o.key ? 'bg-gold/15 text-gold' : 'text-ink-muted hover:text-ink hover:bg-panel-raised'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const MapViewToggle = (p: { value: MapView; onChange: (v: MapView) => void }) => (
  <Segmented<MapView> value={p.value} onChange={p.onChange} options={MAP_VIEWS} label="Colour the map by" />
);
export const UnitViewToggle = (p: { value: UnitView; onChange: (v: UnitView) => void }) => (
  <Segmented<UnitView> value={p.value} onChange={p.onChange} options={UNIT_VIEWS} label="Colour by" />
);

function Ramp({ stops, left, mid, right }: { stops: string[]; left: string; mid: string; right: string }) {
  return (
    <div className="w-full max-w-[320px]">
      <div className="h-2 rounded-full" style={{ background: `linear-gradient(to right, ${stops.join(',')})` }} />
      <div className="flex justify-between font-data text-[10px] text-ink-dim mt-1"><span>{left}</span><span>{mid}</span><span>{right}</span></div>
    </div>
  );
}

function Swatches({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-1.5 text-[11px] text-ink-muted font-data">
          <span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: i.color }} />{i.label}
        </div>
      ))}
    </div>
  );
}

const RATING_SWATCHES = RATING_ORDER.map((r) => ({ color: RATING_COLOR[r], label: RATING_LABEL[r] }));

/** Legend for a state map view. */
export function MapLegend({ view }: { view: MapView }) {
  if (view === 'rating') return <Swatches items={RATING_SWATCHES} />;
  if (view === 'margin') return <Ramp stops={rampStops((x) => marginColor(x), -20, 20)} left="D+20" mid="even" right="R+20" />;
  return <Ramp stops={rampStops((x) => probabilityColor(x), 0, 1)} left="D certain" mid="50%" right="R certain" />;
}

/** Legend for the county / precinct window. */
export function UnitLegend({ view }: { view: UnitView }) {
  if (view === 'rating') return <Swatches items={RATING_SWATCHES} />;
  if (view === 'winner') return <Swatches items={[{ color: '#3b82f6', label: 'Democratic' }, { color: '#e14b4b', label: 'Republican' }]} />;
  return <Ramp stops={rampStops((x) => marginColor(x, 40), -40, 40)} left="D+40" mid="even" right="R+40" />;
}
