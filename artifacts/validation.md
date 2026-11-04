# Squeek Predict frontend validation

Worker review dated 2026-11-04. This report records local evidence, not independent certification.

## Scope and assumptions

Improved the existing React/TypeScript frontend and regenerated the repository-root `dist/`. Kept the existing Sepolia deployment, ABI verification, wallet configuration, economic rules and every hamster/founder prediction family. No Solidity, build configuration, dependency manifest or lockfile changed. No transaction was broadcast.

The requested Polymarket-style direction is implemented as a light market board, clear percentage odds, large outcome buttons and a compact slip. Percentages mean pool share; they do not imply fixed-price shares or a statistical oracle. The first public read returned zero markets, so production offers creation rather than seeded example markets. Populated screenshots use the test-only RPC/wallet fixtures in `web/tests/browser-check.mjs`.

The pinned Better Interface workflow and core principles of all six domains were read and applied during implementation. The existing guidance licenses are preserved. The final implemented values are documented in root `DESIGN.md`.

## Six-domain coverage

| Domain | Coverage and evidence | Limits |
| --- | --- | --- |
| Accessibility | **Checked.** Native links/buttons/radios/fields/dialogs; associated input errors; unique modal names; stable transaction status; visible 2px focus; keyboard entry, radio arrows, Escape and focus return; native modal background inertness; mobile board and open-slip axe scans with WCAG 2 A/AA, 2.1 AA and 2.2 AA tags, no violations. `screenshots/keyboard-focus-390.png`. | No screen-reader session or forced-colors rendering. Native browser chrome remains reachable from a modal; tests verify background controls cannot take focus. Automated scans are not a full accessibility audit. |
| Layout | **Checked.** Production export served under `/preview/`; populated, empty, outage, loaded and connected states; first screens at 320/390; 1440px board; 800px real-read layout; headers disconnected/connected/wrong-network across 16 widths; long uint64 labels in cards/slips. Market buttons fit the first 390×844 screen. | No native browser zoom, physical device, RTL or pseudo-localization. |
| Writing | **Checked.** Side/action names, test ETH context, pool-share explanation, local free-call disclosure, fresh/stale data labels, empty states and recovery instructions. Contract-supported windows remain distinct from free calls. | Third-party wallet/service copy is outside this frontend. |
| Typography | **Checked.** Six-token scale, system font stack and 400/600/700 weights; tabular values; full thresholds and amounts wrap; all mobile editable fields ≥16px. Rendered type scale measured by taste. | Platform font rasterization varies; native text enlargement was not tested. |
| Colors | **Checked.** Actual computed foreground/background pairs sampled from the populated export; six ratios saved in `contrast.json`. Taste and axe also checked visible text. Outcome/status meaning has written labels. | Not every hover/disabled state or browser/OS combination was measured. Image colors are not text contrast evidence. |
| UI | **Checked.** Flat white surfaces, restrained shadows only for dialogs, hover/focus/pressed states, skeleton/error/empty states, busy controls, confirmation/Done, retry and wallet rejection. Reduced-motion media was inspected by the probe; source disables animation/transition under reduce. | No Animations-panel 10% replay. WebKit could not launch; native wallet/passkey service interaction was not performed. |

No additional theme or locale is implemented; theme-switching/localization-specific guidance is **Not applicable** to this scope.

## Consolidated findings, fixes and rechecks

Source references identify the final implementation.

