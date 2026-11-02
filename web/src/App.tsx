import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useConnection } from 'wagmi';
import { getWalletClient } from 'wagmi/actions';
import { getAddress, type Abi } from 'viem';
import { config, chain, publicClient, PREDICT_ADDRESS, EXPLORER } from './config';
import { predictAbi } from './predictAbi';
import { readSnapshot, verifyContract, type Action } from './data';
import { DAY, WEEK, eth, friendlyError, phase, thresholdValue, type Market } from './model';
import { Hamster, Icon } from './icons';
import { Wallet } from './Wallet';
import { Modal } from './Modal';
import { MarketCard } from './MarketCard';
import { MarketDialog, TransactionNotice, type TxState } from './MarketDialog';
import { CreateDialog, type Preset } from './CreateDialog';

type Tab = 'markets' | 'positions';
const presets: (Preset & { name: string; note: string })[] = [
  { threshold: '1000', duration: DAY, name: 'The daily thousand', note: 'More than 1,000 blocks in 24 hours' },
  { threshold: '2000', duration: DAY, name: 'An extra lap', note: 'More than 2,000 blocks in 24 hours' },
  { threshold: '10000', duration: WEEK, name: 'The long run', note: 'More than 10,000 blocks in 7 days' },
];
const idleTx: TxState = { stage: 'idle', message: '' };
export default function App() {
  const { address, chainId, isConnected } = useConnection();
  const [tab, setTab] = useState<Tab>(location.hash === '#positions' ? 'positions' : 'markets');
  const [filter, setFilter] = useState('all');
  const [durationFilter, setDurationFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(20);
  const [lookup, setLookup] = useState<bigint>();
  const [lookupText, setLookupText] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [walletOpen, setWalletOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [selected, setSelected] = useState<{ id: bigint; yes?: boolean }>();
  const [creation, setCreation] = useState<Preset>();
  const [tx, setTx] = useState<TxState>(idleTx);
  const lock = useRef(false);
  const [tick, setTick] = useState(Date.now());
  const query = useQuery({ queryKey: ['markets', address, limit, lookup?.toString()], queryFn: () => readSnapshot(address, limit, lookup), retry: false, refetchInterval: 30000, refetchOnWindowFocus: true });
  const data = query.data;
  const now = data ? data.timestamp + BigInt(Math.max(0, Math.floor((tick - data.fetchedAt) / 1000))) : BigInt(Math.floor(tick / 1000));
  const ready = Boolean(data && !query.isError);
  const busy = ['checking', 'wallet', 'pending'].includes(tx.stage);
  useEffect(() => { const timer = setInterval(() => setTick(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const onHash = () => { setTab(location.hash === '#positions' ? 'positions' : 'markets'); setFilter('all'); };
    addEventListener('hashchange', onHash); return () => removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => { if (isConnected) setWalletOpen(false); }, [isConnected]);
  useEffect(() => { setSelected(undefined); setCreation(undefined); }, [address]);
  function resetTx() { if (!lock.current) setTx(idleTx); }
  function openMarket(m: Market, yes?: boolean) { resetTx(); setSelected({ id: m.id, yes }); }
  function openCreate(preset = presets[0]) { resetTx(); setCreation(preset); }
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
  const markets = data?.markets ?? [];
  const visible = markets.filter(m => {
    const p = data?.positions[String(m.id)];
    if (tab === 'positions' && (!p || p.yes + p.no === 0n)) return false;
    if (filter === 'open' && phase(m, now, data?.coreState?.settledThroughRound) !== 'Open for bets') return false;
    if (filter === 'settled' && m.status === 0) return false;
    if (filter === 'claimable' && (!p || p.claimable === 0n)) return false;
    if (durationFilter !== 'all' && m.endsAt - m.startsAt !== BigInt(durationFilter)) return false;
    if (lookup && search === String(lookup)) return m.id === lookup;
    return !search || `${m.threshold} ${m.id} ${m.endsAt - m.startsAt === BigInt(DAY) ? '24 hours' : '7 days'}`.includes(search.toLowerCase().replace(/,/g, ''));
  }).sort((a, b) => {
    const priority = (m: Market) => tab === 'positions' && (data?.positions[String(m.id)]?.claimable ?? 0n) > 0n ? 0 : phase(m, now, data?.coreState?.settledThroughRound) === 'Open for bets' ? 1 : 2;
    return priority(a) - priority(b) || (a.id === b.id ? 0 : a.id > b.id ? -1 : 1);
  });
  const totalPool = markets.reduce((sum, m) => sum + m.yesPool + m.noPool, 0n);
  const claimable = Object.values(data?.positions ?? {}).reduce((sum, p) => sum + p.claimable, 0n);
  const selectedMarket = markets.find(m => m.id === selected?.id);
  return <>
    <a className="skip-link" href="#main">Skip to markets</a>
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{tx.stage === 'error' ? '' : tx.message}</div>
    <header className="site-header"><div className="header-inner">
      <a className="brand" href="#markets" aria-label="Squeek Predict home"><img src="./favicon.svg" width="38" height="38" alt=""/><span>Squeek<span className="brand-light">Predict</span></span></a>
      <nav aria-label="Main navigation"><a href="#markets" className={tab === 'markets' ? 'active' : ''} aria-current={tab === 'markets' ? 'page' : undefined}>Markets</a><a href="#positions" className={tab === 'positions' ? 'active' : ''} aria-current={tab === 'positions' ? 'page' : undefined}>My positions</a></nav>
      <div className="header-actions"><button className="help-button" onClick={() => setHelpOpen(true)}><Icon name="info" size={18}/><span>How it works</span></button><Wallet open={walletOpen} setOpen={setWalletOpen}/></div>
    </div></header>
    <main id="main" className="page-wrap" tabIndex={-1}>
      <section className="intro" aria-labelledby="intro-title"><div className="intro-copy"><h1 id="intro-title">Bet on the next turn.</h1><p>Predict real Squeekchain activity.</p><div className="intro-note"><span className="network-dot"/>Sepolia testnet<span className="note-divider"/>Test ETH only</div></div><Hamster className="hero-hamster"/><div className="core-stat"><span className="core-stat-label"><Icon name="wheel" size={18}/>Official Squeek blocks</span><strong>{data?.coreState ? data.coreState.blockHeight.toLocaleString() : 'Not available'}</strong><span className="caption muted">{data?.coreState ? data.coreState.paused ? 'Core is paused' : 'Latest settled count' : 'Waiting for chain data'}</span></div></section>
      <div className="mobile-nav" role="navigation" aria-label="Mobile navigation"><a href="#markets" className={tab === 'markets' ? 'active' : ''}>Markets</a><a href="#positions" className={tab === 'positions' ? 'active' : ''}>My positions</a><button onClick={() => setHelpOpen(true)} aria-label="How it works"><Icon name="info" size={19}/></button></div>
      <div className="section-heading"><div><h2>{tab === 'markets' ? 'Prediction markets' : 'My positions'}</h2><p className="muted">{tab === 'markets' ? 'Pick a question. Choose a side.' : 'Track your bets and collect your winnings.'}</p></div><button className="primary create-button" aria-label="Create market" onClick={() => openCreate()} disabled={busy}><Icon name="plus" size={18}/><span>Create<span className="desktop-label"> market</span></span></button></div>
      <div className="filter-bar"><div className="filter-group" aria-label="Market status">{(tab === 'markets' ? [['all', 'All markets'], ['open', 'Open'], ['settled', 'Settled']] : [['all', 'All positions'], ['claimable', 'To claim'], ['settled', 'Settled']]).map(([value, label]) => <button key={value} className={filter === value ? 'filter active' : 'filter'} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div><div className="filter-tools"><label className="search-field"><Icon name="search" size={17}/><input type="search" aria-label="Search by block target or market ID" placeholder="Search markets" value={search} onChange={e => setSearch(e.target.value)}/></label><select aria-label="Activity window" value={durationFilter} onChange={e => setDurationFilter(e.target.value)}><option value="all">All windows</option><option value={DAY}>24 hours</option><option value={WEEK}>7 days</option></select></div></div>
      <div className="chain-status"><span className={query.isError ? 'connection-error' : 'muted'}><span className={`status-dot ${ready ? 'connected-dot' : ''}`}/>{query.isError ? data ? 'Connection interrupted · showing last read' : 'Sepolia connection unavailable' : data ? `Block ${data.blockNumber.toLocaleString()} · refreshes every 30s` : 'Connecting to Sepolia…'}</span><button className="refresh-button" onClick={() => void query.refetch()} disabled={query.isFetching} aria-label="Refresh markets"><Icon name="refresh" size={15}/>{query.isFetching ? 'Refreshing…' : 'Refresh'}</button></div>
      {tx.stage !== 'idle' && !selected && !creation && <TransactionNotice tx={tx}/>}
      {query.isError && <div className="connection-notice" role="status"><Icon name="info"/><div><strong>{query.error instanceof Error && query.error.message.includes('verification failed') ? 'Contract verification failed' : 'Couldn’t load fresh market data'}</strong><p>Retry the connection. You can explore market options or connect your wallet while Sepolia is unavailable.</p></div><button className="secondary" onClick={() => void query.refetch()} disabled={query.isFetching}>{query.isFetching ? 'Retrying…' : 'Retry connection'}</button></div>}
      {tab === 'positions' && !address ? <section className="empty-state"><div className="empty-icon"><Icon name="wallet" size={28}/></div><h3>Your predictions live here.</h3><p>Connect your wallet to see your stakes and claim winnings.</p><button className="primary" onClick={() => setWalletOpen(true)}>Connect wallet<Icon name="arrow" size={18}/></button></section> : query.isPending ? <div className="loading-markets" role="status"><Icon name="wheel" size={28}/><span>Reading prediction markets…</span></div> : visible.length > 0 ? <div className="market-grid">{visible.map(m => <MarketCard key={String(m.id)} market={m} position={data?.positions[String(m.id)]} now={now} settled={data?.coreState?.settledThroughRound} onOpen={openMarket}/>)}</div> : data ? <section className="empty-state"><div className="empty-icon"><Icon name={tab === 'positions' ? 'chart' : 'wheel'} size={28}/></div><h3>{search || filter !== 'all' || durationFilter !== 'all' ? 'No matching markets' : tab === 'positions' ? 'No bets in these markets yet' : 'The next prediction starts with you.'}</h3><p>{search || filter !== 'all' || durationFilter !== 'all' ? 'Try another target or reset your filters.' : tab === 'positions' ? 'Explore the markets, then choose your side.' : 'Create a 24-hour or 7-day market for everyone to join.'}</p>{search || filter !== 'all' || durationFilter !== 'all' ? <button className="secondary" onClick={() => { setFilter('all'); setDurationFilter('all'); setSearch(''); }}>Reset filters</button> : tab === 'positions' ? <a className="button secondary" href="#markets">Explore markets<Icon name="arrow" size={18}/></a> : <button className="secondary" onClick={() => openCreate()}>Create the first market<Icon name="arrow" size={18}/></button>}</section> : null}
      {data && data.count > BigInt(Math.min(limit, markets.length)) && <div className="load-more"><button className="secondary" onClick={() => setLimit(n => n + 20)} disabled={query.isFetching}>{query.isFetching ? 'Loading…' : 'Load older markets'}</button><span className="caption muted">{Math.min(limit, markets.length)} of {String(data.count)} markets loaded</span></div>}
      {tab === 'markets' && <section className="templates" aria-labelledby="templates-title"><div className="template-heading"><h2 id="templates-title">Start the next prediction</h2><span className="caption muted">Market ideas, ready to create</span></div><div className="template-grid">{presets.map((p, i) => <button className="template" key={p.name} onClick={() => openCreate(p)} disabled={busy}><div className={`template-icon template-icon-${i}`}><Icon name={i === 2 ? 'chart' : 'wheel'} size={25}/></div><span className="template-text"><strong>{p.name}</strong><span>{p.note}</span></span><Icon name="plus" size={20}/></button>)}</div><p className="caption muted template-note">These are starting points, not active markets. You can change the target before creating.</p></section>}
      {data && <div className="market-summary"><span>{markets.length} loaded markets · {eth(totalPool)} ETH in original pools</span>{address && <span>{eth(claimable)} ETH available to claim in loaded markets</span>}</div>}
      <details className="find-market"><summary>Find an older market by ID</summary><form onSubmit={e => { e.preventDefault(); setLookupError(''); try { const id = thresholdValue(lookupText); if (id < 1n || data && id > data.count) throw new Error('Enter an existing market ID, starting at 1.'); setLookup(id); setSearch(lookupText); setTab('markets'); location.hash = 'markets'; setFilter('all'); setDurationFilter('all'); } catch (error) { setLookupError((error as Error).message); } }}><label htmlFor="market-id">Market ID</label><div className="find-controls"><input className="text-input" id="market-id" name="market-id" inputMode="numeric" value={lookupText} onChange={e => setLookupText(e.target.value)} placeholder="e.g. 1" aria-describedby="lookup-error" aria-invalid={Boolean(lookupError)}/><button type="submit" className="secondary">Find market</button></div><p id="lookup-error" role="alert" className="inline-error">{lookupError}</p></form></details>
      <aside className="how-strip"><Icon name="info" size={22}/><p>Real wheel work. Settled on-chain.<span>Markets use official SqueekCore blocks, not raw wheel revolutions.</span></p><button onClick={() => setHelpOpen(true)}>How it works<Icon name="arrow" size={16}/></button></aside>
    </main>
    <footer className="site-footer"><div><a className="footer-brand" href="#markets">Squeek Predict</a><span>A little wheel. A lot of possibility.</span></div><div><a href={`${EXPLORER}/address/${PREDICT_ADDRESS}`} target="_blank" rel="noreferrer">View contract<Icon name="external" size={14}/></a><a href="https://cloud.google.com/application/web3/faucet/ethereum/sepolia" target="_blank" rel="noreferrer">Get test ETH<Icon name="external" size={14}/></a><span>Community project · Sepolia</span></div></footer>
    {selected && selectedMarket && <MarketDialog market={selectedMarket} position={data?.positions[String(selected.id)]} yes={selected.yes} now={now} settled={data?.coreState?.settledThroughRound} ready={ready} tx={tx} transact={transact} onClose={() => setSelected(undefined)} onConnect={() => setWalletOpen(true)} onReset={resetTx}/>}
    {creation && <CreateDialog preset={creation} snapshot={data} now={now} ready={ready} tx={tx} transact={transact} onClose={() => setCreation(undefined)} onConnect={() => setWalletOpen(true)} onReset={resetTx}/>}
    {helpOpen && <Modal title="A small guide to Squeek" onClose={() => setHelpOpen(false)}><div className="help-steps"><section><span>1</span><div><h3>Pick a prediction</h3><p>Choose whether the hamster will complete more than a block target over 24 hours or 7 days. A Squeek block represents settled work from the wheel.</p></div></section><section><span>2</span><div><h3>Back your side</h3><p>Bet yes or no with Sepolia test ETH before the activity window starts. Minimum 0.0001 ETH. Each side holds up to 100 ETH. A bet cannot be withdrawn.</p></div></section><section><span>3</span><div><h3>Let the wheel decide</h3><p>After the window, anyone can resolve using SqueekCore’s certified data. Exactly the target means no. Certification can be delayed.</p></div></section><section><span>4</span><div><h3>Claim your share</h3><p>Winners split the full pool in proportion to their winning stakes, with no platform fee. Open My positions to claim. If one side is empty, or resolution takes over 30 days, anyone can open refunds.</p></div></section></div><p className="caption muted">This is a community testnet project. Use test ETH only. Network gas applies to creating, betting, resolving, refunding, and claiming. No automated settlement or guaranteed payout.</p><button className="primary full" onClick={() => setHelpOpen(false)}>Explore predictions<Icon name="arrow" size={18}/></button></Modal>}
  </>;
}
