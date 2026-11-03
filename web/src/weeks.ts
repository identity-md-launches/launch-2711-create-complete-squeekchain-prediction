/* Pure weekly history maths, kept free of imports so node tests can load it directly. */
const ROUND = 600;
export type PastDay = { start: number; end: number; blocks: number | null };
export type PastWeek = { start: number; end: number; blocks: number | null; activeDays: number; bestDay: number };
export type PastWeeks = { days: PastDay[]; weeks: PastWeek[]; total28: number };
export const DAY_ROUNDS = 144;

/** Pure: daily and weekly totals for the 28 certified days before `settledRound`, oldest first.
 * Windows that end before genesis are null ("before launch"), never zero. */
export function computePastWeeks(settledRound: number, genesis: number, roundHeights: Map<number, number>): PastWeeks {
  const at = (r: number) => {
    if (r < 0) return 0;
    const height = roundHeights.get(r);
    if (height === undefined) throw new Error('Weekly history is incomplete. Retry in a moment.');
    return height;
  };
  const time = (r: number) => genesis + r * ROUND;
  const days: PastDay[] = [];
  for (let i = 0; i < 28; i++) {
    const end = settledRound - (27 - i) * DAY_ROUNDS;
    days.push({ start: time(end - DAY_ROUNDS), end: time(end), blocks: end <= 0 ? null : Math.max(0, at(end) - at(end - DAY_ROUNDS)) });
  }
  const weeks: PastWeek[] = [];
  for (let k = 3; k >= 0; k--) {
    const slice = days.slice((3 - k) * 7, (3 - k) * 7 + 7);
    const known = slice.filter(d => d.blocks !== null).map(d => d.blocks!);
    weeks.push({ start: slice[0].start, end: slice[6].end, blocks: known.length ? known.reduce((a, b) => a + b, 0) : null, activeDays: known.filter(b => b > 0).length, bestDay: Math.max(0, ...known) });
  }
  return { days, weeks, total28: days.reduce((sum, d) => sum + (d.blocks ?? 0), 0) };
}
