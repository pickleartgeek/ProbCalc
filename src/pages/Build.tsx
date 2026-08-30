import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { parsePollData } from '../lib/parser';
import { computeBaseCalc } from '../lib/baseCalc';
import { useEngine } from '../state/store';
import { PartyConfigEditor } from '../components/PartyConfigEditor';
import { readableOn } from '../lib/partyColors';
import { pushSnapshot, saveRaceMeta } from '../lib/history';
import type { Party, VotingSystem } from '../lib/types';

const VOTING_SYSTEMS: { id: VotingSystem; label: string }[] = [
  { id: 'FPTP', label: 'First Past the Post' },
  { id: 'RCV', label: 'Ranked Choice / IRV' },
  { id: 'STAR', label: 'STAR Voting' },
  { id: 'DHondt', label: "D'Hondt (party list)" },
  { id: 'PartyList', label: 'Party List (other)' },
];

export function Build() {
  const nav = useNavigate();
  const { setConfig, setPollData, setBaseCalcResults } = useEngine();

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
  const [parsedRows, setParsedRows] = useState<ReturnType<typeof parsePollData>['rows']>([]);

  const canParse = raw.trim().length > 20;

  function handleParse() {
    const result = parsePollData(raw);
    setParties(result.parties);
    setParsedRows(result.rows);
    setRowCount(result.rows.length);
    setWarnings(result.warnings);
    setFormat(result.format);
  }

  const previewCount = useMemo(
    () => parsedRows.filter((r) => !r.isElectionResult).length,
    [parsedRows]
  );

  function handleRunBaseCalc() {
    if (parties.length === 0 || parsedRows.length === 0) return;
    const config = {
      id: `race-${Date.now()}`,
      title,
      region,
      electionDate,
      votingSystem,
      parties,
      sim: {
        simulations: 1000,
        beta: 1,
        dateWeighting: { enabled: true, divisor: dateWeightingDivisor },
      },
    };
    const baseResult = computeBaseCalc(parties, parsedRows, electionDate, dateWeightingDivisor);
    setConfig(config);
    setPollData({ parties, rows: parsedRows, warnings, format: format as any });
    setBaseCalcResults(baseResult.results);
    saveRaceMeta(config.id, { title, region, parties });
    pushSnapshot(config.id, Object.fromEntries(baseResult.results.map((r) => [r.partyId, r.percentage])));
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
            <div className="flex items-center gap-3">
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
          </div>

          <div className="bg-panel border border-hairline rounded-lg p-5">
            <h2 className="font-display font-700 text-lg mb-3">Parties</h2>
            <PartyConfigEditor parties={parties} onChange={setParties} />
          </div>
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
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="Paste a Wikipedia opinion-polling table here (plain copy-paste or wikitext source)…"
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

          <button
            onClick={handleRunBaseCalc}
            disabled={parties.length === 0 || parsedRows.length === 0}
            className="w-full px-5 py-3 bg-cyan/90 text-void font-display font-800 text-lg rounded disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110"
          >
            Run BaseCalc →
          </button>
        </div>
      </div>
    </div>
  );
}
