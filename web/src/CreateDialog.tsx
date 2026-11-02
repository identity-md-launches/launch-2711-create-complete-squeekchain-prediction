import { useState, useRef } from 'react';
import { useConnection } from 'wagmi';
import { Modal } from './Modal';
import { Icon } from './icons';
import { DAY, WEEK, date, startRound, thresholdValue } from './model';
import { chain } from './config';
import type { Snapshot } from './data';
import { TransactionNotice, type Transact, type TxState } from './MarketDialog';
export type Preset = { threshold: string; duration: number };
export function CreateDialog({ preset, snapshot, now, ready, tx, transact, onClose, onConnect, onReset }: { preset: Preset; snapshot?: Snapshot; now: bigint; ready: boolean; tx: TxState; transact: Transact; onClose: () => void; onConnect: () => void; onReset: () => void }) {
  const { address, chainId } = useConnection();
  const [threshold, setThreshold] = useState(preset.threshold);
  const [duration, setDuration] = useState(preset.duration);
  const [lead, setLead] = useState(7200);
  const [error, setError] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const busy = ['checking', 'wallet', 'pending'].includes(tx.stage);
  let round: bigint | undefined;
  let start: bigint | undefined;
  try { if (snapshot?.coreConfig) { round = startRound(snapshot.coreConfig.genesisTimestamp, now, lead); start = snapshot.coreConfig.genesisTimestamp + (round - 1n) * 600n; } } catch { /* Chain availability is explained below. */ }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(''); onReset();
    try {
      const count = thresholdValue(threshold);
      if (!address) { onClose(); onConnect(); return; }
      if (round === undefined) throw new Error('Refresh chain data before creating a market.');
      await transact({ functionName: 'createMarket', args: [count, round, BigInt(duration)] }, 'Your market is created. Find it at the top of the market list.');
    } catch (e) { setError((e as Error).message); field.current?.focus(); }
  }
  return <Modal title="Create a market" onClose={onClose}>
    <p className="muted">Choose a block target. Everyone bets before the activity window starts.</p>
    <form onSubmit={submit} noValidate>
      <label className="field-label" htmlFor="threshold">Will the hamster complete more than…</label>
      <div className="amount-field"><input ref={field} id="threshold" name="threshold" inputMode="numeric" autoComplete="off" value={threshold} onChange={e => { setThreshold(e.target.value); setError(''); onReset(); }} aria-invalid={Boolean(error)} aria-describedby="create-error" disabled={busy}/><span>blocks</span></div>
      <fieldset className="period-choice" disabled={busy}><legend>Activity window</legend><label className={duration === DAY ? 'chosen' : ''}><input type="radio" name="duration" checked={duration === DAY} onChange={() => setDuration(DAY)}/>24 hours</label><label className={duration === WEEK ? 'chosen' : ''}><input type="radio" name="duration" checked={duration === WEEK} onChange={() => setDuration(WEEK)}/>7 days</label></fieldset>
      <label className="field-label" htmlFor="lead">Keep betting open for</label><select className="text-input" id="lead" name="lead" value={lead} onChange={e => setLead(Number(e.target.value))} disabled={busy}><option value={7200}>About 2 hours</option><option value={21600}>About 6 hours</option><option value={86400}>About 24 hours</option></select>
      <div className="creation-preview"><Icon name="clock"/><div><strong>{start ? `Starts ${date(start)}` : 'Window preview unavailable'}</strong><p className="caption muted">{start ? `Ends ${date(start + BigInt(duration))}. Betting closes at the start.` : 'Connect to Sepolia and refresh chain data to see exact dates.'}</p></div></div>
      <p className="caption muted">Windows align to 10-minute Squeek rounds. The final dates are set on-chain. Creating a market costs gas and does not place a bet.</p>
      <p id="create-error" className="inline-error" role="alert">{error}</p>
      {address && (!ready || !snapshot?.coreConfig || snapshot.coreState?.paused) && <p className="inline-error caption">{snapshot?.coreState?.paused ? 'SqueekCore is paused. Creation is unavailable until it resumes.' : 'Fresh Core data is unavailable. Close this window and retry the connection.'}</p>}
      <button type="submit" className="primary full" disabled={busy || Boolean(address && (!ready || !snapshot?.coreConfig || !snapshot.coreState || snapshot.coreState.paused || chainId !== chain.id))}>{busy ? tx.stage === 'pending' ? 'Confirming market…' : 'Review in your wallet…' : !address ? 'Connect to create market' : chainId !== chain.id ? 'Close and switch to Sepolia' : 'Create market'}<Icon name="arrow" size={18}/></button>
      <TransactionNotice tx={tx}/>
    </form>
  </Modal>;
}
