import type { Party } from '../../lib/types';
import type { SwingRow } from '../../lib/geo/returns';
import { onDark } from '../../lib/partyColors';

interface Props {
  parties: Party[];
  rows: SwingRow[];
  keys: { key: string; label: string }[];
  /** when given, each party's baseline column can be changed by hand */
  onRemap?: (partyId: string, key: string | null) => void;
  source?: string;
  /** shown when Before/Now are shares of the Democratic+Republican pair */
  twoParty?: boolean;
}

const pct = (v: number | undefined) => (v === undefined ? '—' : `${(v * 100).toFixed(1)}%`);

/** Previous election → your aggregate, party by party: the swing that every region's expected result is built from. */
export function BaselineShiftTable({ parties, rows, keys, onRemap, source, twoParty }: Props) {
  const byId = Object.fromEntries(parties.map((p) => [p.id, p]));
  return (
    <div data-testid="baseline-shifts">
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <h3 className="font-display font-700 text-sm">Baseline shifts</h3>
        {source && <span className="text-[10px] font-data text-ink-dim truncate max-w-[60%]" title={source}>vs {source}</span>}
      </div>
      {twoParty && <p className="text-[10px] font-data text-ink-dim mb-1">Two-party comparison: the previous result only has Democratic and Republican columns, so both sides are shown as a share of that pair.</p>}
      <table className="w-full text-xs font-data">
        <thead>
          <tr className="text-ink-dim uppercase text-[10px]">
            <th className="text-left font-normal pb-1">Party</th>
            <th className="text-right font-normal pb-1">Before</th>
            <th className="text-right font-normal pb-1">Now</th>
            <th className="text-right font-normal pb-1">Shift</th>
            <th className="text-left font-normal pb-1 pl-3">Compared with</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const p = byId[r.partyId];
            const shift = r.shift === undefined ? undefined : r.shift * 100;
            const label = r.key === '__rest__' ? 'everything else (Others)' : keys.find((k) => k.key === r.key)?.label ?? (r.key ?? '');
            return (
              <tr key={r.partyId} className="border-t border-hairline">
                <td className="py-1 pr-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: onDark(p?.color) }} />
                    <span className="truncate max-w-[9rem]">{p?.shortName ?? r.partyId}</span>
                  </span>
                </td>
                <td className="py-1 text-right text-ink-muted">{pct(r.previous)}</td>
                <td className="py-1 text-right">{pct(r.now)}</td>
                <td className={`py-1 text-right ${shift === undefined ? 'text-ink-dim' : shift > 0.05 ? 'text-green-400' : shift < -0.05 ? 'text-red-call' : 'text-ink-muted'}`}>
                  {shift === undefined ? '—' : `${shift > 0 ? '▲' : shift < 0 ? '▼' : '·'} ${Math.abs(shift).toFixed(1)}`}
                </td>
                <td className="py-1 pl-3">
                  {onRemap ? (
                    <select
                      value={r.key ?? ''}
                      onChange={(e) => onRemap(r.partyId, e.target.value || null)}
                      className="bg-panel-raised border border-hairline rounded px-1 py-0.5 text-[11px] max-w-[9.5rem]"
                      aria-label={`Baseline column for ${p?.shortName ?? r.partyId}`}
                    >
                      <option value="">— none —</option>
                      <option value="__rest__">everything else (Others)</option>
                      {keys.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                    </select>
                  ) : (
                    <span className={r.key ? 'text-ink-dim' : 'text-gold'}>{r.key ? label : 'no counterpart'}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.some((r) => r.key === null) && (
        <p className="text-[11px] text-gold mt-1.5">Parties with no counterpart in the baseline take the aggregate unadjusted — no regional lean is applied to them.</p>
      )}
    </div>
  );
}
