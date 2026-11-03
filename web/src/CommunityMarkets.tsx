import { useState } from 'react';
import { Icon } from './icons';
import { PREVIEW_TEMPLATES, REPORTED_RESULTS, loadCalls, pastWindows, previewWindow, saveCalls, type Calls } from './previews';

const until = (seconds: number) => seconds >= 86400 ? `${Math.floor(seconds / 86400)}d ${Math.floor(seconds % 86400 / 3600)}h` : seconds >= 3600 ? `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m` : `${Math.max(1, Math.ceil(seconds / 60))}m`;
const utcDay = (ts: number) => new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

export function useCalls() {
  const [calls, setCalls] = useState<Calls>(loadCalls);
  const choose = (id: string, option: number) => setCalls(prev => {
    const next = { ...prev };
    if (next[id] === option) delete next[id]; else next[id] = option;
    saveCalls(next);
    return next;
  });
  return { calls, choose };
}

export function CommunityMarkets({ now, calls, choose }: { now: number; calls: Calls; choose: (id: string, option: number) => void }) {
  return <section className="community" id="community" aria-labelledby="community-title" tabIndex={-1}>
    <div className="ideas-head">
      <h2 id="community-title">Founder and NFT previews</h2>
      <p className="muted small">Free calls only. The Sepolia contract can settle hamster blocks, not posts or NFT prices.</p>
    </div>
    <div className="preview-grid">{PREVIEW_TEMPLATES.map(t => {
      const w = previewWindow(t, now);
      const reported = REPORTED_RESULTS[w.id];
      const picked = calls[w.id];
      return <article className="preview-card" key={t.key}>
        <h3>{t.question}</h3>
        <p className="preview-meta"><Icon name={t.topic === 'Founder' ? 'bolt' : 'ticket'} size={15}/>{t.topic} · {reported ? 'result reported' : 'free call, no ETH'}</p>
        <p className="market-time"><Icon name="clock" size={15}/>{w.end ? <>{t.window === 'day' ? `${utcDay(w.start!)} UTC` : `Week of ${utcDay(w.start!)} UTC`} · rolls over in <span className="num">{until(w.end - now)}</span></> : 'Open until the outcome is announced'}</p>
        <div className="call-options" role="group" aria-label={`Your call: ${t.question}`}>
          {t.options.map((o, i) => <button key={o} type="button" className={picked === i ? 'call chosen' : 'call'} aria-pressed={picked === i} disabled={Boolean(reported)} onClick={() => choose(w.id, i)}>{picked === i && <Icon name="check" size={16}/>}{o}</button>)}
        </div>
        {reported ? <p className="result-note"><Icon name="check" size={16}/>Reported: {reported}</p>
          : <p className="muted small">{picked === undefined ? 'Tap an answer to save a free call in this browser.' : 'Call saved in this browser. Tap it again to clear.'}</p>}
        <details className="market-details"><summary>How it would settle</summary><p className="small muted">{t.resolution} Results are reported off-chain by the site owner.</p></details>
      </article>;
    })}</div>
  </section>;
}

/** Ended preview windows with this browser's calls, newest first. */
export function PreviewHistory({ now, calls }: { now: number; calls: Calls }) {
  const rows = PREVIEW_TEMPLATES.flatMap(t => pastWindows(t, now, t.window === 'day' ? 14 : 4).map(w => ({ t, w, call: calls[w.id], reported: REPORTED_RESULTS[w.id] })))
    .filter(r => r.call !== undefined || r.reported)
    .sort((a, b) => b.w.end - a.w.end);
  if (!rows.length) return <p className="muted small">Ended founder windows appear here with your calls and any reported result.</p>;
  return <ul className="history-list">{rows.map(({ t, w, call, reported }) => <li key={w.id}>
    <span className="history-name"><strong>{t.question.replace(' today?', '?').replace(' this week?', '?')}</strong><span className="muted small">{t.window === 'day' ? utcDay(w.start) : `Week of ${utcDay(w.start)}`} UTC · your call {call === undefined ? 'none' : t.options[call]}</span></span>
    <span className={`history-result ${reported ? '' : 'muted'}`}>{reported ?? 'No result reported'}</span>
  </li>)}</ul>;
}
