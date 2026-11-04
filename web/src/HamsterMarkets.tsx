import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Address } from 'viem';
import { Icon } from './icons';
import { eth, line, percentLabel, poolPercent, timeLeft, type Market, type Phase } from './model';
import type { Preset } from './CreateDialog';
import { readRoundHeights } from './history';
import {
  DAY, GROUPS, HAMSTER_TEMPLATES, HOUR, lineFor, loadHamsterCalls, nextWindow, optionsFor, parseWindowId, roundsNeeded,
  saveHamsterCalls, settle, windowId, type CallTemplate, type ChainTemplate, type Group, type HamsterCalls, type Outcome,
} from './hamster';

type IconName = Parameters<typeof Icon>[0]['name'];
const clock = (ts: number) => new Date(ts * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false });
const utcDate = (ts: number) => new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const until = (seconds: number) => seconds >= DAY ? `${Math.floor(seconds / DAY)}d ${Math.floor(seconds % DAY / HOUR)}h` : seconds >= HOUR ? `${Math.floor(seconds / HOUR)}h ${Math.floor(seconds % HOUR / 60)}m` : `${Math.max(1, Math.ceil(seconds / 60))}m`;

export const CALL_TITLES: Record<string, string> = {
  blocks1h: 'Squeek blocks in the next hour',
  blocks6h: 'Squeek blocks in the next 6 hours',
  streak: 'Longest block streak tomorrow',
  active: 'Rounds with blocks tomorrow, of 144',
  wake1h: 'Will the hamster complete a block next hour?',
  daypart: 'Busiest part of tomorrow',
};
export const CALL_HISTORY_TITLES: Record<string, string> = {
  blocks1h: 'Blocks in one hour', blocks6h: 'Blocks in 6 hours', streak: 'Longest block streak',
  active: 'Rounds with blocks', wake1h: 'Any block in one hour', daypart: 'Busiest part of the day',
};
const CALL_ICONS: Record<string, IconName> = { blocks1h: 'clock', blocks6h: 'clock', streak: 'bolt', active: 'chart', wake1h: 'wheel', daypart: 'moon' };

export function windowLabel(t: CallTemplate, start: number, end: number) {
  return t.span === DAY ? `${utcDate(start)} UTC` : `${utcDate(start)}, ${clock(start)} to ${clock(end)} UTC`;
}

export function useHamsterCalls() {
  const [calls, setCalls] = useState<HamsterCalls>(loadHamsterCalls);
  const choose = (id: string, pick: number, lineValue?: number) => setCalls(prev => {
    const next = { ...prev };
    if (next[id]?.pick === pick) delete next[id]; else next[id] = lineValue === undefined ? { pick } : { pick, line: lineValue };
    saveHamsterCalls(next);
    return next;
  });
  return { calls, choose };
}

export type CallResult = { id: string; status: 'running' | 'certifying' | 'settled' | 'unchecked'; outcome?: Outcome };

/** Settles saved hamster calls whose windows SqueekCore has certified. Reads only the needed round endpoints. */
export function useHamsterResults(calls: HamsterCalls, core: Address | undefined, genesis: bigint | undefined, settled: bigint | undefined, now: number) {
  const ids = Object.keys(calls).filter(id => parseWindowId(id)).sort((a, b) => parseWindowId(b)!.end - parseWindowId(a)!.end).slice(0, 30);
  const g = genesis === undefined ? undefined : Number(genesis);
  const settledAt = g !== undefined && settled !== undefined ? g + Number(settled) * 600 : undefined;
  const ready = ids.filter(id => settledAt !== undefined && parseWindowId(id)!.end <= settledAt);
  const query = useQuery({
    queryKey: ['hamster-results', core, settled?.toString(), ready.join(',')],
    enabled: Boolean(core && g !== undefined && ready.length),
    staleTime: 5 * 60_000, retry: 1, refetchOnWindowFocus: false,
    queryFn: async () => {
      const plans = ready.map(id => { const w = parseWindowId(id)!; return { id, w, rounds: roundsNeeded(w.template.measure, g!, w.start, w.end) }; });
      const heights = await readRoundHeights(core!, plans.flatMap(p => p.rounds ?? []));
      const out: Record<string, Outcome | undefined> = {};
      for (const p of plans) out[p.id] = p.rounds ? settle(p.w.template.measure, p.rounds, heights, calls[p.id]?.line) : undefined;
      return out;
    },
  });
  const results: CallResult[] = ids.map(id => {
    const w = parseWindowId(id)!;
    if (now < w.end) return { id, status: 'running' };
    if (settledAt === undefined || w.end > settledAt) return { id, status: 'certifying' };
    const outcome = query.data?.[id];
    return outcome ? { id, status: 'settled', outcome } : { id, status: 'unchecked' };
  });
  return { results, loading: query.isFetching, error: query.isError };
}

