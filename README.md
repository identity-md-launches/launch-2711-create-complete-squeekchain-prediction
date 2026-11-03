# Squeek Predict

A small, on-chain YES/NO prediction market for the **Squeekchain ecosystem / Buildooooor badge**. Bet Sepolia test ETH on whether the hamster will complete **more than X Squeek blocks during a fixed 24-hour or 7-day window**. This community MVP does not issue a badge or claim official endorsement.

The market reads the official settled ledger directly from **SqueekCore V3**, through the Sepolia proxy **`0x74665dAecA35A2303e767E76a2FF1FB6F93e119f`**. Neither a market creator nor an app operator reports the result.

## Website: install, preview and rebuild

The production site is **`dist/index.html`** with its local assets. The maintained frontend source is **`web/`** (React 19, TypeScript, Vite, wagmi/viem). The earlier `frontend/` is retained as the original minimal client; it is not the published export.

Use Node **22.18+** (Node 24 recommended) and npm. From the repository root:

```sh
cd web
npm ci
npm run typecheck
npm test
npm run build
npm run preview
```

Open the local URL printed by Vite. `npm run dev` runs the source with hot reload. `npm run build` replaces the repository-root `dist/`; include that entire folder when submitting or hosting. Vite uses `base: './'`, every required runtime asset is local, and navigation uses hashes, so an ordinary static server or IPFS gateway subpath works without rewrite rules. No backend, API key, relay project ID or environment file is needed.

`web/.npmrc` enables legacy peer resolution for the current wallet ecosystem's optional peer conflicts; `web/package-lock.json` pins the installed versions. Dependencies and package caches are not part of the delivery. The `.gitignore` additions assign a **zero-byte submission budget at every nesting level** to `node_modules/`, `.vite/`, `playwright-report/`, and `test-results/`. `dist/` is deliberately included. Validation evidence in `artifacts/` has a separate 1.5 MiB (1,572,864 byte) budget and is explicitly included.

For browser interaction checks, from `web/`:

```sh
npx playwright install chromium
npm run test:browser
```

The browser test serves the finished export at `/preview/` inside its own bounded process, mocks RPC and wallet interactions, checks calldata and resulting UI state, and writes disposable results to `test/scratch/` (or `SHOTS_DIR`). It sends no transactions and uses no signing key. Browsers are installed in Playwright's normal external cache, never vendored into the site.

## Live deployment and first interaction

The site uses the existing **Sepolia** deployment, chain ID **11155111**, at **`0x8bd658e58e94ab6a18a8b9d8c6108d1287facacf`**. This frontend task did not deploy or change any contract. Public network settings live in `web/src/network.ts`.

`web/src/predictAbi.ts` and `coreAbi.ts` were derived from Solidity 0.8.26 at source commit `841002e57646285ae0bd5a31e9af3c08f4f4839d`. `npm run verify:deployment` in `web/` checks the pinned source digests, frontend ABI, canonical ABI hash and creation bytecode, and regenerates the expected runtime hash. The live browser read matched that runtime hash; see [the public chain observation](artifacts/chain-observation.json). The site verifies chain ID and deployed bytecode before displaying usable state and again before each transaction, then simulates the action and verifies the wallet account/network before asking for approval.

### Using the site

The site is a dark, sportsbook-style board. Every market is shown as an **over/under line**: the contract's question "more than T blocks?" is displayed as **Over T.5** (YES) and **Under T.5** (NO), so exactly T blocks settles as Under. A line of 0 is shown as **At least one block / No blocks**. It asks whether a whole Squeek block completes during the window; positive work toward a partial block does not win that market.

