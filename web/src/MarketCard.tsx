import type { Market, Position } from './model';
import { date, durationName, eth, exactEth, phase, question, timeLeft } from './model';
import { Icon } from './icons';
export function MarketCard({ market: m, position: p, now, settled, onOpen }: { market: Market; position?: Position; now: bigint; settled?: bigint; onOpen: (market: Market, yes?: boolean) => void }) {
  const status = phase(m, now, settled);
  const total = m.yesPool + m.noPool;
  const yesPercent = total === 0n ? 50 : Number(m.yesPool * 10000n / total) / 100;
  const open = status === 'Open for bets';
  const hasPosition = p && (p.yes + p.no > 0n);
  return <article className="market-card">
    <div className="card-meta"><span className={`market-status ${open ? 'is-open' : ''}`}><span className="status-dot"/>{status}</span><span className="duration"><Icon name="clock" size={15}/>{durationName(m)}</span></div>
    <h3><button className="question-button" onClick={() => onOpen(m)}>{question(m)}</button></h3>
    <p className="market-time">{open ? `Betting closes ${date(m.startsAt)}` : `Window ended${now < m.endsAt ? 's' : ''} ${date(m.endsAt)}`}</p>
    {m.status === 1 ? <div className="resolved-result"><Icon name="check"/><strong>{m.yesWins ? 'Yes' : 'No'} wins</strong><span>{(m.endBlockUnits / 1000000000n - m.startBlockUnits / 1000000000n).toLocaleString()} completed blocks</span></div> : <div className="pool-display"><div className="pool-labels"><span>Yes <strong>{total === 0n ? 'No bets' : `${Math.round(yesPercent)}%`}</strong></span><span>No <strong>{total === 0n ? 'No bets' : `${Math.round(100 - yesPercent)}%`}</strong></span></div><div className={`pool-bar ${total === 0n ? 'empty-pool' : ''}`} aria-hidden="true"><span style={{ width: `${yesPercent}%` }}/></div></div>}
    <div className="card-pool"><span>Total pool <strong title={`${exactEth(total)} ETH`}>{eth(total)} ETH</strong></span><span className="caption">{open ? timeLeft(m.startsAt, now) : `Market #${m.id}`}</span></div>
    {hasPosition && <div className="position-line"><Icon name="wallet" size={16}/><span>{p.claimed ? 'Claimed' : p.claimable > 0n ? `${eth(p.claimable)} ETH to claim` : `Your stake: ${eth(p.yes + p.no)} ETH`}</span></div>}
    {open ? <div className="bet-buttons"><button className="bet-yes" onClick={() => onOpen(m, true)}>Bet yes<Icon name="arrow" size={17}/></button><button className="bet-no" onClick={() => onOpen(m, false)}>Bet no<Icon name="arrow" size={17}/></button></div> : <button className={`full ${p && p.claimable > 0n ? 'primary' : 'secondary'}`} onClick={() => onOpen(m)}>{p && p.claimable > 0n ? m.status === 2 ? 'Claim refund' : 'Claim winnings' : status === 'Ready to resolve' ? 'Resolve market' : status === 'Refund available' ? 'Open refunds' : 'View market'}<Icon name="arrow" size={17}/></button>}
  </article>;
}
