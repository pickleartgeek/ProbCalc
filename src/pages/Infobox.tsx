import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useEngine } from '../state/store';
import { readableOn, allocateSeats } from '../lib/partyColors';
import { PlaceholderMap } from '../components/PlaceholderMap';
import { InfoboxMap } from '../components/infobox/InfoboxMap';
import { useInfoboxMap } from '../hooks/useInfoboxMap';
import { isTwoPartyBaseline } from '../lib/geo/returns';
import { cleanPersonName, fetchWikiImage, type WikiImage } from '../lib/infobox/wikiImage';

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

  // lead images fetched from Wikipedia, per party: the file name goes into the wikitext, the URL into the preview
  const [wikiImages, setWikiImages] = useState<Record<string, WikiImage | 'none' | 'loading'>>({});
  const mapSvg = useRef<SVGSVGElement>(null);
  const nameOf = (p: { id: string; name: string }) => candidateNames[p.id] ?? (/\([A-Za-z]{1,4}\)\s*$/.test(p.name) ? cleanPersonName(p.name) : '');

  async function fetchImageFor(p: { id: string; name: string }, query: string) {
    if (!query.trim()) return;
    setWikiImages((m) => ({ ...m, [p.id]: 'loading' }));
    const hit = await fetchWikiImage(query);
    setWikiImages((m) => ({ ...m, [p.id]: hit ?? 'none' }));
    if (hit) setCandidatePortrait(p.id, hit.url);
  }

  const values: Record<string, number> = useMemo(() => {
    if (!baseCalcResults) return {};
    if (source === 'base') return Object.fromEntries(baseCalcResults.map((r) => [r.partyId, r.percentage]));
    const o = outcomes?.[source];
    return o ? o.values : Object.fromEntries(baseCalcResults.map((r) => [r.partyId, r.percentage]));
  }, [source, baseCalcResults, outcomes]);

  const map = useInfoboxMap(config ?? null, values, `${config?.id ?? 'x'}-infobox-${source}`);

  // debounce-fetch an image whenever a name is typed (and for candidate-named parties like "Jon Ossoff (D)" right away)
  const wantNames = config ? config.parties.slice(0, 8).map((p) => `${p.id}\u0000${nameOf(p)}`).join('\u0001') : '';
  useEffect(() => {
    if (!config) return;
    const id = setTimeout(() => {
      for (const p of config.parties.slice(0, 8)) {
        const n = nameOf(p);
        if (n && wikiImages[p.id] === undefined && !candidatePortraits[p.id]) void fetchImageFor(p, n);
      }
    }, 700);
    return () => clearTimeout(id);
  }, [wantNames]); // eslint-disable-line react-hooks/exhaustive-deps

  const isParliamentary = config?.votingSystem === 'DHondt' || config?.votingSystem === 'PartyList' || map.seatBased;

  if (!config || !baseCalcResults) {
    return <Navigate to="/build" replace />;
  }

  const ranked = config.parties
    .map((p) => ({ p, v: values[p.id] ?? 0 }))
    .sort((a, b) => b.v - a.v);

  const topTwo = ranked.slice(0, 2);

  function swingFor(partyId: string, currentFrac: number): number | null {
    const prev = previousPct[partyId];
    if (prev === undefined || prev.trim() === '') {
      // no hand-entered figure: use the measured previous election from the attached geography (multi-party baselines only —
      // a two-party D/R baseline isn't comparable to poll shares that include undecideds)
      const b = map.scene.baseline;
      const base = b && b.kind === 'measured' && !isTwoPartyBaseline(b.keys) ? map.scene.prevNational[partyId] : undefined;
      return base === undefined ? null : currentFrac * 100 - base * 100;
    }
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

  // Seats: counted off the map where the geography is single-winner seats (UK constituencies, US House); otherwise a stand-in
  const seatTotal = map.seats ? map.regions : totalSeats;
  const seatAlloc: Record<string, number> = isParliamentary
    ? map.seats ?? allocateSeats(ranked.map((r) => ({ id: r.p.id, value: r.v })), totalSeats)
    : {};
  // previous seats, for the "seat change" row, from the baseline's recorded winners (the UK file has them)
  const prevSeats: Record<string, number> | null = (() => {
    const b = map.scene.baseline;
    if (!b || !map.seats || !Object.values(b.regions).some((r) => r.winner)) return null;
    const byKey: Record<string, number> = {};
    for (const r of Object.values(b.regions)) if (r.winner) byKey[r.winner] = (byKey[r.winner] ?? 0) + 1;
    const out: Record<string, number> = {};
    for (const [pid, key] of Object.entries(map.scene.mapping)) if (key && key !== '__rest__') out[pid] = byKey[key] ?? 0;
    return out;
  })();
  const seatChange = (pid: string): number | null => (prevSeats && pid in prevSeats ? (seatAlloc[pid] ?? 0) - prevSeats[pid] : null);

  const cols = (isParliamentary ? ranked.slice(0, 3) : topTwo);
  const imgOf = (pid: string): string | undefined => candidatePortraits[pid];
  const wikiFile = (pid: string) => { const w = wikiImages[pid]; return w && w !== 'none' && w !== 'loading' ? w.file : ''; };
  const dateText = new Date(config.electionDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const majority = Math.floor(seatTotal / 2) + 1;
  const fmtSigned = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n)}`;

  function downloadMap() {
    const el = mapSvg.current;
    if (!el) return;
    const blob = new Blob([new XMLSerializer().serializeToString(el)], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${config!.id}-results-map.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const wikitext = isParliamentary
    ? `{{Infobox legislative election
| election_name = ${config.title}
| country = ${config.region}
| type = parliamentary
| election_date = ${dateText}
| seats_for_election = All ${seatTotal} seats in the legislature
| majority_seats = ${majority}
${cols
  .map(
    (r, i) => `| leader${i + 1} = ${nameOf(r.p) || ''}
| image${i + 1} = ${wikiFile(r.p.id)}
| party${i + 1} = ${r.p.name}
| colour${i + 1} = ${r.p.color.replace('#', '')}
| seats${i + 1} = ${seatAlloc[r.p.id] ?? 0}
${seatChange(r.p.id) !== null ? `| seat_change${i + 1} = ${fmtSigned(seatChange(r.p.id)!)}\n` : ''}| popular_vote${i + 1} = ${Math.round(r.v * totalVotes).toLocaleString()}
| percentage${i + 1} = ${(r.v * 100).toFixed(1)}%
| swing${i + 1} = ${swingFor(r.p.id, r.v) === null ? '' : `${swingFor(r.p.id, r.v)! > 0 ? '+' : ''}${swingFor(r.p.id, r.v)!.toFixed(1)}pp`}`
  )
  .join('\n')}
| map_image = <!-- upload the downloaded results map to Commons and put its file name here -->
| map_caption = Results by ${map.scene.geo?.preset.unit ?? 'district'}
}}`
    : `{{Infobox election
| election_name = ${config.title}
| country = ${config.region}
| type = ${config.votingSystem}
| election_date = ${dateText}
${topTwo
  .map(
    (r, i) => `| candidate${i + 1} = ${nameOf(r.p) || r.p.name}
| image${i + 1} = ${wikiFile(r.p.id)}
| party${i + 1} = ${r.p.name}
| colour${i + 1} = ${r.p.color.replace('#', '')}
| popular_vote${i + 1} = ${Math.round(r.v * totalVotes).toLocaleString()}
| percentage${i + 1} = ${(r.v * 100).toFixed(1)}%`
  )
  .join('\n')}
| map_image = <!-- upload the downloaded results map to Commons and put its file name here -->
}}`;

  const label = 'text-[11px] text-gray-600 bg-[#f8f9fa] px-2 py-1 font-semibold align-top whitespace-nowrap';
  const cell = 'px-2 py-1 text-center align-top border-l border-[#eaecf0]';
  const unitName = map.scene.geo?.preset.unit ?? 'district';
  const plural = (w: string) => (/y$/.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="font-display font-800 text-3xl mb-1">Infobox generator</h1>
      <p className="text-ink-muted mb-8">
        Build a Wikipedia-style results infobox from BaseCalc or a single scenario — with a real results map and lead images fetched from Wikipedia.
        {isParliamentary ? ' Legislative layout: seats are counted off the map where the geography is single-winner seats.' : ' Using the head-to-head nominee layout.'}
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

            {map.seats ? (
              <p className="text-ink-dim text-[11px]">
                {map.regions} {plural(unitName)} on the {map.scene.geo?.preset.label ?? 'attached'} map — each goes to the party that leads there once the aggregate is
                applied to the previous election, so seat counts are real counts, not a share approximation.
              </p>
            ) : isParliamentary ? (
              <>
                <label className="block text-xs text-ink-dim font-data uppercase mb-1">Total seats</label>
                <input
                  type="number"
                  value={totalSeats}
                  onChange={(e) => setTotalSeats(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-panel-raised border border-hairline rounded px-3 py-2 text-sm outline-none font-data"
                />
                <p className="text-ink-dim text-[11px] mt-1">
                  Seats are approximated via largest-remainder from vote share — a stand-in for real D'Hondt-by-district allocation.
                </p>
              </>
            ) : null}
            {(!isParliamentary || map.seats) && (
              <>
                <label className="block text-xs text-ink-dim font-data uppercase mb-1 mt-3">Total votes (for popular vote estimate)</label>
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
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display font-700 text-lg">{isParliamentary ? 'Parties, leaders & swing' : 'Candidates, portraits & swing'}</h2>
              <button
                onClick={() => cols.forEach((c) => { const n = nameOf(c.p); if (n) void fetchImageFor(c.p, n); })}
                className="text-xs px-2 py-1 border border-hairline-bright rounded hover:bg-panel-raised shrink-0"
              >
                Fetch all images
              </button>
            </div>
            <p className="text-ink-dim text-[11px] -mt-2">
              Type a name and its lead image is looked up on Wikipedia automatically (check the matched article — namesakes happen). "Previous %" is optional: fill it in for a swing arrow.
            </p>
            {cols.map(({ p }) => {
              const w = wikiImages[p.id];
              return (
                <div key={p.id} className="flex items-start gap-3">
                  <div className="w-14 h-16 rounded bg-panel-raised border-2 flex items-center justify-center overflow-hidden shrink-0" style={{ borderColor: p.color }}>
                    {imgOf(p.id) ? (
                      <img src={imgOf(p.id)} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-ink-dim text-[9px] text-center px-1">{w === 'loading' ? 'fetching…' : 'no photo'}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 grid grid-cols-2 gap-2">
                    <div className="col-span-2 flex gap-2">
                      <input
                        value={candidateNames[p.id] ?? nameOf(p)}
                        onChange={(e) => { setCandidateNames((m) => ({ ...m, [p.id]: e.target.value })); setWikiImages((m) => { const { [p.id]: _drop, ...rest } = m; return rest; }); }}
                        placeholder={isParliamentary ? `Leader (${p.name})` : `Candidate for ${p.name}`}
                        className="flex-1 min-w-0 bg-panel-raised border border-hairline rounded px-2 py-1.5 text-sm outline-none"
                      />
                      <button onClick={() => void fetchImageFor(p, nameOf(p))} disabled={!nameOf(p)} className="text-xs px-2 border border-hairline-bright rounded hover:bg-panel-raised disabled:opacity-40">Fetch</button>
                    </div>
                    <div className="col-span-2 text-[10px] text-ink-dim font-data min-h-[14px]">
                      {w === 'none' && 'No Wikipedia image found — upload one instead.'}
                      {w && w !== 'none' && w !== 'loading' && (<>Matched <a href={w.pageUrl} target="_blank" rel="noreferrer" className="text-cyan underline">{w.title}</a> · {w.file}</>)}
                    </div>
                    <input type="file" accept="image/*" onChange={(e) => handleImage(p.id, e.target.files?.[0] ?? null)} className="text-xs text-ink-dim col-span-2" />
                    <input
                      type="number"
                      step="0.1"
                      value={previousPct[p.id] ?? ''}
                      onChange={(e) => setPreviousPct((m) => ({ ...m, [p.id]: e.target.value }))}
                      placeholder="Previous %"
                      className="col-span-2 bg-panel-raised border border-hairline rounded px-2 py-1 text-xs outline-none font-data"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Rendered infobox — laid out like a Wikipedia infobox */}
        <div>
          <table className="mx-auto bg-[#f8f9fa] text-black border border-[#a2a9b1] text-[12px] font-sans leading-snug shadow-lg" style={{ width: 'min(100%, 380px)', borderCollapse: 'collapse' }}>
            <caption className="sr-only">{config.title}</caption>
            <tbody>
              <tr>
                <th colSpan={cols.length + 1} className="bg-[#cedff2] text-center text-[14px] font-bold px-2 py-1.5 border-b border-[#a2a9b1]">{config.title}</th>
              </tr>
              <tr>
                <td colSpan={cols.length + 1} className="text-center px-2 py-1 border-b border-[#eaecf0]">
                  <div className="font-semibold">{dateText}</div>
                  <div className="text-gray-600 text-[11px]">{isParliamentary ? `All ${seatTotal} seats · ${majority} seats needed for a majority` : config.region}</div>
                </td>
              </tr>

              {/* portraits */}
              <tr>
                <td className={label} />
                {cols.map(({ p }) => (
                  <td key={p.id} className={cell} style={{ width: `${100 / (cols.length + 0.6)}%` }}>
                    <div className="mx-auto w-[88px] h-[110px] bg-[#eaecf0] overflow-hidden flex items-center justify-center text-[9px] text-gray-400">
                      {imgOf(p.id) ? <img src={imgOf(p.id)} alt={nameOf(p) || p.name} className="w-full h-full object-cover" /> : 'no image'}
                    </div>
                  </td>
                ))}
              </tr>
              <tr>
                <td className={label}>{isParliamentary ? 'Leader' : 'Nominee'}</td>
                {cols.map(({ p }) => <td key={p.id} className={`${cell} font-semibold`}>{nameOf(p) || '—'}</td>)}
              </tr>
              <tr>
                <td className={label}>Party</td>
                {cols.map(({ p }) => <td key={p.id} className={cell}>{p.name}</td>)}
              </tr>
              <tr>
                <td className="p-0" />
                {cols.map(({ p }) => <td key={p.id} className="p-0 h-[5px]" style={{ background: p.color }} />)}
              </tr>
              {isParliamentary && (
                <>
                  <tr>
                    <td className={label}>Seats won</td>
                    {cols.map(({ p }) => <td key={p.id} className={`${cell} font-bold`}>{seatAlloc[p.id] ?? 0}<span className="font-normal text-gray-500"> / {seatTotal}</span></td>)}
                  </tr>
                  {prevSeats && (
                    <tr>
                      <td className={label}>Seat change</td>
                      {cols.map(({ p }) => {
                        const c = seatChange(p.id);
                        return <td key={p.id} className={`${cell} ${c === null ? 'text-gray-400' : c > 0 ? 'text-green-700' : c < 0 ? 'text-red-700' : ''}`}>{c === null ? '—' : `${c > 0 ? '▲' : c < 0 ? '▼' : ''} ${fmtSigned(c)}`}</td>;
                      })}
                    </tr>
                  )}
                </>
              )}
              <tr>
                <td className={label}>Popular vote</td>
                {cols.map(({ p, v }) => <td key={p.id} className={cell}>{Math.round(v * totalVotes).toLocaleString()}</td>)}
              </tr>
              <tr>
                <td className={label}>Percentage</td>
                {cols.map(({ p, v }) => <td key={p.id} className={`${cell} font-bold`} style={{ color: readableOn(p.color, 'light') }}>{(v * 100).toFixed(1)}%</td>)}
              </tr>
              <tr>
                <td className={label}>Swing</td>
                {cols.map(({ p, v }) => <td key={p.id} className={cell}><SwingArrow delta={swingFor(p.id, v)} /></td>)}
              </tr>

              {/* seats bar / hemicycle */}
              {isParliamentary && (
                <tr>
                  <td colSpan={cols.length + 1} className="border-t border-[#a2a9b1] px-2 py-2">
                    <div className="relative h-6 flex border border-[#a2a9b1]" role="img" aria-label="Seats by party">
                      {ranked.filter((r) => (seatAlloc[r.p.id] ?? 0) > 0).map(({ p }) => (
                        <div key={p.id} title={`${p.name}: ${seatAlloc[p.id]}`} style={{ background: p.color, width: `${((seatAlloc[p.id] ?? 0) / Math.max(1, seatTotal)) * 100}%` }} />
                      ))}
                      <div className="absolute inset-y-[-3px] w-px bg-black" style={{ left: '50%' }} title={`${majority} seats for a majority`} />
                    </div>
                    <div className="text-[9px] text-gray-500 text-center mt-0.5">▲ majority line</div>
                    <div className="flex flex-wrap justify-center gap-x-3 gap-y-0.5 text-[10px] mt-1">
                      {ranked.filter((r) => (seatAlloc[r.p.id] ?? 0) > 0).slice(0, 8).map(({ p }) => (
                        <span key={p.id} className="inline-flex items-center gap-1"><span className="w-2 h-2 inline-block" style={{ background: p.color }} />{p.name} {seatAlloc[p.id]}</span>
                      ))}
                    </div>
                  </td>
                </tr>
              )}

              {/* results map */}
              <tr>
                <td colSpan={cols.length + 1} className="border-t border-[#a2a9b1] px-2 pt-2 pb-1 text-center font-semibold bg-[#cedff2]/60">Results by {unitName}</td>
              </tr>
              <tr>
                <td colSpan={cols.length + 1} className="px-2 py-2 bg-white">
                  {map.scene.geo && map.scene.scene && map.fills ? (
                    <InfoboxMap ref={mapSvg} geo={map.scene.geo} participants={map.scene.scene.participants} fills={map.fills} />
                  ) : map.loading ? (
                    <div className="h-40 flex items-center justify-center text-gray-400 text-[11px]">loading map…</div>
                  ) : (
                    <div className="bg-gray-900 rounded p-1.5">
                      <PlaceholderMap parties={config.parties} shares={values} mode="base" cols={12} rows={7} compact />
                      <p className="text-[9px] text-gray-400 text-center mt-1">No geography attached — attach a region on Build for a real map.</p>
                    </div>
                  )}
                  <div className="flex flex-wrap justify-center gap-x-3 gap-y-0.5 text-[10px] mt-1.5">
                    {ranked.slice(0, 6).map(({ p }) => (
                      <span key={p.id} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 inline-block" style={{ background: p.color }} />{p.name}</span>
                    ))}
                  </div>
                  {map.fills && <p className="text-[10px] text-gray-500 text-center mt-1">Winner by {unitName} · {map.scene.geo?.preset.label}</p>}
                </td>
              </tr>
            </tbody>
          </table>
          {map.fills && (
            <div className="text-center mt-3">
              <button onClick={downloadMap} className="text-xs px-3 py-1.5 border border-hairline-bright rounded hover:bg-panel">Download map (SVG)</button>
            </div>
          )}

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
