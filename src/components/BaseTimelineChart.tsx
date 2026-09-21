import { useMemo, useState } from 'react';
import type { Party, PollRow } from '../lib/types';
import type { TimelinePoint } from '../lib/baseCalc';
import { onDark } from '../lib/partyColors';

interface Props {
  parties: Party[];
  timeline: TimelinePoint[];
  /** Raw polls drawn as faint dots behind the average (BaseCalc view only). */
  rawPolls?: PollRow[];
  height?: number;
  /** Card mode: no axes, no hover, top 3 lines only. */
  compact?: boolean;
  maxSeries?: number;
  electionDate?: string;
}

const W = 720;
const t = (iso: string) => Date.parse(iso + 'T00:00:00Z');

/** Day-by-day BaseCalc line graph. Used full-size in the BaseCalc view and compact inside every race card. */
export function BaseTimelineChart({ parties, timeline, rawPolls, height, compact = false, maxSeries, electionDate }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const H = height ?? (compact ? 96 : 300);
  const pad = compact ? { l: 4, r: 4, t: 6, b: 6 } : { l: 40, r: 16, t: 14, b: 26 };

  const series = useMemo(() => {
    if (timeline.length === 0) return [];
    const last = timeline[timeline.length - 1].shares;
    return [...parties]
      .sort((a, b) => (last[b.id] ?? 0) - (last[a.id] ?? 0))
      .slice(0, maxSeries ?? (compact ? 3 : 8));
  }, [parties, timeline, compact, maxSeries]);

  if (timeline.length === 0) {
    return (
      <div className="flex items-center justify-center text-ink-dim text-xs font-data border border-dashed border-hairline rounded" style={{ height: H }}>
        No dated polls with sample sizes yet
      </div>
    );
  }

  const t0 = t(timeline[0].date);
  const tEnd = t(timeline[timeline.length - 1].date);
  const t1 = Math.max(tEnd, t0 + 86_400_000);
  const observedMax = Math.max(...timeline.flatMap((p) => series.map((s) => p.shares[s.id] ?? 0)));
  const yMax = compact ? Math.min(1, observedMax * 1.12 + 0.02) : Math.min(1, Math.ceil((observedMax * 100 + 2) / 10) * 0.1);
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const x = (ms: number) => pad.l + ((ms - t0) / (t1 - t0)) * iw;
  const y = (v: number) => pad.t + (1 - v / yMax) * ih;

  const paths = series.map((s) => ({
    s,
    d: timeline.map((p, i) => `${i ? 'L' : 'M'}${x(t(p.date)).toFixed(1)},${y(p.shares[s.id] ?? 0).toFixed(1)}`).join(''),
  }));

  const yTicks: number[] = [];
  for (let v = 0; v <= yMax + 1e-9; v += yMax > 0.5 ? 0.1 : 0.05) yTicks.push(+v.toFixed(2));
  const xTicks = Array.from({ length: 5 }, (_, i) => t0 + ((t1 - t0) * i) / 4);
  const fmt = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' });

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (compact) return;
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const ms = t0 + ((px - pad.l) / iw) * (t1 - t0);
    let best = 0;
    for (let i = 1; i < timeline.length; i++) if (Math.abs(t(timeline[i].date) - ms) < Math.abs(t(timeline[best].date) - ms)) best = i;
    setHover(best);
  };
  const hp = hover !== null ? timeline[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="BaseCalc trajectory, day by day">
        {!compact &&
          yTicks.map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="currentColor" className="text-hairline" strokeWidth={1} />
              <text x={pad.l - 6} y={y(v) + 3.5} textAnchor="end" className="fill-ink-dim font-data" fontSize={10}>{Math.round(v * 100)}%</text>
            </g>
          ))}
        {!compact &&
          xTicks.map((ms, i) => (
            <text key={i} x={x(ms)} y={H - 8} textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'} className="fill-ink-dim font-data" fontSize={10}>{fmt(ms)}</text>
          ))}
        {!compact && electionDate && t(electionDate) >= t0 && t(electionDate) <= t1 && (
          <line x1={x(t(electionDate))} x2={x(t(electionDate))} y1={pad.t} y2={H - pad.b} stroke="currentColor" className="text-gold" strokeDasharray="3 3" />
        )}
        {!compact &&
          rawPolls?.flatMap((r) =>
            !r.fieldworkEnd || r.isElectionResult
              ? []
              : series.map((s) => {
                  const v = r.values[s.id];
                  if (v === undefined) return null;
                  const ms = t(r.fieldworkEnd);
                  if (ms < t0 || ms > t1) return null;
                  return <circle key={`${r.id}-${s.id}`} cx={x(ms)} cy={y(v / 100)} r={2} fill={onDark(s.color)} opacity={0.28} />;
                })
          )}
        {paths.map(({ s, d }) => (
          <path key={s.id} d={d} fill="none" stroke={onDark(s.color)} strokeWidth={compact ? 1.8 : 2.4} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {hp && (
          <g>
            <line x1={x(t(hp.date))} x2={x(t(hp.date))} y1={pad.t} y2={H - pad.b} stroke="currentColor" className="text-ink-dim" />
            {series.map((s) => (
              <circle key={s.id} cx={x(t(hp.date))} cy={y(hp.shares[s.id] ?? 0)} r={3.5} fill={onDark(s.color)} />
            ))}
          </g>
        )}
      </svg>
      {hp && (
        <div className="absolute top-1 right-2 bg-panel-raised/95 border border-hairline-bright rounded px-2.5 py-1.5 text-xs font-data pointer-events-none">
          <div className="text-ink-dim mb-0.5">{fmt(t(hp.date))} · {hp.polls} poll{hp.polls === 1 ? '' : 's'}</div>
          {series.map((s) => (
            <div key={s.id} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm" style={{ background: onDark(s.color) }} />
              <span className="text-ink-muted">{s.shortName}</span>
              <span className="ml-auto pl-3">{((hp.shares[s.id] ?? 0) * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
