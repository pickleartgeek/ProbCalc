import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { parsePollData } from '../lib/parser';
import { computeBaseCalc, computeBaseCalcTimeline, computePollWeights } from '../lib/baseCalc';
import { useEngine } from '../state/store';
import { PartyConfigEditor } from '../components/PartyConfigEditor';
import { readableOn, findByAffiliation, onDark } from '../lib/partyColors';
import { BaseTimelineChart } from '../components/BaseTimelineChart';
import { RegionPresetPicker } from '../components/geo/RegionPresetPicker';
import { inferPreset } from '../lib/geo/presets';
import { countryFromRegion, US_DEM, US_REP } from '../lib/partyRegistry';
import { pushSnapshot, saveRaceMeta } from '../lib/history';
import { fetchWikipediaPolling } from '../lib/mediawikiApi';
import type { Party, RegionBinding, VotingSystem } from '../lib/types';

const VOTING_SYSTEMS: { id: VotingSystem; label: string }[] = [
  { id: 'FPTP', label: 'First Past the Post' },
  { id: 'RCV', label: 'Ranked Choice / IRV' },
  { id: 'STAR', label: 'STAR Voting' },
  { id: 'DHondt', label: "D'Hondt (party list)" },
  { id: 'PartyList', label: 'Party List (other)' },
];

