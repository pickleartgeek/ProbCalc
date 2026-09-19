import type { BaseCalcResult, ProbCalcResult, Party, SimulationConfig, SimulationOutcome } from './types';
import { sampleGamma } from './gamma';
import { applyEnvironmentShift } from './environmentShift';

function marginType(topPct: number): SimulationOutcome['marginType'] {
  if (topPct >= 0.66) return 'Supermajority';
  if (topPct >= 0.5) return 'Majority';
  return 'Plurality';
}

/**
 * Runs the full ProbCalc Monte Carlo simulation: for each simulation, draws a
 * Gamma(alpha_i, beta) sample per party, normalizes to percentages, and records
 * the winner. Mirrors the guide's =GAMMA.INV(RAND(); alpha; beta) + INDEX/MATCH/MAX
 * winner-identification approach.
 *
 * If `config.environmentShift` is set (guide section III.II, generalized to any
 * number of parties), each party's alpha is re-centered around its
 * environment-shifted share before sampling — the gamma draw still supplies the
 * per-simulation uncertainty, it's just centered on the extrapolated baseline
 * instead of the raw BaseCalc number.
 */
export function runProbCalc(
  parties: Party[],
  baseCalc: BaseCalcResult[],
  config: SimulationConfig
): { results: ProbCalcResult[]; outcomes: SimulationOutcome[] } {
  const alphaByParty: Record<string, number> = {};
  baseCalc.forEach((r) => (alphaByParty[r.partyId] = Math.max(r.alpha, 0.0001)));

  const shift = config.environmentShift;
  if (shift?.enabled) {
    const sumAlpha = Object.values(alphaByParty).reduce((a, b) => a + b, 0);
    const ownShares: Record<string, number> = {};
    baseCalc.forEach((r) => (ownShares[r.partyId] = r.percentage * 100));
    const shifted = applyEnvironmentShift({
      ownShares,
      previousEnvironment: shift.previousEnvironment,
      currentEnvironment: shift.currentEnvironment,
      weight: shift.weight,
    });
    baseCalc.forEach((r) => {
      const sharePct = shifted[r.partyId] ?? ownShares[r.partyId];
      alphaByParty[r.partyId] = Math.max((sharePct / 100) * sumAlpha, 0.0001);
    });
  }

  const wins: Record<string, number> = {};
  parties.forEach((p) => (wins[p.id] = 0));

  const outcomes: SimulationOutcome[] = [];
  const n = Math.max(1, Math.min(config.simulations, 20000));

  for (let i = 0; i < n; i++) {
    const raw: Record<string, number> = {};
    let sum = 0;
    for (const party of parties) {
      const g = sampleGamma(alphaByParty[party.id], config.beta);
      raw[party.id] = g;
      sum += g;
    }
    const values: Record<string, number> = {};
    let topId = parties[0]?.id ?? '';
    let topPct = -Infinity;
    for (const party of parties) {
      const pct = sum > 0 ? raw[party.id] / sum : 0;
      values[party.id] = pct;
      if (pct > topPct) {
        topPct = pct;
        topId = party.id;
      }
    }
    wins[topId] = (wins[topId] ?? 0) + 1;
    outcomes.push({
      index: i,
      values,
      winnerId: topId,
      marginType: marginType(topPct),
    });
  }

  const results: ProbCalcResult[] = baseCalc.map((b) => ({
    ...b,
    winProbability: (wins[b.partyId] ?? 0) / n,
  }));

  return { results, outcomes };
}
