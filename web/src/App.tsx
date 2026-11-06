import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import { getWalletClient } from "wagmi/actions";
import { getAddress, type Abi } from "viem";
import {
  config,
  chain,
  publicClient,
  PREDICT_ADDRESS,
  EXPLORER,
} from "./config";
import { predictAbi } from "./predictAbi";
import {
  readSnapshot,
  readPracticeResults,
  verifyContract,
  type Action,
} from "./data";
import {
  eth,
  friendlyError,
  phase,
  percentLabel,
  poolPercent,
  timeLeft,
  title,
  type Market,
} from "./model";
import {
  CATEGORIES,
  TEMPLATES,
  PRACTICE_STORE,
  emptyBook,
  parseBook,
  placePractice,
  practicePools,
  templateMarket,
  type Category,
  type PracticeBook,
  type TemplateMarket,
} from "./catalog";
import { Icon } from "./icons";
import { Wallet } from "./Wallet";
import { Modal } from "./Modal";
import { MarketArt } from "./MarketArt";
import { MarketCard } from "./MarketCard";
import { MarketDialog, TransactionNotice, type TxState } from "./MarketDialog";
import { PracticeDialog } from "./PracticeDialog";

type Tab = "markets" | "positions";
const idleTx: TxState = { stage: "idle", message: "" };
const tabFromHash = (): Tab =>
  location.hash === "#positions" ? "positions" : "markets";
function loadBook() {
  try {
    return parseBook(localStorage.getItem(PRACTICE_STORE));
  } catch {
    return emptyBook();
  }
}

