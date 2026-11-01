import test from 'node:test';
import assert from 'node:assert/strict';
import { generateHouseSeats, houseDistrictPrevMargins } from '../src/lib/midterms/houseData';
import { HOUSE_APPORTIONMENT } from '../src/lib/midterms/stateGrid';

test('House seats use real district margins (not state lean + noise)', () => {
  const prev = houseDistrictPrevMargins();
  assert.equal(Object.keys(prev).length, 435);
  assert.ok(prev['TX-35'] < -30, 'TX-35 is a D+33 district');
  assert.ok(prev['AL-1'] > 50, 'AL-1 is deep R');
  assert.equal(generateHouseSeats().length, Object.values(HOUSE_APPORTIONMENT).reduce((a, b) => a + b, 0));
});