function CallCard({ t, now, dailyAverage, calls, choose }: { t: CallTemplate; now: number; dailyAverage?: number; calls: HamsterCalls; choose: (id: string, pick: number, line?: number) => void }) {
  const w = nextWindow(t.span, now);
  const id = windowId(t.key, w.start);
  const saved = calls[id];
  const suggested = t.options ? undefined : dailyAverage !== undefined ? lineFor(t.span, dailyAverage) : undefined;
  const shownLine = saved?.line ?? suggested;
  const options = optionsFor(t, shownLine);
  const unavailable = !t.options && shownLine === undefined;
  return <article className="hamster-card call-card">
    <h3>{CALL_TITLES[t.key]}</h3>
    <div className="card-top"><span className="tag"><Icon name={CALL_ICONS[t.key]} size={15}/>Free call · no ETH</span><span className="status status-open"><span className="status-dot"/>Locks in <span className="num">{until(w.start - now)}</span></span></div>
    <p className="market-time"><Icon name="clock" size={15}/>{windowLabel(t, w.start, w.end)}</p>
    <div className={`call-options ${options.length > 2 ? 'four' : ''}`} role="group" aria-label={`Your call: ${CALL_TITLES[t.key]}`}>
      {options.map((o, i) => <button key={o} type="button" className={saved?.pick === i ? 'call chosen' : 'call'} aria-pressed={saved?.pick === i} disabled={unavailable} onClick={() => choose(id, i, t.options ? undefined : shownLine)}>{saved?.pick === i && <Icon name="check" size={16}/>}{o}</button>)}
    </div>
    <p className="muted small">{unavailable ? 'The line appears once SqueekCore data loads.' : saved === undefined ? 'Tap an answer to save a free call. It is checked against certified blocks.' : 'Call saved in this browser. Tap it again to clear.'}</p>
    <details className="market-details"><summary>How it settles</summary><p className="small muted">{t.resolution} Certification can run days behind, so results appear under Stats once SqueekCore certifies the window.</p></details>
  </article>;
}

type ChainPreset = Preset & { title: string; unavailable?: boolean };

/** Record lines need the observed weekly best; it is never estimated from an average. */
function chainPreset(t: ChainTemplate, avg: number, best: number | undefined, week: number, known: boolean): ChainPreset {
  if (t.line === 'record' && best === undefined) return { threshold: '', duration: t.duration, title: 'Record attempt: weekly best unavailable', unavailable: true };
  if (!known && t.line !== 'zero') {
    const span = t.duration === DAY ? '24 hours' : '7 days';
    const generic = { daily: `Squeek blocks in the next ${span}: over or under your line`, weekly: `Squeek blocks in the next ${span}: over or under your line`, record: 'Record attempt: beat this week’s best day', night: 'Night shift: blocks in 24 hours from 18:00' } as const;
    return { threshold: String(t.line === 'weekly' ? avg * 7 : avg), duration: t.duration, start: t.start, title: generic[t.line] };
  }
  const r10 = (n: number) => Math.max(10, Math.round(n / 10) * 10);
  if (t.line === 'weekly') { const v = Math.max(50, Math.round(week / 50) * 50); return { threshold: String(v), duration: t.duration, title: `Squeek blocks in the next 7 days: over or under ${line(BigInt(v))}` }; }
  if (t.line === 'zero') return { threshold: '0', duration: t.duration, title: 'Will the hamster complete a block in the next 24 hours?' };
  if (t.line === 'record' && best !== undefined) return { threshold: String(best), duration: t.duration, title: `Record attempt: beat this week’s best day of ${best.toLocaleString()} blocks` };
  if (t.line === 'night') { const v = r10(avg * 1.25); return { threshold: String(v), duration: t.duration, start: 'evening', title: `Night shift: over ${line(BigInt(v))} blocks in 24 hours from 18:00` }; }
  const v = r10(avg);
  return { threshold: String(v), duration: t.duration, title: `Squeek blocks in the next 24 hours: over or under ${line(BigInt(v))}` };
}

/** Open on-chain markets that fit a template, soonest first. */
function matching(t: ChainTemplate, markets: Market[], statusOf: (m: Market) => Phase, best24?: number) {
  return markets.filter(m => {
    if (statusOf(m) !== 'Open for bets' || m.endsAt - m.startsAt !== BigInt(t.duration)) return false;
    if (t.line === 'zero') return m.threshold === 0n;
    if (t.line === 'record') return best24 !== undefined && best24 > 0 && m.threshold >= BigInt(best24);
    if (t.line === 'night') return m.threshold > 0n && new Date(Number(m.startsAt) * 1000).getHours() === 18;
    return m.threshold > 0n;
  }).sort((a, b) => a.startsAt < b.startsAt ? -1 : a.startsAt > b.startsAt ? 1 : 0);
}

