# Squeek Predict

A small, on-chain YES/NO prediction market for the **Squeekchain ecosystem / Buildooooor badge**. Bet Sepolia test ETH on whether the hamster will complete **more than X Squeek blocks during a fixed 24-hour or 7-day window**. This community MVP does not issue a badge or claim official endorsement.

The market reads the official settled ledger directly from **SqueekCore V3**, through the Sepolia proxy **`0x74665dAecA35A2303e767E76a2FF1FB6F93e119f`**. Neither a market creator nor an app operator reports the result.

## Website: install, preview and rebuild

The production site is **`dist/index.html`** with its local assets. The maintained frontend source is **`web/`** (React, TypeScript, Vite). The earlier `frontend/` is retained as the original minimal client; it is not the published export.

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
# Optional additional read-only check against the configured real RPC:
CHECK_LIVE_RPC=1 npm run test:browser
```

The browser test serves the finished export at `/preview/` inside its own bounded process, mocks RPC/wallet interactions by default, checks calldata and resulting UI state, and writes disposable results to `test/scratch/`. It sends no transactions and uses no signing key. The optional live check reads state only. Browsers are installed in Playwright's normal external cache, never vendored into the site.

## Live deployment and first interaction

The site uses the existing **Sepolia** deployment, chain ID **11155111**, at **`0x8bd658e58e94ab6a18a8b9d8c6108d1287facacf`**. This frontend task did not deploy or change any contract. Public network settings live in `web/src/network.ts`.

`web/src/predictAbi.ts` and `coreAbi.ts` were derived from Solidity 0.8.26 at source commit `841002e57646285ae0bd5a31e9af3c08f4f4839d`. `npm run verify:deployment` in `web/` checks the pinned source digests, frontend ABI, canonical ABI hash and creation bytecode, and regenerates the expected runtime hash. The live browser read matched that runtime hash; see [the public chain observation](artifacts/chain-observation.json). The site verifies chain ID and deployed bytecode before displaying usable state and again before each transaction, then simulates the action and verifies the wallet account/network before asking for approval.

1. Browse without a wallet. Open markets lead the list. Filter by status or 24-hour/7-day duration; search a block target or ID. Load older markets in batches of 20, or find a specific ID.
2. Connect through the one wallet control: named EIP-6963 browser extensions, the wallet's own mobile browser, or Coinbase Smart Wallet. The phone picker links to MetaMask, Coinbase Wallet, Rabby, and Phantom. Switch to Sepolia when prompted.
3. Choose **Bet yes** or **Bet no**, select a test ETH amount, and review the window, pools and estimated total payout. The minimum is `0.0001` test ETH; each side is capped at `100` test ETH. Estimates include an existing stake on the selected side and change with subsequent bets. Bets are final and can lose the stake.
4. If no suitable market exists, choose **Create market** or a clearly labelled starting idea. Set a whole-number target, 24 hours or 7 days, and roughly 2, 6 or 24 hours of betting. Creating costs gas and does not place a bet. Exact dates align to ten-minute Core rounds and are fixed on-chain.
5. After the window, anyone can **Resolve market** once SqueekCore has certified the endpoint. Anyone can **Open refunds** for an unmatched market after betting closes, or for an unresolved market after its 30-day grace. These actions cost gas; there is no automatic keeper.
6. Open **My positions**. Claimable positions lead the list. Claim winnings or refunds to your connected wallet, or edit the receiving address. Exact stakes and claim amounts remain readable in market details. Confirmation links open Etherscan.

Pools, positions and Core data are RPC snapshots from one Ethereum block, refreshed every 30 seconds and manually with **Refresh**. A failed refresh explicitly marks the last read as stale and disables submissions until a successful read. Core outages do not prevent listing markets, betting, or oracle-independent refund/claim calls. Account changes close any existing transaction form and load that account's own positions. Totals and empty positions refer to the currently loaded markets, not an invisible all-chain portfolio.

At the checked block there were **zero markets**, so the real site showed an empty state and creation options. It does not seed fake markets, odds, pools, positions or wheel activity. The three editable starting ideas are 1,000 daily blocks, 2,000 daily blocks, and 10,000 weekly blocks; they are not active bets. Squeek blocks measure certified work, not a one-to-one count of physical wheel revolutions. Only test ETH is appropriate for this community MVP.

## Frontend validation

Actual results and the six-domain Better Interface review are recorded in [artifacts/validation.md](artifacts/validation.md); the final implemented design system is in [DESIGN.md](DESIGN.md).

- Production build and TypeScript typecheck passed. The build has one advisory: the main minified JavaScript chunk is above Vite's 500 kB warning threshold.
- Six model tests passed, covering wei precision, bounds, round alignment, estimated payouts, lifecycle boundaries, and tiny positive amounts.
- Fourteen Chromium scenarios passed with the optional read-only live check enabled. Transaction cases use test-only mock providers and assert the exact contract, arguments and payable value.
- The pinned taste probe passed **16/16** checks on the production export, including 320/390/1440 reflow, rendered text contrast, metadata and reduced motion. Additional checks covered the creation dialog, keyboard/focus, RTL reflow and 200% text enlargement. Automated accessibility scans of the market grid and creation dialog found no violations in the tested rule set.
- WebKit could not open a page on the available runtime (EGL display creation failed). Safari, physical phones, native browser zoom, assistive-technology sessions, app handoff, passkey onboarding and actual wallet signatures remain unverified. No real transaction was sent. Automated checks are not an independent audit.

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
