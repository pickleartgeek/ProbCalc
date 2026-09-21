import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ElectionConfig, ParsedPollData } from '../../lib/types';
import type { BaseCalcBundle } from '../../state/store';
import { computeBaseCalcTimeline, optionsFromWeighting } from '../../lib/baseCalc';
import { readableOn, onDark } from '../../lib/partyColors';
import { BaseTimelineChart } from '../../components/BaseTimelineChart';
import { PollWeightsTable } from '../../components/results/PollWeightsTable';
import { ResultsDonut } from '../../components/ResultsDonut';
import { RaceMap } from '../../components/results/RaceMap';
import type { GeoScene } from '../../hooks/useGeoScene';

const WINDOWS: { label: string; days: number | null }[] = [
  { label: 'Cumulative', days: null },
  { label: '60-day', days: 60 },
  { label: '30-day', days: 30 },
  { label: '14-day', days: 14 },
];

/** BaseCalc view: raw polling aggregate, daily moving averages, poll weights. No simulation involved. */
export function BaseCalcView({ config, pollData, baseCalc, scene }: { config: ElectionConfig; pollData: ParsedPollData; baseCalc: BaseCalcBundle; scene: GeoScene }) {
  const [windowDays, setWindowDays] = useState<number | null>(null);
  const partyById = Object.fromEntries(config.parties.map((p) => [p.id, p]));
  const sorted = [...baseCalc.results].sort((a, b) => b.percentage - a.percentage);

  const timeline = useMemo(() => {
    if (windowDays === null) return baseCalc.timeline;
    const end = baseCalc.timeline[baseCalc.timeline.length - 1]?.date;
    return computeBaseCalcTimeline(config.parties, pollData.rows, config.electionDate, { ...optionsFromWeighting(config.sim.dateWeighting), windowDays, endDate: end });
  }, [windowDays, baseCalc.timeline, config, pollData.rows]);

  const aggregate = useMemo(() => Object.fromEntries(baseCalc.results.map((r) => [r.partyId, r.percentage])), [baseCalc.results]);
  const dw = config.sim.dateWeighting;
  const chips = [
    `divisor ${dw.enabled === false ? 'off' : dw.divisor}`,
    dw.cutoffDate ? `cutoff ${dw.cutoffDate}` : 'no cutoff',
    dw.minSampleSize ? `min sample ${dw.minSampleSize}` : 'any sample size',
    `date basis: ${dw.dateBasis ?? 'end'}`,
  ];

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-panel border border-hairline rounded-lg p-5">
          <h2 className="font-display font-700 text-lg mb-3">Expected result by region</h2>
          <RaceMap config={config} mode="base" aggregate={aggregate} scene={scene} drawKey={0} />
        </div>
        <div className="bg-panel border border-hairline rounded-lg p-5 flex flex-col items-center">
          <ResultsDonut
            parties={config.parties}
            slices={baseCalc.results.map((r) => ({ partyId: r.partyId, value: r.percentage }))}
            centerLabel={`${((sorted[0]?.percentage ?? 0) * 100).toFixed(0)}%`}
            centerSubLabel={partyById[sorted[0]?.partyId]?.shortName ?? ''}
          />
          <div className="w-full mt-4 space-y-1.5">
            {sorted.map((r) => {
              const p = partyById[r.partyId];
              return (
                <div key={r.partyId} className="flex items-center justify-between text-sm" title={`alpha = ${r.alpha.toFixed(3)}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: onDark(p?.color) }} />
                    <span className="truncate" style={{ color: p ? readableOn(p.color, 'dark') : undefined }}>{p?.name}</span>
                  </div>
                  <span className="font-data text-ink-muted shrink-0">{(r.percentage * 100).toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
          <p className="text-ink-dim text-[11px] mt-3 self-start font-data">
            {baseCalc.includedPolls} polls counted · {baseCalc.excludedPolls} excluded
          </p>
        </div>
      </div>

      <div className="bg-panel border border-hairline rounded-lg p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="font-display font-700 text-lg">Day-by-day BaseCalc</h2>
            <div className="flex gap-1 text-xs font-data" role="group" aria-label="Averaging window">
              {WINDOWS.map((w) => (
                <button key={w.label} onClick={() => setWindowDays(w.days)}
                  className={`px-2.5 py-1 rounded border transition ${windowDays === w.days ? 'border-cyan text-cyan bg-cyan/10' : 'border-hairline text-ink-muted hover:text-ink'}`}>
                  {w.label}
                </button>
              ))}
            </div>
          </div>
          <BaseTimelineChart parties={config.parties} timeline={timeline} rawPolls={pollData.rows} electionDate={config.electionDate} />
          <p className="text-ink-dim text-xs mt-2">
            Each day uses only polls whose fieldwork had ended by then. Dots are individual polls; the line is the weighted aggregate.
            {windowDays === null ? ' Cumulative: every poll released so far counts.' : ` Trailing ${windowDays}-day window.`}
          </p>
        </div>

      <div className="bg-panel border border-hairline rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <h2 className="font-display font-700 text-lg">Poll weights</h2>
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => <span key={c} className="text-[11px] font-data text-ink-muted border border-hairline rounded px-2 py-0.5">{c}</span>)}
          </div>
        </div>
        <p className="text-ink-dim text-xs mb-3 max-w-2xl">
          weight = sample size ÷ (days from poll to election × divisor). Bigger and more recent polls weigh more; the share column is each poll's slice of the whole average.
          Change these settings on the <Link to="/build" className="text-cyan hover:underline">Build</Link> page.
        </p>
        <PollWeightsTable weights={baseCalc.weights} />
      </div>
    </div>
  );
}
