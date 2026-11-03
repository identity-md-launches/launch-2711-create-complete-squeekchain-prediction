import test from 'node:test';
import assert from 'node:assert/strict';
import { PREVIEW_TEMPLATES, previewWindow, pastWindows } from '../src/previews.ts';
import { computePastWeeks } from '../src/weeks.ts';

const daily = PREVIEW_TEMPLATES.find(t => t.key === 'tweets24');
const weekly = PREVIEW_TEMPLATES.find(t => t.key === 'tweets7d');
const mint = PREVIEW_TEMPLATES.find(t => t.key === 'nftMint');
const at = iso => Date.parse(iso) / 1000;

test('daily founder preview rolls over at 00:00 UTC', () => {
  const w = previewWindow(daily, at('2026-11-03T23:59:59Z'));
  assert.equal(w.id, 'tweets24:2026-11-03');
  assert.equal(w.end, at('2026-11-04T00:00:00Z'));
  assert.equal(previewWindow(daily, at('2026-11-04T00:00:00Z')).id, 'tweets24:2026-11-04');
});
test('weekly founder preview runs Monday to Monday UTC', () => {
  for (const iso of ['2026-11-02T00:00:00Z', '2026-11-05T12:00:00Z', '2026-11-08T23:59:59Z']) {
    const w = previewWindow(weekly, at(iso));
    assert.equal(w.id, 'tweets7d:2026-11-02', iso);
    assert.equal(w.end - w.start, 7 * 86400);
  }
  assert.equal(previewWindow(weekly, at('2026-11-09T00:00:00Z')).id, 'tweets7d:2026-11-09');
  assert.deepEqual(pastWindows(weekly, at('2026-11-05T00:00:00Z'), 2).map(w => w.id), ['tweets7d:2026-10-26', 'tweets7d:2026-10-19']);
});
test('NFT previews have no clock window', () => {
  assert.deepEqual(previewWindow(mint, at('2026-11-03T00:00:00Z')), { id: 'nftMint' });
  assert.deepEqual(pastWindows(mint, at('2026-11-03T00:00:00Z'), 3), []);
});
test('past weeks sum certified days and mark pre-launch windows null', () => {
  const heights = new Map();
  for (let d = 0; d <= 28; d++) heights.set(2000 - d * 144, (2000 - d * 144) * 2);
  // Rounds below zero are before genesis; only rounds >= 0 are read.
  const settled = 2000;
  for (const [r] of heights) if (r < 0) heights.delete(r);
  const s = computePastWeeks(settled, 1_000_000, heights);
  assert.equal(s.days.length, 28);
  assert.equal(s.days[27].blocks, 288);
  const firstKnown = s.days.findIndex(d => d.blocks !== null);
  assert.ok(firstKnown > 0, 'early days are before launch');
  assert.ok(s.days.slice(0, firstKnown).every(d => d.blocks === null));
  assert.equal(s.weeks[3].blocks, 288 * 7);
  assert.equal(s.weeks[3].activeDays, 7);
  assert.equal(s.total28, s.days.reduce((a, d) => a + (d.blocks ?? 0), 0));
  heights.delete(2000 - 144);
  assert.throws(() => computePastWeeks(settled, 1_000_000, heights), /incomplete/);
});
