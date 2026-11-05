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

The site is a dark prediction-market board with local Inter typography, subtle hamster branding and large green **Yes** / rose **No** controls. Only the deployed contract’s binary completed-block markets are visible. The old browser-only founder, NFT and multi-choice catalogs are retained as historical source, but are not rendered or included in the active experience.

1. **Find an open market.** The homepage starts on Open. Cards show the complete question, current pool percentages, closing time and test-ETH volume. Status tabs, search, duration and sorting narrow the board. Load older markets or use the number lookup for earlier entries.
2. **Choose Yes or No.** Yes requires strictly more completed blocks than the target. Exactly the target settles as No. An empty pool starts at **50% / 50%**; after bets arrive, percentages are each side’s share of staked ETH. These are pool-based odds, not guaranteed probabilities or fixed-price shares.
3. **Review your stake.** The bet slip keeps the chosen side, offers quick amounts, and estimates the payout including your new and existing same-side stake. Minimum stake is `0.0001` Sepolia test ETH, with a `100` ETH cap per side; gas applies. Bets are final and can lose their stake. Rules, exact pools, dates and return multipliers are under Market rules & details.
4. **Connect and confirm.** The header offers named EIP-6963 extensions, mobile wallet-browser links and Coinbase Smart Wallet. Connecting preserves the slip’s side and amount and never sends a transaction. The header switches/adds Sepolia when needed; close a slip before switching. Every action is simulated and approved in the visitor’s wallet. Receipt links and retryable errors explain its result.
5. **Track My positions.** The dedicated view shows active stakes, position cards and available winnings/refunds, with direct Claim actions. Claims pay the connected wallet; a market’s detail view also supports a chosen receiving address. Totals explicitly cover loaded markets, including any number lookup. Load earlier markets to find earlier positions.
6. **Create the next market.** Set a whole-block target and choose a 24-hour or 7-day window. Starts snap to 10-minute Squeek rounds, at least 65 minutes and at most 7 days ahead in the UI. Daily/weekly templates leave the target for you to enter; the activity template asks whether any block completes. Creating costs gas and does not stake ETH. Drafts survive connection and confirmation offers Done. Anyone can resolve a certified result or open eligible refunds.

Market and wallet snapshots refresh every 30 seconds at one Ethereum block. Failed refreshes label cached data and disable submissions; data older than 90 seconds also cannot authorize a submission. A failed initial read exposes Retry. The Core block-height summary is read from the same snapshot. Physical wheel turns and fractional block work are not counted as completed blocks. There is no early cash-out or secondary trading.

A read-only public Sepolia observation on **2026-11-05**, at block **12072244**, returned **zero markets**, a matching deployed runtime hash and an unpaused Core. See [artifacts/chain-observation.json](artifacts/chain-observation.json). The production site therefore offers **The next market starts with you** and Create market; it never fabricates active bets. Populated screenshots are clearly identified interaction fixtures. Nothing was deployed or submitted on-chain.

### Read-only and asset checks

From `web/`, these optional scripts use the existing development dependencies:

```sh
npm run verify:deployment
node scripts/observe-chain.mjs
node scripts/check-live.mjs
node scripts/render-share.mjs
```

`observe-chain.mjs` requires curl and records real public RPC results in `artifacts/chain-observation.json`. `check-live.mjs` serves `dist/` at `/preview/` for its own lifetime and forwards browser RPC requests through curl when direct browser networking is restricted; it never substitutes fixture responses. It writes disposable screenshots/results to `test/scratch/live/`. `render-share.mjs` regenerates the 1200×630 social image from the local font and favicon; rebuild afterwards to copy it into `dist/`.

## Frontend validation

See [artifacts/validation.md](artifacts/validation.md) for the six-domain Better Interface review, source locations, fixes, commands and limitations. [DESIGN.md](DESIGN.md) documents the final tokens, typography, components and responsive behavior. These are worker-side results, not an independent certification.

- Final `npm run typecheck` and `npm run build` passed with the existing manifest, lockfile and Vite configuration unchanged. The complete export is `dist/`, with relative local assets and hash navigation.
- `npm test`: **22/22 passed**. These include exact wei amounts, timing, payouts, binary labels and initial/changing pool percentages; retained historical-module tests also run.
- `npm run test:browser`: **19/19 Chromium scenarios passed**. Coverage includes responsive cards, filters/search/sort, validation, wallet draft preservation, rejection/retry, exact betting and creation calldata, claims, resolution/refunds, account changes, network switching, pagination/lookup, keyboard/focus, zero markets, RPC failure and bytecode mismatch. All wallet/RPC transactions in this suite are mocked. Board and bet-slip axe scans returned no violations in the selected WCAG 2.2 AA rule set.
- The pinned `taste.mjs` probe passed **16/16** checks at 320, 390 and 1440px, including reduced motion. Its direct browser reads reached the recoverable RPC-error state in this sandbox; separate populated and real-read browser checks cover the other states. Output is retained in [artifacts/taste.json](artifacts/taste.json).
- Real public Sepolia reads rendered successfully at **320, 390, 800 and 1440px** through the read-only curl transport bridge. The local Inter font loaded, the board correctly showed zero markets, market creation produced real round-aligned dates, and there were no page errors, missing local resources or horizontal overflow. Mocked cards also passed at 980px.
- `npm run verify:deployment` passed: source digests, canonical ABI hash and creation bytecode match the retained deployment proof. A fresh public chain read independently matched the runtime hash. Contracts, contract build configuration, dependencies and wallet connector configuration were not changed.
- Limitations: the supplied browser tool failed to launch; local Playwright Chromium supplied the rendered evidence. WebKit could not launch because required system libraries are unavailable. Physical phones, real signatures, third-party passkeys/deep-link handoff, screen-reader sessions, native browser zoom, RTL/localization and a manual animation-panel review remain unverified. Direct browser-to-RPC access in this sandbox failed; curl reached the configured public RPCs. Vite retains a large-chunk advisory: main JS is **653.41 kB** (**198.33 kB gzip**).

For the pinned probe, while the assignment inputs are present, run from the repository root:

```sh
IMD_PLAYWRIGHT=./web/node_modules/playwright/index.mjs node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste
```

The guide and probe are assignment inputs and are not required to build or run the delivered site. For this run, browser executables and npm caches were confined to disposable `test/scratch/`. A normal workstation can use Playwright’s default external cache. No dependency directories, browser binaries, registry archives or caches are delivered. The final static-asset and submission-size audit is in [artifacts/export-audit.json](artifacts/export-audit.json).

## Contract development

The original Foundry configuration and dependencies are preserved. With Foundry and Solidity 0.8.26 installed:

```sh
forge build
forge test
forge fmt --check
node --test test/frontend.test.cjs
```

The existing Solidity suites use local Core fixtures; no fork or private key is needed. The retained deployment proof contains the original compiled ABI and bytecode. This revision checked it with `npm run verify:deployment`; it did not rebuild contracts or rerun the Solidity suites. See [test/TESTING.md](test/TESTING.md) for their existing coverage.

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
