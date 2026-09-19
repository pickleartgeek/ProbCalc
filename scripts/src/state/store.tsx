import { createContext, useContext, useState, type ReactNode } from 'react';
import type { BaseCalcResult, ElectionConfig, ParsedPollData, ProbCalcResult, SimulationOutcome } from '../lib/types';

interface EngineState {
  config: ElectionConfig | null;
  pollData: ParsedPollData | null;
  baseCalcResults: BaseCalcResult[] | null;
  probCalcResults: ProbCalcResult[] | null;
  outcomes: SimulationOutcome[] | null;
  viewMode: 'base' | 'prob';
  candidatePortraits: Record<string, string>; // partyId -> data URL
}

interface EngineContextValue extends EngineState {
  setConfig: (c: ElectionConfig) => void;
  setPollData: (d: ParsedPollData) => void;
  setBaseCalcResults: (r: BaseCalcResult[]) => void;
  setProbCalcResults: (r: ProbCalcResult[], outcomes: SimulationOutcome[]) => void;
  setViewMode: (m: 'base' | 'prob') => void;
  setCandidatePortrait: (partyId: string, dataUrl: string) => void;
  reset: () => void;
}

const EngineContext = createContext<EngineContextValue | null>(null);

const initialState: EngineState = {
  config: null,
  pollData: null,
  baseCalcResults: null,
  probCalcResults: null,
  outcomes: null,
  viewMode: 'base',
  candidatePortraits: {},
};

export function EngineProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EngineState>(initialState);

  const value: EngineContextValue = {
    ...state,
    setConfig: (c) => setState((s) => ({ ...s, config: c })),
    setPollData: (d) => setState((s) => ({ ...s, pollData: d })),
    setBaseCalcResults: (r) => setState((s) => ({ ...s, baseCalcResults: r, probCalcResults: null, outcomes: null, viewMode: 'base' })),
    setProbCalcResults: (r, outcomes) => setState((s) => ({ ...s, probCalcResults: r, outcomes, viewMode: 'prob' })),
    setViewMode: (m) => setState((s) => ({ ...s, viewMode: m })),
    setCandidatePortrait: (partyId, dataUrl) =>
      setState((s) => ({ ...s, candidatePortraits: { ...s.candidatePortraits, [partyId]: dataUrl } })),
    reset: () => setState(initialState),
  };

  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
}

export function useEngine() {
  const ctx = useContext(EngineContext);
  if (!ctx) throw new Error('useEngine must be used within EngineProvider');
  return ctx;
}
