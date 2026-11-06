# Squeek Predict

A dark, market-first prediction board for Squeekchain. Twelve ready-to-play questions have large **Yes / No** buttons, starting **50/50** odds, closing times and volume. Connect a wallet, choose a side and track it in **My Positions**. There is no market-creation flow.

The maintained site is **`web/`** (React, TypeScript, Vite, wagmi and viem). Its complete, committed static export is **`dist/index.html`** and `dist/` assets. `frontend/` remains the historical minimal client and is not published.

## Install, preview and rebuild

Use Node **22.18+** and npm. From the repository root:

```sh
cd web
npm ci
npm run typecheck
npm test
npm run build
npm run preview
```

Open the preview URL printed by Vite. `npm run dev` starts the source with hot reload. The existing `web/package.json`, `web/package-lock.json`, Vite configuration and contract build/dependency files are preserved. The lockfile pins the installed packages; no frontend dependency changes are needed.

`npm run build` replaces the root `dist/`. Include the entire export when submitting or hosting: the publisher does not rebuild it. Vite's `base: './'`, relative local assets and hash navigation support IPFS/gateway subpaths without server rewrites. Runtime fonts, icons, wallet marks and the social image are bundled locally. No backend, environment file, relay, project ID or private credentials are required. Wallet apps and public Sepolia reads require network access; the practice board itself remains usable during an RPC outage.

Generated dependencies, browser binaries, caches and disposable test files are not delivered. The existing ignore rules already exclude dependency directories at every nesting level; this task does not change an ignore file.

## Ready markets and honest data

A fresh read on **2026-11-06**, at Sepolia block **12075955**, verified the deployed bytecode and found **zero on-chain markets**. [The observation](artifacts/chain-observation.json) records actual public RPC results. Nothing was deployed and no real transaction was sent by this task.

The homepage therefore opens with **12 practice template markets**, rather than asking visitors to create one. They cover completed-block totals and activity in one hour, six hours, 24 hours and seven days, including the explicit 00:00–06:00 UTC overnight window. All are binary questions verifiable from SqueekCore block history. These are editorial thresholds, not fabricated observations or invented contract market IDs.

Practice cards are visibly marked **Practice**. Their stakes are **virtual ETH**; they never request a signature, debit a wallet or promise redeemable winnings. Pools, percentages, volume and positions come only from saved bets in this browser. They are not shared with other visitors. A connected wallet address separates its positions from other accounts on the same device. The app does not invent a wallet balance or pretend there is external liquidity.

Real open markets from the existing contract automatically join the board and are marked **On-chain · Sepolia**. Featured ordering prioritizes them; templates fill the board to 12 cards. Category, search and market-type filters apply before the 12-card limit. Closing-time and volume sorts compare both types. A filtered view may have fewer than 12 results.

### Betting and positions

1. Select a market's **Yes** or **No** button. The slip preserves that choice, shows the amount and explains the market type before submission.
2. Connect through the single header control or the slip: named EIP-6963 extensions, the four mobile wallet-browser links, or Coinbase Wallet / Smart Wallet. Connecting preserves the draft and never places a bet.
3. Use a quick amount or enter a precise amount. Practice submission saves immediately; a real Sepolia bet requires a verified chain read, simulation, wallet approval and a successful receipt. Both enforce a 0.0001 ETH minimum and a 100 ETH aggregate side limit in their respective pools.
4. Open **My Positions** to see separate practice and on-chain stakes. Practice results wait for certified endpoints and have no cash claim. On-chain winnings and refunds can be claimed to the connected wallet; the details dialog also supports a chosen receiving wallet. On-chain totals explicitly cover loaded markets; **Load older positions** expands that set.

Empty markets show **50% / 50%**. After bets, the percentages are shares of their respective pool, not fixed share prices or guaranteed probabilities. Payout estimates include the proposed and previous same-side stake. Opposing stakes are required for winnings. There is no platform fee or early cash-out; on-chain bets are final and can lose their stake.

### Windows, storage and resolution

Template windows rotate at fixed UTC boundaries: the next hour, next six-hour boundary, next midnight for daily/overnight, or next Monday for weekly. Betting closes when measurement starts. Saved positions retain their original question and dates when the next window opens. The overnight question measures 00:00–06:00 UTC. Rules disclose exact local dates with timezone.

Practice data uses `squeek-predict-practice-v1` in browser local storage. It survives reloads on the same origin/device; clearing browser data removes it. It is not an authenticated account service or a backup. If storage fails, the success dialog and page explicitly say the position lasts for this visit only. Other tabs receive storage updates.

Results compare **whole-block heights at the two endpoints**, flooring each endpoint before subtracting, as the contract does. **Yes** requires strictly more than the threshold; exactly the threshold is **No**. Physical wheel revolutions and fractional work are not completed blocks. The app never guesses a missing result: future, failed, uncertified or incompatible endpoints remain pending. SqueekCore certification can lag by days. These templates do not support unrelated social/NFT outcomes.

