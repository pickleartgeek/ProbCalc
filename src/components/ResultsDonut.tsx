import { PieChart, Pie, Cell, Tooltip } from 'recharts';
import type { Party } from '../lib/types';

interface Slice {
  partyId: string;
  value: number; // 0-1
}

interface Props {
  parties: Party[];
  slices: Slice[];
  centerLabel: string;
  centerSubLabel: string;
}

export function ResultsDonut({ parties, slices, centerLabel, centerSubLabel }: Props) {
  const partyById = Object.fromEntries(parties.map((p) => [p.id, p]));
  const data = slices
    .filter((s) => s.value > 0.001)
    .map((s) => ({ name: partyById[s.partyId]?.shortName ?? s.partyId, value: s.value, color: partyById[s.partyId]?.color ?? '#888' }));

  return (
    <div className="relative flex items-center justify-center">
      <PieChart width={260} height={260}>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={78}
          outerRadius={120}
          paddingAngle={1.5}
          stroke="#0a0e17"
          strokeWidth={2}
          isAnimationActive={false}
        >
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v, n) => [`${((v as number) * 100).toFixed(1)}%`, n]}
          contentStyle={{ background: '#121826', border: '1px solid #262f45', borderRadius: 6, fontSize: 12 }}
          itemStyle={{ color: '#eef0f6' }}
        />
      </PieChart>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="font-data text-2xl font-bold text-ink">{centerLabel}</div>
        <div className="text-ink-dim text-[11px] font-data uppercase tracking-wide">{centerSubLabel}</div>
      </div>
    </div>
  );
}
