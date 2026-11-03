import test from 'node:test';
import assert from 'node:assert/strict';
import { HAMSTER_TEMPLATES, GROUPS, nextWindow, windowId, parseWindowId, roundsNeeded, settle, lineFor, optionsFor, endRound } from '../src/hamster.ts';

const GENESIS = 1791847800; // live SqueekCore genesis, a multiple of 600 seconds
const at = iso => Date.parse(iso) / 1000;

test('catalog restores every hamster market family', () => {
  const keys = HAMSTER_TEMPLATES.map(t => t.key);
  for (const k of ['blocks1h', 'blocks6h', 'blocks24h', 'blocks7d', 'record24h', 'streak', 'active', 'wake1h', 'daypart', 'wake24h', 'night24h']) assert.ok(keys.includes(k), k);
  for (const g of GROUPS) assert.ok(HAMSTER_TEMPLATES.some(t => t.group === g.id), g.id);
  // 24h and 7d lines settle on chain; shorter windows are free calls.
  assert.equal(HAMSTER_TEMPLATES.find(t => t.key === 'blocks24h').mode, 'chain');
  assert.equal(HAMSTER_TEMPLATES.find(t => t.key === 'blocks7d').mode, 'chain');
  assert.equal(HAMSTER_TEMPLATES.find(t => t.key === 'blocks1h').mode, 'call');
});

test('free-call windows are the next UTC hour, 6-hour block and day', () => {
  const now = at('2026-11-03T13:20:00Z');
  assert.deepEqual(nextWindow(3600, now), { start: at('2026-11-03T14:00:00Z'), end: at('2026-11-03T15:00:00Z') });
  assert.deepEqual(nextWindow(21600, now), { start: at('2026-11-03T18:00:00Z'), end: at('2026-11-04T00:00:00Z') });
  assert.equal(nextWindow(86400, now).start, at('2026-11-04T00:00:00Z'));
});

test('window ids round-trip and reject unknown keys', () => {
  const id = windowId('blocks6h', at('2026-11-03T18:00:00Z'));
  const w = parseWindowId(id);
  assert.equal(w.template.key, 'blocks6h');
  assert.equal(w.end - w.start, 21600);
  assert.equal(parseWindowId('blocks24h:123'), undefined, 'on-chain templates are not free calls');
  assert.equal(parseWindowId('nope:1'), undefined);
});

test('UTC hours sit on the SqueekCore round grid', () => {
  const start = at('2026-11-03T14:00:00Z');
  assert.equal(endRound(GENESIS, start), (start - GENESIS) / 600);
  assert.equal(endRound(GENESIS, start + 60), undefined);
  assert.equal(roundsNeeded('blocks', GENESIS, start, start + 3600).length, 2);
  assert.equal(roundsNeeded('daypart', GENESIS, start, start + 86400).length, 5);
  assert.equal(roundsNeeded('streak', GENESIS, start, start + 86400).length, 145);
});

test('settlement follows the contract rule: exactly the line is under', () => {
  const heights = new Map([[10, 100], [16, 140]]);
  assert.equal(settle('blocks', [10, 16], heights, 40).winner, 1);
  assert.equal(settle('blocks', [10, 16], heights, 39).winner, 0);
  assert.equal(settle('any', [10, 16], heights).winner, 0);
  assert.equal(settle('any', [10, 16], new Map([[10, 5], [16, 5]])).winner, 1);
  assert.equal(settle('blocks', [10, 17], heights, 1), undefined, 'missing endpoint never settles');
});

test('streak, active rounds and busiest daypart', () => {
  const rounds = Array.from({ length: 145 }, (_, i) => i);
  const heights = new Map();
  let h = 0;
  for (const r of rounds) { if (r >= 1 && r <= 24) h += 1; if (r === 100) h += 50; heights.set(r, h); }
  const streak = settle('streak', rounds, heights);
  assert.equal(streak.winner, 2, '24 rounds = 4h streak is "3 to 6 hours"');
  assert.equal(settle('active', rounds, heights).winner, 0, '25 active rounds');
  const parts = [0, 36, 72, 108, 144];
  assert.equal(settle('daypart', parts, heights).winner, 2, 'round 100 sits in the third block');
  const tie = new Map(parts.map(r => [r, 0]));
  assert.equal(settle('daypart', parts, tie).winner, 0, 'ties go to the earlier block');
});

test('lines scale with the daily average', () => {
  assert.equal(lineFor(3600, 960), 40);
  assert.equal(lineFor(21600, 960), 240);
  const hourly = HAMSTER_TEMPLATES.find(t => t.key === 'blocks1h');
  assert.deepEqual(optionsFor(hourly, 40), ['Over 40.5', 'Under 40.5']);
});

test('streak boundaries land in the bucket whose label includes them', async () => {
  const { STREAK_OPTIONS } = await import('../src/hamster.ts');
  const rounds = Array.from({ length: 145 }, (_, i) => i);
  const at = cap => settle('streak', rounds, new Map(rounds.map(r => [r, Math.min(r, cap)])));
  assert.equal(STREAK_OPTIONS[at(6).winner], '1 to under 3 hours', 'exactly 1h');
  assert.equal(STREAK_OPTIONS[at(18).winner], '3 to under 6 hours', 'exactly 3h');
  assert.equal(STREAK_OPTIONS[at(36).winner], '6 hours or more', 'exactly 6h');
  assert.equal(STREAK_OPTIONS[at(5).winner], 'Under 1 hour', '50 minutes');
});
