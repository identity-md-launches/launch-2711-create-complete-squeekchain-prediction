# Security review notes

This is a separate self-review of the completed design and tests. An independent contributor has not audited it. No real-wallet transaction or deployment was performed.

## Threats reviewed

| Concrete attack / failure | Expected behavior and evidence |
| --- | --- |
| Bet after seeing work from the measurement window | Betting rejects at the exact first round's start; full measurement begins then. Boundary test bets at start minus one and rejects at start. |
| Delay resolution to include a later productive round | Queries fixed historical endpoints. Test adds large work after end and resolves a day later; the result excludes that work. |
| Treat an unreported round as zero and force NO | Frontier below the final round reverts `NotSettled`. Certified zero-work gaps resolve normally. |
| Reprice historical work using current difficulty | Outcome uses official cumulative block units at each endpoint, with each height floored separately. Fuzz tests and a carried-progress example exercise the distinction. |
| Core changes version, stream, genesis, units or implementation | Compatibility checks reject resolution. Malformed point responses and decreasing ledgers also revert. Timeout cancellation remains callable without consulting Core. |
| Core pause or permanent revert traps deposits | Previously certified history resolves while paused; a permanently reverting Core cannot block timeout refunds or claims. |
| Cancel a losing market after it resolved | Final status prevents further resolution/cancellation/betting. Exact refund-time boundary disables resolution and enables cancellation only for still-open markets. |
| Create a one-sided pool and collect somebody else's funds | An unmatched market refunds its actual contributors; it never consumes other markets' balances. |
| Send an adversarial receiving contract a payout | State and liability update before the transfer; a guard rejects recursive claim. A rejecting receiver rolls back its own attempt and may choose a different recipient. Other claims continue. |
| Redirect another wallet's position or claim twice | Position is keyed by `msg.sender`; destination is caller-chosen only for its own claim. Duplicate payout/refund attempts revert. |
| Round payouts repeatedly or overflow their product | Stakes accumulate per wallet, each wallet claims once, and total pool is capped at `100 ETH`. Earlier winners receive fixed floored shares; final winner receives the exact remainder. Randomized payout order conserves the entire pool. |
| Drain a different market or increase odds using forced ETH | Pool accounting is separate from raw balance. Isolation and forced-surplus tests show only accounted deposits can be paid. |

Stateful tests exercise arbitrary sequences of betting, time advancement, resolution/cancellation and withdrawal across four markets and six wallets. Invariants require balance equals total liabilities, market liabilities sum to total liabilities, and every deposit is either held or paid. Each run ends by finalizing and claiming every remaining entitled position, requiring no residual participant funds.

## Remaining trust and operational risks

- Core's Reporter/governance controls the source ledger. The market does not verify physical work or detect all semantic changes using the same ABI and implementation identity. A pointer change restored before resolution is not logged by this application.
- Resolution needs someone to submit a transaction during the fixed three-day grace period. A stale or absent source, incompatible upgrade or missed operation results in refunds, even if a winner would otherwise be known. There is no bond, reward or guarantee for a keeper.
- Consensus timestamps select round boundaries. Ethereum reorganizations affect both source and market transactions. The UI shows latest RPC snapshots; operators must decide confirmation policy before presenting transactions as final.
- Stakes are irrevocable during betting; future bets can change a payout. The contract has no fee, spread or fixed odds. Last claimant dust depends on claim order by less than one wei per prior winning claim.
- Losing positions have no payout; unclaimed winning/refund positions have no expiry. Forcibly received surplus has no recovery function. There is no admin rescue, pause, sweep or upgrade.
- The frontend trusts the confirmed deployment address entered by the user and the wallet RPC. Checking `CORE` and chain constants is a usability check, not source-bytecode authentication. Use the verified deployment handoff.

## Checks used

The delivered suite uses Solidity 0.8.26 with the task's exact pinned fuzz seed. `forge build`, `forge test`, `forge coverage --report summary`, `forge fmt --check`, Node argument/ABI tests, and a live read through the included Core tool were run. Coverage and tests do not constitute an independent audit. Slither, Mythril and browser-wallet end-to-end transactions were not run.

Forge's lint warnings about timestamps, checked narrowing casts and the recipient ETH call correspond to these explicit design decisions: deadlines use consensus timestamps; deadline/round bounds are checked before narrowing; claim recipients are authorized by the position holder; and checks/effects/interactions plus the guard protect transfers. These warnings were reviewed rather than treated as proof of an exploit or proof of safety.
