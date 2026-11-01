import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runProbCalc } from '../src/lib/probCalc';
import { winProbR, winProbRFast, twoPartyAlphas, marginForRProb, betaCdf, STATE_STRENGTH, UNPOLLED_ENV_WEIGHT } from '../src/lib/midterms/raceProb';
import type { Party, BaseCalcResult } from '../src/lib/types';
import { computeSenateRaces } from '../src/lib/midterms/senateData';

const parties = [{ id: 'D', name: 'D', shortName: 'D', color: '#00f' }, { id: 'R', name: 'R', shortName: 'R', color: '#f00' }] as unknown as Party[];

test('winProbR equals what runProbCalc converges to (the actual engine, 20,000 simulations)', () => {
  for (const [margin, strength] of [[0, 100], [-4.8, 200], [3, 90], [-12, 200], [8, 400], [1, 40]] as const) {
    const { alphaD, alphaR } = twoPartyAlphas(margin, strength);
    const baseCalc: BaseCalcResult[] = [{ partyId: 'D', alpha: alphaD, percentage: alphaD / strength }, { partyId: 'R', alpha: alphaR, percentage: alphaR / strength }];
    const { results } = runProbCalc(parties, baseCalc, { simulations: 20000, beta: 1 } as never);
    const mc = results.find((r) => r.partyId === 'R')!.winProbability;
    assert.ok(Math.abs(mc - winProbR(margin, strength)) < 0.015, `margin ${margin}, strength ${strength}: engine ${mc.toFixed(3)} vs exact ${winProbR(margin, strength).toFixed(3)}`);
  }
});

test('sanity: even race is 50%, bigger leads are surer, more polling (strength) is surer', () => {
  assert.ok(Math.abs(winProbR(0, 150) - 0.5) < 1e-6);
  assert.ok(winProbR(-10, 200) < winProbR(-5, 200) && winProbR(-5, 200) < winProbR(0, 200));
  assert.ok(winProbR(-5, 400) < winProbR(-5, 100), 'a D+5 lead is surer with more polling behind it');
  assert.ok(Math.abs(winProbR(6, 200) + winProbR(-6, 200) - 1) < 1e-9, 'symmetric');
  // the cases that looked wrong under the old margin/200 scale
  assert.ok(winProbR(-22, STATE_STRENGTH) < 0.01, 'a 22-point D lead is essentially safe');
  assert.ok(winProbR(-4.8, STATE_STRENGTH) < 0.3, 'a ~5-point D lead is clearly favoured');
  assert.equal(betaCdf(0, 2, 3), 0); assert.equal(betaCdf(1, 2, 3), 1);
});

test('lookup table and bisection agree with the exact function', () => {
  for (const m of [-30, -7.3, 0, 2.2, 19]) assert.ok(Math.abs(winProbRFast(m, 200) - winProbR(m, 200)) < 2e-3, `margin ${m}`);
  for (const p of [0.02, 0.25, 0.5, 0.9]) assert.ok(Math.abs(winProbR(marginForRProb(p, 200), 200) - p) < 1e-6);
});

test('races now come out of ProbCalc, not a flat scale: safe seats are safe, a ~5-point lead is clearly favoured', () => {
  const sen = computeSenateRaces(-6.8);
  const by = (a: string) => sen.find((r) => r.stateAbbr === a)!;
  assert.ok(by('IL').pR! < 0.05 && by('IL').rating === 'SafeD');
  assert.ok(by('GA').pR! < 0.35 && /D$/.test(by('GA').rating), `GA ${by('GA').rating} ${by('GA').pR}`);
  for (const r of sen) assert.ok(r.pR! >= 0 && r.pR! <= 1 && r.strength! >= 40);
  // a poll average's own strength is honoured (within bounds): same margin, more polling behind it -> surer
  const weak = computeSenateRaces(-6.8, UNPOLLED_ENV_WEIGHT, {}, { 'sen-ga': -5 }, { 'sen-ga': 60 }).find((r) => r.stateAbbr === 'GA')!;
  const strong = computeSenateRaces(-6.8, UNPOLLED_ENV_WEIGHT, {}, { 'sen-ga': -5 }, { 'sen-ga': 5000 }).find((r) => r.stateAbbr === 'GA')!;
  assert.ok(strong.pR! < weak.pR!);
  assert.equal(strong.strength, 400, 'capped');
});
