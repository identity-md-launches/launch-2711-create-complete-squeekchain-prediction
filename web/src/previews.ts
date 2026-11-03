/* Community market previews: founder and NFT questions the deployed SqueekPredict contract cannot
 * settle. It only resolves SqueekCore block counts, so these never take ETH. Visitors can save a
 * free call in their own browser. Results are off-chain and set by the site owner (see README,
 * "After launch"). Leave a value undefined until the outcome is known. */
export const REPORTED_RESULTS: Record<string, string> = {
  // 'tweets24:2026-11-03': '5 to 14 posts',
};

export type PreviewTemplate = {
  key: 'tweets24' | 'tweets7d' | 'nftMint' | 'nftFloor';
  topic: 'Founder' | 'Squeek NFTs';
  question: string;
  options: string[];
  resolution: string;
  /** Rotating windows, in seconds: one UTC day or one UTC week starting Monday. */
  window?: 'day' | 'week';
};

export const PREVIEW_TEMPLATES: PreviewTemplate[] = [
  { key: 'tweets24', topic: 'Founder', window: 'day', question: 'How many posts will @pillheadddd publish on X today?', options: ['0 to 4', '5 to 14', '15 to 29', '30 or more'], resolution: 'Posts and quote posts on x.com/pillheadddd during this UTC day. Reposts and replies excluded.' },
  { key: 'tweets7d', topic: 'Founder', window: 'week', question: 'How many posts will @pillheadddd publish on X this week?', options: ['0 to 24', '25 to 74', '75 to 149', '150 or more'], resolution: 'Posts and quote posts on x.com/pillheadddd from Monday 00:00 to Sunday 24:00 UTC. Reposts and replies excluded.' },
  { key: 'nftMint', topic: 'Squeek NFTs', question: 'When will the Squeek NFTs be mintable?', options: ['Before December 2026', 'December 2026', 'January to March 2027', 'Later'], resolution: 'The first date a public mint is open, as announced by @squeekchain.' },
  { key: 'nftFloor', topic: 'Squeek NFTs', question: 'What will the Squeek NFT floor price be one week after mint?', options: ['Under 0.01 ETH', '0.01 to under 0.05 ETH', '0.05 to under 0.25 ETH', '0.25 ETH or more'], resolution: 'Lowest listed price seven days after the public mint opens.' },
];

const DAY = 86400;
const isoDay = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);

/** The window a rotating preview covers at `now`. Ended windows roll over to the next automatically. */
export function previewWindow(t: PreviewTemplate, now: number): { id: string; start?: number; end?: number } {
  if (!t.window) return { id: t.key };
  const dayStart = Math.floor(now / DAY) * DAY;
  // 1970-01-01 was a Thursday; shift so weeks start on Monday 00:00 UTC.
  const start = t.window === 'day' ? dayStart : dayStart - ((Math.floor(now / DAY) + 3) % 7) * DAY;
  return { id: `${t.key}:${isoDay(start)}`, start, end: start + (t.window === 'day' ? DAY : 7 * DAY) };
}

/** Earlier windows of a rotating preview, newest first. */
export function pastWindows(t: PreviewTemplate, now: number, count: number) {
  if (!t.window) return [];
  const span = t.window === 'day' ? DAY : 7 * DAY;
  const current = previewWindow(t, now).start!;
  return Array.from({ length: count }, (_, i) => { const start = current - (i + 1) * span; return { id: `${t.key}:${isoDay(start)}`, start, end: start + span }; });
}

export type Calls = Record<string, number>;
const STORE = 'squeek-predict-calls-v1';
export function loadCalls(): Calls {
  try { const v = JSON.parse(localStorage.getItem(STORE) ?? '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
export function saveCalls(calls: Calls) {
  try { localStorage.setItem(STORE, JSON.stringify(calls)); } catch { /* storage unavailable: calls last for this visit */ }
}
