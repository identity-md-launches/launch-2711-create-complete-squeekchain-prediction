# Squeek Predict

A small, on-chain YES/NO prediction market for the **Squeekchain ecosystem / Buildooooor badge**. Bet Sepolia test ETH on whether the hamster will complete **more than X Squeek blocks during a fixed 24-hour or 7-day window**. This community MVP does not issue a badge or claim official endorsement.

The market reads the official settled ledger directly from **SqueekCore V3**, through the Sepolia proxy **`0x74665dAecA35A2303e767E76a2FF1FB6F93e119f`**. Neither a market creator nor an app operator reports the result.

## Run it

Prerequisites: Foundry with Solidity **0.8.26** available. Node 20+ is needed only for the optional UI tests/read tool; Python 3 can serve the frontend. Dependencies are included as ordinary files; no `forge install`, npm install, submodule, API key or RPC is required for building or testing.

```sh
forge build
forge test
forge fmt --check
node --test test/frontend.test.cjs
```

The requested fuzz seed is pinned in `foundry.toml`. The tests use local SqueekCore fixtures at the official address, with no fork, environment variables, filesystem cheatcodes or network dependency. Stateful tests exercise multiple markets and wallets, checking fund conservation and eventual withdrawal of every remaining liability.

To view the app:

```sh
python3 -m http.server 8000 --directory frontend
```

Open the served page in a browser with an Ethereum wallet. All JavaScript and both ABIs are included locally; the browser uses the wallet's Sepolia RPC. Use test ETH only.

## Deployment and first interaction

Deploy **only `src/SqueekPredict.sol:SqueekPredict` on Sepolia, chain ID `11155111`**, using the normal deployment handoff. Its nonpayable constructor takes **no arguments** and makes no external calls. There is no owner, admin, initializer, launch token or additional application to deploy. Creation uses the fixed official Core address; it cannot be replaced by an operator.

Build artifacts are produced with optimizer runs `200`, Cancun EVM and `bytecode_hash = "none"`. The project includes no signed transaction or fabricated deployment address. Record the confirmed deployment address and verify its source with these exact settings before opening it to users.

1. Paste the **confirmed SqueekPredict address** into the frontend, select Sepolia and connect your wallet.
2. Create a market: choose a target, 24 hours or 7 days, and a betting period. The UI suggests a round boundary roughly 2, 6 or 24 hours ahead. Review the resulting transaction and the mined market's exact times.
3. Participants bet YES or NO before betting closes. The minimum is `0.0001` test ETH and each side is capped at `100` test ETH per market, so a full YES pool still accepts NO stakes and vice versa. A wallet can add multiple stakes or hold both sides. Stakes cannot be withdrawn during betting.
4. After the measurement window ends, **anyone** clicks **Resolve from SqueekCore**. The transaction succeeds only once Core has certified the entire window. A delayed settlement can be retried at any time during the 30-day resolution grace, which is sized to outlast the multi-day Reporter outages observed on Sepolia.
5. Winners click **Claim payout / refund**. Each wallet claims its own position and can choose a receiving address, including an alternative if its original wallet cannot receive ETH.

Refresh to update pools, chain time and settlement. The frontend shows the most recent 20 markets and can find older ones by ID. Wallet account or chain changes require reconnecting. It does not automatically sign or submit anything. Listings and refunds remain accessible when Core reads fail.

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

Market status values are `0 = Open`, `1 = Resolved`, `2 = Cancelled`. Open includes the betting, measurement and settlement-waiting stages; use timestamps to distinguish them. Relevant state changes emit `MarketCreated`, `BetPlaced`, `MarketResolved`, `MarketCancelled` and `Claimed`. The packaged [frontend ABI](frontend/abi.json) includes the full tuples and custom errors for other clients.

## After launch

There are **no owner settings or post-deployment setters**. All numeric choices are the named public constants in `SqueekPredict.sol`: chain `11155111`, round duration `600`, block units `10^9`, supported windows `1/7 days`, minimum/maximum lead `1 hour/7 days`, resolution grace `30 days`, minimum stake `0.0001 ETH`, and per-side pool cap `100 ETH`.

The deployment operator publishes the confirmed contract address and hosts the `frontend/` folder. Before accepting bets, recheck the official Core deployment and ABI. A read-only check is provided:

```sh
node scripts/read-core.cjs https://ethereum-sepolia-rpc.publicnode.com
```

This reads at one Ethereum block 12 blocks behind the tip and checks Core version, unit scale, height/progress and the certified historical endpoint. It does not sign, settle Core, or resolve markets. The [saved observation](docs/core-observation.json) is evidence of an integration read during development, not a current oracle feed or an identity attestation.

Participants or a volunteer keeper must pay gas to resolve/cancel and users must claim their own funds. There is no automation service or keeper reward. If nobody submits resolution within the 30-day grace, the market refunds even if data was available. Operators should watch Core's `settledThroughRound` against the wall-clock round: a Reporter outage longer than the grace is the one condition under which decided markets are refunded. Anyone can run these operations, so an operator going offline does not grant special control over funds.

The Squeekchain Reporter and governance remain trusted for the underlying history and its availability. Implementation pinning detects a changed pointer; it is not a cryptographic proof of physical wheel activity and cannot detect every same-ABI semantic change. Settlement can be delayed, and Ethereum can reorganize. Confirmation handling and monitoring belong to operators and users. This MVP accepts test ETH only by convention; never use this deployment or a fork with valuable funds without independent adversarial review.

## Verification and limitations

See [security review notes](docs/SECURITY_REVIEW.md) for the concrete threat analysis and tested failure paths. Tests cover daily/weekly windows, strict thresholds, progress carry, zero-work gaps, delayed/batched settlement including a replay of the observed 3.7-day Reporter outage, source failure/change, timing boundaries, invalid bets, per-side pool caps and a filled side that cannot lock the other out, wallet positions on both sides, proportional payout, rounding, duplicate actions, rejecting receivers, reentrancy, cross-market isolation, and stateful conservation.

The frontend is deliberately small: it has no indexer, backend, fixed-price shares, secondary trading or automated settlement. Pool values are RPC snapshots; only transaction execution establishes the final state. The local tests are not an independent security audit, and no deployment or real-wallet transaction was performed for this deliverable.

## Included dependencies

`lib/forge-std/` contains forge-std **v1.9.7** sources and MIT/Apache licenses (tests only). `frontend/vendor/` contains ethers **6.15.0** and its MIT license (browser and optional Node tool). Neither needs an online package registry at verification time. See [THIRD_PARTY.md](THIRD_PARTY.md).