export default function App() {
  const { address, chainId, isConnected } = useConnection();
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [category, setCategory] = useState<Category>("All markets");
  const [source, setSource] = useState("all");
  const [sort, setSort] = useState("featured");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(30);
  const [walletOpen, setWalletOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [selected, setSelected] = useState<{
    id: bigint;
    yes?: boolean;
    market: Market;
  }>();
  const [practice, setPractice] = useState<{
    market: TemplateMarket;
    yes: boolean;
  }>();
  const [book, setBook] = useState<PracticeBook>(loadBook);
  const [storageError, setStorageError] = useState("");
  const [tx, setTx] = useState<TxState>(idleTx);
  const [claiming, setClaiming] = useState<bigint>();
  const lock = useRef(false);
  const [tick, setTick] = useState(Date.now());
  const query = useQuery({
    queryKey: ["markets", address, limit],
    queryFn: () => readSnapshot(address, limit),
    placeholderData: (previous) =>
      previous ? { ...previous, positions: {} } : undefined,
    retry: false,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });
  const data = query.data;
  const localNow = Math.floor(tick / 1000);
  const now = data
    ? data.timestamp +
      BigInt(Math.max(0, Math.floor((tick - data.fetchedAt) / 1000)))
    : BigInt(localNow);
  const ready = Boolean(
    data &&
    !query.isPlaceholderData &&
    !query.isError &&
    tick - data.fetchedAt < 90000,
  );
  const busy = ["checking", "wallet", "pending"].includes(tx.stage);
  const settled = data?.coreState?.settledThroughRound;
  const ownPractice = book.positions.filter(
    (p) => address && p.account.toLowerCase() === address.toLowerCase(),
  );
  const endedPractice = ownPractice
    .filter((p) => p.market.endsAt <= localNow)
    .map((p) => p.market);
  const resultQuery = useQuery({
    queryKey: [
      "practice-results",
      data?.blockNumber.toString(),
      endedPractice.map((m) => m.id).join(","),
    ],
    queryFn: () => readPracticeResults(data!, endedPractice),
    enabled: Boolean(data && endedPractice.length && !query.isError),
    retry: false,
  });
  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const onHash = () => {
      if (location.hash === "#main") return;
      setTab(tabFromHash());
      setCategory("All markets");
      setSource("all");
      setSearch("");
      window.scrollTo({ top: 0, behavior: "instant" });
      document.getElementById("main")?.focus({ preventScroll: true });
    };
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    if (isConnected) setWalletOpen(false);
  }, [isConnected]);
  useEffect(() => {
    document.title = `${tab === "positions" ? "My positions" : "Predict the next block"} · Squeek Predict`;
  }, [tab]);
  useEffect(() => {
    const sync = (e: StorageEvent) => {
      if (e.key === PRACTICE_STORE) setBook(parseBook(e.newValue));
    };
    addEventListener("storage", sync);
    return () => removeEventListener("storage", sync);
  }, []);
  const previousAddress = useRef(address);
  useEffect(() => {
    if (previousAddress.current && previousAddress.current !== address) {
      setSelected(undefined);
      setPractice(undefined);
      if (!lock.current) setTx(idleTx);
    }
    previousAddress.current = address;
  }, [address]);
  function resetTx() {
    if (!lock.current) setTx(idleTx);
  }
  function openMarket(m: Market, yes?: boolean) {
    resetTx();
    setSelected({ id: m.id, yes, market: m });
  }
  function savePrediction(market: TemplateMarket, yes: boolean, input: string) {
    if (!address)
      throw new Error("Connect your wallet to save this prediction.");
    // Read the latest book first so another tab's updates are not silently overwritten.
    let current = book;
    try {
      const saved = localStorage.getItem(PRACTICE_STORE);
      if (saved) current = parseBook(saved);
    } catch {
      /* In-memory fallback is disclosed. */
    }
    const next = placePractice(
      current,
      market,
      address,
      yes,
      input,
      Math.floor(Date.now() / 1000),
    );
    let persisted = true;
    try {
      localStorage.setItem(PRACTICE_STORE, JSON.stringify(next));
      setStorageError("");
    } catch {
      persisted = false;
      setStorageError(
        "Browser storage is unavailable. Practice positions last for this visit only.",
      );
    }
    setBook(next);
    return persisted;
  }
  async function transact(action: Action, success: string): Promise<boolean> {
    if (lock.current || !address || chainId !== chain.id || !ready)
      return false;
    lock.current = true;
    let hash: `0x${string}` | undefined;
    try {
      setTx({
        stage: "checking",
        message: "Checking the latest market state…",
      });
      const client = await getWalletClient(config);
      const assertWallet = async () => {
        const [walletChain, accounts] = await Promise.all([
          client.getChainId(),
          client.getAddresses(),
        ]);
        if (
          walletChain !== chain.id ||
          !accounts[0] ||
          getAddress(accounts[0]) !== getAddress(address)
        )
          throw new Error(
            "Wallet changed. Close this window, check your account and network, then retry.",
          );
      };
      await assertWallet();
      await verifyContract();
      const request = {
        address: PREDICT_ADDRESS,
        abi: predictAbi as Abi,
        account: address,
        chain,
        ...action,
      } as const;
      const simulation = await publicClient.simulateContract(request);
      await assertWallet();
      setTx({
        stage: "wallet",
        message: "Review and confirm the transaction in your wallet.",
      });
      hash = await client.writeContract(simulation.request);
      setTx({
        stage: "pending",
        message: "Transaction submitted. Waiting for confirmation…",
        hash,
      });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        timeout: 120000,
      });
      if (receipt.status !== "success")
        throw new Error("Transaction reverted. Refresh the market and retry.");
      setTx({
        stage: "success",
        message: success,
        hash: receipt.transactionHash,
      });
      await query.refetch();
      return true;
    } catch (error) {
      const message =
        error instanceof Error &&
        /Wallet changed|Transaction reverted|Contract verification failed/.test(
          error.message,
        )
          ? error.message
          : hash
            ? "Confirmation is unavailable. Check the transaction on Etherscan before submitting again."
            : friendlyError(error);
      setTx({ stage: "error", message, hash });
      return false;
    } finally {
      lock.current = false;
    }
  }
  async function quickClaim(m: Market) {
    if (!address) return;
    resetTx();
    setClaiming(m.id);
    await transact(
      { functionName: "claim", args: [m.id, getAddress(address)] },
      m.status === 2
        ? `Refund from market #${m.id} claimed.`
        : `Winnings from market #${m.id} claimed.`,
    );
    setClaiming(undefined);
  }
  const markets = data?.markets ?? [];
  const positionOf = (m: Market) => data?.positions[String(m.id)];
  const statusOf = (m: Market) => phase(m, now, settled);
  const held = markets.filter((m) => {
    const p = positionOf(m);
    return p && p.yes + p.no > 0n;
  });
  const toClaim = held.filter((m) => (positionOf(m)?.claimable ?? 0n) > 0n);
  const claimableTotal = held.reduce(
    (sum, m) => sum + (positionOf(m)?.claimable ?? 0n),
    0n,
  );
  const stakedTotal = held
    .filter((m) => m.status === 0)
    .reduce((sum, m) => {
      const p = positionOf(m)!;
      return sum + p.yes + p.no;
    }, 0n);
  const practiceTotal = ownPractice.reduce(
    (sum, p) => sum + BigInt(p.yes) + BigInt(p.no),
    0n,
  );
  const templates = TEMPLATES.map((t) => templateMarket(t, localNow));
  const openMarkets = markets.filter((m) => statusOf(m) === "Open for bets");
  const categoryFor = (m: Market): Category =>
    m.threshold === 0n
      ? "Activity"
      : m.endsAt - m.startsAt === 604800n
        ? "Weekly blocks"
        : "Daily blocks";
  const matches = (question: string, cat: Category) =>
    (category === "All markets" || category === cat) &&
    question
      .toLowerCase()
      .replace(/,/g, "")
      .includes(search.toLowerCase().replace(/,/g, "").trim());
  // Featured prioritizes real markets; explicit sorts compare both types. Search before capping.
  const board = [
    ...openMarkets.map((market) => ({ type: "chain" as const, market })),
    ...templates.map((market) => ({ type: "practice" as const, market })),
  ]
    .filter(
      (item) =>
        (source === "all" || source === item.type) &&
        (item.type === "chain"
          ? matches(title(item.market), categoryFor(item.market))
          : matches(item.market.question, item.market.category)),
    )
    .sort((a, b) => {
      if (sort === "closing")
        return Number(a.market.startsAt) - Number(b.market.startsAt);
      if (sort === "volume") {
        const volume = (item: typeof a) => {
          const pools =
            item.type === "chain"
              ? item.market
              : practicePools(book, item.market.id);
          return pools.yesPool + pools.noPool;
        };
        const diff = volume(b) - volume(a);
        return diff > 0n ? 1 : diff < 0n ? -1 : 0;
      }
      return 0;
    })
    .slice(0, 12);
  const totalShown = board.length;
  const selectedMarket =
    markets.find((m) => m.id === selected?.id) ?? selected?.market;
  const resetFilters = () => {
    setCategory("All markets");
    setSearch("");
    setSource("all");
  };

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {tx.stage === "error" ? "" : tx.message}
      </div>
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="#markets" aria-label="Squeek Predict home">
            <img src="./favicon.svg" width="34" height="34" alt="" />
            <span>
              Squeek<span className="brand-accent">Predict</span>
            </span>
          </a>
          <nav className="main-nav" aria-label="Main navigation">
            <a
              href="#markets"
              aria-current={tab === "markets" ? "page" : undefined}
            >
              <Icon name="grid" size={17} />
              Markets
            </a>
            <a
              href="#positions"
              aria-current={tab === "positions" ? "page" : undefined}
            >
              <Icon name="ticket" size={17} />
              My Positions
              {toClaim.length > 0 && (
                <span className="nav-badge">{toClaim.length}</span>
              )}
            </a>
          </nav>
          <div className="header-actions">
            <span className="network-label">
              <span className="status-dot" />
              Sepolia testnet
            </span>
            <button
              className="icon-button help-button"
              aria-label="How it works"
              onClick={() => setHelpOpen(true)}
            >
              <Icon name="info" size={20} />
            </button>
            <Wallet open={walletOpen} setOpen={setWalletOpen} />
          </div>
        </div>
      </header>
      <main id="main" className="page" tabIndex={-1}>
        <div className="page-heading">
          <div>
            <h1>
              {tab === "markets" ? "Predict the next block." : "My Positions"}
            </h1>
            <p>
              {tab === "markets"
                ? "The hamster runs. You call the outcome."
                : "Every prediction. One clear view."}
            </p>
          </div>
          <button
            className="text-button heading-help"
            onClick={() => setHelpOpen(true)}
          >
            How it works
            <Icon name="arrow" size={16} />
          </button>
        </div>
        {tab === "markets" ? (
          <>
            <div className="board-toolbar">
              <label className="search-field">
                <Icon name="search" size={19} />
                <span className="sr-only">Search markets</span>
                <input
                  type="search"
                  placeholder="Search markets"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    className="icon-button"
                    aria-label="Clear search"
                    onClick={() => setSearch("")}
                  >
                    <Icon name="close" size={16} />
                  </button>
                )}
              </label>
              <div className="toolbar-selects">
                <select
                  aria-label="Market type"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                >
                  <option value="all">All market types</option>
                  <option value="practice">Practice</option>
                  <option value="chain">On-chain</option>
                </select>
                <select
                  aria-label="Sort markets"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="featured">Featured</option>
                  <option value="closing">Closing soon</option>
                  <option value="volume">Most volume</option>
                </select>
              </div>
            </div>
            <div
              className="category-row"
              role="group"
              aria-label="Market category"
            >
              {CATEGORIES.map((c, i) => (
                <button
                  key={c}
                  className={`category-chip ${category === c ? "active" : ""}`}
                  aria-pressed={category === c}
                  onClick={() => setCategory(c)}
                >
                  {i === 0 && <Icon name="grid" size={15} />}
                  {c}
                </button>
              ))}
            </div>
            <div className="market-context">
              <span>
                <span className="status-dot" />
                {totalShown} open markets <span className="context-dot">·</span>{" "}
                <button
                  className="inline-button"
                  onClick={() => setHelpOpen(true)}
                >
                  Practice & Sepolia
                </button>
              </span>
              <button
                className="refresh icon-button"
                onClick={() => void query.refetch()}
                disabled={query.isFetching}
                aria-label="Refresh chain data"
              >
                <Icon name="refresh" size={15} />
              </button>
            </div>
            <div className="market-grid" aria-label="Open prediction markets">
              {board.map((item) => {
                if (item.type === "chain") {
                  const m = item.market;
                  return (
                    <MarketCard
                      key={`chain:${m.id}`}
                      market={m}
                      position={positionOf(m)}
                      now={now}
                      settled={settled}
                      busy={busy}
                      onOpen={openMarket}
                    />
                  );
                }
                const m = item.market;
                const pools = practicePools(book, m.id);
                const yesPercent = poolPercent(pools, true);
                const own = ownPractice.find((p) => p.market.id === m.id);
                return (
                  <article className="market-card" key={m.id}>
                    <div className="card-heading">
                      <MarketArt art={m.art} color={m.color} />
                      <div>
                        <span className="card-category">{m.category}</span>
                        <h2>
                          <button
                            className="question-button"
                            onClick={() =>
                              setPractice({ market: m, yes: true })
                            }
                          >
                            {m.question}
                          </button>
                        </h2>
                      </div>
                    </div>
                    <div className="card-odds">
                      <div>
                        <strong className="num">
                          {percentLabel(yesPercent)}
                        </strong>
                        <span>chance of Yes</span>
                      </div>
                      <span className="open-label">
                        <span className="status-dot" />
                        Open
                      </span>
                    </div>
                    <div className="odds-row">
                      {[true, false].map((yes) => (
                        <button
                          className={`odds ${yes ? "odds-yes" : "odds-no"}`}
                          key={String(yes)}
                          onClick={() => setPractice({ market: m, yes })}
                        >
                          <span>
                            <Icon name={yes ? "check" : "close"} size={16} />
                            {yes ? "Yes" : "No"}
                          </span>
                          <strong className="num">
                            {percentLabel(poolPercent(pools, yes))}
                          </strong>
                        </button>
                      ))}
                    </div>
                    <div className="card-foot">
                      <span title="Practice volume on this device">
                        <Icon name="chart" size={14} />
                        {eth(pools.yesPool + pools.noPool)} ETH vol.
                      </span>
                      <span>
                        <Icon name="clock" size={14} />
                        {timeLeft(BigInt(m.startsAt), BigInt(localNow))}
                      </span>
                    </div>
                    <div className="card-bottom">
                      <span className="mode-label">Practice</span>
                      {own ? (
                        <a href="#positions" className="your-pick">
                          <Icon name="ticket" size={13} />
                          Your position
                        </a>
                      ) : (
                        <span>SqueekCore block data</span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
            {totalShown === 0 && (
              <div className="empty">
                <Icon name="search" size={32} />
                <h2>
                  {source === "chain" && !search
                    ? query.isError
                      ? "Chain data is unavailable"
                      : query.isPending
                        ? "Checking Sepolia markets…"
                        : "No open on-chain markets yet"
                    : "No matching markets"}
                </h2>
                <p>
                  {source === "chain" && !search
                    ? "The practice board is ready to explore. On-chain markets appear here when they are available."
                    : `No questions match ${search ? `“${search}”` : "these filters"}. Try another category or clear your search.`}
                </p>
                <button className="primary" onClick={resetFilters}>
                  Show all markets
                  <Icon name="arrow" size={16} />
                </button>
              </div>
            )}
            <div className="board-note">
              <Icon name="shield" size={17} />
              <p>
                Practice markets use virtual ETH and save on this device.
                On-chain markets use Sepolia test ETH. Odds show the pool split.
              </p>
              <button className="text-button" onClick={() => setHelpOpen(true)}>
                Read the rules
                <Icon name="arrow" size={15} />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="position-summary">
              <div>
                <span>On-chain active stakes</span>
                <strong className="num">
                  {address && data ? eth(stakedTotal) : "0"} <small>ETH</small>
                </strong>
              </div>
              <div>
                <span>Ready to claim</span>
                <strong className="num gain">
                  {address && data ? eth(claimableTotal) : "0"}{" "}
                  <small>ETH</small>
                </strong>
              </div>
              <div>
                <span>Practice stakes · this device</span>
                <strong className="num">
                  {eth(practiceTotal)} <small>ETH</small>
                </strong>
              </div>
            </div>
            {!address ? (
              <div className="empty positions-empty">
                <span className="empty-symbol">
                  <Icon name="ticket" size={36} />
                </span>
                <h2>Your next prediction starts here</h2>
                <p>
                  Connect your wallet to see your positions, track outcomes and
                  claim on-chain winnings.
                </p>
                <button className="primary" onClick={() => setWalletOpen(true)}>
                  Connect wallet
                  <Icon name="wallet" size={17} />
                </button>
                <span className="small muted">
                  Connecting never places a bet.
                </span>
              </div>
            ) : (
              <>
                <section
                  className="position-section"
                  aria-labelledby="practice-positions"
                >
                  <div className="section-heading">
                    <h2 id="practice-positions">
                      Practice positions{" "}
                      <span className="count-label">{ownPractice.length}</span>
                    </h2>
                    <span className="small muted">
                      Virtual ETH · this device only
                    </span>
                  </div>
                  {ownPractice.length ? (
                    <div className="position-list">
                      {[...ownPractice].reverse().map((p) => {
                        const result = resultQuery.data?.[p.market.id];
                        const isPast = localNow >= p.market.endsAt;
                        const state = result
                          ? `${result.yesWins ? "Yes" : "No"} won · ${result.blocks.toLocaleString()} blocks`
                          : isPast
                            ? "Awaiting certified result"
                            : localNow >= p.market.startsAt
                              ? "Window in progress"
                              : "Open for predictions";
                        return (
                          <article className="position-row" key={p.market.id}>
                            <MarketArt
                              art={p.market.art}
                              color={p.market.color}
                            />
                            <div className="position-question">
                              <h3>{p.market.question}</h3>
                              <span className="small muted">{state}</span>
                              <div className="position-sides">
                                {BigInt(p.yes) > 0n && (
                                  <span className="gain">
                                    Yes · {eth(BigInt(p.yes))} ETH
                                  </span>
                                )}
                                {BigInt(p.no) > 0n && (
                                  <span className="loss">
                                    No · {eth(BigInt(p.no))} ETH
                                  </span>
                                )}
                              </div>
                            </div>
                            <button
                              className="secondary"
                              onClick={() =>
                                setPractice({
                                  market: p.market,
                                  yes: BigInt(p.yes) > 0n,
                                })
                              }
                            >
                              {localNow < p.market.startsAt
                                ? "Add prediction"
                                : "View rules"}
                              <Icon name="arrow" size={16} />
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="inline-empty">
                      <p>
                        No practice positions yet. Pick a market and back your
                        side.
                      </p>
                      <a className="button secondary" href="#markets">
                        Explore markets
                        <Icon name="arrow" size={16} />
                      </a>
                    </div>
                  )}
                </section>
                <section
                  className="position-section"
                  aria-labelledby="chain-positions"
                >
                  <div className="section-heading">
                    <h2 id="chain-positions">
                      On-chain positions{" "}
                      <span className="count-label">{held.length}</span>
                    </h2>
                    <span className="small muted">Sepolia test ETH</span>
                  </div>
                  {toClaim.length > 0 && (
                    <div className="claim-list">
                      {toClaim.map((m) => (
                        <div className="claim-row" key={String(m.id)}>
                          <div>
                            <strong>{title(m)}</strong>
                            <span className="small muted">
                              Market #{String(m.id)} ·{" "}
                              {m.status === 2 ? "Refund" : "Winnings"} ·{" "}
                              {eth(positionOf(m)!.claimable)} ETH
                            </span>
                          </div>
                          <button
                            className="primary"
                            onClick={() => void quickClaim(m)}
                            disabled={busy || !ready || chainId !== chain.id}
                          >
                            {claiming === m.id && busy ? "Claiming…" : "Claim"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {held.length ? (
                    <div className="market-grid">
                      {held.map((m) => (
                        <MarketCard
                          key={String(m.id)}
                          market={m}
                          position={positionOf(m)}
                          now={now}
                          settled={settled}
                          busy={busy}
                          onOpen={openMarket}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="inline-empty">
                      <p>
                        {query.isPending
                          ? "Reading your positions from Sepolia…"
                          : query.isError
                            ? "Couldn’t read on-chain positions. Retry the connection below."
                            : "No on-chain positions in the loaded markets."}
                      </p>
                    </div>
                  )}
                  {data && (
                    <p className="small muted position-coverage">
                      Loaded {markets.length} of {String(data.count)} markets.
                      Totals cover this set.
                    </p>
                  )}
                  {data && data.count > BigInt(limit) && (
                    <button
                      className="secondary load-more"
                      disabled={query.isFetching}
                      onClick={() => setLimit((v) => v + 30)}
                    >
                      Load older positions
                    </button>
                  )}
                </section>
              </>
            )}
          </>
        )}
        {storageError && (
          <p className="storage-notice" role="status">
            {storageError}
          </p>
        )}
        {tx.message && !selected && <TransactionNotice tx={tx} />}
        <div className="chain-status">
          <span>
            <span
              className={`status-dot ${query.isError ? "dot-warning" : ""}`}
            />
            {query.isError
              ? "Sepolia unavailable. Practice stays open."
              : data
                ? `Sepolia connected · ${data.count} on-chain markets`
                : "Connecting to Sepolia…"}
          </span>
          <button
            className="text-button"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {query.isFetching ? "Checking…" : "Refresh"}
            <Icon name="refresh" size={14} />
          </button>
        </div>
      </main>
      <footer className="site-footer">
        <div className="footer-top">
          <a className="footer-brand" href="#markets">
            <img src="./favicon.svg" width="24" height="24" alt="" />
            Squeek Predict
          </a>
          <div className="footer-links">
            <button className="text-button" onClick={() => setHelpOpen(true)}>
              How it works
            </button>
            <a
              href={`${EXPLORER}/address/${PREDICT_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
            >
              View contract
              <Icon name="external" size={13} />
            </a>
            <span>Sepolia testnet</span>
          </div>
        </div>
        <div className="footer-bottom">
          <p>
            Made by{" "}
            <a
              href="https://x.com/squeektoshi"
              target="_blank"
              rel="noreferrer"
            >
              @squeektoshi
            </a>{" "}
            <a
              href="https://x.com/pillheadddd"
              target="_blank"
              rel="noreferrer"
            >
              @pillheadddd
            </a>{" "}
            <a
              href="https://x.com/le_chien65760"
              target="_blank"
              rel="noreferrer"
            >
              @le_chien65760
            </a>{" "}
            on{" "}
            <a
              href="https://x.com/squeekchain"
              target="_blank"
              rel="noreferrer"
            >
              @squeekchain
            </a>
          </p>
          <span>Small predictions. Real block data.</span>
        </div>
      </footer>
      {selectedMarket && selected && (
        <MarketDialog
          key={String(selected.id)}
          market={selectedMarket}
          position={positionOf(selectedMarket)}
          yes={selected.yes}
          now={now}
          settled={settled}
          ready={ready}
          tx={tx}
          transact={transact}
          onClose={() => setSelected(undefined)}
          onConnect={() => setWalletOpen(true)}
          onReset={resetTx}
        />
      )}
      {practice && (
        <PracticeDialog
          key={practice.market.id}
          market={practice.market}
          yes={practice.yes}
          book={book}
          now={localNow}
          onClose={() => setPractice(undefined)}
          onConnect={() => setWalletOpen(true)}
          onPlace={savePrediction}
        />
      )}
      {helpOpen && (
        <Modal
          title="A little prediction. A clear outcome."
          onClose={() => setHelpOpen(false)}
          className="help-modal"
        >
          <p>
            Choose a question about Squeekchain activity, pick Yes or No, and
            track the result in My Positions.
          </p>
          <ol className="help-steps">
            <li>
              <strong>Pick your side.</strong> All markets have two outcomes.
              Empty pools start at 50/50; percentages then reflect the share of
              stakes on each side.
            </li>
            <li>
              <strong>Practice or use Sepolia.</strong> Practice markets are
              ready now: use virtual ETH, with no signature or funds
              transferred. Bets and volume are stored only in this browser for
              your wallet address. They are not shared with other visitors.
            </li>
            <li>
              <strong>Let the blocks decide.</strong> Questions compare official
              SqueekCore whole-block heights at two certified endpoints. Yes
              requires strictly more than the target; exactly the target is No.
              Physical wheel turns are not block counts. Results wait for
              certification, which may lag by days.
            </li>
            <li>
              <strong>Track your positions.</strong> Practice results are
              informational and have no redeemable winnings. On-chain markets
              use the existing SqueekPredict contract: minimum 0.0001 Sepolia
              test ETH plus gas. Winners claim a proportional share of the pool.
              One-sided markets allow refunds after betting closes; unresolved
              markets allow refunds after the 30-day grace period.
            </li>
          </ol>
          <p className="small muted">
            No platform fee. On-chain bets are final, have no early cash-out,
            and can lose their stake. This site never asks you to create a
            market.
          </p>
          <a
            className="button secondary full"
            href="https://cloud.google.com/application/web3/faucet/ethereum/sepolia"
            target="_blank"
            rel="noreferrer"
          >
            Get Sepolia test ETH
            <Icon name="external" size={16} />
          </a>
          <button className="primary full" onClick={() => setHelpOpen(false)}>
            Explore markets
            <Icon name="arrow" size={17} />
          </button>
        </Modal>
      )}
    </>
  );
}
