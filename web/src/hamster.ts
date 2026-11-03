/* Hamster market catalog. Pure and import-free so node tests can load it directly.
 *
 * Two kinds of hamster market live here:
 * - "chain": 24-hour and 7-day block lines that the deployed SqueekPredict contract settles with ETH.
 * - "call": shorter or shape-based questions (1h, 6h, longest streak, active rounds, busiest part of
 *   the day) that the contract cannot settle. They take no ETH: a visitor saves a free call in the
 *   browser and the site checks it against certified SqueekCore heights once the window is certified.
 *
 * Free-call windows are aligned to UTC clock time. SqueekCore rounds are 10 minutes from genesis, and
 * the live genesis is a multiple of 600 seconds, so every UTC hour starts on a round boundary. */
export const ROUND = 600;
export const HOUR = 3600;
export const DAY = 86400;
export const WEEK = 604800;

export type Group = 'blocks' | 'runs' | 'activity';
export const GROUPS: { id: Group; label: string }[] = [
  { id: 'blocks', label: 'Block counts' },
  { id: 'runs', label: 'Longest runs' },
  { id: 'activity', label: 'Activity windows' },
];

export type Measure = 'blocks' | 'any' | 'streak' | 'active' | 'daypart';
export type CallTemplate = {
  mode: 'call'; key: string; group: Group; span: number; measure: Measure;
  /** Over/under markets use a line; bucket markets use fixed options. */
  options?: string[]; resolution: string;
};
export type ChainTemplate = {
  mode: 'chain'; key: string; group: Group; duration: number; line: 'daily' | 'weekly' | 'zero' | 'record' | 'night';
  start?: 'evening';
};
export type HamsterTemplate = CallTemplate | ChainTemplate;

export const DAYPARTS = ['Night 00–06', 'Morning 06–12', 'Afternoon 12–18', 'Evening 18–24'];
export const STREAK_OPTIONS = ['Under 1 hour', '1 to 3 hours', '3 to 6 hours', '6 hours or more'];
export const ACTIVE_OPTIONS = ['0 to 35', '36 to 71', '72 to 107', '108 to 144'];

export const HAMSTER_TEMPLATES: HamsterTemplate[] = [
  { mode: 'call', key: 'blocks1h', group: 'blocks', span: HOUR, measure: 'blocks', resolution: 'Completed Squeek blocks between the two certified round endpoints of this UTC hour.' },
  { mode: 'call', key: 'blocks6h', group: 'blocks', span: 6 * HOUR, measure: 'blocks', resolution: 'Completed Squeek blocks between the certified endpoints of this 6-hour UTC block.' },
  { mode: 'chain', key: 'blocks24h', group: 'blocks', duration: DAY, line: 'daily' },
  { mode: 'chain', key: 'blocks7d', group: 'blocks', duration: WEEK, line: 'weekly' },
  { mode: 'chain', key: 'record24h', group: 'blocks', duration: DAY, line: 'record' },
  { mode: 'call', key: 'streak', group: 'runs', span: DAY, measure: 'streak', options: STREAK_OPTIONS, resolution: 'Longest run of consecutive 10-minute rounds with at least one completed block during this UTC day.' },
  { mode: 'call', key: 'active', group: 'runs', span: DAY, measure: 'active', options: ACTIVE_OPTIONS, resolution: 'Number of the day’s 144 ten-minute rounds with at least one completed block.' },
  { mode: 'call', key: 'wake1h', group: 'activity', span: HOUR, measure: 'any', options: ['At least one block', 'No blocks'], resolution: 'Yes if the certified height rises by at least one whole block during this UTC hour.' },
  { mode: 'call', key: 'daypart', group: 'activity', span: DAY, measure: 'daypart', options: DAYPARTS, resolution: 'The 6-hour UTC block with the most completed blocks. A tie goes to the earlier block.' },
  { mode: 'chain', key: 'wake24h', group: 'activity', duration: DAY, line: 'zero' },
  { mode: 'chain', key: 'night24h', group: 'activity', duration: DAY, line: 'night', start: 'evening' },
];

