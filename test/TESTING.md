# Independent Squeek Predict tests

These tests extend the accepted implementation and its existing suite. They require only
the repository's Solidity sources and vendored forge-std. They do not use a fork, RPC,
FFI, environment cheatcodes, or network installation. Test identities and oracle contracts
are local fixtures, never deployment settings.

Run the full suite with the assignment's seed:

```sh
FOUNDRY_FUZZ_SEED=0x096286e5cbd685072021ae4918c80601e10b2c032db0b5b3e0f9f8cf717606ec forge test
```

To keep all generated artifacts in disposable test storage:

```sh
FOUNDRY_OUT=test/scratch/out FOUNDRY_CACHE_PATH=test/scratch/cache forge build
FOUNDRY_OUT=test/scratch/out FOUNDRY_CACHE_PATH=test/scratch/cache FOUNDRY_FUZZ_SEED=0x096286e5cbd685072021ae4918c80601e10b2c032db0b5b3e0f9f8cf717606ec forge test
```

## Coverage added

| File | Properties and adversarial inputs |
| --- | --- |
| `SqueekPredict.boundaries.t.sol` | Invalid durations and IDs; exact lead-time boundaries; creation/event identity; one-wei and oversized bets; uint64 block-height/threshold limits; fractional progress carry; malformed first **or** second endpoint; decreasing physical work with increasing block units; exact historical calls despite later settlement and difficulty changes; incompatible configuration and truncated ABI returns; successful retry and oracle-independent refunds. |
| `SqueekPredict.claims.t.sol` | Complete rollback after a rejecting receiver; cross-market recursive claims; paid funds reinvested during a callback; three wei of final-claimant dust; maximum pool with uneven stakes; claims after 100 years; invariance to splitting bets in one wallet; six wallets holding both sides and claiming in shuffled order. |
| `SqueekPredict.stateful.t.sol` | Dynamic market creation, both durations and outcomes, zero/minimum/full-cap/excessive bets, time boundaries, stale/paused/unavailable settlement, random finalization and withdrawals, forced ETH surplus, recipient redirection, and exact expected errors. |

The two new stateless fuzz suites use 1,000 runs per property. The new stateful suite uses
256 sequences of depth 128 and fails on unexpected handler reverts, all configured inline.
Expected application reverts are checked by selector (or the fixture's specific error string)
inside handlers. Thus zero *handler* reverts does not mean failure paths were omitted.

## Invariant design

The five discovery passes from the supplied Pashov reference were applied directly to the
source. The Trail of Bits reference informed bounded generation, explicit edge examples,
independent models, and distinguishing harness errors from application failures. The test
code is original; no reference templates or additional libraries are vendored.

| Discovery pass | Source basis in `src/SqueekPredict.sol` | Assertion |
| --- | --- | --- |
| Conservation | `bet` (141–156), `claim` (208–224) | Actual ETH equals independently recorded deposits minus actual payments plus forced surplus; liabilities equal the same amount without surplus. Per-wallet YES/NO deposits, claim flags, and wallet balances agree with successful calls. |
| State transitions | `createMarket` (110–138), finalizers (160–205), `_openMarket` (280–284) | Questions, source identity, and deadlines stay fixed; only permitted finalizations occur; terminal states never reopen; rejected calls do not change the model. |
| Round trips and rounding | `_claimable` (238–246) | Refunds return exactly both stakes. Early payouts satisfy the mathematical inequalities defining floor rounding; the last winner receives only its own market's remainder, with bounded dust. Splitting a wallet's bet does not change its entitlement. |
| Adversarial value and liveness | `claim` (208–224), timeout cancellation (202–205) | A rejecting destination consumes nothing; another market cannot be claimed recursively; only the caller's entitlement is paid. Every modeled entitlement can be drained after a sequence with Core unavailable. |
| Prediction-market semantics | `resolve` (160–189), `_point` (264–273) | Strict threshold comparison, completed-block carry, certified exact endpoints, and fixed windows. A late frontier/current total cannot alter historical outcomes; malformed history cannot finalize a market. |

These assertions follow the public API and documented payout/window rules. In particular,
“a wallet never receives more than it deposited” is **not** a property of a prediction
market: winners legitimately receive losing stakes. Conservation is checked per market
and across all participants instead. Likewise, the sum of simultaneous payout previews
can exclude rounding dust while several winners remain; it is bounded by the remaining
pool and becomes exact for the final claimant.

The stateful handler maintains separate positions and cashflows from call inputs and
successful transfers. It does not populate its expectations from `getMarket` or use
`claimable` to decide which obligations to drain. A deterministic handler regression
exercises successful YES and NO settlement, stale data, a rejecting receiver, duplicate
and losing claims, dynamic creation, cancellation, and surplus, ensuring those branches
are reachable independently of random selection.

`TimelineSqueekCore` provides one coherent, monotonic history for overlapping markets
created in arbitrary order. It allows certification only through elapsed rounds. Its
one-eighth-block-per-round history yields exactly 18 blocks per day and 126 per week,
so the outcome oracle does not repeat the implementation's endpoint-floor calculation.
Malformed and extreme history is tested separately using the existing mock and explicit
ABI overrides.

## Limits

All Solidity checks are offline. They validate the application's use of the declared
Core V3 interface, not live Sepolia bytecode, physical wheel activity, Reporter honesty,
governance changes, or wallet/browser transactions. The
[official Core reference](https://docs.squeekchain.com/developers/core/) was consulted
to confirm point-read and settled-frontier semantics. The existing frontend, deployment
instructions, production contracts, and configuration are unchanged.

No implementation defect was reproduced by these additional tests. A passing suite is
evidence for the stated properties and input domains, not a proof of universal correctness.
