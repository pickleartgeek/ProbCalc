import { useMemo, useState } from 'react';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry } from 'geojson';
import { Link } from 'react-router-dom';
import worldTopo from '../data/countries-110m.json';
import { TRACKED_RACES } from '../lib/seedData';

const WIDTH = 960;
const HEIGHT = 500;

const STATUS_LABEL: Record<string, string> = {
  polling: 'Polling',
  projected: 'Projected',
  called: 'Called',
};

export function WorldMap() {
  const [selectedIso, setSelectedIso] = useState<string | null>(null);

  const raceByIso = useMemo(() => Object.fromEntries(TRACKED_RACES.map((r) => [r.isoNumeric, r])), []);

  const paths = useMemo(() => {
    const topology = worldTopo as any;
    const geo = feature(topology, topology.objects.countries) as unknown as FeatureCollection<Geometry>;
    const projection = geoNaturalEarth1().fitSize([WIDTH, HEIGHT], geo as any);
    const pathGen = geoPath(projection);
    return geo.features.map((f) => ({
      id: String((f as any).id),
      name: (f.properties as any)?.name as string,
      d: pathGen(f as any) ?? '',
    }));
  }, []);

  const selectedRace = selectedIso ? raceByIso[selectedIso] : null;
  const hoveredName = selectedIso ? paths.find((p) => p.id === selectedIso)?.name : null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="font-display font-800 text-3xl mb-1">Polling world map</h1>
      <p className="text-ink-muted mb-8">
        Who's leading in the polling aggregate for every race this engine is tracking. Countries in
        grey aren't tracked yet — head to <Link to="/build" className="text-cyan hover:underline">Build</Link> to add one.
      </p>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-panel border border-hairline rounded-lg p-4">
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" style={{ background: '#0a0e17' }}>
            {paths.map((p) => {
              const race = raceByIso[p.id];
              const isSelected = selectedIso === p.id;
              return (
                <path
                  key={p.id}
                  d={p.d}
                  fill={race ? race.leaderColor : '#1a2233'}
                  fillOpacity={race ? (isSelected ? 1 : 0.85) : 1}
                  stroke={isSelected ? '#f2b705' : '#0a0e17'}
                  strokeWidth={isSelected ? 1.5 : 0.5}
                  className={race ? 'cursor-pointer transition-all duration-150' : ''}
                  onMouseEnter={() => race && setSelectedIso(p.id)}
                  onMouseLeave={() => setSelectedIso(null)}
                  onClick={() => race && setSelectedIso(isSelected ? null : p.id)}
                >
                  <title>{race ? `${p.name} — ${race.leader} leads (${race.leadPct})` : p.name}</title>
                </path>
              );
            })}
          </svg>
          <p className="text-ink-dim text-[11px] font-data mt-2 text-center">
            country-level leader only — district-level detail lives on each race's own map
          </p>
        </div>

        <div className="space-y-4">
          <div className="bg-panel border border-hairline rounded-lg p-5 min-h-[120px]">
            {selectedRace ? (
              <>
                <p className="text-ink-dim text-xs font-data uppercase tracking-wide">{hoveredName}</p>
                <h2 className="font-display font-700 text-lg mb-2">{selectedRace.title}</h2>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: selectedRace.leaderColor }} />
                  <span className="font-medium">{selectedRace.leader}</span>
                  <span className="font-data text-cyan">{selectedRace.leadPct}</span>
                </div>
                <span
                  className={`inline-block text-[10px] font-data uppercase tracking-wide px-1.5 py-0.5 rounded-sm mt-1 ${
                    selectedRace.status === 'called' ? 'bg-red-call/20 text-red-call' : 'bg-gold/15 text-gold'
                  }`}
                >
                  {STATUS_LABEL[selectedRace.status]}
                </span>
              </>
            ) : (
              <p className="text-ink-dim text-sm">Hover or tap a colored country to see who's leading.</p>
            )}
          </div>

          <div className="bg-panel border border-hairline rounded-lg p-5">
            <h3 className="font-display font-700 text-sm mb-3">Tracked races</h3>
            <div className="space-y-2">
              {TRACKED_RACES.map((r) => (
                <button
                  key={r.id}
                  onMouseEnter={() => setSelectedIso(r.isoNumeric)}
                  onMouseLeave={() => setSelectedIso(null)}
                  onClick={() => setSelectedIso(selectedIso === r.isoNumeric ? null : r.isoNumeric)}
                  className={`w-full text-left flex items-center justify-between gap-2 px-2.5 py-2 rounded text-sm transition ${
                    selectedIso === r.isoNumeric ? 'bg-panel-raised border border-hairline-bright' : 'hover:bg-panel-raised border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: r.leaderColor }} />
                    <span className="truncate">{r.region}</span>
                  </span>
                  <span className="font-data text-ink-muted text-xs shrink-0">{r.leader}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