1. **Browse without a wallet.** Each market card shows its type (Daily total, Weekly total, Activity, Record attempt), status, countdown to close, and two odds buttons. Odds are pool-based multipliers: total pool / that side's pool, as the contract pays it, with no fee. A side nobody has backed yet reads **Open**. Filter by status (All, Open, In play, Settled), window length, market type, search a line or `#id`, and sort by closing soon, biggest pool or newest.
2. **Wheel form.** The side panel (below the board on phones, linked from the live status card at the top) reads certified SqueekCore history: blocks per 10-minute round over the last certified 24 hours, totals for the last 1h / 3h / 6h / 12h / 24h / 7 days, the longest streak of rounds with completed blocks and the count of such rounds in 24h, the best rolling 24h of the week ("personal record"), the daily average, and a night / morning / afternoon / evening comparison in the visitor's local time. The status card says whether any blocks completed in the last certified hour and how far certification lags real time. Neither a zero-block hour nor a block streak establishes whether the hamster was physically running or resting.
3. **Connect** through the one wallet control: named EIP-6963 browser extensions, the wallet's own mobile browser (MetaMask, Coinbase Wallet, Rabby, Phantom), or Coinbase Smart Wallet. Switch to Sepolia when prompted.
4. **Bet slip.** Tapping an odds button opens the bet slip (a bottom sheet on phones) with that side selected: pools, window dates, side picker with live odds, stake with quick amounts, and the estimated payout. Minimum `0.0001` test ETH, each side capped at `100` test ETH. Bets are final.
5. **Create a market.** Use **Create market** or a market idea under **Start a market**. Ideas are computed from the last 7 certified days: a daily line near the average, a wake-up call (at least one completed block, line 0), a record attempt at the week's best 24h, a night shift starting at 18:00, a weekly line, and a custom window. Pick 24 hours or 7 days, adjust the line with the stepper, and choose when the window starts: in about 1 hour, in 6 hours, next 06:00, next 18:00, or any date and time you pick (65 minutes to 7 days ahead; it snaps to the next 10-minute Squeek round). Creating costs gas and does not place a bet.
6. **Resolve and refunds.** After the window, anyone can resolve once SqueekCore has certified the endpoint, or open refunds for an unmatched market after betting closes, or for an unresolved market after its 30-day grace.
7. **My bets.** Shows what you have staked and what is ready to claim, with a one-tap **Claim** for every claimable market (paid to the connected wallet). Open a market to send a payout to another address.

Pools, positions and Core state are read from one Ethereum block and refresh every 30 seconds or with the refresh button. A failed refresh marks the last read as stale and disables submissions until a successful read. Wheel stats are read with batched JSON-RPC `roundPage(r, r, 0)` point queries (about 290 per load) and cached for five minutes. Every requested nonnegative round must return its certified endpoint; an incomplete read shows the wheel-history retry state instead of substituting zero for unknown data.

**What the contract can and cannot settle.** The deployed SqueekPredict contract only settles "more than T completed blocks over a 24-hour or 7-day window". This job did not deploy anything, so markets on 1h / 3h / 6h / 12h windows, longest runs, or daypart comparisons are shown as **Wheel form stats, not bets**. Record attempts, block-completion checks and custom start times are real markets because they map onto the contract's 24h/7d rule. Adding the other market types needs a new contract version.

The original upgrade check observed **zero markets** on-chain; an empty board shows the market ideas. That observation is historical, not a current market count. It does not seed fake markets, odds, pools or positions; the wheel stats are real certified data. Squeek blocks measure certified work, not a one-to-one count of wheel revolutions. Use test ETH only.

## Frontend validation

The revision's results, reproductions and six-domain Better Interface review are in [artifacts/validation.md](artifacts/validation.md); the implemented design system is in [DESIGN.md](DESIGN.md).

- Production build and `npm run typecheck` passed using the unchanged lockfile. The existing Vite advisory remains: the main wallet-containing JavaScript chunk is about 684 kB, above 500 kB.
- `npm test`: **21/21** model tests passed. They cover the hamster catalog, UTC windows, settlement, and the exact 1h/3h/6h streak boundaries against their labels.
- `npm run test:browser`: **20/20** Chromium scenarios passed against the production export at `/preview/`, with mocked RPC and EIP-6963 wallet requests. They cover every hamster market family and the category chips; free calls persisting and settling; the first 390×844 screen showing a complete hamster question with its answer buttons; and the record line staying unavailable, with no estimated line, while weekly history cannot be read. Also covered: filters, staking, creation, claims, resolution, wallet entry, outage/retry, full uint64 lines, headers across 16 widths, and incomplete history. The 390px axe WCAG 2.2 AA scan reported no violations. No real transaction was sent.
- The pinned `taste.mjs` probe passed **16/16** at 320, 390 and 1440px with live Sepolia reads. Full results are in [artifacts/taste.json](artifacts/taste.json).
- Screenshots confirm the title, hamster image, both hero actions and the first hamster market's answer buttons on the first 390px screen. At 320px, the first answer row starts just below the fold.
- Not verified: WebKit (launch failed because required system libraries are absent), physical phones, native browser zoom, screen-reader sessions, and real wallet signatures.

Dependencies were installed with `npm ci` from the committed lockfile into the git-ignored `web/node_modules`. No dependency directory, cache or registry archive is delivered.

## Contract development

The original Foundry configuration and dependencies are preserved. With Foundry and Solidity 0.8.26 installed:

```sh
forge build
forge test
forge fmt --check
node --test test/frontend.test.cjs
```

