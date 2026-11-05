import { useState, useRef } from 'react';
import { useConnection } from 'wagmi';
import { Modal } from './Modal';
import { Icon } from './icons';
import { DAY, WEEK, checkStart, date, roundAt, roundStart, thresholdValue } from './model';
import { chain } from './config';
import type { Snapshot } from './data';
import { TransactionNotice, type Transact, type TxState } from './MarketDialog';

export type StartChoice = 'soon' | 'six' | 'morning' | 'evening' | 'custom';
export type Preset = { threshold: string; duration: number; start?: StartChoice };
const startLabels: [StartChoice, string][] = [['soon', 'In about 1 hour'], ['six', 'In 6 hours'], ['morning', 'Next 06:00'], ['evening', 'Next 18:00'], ['custom', 'Pick a time']];
const pad = (n: number) => String(n).padStart(2, '0');
const localInput = (ts: number) => { const d = new Date(ts * 1000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/** Target start time for a choice, in unix seconds. Clock times roll to the next day when too close. */
export function targetFor(choice: StartChoice, now: number, custom: string) {
  if (choice === 'soon') return now + 3900;
  if (choice === 'six') return now + 21600;
  if (choice === 'custom') { const t = Date.parse(custom); return Number.isFinite(t) ? Math.floor(t / 1000) : NaN; }
  const d = new Date(now * 1000);
  d.setHours(choice === 'morning' ? 6 : 18, 0, 0, 0);
  let t = Math.floor(d.getTime() / 1000);
  while (t < now + 3900) t += 86400;
  return t;
}

export function CreateDialog({ preset, snapshot, now, ready, tx, transact, onClose, onConnect, onReset }: { preset: Preset; snapshot?: Snapshot; now: bigint; ready: boolean; tx: TxState; transact: Transact; onClose: () => void; onConnect: () => void; onReset: () => void }) {
  const { address, chainId } = useConnection();
  const [threshold, setThreshold] = useState(preset.threshold);
  const [duration, setDuration] = useState(preset.duration);
  const [choice, setChoice] = useState<StartChoice>(preset.start ?? 'soon');
  const [custom, setCustom] = useState(() => localInput(Number(now) + 7200));
  const [error, setError] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const busy = ['checking', 'wallet', 'pending'].includes(tx.stage);
  const genesis = snapshot?.coreConfig?.genesisTimestamp;
  let round: bigint | undefined;
  let start: bigint | undefined;
  let startError = '';
  try {
    if (genesis) {
      const target = targetFor(choice, Number(now), custom);
      if (!Number.isFinite(target)) throw new Error('Enter a valid date and time.');
      round = roundAt(genesis, BigInt(target));
      start = roundStart(genesis, round);
      checkStart(start, now);
    }
  } catch (e) { startError = (e as Error).message; }
  let count: bigint | undefined;
  try { count = thresholdValue(threshold); } catch { /* Shown on submit. */ }
  const step = (delta: number) => { const next = (count ?? 0n) + BigInt(delta); const max = (1n << 64n) - 1n; setThreshold(String(next < 0n ? 0n : next > max ? max : next)); setError(''); onReset(); };
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(''); onReset();
    try {
      const value = thresholdValue(threshold);
      if (!address) { onConnect(); return; }
      if (round === undefined || start === undefined) throw new Error('Refresh chain data before creating a market.');
      if (startError) throw new Error(startError);
      await transact({ functionName: 'createMarket', args: [value, round, BigInt(duration)] }, 'Your market is live. It is at the top of the market list.');
    } catch (e) { setError((e as Error).message); field.current?.focus(); }
  }
  return <Modal title="Create a market" onClose={onClose} className="sheet">
    <form onSubmit={submit} noValidate className="create-form">
      <fieldset className="segmented" disabled={busy}><legend>Window length</legend>
        {[[DAY, '24 hours'], [WEEK, '7 days']].map(([v, label]) => <label key={v} className={duration === v ? 'chosen' : ''}><input type="radio" name="duration" checked={duration === v} onChange={() => { setDuration(Number(v)); onReset(); }}/>{label}</label>)}
      </fieldset>
      <label className="field-label" htmlFor="threshold">Block target</label>
      <div className="stepper">
        <button type="button" className="icon-button" aria-label="Lower the line by 10" onClick={() => step(-10)} disabled={busy}>−</button>
        <div className="amount-field"><input ref={field} id="threshold" name="threshold" inputMode="numeric" autoComplete="off" value={threshold} onChange={e => { setThreshold(e.target.value); setError(''); onReset(); }} aria-invalid={Boolean(error)} aria-describedby="line-help create-error" disabled={busy}/><span>blocks</span></div>
        <button type="button" className="icon-button" aria-label="Raise the line by 10" onClick={() => step(10)} disabled={busy}>+</button>
      </div>
      <p className="small muted" id="line-help">{count === 0n ? <>Yes means at least one completed block. No means no completed blocks.</> : count !== undefined ? <>Yes requires more than {count.toLocaleString()} completed blocks. Exactly {count.toLocaleString()} settles as No.</> : 'Enter a whole number. Yes wins if the hamster completes more blocks than this target.'}</p>
      <fieldset className="chips" disabled={busy}><legend>Window starts</legend>
        {startLabels.map(([v, label]) => <label key={v} className={choice === v ? 'chosen' : ''}><input type="radio" name="start" checked={choice === v} onChange={() => { setChoice(v); onReset(); }}/>{label}</label>)}
      </fieldset>
      {choice === 'custom' && <><label className="field-label" htmlFor="custom-start">Start date and time</label><input className="text-input" type="datetime-local" id="custom-start" value={custom} onChange={e => { setCustom(e.target.value); onReset(); }} disabled={busy}/></>}
      <div className="creation-preview"><Icon name="clock"/><div>
        <strong>{start ? `${date(start)} to ${date(start + BigInt(duration))}` : 'Window preview unavailable'}</strong>
        <p className="small muted">{start ? 'Betting closes when the window starts. Times snap to 10-minute Squeek rounds.' : 'Connect to Sepolia and refresh chain data to see exact dates.'}</p>
        {startError && genesis !== undefined && <p className="inline-error small" role="alert">{startError}</p>}
      </div></div>
      <p className="small muted">Creating a market costs gas and does not place a bet. SqueekCore certification can lag, so resolution may come days after the window ends.</p>
      <p id="create-error" className="inline-error" role="alert">{error}</p>
      {address && (!ready || !snapshot?.coreConfig || snapshot.coreState?.paused) && <p className="inline-error small">{snapshot?.coreState?.paused ? 'SqueekCore is paused. Creation is unavailable until it resumes.' : 'Fresh Core data is unavailable. Close this window and retry the connection.'}</p>}
      {tx.stage === 'success' ? <button type="button" className="primary full" onClick={onClose}>Done<Icon name="check" size={18}/></button> : <button type="submit" className="primary full" disabled={busy || Boolean(address && (!ready || !snapshot?.coreConfig || !snapshot.coreState || snapshot.coreState.paused || chainId !== chain.id || Boolean(startError)))}>{busy ? tx.stage === 'pending' ? 'Confirming market…' : 'Review in your wallet…' : !address ? 'Connect to create market' : chainId !== chain.id ? 'Close and switch to Sepolia' : 'Create market'}<Icon name="arrow" size={18}/></button>}
      <TransactionNotice tx={tx}/>
    </form>
  </Modal>;
}