## Existing deployment

- Network: **Sepolia**, chain ID **11155111**.
- SqueekPredict: **`0x8bd658e58e94ab6a18a8b9d8c6108d1287facacf`**.
- SqueekCore V3, read through the deployed contract's `CORE()`: **`0x74665dAecA35A2303e767E76a2FF1FB6F93e119f`**.
- ABI/source provenance: **`841002e57646285ae0bd5a31e9af3c08f4f4839d`**, retained in `web/scripts/deployment-proof.json`.

`npm run verify:deployment` in `web/` checks the pinned source digests, canonical ABI hash and creation bytecode. Public read code checks chain ID and runtime bytecode before trusting market state, and again before each transaction. The transaction path verifies the account/network before simulation and before requesting approval. Public network parameters, the existing wallet connectors, contracts and contract economics are unchanged.

Snapshots refresh every 30 seconds at a single Ethereum block. Failed refreshes or reads older than 90 seconds pause on-chain submissions. The board retains public market data while changing accounts, clears account-specific positions, and waits for fresh account data before authorizing a transaction. Retry remains available. Practice is independent of RPC availability. Existing on-chain markets retain 24-hour/7-day resolution, unmatched refunds after betting closes, and expiry refunds after the 30-day grace period.

## Validation and reproducible checks

[DESIGN.md](DESIGN.md) documents implemented tokens, typography, components and responsive rules. [artifacts/validation.md](artifacts/validation.md) records all six Better Interface domains, findings, fixes, actual checks and unperformed checks. These are worker-side results, not independent certification.

Checks run for this revision:

- Production build and TypeScript typecheck: **passed**.
- `npm test`: **28/28 passed**, including six new catalogue/persistence/pool tests and the retained contract-math tests.
- DOM integration: **13/13 scenarios passed**, exercising the actual React app with mocked RPC and EIP-6963 providers. Coverage includes filters, draft preservation, virtual betting, exact real-bet calldata, rejection/retry, claims, account isolation, network switching, storage failure, persistence, certified results and RPC failure. No real signatures or broadcasts.
- Declared opaque color-pair calculation: **15/15 passed** after correcting primary button contrast. This is a source calculation, not rendered contrast measurement.
- ABI/deployment proof: **passed**; fresh real public reads matched the expected runtime and returned zero markets.
- The pinned design probe and the real-browser suite were **attempted but could not render**. Supplied Chromium failed at launch; local Chromium also exited with SIGTRAP. Firefox could not locate its application directory. WebKit initially lacked libraries; after supplying temporary test libraries it launched but closed before creating a page. Consequently no new page screenshots, native focus/overflow measurements or browser axe scans are claimed.

To repeat the browser checks on a machine with a usable browser runtime, from `web/`:

```sh
node node_modules/playwright/cli.js install chromium webkit
npm run test:browser
ENGINE=webkit npm run test:browser
```

The suite serves the finished `dist/` at `/preview/` inside one bounded process and closes its server/browser afterwards. It checks 320/390/800/980/1440px layouts, first-phone-screen actions, filters, practice persistence, real transaction fixtures, mobile wallet rows, native keyboard focus, reduced motion and axe. It writes disposable screenshots/results under `test/scratch/`; none are production fixtures.

The supplemental DOM emulator requires an optional test dependency, installed only into scratch. From the repository root:

```sh
npm install --prefix test/scratch/dom --cache test/scratch/npm-cache --ignore-scripts --no-audit --no-fund happy-dom@21.0.4
node web/tests/dom-check.mjs
node web/scripts/check-colors.mjs
node web/scripts/audit-export.mjs
```

This does not change the production manifest or lockfile. Happy DOM has no layout engine; native `dialog` methods are emulated in this test. It cannot establish rendered appearance, focus confinement, actual overflow, loaded fonts, native zoom, screen-reader output or physical-device behavior. Real passkeys/deep-link handoff and real signed transactions are also unverified.

While the pinned assignment inputs exist, the exact probe command is:

```sh
IMD_PLAYWRIGHT="$PWD/web/node_modules/playwright/index.mjs" node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste
```

The production build retains Vite's wallet-bundle size advisory and a warning about the intentional `../fonts/InterVariable.woff2` public URL. The asset audit confirms that this relative font URL resolves in the export. Font, source, SVG/PNG social card, wallet marks and licenses remain complete. The final conservative submission-byte count and protected-path check are in [artifacts/export-audit.json](artifacts/export-audit.json).

`node web/scripts/render-share.mjs` can regenerate `web/public/share.png` from the local SVG/font on a browser-capable machine; rebuild afterwards. In this run, the social PNG was rasterized from `share.svg` with a disposable SVG renderer and DejaVu Sans fallback because Chromium could not start. This is share artwork, not a screenshot of the website.

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
