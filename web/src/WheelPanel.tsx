import type { WheelStats } from './history';
import { Icon } from './icons';

const ago = (seconds: number) => seconds < 3600 ? `${Math.max(1, Math.round(seconds / 60))} min` : seconds < 172800 ? `${Math.round(seconds / 3600)} h` : `${Math.round(seconds / 86400)} days`;
const when = (ts: number) => new Date(ts * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const minutes = (m: number) => m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;

export function hasRecentBlocks(stats?: WheelStats) { return Boolean(stats && stats.perRound.slice(-6).some(b => b > 0)); }

/** One-line live status used near the top of the page. */
export function WheelPulse({ stats, height, loading, now }: { stats?: WheelStats; height?: bigint; loading: boolean; now: number }) {
  const hasBlocks = hasRecentBlocks(stats);
  return <a className="pulse" href="#wheel">
    <span className={`pulse-wheel ${hasBlocks ? 'spinning' : ''}`}><Icon name="wheel" size={22}/></span>
    <span className="pulse-text">
      <strong>{loading ? 'Reading the wheel…' : stats ? hasBlocks ? 'Blocks in last certified hour' : 'No blocks in last certified hour' : 'Wheel stats unavailable'}</strong>
      <span className="muted">{stats ? <><span className="num">{stats.windows[4].blocks.toLocaleString()}</span> blocks in the last certified 24h</> : height !== undefined ? <>Height <span className="num">{height.toLocaleString()}</span> blocks</> : 'Connecting to SqueekCore'}{stats && now - stats.settledAt > 3600 ? ` · ${ago(now - stats.settledAt)} behind` : ''}</span>
    </span>
    <Icon name="chevron" size={18}/>
  </a>;
}

export function WheelPanel({ stats, error, loading, height, now, onRetry }: { stats?: WheelStats; error: boolean; loading: boolean; height?: bigint; now: number; onRetry: () => void }) {
  const hasBlocks = hasRecentBlocks(stats);
  const max = stats ? Math.max(1, ...stats.perRound) : 1;
  const dayMax = stats ? Math.max(1, ...stats.dayparts.map(d => d.blocks)) : 1;
  return <section className="wheel-panel" id="wheel" aria-labelledby="wheel-title" tabIndex={-1}>
    <div className="panel-head">
      <span className={`pulse-wheel big ${hasBlocks ? 'spinning' : ''}`}><Icon name="wheel" size={28}/></span>
      <div><h2 id="wheel-title">Wheel form</h2><p className="muted small">{stats ? `Certified through ${when(stats.settledAt)}` : 'Official SqueekCore history'}</p></div>
    </div>
    {loading && !stats ? <div className="panel-loading" role="status"><span className="sk sk-chart"/><span className="sk sk-line"/><span className="sk sk-line"/><span className="sr-only">Reading certified wheel history…</span></div>
      : !stats ? <div className="panel-empty"><p>{error ? 'Couldn’t read the wheel history from Sepolia.' : 'Wheel history appears once SqueekCore data loads.'}</p>{height !== undefined && <p className="muted small">Current certified height <span className="num">{height.toLocaleString()}</span> blocks.</p>}{error && <button className="secondary" onClick={onRetry}>Retry wheel stats</button>}</div>
      : <>
        <div className={`live-line ${hasBlocks ? 'has-blocks' : ''}`}><span className="status-dot"/><span><strong>{hasBlocks ? 'Blocks completed' : 'No blocks completed'}</strong> in the last certified hour{now - stats.settledAt > 3600 ? `. Certification is ${ago(now - stats.settledAt)} behind real time.` : '.'}</span></div>
        <figure className="spark">
          <svg viewBox="0 0 144 40" preserveAspectRatio="none" role="img" aria-label={`Blocks per 10-minute round over the last certified 24 hours. Peak ${max} blocks.`}>
            {stats.perRound.map((b, i) => b > 0 && <rect key={i} x={i + 0.15} width="0.7" y={40 - Math.max(2, b / max * 40)} height={Math.max(2, b / max * 40)} rx="0.3"/>)}
          </svg>
          <figcaption className="muted small"><span>24h ago</span><span>Blocks per round</span><span>Latest</span></figcaption>
        </figure>
        <dl className="window-grid" aria-label="Completed blocks by window">{stats.windows.map(w => <div key={w.label}><dt>{w.label}</dt><dd className="num">{w.blocks.toLocaleString()}</dd></div>)}</dl>
        <dl className="fact-list">
          <div><dt><Icon name="bolt" size={16}/>Longest block streak, 24h</dt><dd className="num">{minutes(stats.longestRunMinutes)}</dd></div>
          <div><dt><Icon name="clock" size={16}/>Rounds with blocks, 24h</dt><dd className="num">{stats.activeRounds24} of 144</dd></div>
          <div><dt><Icon name="trophy" size={16}/>Best 24h this week</dt><dd className="num">{stats.best24.toLocaleString()}</dd></div>
          <div><dt><Icon name="chart" size={16}/>Daily average, 7 days</dt><dd className="num">{stats.average24.toLocaleString()}</dd></div>
        </dl>
        <p className="muted small">A block streak counts consecutive 10-minute rounds with completed blocks. It does not measure continuous running; work toward a partial block is not counted.</p>
        <h3 className="panel-sub">Blocks by time of day</h3>
        <ul className="daypart-list">{stats.dayparts.map(d => <li key={d.name}><span className="daypart-name">{d.name}<span className="muted small">{d.hours}</span></span><span className="daypart-bar" aria-hidden="true"><span style={{ width: `${d.blocks / dayMax * 100}%` }}/></span><span className="num">{d.blocks.toLocaleString()}</span></li>)}</ul>
        <p className="muted small">Seven certified days, in your local time. Short windows, block streaks and dayparts are stats only: the deployed contract settles 24-hour and 7-day totals.</p>
      </>}
  </section>;
}
