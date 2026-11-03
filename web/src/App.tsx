import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useConnection } from 'wagmi';
import { getWalletClient } from 'wagmi/actions';
import { getAddress, type Abi } from 'viem';
import { config, chain, publicClient, PREDICT_ADDRESS, EXPLORER } from './config';
import { predictAbi } from './predictAbi';
import { readSnapshot, verifyContract, type Action } from './data';
import { DAY, KINDS, WEEK, eth, friendlyError, kind, line, phase, thresholdValue, title, type Market } from './model';
import { Icon } from './icons';
import { Wallet } from './Wallet';
import { Modal } from './Modal';
import { MarketCard, SkeletonCard } from './MarketCard';
import { MarketDialog, TransactionNotice, type TxState } from './MarketDialog';
import { CreateDialog, type Preset } from './CreateDialog';
import { WheelPanel, WheelPulse } from './WheelPanel';
import { useWheelStats } from './useStats';

type Tab = 'markets' | 'positions';
type IconName = Parameters<typeof Icon>[0]['name'];
const idleTx: TxState = { stage: 'idle', message: '' };
const tabFromHash = (): Tab => location.hash === '#positions' ? 'positions' : 'markets';
const round10 = (n: number) => Math.max(10, Math.round(n / 10) * 10);

export default function App() {
  const { address, chainId, isConnected } = useConnection();
  const [tab, setTab] = useState<Tab>(tabFromHash());
  const [filter, setFilter] = useState('all');
  const [durationFilter, setDurationFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState('all');
  const [sort, setSort] = useState('closing');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(30);
  const [lookup, setLookup] = useState<bigint>();
  const [lookupText, setLookupText] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [walletOpen, setWalletOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [selected, setSelected] = useState<{ id: bigint; yes?: boolean }>();
  const [creation, setCreation] = useState<Preset>();
  const [tx, setTx] = useState<TxState>(idleTx);
  const [claiming, setClaiming] = useState<bigint>();
  const lock = useRef(false);
  const [tick, setTick] = useState(Date.now());
  const query = useQuery({ queryKey: ['markets', address, limit, lookup?.toString()], queryFn: () => readSnapshot(address, limit, lookup), retry: false, refetchInterval: 30000, refetchOnWindowFocus: true });
  const data = query.data;
  const statsQuery = useWheelStats(data);
  const stats = statsQuery.data;
  const best24 = stats?.best24;
  const now = data ? data.timestamp + BigInt(Math.max(0, Math.floor((tick - data.fetchedAt) / 1000))) : BigInt(Math.floor(tick / 1000));
  const ready = Boolean(data && !query.isError);
  const busy = ['checking', 'wallet', 'pending'].includes(tx.stage);
  const settled = data?.coreState?.settledThroughRound;
  useEffect(() => { const timer = setInterval(() => setTick(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const onHash = () => { if (location.hash === '#wheel') return; setTab(tabFromHash()); setFilter('all'); };
    addEventListener('hashchange', onHash); return () => removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => { if (isConnected) setWalletOpen(false); }, [isConnected]);
  useEffect(() => { setSelected(undefined); setCreation(undefined); }, [address]);

  const templates = useMemo(() => {
    const avg = stats?.average24 ?? 1000;
    const best = stats?.best24 ?? 2000;
    const week = stats?.total7d ?? 7000;
    const list: (Preset & { name: string; note: string; icon: IconName })[] = [
      { name: 'Daily line', note: `Over or under ${line(BigInt(round10(avg)))} blocks in 24 hours`, threshold: String(round10(avg)), duration: DAY, icon: 'wheel' },
      { name: 'Wake-up call', note: 'Will the hamster complete a block in 24 hours?', threshold: '0', duration: DAY, icon: 'bolt' },
      { name: 'Record attempt', note: `Beat this week’s best day of ${best.toLocaleString()} blocks`, threshold: String(best), duration: DAY, icon: 'trophy' },
      { name: 'Night shift', note: '24 hours from 18:00, line set above average', threshold: String(round10(avg * 1.25)), duration: DAY, start: 'evening', icon: 'moon' },
      { name: 'Weekly line', note: `Over or under ${line(BigInt(Math.max(50, Math.round(week / 50) * 50)))} blocks in 7 days`, threshold: String(Math.max(50, Math.round(week / 50) * 50)), duration: WEEK, icon: 'chart' },
      { name: 'Custom window', note: 'Your own line and start time', threshold: String(round10(avg)), duration: DAY, start: 'custom', icon: 'plus' },
    ];
    return list;
  }, [stats]);

  function resetTx() { if (!lock.current) setTx(idleTx); }
  function openMarket(m: Market, yes?: boolean) { resetTx(); setSelected({ id: m.id, yes }); }
  function openCreate(preset: Preset = templates[0]) { resetTx(); setCreation(preset); }
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
  const filtering = Boolean(search || filter !== 'all' || durationFilter !== 'all' || kindFilter !== 'all');
  const visible = markets.filter(m => {
    const p = positionOf(m);
    const s = statusOf(m);
    if (tab === 'positions' && (!p || p.yes + p.no === 0n)) return false;
    if (filter === 'open' && s !== 'Open for bets') return false;
    if (filter === 'live' && !['In progress', 'Awaiting settlement', 'Ready to resolve', 'Refund available'].includes(s)) return false;
    if (filter === 'settled' && m.status === 0) return false;
    if (filter === 'claimable' && (!p || p.claimable === 0n)) return false;
    if (durationFilter !== 'all' && m.endsAt - m.startsAt !== BigInt(durationFilter)) return false;
    if (kindFilter !== 'all' && kind(m, best24) !== kindFilter) return false;
    if (lookup && search === String(lookup)) return m.id === lookup;
    const q = search.toLowerCase().replace(/,/g, '').replace(/^#/, '').trim();
    return !q || `${m.threshold} ${m.id} ${title(m, best24).toLowerCase().replace(/,/g, '')}`.includes(q);
  }).sort((a, b) => {
    const rank = (m: Market) => tab === 'positions' && (positionOf(m)?.claimable ?? 0n) > 0n ? 0 : statusOf(m) === 'Open for bets' ? 1 : m.status === 0 ? 2 : 3;
    const byRank = rank(a) - rank(b);
    if (sort === 'pool') { const d = (b.yesPool + b.noPool) - (a.yesPool + a.noPool); return d > 0n ? 1 : d < 0n ? -1 : byRank; }
    if (sort === 'newest') return a.id === b.id ? 0 : a.id > b.id ? -1 : 1;
    return byRank || (a.startsAt === b.startsAt ? 0 : a.startsAt < b.startsAt ? -1 : 1);
  });
  const openCount = markets.filter(m => statusOf(m) === 'Open for bets').length;
  const totalPool = markets.reduce((sum, m) => sum + m.yesPool + m.noPool, 0n);
  const positions = Object.values(data?.positions ?? {});
  const claimableTotal = positions.reduce((sum, p) => sum + p.claimable, 0n);
  const stakedTotal = positions.reduce((sum, p) => sum + p.yes + p.no, 0n);
  const toClaim = markets.filter(m => (positionOf(m)?.claimable ?? 0n) > 0n);
  const selectedMarket = markets.find(m => m.id === selected?.id);
  const resetFilters = () => { setFilter('all'); setDurationFilter('all'); setKindFilter('all'); setSearch(''); };
  const nowSeconds = Number(now);
  const statusFilters = tab === 'markets' ? [['all', 'All'], ['open', 'Open'], ['live', 'In play'], ['settled', 'Settled']] : [['all', 'All bets'], ['claimable', 'To claim'], ['open', 'Open'], ['settled', 'Settled']];

  return <>
    <a className="skip-link" href="#main">Skip to markets</a>
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{tx.stage === 'error' ? '' : tx.message}</div>
    <header className="site-header"><div className="header-inner">
      <a className="brand" href="#markets" aria-label="Squeek Predict home"><img src="./favicon.svg" width="34" height="34" alt=""/><span>Squeek <span className="brand-accent">Predict</span></span></a>
      <nav className="main-nav" aria-label="Main navigation">
        <a href="#markets" aria-current={tab === 'markets' ? 'page' : undefined}>Markets</a>
        <a href="#positions" aria-current={tab === 'positions' ? 'page' : undefined}>My bets{claimableTotal > 0n && <span className="nav-badge" aria-label="winnings to claim">{toClaim.length}</span>}</a>
        <a href="#wheel">Wheel form</a>
      </nav>
      <div className="header-actions"><button className="ghost help-button" onClick={() => setHelpOpen(true)}><Icon name="info" size={18}/><span>How it works</span></button><Wallet open={walletOpen} setOpen={setWalletOpen}/></div>
    </div></header>

    <main id="main" className="page" tabIndex={-1}>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title">Bet on the hamster’s wheel.</h1>
          <p className="lead">Over/under markets on real Squeekchain blocks, settled on-chain with Sepolia test ETH.</p>
          <div className="hero-actions">
            <button className="primary" onClick={() => openCreate()} disabled={busy}><Icon name="plus" size={18}/>Create market</button>
            <button className="secondary" onClick={() => setHelpOpen(true)}>How it works</button>
          </div>
        </div>
        <WheelPulse stats={stats} height={data?.coreState?.blockHeight} loading={statsQuery.isLoading || query.isPending} now={nowSeconds}/>
      </section>

      <div className="tabbar" role="navigation" aria-label="Sections">
        <a href="#markets" aria-current={tab === 'markets' ? 'page' : undefined}>Markets</a>
        <a href="#positions" aria-current={tab === 'positions' ? 'page' : undefined}>My bets{toClaim.length > 0 && <span className="num"> ({toClaim.length} to claim)</span>}</a>
      </div>

      <div className="layout">
        <div className="board">
          <div className="board-head">
            <div><h2>{tab === 'markets' ? 'Markets' : 'My bets'}</h2><p className="muted small">{tab === 'markets' ? data ? `${openCount} open · ${eth(totalPool)} ETH in pools` : 'Reading SqueekPredict on Sepolia' : 'Your stakes, results and payouts'}</p></div>
            <button className="icon-button refresh" onClick={() => { void query.refetch(); void statsQuery.refetch(); }} disabled={query.isFetching} aria-label="Refresh markets"><Icon name="refresh" size={18} className={query.isFetching ? 'spin-once' : ''}/></button>
          </div>

          {tab === 'positions' && address && data && <div className="summary">
            <div><span className="muted small">Staked in loaded markets</span><strong className="num">{eth(stakedTotal)} ETH</strong></div>
            <div><span className="muted small">Ready to claim</span><strong className={`num ${claimableTotal > 0n ? 'gain' : ''}`}>{eth(claimableTotal)} ETH</strong></div>
          </div>}
          {tab === 'positions' && toClaim.length > 0 && <section className="claim-list" aria-labelledby="claim-title">
            <h3 id="claim-title">Ready to claim</h3>
            <ul>{toClaim.map(m => <li key={String(m.id)}><span className="claim-name"><strong>{title(m, best24)}</strong><span className="muted small">Market #{m.id.toString()} · {m.status === 2 ? 'Refund' : 'Winnings'}</span></span><strong className="num gain">{eth(positionOf(m)!.claimable)} ETH</strong><button className="primary" onClick={() => void quickClaim(m)} disabled={busy || !ready || chainId !== chain.id}>{claiming === m.id && busy ? 'Claiming…' : 'Claim'}</button></li>)}</ul>
            <p className="muted small">Claims pay this wallet. To send a payout elsewhere, open the market.</p>
          </section>}

          <div className="filters">
            <div className="chip-row" role="group" aria-label="Market status">{statusFilters.map(([value, label]) => <button key={value} className={filter === value ? 'chip active' : 'chip'} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
            <div className="filter-tools">
              <label className="search-field"><Icon name="search" size={17}/><input type="search" aria-label="Search by line or market number" placeholder="Search line or #" value={search} onChange={e => setSearch(e.target.value)}/></label>
              <select aria-label="Window length" value={durationFilter} onChange={e => setDurationFilter(e.target.value)}><option value="all">Any length</option><option value={DAY}>24 hours</option><option value={WEEK}>7 days</option></select>
              <select aria-label="Market type" value={kindFilter} onChange={e => setKindFilter(e.target.value)}><option value="all">All types</option>{KINDS.map(k => <option key={k} value={k}>{k}</option>)}</select>
              <select aria-label="Sort markets" value={sort} onChange={e => setSort(e.target.value)}><option value="closing">Closing soon</option><option value="pool">Biggest pool</option><option value="newest">Newest</option></select>
            </div>
          </div>

          {tx.stage !== 'idle' && !selected && !creation && <TransactionNotice tx={tx}/>}
          {query.isError && <div className="notice" role="status"><Icon name="info"/><div><strong>{query.error instanceof Error && query.error.message.includes('verification failed') ? 'Contract verification failed' : 'Couldn’t load fresh market data'}</strong><p className="small muted">{data ? 'Showing the last successful read.' : 'Sepolia is not answering right now.'} Retry, or explore market ideas below.</p></div><button className="secondary" onClick={() => void query.refetch()} disabled={query.isFetching}>{query.isFetching ? 'Retrying…' : 'Retry'}</button></div>}

          {tab === 'positions' && !address ? <section className="empty"><div className="empty-icon"><Icon name="ticket" size={28}/></div><h3>Your bets live here.</h3><p className="muted">Connect a wallet to see stakes, results and payouts.</p><button className="primary" onClick={() => setWalletOpen(true)}>Connect wallet<Icon name="arrow" size={18}/></button></section>
            : query.isPending ? <div className="market-grid" role="status" aria-label="Loading markets"><SkeletonCard/><SkeletonCard/><SkeletonCard/><span className="sr-only">Reading prediction markets…</span></div>
            : visible.length > 0 ? <div className="market-grid">{visible.map(m => <MarketCard key={String(m.id)} market={m} position={positionOf(m)} now={now} settled={settled} best24={best24} onOpen={openMarket}/>)}</div>
            : data ? <section className="empty"><div className="empty-icon"><Icon name={tab === 'positions' ? 'ticket' : 'wheel'} size={28}/></div>
              <h3>{filtering ? 'No markets match' : tab === 'positions' ? 'No bets yet' : 'No markets yet. Open the first line.'}</h3>
              <p className="muted">{filtering ? 'Try another line or clear the filters.' : tab === 'positions' ? 'Pick a market and take a side.' : 'Pick a market idea below or set your own line.'}</p>
              {filtering ? <button className="secondary" onClick={resetFilters}>Clear filters</button> : tab === 'positions' ? <a className="button secondary" href="#markets">Browse markets<Icon name="arrow" size={18}/></a> : <button className="primary" onClick={() => openCreate()}>Create market<Icon name="arrow" size={18}/></button>}
            </section> : null}

          {data && data.count > BigInt(Math.min(limit, markets.length)) && <div className="load-more"><button className="secondary" onClick={() => setLimit(n => n + 30)} disabled={query.isFetching}>{query.isFetching ? 'Loading…' : 'Load older markets'}</button><span className="small muted">{Math.min(limit, markets.length)} of {String(data.count)} loaded</span></div>}

          {tab === 'markets' && <section className="ideas" aria-labelledby="ideas-title">
            <div className="ideas-head"><h2 id="ideas-title">Start a market</h2><p className="muted small">{stats ? 'Lines suggested from the last 7 certified days.' : 'Suggested lines. Edit before creating.'}</p></div>
            <div className="idea-grid">{templates.map(t => <button className="idea" key={t.name} onClick={() => openCreate(t)} disabled={busy}><span className="idea-icon"><Icon name={t.icon} size={22}/></span><span className="idea-text"><strong>{t.name}</strong><span className="muted small">{t.note}</span></span><Icon name="chevron" size={18}/></button>)}</div>
          </section>}

          <details className="find-market"><summary>Find an older market by number</summary><form onSubmit={e => { e.preventDefault(); setLookupError(''); try { const id = thresholdValue(lookupText); if (id < 1n || data && id > data.count) throw new Error('Enter an existing market number, starting at 1.'); setLookup(id); setSearch(lookupText); location.hash = 'markets'; setTab('markets'); setFilter('all'); setDurationFilter('all'); setKindFilter('all'); } catch (error) { setLookupError((error as Error).message); } }}><label htmlFor="market-id" className="field-label">Market number</label><div className="find-controls"><input className="text-input" id="market-id" name="market-id" inputMode="numeric" value={lookupText} onChange={e => setLookupText(e.target.value)} placeholder="e.g. 1" aria-describedby="lookup-error" aria-invalid={Boolean(lookupError)}/><button type="submit" className="secondary">Find</button></div><p id="lookup-error" role="alert" className="inline-error">{lookupError}</p></form></details>
        </div>

        <aside className="side">
          <WheelPanel stats={stats} error={statsQuery.isError} loading={statsQuery.isLoading || query.isPending} height={data?.coreState?.blockHeight} now={nowSeconds} onRetry={() => void statsQuery.refetch()}/>
          <div className="chain-status small"><span className={`status-dot ${ready ? 'ok' : query.isError ? 'bad' : ''}`}/>{query.isError ? data ? 'Connection interrupted, showing last read' : 'Sepolia unavailable' : data ? <>Sepolia block <span className="num">{data.blockNumber.toLocaleString()}</span>, refreshes every 30s</> : 'Connecting to Sepolia…'}</div>
        </aside>
      </div>
    </main>

    <footer className="site-footer"><div className="footer-inner">
      <span><strong>Squeek Predict</strong> <span className="muted">· a community testnet market on Squeekchain data</span></span>
      <span className="footer-links"><a href={`${EXPLORER}/address/${PREDICT_ADDRESS}`} target="_blank" rel="noreferrer">Contract<Icon name="external" size={14}/></a><a href="https://cloud.google.com/application/web3/faucet/ethereum/sepolia" target="_blank" rel="noreferrer">Get test ETH<Icon name="external" size={14}/></a></span>
    </div></footer>

    {selected && selectedMarket && <MarketDialog market={selectedMarket} position={positionOf(selectedMarket)} yes={selected.yes} now={now} settled={settled} best24={best24} ready={ready} tx={tx} transact={transact} onClose={() => setSelected(undefined)} onConnect={() => setWalletOpen(true)} onReset={resetTx}/>}
    {creation && <CreateDialog preset={creation} snapshot={data} now={now} ready={ready} tx={tx} transact={transact} onClose={() => setCreation(undefined)} onConnect={() => setWalletOpen(true)} onReset={resetTx}/>}
    {helpOpen && <Modal title="How Squeek Predict works" onClose={() => setHelpOpen(false)}><ol className="help-steps">
      <li><h3>Pick a line</h3><p className="muted">Each market asks whether the hamster completes more than a set number of Squeek blocks in a 24-hour or 7-day window. Over 1,000.5 means 1,001 or more; exactly 1,000 settles as under.</p></li>
      <li><h3>Take a side</h3><p className="muted">Stake Sepolia test ETH before the window starts. Minimum 0.0001 ETH, up to 100 ETH per side. Bets are final.</p></li>
      <li><h3>Read the odds</h3><p className="muted">Odds are pool-based: total pool divided by your side’s pool. They move as people bet and lock when the window starts. No platform fee.</p></li>
      <li><h3>Settle and claim</h3><p className="muted">Once SqueekCore certifies the window, anyone can resolve it. Winners claim from My bets. One-sided markets, and markets unresolved 30 days after the window, are refunded.</p></li>
    </ol><p className="small muted">Certification can run days behind real time, so results can take a while. Use test ETH only; gas applies to every action.</p><button className="primary full" onClick={() => setHelpOpen(false)}>Got it</button></Modal>}
  </>;
}
