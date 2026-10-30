"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Interface } = require("../frontend/vendor/ethers-6.15.0.umd.min.js");
const { uint64, firstRound, phase } = require("../frontend/helpers.js");

test("block targets use exact uint64 arithmetic, including values beyond JS number precision", () => {
  assert.equal(uint64("18446744073709551615", "target"), (1n << 64n) - 1n);
  for (const invalid of ["-1", "1.2", "1e3", "", "0x10", "18446744073709551616"]) {
    assert.throws(() => uint64(invalid, "target"));
  }
});

test("suggested start is a future round boundary with enough time to bet", () => {
  const genesis = 1700000000n;
  for (const offset of [0n, 1n, 599n, 600n, 10000001n]) {
    for (const lead of [7200n, 21600n, 86400n]) {
      const now = genesis + offset;
      const round = firstRound(genesis, now, lead);
      const startsAt = genesis + (round - 1n) * 600n;
      assert.ok(startsAt >= now + lead);
      assert.ok(startsAt < now + lead + 600n);
      assert.ok(startsAt >= now + 3600n && startsAt <= now + 604800n);
    }
  }
  assert.throws(() => firstRound(genesis, genesis - 1n, 7200n));
  assert.throws(() => firstRound(genesis, genesis, 1n));
});

test("market display follows exact betting, resolution and refund boundaries", () => {
  const m = { status: 0n, startsAt: 100n, endsAt: 200n, refundAt: 300n, yesPool: 1n, noPool: 1n };
  assert.equal(phase(m, 99n), "Betting open");
  assert.equal(phase(m, 100n), "Window in progress");
  assert.equal(phase(m, 200n), "Awaiting resolution");
  assert.equal(phase(m, 300n), "Refund available");
  assert.equal(phase({ ...m, noPool: 0n }, 100n), "Unmatched · Refund available");
  assert.equal(phase({ ...m, status: 1n, yesWins: false }, 500n), "Resolved · NO");
  assert.equal(phase({ ...m, status: 2n }, 500n), "Cancelled · Refunds");
});

test("packaged frontend ABIs exactly match the compiled Solidity contracts", () => {
  for (const [name, file] of [["SqueekPredict", "abi.json"], ["ISqueekCore", "core-abi.json"]]) {
    const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, `../out/${name}.sol/${name}.json`), "utf8"));
    const packaged = require(`../frontend/${file}`);
    assert.deepEqual(packaged, artifact.abi);
    const iface = new Interface(packaged);
    assert.ok(iface.fragments.length > 0);
  }
});

test("frontend's Core ABI decodes an official V3 point response with dynamic tuple-array encoding", () => {
  const iface = new Interface(require("../frontend/core-abi.json"));
  const position = [148986n, 13095604188187n, 11266];
  const data = iface.encodeFunctionResult("roundPage", [[1973n, position, position, []]]);
  const [point] = iface.decodeFunctionResult("roundPage", data);
  assert.equal(point.certifiedThroughRound, 1973n);
  assert.equal(point.end.cumulativeBlockUnits, 13095604188187n);
  assert.equal(point.rounds.length, 0);
});