export function Build() {
  const nav = useNavigate();
  const { setRace } = useEngine();

  const [raw, setRaw] = useState('');
  const [title, setTitle] = useState('Untitled race');
  const [region, setRegion] = useState('');
  const [electionDate, setElectionDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 2);
    return d.toISOString().slice(0, 10);
  });
  const [votingSystem, setVotingSystem] = useState<VotingSystem>('FPTP');
  const [parties, setParties] = useState<Party[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [format, setFormat] = useState<string>('unknown');
  const [dateWeightingDivisor, setDateWeightingDivisor] = useState(100);
  const [cutoffDate, setCutoffDate] = useState('');
  const [minSampleSize, setMinSampleSize] = useState(0);
  const [dateBasis, setDateBasis] = useState<'end' | 'midpoint'>('end');
  const [parsedRows, setParsedRows] = useState<ReturnType<typeof parsePollData>['rows']>([]);

  const [wikiPage, setWikiPage] = useState('');
  const [wikiFetching, setWikiFetching] = useState(false);
  const [wikiError, setWikiError] = useState<string | null>(null);
  const [wikiFetchedFrom, setWikiFetchedFrom] = useState<string | null>(null);

  const [regionBinding, setRegionBinding] = useState<RegionBinding | undefined>(undefined);

  const [baselineState, setBaselineState] = useState('');
  const [baselineError, setBaselineError] = useState<string | null>(null);
  const [baselineLoading, setBaselineLoading] = useState(false);

  const canParse = raw.trim().length > 20;

  async function handleFetchFromWikipedia() {
    if (!wikiPage.trim()) return;
    setWikiFetching(true);
    setWikiError(null);
    try {
      const result = await fetchWikipediaPolling(wikiPage.trim());
      setRaw(result.wikitext);
      setWikiFetchedFrom(`"${result.sectionTitle}" section of ${result.pageTitle}`);
    } catch (err) {
      setWikiError(err instanceof Error ? err.message : 'Fetch failed');
      setWikiFetchedFrom(null);
    } finally {
      setWikiFetching(false);
    }
  }

  // Parse as soon as data arrives (paste or Wikipedia fetch) — BaseCalc renders immediately below,
  // there is no separate "run" step needed to see the aggregate.
  useEffect(() => {
    if (!canParse) return;
    const id = setTimeout(handleParse, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  // BaseCalc is its own deterministic engine: recomputed live from whatever is parsed + the weighting controls.
  const preview = useMemo(() => {
    if (parties.length === 0 || parsedRows.length === 0) return null;
    const opts = { divisor: dateWeightingDivisor, cutoffDate: cutoffDate || null, minSampleSize, dateBasis };
    const today = new Date().toISOString().slice(0, 10);
    const results = computeBaseCalc(parties, parsedRows, electionDate, opts);
    return {
      ...results,
      timeline: computeBaseCalcTimeline(parties, parsedRows, electionDate, { ...opts, endDate: today < electionDate ? today : electionDate }),
      weights: computePollWeights(parties, parsedRows, electionDate, opts),
    };
  }, [parties, parsedRows, electionDate, dateWeightingDivisor, cutoffDate, minSampleSize, dateBasis]);

  // naming a country in "Region" auto-suggests its geography (the picker offers it; nothing is attached silently)
  const suggestedPreset = !regionBinding ? inferPreset(region) : null;
  void suggestedPreset;

  function handleParse() {
    const result = parsePollData(raw, { country: countryFromRegion(region) });
    setParties(result.parties);
    setParsedRows(result.rows);
    setRowCount(result.rows.length);
    setWarnings(result.warnings);
    setFormat(result.format);
  }

  /**
   * Pulls a real 2024 result off the same precinct data Split Ticket uses
   * (precinctAnchor.ts for President, senatePrecinctAnchor.ts for the
   * real-vs-president ticket-split) and drops it in as a heavily-weighted,
   * real-dated row — not a fabricated "election result" ground-truth row
   * (those are explicitly excluded from BaseCalc's math), but an actual
   * poll-shaped row with sample size = real total votes cast. It behaves
   * exactly like the guide's weighting formula intends: a strong prior that
   * naturally fades relative to fresher polls as the election approaches,
   * rather than a hardcoded starting number.
   */
  async function handleImportBaseline(office: 'president' | 'senate') {
    const abbr = baselineState.trim().toUpperCase();
    if (abbr.length !== 2) {
      setBaselineError('Enter a two-letter state abbreviation, e.g. "PA".');
      return;
    }
    setBaselineLoading(true);
    setBaselineError(null);
    try {
      let marginRPositive: number | null = null;
      let label: string;
      if (office === 'president') {
        const { loadRealStatePVI } = await import('../lib/midterms/precinctAnchor');
        const { margins, realStates } = await loadRealStatePVI();
        if (!realStates.has(abbr)) {
          setBaselineError(`No real precinct data loaded for ${abbr} yet.`);
          return;
        }
        marginRPositive = margins[abbr] ?? null;
        label = '2024 President result (real precincts)';
      } else {
        const { loadSenatePrecinctAnchor } = await import('../lib/midterms/senatePrecinctAnchor');
        const anchor = await loadSenatePrecinctAnchor();
        if (!anchor.realStates.has(abbr)) {
          setBaselineError(`${abbr} had no 2024 U.S. Senate race — try "president" instead.`);
          return;
        }
        marginRPositive = anchor.realSenateMargins[abbr] ?? null;
        label = '2024 Senate result (real precincts)';
      }
      if (marginRPositive === null) {
        setBaselineError(`No data found for "${abbr}".`);
        return;
      }

      const repPct = 50 + marginRPositive / 2;
      const demPct = 50 - marginRPositive / 2;

      // Reuse the poll table's own D/R columns (e.g. "Jon Ossoff (D)") so the baseline row lands on the
      // same parties as the polls instead of creating a second, disconnected pair.
      const existingD = findByAffiliation(parties, 'D');
      const existingR = findByAffiliation(parties, 'R');
      const dem: Party = existingD ?? { id: 'democrat', name: 'Democrat', shortName: 'Dem', color: US_DEM, affiliation: 'D' };
      const rep: Party = existingR ?? { id: 'republican', name: 'Republican', shortName: 'GOP', color: US_REP, affiliation: 'R' };
      if (!existingD || !existingR) setParties((prev) => [...prev.filter((p) => p.id !== dem.id && p.id !== rep.id), ...(existingD ? [] : [dem]), ...(existingR ? [] : [rep])]);
      setParsedRows((prev) => [
        ...prev,
        {
          id: `baseline-${Date.now()}`,
          firm: label,
          fieldworkStart: '2024-11-05',
          fieldworkEnd: '2024-11-05',
          fieldworkRaw: '2024-11-05',
          sampleSize: 50000,
          values: { [rep.id]: repPct, [dem.id]: demPct },
          isElectionResult: false,
        },
      ]);
      setRowCount((c) => c + 1);
      if (format === 'unknown') setFormat('plain');
    } finally {
      setBaselineLoading(false);
    }
  }

  const previewCount = useMemo(
    () => parsedRows.filter((r) => !r.isElectionResult).length,
    [parsedRows]
  );

  function handleRunBaseCalc(view: 'base' | 'prob' = 'base') {
    if (parties.length === 0 || parsedRows.length === 0) return;
    const config = {
      id: `race-${Date.now()}`,
      title,
      region,
      electionDate,
      votingSystem,
      parties,
      regionBinding,
      sim: {
        simulations: 1000,
        beta: 1,
        dateWeighting: { enabled: true, divisor: dateWeightingDivisor, cutoffDate: cutoffDate || null, minSampleSize, dateBasis },
      },
    };
    const head = computeBaseCalc(parties, parsedRows, electionDate, { divisor: dateWeightingDivisor, cutoffDate: cutoffDate || null, minSampleSize, dateBasis });
    setRace(config, { parties, rows: parsedRows, warnings, format: format as 'plain' | 'wikitext' | 'unknown' }, view);
    saveRaceMeta(config.id, { title, region, parties });
    pushSnapshot(config.id, Object.fromEntries(head.results.map((r) => [r.partyId, r.percentage])));
    nav('/results');
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="font-display font-800 text-3xl mb-1">Build a race</h1>
      <p className="text-ink-muted mb-8">
        Paste polling data from Wikipedia — either the copy-pasted table or the raw wikitext source.
      </p>

      <div className="grid lg:grid-cols-5 gap-8">
        {/* Left: race config */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-panel border border-hairline rounded-lg p-5">
            <h2 className="font-display font-700 text-lg mb-4">Race details</h2>
            <label className="block text-xs text-ink-dim font-data uppercase mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-panel-raised border border-hairline rounded px-3 py-2 text-sm mb-3 outline-none focus:border-hairline-bright"
            />
            <label className="block text-xs text-ink-dim font-data uppercase mb-1">Region</label>
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="e.g. Germany, Pennsylvania"
              className="w-full bg-panel-raised border border-hairline rounded px-3 py-2 text-sm mb-3 outline-none focus:border-hairline-bright"
            />
            <label className="block text-xs text-ink-dim font-data uppercase mb-1">Election date</label>
            <input
              type="date"
              value={electionDate}
              onChange={(e) => setElectionDate(e.target.value)}
              className="w-full bg-panel-raised border border-hairline rounded px-3 py-2 text-sm mb-3 outline-none focus:border-hairline-bright font-data"
            />
            <label className="block text-xs text-ink-dim font-data uppercase mb-1">Voting system</label>
            <select
              value={votingSystem}
              onChange={(e) => setVotingSystem(e.target.value as VotingSystem)}
              className="w-full bg-panel-raised border border-hairline rounded px-3 py-2 text-sm outline-none focus:border-hairline-bright"
            >
              {VOTING_SYSTEMS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-panel border border-hairline rounded-lg p-5">
            <h2 className="font-display font-700 text-lg mb-1">Weighting</h2>
            <p className="text-ink-dim text-xs mb-3">
              Lower divisor = polls decay faster with age (more variance). The guide's default is 100.
            </p>
            <div className="flex items-center gap-3 mb-4">
              <input
                type="range"
                min={10}
                max={300}
                step={10}
                value={dateWeightingDivisor}
                onChange={(e) => setDateWeightingDivisor(parseInt(e.target.value, 10))}
                className="flex-1 accent-gold"
              />
              <span className="font-data text-sm w-10 text-right">{dateWeightingDivisor}</span>
            </div>

            <h3 className="font-display font-700 text-xs text-ink-dim uppercase tracking-wide mb-2 border-t border-hairline pt-3">
              Fine-tune
            </h3>

            <label className="block text-xs text-ink-dim font-data uppercase mb-1">
              Cutoff date <span className="normal-case text-ink-dim/70">(optional)</span>
            </label>
            <input
              type="date"
              value={cutoffDate}
              onChange={(e) => setCutoffDate(e.target.value)}
              className="w-full bg-panel-raised border border-hairline rounded px-3 py-2 text-sm mb-1 outline-none focus:border-hairline-bright font-data"
            />
            <p className="text-ink-dim text-[11px] mb-3">
              Ignores polls fielded before this date — the guide's practice of cutting the dataset off at a
              pivotal point (a new candidate, a party founding) rather than including stale pre-shift polls.
            </p>

            <label className="block text-xs text-ink-dim font-data uppercase mb-1">Minimum sample size</label>
            <input
              type="number"
              min={0}
              step={50}
              value={minSampleSize}
              onChange={(e) => setMinSampleSize(Math.max(0, parseInt(e.target.value, 10) || 0))}
              className="w-full bg-panel-raised border border-hairline rounded px-3 py-2 text-sm mb-1 outline-none focus:border-hairline-bright font-data"
            />
            <p className="text-ink-dim text-[11px] mb-3">Drops small-panel polls entirely rather than just down-weighting them.</p>

            <label className="block text-xs text-ink-dim font-data uppercase mb-1">Date basis</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDateBasis('end')}
                className={`flex-1 px-3 py-2 rounded text-xs font-data border ${
                  dateBasis === 'end'
                    ? 'bg-gold/10 border-gold text-gold'
                    : 'bg-panel-raised border-hairline text-ink-muted hover:border-hairline-bright'
                }`}
              >
                End date
              </button>
              <button
                type="button"
                onClick={() => setDateBasis('midpoint')}
                className={`flex-1 px-3 py-2 rounded text-xs font-data border ${
                  dateBasis === 'midpoint'
                    ? 'bg-gold/10 border-gold text-gold'
                    : 'bg-panel-raised border-hairline text-ink-muted hover:border-hairline-bright'
                }`}
              >
                Fieldwork midpoint
              </button>
            </div>
            <p className="text-ink-dim text-[11px] mt-1">
              Midpoint softens the penalty on polls fielded over a long window, per the guide: "averaging the
              date hurts polls that collect data for longer."
            </p>
          </div>

          <div className="bg-panel border border-hairline rounded-lg p-5">
            <h2 className="font-display font-700 text-lg mb-3">Parties</h2>
            <PartyConfigEditor parties={parties} onChange={setParties} />
          </div>

          <RegionPresetPicker value={regionBinding} regionText={region} onChange={setRegionBinding} />
        </div>

        {/* Right: paste + preview */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-panel border border-hairline rounded-lg p-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-display font-700 text-lg">Polling data</h2>
              {format !== 'unknown' && (
                <span className="font-data text-xs px-2 py-0.5 rounded bg-panel-raised border border-hairline text-cyan uppercase">
                  {format}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mb-3">
              <input
                value={wikiPage}
                onChange={(e) => setWikiPage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFetchFromWikipedia()}
                placeholder="Wikipedia page title, e.g. 2026 United States Senate election in Georgia"
                className="flex-1 bg-panel-raised border border-hairline rounded px-3 py-2 text-xs font-data outline-none focus:border-hairline-bright"
              />
              <button
                onClick={handleFetchFromWikipedia}
                disabled={!wikiPage.trim() || wikiFetching}
                className="px-3 py-2 bg-panel-raised border border-hairline-bright rounded text-xs font-data text-cyan disabled:opacity-30 disabled:cursor-not-allowed hover:border-cyan whitespace-nowrap"
              >
                {wikiFetching ? 'Fetching…' : 'Fetch from Wikipedia'}
              </button>
            </div>
            {wikiFetchedFrom && (
              <p className="text-ink-dim text-[11px] font-data mb-2">
                Loaded from {wikiFetchedFrom} — review below, then Parse table.
              </p>
            )}
            {wikiError && <p className="text-red-call text-[11px] font-data mb-2">{wikiError}</p>}

            <div className="flex items-center gap-2 mb-3 pt-3 border-t border-hairline">
              <input
                value={baselineState}
                onChange={(e) => setBaselineState(e.target.value)}
                placeholder="State abbr, e.g. PA"
                maxLength={2}
                className="w-28 bg-panel-raised border border-hairline rounded px-3 py-2 text-xs font-data outline-none focus:border-hairline-bright uppercase"
              />
              <button
                onClick={() => handleImportBaseline('president')}
                disabled={baselineState.trim().length !== 2 || baselineLoading}
                className="px-3 py-2 bg-panel-raised border border-hairline-bright rounded text-xs font-data text-gold disabled:opacity-30 disabled:cursor-not-allowed hover:border-gold whitespace-nowrap"
              >
                {baselineLoading ? 'Loading…' : 'Import 2024 President baseline'}
              </button>
              <button
                onClick={() => handleImportBaseline('senate')}
                disabled={baselineState.trim().length !== 2 || baselineLoading}
                className="px-3 py-2 bg-panel-raised border border-hairline-bright rounded text-xs font-data text-gold disabled:opacity-30 disabled:cursor-not-allowed hover:border-gold whitespace-nowrap"
              >
                {baselineLoading ? 'Loading…' : 'Import 2024 Senate baseline'}
              </button>
            </div>
            <p className="text-ink-dim text-[11px] font-data mb-2">
              Pulls the real, precinct-verified 2024 result for a U.S. state off the same data Split Ticket
              uses, and drops it in as a heavily-weighted, real-dated row (not a hardcoded number) — it fades
              naturally as fresher polls accumulate, per the guide's own weighting formula.
            </p>
            {baselineError && <p className="text-red-call text-[11px] font-data mb-2">{baselineError}</p>}
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="Paste a Wikipedia opinion-polling table here (plain copy-paste or wikitext source), or fetch a page above…"
              rows={14}
              className="w-full bg-panel-raised border border-hairline rounded px-3 py-2 text-xs font-data outline-none focus:border-hairline-bright resize-y"
            />
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={handleParse}
                disabled={!canParse}
                className="px-4 py-2 bg-gold text-void font-display font-700 rounded disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110"
              >
                Parse table
              </button>
              {rowCount > 0 && (
                <span className="text-ink-muted text-sm">
                  Found <span className="text-ink font-medium">{previewCount}</span> poll
                  {previewCount !== 1 ? 's' : ''} across <span className="text-ink font-medium">{parties.length}</span> parties
                </span>
              )}
            </div>
            {warnings.length > 0 && (
              <div className="mt-3 space-y-1">
                {warnings.map((w, i) => (
                  <div key={i} className="text-xs text-gold bg-gold/10 border border-gold-dim/40 rounded px-2 py-1.5">
                    ⚠ {w}
                  </div>
                ))}
              </div>
            )}
          </div>

          {parsedRows.length > 0 && (
            <div className="bg-panel border border-hairline rounded-lg p-5 overflow-x-auto">
              <h2 className="font-display font-700 text-lg mb-3">Preview</h2>
              <table className="w-full text-xs font-data">
                <thead>
                  <tr className="text-ink-dim border-b border-hairline text-left">
                    <th className="pb-2 pr-3">Firm</th>
                    <th className="pb-2 pr-3">Date</th>
                    <th className="pb-2 pr-3">n</th>
                    {parties.slice(0, 6).map((p) => (
                      <th key={p.id} className="pb-2 pr-3" style={{ color: readableOn(p.color, 'dark') }}>
                        {p.shortName}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.slice(0, 8).map((r) => (
                    <tr key={r.id} className="border-b border-hairline/50">
                      <td className="py-1.5 pr-3 text-ink">{r.firm}</td>
                      <td className="py-1.5 pr-3 text-ink-muted">{r.fieldworkEnd || r.fieldworkRaw || '—'}</td>
                      <td className="py-1.5 pr-3 text-ink-muted">{r.sampleSize ?? '—'}</td>
                      {parties.slice(0, 6).map((p) => (
                        <td key={p.id} className="py-1.5 pr-3">
                          {r.values[p.id] !== undefined ? r.values[p.id] : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedRows.length > 8 && (
                <p className="text-ink-dim text-xs mt-2">…and {parsedRows.length - 8} more rows</p>
              )}
            </div>
          )}

          {preview && (
            <div className="bg-panel border border-hairline rounded-lg p-5" data-testid="basecalc-preview">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display font-700 text-lg">BaseCalc <span className="text-ink-dim text-sm font-data font-normal">live · {preview.includedPolls} polls counted{preview.excludedPolls ? `, ${preview.excludedPolls} excluded` : ''}</span></h2>
              </div>
              <div className="space-y-1.5 mb-4">
                {[...preview.results].sort((a, b) => b.percentage - a.percentage).slice(0, 6).map((r) => {
                  const p = parties.find((x) => x.id === r.partyId);
                  return (
                    <div key={r.partyId} className="flex items-center gap-2 text-sm">
                      <span className="w-24 truncate" style={{ color: p ? readableOn(p.color, 'dark') : undefined }}>{p?.shortName}</span>
                      <div className="flex-1 h-2 bg-panel-raised rounded overflow-hidden"><div className="h-full" style={{ width: `${r.percentage * 100}%`, background: p ? onDark(p.color) : undefined }} /></div>
                      <span className="font-data text-ink-muted w-12 text-right">{(r.percentage * 100).toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
              <BaseTimelineChart parties={parties} timeline={preview.timeline} rawPolls={parsedRows} electionDate={electionDate} height={220} maxSeries={5} />
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <button
              onClick={() => handleRunBaseCalc('base')}
              disabled={parties.length === 0 || parsedRows.length === 0}
              className="px-5 py-3 bg-cyan/90 text-void font-display font-800 text-lg rounded disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110"
            >
              Open BaseCalc →
            </button>
            <button
              onClick={() => handleRunBaseCalc('prob')}
              disabled={parties.length === 0 || parsedRows.length === 0}
              className="px-5 py-3 bg-gold text-void font-display font-800 text-lg rounded disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110"
            >
              Open ProbCalc →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
