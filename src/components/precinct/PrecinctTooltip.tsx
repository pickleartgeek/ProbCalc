import type { PrecinctResult } from '../../lib/precinct/results';
import { US_DEM, US_REP } from '../../lib/partyRegistry';
import { onDark } from '../../lib/partyColors';

const CAND_COLOR: Record<string, string> = { DEM: US_DEM, REP: US_REP, D: US_DEM, R: US_REP };

/** "01001-10 JONES COMM_ CTR_" -> { county: "01001", name: "10 Jones Comm Ctr" } — the ids are FIPS-prefixed and shouty. */
export function prettyPrecinctId(id: string): { county?: string; name: string } {
  const m = id.match(/^(\d{5})-(.*)$/);
  const raw = (m ? m[2] : id).replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const name = raw === raw.toUpperCase() ? raw.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()) : raw;
  return { county: m?.[1], name: name || id };
}

interface Props {
  result: PrecinctResult | undefined;
  /** 'base' = real votes; 'prob' = a simulated draw (shares only, the vote counts are scaled shares). */
  mode?: 'base' | 'prob';
  /** extra lines, e.g. election-night "62% counted" */
  extra?: React.ReactNode;
  title?: string;
}

/** The floating precinct tooltip: name, every candidate's votes and share, and who leads by how much. */
export function PrecinctTooltip({ result, mode = 'base', extra, title }: Props) {
  if (!result) return <span className="text-ink-dim">no result for this precinct</span>;
  const { county, name } = prettyPrecinctId(result.id);
  const total = result.total || Object.values(result.candidates).reduce((a, b) => a + b, 0) || 1;
  const rows = Object.entries(result.candidates).sort((a, b) => b[1] - a[1]);
  const other = Math.max(0, total - rows.reduce((a, [, v]) => a + v, 0));
  return (
    <div>
      <div className="text-ink font-semibold leading-tight">{title ?? name}</div>
      {county && <div className="text-ink-dim text-[10px] mb-1">county {county} · {Math.round(result.total).toLocaleString()} votes</div>}
      {extra}
      <div className="mt-1 space-y-0.5">
        {rows.map(([cand, v]) => (
          <div key={cand} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: onDark(CAND_COLOR[cand.toUpperCase()] ?? '#8A6FD6') }} />
            <span className="text-ink-muted">{cand}</span>
            <span className="ml-auto pl-3 text-right">
              {mode === 'base' && <span className="text-ink-dim mr-1.5">{Math.round(v).toLocaleString()}</span>}
              {((v / total) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
        {other > 0.5 && mode === 'base' && (
          <div className="flex items-center gap-1.5 text-ink-dim">
            <span className="w-2 h-2 rounded-sm shrink-0 bg-hairline-bright" />
            <span>Other</span>
            <span className="ml-auto pl-3">{Math.round(other).toLocaleString()} · {((other / total) * 100).toFixed(1)}%</span>
          </div>
        )}
      </div>
      {result.winner && result.margin != null && (
        <div className="mt-1 pt-1 border-t border-hairline text-ink-muted">
          {result.winner} +{(result.margin * 100).toFixed(1)}{result.classification ? ` · ${result.classification}` : ''}
        </div>
      )}
    </div>
  );
}
