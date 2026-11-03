import { useState } from 'react';
import type { PastWeeks } from './weeks';
import type { Snapshot } from './data';
import { eth, phase, sideName, title, type Market } from './model';
import { Icon } from './icons';
import { PreviewHistory } from './CommunityMarkets';
import type { Calls } from './previews';
import type { HamsterCalls } from './hamster';
import { parseWindowId, optionsFor } from './hamster';
import { CALL_HISTORY_TITLES, windowLabel, type CallResult } from './HamsterMarkets';

const day = (ts: number) => new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const shortDate = (ts: bigint) => day(Number(ts));

function resultOf(m: Market, now: bigint, settled?: bigint) {
  if (m.status === 1) {
    const blocks = m.endBlockUnits / 1000000000n - m.startBlockUnits / 1000000000n;
    return { text: `${sideName(m, m.yesWins)} won · ${blocks.toLocaleString()} blocks`, tone: 'gain' };
  }
  if (m.status === 2) return { text: 'Refunded', tone: 'muted' };
  const p = phase(m, now, settled);
  return { text: p, tone: p === 'Refund available' ? 'muted' : 'warn' };
}

export function HistoryPanel({ data, failed, weeks, weeksError, weeksLoading, now, settled, best24, calls, hamsterCalls, hamsterResults, hamsterLoading, onRetry, onOpen }: {
  data?: Snapshot; failed: boolean; weeks?: PastWeeks; weeksError: boolean; weeksLoading: boolean; now: bigint; settled?: bigint; best24?: number;
  calls: Calls; hamsterCalls: HamsterCalls; hamsterResults: CallResult[]; hamsterLoading: boolean; onRetry: () => void; onOpen: (m: Market) => void;
}) {
  const [all, setAll] = useState(false);
  const markets = data?.markets ?? [];
  const ended = markets.filter(m => m.status !== 0 || now >= m.endsAt).sort((a, b) => a.endsAt === b.endsAt ? 0 : a.endsAt > b.endsAt ? -1 : 1);
  const resolved = markets.filter(m => m.status === 1);
  const overWins = resolved.filter(m => m.yesWins).length;
  const volume = markets.reduce((sum, m) => sum + m.yesPool + m.noPool, 0n);
  const genesis = data?.coreConfig?.genesisTimestamp;
  const ageDays = genesis ? Math.max(1, Math.floor((Number(now) - Number(genesis)) / 86400)) : undefined;
  const height = data?.coreState?.blockHeight;
  const dayMax = weeks ? Math.max(1, ...weeks.days.map(d => d.blocks ?? 0)) : 1;
  const shown = all ? ended : ended.slice(0, 8);
  const wait = failed ? '–' : '…';

  return <section className="history" id="history" aria-labelledby="history-title" tabIndex={-1}>
    <div className="ideas-head"><h2 id="history-title">Stats and history</h2><p className="muted small">Certified SqueekCore data and every loaded SqueekPredict market.</p></div>

    <dl className="overview" aria-label="Project activity">
      <div><dt>Squeek blocks, all time</dt><dd className="num">{height !== undefined ? height.toLocaleString() : wait}</dd></div>
      <div><dt>Blocks, last 28 days</dt><dd className="num">{weeks ? weeks.total28.toLocaleString() : wait}</dd></div>
      <div><dt>Daily average since launch</dt><dd className="num">{height !== undefined && ageDays ? Math.round(Number(height) / ageDays).toLocaleString() : wait}</dd></div>
      <div><dt>Markets created</dt><dd className="num">{data ? data.count.toString() : wait}</dd></div>
      <div><dt>Markets settled</dt><dd className="num">{data ? `${resolved.length}` : wait}{resolved.length > 0 && <span className="muted small"> · Over won {overWins}</span>}</dd></div>
      <div><dt>Test ETH staked</dt><dd className="num">{data ? `${eth(volume, 4)} ETH` : wait}</dd></div>
    </dl>

    <div className="history-grid">
      <div className="history-card">
        <h3>Past weeks</h3>
        {weeksLoading && !weeks ? <div className="panel-loading" role="status"><span className="sk sk-chart"/><span className="sk sk-line"/><span className="sr-only">Reading weekly history…</span></div>
          : !weeks ? <div className="panel-empty"><p className="muted">{weeksError ? 'Couldn’t read weekly history from Sepolia.' : 'Weekly history appears once SqueekCore data loads.'}</p>{weeksError && <button className="secondary" onClick={onRetry}>Retry weekly stats</button>}</div>
          : <>
            <figure className="spark daily">
              <svg viewBox="0 0 28 40" preserveAspectRatio="none" role="img" aria-label={`Certified blocks per day over 28 days. Best day ${dayMax.toLocaleString()} blocks.`}>
                {weeks.days.map((d, i) => d.blocks !== null && d.blocks > 0 && <rect key={i} x={i + 0.12} width="0.76" y={40 - Math.max(1.5, d.blocks / dayMax * 40)} height={Math.max(1.5, d.blocks / dayMax * 40)} rx="0.2"/>)}
              </svg>
              <figcaption className="muted small"><span>{day(weeks.days[0].start)}</span><span>Blocks per day</span><span>{day(weeks.days[27].end)}</span></figcaption>
            </figure>
            <table className="week-table">
              <thead><tr><th scope="col">Week</th><th scope="col">Blocks</th><th scope="col">Active days</th><th scope="col">Best day</th></tr></thead>
              <tbody>{[...weeks.weeks].reverse().map((w, i, list) => {
                const prev = list[i + 1]?.blocks;
                const change = w.blocks !== null && prev ? Math.round((w.blocks - prev) / prev * 100) : null;
                return <tr key={w.start}>
                  <th scope="row">{i === 0 ? 'Latest 7 days' : `${day(w.start)} to ${day(w.end)}`}</th>
                  <td className="num">{w.blocks === null ? 'Before launch' : w.blocks.toLocaleString()}{change !== null && <span className={`delta ${change >= 0 ? 'gain' : 'loss'}`}> {change >= 0 ? '+' : ''}{change}%</span>}</td>
                  <td className="num">{w.blocks === null ? '–' : `${w.activeDays} of 7`}</td>
                  <td className="num">{w.blocks === null ? '–' : w.bestDay.toLocaleString()}</td>
                </tr>;
              })}</tbody>
            </table>
            <p className="muted small">Weeks are 7 certified days counted back from the latest certified round.</p>
          </>}
      </div>

      <div className="history-card">
        <h3>Market results</h3>
        {!data ? <p className="muted">{failed ? 'Market results appear once Sepolia answers.' : 'Reading SqueekPredict markets…'}</p>
          : ended.length === 0 ? <p className="muted">No market window has ended yet. Results show here when they do.</p>
          : <>
            <ul className="history-list">{shown.map(m => { const r = resultOf(m, now, settled); return <li key={String(m.id)}>
              <span className="history-name"><button className="question-button small-q" onClick={() => onOpen(m)}>{title(m, best24)}</button><span className="muted small">#{m.id.toString()} · ended {shortDate(m.endsAt)} · pool {eth(m.yesPool + m.noPool)} ETH</span></span>
              <span className={`history-result ${r.tone}`}>{m.status === 1 && <Icon name="check" size={16}/>}{r.text}</span>
            </li>; })}</ul>
            {ended.length > 8 && <button className="secondary" onClick={() => setAll(v => !v)}>{all ? 'Show fewer' : `Show all ${ended.length}`}</button>}
          </>}
        <h3 className="panel-sub">Your hamster calls</h3>
        {hamsterResults.length === 0 ? <p className="muted small">Free hamster calls appear here and are checked against certified SqueekCore blocks.</p>
          : <ul className="history-list">{hamsterResults.map(r => {
            const w = parseWindowId(r.id)!; const c = hamsterCalls[r.id]; const options = optionsFor(w.template, c?.line);
            const won = r.outcome && r.outcome.winner === c?.pick;
            return <li key={r.id}>
              <span className="history-name"><strong>{CALL_HISTORY_TITLES[w.template.key]}</strong><span className="muted small">{windowLabel(w.template, w.start, w.end)} · your call {options[c?.pick ?? 0]}</span></span>
              <span className={`history-result ${r.status === 'settled' ? won ? 'gain' : 'loss' : 'muted'}`}>{r.status === 'settled' ? <>{won && <Icon name="check" size={16}/>}{won ? 'Right' : 'Missed'} · {r.outcome!.detail}</> : r.status === 'running' ? 'Window not finished' : r.status === 'certifying' ? 'Awaiting certification' : hamsterLoading ? 'Checking…' : 'Couldn’t check yet'}</span>
            </li>;
          })}</ul>}
        <h3 className="panel-sub">Your founder calls</h3>
        <PreviewHistory now={Number(now)} calls={calls}/>
      </div>
    </div>
  </section>;
}
