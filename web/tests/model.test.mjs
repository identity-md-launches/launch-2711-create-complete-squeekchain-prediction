import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEther } from 'viem';
import { amount, thresholdValue, startRound, payout, phase, eth } from '../src/model.ts';

test('stakes preserve wei precision and enforce bounds without coercion', () => {
  assert.equal(amount('0.0001'), 100000000000000n);
  assert.equal(amount('0.001000000000000001'), 1000000000000001n);
  assert.equal(amount('100'), parseEther('100'));
  for (const invalid of ['0', '0.000099', '-1', '1e-3', 'Infinity', '01', '0.0000000000000000001', '100.000000000000000001']) assert.throws(() => amount(invalid), undefined, invalid);
});
test('block targets support the entire on-chain uint64 range', () => {
  assert.equal(thresholdValue('0'), 0n);
  assert.equal(thresholdValue('18446744073709551615'), (1n << 64n) - 1n);
  for (const invalid of ['', '1.5', '-1', '1e4', '18446744073709551616']) assert.throws(() => thresholdValue(invalid));
});
test('a suggested start always aligns to a round and respects the lead', () => {
  for (const now of [100000n, 100001n, 100599n, 100600n]) {
    const genesis = 1000n;
    for (const lead of [7200, 21600, 86400]) {
      const round = startRound(genesis, now, lead);
      const start = genesis + (round - 1n) * 600n;
      assert(start >= now + BigInt(lead));
      assert(start < now + BigInt(lead) + 600n);
    }
  }
  assert.throws(() => startRound(0n, 1000n, 7200));
  assert.throws(() => startRound(1001n, 1000n, 7200));
});
test('estimated payout includes previous same-side stake and the new stake', () => {
  const m = { yesPool: parseEther('0.004'), noPool: parseEther('0.005') };
  assert.equal(payout(m, true, parseEther('0.001'), parseEther('0.002')), parseEther('0.006'));
  assert.equal(payout({ yesPool: 0n, noPool: 0n }, true, parseEther('0.001')), null);
  assert.equal(payout({ yesPool: 0n, noPool: parseEther('0.005') }, true, parseEther('0.001')), parseEther('0.006'));
});
test('lifecycle boundaries close bets exactly at startsAt and unlock timeout refunds', () => {
  const m = { status: 0, startsAt: 100n, endsAt: 200n, refundAt: 300n, yesPool: 1n, noPool: 1n, endRound: 20n };
  assert.equal(phase(m, 99n), 'Open for bets');
  assert.equal(phase(m, 100n), 'In progress');
  assert.equal(phase(m, 200n, 19n), 'Awaiting settlement');
  assert.equal(phase(m, 200n, 20n), 'Ready to resolve');
  assert.equal(phase(m, 300n, 20n), 'Refund available');
  assert.equal(phase({ ...m, noPool: 0n }, 100n), 'Refund available');
  assert.equal(phase({ ...m, status: 1 }, 300n), 'Resolved');
  assert.equal(phase({ ...m, status: 2 }, 300n), 'Refunded');
});
test('tiny positive balances are never displayed as zero', () => {
  assert.equal(eth(1n), '<0.00001');
  assert.equal(eth(0n), '0');
  assert.equal(eth(parseEther('0.001')), '0.001');
});
