/* Pure argument validation shared by the browser and offline Node tests. */
(function (root) {
  "use strict";
  const CHAIN_ID = 11155111n;
  const CORE = "0x74665dAecA35A2303e767E76a2FF1FB6F93e119f";
  const UINT64_MAX = (1n << 64n) - 1n;
  function uint64(text, label) {
    if (!/^[0-9]+$/.test(text)) throw new Error(`${label} must be a whole number.`);
    const result = BigInt(text);
    if (result > UINT64_MAX) throw new Error(`${label} exceeds uint64.`);
    return result;
  }
  function firstRound(genesis, timestamp, lead) {
    if (![7200n, 21600n, 86400n].includes(lead)) throw new Error("Choose a supported betting window.");
    if (genesis <= 0n || genesis > timestamp) throw new Error("Invalid Core genesis.");
    return (timestamp + lead - genesis + 599n) / 600n + 1n;
  }
  function phase(m, timestamp) {
    if (Number(m.status) === 1) return m.yesWins ? "Resolved · YES" : "Resolved · NO";
    if (Number(m.status) === 2) return "Cancelled · Refunds";
    if (timestamp < m.startsAt) return "Betting open";
    if (timestamp >= m.refundAt) return "Refund available";
    if (m.yesPool === 0n || m.noPool === 0n) return "Unmatched · Refund available";
    if (timestamp < m.endsAt) return "Window in progress";
    return "Awaiting resolution";
  }
  const api = { CHAIN_ID, CORE, uint64, firstRound, phase };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SqueekUI = api;
})(globalThis);