/** The next window of `span` seconds on the UTC clock. Calls lock when it starts. */
export function nextWindow(span: number, now: number) {
  const start = Math.floor(now / span) * span + span;
  return { start, end: start + span };
}
export const windowId = (key: string, start: number) => `${key}:${start}`;
export function parseWindowId(id: string) {
  const [key, start] = id.split(':');
  const t = HAMSTER_TEMPLATES.find(x => x.key === key);
  if (!t || t.mode !== 'call' || !/^\d+$/.test(start ?? '')) return undefined;
  return { template: t, start: Number(start), end: Number(start) + t.span };
}

/** Rounds to a friendly line: nearest 5 under 100, nearest 10 above. */
export const niceLine = (n: number) => n <= 0 ? 0 : n < 100 ? Math.max(1, Math.round(n / 5) * 5) : Math.round(n / 10) * 10;
/** Suggested over/under line for a span from a daily average. */
export const lineFor = (span: number, dailyAverage: number) => niceLine(dailyAverage * span / DAY);

/** Round whose end is at `timestamp`. Undefined when the time is not on the round grid. */
export function endRound(genesis: number, timestamp: number) {
  if ((timestamp - genesis) % ROUND !== 0) return undefined;
  return (timestamp - genesis) / ROUND;
}

/** Round endpoints whose certified heights settle a window. */
export function roundsNeeded(measure: Measure, genesis: number, start: number, end: number): number[] | undefined {
  const a = endRound(genesis, start), b = endRound(genesis, end);
  if (a === undefined || b === undefined || a < 0) return undefined;
  if (measure === 'blocks' || measure === 'any') return [a, b];
  if (measure === 'daypart') { const q = (b - a) / 4; return [a, a + q, a + 2 * q, a + 3 * q, b]; }
  const list: number[] = [];
  for (let r = a; r <= b; r++) list.push(r);
  return list;
}

export type Call = { pick: number; line?: number };
export type Outcome = { winner: number; detail: string };

/** Pure settlement of one window from whole-block heights at round endpoints. */
export function settle(measure: Measure, rounds: number[], heights: Map<number, number>, line = 0): Outcome | undefined {
  const h = rounds.map(r => heights.get(r));
  if (h.some(v => v === undefined)) return undefined;
  const v = h as number[];
  const diffs = v.slice(1).map((x, i) => Math.max(0, x - v[i]));
  if (measure === 'blocks') { const total = v[v.length - 1] - v[0]; return { winner: total > line ? 0 : 1, detail: `${total.toLocaleString()} blocks` }; }
  if (measure === 'any') { const total = v[v.length - 1] - v[0]; return { winner: total > 0 ? 0 : 1, detail: `${total.toLocaleString()} blocks` }; }
  if (measure === 'daypart') {
    let best = 0;
    diffs.forEach((d, i) => { if (d > diffs[best]) best = i; });
    return { winner: best, detail: `${diffs[best].toLocaleString()} blocks` };
  }
  if (measure === 'active') {
    const active = diffs.filter(d => d > 0).length;
    return { winner: Math.min(3, Math.floor(active / 36)), detail: `${active} of ${diffs.length} rounds` };
  }
  let longest = 0, run = 0;
  for (const d of diffs) { run = d > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
  const minutes = longest * 10;
  return { winner: minutes < 60 ? 0 : minutes < 180 ? 1 : minutes < 360 ? 2 : 3, detail: `${Math.floor(minutes / 60)}h ${minutes % 60}m streak` };
}

/** Option labels for a call template, given the saved or suggested line. */
export function optionsFor(t: CallTemplate, line?: number) {
  if (t.options) return t.options;
  const shown = line === undefined ? '…' : `${line.toLocaleString()}.5`;
  return [`Over ${shown}`, `Under ${shown}`];
}

const STORE = 'squeek-predict-hamster-calls-v1';
export type HamsterCalls = Record<string, Call>;
export function loadHamsterCalls(): HamsterCalls {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? '{}');
    if (!v || typeof v !== 'object') return {};
    const out: HamsterCalls = {};
    for (const [id, c] of Object.entries(v as Record<string, Call>)) if (parseWindowId(id) && c && Number.isInteger(c.pick)) out[id] = c;
    return out;
  } catch { return {}; }
}
export function saveHamsterCalls(calls: HamsterCalls) {
  try { localStorage.setItem(STORE, JSON.stringify(calls)); } catch { /* storage unavailable: calls last for this visit */ }
}
