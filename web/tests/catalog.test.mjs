import test from "node:test";
import assert from "node:assert/strict";
import { parseEther } from "viem";
import {
  CATEGORIES,
  TEMPLATES,
  emptyBook,
  parseBook,
  placePractice,
  practiceOdds,
  practicePools,
  templateMarket,
} from "../src/catalog.ts";
const account = "0x1234567890123456789012345678901234567890"; // Test-only fixture, never shipped as a recipient.
const other = "0x2234567890123456789012345678901234567890";
const now = Date.parse("2026-11-06T10:15:00Z") / 1000;
const m = templateMarket(TEMPLATES[0], now);

test("twelve distinct binary templates cover only verifiable block activity", () => {
  assert.equal(TEMPLATES.length, 12);
  assert.equal(new Set(TEMPLATES.map((t) => t.key)).size, 12);
  for (const t of TEMPLATES) {
    assert.ok(CATEGORIES.includes(t.category));
    assert.ok(t.question.endsWith("?"));
    assert.ok(Number.isInteger(t.threshold) && t.threshold >= 0);
    assert.ok([1, 6, 24, 168].includes(t.hours));
    const window = templateMarket(t, now);
    assert.ok(window.startsAt > now);
    assert.equal(window.startsAt % 600, 0);
    assert.equal(window.endsAt - window.startsAt, t.hours * 3600);
    assert.equal(practiceOdds(emptyBook(), window.id, true), 50);
    assert.equal(practiceOdds(emptyBook(), window.id, false), 50);
  }
});
test("daily, overnight and weekly windows have stable UTC boundaries and roll over", () => {
  assert.equal(m.startsAt, Date.parse("2026-11-07T00:00:00Z") / 1000);
  const night = templateMarket(
    TEMPLATES.find((t) => t.key === "night-500"),
    now,
  );
  assert.equal(new Date(night.startsAt * 1000).getUTCHours(), 0);
  assert.equal(new Date(night.endsAt * 1000).getUTCHours(), 6);
  const week = templateMarket(
    TEMPLATES.find((t) => t.hours === 168),
    now,
  );
  assert.equal(new Date(week.startsAt * 1000).getUTCDay(), 1);
  assert.ok(templateMarket(TEMPLATES[0], m.startsAt).startsAt > m.startsAt);
  assert.equal(templateMarket(TEMPLATES[0], now + 60).id, m.id);
});
test("practice bets preserve wei, do not mutate earlier state, and update volume and odds", () => {
  const original = emptyBook();
  const yes = placePractice(
    original,
    m,
    account,
    true,
    "0.001000000000000001",
    now,
  );
  assert.equal(original.positions.length, 0);
  assert.equal(
    yes.positions[0].yes,
    parseEther("0.001000000000000001").toString(),
  );
  assert.equal(practiceOdds(yes, m.id, true), 100);
  const both = placePractice(yes, m, account, false, "0.003", now);
  assert.equal(yes.positions[0].no, "0");
  assert.equal(both.positions.length, 1);
  assert.equal(practiceOdds(both, m.id, true), 25);
  assert.equal(practiceOdds(both, m.id, false), 75);
  assert.equal(
    practicePools(both, m.id).yesPool + practicePools(both, m.id).noPool,
    parseEther("0.004000000000000001"),
  );
});
test("position ownership is account-scoped and repeated bets accumulate", () => {
  let book = placePractice(emptyBook(), m, account, true, "0.001", now);
  book = placePractice(book, m, account, true, "0.002", now);
  book = placePractice(book, m, other, false, "0.001", now);
  assert.equal(book.positions.length, 2);
  assert.equal(
    book.positions.find((p) => p.account === account).yes,
    parseEther("0.003").toString(),
  );
});
test("closed windows, precision errors, minimum stakes and aggregate side caps are enforced", () => {
  assert.throws(
    () => placePractice(emptyBook(), m, account, true, "0.001", m.startsAt),
    /closed/,
  );
  for (const value of [
    "0",
    "-1",
    "1e-3",
    "0.00001",
    "100.0001",
    "0.0000000000000000001",
  ])
    assert.throws(() =>
      placePractice(emptyBook(), m, account, true, value, now),
    );
  const full = placePractice(emptyBook(), m, account, true, "100", now);
  assert.throws(
    () => placePractice(full, m, other, true, "0.001", now),
    /at most/,
  );
  assert.doesNotThrow(() => placePractice(full, m, other, false, "0.001", now));
});
test("saved positions round-trip, freeze their window, and reject corrupt storage", () => {
  const book = placePractice(emptyBook(), m, account, true, "0.001", now);
  assert.deepEqual(parseBook(JSON.stringify(book)), book);
  for (const raw of [
    "broken",
    "null",
    "[]",
    "{}",
    '{"version":2,"positions":[]}',
  ])
    assert.deepEqual(parseBook(raw), emptyBook());
  for (const edit of [
    (p) => (p.account = "bad"),
    (p) => (p.yes = "-1"),
    (p) => (p.market.key = "unknown"),
    (p) => p.market.endsAt++,
    (p) => (p.market.id = "fake"),
  ]) {
    const modified = structuredClone(book);
    edit(modified.positions[0]);
    assert.deepEqual(parseBook(JSON.stringify(modified)), emptyBook());
  }
  assert.equal(book.positions[0].market.startsAt, m.startsAt);
});
