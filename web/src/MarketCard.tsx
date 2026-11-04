import type { Market, Position } from './model';
import { date, eth, exactEth, kind, percentLabel, phase, poolPercent, sideName, timeLeft, title } from './model';
import { Icon } from './icons';

export const phaseTone = (status: string) => status === 'Open for bets' ? 'open' : status === 'In progress' ? 'live' : status === 'Resolved' || status === 'Refunded' ? 'done' : 'wait';

export function MarketCard({ market: m, position: p, now, settled, best24, onOpen }: { market: Market; position?: Position; now: bigint; settled?: bigint; best24?: number; onOpen: (market: Market, yes?: boolean) => void }) {
  const status = phase(m, now, settled);
  const total = m.yesPool + m.noPool;
  const yesPercent = poolPercent(m, true);
  const open = status === 'Open for bets';
  const hasPosition = p && p.yes + p.no > 0n;
  const k = kind(m, best24);
  const completed = m.endBlockUnits / 1000000000n - m.startBlockUnits / 1000000000n;
  return <article className={`market-card tone-${phaseTone(status)}`}>
    <div className="card-top">
      <span className={`market-symbol symbol-${k === 'Activity' ? 'activity' : k === 'Record attempt' ? 'record' : k === 'Weekly total' ? 'weekly' : 'daily'}`}><Icon name={k === 'Activity' ? 'bolt' : k === 'Record attempt' ? 'trophy' : k === 'Weekly total' ? 'chart' : 'wheel'} size={22}/></span>
      <span className="tag">{k}</span>
      <span className={`status status-${phaseTone(status)}`}><span className="status-dot"/>{status}</span>
    </div>
    <h3><button className="question-button" onClick={() => onOpen(m)}>{title(m, best24)}</button></h3>
    <p className="market-time"><Icon name="clock" size={15}/>{open ? <>Closes in <span className="num">{timeLeft(m.startsAt, now).replace(' left', '')}</span></> : now < m.endsAt ? <>Window ends in <span className="num">{timeLeft(m.endsAt, now).replace(' left', '')}</span></> : `Ended ${date(m.endsAt)}`}</p>
    {m.status === 1 ? <div className="resolved-result"><Icon name="check"/><span><strong>{sideName(m, m.yesWins)} won</strong> with <span className="num">{completed.toLocaleString()}</span> blocks</span></div>
      : <div className="odds-row">
        {[true, false].map(yes => <button key={String(yes)} className={`odds ${yes ? 'odds-yes' : 'odds-no'}`} onClick={() => onOpen(m, open ? yes : undefined)}>
          <span className="odds-side">{sideName(m, yes)}</span>
          <span className="odds-price num">{percentLabel(poolPercent(m, yes))}</span>
        </button>)}
      </div>}
    <div className={`pool-bar ${total === 0n ? 'empty-pool' : ''}`} aria-hidden="true"><span style={{ width: `${yesPercent}%` }}/></div>
    <div className="card-foot">
      <span>Volume <strong className="num" title={`${exactEth(total)} test ETH`}>{eth(total)} ETH</strong></span>
      <span className="num">{total === 0n ? 'Starting odds' : 'Pool-based odds'}</span>
      <span className="num muted">#{m.id.toString()}</span>
    </div>
    {hasPosition && <div className="position-line"><Icon name="ticket" size={16}/><span>{p.claimed ? 'Position claimed' : p.claimable > 0n ? <><strong className="num">{eth(p.claimable)} ETH</strong> ready to claim</> : <>Your stake <strong className="num">{eth(p.yes + p.no)} ETH</strong></>}</span></div>}
    {!open && (p && p.claimable > 0n ? <button className="primary full" onClick={() => onOpen(m)}>{m.status === 2 ? 'Claim refund' : 'Claim winnings'}<Icon name="arrow" size={17}/></button>
      : status === 'Ready to resolve' || status === 'Refund available' ? <button className="secondary full" onClick={() => onOpen(m)}>{status === 'Ready to resolve' ? 'Resolve market' : 'Open refunds'}<Icon name="arrow" size={17}/></button> : null)}
  </article>;
}

export function SkeletonCard() {
  return <div className="market-card skeleton" aria-hidden="true"><span className="sk sk-tag"/><span className="sk sk-title"/><span className="sk sk-line"/><div className="odds-row"><span className="sk sk-odds"/><span className="sk sk-odds"/></div><span className="sk sk-line"/></div>;
}