| Severity / domain | Finding and user impact | Fix / source | Recheck |
| --- | --- | --- | --- |
| High / layout | The prior catalog preceded the live board, requiring substantial scrolling before an actual ETH market. | The live board now precedes Explore more predictions; all existing families remain below. `web/src/App.tsx:213`, `web/src/App.tsx:257`. | Populated 390px screenshot contains the full first question, both sides and volume; first answer-row bottom measured below 844px. |
| Medium / writing + UI | Empty pools displayed “Open” instead of the requested neutral starting odds; multipliers alone were hard to scan. | `poolPercent` displays 50/50 when empty and exact BigInt-derived shares after bets; percentages and volume are shared by live/template cards and slip. `web/src/model.ts:103`, `web/src/MarketCard.tsx:27`, `web/src/HamsterMarkets.tsx:137`. | Model tests cover empty, one-sided, asymmetric and large pools. Browser test confirms 50/50 → 100/0 → 50/50 and volume after two confirmed fixture bets. |
| High / UI | Connecting closed the slip and discarded its chosen side/amount, forcing the visitor to restart. | Keep the selected market snapshot while the account query changes; only close drafts on an established account change/disconnect. Stack the wallet dialog above the draft. `web/src/App.tsx:82`, `web/src/MarketDialog.tsx:32`, `web/src/CreateDialog.tsx:57`. | Custom 0.0067 ETH Under draft survives dismissing/reopening the wallet picker, connecting, rejection and retry. Creation draft also survives connection. |
| Medium / layout + writing | “My bets” was easy to overlook and navigating from a long catalog could leave the visitor scrolled away from the positions view. | My positions naming, desktop summary and mobile navigation; scroll/focus the main view on navigation. `web/src/App.tsx:73`, `web/src/App.tsx:186`, `web/src/App.tsx:267`. | Navigation from history returns to scrollY 0, focuses main and opens the right view; Skip to content preserves that view. Claim and resolution scenarios pass. |
| High / layout | In the first revision, connecting at 320px caused 4px horizontal overflow; the wrong-network label at 390px caused 19px overflow. | Hide the redundant wallet icon on compact connected headers, and brand text below 381px when connected. Keep the named home link and full H1. `web/src/Wallet.tsx:27`, `web/src/styles.css:386`, `web/src/styles.css:431`. | All 16 header widths rechecked in all three states, including the full Switch to Sepolia label; no horizontal overflow. |
| Medium / layout | Screenshot review after shortening the hero found the illustration overlapping the mobile description. | Reserve 80px beside the description and use shorter factual copy. `web/src/styles.css:394`, `web/src/App.tsx:197`. | Text-fragment/image intersection assertion passes at 320/390; final screenshots visually inspected. |
| Medium / typography | Three equal narrow mobile selects visibly clipped “Closing soon.” | Two-column search/sort and window/type toolbar; shorter “Soonest” sort label. `web/src/styles.css:404`, `web/src/App.tsx:234`. | Final 320/390 screenshots and filter interactions checked. Controls remain 16px. |
| Medium / UI | Pools and long settlement explanations preceded the stake control and primary action in the old slip. | Keep side/stake/estimate/action together and disclose full dates, pools, multipliers and rules beneath. Confirmation offers Done. `web/src/MarketDialog.tsx:51`, `web/src/MarketDialog.tsx:73`. | 390px slip shows stake, estimated payout and Connect to place bet in the viewport; selection, exact calldata, errors, claim and resolve flows pass. |
| Medium / accessibility | Stacked dialogs would have reused the same heading ID. | Native modal headings receive React `useId` values; existing focus/scroll restoration retained. `web/src/Modal.tsx:5`. | Wallet handoff, modal axe scan, keyboard entry, background inertness and focus return pass; focused side screenshot inspected. |
| Low / typography | Hero actions used smaller text than desktop controls; the probe also misclassified the nearby 14px Create market button as a kicker label. | Use the standard 16px desktop action size, retaining 14px on phones. `web/src/styles.css:84`, `web/src/styles.css:396`. | Final probe reports no kicker labels; the action remains on the first screen. |
| Medium / UI | The creation stepper converted full uint64 thresholds through Number, losing precision at the maximum. | BigInt arithmetic and clamping. `web/src/CreateDialog.tsx:52`. | Browser creation scenario exercises the exact maximum and decrement before creating its normal fixture market. |

The test for post-bet odds was corrected to wait for the refreshed snapshot rather than assume it arrived in the same render as the receipt-success message. The success message confirms the receipt; the subsequent RPC refresh supplies the updated pools.

## Commands and observed results

Run from `web/` unless shown otherwise:

