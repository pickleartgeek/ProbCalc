import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useEngine } from '../state/store';
import { readableOn, allocateSeats } from '../lib/partyColors';
import { PlaceholderMap } from '../components/PlaceholderMap';
import { Hemicycle } from '../components/Hemicycle';

function SwingArrow({ delta }: { delta: number | null }) {
  if (delta === null || Math.abs(delta) < 0.05) {
    return <span className="text-gray-400 text-xs">–</span>;
  }
  const up = delta > 0;
  return (
    <span className={`text-xs font-semibold ${up ? 'text-green-700' : 'text-red-700'}`}>
      {up ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}pp
    </span>
  );
}

export function Infobox() {
  const { config, baseCalcResults, outcomes, candidatePortraits, setCandidatePortrait } = useEngine();
  const [source, setSource] = useState<'base' | number>('base');
  const [candidateNames, setCandidateNames] = useState<Record<string, string>>({});
  const [previousPct, setPreviousPct] = useState<Record<string, string>>({});
  const [totalVotes, setTotalVotes] = useState(1_000_000);
  const [totalSeats, setTotalSeats] = useState(200);

  const isParliamentary = config?.votingSystem === 'DHondt' || config?.votingSystem === 'PartyList';

  const values: Record<string, number> = useMemo(() => {
    if (!baseCalcResults) return {};
    if (source === 'base') return Object.fromEntries(baseCalcResults.map((r) => [r.partyId, r.percentage]));
    const o = outcomes?.[source];
    return o ? o.values : Object.fromEntries(baseCalcResults.map((r) => [r.partyId, r.percentage]));
  }, [source, baseCalcResults, outcomes]);

  if (!config || !baseCalcResults) {
    return <Navigate to="/build" replace />;
  }

  const ranked = config.parties
    .map((p) => ({ p, v: values[p.id] ?? 0 }))
    .sort((a, b) => b.v - a.v);

  const topTwo = ranked.slice(0, 2);
  const tableRows = ranked.slice(0, 8);

  function swingFor(partyId: string, currentFrac: number): number | null {
    const prev = previousPct[partyId];
    if (prev === undefined || prev.trim() === '') return null;
    const prevNum = parseFloat(prev);
    if (isNaN(prevNum)) return null;
    return currentFrac * 100 - prevNum;
  }

  function handleImage(partyId: string, file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCandidatePortrait(partyId, reader.result as string);
    reader.readAsDataURL(file);
  }

  const seatAlloc = isParliamentary
    ? allocateSeats(ranked.map((r) => ({ id: r.p.id, value: r.v })), totalSeats)
    : {};

  const wikitext = isParliamentary
    ? `{{Infobox legislative election
| election_name = ${config.title}
| country = ${config.region}
| type = parliamentary
| seats_needed = ${Math.ceil(totalSeats / 2) + 1}
${tableRows
  .map(
    (r) => `| party${r.p.id} = ${r.p.name}
| colour${r.p.id} = ${r.p.color}
| percentage${r.p.id} = ${(r.v * 100).toFixed(1)}%
| seats${r.p.id} = ${seatAlloc[r.p.id] ?? 0}`
  )
  .join('\n')}
}}`
    : `{{Infobox election
| election_name = ${config.title}
| country = ${config.region}
| type = ${config.votingSystem}
${topTwo
  .map(
    (r, i) => `| candidate${i + 1} = ${candidateNames[r.p.id] || r.p.name}
| party${i + 1} = ${r.p.name}
| colour${i + 1} = ${r.p.color}
| popular_vote${i + 1} = ${Math.round(r.v * totalVotes).toLocaleString()}
| percentage${i + 1} = ${(r.v * 100).toFixed(1)}%`
  )
  .join('\n')}
}}`;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="font-display font-800 text-3xl mb-1">Infobox generator</h1>
      <p className="text-ink-muted mb-8">
        Build a Wikipedia-style results infobox from BaseCalc or a single scenario.
        {isParliamentary ? ' Parliamentary voting system detected — using the seats/hemicycle layout.' : ' Using the head-to-head nominee layout.'}
      </p>

      <div className="grid lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="bg-panel border border-hairline rounded-lg p-5">
            <label className="block text-xs text-ink-dim font-data uppercase mb-2">Data source</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value === 'base' ? 'base' : parseInt(e.target.value, 10))}
              className="w-full bg-panel-raised border border-hairline rounded px-3 py-2 text-sm outline-none mb-3"
            >
              <option value="base">BaseCalc aggregate</option>
              {outcomes &&
                outcomes.slice(0, 200).map((o) => (
                  <option key={o.index} value={o.index}>
                    Scenario #{o.index + 1} — {config.parties.find((p) => p.id === o.winnerId)?.name} ({o.marginType})
                  </option>
                ))}
            </select>
            {!outcomes && <p className="text-ink-dim text-xs mb-3">Run ProbCalc to pick a specific scenario instead.</p>}

            {isParliamentary ? (
              <>
                <label className="block text-xs text-ink-dim font-data uppercase mb-1">Total seats</label>
                <input
                  type="number"
                  value={totalSeats}
                  onChange={(e) => setTotalSeats(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-panel-raised border border-hairline rounded px-3 py-2 text-sm outline-none font-data"
                />
                <p className="text-ink-dim text-[11px] mt-1">
                  Seats are approximated via largest-remainder from vote share — a stand-in for real
                  D'Hondt-by-district allocation, which needs district-level data this build doesn't have yet.
                </p>
              </>
            ) : (
              <>
                <label className="block text-xs text-ink-dim font-data uppercase mb-1">Total votes (for popular vote estimate)</label>
                <input
                  type="number"
                  value={totalVotes}
                  onChange={(e) => setTotalVotes(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-panel-raised border border-hairline rounded px-3 py-2 text-sm outline-none font-data"
                />
              </>
            )}
          </div>

          <div className="bg-panel border border-hairline rounded-lg p-5 space-y-4">
            <h2 className="font-display font-700 text-lg">
              {isParliamentary ? 'Parties, leaders & swing' : 'Candidates, portraits & swing'}
            </h2>
            <p className="text-ink-dim text-[11px] -mt-2">
              "Previous %" is optional — fill it in to compute a swing arrow, like real Wikipedia infoboxes.
            </p>
            {(isParliamentary ? tableRows : topTwo).map(({ p }) => (
              <div key={p.id} className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded bg-panel-raised border-2 flex items-center justify-center overflow-hidden shrink-0"
                  style={{ borderColor: p.color }}
                >
                  {candidatePortraits[p.id] ? (
                    <img src={candidatePortraits[p.id]} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-ink-dim text-[9px] text-center px-1">no photo</span>
                  )}
                </div>
                <div className="flex-1 min-w-0 grid grid-cols-2 gap-2">
                  <input
                    value={candidateNames[p.id] ?? ''}
                    onChange={(e) => setCandidateNames((s) => ({ ...s, [p.id]: e.target.value }))}
                    placeholder={isParliamentary ? `Leader (${p.name})` : `Candidate for ${p.name}`}
                    className="col-span-2 bg-panel-raised border border-hairline rounded px-2 py-1.5 text-sm outline-none"
                  />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImage(p.id, e.target.files?.[0] ?? null)}
                    className="text-xs text-ink-dim col-span-2"
                  />
                  <input
                    type="number"
                    step="0.1"
                    value={previousPct[p.id] ?? ''}
                    onChange={(e) => setPreviousPct((s) => ({ ...s, [p.id]: e.target.value }))}
                    placeholder="Previous %"
                    className="col-span-2 bg-panel-raised border border-hairline rounded px-2 py-1 text-xs outline-none font-data"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Rendered infobox */}
        <div>
          <div className="bg-white text-black rounded-sm overflow-hidden border border-gray-400 max-w-sm mx-auto font-sans text-sm shadow-lg">
            <div className="bg-gray-100 text-center font-bold py-2 border-b border-gray-400 px-3">{config.title}</div>
            <div className="text-center text-[10px] text-gray-500 py-1 border-b border-gray-300">
              {config.region}{config.region ? ' · ' : ''}{new Date(config.electionDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>

            {!isParliamentary ? (
              <>
                <div className="grid grid-cols-2 divide-x divide-gray-300 border-b border-gray-300">
                  {topTwo.map(({ p, v }, i) => {
                    const swing = swingFor(p.id, v);
                    return (
                      <div key={p.id} className="text-center p-3">
                        <div className="w-16 h-16 rounded-full bg-gray-200 mx-auto mb-1 overflow-hidden border-2" style={{ borderColor: p.color }}>
                          {candidatePortraits[p.id] && (
                            <img src={candidatePortraits[p.id]} alt="" className="w-full h-full object-cover" />
                          )}
                        </div>
                        <div className="font-semibold text-xs leading-tight">{candidateNames[p.id] || 'Candidate'}</div>
                        <div className="text-[10px] font-medium" style={{ color: readableOn(p.color, 'light') }}>{p.name}</div>
                        <div className="text-[9px] text-gray-500 mt-1 uppercase tracking-wide">Popular vote</div>
                        <div className="font-data text-xs">{Math.round(v * totalVotes).toLocaleString()}</div>
                        <div className="text-[9px] text-gray-500 uppercase tracking-wide mt-1">Percentage</div>
                        <div className="font-bold text-base" style={{ color: readableOn(p.color, 'light') }}>{(v * 100).toFixed(1)}%</div>
                        <div className="text-[9px] text-gray-500 uppercase tracking-wide mt-1">Swing</div>
                        <SwingArrow delta={swing} />
                        {i === 0 && <div className="text-[9px] uppercase text-green-700 font-bold mt-1">Winner</div>}
                      </div>
                    );
                  })}
                </div>
                <div className="h-3 flex">
                  {ranked.map(({ p, v }) => (
                    <div key={p.id} style={{ background: p.color, width: `${v * 100}%` }} />
                  ))}
                </div>
              </>
            ) : (
              <div className="p-3">
                <div className="flex justify-center mb-2">
                  <Hemicycle segments={ranked.map((r) => ({ color: r.p.color, value: r.v }))} size={200} />
                </div>
                <table className="w-full text-[10px] border-t border-gray-300">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-300">
                      <th className="py-1 font-medium">Party</th>
                      <th className="py-1 font-medium text-right">%</th>
                      <th className="py-1 font-medium text-right">Seats</th>
                      <th className="py-1 font-medium text-right">Swing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map(({ p, v }) => (
                      <tr key={p.id} className="border-b border-gray-100">
                        <td className="py-1 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-sm inline-block shrink-0" style={{ background: p.color }} />
                          <span className="truncate">{candidateNames[p.id] ? `${p.name} (${candidateNames[p.id]})` : p.name}</span>
                        </td>
                        <td className="py-1 text-right font-data">{(v * 100).toFixed(1)}</td>
                        <td className="py-1 text-right font-data font-semibold">{seatAlloc[p.id] ?? 0}</td>
                        <td className="py-1 text-right"><SwingArrow delta={swingFor(p.id, v)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="border-t border-gray-300 p-2">
              <div className="text-[9px] text-gray-500 uppercase tracking-wide text-center mb-1">
                {isParliamentary ? 'Seats by district' : 'Results by district'}
              </div>
              <div className="bg-gray-900 rounded p-1.5">
                <PlaceholderMap
                  parties={config.parties}
                  shares={values}
                  mode="base"
                  cols={12}
                  rows={7}
                  compact
                />
              </div>
            </div>

            <div className="border-t border-gray-300 p-2 text-center text-[10px]">
              <span className="text-gray-500">{isParliamentary ? 'Largest party' : 'Winner'}: </span>
              <span className="font-semibold" style={{ color: readableOn(ranked[0].p.color, 'light') }}>
                {candidateNames[ranked[0].p.id] || ranked[0].p.name}
              </span>
              <span className="text-gray-500"> ({ranked[0].p.name})</span>
            </div>
          </div>

          <div className="mt-6 bg-panel border border-hairline rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display font-700 text-sm">Wikitext</h3>
              <button
                onClick={() => navigator.clipboard.writeText(wikitext)}
                className="text-xs px-2 py-1 border border-hairline-bright rounded hover:bg-panel-raised"
              >
                Copy
              </button>
            </div>
            <pre className="text-[11px] font-data text-ink-muted whitespace-pre-wrap overflow-x-auto">{wikitext}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}