The existing Solidity suites use local Core fixtures; no fork or private key is needed. This frontend task ran `forge build --offline` to derive and verify the deployment ABI and bytecode. It did not rerun or change the Solidity suites. See [test/TESTING.md](test/TESTING.md) for their existing coverage.

## Exact question and time boundaries

The question is **strictly greater than X**. Exactly X completed blocks means **NO**.

The creator chooses `startRound`, the first included Squeek round, and a duration of `86400` or `604800` seconds. Let `g` be Core's reported genesis timestamp and `s` the chosen round:

```text
startsAt = g + (s - 1) × 600       betting closes at this timestamp
endRound = (s - 1) + duration / 600
endsAt   = startsAt + duration
refundAt = endsAt + 30 days
```

The start must be between **1 hour and 7 days ahead** at creation. A full measurement window begins **after betting closes**; creating a market does not start measuring immediately. This prevents bets after observing the result. Periods align to Core's ten-minute rounds, so the MVP does not offer arbitrary wall-clock starting seconds.

For example, a market covering rounds `107..250` measures exactly 144 rounds / 24 hours. Its baseline is the settled ledger **after round 106**, and its endpoint is **after round 250**. Work from round 251 never changes this market, even if resolution is submitted a day late.

## How Squeekchain data decides the result

The integration follows the official [SqueekCore reference](https://docs.squeekchain.com/developers/core/) and its [V3 ABI](https://docs.squeekchain.com/assets/abi/SqueekCore.json). See [the integration notes](docs/CORE_INTEGRATION.md) for verification details.

Resolution reads certified historical points using `roundPage(r, r, 0)` at the baseline and endpoint. It first requires `state().settledThroughRound >= endRound`; an uncertified round is **unknown**, not zero work. Certified gaps with no active records are valid zero-work intervals.

```text
completedBlocks = floor(end.cumulativeBlockUnits / 1_000_000_000)
                - floor(start.cumulativeBlockUnits / 1_000_000_000)
YES wins iff completedBlocks > threshold
```

The contract does not divide physical work by current difficulty. It also does not floor the difference in block units: progress carried from earlier rounds can complete a block inside the window. The settled unit snapshots are stored with the result and emitted in `MarketResolved` for inspection.

Creation requires Core V3, a nonzero stream, a valid genesis, 600-second rounds and a billion units per block. Each market records the Core implementation address, stream and genesis; a change to these, the version or the units prevents resolution with incompatible data. Already certified history can still be read while Core is paused.

## Payouts, refunds and accounting

Both sides form a single pari-mutuel pool. There is **no fee** and no fixed odds. A successful claim normally receives:

```text
floor(wallet's winning stake × total original pool / total original winning stake)
```

Only the winning-side stake is used in that fraction, even if a wallet bet on both sides. Losing stakes pay the winners. The last winning wallet to claim receives the remaining pool, including rounding dust; the dust is less than the number of earlier winning claims in wei. There is no payout expiry. Unclaimed participant funds remain available indefinitely.

If either side has no stake, anyone can call `cancelUnmatched(id)` once betting closes. All stakes are refundable, regardless of what the hamster later does. `resolve` also cancels such a market if called with valid settled data.

At **`refundAt` or later**, anyone can call `cancelExpired(id)` on any still-open market. This needs **no Core call**, so oracle outages, pauses or incompatible upgrades cannot permanently lock the deposits. Resolution is allowed only while `endsAt <= timestamp < refundAt`, and the refund is never available inside that window, so a losing side cannot race a late resolution with a cancellation. After cancellation, users recover the sum of their YES and NO stakes. After successful resolution, a timeout cannot overturn the result.

The resolution grace is **30 days** (`RESOLUTION_GRACE`). The Squeekchain Reporter certifies rounds in batches and has fallen more than three days behind wall-clock time on Sepolia (round 1973 was the certified frontier for over 3.7 days at the end of October 2026). An earlier 3-day grace would have refunded every market whose window ended during such an outage even though Core later certified the result; 30 days keeps those markets resolvable from official data. The cost is that a market whose last round Core never certifies holds its stakes for up to 30 days after the window before `cancelExpired` opens refunds.

Claims follow checks/effects/interactions and use a reentrancy guard. A rejecting receiver rolls back only its own claim; it can retry to another address. Claims never push payments to a list of users. Each market tracks its own remaining payout, and `totalLiability` tracks all unpaid participant funds. The per-side `100 ETH` cap (`MAX_SIDE_POOL`, at most `200 ETH` per market) also bounds payout multiplication safely. Capping each side separately means a wallet that fills one side cannot lock the other side out and force a risk-free refund through `cancelUnmatched`; voiding a market now requires exposure on both sides. Direct ETH transfers revert; forcibly delivered surplus is excluded from pools and has no recovery function.

## Contract calls

| Call | Who / when | Effect |
| --- | --- | --- |
| `createMarket(uint64 threshold, uint64 startRound, uint64 duration)` | Anyone, Sepolia, compatible active Core | Creates an immutable question and window; returns ID starting at 1 |
| `bet(uint256 id, bool yes)` payable | Anyone, before `startsAt` | Adds caller's ETH stake; `true` = YES |
| `resolve(uint256 id)` | Anyone, after end and before refund time | Resolves from certified exact historical endpoints |
| `cancelUnmatched(uint256 id)` | Anyone, after start, at least one empty side | Opens full refunds |
| `cancelExpired(uint256 id)` | Anyone, at or after refund time, still open | Opens full refunds independently of Core |
| `claim(uint256 id, address payable recipient)` | Each bettor, after finalization | Sends caller's payout or refund to chosen recipient |
| `getMarket(uint256 id)` | Read-only | Question, timestamps, pools, source identity, status, outcome, snapshots and remaining payout |
| `positions(uint256 id, address bettor)` | Read-only | Wallet's YES/NO stakes and whether it claimed |
| `claimable(uint256 id, address bettor)` | Read-only | Current payout/refund, or zero if unavailable |

Market status values are `0 = Open`, `1 = Resolved`, `2 = Cancelled`. Open includes the betting, measurement and settlement-waiting stages; use timestamps to distinguish them. Relevant state changes emit `MarketCreated`, `BetPlaced`, `MarketResolved`, `MarketCancelled` and `Claimed`. The generated [frontend ABI](web/src/predictAbi.ts) includes the full tuples and custom errors for other clients.

## After launch

There are **no owner settings or post-deployment setters**. All numeric choices are the named public constants in `SqueekPredict.sol`: chain `11155111`, round duration `600`, block units `10^9`, supported windows `1/7 days`, minimum/maximum lead `1 hour/7 days`, resolution grace `30 days`, minimum stake `0.0001 ETH`, and per-side pool cap `100 ETH`.

The committed `dist/` export uses the confirmed deployment address. Before accepting bets, the frontend rechecks the chain and exact deployed bytecode. A read-only check is provided:

```sh
node scripts/read-core.cjs https://ethereum-sepolia-rpc.publicnode.com
```

This reads at one Ethereum block 12 blocks behind the tip and checks Core version, unit scale, height/progress and the certified historical endpoint. It does not sign, settle Core, or resolve markets. The [saved observation](docs/core-observation.json) is evidence of an integration read during development, not a current oracle feed or an identity attestation.

Participants or a volunteer keeper must pay gas to resolve/cancel and users must claim their own funds. There is no automation service or keeper reward. If nobody submits resolution within the 30-day grace, the market refunds even if data was available. Operators should watch Core's `settledThroughRound` against the wall-clock round: a Reporter outage longer than the grace is the one condition under which decided markets are refunded. Anyone can run these operations, so an operator going offline does not grant special control over funds.

The Squeekchain Reporter and governance remain trusted for the underlying history and its availability. Implementation pinning detects a changed pointer; it is not a cryptographic proof of physical wheel activity and cannot detect every same-ABI semantic change. Settlement can be delayed, and Ethereum can reorganize. Confirmation handling and monitoring belong to operators and users. This MVP accepts test ETH only by convention; never use this deployment or a fork with valuable funds without independent adversarial review.

## Verification and limitations

See [security review notes](docs/SECURITY_REVIEW.md) for the concrete threat analysis and tested failure paths. Tests cover daily/weekly windows, strict thresholds, progress carry, zero-work gaps, delayed/batched settlement including a replay of the observed 3.7-day Reporter outage, source failure/change, timing boundaries, invalid bets, per-side pool caps and a filled side that cannot lock the other out, wallet positions on both sides, proportional payout, rounding, duplicate actions, rejecting receivers, reentrancy, cross-market isolation, and stateful conservation.

The frontend has no indexer, backend, fixed-price shares, secondary trading or automated settlement. Pool values are RPC snapshots; only transaction execution establishes the final state. The local tests are not an independent security audit, and no deployment or real-wallet transaction was performed for this deliverable.

## Included dependencies

`lib/forge-std/` contains forge-std **v1.9.7** sources and MIT/Apache licenses (tests only). `frontend/vendor/` contains ethers **6.15.0** and its MIT license (browser and optional Node tool). Neither needs an online package registry at verification time. See [THIRD_PARTY.md](THIRD_PARTY.md).