| Command / check | Actual result |
| --- | --- |
| `npm ci --no-audit --no-fund` | Exit 0 using unchanged lockfile; dependencies excluded from delivery. |
| `npm run build` | Exit 0 after final source changes. Vite 7.3.7; `dist/index.html` and local assets regenerated. Main JS 686.27 kB, 208.55 kB gzip; existing >500 kB advisory retained. |
| `npm run typecheck` | Exit 0, `tsc --noEmit`. |
| `npm test` | Exit 0; 22/22 tests pass. |
| `npm run verify:deployment` | Exit 0; source digests match; ABI `3d6fa830…3987ec`; runtime expectation `a428c2a0…6555b`; original source commit retained. |
| `PLAYWRIGHT_BROWSERS_PATH=../test/scratch/browsers npm run test:browser` | **26/26 passed**, exit 0. Chromium production-export interactions; final result is saved in `interaction-results.json`. All requests/signatures in this suite are mocks, and nothing is broadcast. |
| Root: `IMD_PLAYWRIGHT=./web/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=./test/scratch/browsers node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | Final run: **16/16 pass** at 320, 390, 1440px and reduced motion. `taste.json` is the unmodified probe result. Direct external RPC reads failed in its sandboxed browser, so this probe covers the actual outage state, not a successful chain read. |
| Real public reads via curl | Sepolia 11155111 at block 12063174: exact expected runtime code, zero markets and Core address read from contract. `chain-observation.json`. Read-only. |
| Real-data browser rendering | A bounded scratch script served the production export at `/preview/` and forwarded browser RPC requests through curl to the configured public endpoints. Four widths (320/390/800/1440): zero markets, usable exact creation dates, no page errors, no non-aborted local resource failures and no horizontal overflow. Cancelled local document requests (`net::ERR_ABORTED`) are retained separately in the evidence. `live-read-results.json`; these are real responses, not fixtures. |
| WebKit launch | Attempted after installing its browser binary under scratch; failed before launch because GTK/GStreamer and other system libraries are missing. No WebKit pass is claimed. |
| Separate browser tool | Its isolated loopback could not reach the shell preview (`ERR_CONNECTION_REFUSED`); local Playwright provided actual export screenshots and interaction checks instead. |

The pinned probe's 15 compact controls below 44px are reported, not WCAG target-spacing failures. The measured targets were at least 24px or sufficiently spaced; primary betting and wallet targets are larger. Representative measured text ratios: main question 15.71:1, metadata 5.25:1, green odds 5.29:1, red odds 5.13:1, wallet action 6.06:1, active chip 5.41:1. These apply to the exact computed pairs in `contrast.json`.

Header widths: 320, 375, 390, 420, 421, 760, 761, 768, 800, 820, 850, 851, 876, 900, 901, 1440px. Browser interaction viewports use 844px phone height and a 1000px desktop height. Real-data captures use 900px height.

## Delivered evidence and completion

- `screenshots/fixture-1440.png`, `fixture-390.png`, `fixture-320.png`: populated test-only market board.
- `screenshots/first-screen-390.png`: complete first on-chain question and side buttons at 390×844.
- `screenshots/mobile-bet-slip.png`, `keyboard-focus-390.png`, `long-line-slip-390.png`: slip, visible keyboard focus and full uint64 threshold.
- `screenshots/wrong-network-390.png`: connected network-switch control.
- `screenshots/positions-1440.png`, `positions-390.png`: loaded positions and claim summary, using fixtures.
- `screenshots/live-390.png`, `live-1440.png`: real empty-market board and certified wheel data.
- `export-audit.json`: relative HTML/JS asset graph, scope and size audit.
- `interaction-results.json`, `taste.json`, `contrast.json`, `chain-observation.json`, `live-read-results.json`: current validation results. The retained `revision-reproduction.json` belongs to the previous job and is historical evidence.

**Complete for the stated frontend scope**, subject to the recorded verification limits. Real wallet approvals, third-party service availability, physical devices, native zoom, screen readers, RTL and WebKit remain unverified. The website has no backend/indexer; positions cover loaded markets, free calls stay in this browser, and settlement still depends on certified Core history and a participant submitting the existing contract actions.

Packaging audit: `dist/` is 1,075,636 bytes; changed content is approximately 2.34 MiB against the 8 MiB limit. The artifact evidence is approximately 1.36 MiB against its existing 1.5 MiB path budget. `git diff --check` passes. No ignore file changed.

The final source, existing lockfile and complete static export are included. Dependency/browser/cache directories are excluded. Artifact evidence stays below the existing 1,572,864-byte path budget, and the total changed-file payload is checked against the assignment's 8 MiB limit.
