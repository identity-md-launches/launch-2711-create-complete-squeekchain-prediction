import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useConnection } from 'wagmi';
import { getWalletClient } from 'wagmi/actions';
import { getAddress, type Abi } from 'viem';
import { config, chain, publicClient, PREDICT_ADDRESS, EXPLORER } from './config';
import { predictAbi } from './predictAbi';
import { readSnapshot, verifyContract, type Action } from './data';
import { DAY, WEEK, eth, friendlyError, phase, title, type Market } from './model';
import { Icon } from './icons';
import { Wallet } from './Wallet';
import { Modal } from './Modal';
import { MarketCard, SkeletonCard } from './MarketCard';
import { MarketDialog, TransactionNotice, type TxState } from './MarketDialog';
import { CreateDialog, type Preset } from './CreateDialog';

type Tab = 'markets' | 'positions';
const idleTx: TxState = { stage: 'idle', message: '' };
const tabFromHash = (): Tab => location.hash === '#positions' ? 'positions' : 'markets';
const defaultPreset: Preset = { threshold: '', duration: DAY, start: 'soon' };

export default function App() {
  const { address, chainId, isConnected } = useConnection();
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [filter, setFilter] = useState('open');
  const [duration, setDuration] = useState('all');
  const [sort, setSort] = useState('closing');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(30);
  const [lookup, setLookup] = useState<bigint>();
  const [lookupText, setLookupText] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [walletOpen, setWalletOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [selected, setSelected] = useState<{ id: bigint; yes?: boolean; market: Market }>();
  const [creation, setCreation] = useState<Preset>();
  const [tx, setTx] = useState<TxState>(idleTx);
  const [claiming, setClaiming] = useState<bigint>();
  const lock = useRef(false);
  const [tick, setTick] = useState(Date.now());
  const query = useQuery({ queryKey: ['markets', address, limit, lookup?.toString()], queryFn: () => readSnapshot(address, limit, lookup), retry: false, refetchInterval: 30000, refetchOnWindowFocus: true });
  const data = query.data;
  const now = data ? data.timestamp + BigInt(Math.max(0, Math.floor((tick - data.fetchedAt) / 1000))) : BigInt(Math.floor(tick / 1000));
  const ready = Boolean(data && !query.isError && tick - data.fetchedAt < 90000);
  const busy = ['checking', 'wallet', 'pending'].includes(tx.stage);
  const settled = data?.coreState?.settledThroughRound;
  useEffect(() => { const timer = setInterval(() => setTick(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const onHash = () => {
      if (location.hash === '#main') return;
      setTab(tabFromHash()); setFilter(location.hash === '#positions' ? 'all' : 'open');
      setSearch(''); setDuration('all');
      window.scrollTo({ top: 0, behavior: 'instant' });
      document.getElementById('main')?.focus({ preventScroll: true });
    };
    addEventListener('hashchange', onHash); return () => removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => { if (isConnected) setWalletOpen(false); }, [isConnected]);
  useEffect(() => { document.title = `${tab === 'positions' ? 'My positions' : 'Prediction markets'} · Squeek Predict`; }, [tab]);
  const previousAddress = useRef(address);
  useEffect(() => {
    if (previousAddress.current && previousAddress.current !== address) { setSelected(undefined); setCreation(undefined); if (!lock.current) setTx(idleTx); }
    previousAddress.current = address;
  }, [address]);

  function resetTx() { if (!lock.current) setTx(idleTx); }
  function openMarket(m: Market, yes?: boolean) { resetTx(); setSelected({ id: m.id, yes, market: m }); }
  function openCreate(preset: Preset = defaultPreset) { resetTx(); setCreation(preset); }
  async function transact(action: Action, success: string): Promise<boolean> {
    if (lock.current || !address || chainId !== chain.id || !ready) return false;
    lock.current = true;
    let hash: `0x${string}` | undefined;
    try {
      setTx({ stage: 'checking', message: 'Checking the latest market state…' });
      const client = await getWalletClient(config);
      const assertWallet = async () => {
        const [walletChain, accounts] = await Promise.all([client.getChainId(), client.getAddresses()]);
        if (walletChain !== chain.id || !accounts[0] || getAddress(accounts[0]) !== getAddress(address)) throw new Error('Wallet changed. Close this window, check your account and network, then retry.');
      };
      await assertWallet();
      await verifyContract();
      const request = { address: PREDICT_ADDRESS, abi: predictAbi as Abi, account: address, chain, ...action } as const;
      const simulation = await publicClient.simulateContract(request);
      await assertWallet();
      setTx({ stage: 'wallet', message: 'Review and confirm the transaction in your wallet.' });
      hash = await client.writeContract(simulation.request);
      setTx({ stage: 'pending', message: 'Transaction submitted. Waiting for confirmation…', hash });
      const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120000 });
      if (receipt.status !== 'success') throw new Error('Transaction reverted. Refresh the market and retry.');
      setTx({ stage: 'success', message: success, hash: receipt.transactionHash });
      await query.refetch();
      return true;
    } catch (error) {
      const message = error instanceof Error && /Wallet changed|Transaction reverted|Contract verification failed/.test(error.message) ? error.message : hash ? 'Confirmation is unavailable. Check the transaction on Etherscan before submitting again.' : friendlyError(error);
      setTx({ stage: 'error', message, hash });
      return false;
    } finally { lock.current = false; }
  }
  async function quickClaim(m: Market) {
    if (!address) return;
    resetTx(); setClaiming(m.id);
    await transact({ functionName: 'claim', args: [m.id, getAddress(address)] }, m.status === 2 ? `Refund from market #${m.id} claimed.` : `Winnings from market #${m.id} claimed.`);
    setClaiming(undefined);
  }

  const markets = data?.markets ?? [];
  const positionOf = (m: Market) => data?.positions[String(m.id)];
  const statusOf = (m: Market) => phase(m, now, settled);
  const held = markets.filter(m => { const p = positionOf(m); return p && p.yes + p.no > 0n; });
  const toClaim = held.filter(m => (positionOf(m)?.claimable ?? 0n) > 0n);
  const claimableTotal = held.reduce((sum, m) => sum + (positionOf(m)?.claimable ?? 0n), 0n);
  const stakedTotal = held.filter(m => m.status === 0).reduce((sum, m) => { const p = positionOf(m)!; return sum + p.yes + p.no; }, 0n);
  const openCount = markets.filter(m => statusOf(m) === 'Open for bets').length;
  const totalPool = markets.reduce((sum, m) => sum + m.yesPool + m.noPool, 0n);
  const visible = (tab === 'positions' ? held : markets).filter(m => {
    const status = statusOf(m);
    if (filter === 'open' && status !== 'Open for bets') return false;
    if (filter === 'live' && (m.status !== 0 || status === 'Open for bets')) return false;
    if (filter === 'settled' && m.status === 0) return false;
    if (filter === 'claimable' && (positionOf(m)?.claimable ?? 0n) === 0n) return false;
    if (duration !== 'all' && m.endsAt - m.startsAt !== BigInt(duration)) return false;
    const q = search.toLowerCase().replace(/,/g, '').replace(/^#/, '').trim();
    return !q || `${m.threshold} ${m.id} ${title(m).toLowerCase().replace(/,/g, '')}`.includes(q);
  }).sort((a, b) => {
    if (sort === 'pool') { const difference = b.yesPool + b.noPool - a.yesPool - a.noPool; return difference > 0n ? 1 : difference < 0n ? -1 : 0; }
    if (sort === 'newest') return a.id > b.id ? -1 : a.id < b.id ? 1 : 0;
    const rank = (m: Market) => statusOf(m) === 'Open for bets' ? 0 : m.status === 0 ? 1 : 2;
    return rank(a) - rank(b) || (a.startsAt < b.startsAt ? -1 : a.startsAt > b.startsAt ? 1 : 0);
  });
  const selectedMarket = markets.find(m => m.id === selected?.id) ?? selected?.market;
  const statusFilters = tab === 'markets' ? [['open', 'Open'], ['live', 'In progress'], ['settled', 'Settled'], ['all', 'All markets']] : [['all', 'All positions'], ['claimable', 'To claim'], ['open', 'Open'], ['settled', 'Settled']];
  const resetFilters = () => { setFilter('all'); setSearch(''); setDuration('all'); };
  const emptyBoard = data && !query.isError && markets.length === 0;
  const showGrid = tab === 'markets' || Boolean(address);

  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{tx.stage === 'error' ? '' : tx.message}</div>
    <header className="site-header"><div className="header-inner">
      <a className="brand" href="#markets" aria-label="Squeek Predict home"><img src="./favicon.svg" width="32" height="32" alt=""/><span>Squeek<span className="brand-accent">Predict</span></span></a>
      <nav className="main-nav" aria-label="Main navigation">
        <a href="#markets" aria-current={tab === 'markets' ? 'page' : undefined}><Icon name="grid" size={18}/>Markets</a>
        <a href="#positions" aria-current={tab === 'positions' ? 'page' : undefined}><Icon name="ticket" size={18}/>My positions{toClaim.length > 0 && <span className="nav-badge">{toClaim.length}</span>}</a>
      </nav>
      <div className="header-actions"><button className="ghost help-button" onClick={() => setHelpOpen(true)}><Icon name="info" size={18}/><span>How it works</span></button><Wallet open={walletOpen} setOpen={setWalletOpen}/></div>
    </div></header>

    <main id="main" className="page" tabIndex={-1}>
      <div className="page-heading">
        <div><h1>{tab === 'markets' ? 'Prediction markets' : 'My positions'}</h1><p>{tab === 'markets' ? 'Take a side on Squeekchain. Let the blocks decide.' : 'Your stakes, results and payouts in one place.'}</p></div>
        <button className="secondary create-top" onClick={() => openCreate()} disabled={busy}><Icon name="plus" size={18}/>Create market</button>
      </div>
      <div className="market-overview">
        <span className="network-label"><span className="status-dot"/>Sepolia testnet<span className="overview-divider">/</span>Test ETH only</span>
        {data && <div className="overview-stats"><span><strong className="num">{openCount}</strong> open</span><span><strong className="num">{eth(totalPool)} ETH</strong> volume</span><span className="loaded-label">Loaded markets</span></div>}
        <button className="ghost refresh" disabled={query.isFetching} onClick={() => void query.refetch()} aria-label="Refresh markets"><Icon name="refresh" size={15}/><span>{query.isFetching ? 'Refreshing…' : query.isError ? 'Read failed' : data ? 'Auto-refresh · 30s' : 'Reading chain…'}</span></button>
      </div>

      <div className="layout">
        <section className="board" aria-label={tab === 'markets' ? 'Market board' : 'Position board'}>
          {tab === 'positions' && address && data && <div className="position-summary">
            <div><span>Active stakes</span><strong className="num">{eth(stakedTotal)} <small>ETH</small></strong></div>
            <div><span>Ready to claim</span><strong className="num gain">{eth(claimableTotal)} <small>ETH</small></strong></div>
            <div><span>Positions</span><strong className="num">{held.length}</strong></div>
            <p>Totals cover loaded markets. Load older markets below to find earlier positions.</p>
          </div>}
          {showGrid && <>
            {!emptyBoard && <div className="board-controls">
              <div className="chip-row" role="group" aria-label="Market status">{statusFilters.map(([value, label]) => <button key={value} className={filter === value ? 'chip active' : 'chip'} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'open' && <span className="status-dot"/>}{label}</button>)}</div>
              <div className="filter-tools">
                <label className="search-field"><Icon name="search" size={18}/><input type="search" aria-label="Search markets" placeholder="Search question or market #" value={search} onChange={e => setSearch(e.target.value)}/></label>
                <select aria-label="Window length" value={duration} onChange={e => setDuration(e.target.value)}><option value="all">All durations</option><option value={DAY}>24 hours</option><option value={WEEK}>7 days</option></select>
                <select aria-label="Sort markets" value={sort} onChange={e => setSort(e.target.value)}><option value="closing">Closing soon</option><option value="pool">Most volume</option><option value="newest">Newest</option></select>
              </div>
            </div>}
            {query.isError && <div className="connection-error" role="alert"><Icon name="info"/><div><strong>Couldn’t load fresh market data</strong><p>{data ? 'Showing the last read. Transactions are paused until a fresh read succeeds.' : 'Check your connection, then try Sepolia again.'}</p></div><button className="secondary" onClick={() => void query.refetch()} disabled={query.isFetching}>Retry</button></div>}
            {tab === 'positions' && toClaim.length > 0 && <section className="claim-list" aria-labelledby="claim-title"><h2 id="claim-title">Ready to claim</h2>{toClaim.map(m => <div className="claim-row" key={String(m.id)}><div><strong>{title(m)}</strong><span className="small muted">Market #{String(m.id)} · {m.status === 2 ? 'Refund' : 'Winnings'} · {eth(positionOf(m)!.claimable)} ETH</span></div><button className="primary" onClick={() => void quickClaim(m)} disabled={busy || !ready || chainId !== chain.id}>{claiming === m.id && busy ? 'Claiming…' : 'Claim'}</button></div>)}</section>}
            {tx.message && !selected && !creation && <TransactionNotice tx={tx}/>}
            {query.isPending ? <><p className="sr-only" role="status">Loading markets from Sepolia</p><div className="market-grid" aria-busy="true">{[0, 1, 2, 3].map(n => <SkeletonCard key={n}/>)}</div></> : visible.length > 0 ? <>
              <div className="results-line"><span>{visible.length} {visible.length === 1 ? 'market' : 'markets'}</span><span>Two outcomes. On-chain settlement.</span></div>
              <div className="market-grid">{visible.map(m => <MarketCard key={String(m.id)} market={m} position={positionOf(m)} now={now} settled={settled} busy={busy} onOpen={openMarket}/>)}</div>
            </> : !query.isError && <div className="empty">
              <div className="empty-symbol"><Icon name={tab === 'positions' ? 'ticket' : 'wheel'} size={30}/></div>
              <h2>{tab === 'positions' ? held.length ? 'No matching positions' : 'Your first position starts here' : emptyBoard ? 'The next market starts with you' : 'No markets match this view'}</h2>
              <p>{tab === 'positions' ? 'Choose a market and place a bet to track it here.' : emptyBoard ? 'No markets have been created yet. Open a two-outcome prediction on Squeek blocks.' : 'Try another status, duration or search. You can also create a new market.'}</p>
              {tab === 'positions' ? held.length ? <button className="primary" onClick={resetFilters}>Show all positions</button> : <a className="button primary" href="#markets">Explore markets<Icon name="arrow" size={17}/></a> : <div className="empty-actions">{emptyBoard ? <button className="primary" onClick={() => openCreate()} disabled={busy}>Create market<Icon name="plus" size={17}/></button> : <button className="primary" onClick={resetFilters}>Show all markets</button>}</div>}
            </div>}
            {data && data.count > BigInt(limit) && <button className="secondary load-more" disabled={query.isFetching} onClick={() => setLimit(v => v + 30)}>{query.isFetching ? 'Loading…' : 'Load older markets'}</button>}
            {data && data.count > 0n && <details className="lookup"><summary>Find an older market by number</summary><form onSubmit={e => { e.preventDefault(); setLookupError(''); if (!/^\d+$/.test(lookupText) || BigInt(lookupText) < 1n || BigInt(lookupText) > data.count) { setLookupError(`Enter a market number from 1 to ${data.count}.`); return; } setLookup(BigInt(lookupText)); setSearch(lookupText); setFilter('all'); setDuration('all'); }}><label className="sr-only" htmlFor="market-number">Market number</label><input className="text-input" id="market-number" inputMode="numeric" value={lookupText} onChange={e => setLookupText(e.target.value)} placeholder="Market number" aria-describedby="lookup-error" aria-invalid={Boolean(lookupError)}/><button className="secondary" disabled={query.isFetching}>Find market</button></form><p id="lookup-error" className="inline-error" role="alert">{lookupError}</p></details>}
          </>}

          {tab === 'positions' && !address && <div className="empty positions-empty"><div className="empty-symbol"><Icon name="ticket" size={32}/></div><h2>Your positions, all in one place</h2><p>Connect your wallet to see your bets and claim available winnings or refunds.</p><button className="primary" onClick={() => setWalletOpen(true)}>Connect wallet<Icon name="wallet" size={17}/></button><span className="small muted">Connecting never places a bet.</span></div>}

          {tab === 'markets' && <section className="market-starters" aria-labelledby="starters-title"><div className="section-heading"><h2 id="starters-title">Open the next market</h2><span className="small muted">Your question. Two outcomes.</span></div><div className="starter-grid">
            {[{ label: 'Daily block total', description: 'Will the hamster beat your 24-hour block target?', icon: 'chart' as const, duration: DAY, threshold: '' }, { label: 'Weekly block total', description: 'Will seven days of activity beat your target?', icon: 'calendar' as const, duration: WEEK, threshold: '' }, { label: 'Hamster activity', description: 'Will the hamster complete a block in 24 hours?', icon: 'bolt' as const, duration: DAY, threshold: '0' }].map(p => <button className="starter" key={p.label} onClick={() => openCreate({ threshold: p.threshold, duration: p.duration, start: 'soon' })} disabled={busy}><span className="starter-top"><Icon name={p.icon} size={20}/><Icon name="arrow" size={16}/></span><strong>{p.label}</strong><span>{p.description}</span><span className="starter-action">{p.threshold === '' ? 'Set a target' : 'Create market'}<Icon name="plus" size={14}/></span></button>)}
          </div><p className="starter-note">Market templates, not open bets. Creating a market costs gas and does not place a bet.</p></section>}
          <div className="board-note"><Icon name="shield" size={17}/><p>Outcomes come from settled SqueekCore blocks. Odds reflect the pool split, not a guaranteed probability. Test ETH only.</p></div>
        </section>

        <aside className="sidebar" aria-label="Your portfolio and market guide">
          <section className="portfolio-panel"><div className="panel-heading"><h2>My positions</h2><Icon name="ticket" size={20}/></div>{address ? <><div className="portfolio-value"><span className="muted small">Active stakes · loaded markets</span><strong className="num">{data ? eth(stakedTotal) : '…'} <small>ETH</small></strong></div><dl className="portfolio-details"><div><dt>Positions</dt><dd>{data ? held.length : '…'}</dd></div><div><dt>Ready to claim</dt><dd className="gain">{data ? `${eth(claimableTotal)} ETH` : '…'}</dd></div></dl><a className="button secondary full" href="#positions">View positions<Icon name="arrow" size={16}/></a></> : <><div className="portfolio-illustration" aria-hidden="true"><Icon name="ticket" size={36}/></div><h3>A clearer view of your bets</h3><p>Track your positions and claim your winnings from one wallet.</p><button className="secondary full" onClick={() => setWalletOpen(true)}>Connect wallet<Icon name="wallet" size={16}/></button></>}</section>
          <section className="guide-panel"><h2>Make your first prediction</h2><ol><li><span>1</span><div><strong>Pick a market</strong><p>Choose Yes or No on a Squeek block question.</p></div></li><li><span>2</span><div><strong>Back your side</strong><p>Enter test ETH and confirm in your wallet.</p></div></li><li><span>3</span><div><strong>Claim the outcome</strong><p>Winners share the pool after on-chain settlement.</p></div></li></ol><button className="text-button" onClick={() => setHelpOpen(true)}>How it works<Icon name="arrow" size={15}/></button></section>
          <div className="core-note"><Icon name="wheel" size={22}/><div><strong>Powered by Squeekchain</strong><p>{data?.coreState ? <><span className="num">{data.coreState.blockHeight.toLocaleString()}</span> settled Squeek blocks</> : 'Resolved from official settled block data.'}</p><a href={`${EXPLORER}/address/${PREDICT_ADDRESS}`} target="_blank" rel="noreferrer">View market contract<Icon name="external" size={13}/></a></div></div>
        </aside>
      </div>
    </main>

    <footer className="site-footer"><div><a className="footer-brand" href="#markets">Squeek Predict</a><span>Predictions, settled on-chain.</span></div><p>Made by <a href="https://x.com/squeektoshi" target="_blank" rel="noreferrer">@squeektoshi</a> <a href="https://x.com/pillheadddd" target="_blank" rel="noreferrer">@pillheadddd</a> <a href="https://x.com/le_chien65760" target="_blank" rel="noreferrer">@le_chien65760</a> on <a href="https://x.com/squeekchain" target="_blank" rel="noreferrer">@squeekchain</a></p><div className="footer-links"><button className="text-button" onClick={() => setHelpOpen(true)}>Market guide</button><a href={EXPLORER} target="_blank" rel="noreferrer">Sepolia explorer<Icon name="external" size={13}/></a></div></footer>

    {selectedMarket && selected && <MarketDialog key={String(selected.id)} market={selectedMarket} position={positionOf(selectedMarket)} yes={selected.yes} now={now} settled={settled} ready={ready} tx={tx} transact={transact} onClose={() => setSelected(undefined)} onConnect={() => setWalletOpen(true)} onReset={resetTx}/>}
    {creation && <CreateDialog preset={creation} snapshot={data} now={now} ready={ready} tx={tx} transact={transact} onClose={() => setCreation(undefined)} onConnect={() => setWalletOpen(true)} onReset={resetTx}/>}
    {helpOpen && <Modal title="How Squeek Predict works" onClose={() => setHelpOpen(false)} className="help-modal"><p>Predict whether the hamster will complete more than a chosen number of Squeek blocks in 24 hours or 7 days.</p><ol className="help-steps"><li><strong>Choose Yes or No.</strong> Yes wins only if the final completed-block count is strictly greater than the target. Exactly the target settles as No.</li><li><strong>Stake Sepolia test ETH.</strong> Minimum 0.0001 ETH, plus gas. Bets are final and you can lose your stake. There is no trading or cashing out early.</li><li><strong>Wait for the official result.</strong> Betting closes when the measurement window starts. SqueekCore certifies the result; certification can lag by days.</li><li><strong>Claim from My positions.</strong> Winners share the full pool in proportion to their winning stakes. There is no platform fee. One-sided markets can be refunded after betting closes. Unresolved markets allow refunds after the 30-day grace period.</li></ol><p className="small muted">Percentages are each side’s share of the pool. Empty pools start at 50/50. Payout estimates can change before betting closes. Only completed blocks count, not physical wheel turns.</p><a className="button secondary full" href="https://cloud.google.com/application/web3/faucet/ethereum/sepolia" target="_blank" rel="noreferrer">Get Sepolia test ETH<Icon name="external" size={16}/></a><button className="primary full" onClick={() => setHelpOpen(false)}>Explore markets<Icon name="arrow" size={17}/></button></Modal>}
  </>;
}
