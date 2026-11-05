import { useEffect, useState, useRef } from 'react';
import { getAddress, isAddress, type Address, type Hash } from 'viem';
import { useConnection } from 'wagmi';
import { Modal } from './Modal';
import { Icon } from './icons';
import { amount, date, eth, exactEth, formatOdds, MAX_POOL, odds, payout, percentLabel, phase, poolPercent, sideName, timeLeft, title, type Market, type Position } from './model';
import { PREDICT_ADDRESS, EXPLORER, chain } from './config';
import type { Action } from './data';
export type TxState = { stage: 'idle' | 'checking' | 'wallet' | 'pending' | 'success' | 'error'; message: string; hash?: Hash };
export type Transact = (action: Action, success: string) => Promise<boolean>;
export function TransactionNotice({ tx }: { tx: TxState }) {
  return <div className={`transaction-notice ${tx.stage === 'error' ? 'inline-error' : ''}`} role={tx.stage === 'error' ? 'alert' : undefined}>
    {tx.message && <p>{tx.stage === 'success' && <Icon name="check" size={16}/>} {tx.message}</p>}
    {tx.hash && <a href={`${EXPLORER}/tx/${tx.hash}`} target="_blank" rel="noreferrer">View transaction<Icon name="external" size={14}/></a>}
  </div>;
}
export function MarketDialog({ market: m, position: p, yes: initialYes, now, settled, best24, ready, tx, transact, onClose, onConnect, onReset }: { market: Market; position?: Position; yes?: boolean; now: bigint; settled?: bigint; best24?: number; ready: boolean; tx: TxState; transact: Transact; onClose: () => void; onConnect: () => void; onReset: () => void }) {
  const { address, chainId } = useConnection();
  const [yes, setYes] = useState(initialYes ?? true);
  const [stake, setStake] = useState('0.001');
  const [error, setError] = useState('');
  const [recipient, setRecipient] = useState(address ?? '');
  useEffect(() => { if (address) setRecipient(address); }, [address]);
  const field = useRef<HTMLInputElement>(null);
  const recipientField = useRef<HTMLInputElement>(null);
  const status = phase(m, now, settled);
  const busy = ['checking', 'wallet', 'pending'].includes(tx.stage);
  const open = status === 'Open for bets';
  let value = 0n;
  try { value = amount(stake); } catch { /* Validate visibly on submission. */ }
  const estimate = value > 0n ? payout(m, yes, value, yes ? p?.yes ?? 0n : p?.no ?? 0n) : null;
  const connect = () => onConnect();
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(''); onReset();
    try {
      const v = amount(stake);
      if ((yes ? m.yesPool : m.noPool) + v > MAX_POOL) throw new Error('This stake exceeds the 100 ETH limit for this side. Enter a smaller amount.');
      if (!address) { connect(); return; }
      await transact({ functionName: 'bet', args: [m.id, yes], value: v }, `Your ${sideName(m, yes)} bet is confirmed.`);
    } catch (e) { setError((e as Error).message); field.current?.focus(); }
  }
  async function claim() {
    setError(''); onReset();
    if (!isAddress(recipient) || getAddress(recipient) === getAddress(PREDICT_ADDRESS) || /^0x0{40}$/i.test(recipient)) { setError('Enter a valid receiving wallet address.'); recipientField.current?.focus(); return; }
    await transact({ functionName: 'claim', args: [m.id, getAddress(recipient) as Address] }, m.status === 2 ? 'Your refund is confirmed.' : 'Your winnings are claimed.');
  }
  return <Modal title={open ? 'Bet slip' : 'Market details'} onClose={onClose} className="sheet">
    <div className="dialog-market-meta"><span>{status}</span><span>Market #{m.id}</span></div>
    <h3 className="dialog-question">{title(m, best24)}</h3>
    <p className="slip-timing small muted"><Icon name="clock" size={15}/>{open ? `Betting closes in ${timeLeft(m.startsAt, now).replace(' left', '')}` : now < m.endsAt ? `Window ends in ${timeLeft(m.endsAt, now).replace(' left', '')}` : `Window ended ${date(m.endsAt)}`}</p>
    {open && tx.stage !== 'success' && <form onSubmit={submit} noValidate>
      <fieldset className="side-choice" disabled={busy}><legend>Choose your side <span className="small muted">Pool-based odds</span></legend>{[true, false].map(side => <label key={String(side)} className={yes === side ? side ? 'selected-yes' : 'selected-no' : ''}><input type="radio" name="side" value={side ? 'yes' : 'no'} checked={yes === side} onChange={() => { setYes(side); onReset(); }}/><span>{sideName(m, side)}</span><span className="num">{percentLabel(poolPercent(m, side))}</span></label>)}</fieldset>
      <label className="field-label" htmlFor="stake">Your stake <span>Sepolia test ETH</span></label>
      <div className="amount-field"><input ref={field} id="stake" name="stake" inputMode="decimal" autoComplete="off" value={stake} onChange={e => { setStake(e.target.value); setError(''); onReset(); }} aria-invalid={Boolean(error)} aria-describedby="stake-help stake-error" disabled={busy}/><span>ETH</span></div>
      <div className="quick-amounts">{['0.001', '0.005', '0.01'].map(v => <button type="button" className={stake === v ? 'chosen' : ''} disabled={busy} key={v} onClick={() => { setStake(v); setError(''); onReset(); }}>{v} ETH</button>)}</div>
      <p className="small muted" id="stake-help">Minimum 0.0001 ETH. You also pay network gas.</p>
      <div className="estimate"><span>Estimated payout if {sideName(m, yes)} wins</span><strong className="num">{estimate === null ? 'Waiting for the other side' : `${eth(estimate)} ETH`}</strong></div>
      <p className="small muted">Includes your stake{p && (yes ? p.yes : p.no) > 0n ? ' and your existing stake on this side' : ''}. Payouts change as bets come in. Bets are final; you can lose your stake.</p>
      <p id="stake-error" className="inline-error" role="alert">{error}</p>
      <button className="primary full" type="submit" disabled={busy || Boolean(address && (!ready || chainId !== chain.id))}>{busy ? tx.stage === 'pending' ? 'Confirming bet…' : tx.stage === 'checking' ? 'Checking market…' : 'Review in your wallet…' : !address ? 'Connect to place bet' : chainId !== chain.id ? 'Switch to Sepolia in the header' : `Bet ${sideName(m, yes)}`}<Icon name="arrow" size={18}/></button>
    </form>}
    {p && p.yes + p.no > 0n && <section className="your-position"><h3>Your position</h3><dl><div><dt>{sideName(m, true)} stake</dt><dd>{exactEth(p.yes)} ETH</dd></div><div><dt>{sideName(m, false)} stake</dt><dd>{exactEth(p.no)} ETH</dd></div><div><dt>{p.claimed ? 'Claimed' : 'Available to claim'}</dt><dd>{p.claimed ? 'Complete' : `${exactEth(p.claimable)} ETH`}</dd></div></dl>
      {p.claimable > 0n && !p.claimed && <><label className="field-label" htmlFor="recipient">Receiving wallet</label><input id="recipient" ref={recipientField} className="text-input address" value={recipient} onChange={e => { setRecipient(e.target.value); setError(''); }} autoComplete="off" aria-describedby="claim-error" aria-invalid={Boolean(error)} disabled={busy}/><p className="inline-error" role="alert" id="claim-error">{error}</p><button className="primary full" disabled={!ready || busy || chainId !== chain.id} onClick={() => void claim()}>{busy ? 'Confirming claim…' : m.status === 2 ? `Claim ${eth(p.claimable)} ETH refund` : `Claim ${eth(p.claimable)} ETH winnings`}</button></>}
      {m.status === 1 && p.claimable === 0n && !p.claimed && <p className="small muted">{sideName(m, m.yesWins)} won. This position has no winnings to claim.</p>}
    </section>}
    {!open && m.status === 0 && <div className="settlement-actions">
      {status === 'Refund available' ? <><p>Refunds can be opened {now >= m.refundAt ? 'because the resolution deadline passed.' : 'because one side has no bets.'}</p><button className="primary full" disabled={Boolean(address) && (!ready || busy || chainId !== chain.id)} onClick={() => address ? void transact({ functionName: now >= m.refundAt ? 'cancelExpired' : 'cancelUnmatched', args: [m.id] }, 'Refunds are open. You can now claim your stake.') : connect()}>Open refunds</button></> : <><p className="small muted">{status === 'In progress' ? 'Betting is closed while the hamster completes this window.' : status === 'Awaiting settlement' ? 'Waiting for SqueekCore to certify the end of this window. Refresh to check again.' : 'The official result is ready. Anyone can resolve this market.'}</p>{status === 'Ready to resolve' && <button className="primary full" disabled={Boolean(address) && (!ready || busy || chainId !== chain.id)} onClick={() => address ? void transact({ functionName: 'resolve', args: [m.id] }, 'Market resolved. Winning positions can now claim.') : connect()}>Resolve market</button>}</>}
      <p className="small muted">If unresolved, refunds open {date(m.refundAt)}.</p>
    </div>}
    {!ready && <p className="small inline-error">Fresh verified chain data is unavailable. Close this window and retry the connection.</p>}
    {m.status === 1 && <p className="result-note"><Icon name="check" size={18}/>{sideName(m, m.yesWins)} won with {(m.endBlockUnits / 1000000000n - m.startBlockUnits / 1000000000n).toLocaleString()} completed blocks.</p>}
    <TransactionNotice tx={tx}/>
    {tx.stage === 'success' && <button className="primary full" onClick={onClose}>Done<Icon name="check" size={18}/></button>}
    <details className="market-details"><summary>Market rules & details<Icon name="chevron" size={15}/></summary>
      <dl className="market-facts"><div><dt>Betting closes / window starts</dt><dd>{date(m.startsAt)}</dd></div><div><dt>Window ends</dt><dd>{date(m.endsAt)}</dd></div></dl>
      <div className="dialog-pools">{[true, false].map(side => <div key={String(side)}><span>{sideName(m, side)} pool</span><strong className="num">{exactEth(side ? m.yesPool : m.noPool)} ETH</strong><span>Current return: {formatOdds(odds(m, side))}</span></div>)}</div>
      <p className="small muted">Yes requires strictly more than {m.threshold.toLocaleString()} completed blocks. Exactly {m.threshold.toLocaleString()} settles as No. Percentages show the share of staked test ETH, not a guaranteed probability. An empty market starts at 50/50. Unmatched markets are refunded after betting closes.</p>
      <p className="small muted">Rounds {m.startRound.toString()}–{m.endRound.toString()}. Only official settled whole-block heights count; physical wheel revolutions are not a one-to-one block count. Winners share the full pool proportionally. No platform fee. The final winning claimant receives rounding dust.</p><a href={`${EXPLORER}/address/${PREDICT_ADDRESS}`} target="_blank" rel="noreferrer">View contract<Icon name="external" size={14}/></a></details>
  </Modal>;
}