function ChainCard({ t, preset, open, now, busy, statsError, onBet, onCreate, onRetryStats }: { t: ChainTemplate; preset: ChainPreset; open: Market[]; now: bigint; busy: boolean; statsError: boolean; onBet: (m: Market, yes?: boolean) => void; onCreate: (p: Preset) => void; onRetryStats: () => void }) {
  const m = open[0];
  const icon: IconName = t.line === 'record' ? 'trophy' : t.line === 'night' ? 'moon' : t.line === 'zero' ? 'bolt' : t.line === 'weekly' ? 'chart' : 'wheel';
  return <article className="hamster-card chain-card">
    <h3>{m ? `Market #${m.id}: ${m.threshold === 0n ? 'at least one block' : `over or under ${line(m.threshold)}`} in ${t.duration === DAY ? '24 hours' : '7 days'}` : preset.title}</h3>
    <div className="card-top"><span className="tag"><Icon name={icon} size={15}/>On-chain · test ETH</span>{m ? <span className="status status-open"><span className="status-dot"/>{open.length} open</span> : <span className="status">No open market</span>}</div>
    {m ? <>
      <p className="market-time"><Icon name="clock" size={15}/>Betting closes in <span className="num">{timeLeft(m.startsAt, now).replace(' left', '')}</span></p>
      <div className="odds-row">{[true, false].map(yes => <button key={String(yes)} className={`odds ${yes ? 'odds-yes' : 'odds-no'}`} onClick={() => onBet(m, yes)}>
        <span className="odds-side">{m.threshold === 0n ? (yes ? 'At least one block' : 'No blocks') : `${yes ? 'Over' : 'Under'} ${line(m.threshold)}`}</span>
        <span className="odds-price num">{percentLabel(poolPercent(m, yes))}</span>
      </button>)}</div>
      <div className="card-foot"><span>Volume <strong className="num">{eth(m.yesPool + m.noPool)} ETH</strong></span><span>Pool-based odds</span></div>
    </> : <>
      <p className="market-time"><Icon name="clock" size={15}/>{t.duration === DAY ? '24-hour' : '7-day'} window, settled by SqueekPredict</p>
      {preset.unavailable
        ? <p className="muted small">{statsError ? 'Couldn’t read this week’s certified history, so the record line is unknown.' : 'The record line appears once this week’s certified history loads.'}</p>
        : <p className="muted small">Nobody has opened this line yet. Open it, then you and others can bet test ETH on either side.</p>}
      {preset.unavailable && statsError && <button className="secondary full" onClick={onRetryStats}>Retry wheel stats</button>}
      <button className="secondary full" onClick={() => onCreate(preset)} disabled={busy || preset.unavailable}><Icon name="plus" size={18}/>Open this market</button>
    </>}
  </article>;
}

export function HamsterMarkets({ group, now, dailyAverage, best24, total7d, statsError, markets, statusOf, busy, calls, choose, onBet, onCreate, onRetryStats }: {
  group: Group | 'all'; now: bigint; dailyAverage?: number; best24?: number; total7d?: number; statsError: boolean; markets: Market[]; statusOf: (m: Market) => Phase; busy: boolean;
  calls: HamsterCalls; choose: (id: string, pick: number, line?: number) => void; onBet: (m: Market, yes?: boolean) => void; onCreate: (p: Preset) => void; onRetryStats: () => void;
}) {
  const avg = dailyAverage ?? 1000;
  const groups = GROUPS.filter(g => group === 'all' || g.id === group);
  return <section className="hamster" id="hamster" aria-labelledby="hamster-title" tabIndex={-1}>
    <div className="ideas-head"><h2 id="hamster-title">Hamster markets</h2></div>
    {groups.map(g => <div className="hamster-group" key={g.id}>
      <h3 className="group-title">{g.label}</h3>
      <div className="hamster-grid">{HAMSTER_TEMPLATES.filter(t => t.group === g.id).map(t => t.mode === 'call'
        ? <CallCard key={t.key} t={t} now={Number(now)} dailyAverage={dailyAverage} calls={calls} choose={choose}/>
        : <ChainCard key={t.key} t={t} preset={chainPreset(t, avg, best24, total7d ?? avg * 7, dailyAverage !== undefined)} open={matching(t, markets, statusOf, best24)} now={now} busy={busy} statsError={statsError} onBet={onBet} onCreate={onCreate} onRetryStats={onRetryStats}/>)}</div>
    </div>)}
  </section>;
}
