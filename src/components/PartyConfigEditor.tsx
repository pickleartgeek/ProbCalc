import type { Party } from '../lib/types';

interface Props {
  parties: Party[];
  onChange: (parties: Party[]) => void;
}

export function PartyConfigEditor({ parties, onChange }: Props) {
  function update(id: string, patch: Partial<Party>) {
    onChange(parties.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
  function remove(id: string) {
    onChange(parties.filter((p) => p.id !== id));
  }

  if (parties.length === 0) {
    return <p className="text-ink-dim text-sm">Parse a poll table below to populate parties here.</p>;
  }

  return (
    <div className="space-y-2">
      {parties.map((p) => (
        <div key={p.id} className="flex items-center gap-2 bg-panel-raised border border-hairline rounded px-2 py-1.5">
          <input
            type="color"
            value={p.color}
            onChange={(e) => update(p.id, { color: e.target.value })}
            className="w-7 h-7 rounded cursor-pointer bg-transparent shrink-0"
            title="Party colour"
          />
          <input
            type="text"
            value={p.name}
            onChange={(e) => update(p.id, { name: e.target.value })}
            className="flex-1 min-w-0 bg-transparent text-sm text-ink outline-none"
            placeholder="Party name"
          />
          <input
            type="text"
            value={p.shortName}
            onChange={(e) => update(p.id, { shortName: e.target.value })}
            className="w-16 bg-transparent text-sm text-ink-muted font-data outline-none border-l border-hairline pl-2"
            placeholder="Short"
            maxLength={8}
          />
          <button
            onClick={() => remove(p.id)}
            className="text-ink-dim hover:text-red-call text-xs px-1 shrink-0"
            title="Remove party"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
