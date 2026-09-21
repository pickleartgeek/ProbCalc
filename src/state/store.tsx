import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { BaseCalcResult, ElectionConfig, ParsedPollData, ProbCalcResult, SimulationOutcome } from '../lib/types';
import { computeBaseCalc, computeBaseCalcTimeline, computePollWeights, optionsFromWeighting, type PollWeight, type TimelinePoint } from '../lib/baseCalc';

interface EngineState {
  config: ElectionConfig | null;
  pollData: ParsedPollData | null;
  probCalcResults: ProbCalcResult[] | null;
  outcomes: SimulationOutcome[] | null;
  viewMode: 'base' | 'prob';
  candidatePortraits: Record<string, string>; // partyId -> data URL
}

/** Everything BaseCalc produces. Derived — never stored — so it can't go stale when config or polls change. */
export interface BaseCalcBundle {
  results: BaseCalcResult[];
  includedPolls: number;
  excludedPolls: number;
  timeline: TimelinePoint[];
  weights: PollWeight[];
}

interface EngineContextValue extends EngineState {
  /** BaseCalc, computed the moment poll data exists — independent of the Monte Carlo layer. */
  baseCalc: BaseCalcBundle | null;
  /** Kept for existing pages: the headline aggregate. */
  baseCalcResults: BaseCalcResult[] | null;
  setConfig: (c: ElectionConfig) => void;
  setPollData: (d: ParsedPollData) => void;
  /** Loads a race (config + polls) atomically and clears any previous simulation. */
  setRace: (c: ElectionConfig, d: ParsedPollData, view?: 'base' | 'prob') => void;
  /** Patch only the geography binding — keeps polls and any finished simulation. */
  setRegionBinding: (b: import('../lib/types').RegionBinding | undefined) => void;
  setProbCalcResults: (r: ProbCalcResult[], outcomes: SimulationOutcome[]) => void;
  setViewMode: (m: 'base' | 'prob') => void;
  setCandidatePortrait: (partyId: string, dataUrl: string) => void;
  reset: () => void;
}

const EngineContext = createContext<EngineContextValue | null>(null);

const initialState: EngineState = {
  config: null,
  pollData: null,
  probCalcResults: null,
  outcomes: null,
  viewMode: 'base',
  candidatePortraits: {},
};

const todayIso = () => new Date().toISOString().slice(0, 10);

export function computeBaseCalcBundle(config: ElectionConfig, pollData: ParsedPollData, today = todayIso()): BaseCalcBundle {
  const opts = optionsFromWeighting(config.sim.dateWeighting);
  const head = computeBaseCalc(config.parties, pollData.rows, config.electionDate, opts);
  // a live race extends to today; a finished one stops at election day
  const endDate = today < config.electionDate ? today : config.electionDate;
  return {
    ...head,
    timeline: computeBaseCalcTimeline(config.parties, pollData.rows, config.electionDate, { ...opts, endDate }),
    weights: computePollWeights(config.parties, pollData.rows, config.electionDate, opts),
  };
}

export function EngineProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EngineState>(initialState);

  const baseCalc = useMemo(
    () => (state.config && state.pollData ? computeBaseCalcBundle(state.config, state.pollData) : null),
    [state.config, state.pollData]
  );

  const value: EngineContextValue = {
    ...state,
    baseCalc,
    baseCalcResults: baseCalc?.results ?? null,
    setConfig: (c) => setState((s) => ({ ...s, config: c, probCalcResults: null, outcomes: null })),
    setPollData: (d) => setState((s) => ({ ...s, pollData: d, probCalcResults: null, outcomes: null })),
    setRace: (c, d, view = 'base') => setState((s) => ({ ...s, config: c, pollData: d, probCalcResults: null, outcomes: null, viewMode: view })),
    setRegionBinding: (b) => setState((s) => (s.config ? { ...s, config: { ...s.config, regionBinding: b } } : s)),
    setProbCalcResults: (r, outcomes) => setState((s) => ({ ...s, probCalcResults: r, outcomes })),
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
