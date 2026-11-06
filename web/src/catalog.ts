import type { Address } from "viem";
import { amount, MAX_POOL, poolPercent } from "./model.ts";

export type Category =
  "All markets" | "Daily blocks" | "Activity" | "Weekly blocks";
export type MarketArt =
  "hamster" | "blocks" | "bolt" | "moon" | "chart" | "wheel";
export type Template = {
  key: string;
  question: string;
  category: Exclude<Category, "All markets">;
  threshold: number;
  hours: number;
  art: MarketArt;
  color: string;
};
export const CATEGORIES: Category[] = [
  "All markets",
  "Daily blocks",
  "Activity",
  "Weekly blocks",
];
/** Editorial template lines, not claims about observed activity or deployed market IDs. */
export const TEMPLATES: readonly Template[] = [
  {
    key: "daily-1000",
    question: "Will the hamster complete over 1,000 blocks in 24 hours?",
    category: "Daily blocks",
    threshold: 1000,
    hours: 24,
    art: "hamster",
    color: "orange",
  },
  {
    key: "hour-50",
    question: "Will the hamster complete over 50 blocks in one hour?",
    category: "Activity",
    threshold: 50,
    hours: 1,
    art: "bolt",
    color: "violet",
  },
  {
    key: "daily-500",
    question: "Will Squeekchain add over 500 blocks in 24 hours?",
    category: "Daily blocks",
    threshold: 500,
    hours: 24,
    art: "blocks",
    color: "mint",
  },
  {
    key: "weekly-5000",
    question: "Will the hamster complete over 5,000 blocks in 7 days?",
    category: "Weekly blocks",
    threshold: 5000,
    hours: 168,
    art: "chart",
    color: "blue",
  },
  {
    key: "six-250",
    question: "Will the hamster complete over 250 blocks in 6 hours?",
    category: "Activity",
    threshold: 250,
    hours: 6,
    art: "wheel",
    color: "yellow",
  },
  {
    key: "active-day",
    question: "Will the hamster complete at least one block in 24 hours?",
    category: "Activity",
    threshold: 0,
    hours: 24,
    art: "bolt",
    color: "cyan",
  },
  {
    key: "weekly-10000",
    question: "Will Squeekchain add over 10,000 blocks in 7 days?",
    category: "Weekly blocks",
    threshold: 10000,
    hours: 168,
    art: "blocks",
    color: "violet",
  },
  {
    key: "night-500",
    question: "Will the hamster complete over 500 blocks overnight?",
    category: "Activity",
    threshold: 500,
    hours: 6,
    art: "moon",
    color: "blue",
  },
  {
    key: "daily-2000",
    question: "Will the hamster complete over 2,000 blocks in 24 hours?",
    category: "Daily blocks",
    threshold: 2000,
    hours: 24,
    art: "hamster",
    color: "orange",
  },
  {
    key: "active-hour",
    question: "Will the hamster complete at least one block in one hour?",
    category: "Activity",
    threshold: 0,
    hours: 1,
    art: "wheel",
    color: "mint",
  },
  {
    key: "weekly-1000",
    question: "Will Squeekchain add over 1,000 blocks in 7 days?",
    category: "Weekly blocks",
    threshold: 1000,
    hours: 168,
    art: "chart",
    color: "pink",
  },
  {
    key: "six-1000",
    question: "Will the hamster complete over 1,000 blocks in 6 hours?",
    category: "Activity",
    threshold: 1000,
    hours: 6,
    art: "blocks",
    color: "yellow",
  },
];
export type TemplateMarket = Template & {
  id: string;
  startsAt: number;
  endsAt: number;
};
export function templateMarket(t: Template, now: number): TemplateMarket {
  const hour = 3600,
    day = 24 * hour;
  let startsAt: number;
  if (t.key === "night-500" || t.hours === 24)
    startsAt = (Math.floor(now / day) + 1) * day;
  else if (t.hours === 168) {
    const dayStart = Math.floor(now / day) * day;
    const weekday = new Date(dayStart * 1000).getUTCDay();
    startsAt = dayStart + ((8 - weekday) % 7 || 7) * day;
  } else startsAt = (Math.floor(now / (t.hours * hour)) + 1) * t.hours * hour;
  return {
    ...t,
    id: `${t.key}:${startsAt}`,
    startsAt,
    endsAt: startsAt + t.hours * hour,
  };
}
export type PracticePosition = {
  market: TemplateMarket;
  account: Address;
  yes: string;
  no: string;
  createdAt: number;
};
export type PracticeBook = { version: 1; positions: PracticePosition[] };
export const PRACTICE_STORE = "squeek-predict-practice-v1";
export const emptyBook = (): PracticeBook => ({ version: 1, positions: [] });
export function parseBook(raw: string | null): PracticeBook {
  try {
    const book = JSON.parse(raw ?? "null");
    if (book?.version !== 1 || !Array.isArray(book.positions))
      return emptyBook();
    const positions: PracticePosition[] = book.positions
      .filter((p: PracticePosition) => {
        const t = TEMPLATES.find((t) => t.key === p?.market?.key);
        if (
          !t ||
          !/^0x[0-9a-f]{40}$/i.test(p.account) ||
          !/^\d+$/.test(p.yes) ||
          !/^\d+$/.test(p.no)
        )
          return false;
        return (
          BigInt(p.yes) <= MAX_POOL &&
          BigInt(p.no) <= MAX_POOL &&
          Number.isSafeInteger(p.market.startsAt) &&
          p.market.endsAt === p.market.startsAt + t.hours * 3600 &&
          p.market.id === `${t.key}:${p.market.startsAt}` &&
          Number.isFinite(p.createdAt)
        );
      })
      .map((p: PracticePosition) => ({
        ...p,
        market: {
          ...p.market,
          ...TEMPLATES.find((t) => t.key === p.market.key)!,
        },
      }));
    return { version: 1, positions };
  } catch {
    return emptyBook();
  }
}
export function practicePools(book: PracticeBook, id: string) {
  return book.positions
    .filter((p) => p.market.id === id)
    .reduce(
      (pools, p) => ({
        yesPool: pools.yesPool + BigInt(p.yes),
        noPool: pools.noPool + BigInt(p.no),
      }),
      { yesPool: 0n, noPool: 0n },
    );
}
export function placePractice(
  book: PracticeBook,
  market: TemplateMarket,
  account: Address,
  yes: boolean,
  input: string,
  now: number,
): PracticeBook {
  if (now >= market.startsAt)
    throw new Error(
      "Betting has closed for this window. Choose the next market.",
    );
  const value = amount(input);
  const pools = practicePools(book, market.id);
  if ((yes ? pools.yesPool : pools.noPool) + value > MAX_POOL)
    throw new Error(
      "This side can hold at most 100 practice ETH. Enter a smaller amount.",
    );
  const next: PracticeBook = {
    version: 1,
    positions: book.positions.map((p) => ({ ...p })),
  };
  let position = next.positions.find(
    (p) =>
      p.market.id === market.id &&
      p.account.toLowerCase() === account.toLowerCase(),
  );
  if (!position) {
    position = { market, account, yes: "0", no: "0", createdAt: now };
    next.positions.push(position);
  }
  if (yes) position.yes = (BigInt(position.yes) + value).toString();
  else position.no = (BigInt(position.no) + value).toString();
  return next;
}
export function practiceOdds(book: PracticeBook, id: string, yes: boolean) {
  return poolPercent(practicePools(book, id), yes);
}

export type PracticeResult = {
  yesWins: boolean;
  blocks: bigint;
  startHeight: bigint;
  endHeight: bigint;
};
