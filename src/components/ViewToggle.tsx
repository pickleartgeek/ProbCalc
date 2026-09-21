import { useEngine } from '../state/store';

/** The BaseCalc | ProbCalc switch. Both tabs are always available: BaseCalc never needs a simulation, and ProbCalc runs itself on first open. */
export function ViewToggle({ onSelect }: { onSelect?: (m: 'base' | 'prob') => void }) {
  const { viewMode, setViewMode } = useEngine();
  const pick = (m: 'base' | 'prob') => {
    setViewMode(m);
    onSelect?.(m);
  };
  return (
    <div className="flex items-center gap-1 bg-panel border border-hairline rounded-full p-1" role="tablist" aria-label="Model view">
      <button role="tab" aria-selected={viewMode === 'base'} onClick={() => pick('base')}
        className={`px-4 py-1.5 rounded-full text-sm font-display font-700 transition ${viewMode === 'base' ? 'bg-cyan/90 text-void' : 'text-ink-muted hover:text-ink'}`}>
        BaseCalc
      </button>
      <button role="tab" aria-selected={viewMode === 'prob'} onClick={() => pick('prob')}
        className={`px-4 py-1.5 rounded-full text-sm font-display font-700 transition ${viewMode === 'prob' ? 'bg-gold text-void' : 'text-ink-muted hover:text-ink'}`}>
        ProbCalc
      </button>
    </div>
  );
}
