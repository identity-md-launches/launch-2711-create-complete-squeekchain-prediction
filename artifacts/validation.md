# Squeek Predict frontend validation

Date: 2026-11-05. Result: **Complete for the stated frontend scope**, with the limitations below. These are the worker's checks and observations, not an independent certification.

| Area | Final result |
| --- | --- |
| Brief requirements and acceptance criteria | 16 addressed; 0 missing, 0 fabricated |
| Known broken primary interactions | 0 in the exercised Chromium scenarios |
| Product/action on first 390px screen | Yes: populated card side buttons; real empty board Create market |
| Production build / TypeScript | Passed / passed |
| Unit / browser scenarios | 22/22 / 19/19 passed |
| taste@1 | 16/16 passed |
| Social metadata | Title, favicon, description, og:title, local 1200×630 og:image |

## Scope and consequential assumptions

Only the maintained frontend and its documentation/evidence were redesigned. `web/` retains React, TypeScript, Vite, wagmi and viem; `dist/` is the final static export. Contracts, deployment, economics, chain settings, ABI files, wallet connector configuration, package manifest/lockfile and existing build configuration were preserved.

The one visual idea is a restrained dark prediction-market board: complete questions above large, color-coded Yes/No pool actions. There is no landing-page hero before the product. The existing footer credits remain. The latest request for serious two-choice markets supersedes the earlier display of browser-only founder/NFT and multi-choice calls. Those historical modules remain source-only; the rendered board uses the deployed contract's binary completed-block markets.

**There are currently no markets to bet on in the live deployment.** The actual public chain observation at Sepolia block 12072244 returned marketCount 0, a matching runtime hash and an unpaused Core. The site exposes creation and clearly labeled templates; it never seeds a market, odds, volume or wallet balance. The screenshots named `fixture-*`, `positions-*`, `mobile-bet-slip`, `keyboard-focus-*` and `wallet-*` use test-only RPC/wallet fixtures. Screenshots named `live-*` use real read-only public RPC responses. No real signature, bet, creation, claim or other transaction was sent.

## Requirement coverage

| Brief requirement | Evidence |
| --- | --- |
| Clean dark theme | Dark semantic tokens, flat surfaces and violet brand; `styles.css`, inspected mobile/desktop screenshots |
| Active markets as clear cards | Open is the default filter; chain-driven `MarketCard` grid; two open fixture markets, honest zero-market live state |
| Question, odds, two big choices | Full question, pool percentages, Yes/No actions ≥58px; initial 50/50 and post-bet updates tested |
| Simple betting after connecting | One slip, native radios, quick amounts, payout, draft-preserving connection, simulated wallet action and receipt |
| Clear My Positions | Dedicated hash view, active stake/claim totals, position cards, direct claims; loaded-market coverage disclosed |
| Professional typography/layout | Local Inter, six-size scale, three weights, consistent gutters/grids; measured contrast and visual inspection |
| Mobile-friendly | Board at 320/390/800/980/1440; mobile wallet and full-width bottom sheets; no page overflow |
| Only serious two-choice markets | Rendered market grid uses verified SqueekPredict data; free-call/multi-choice catalogs are not mounted |
| Smooth, understandable experience | Filter recovery, honest empty/loading/error states, unchanged drafts, decline/retry, success/Done, focus return |
| Usable primary interactions | 19 browser scenarios cover the flows below |
| Static export with source/lockfile | `dist/index.html`, complete local assets, maintained `web/` source and existing lockfile; relative URLs audited |
| Build/typecheck/useful validation | Commands and actual outcomes below |
| Better Interface applied/reviewed | All six pinned domains read during implementation; coverage and corrected findings below |
| First screen and metadata | Assertions and screenshots at 390×844; all metadata present; local share PNG inspected |
| DESIGN.md | Root document extracted from final CSS/components and rendered observations |
| README | Install, development, preview, rebuild, validation, chain/asset scripts and limitations documented |

## Better Interface: six-domain review

The pinned contents/workflow and core principles of accessibility, layout, writing, typography, colors and UI were read before implementation. Relevant supporting material covered forms, focus, targets, wrapping, surfaces and motion. The documentation section was read before updating DESIGN.md. Attribution and licenses remain in `docs/DESIGN_GUIDANCE_LICENSE.txt` and `THIRD_PARTY.md`.

| Domain | Coverage and evidence | Limits / not applicable |
| --- | --- | --- |
| Accessibility — Checked | Native links/buttons/radios/dialogs; labels and field associations; keyboard Enter/Tab/Escape, inert background, restored trigger focus, visible white radio-label ring; board/slip axe WCAG scan: zero selected-rule violations | No screen-reader session, native zoom, physical device or full compliance claim. Forced-colors rules source-reviewed, not visually exercised |
| Layout — Checked | Source grids, grouping and DOM order; production subpath; screenshots at 320/390/800/980/1440; no horizontal overflow; populated action and empty-board creation visible at 390; phone dialog width asserted at exactly 390 | No native 200% browser zoom, RTL mirror or localization. Not every possible intermediate width was sampled |
| Writing — Checked | Consistent question/Yes/No vocabulary; strict-threshold rule; pool share versus probability; estimates include stakes; Sepolia/test ETH and loaded-market coverage; actionable empty/error/decline/retry/success text | No translations; external faucet/service availability is outside the frontend |
| Typography — Checked | Locally loaded Inter confirmed in real-read browser checks; six sizes and weights 400/500/600; body/questions line-height; tabular figures; full uint64 threshold fits 320px card/slip | Platform fallback rendering and manual text-enlargement session not verified |
| Colors — Checked | Actual solid computed foreground/background pairs measured; minimum sampled normal text pair 6.88:1; axe and taste contrast pass; selection has native radio plus border; written status and check/cross icons accompany color | No light theme is requested or implemented. Every alpha/hover/disabled/forced-color pair was not independently measured |
| UI — Checked | Shared flat surfaces, consistent icon set and radii; normal/hover/selected/focus/disabled/busy/empty/error/success code review; rendered board, selection, connection, success, error, recovery and focus states; named 150ms transitions; reduced-motion probe passes | No manual animation-panel playback at 10% speed. Mock confirmations are fast, so all transient wallet/pending stages were not manually observed. Third-party wallet UI not inspected |

## Findings corrected

Locations refer to the final source and its fix, not the generated bundle.

| Severity / domain | Finding, correction and recheck |
| --- | --- |
| High / layout, UI | The former light board/catalog conflicted with the requested dark professional binary marketplace. `web/src/styles.css:9` defines the dark system; `web/src/App.tsx:180` renders verified binary market cards and `App.tsx:194` contains clearly labeled creation templates. Historical free-call catalog imports were removed. Populated/live screenshots and binary card assertions confirm the final scope |
| High / layout | After the font loaded, the initial 320px zero-market screen placed Create market at y=866.09, below the tested 844px screen. `web/src/App.tsx:168` now omits irrelevant filters when the chain is empty. Zero-market tests at 320/390/1440 pass with creation on the first screen; `screenshots/live-390.png` was inspected |
| Medium / UI, layout | Chromium's default dialog max-width left a narrow phone sheet with a large asymmetric gutter despite width:100%. `web/src/styles.css:224` overrides `max-width: none`; the mobile sheet rule at line 429 spans the viewport. The browser suite now asserts a 390px-wide sheet and `screenshots/mobile-bet-slip.png` confirms the correction |
| Medium / writing | Over/Under fractional-line labels required translating the question before choosing. `web/src/model.ts:87` uses a complete question and `model.ts:92` uses consistent Yes/No sides; `web/src/MarketDialog.tsx:77` states strictly-more-than and exactly-target rules. Unit questions/labels and browser calldata tests pass |
| Medium / writing | Cancelled markets previously said Refunded before a user had claimed. `web/src/model.ts:19` now returns Cancelled; claims/refund eligibility are separate. Lifecycle unit tests and the open-refunds/claim scenarios pass |
| Medium / writing | The payout helper includes existing same-side stake but the estimate note did not explicitly say so. `web/src/MarketDialog.tsx:58` adds that explanation only when it applies. Exact payout unit tests and the connected betting flow pass |
| Low / UI | A successful creation left another Create market action. `web/src/CreateDialog.tsx:87` now offers Done after success. The creation scenario confirms exact threshold/window calldata and success. Pending market-card controls also use `busy` so another slip cannot replace a transaction's context |

The initial test run also exposed stale Over/Under test expectations and assertions racing the post-receipt refetch. The expectations were updated for the actual binary labels, assertions now await the resulting pool/claim DOM state, and each scenario closes its contexts. One probe invocation began before an asynchronous build completed and reported no index; it was rerun only after the production build finished. Final results below come from the completed export. One intermediate build/test session was terminated (143); the completed reruns are recorded below.

## Executed verification

Commands are from the repository root unless noted. Browser executables were installed under disposable `test/scratch/browsers`; set `PLAYWRIGHT_BROWSERS_PATH` to that folder when reproducing this particular run. No package or lockfile was changed.

| Command | Actual outcome |
| --- | --- |
| `npm ci --prefix web --cache test/scratch/npm-cache --ignore-scripts --no-audit --no-fund` | Installed the existing locked frontend dependencies; exit 0 |
| `npm run typecheck --prefix web` | Final source passed; exit 0 |
| `npm run build --prefix web` | Final source exported to `dist/`; exit 0. Main JS 653.41kB / 198.33kB gzip; Vite's >500kB advisory remains |
| `npm test --prefix web` | 22/22 passed; exact stakes, timing, payouts, labels, pool percentages and retained historical modules |
| `npm run verify:deployment --prefix web` | Source digests, frontend ABI, canonical ABI hash and creation bytecode matched retained pinned proof; exit 0 |
| `node web/scripts/observe-chain.mjs` | Real public Sepolia read; chain 11155111, marketCount 0, matching runtime hash; exit 0. `chain-observation.json` |
| `npm run test:browser --prefix web` | 19/19 Chromium scenarios passed; exit 0. `interaction-results.json` |
| `node web/scripts/check-live.mjs` | Real public RPC responses through curl, 28 read calls across four viewport contexts; all passed; exit 0. `live-read-results.json` |
| `node web/scripts/render-share.mjs` | Rendered local 1200×630 share PNG; exit 0, followed by production rebuild and visual inspection |
| `IMD_PLAYWRIGHT=./web/node_modules/playwright/index.mjs node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | Final probe: 16/16 checks; exit 0. `taste.json`. Direct browser RPC was unavailable, so it measured the error/retry state; populated and real-read tests supplement it |
| `ENGINE=webkit npm run test:browser --prefix web` | Attempted; browser launch failed because system libraries were unavailable. No WebKit pass is claimed |
| Supplied browser tool navigation | Attempted; browser launch failed with a socket-path limitation. Local Playwright Chromium supplied the rendered checks instead |
| `node web/scripts/audit-export.mjs` | Relative local assets resolve; five required metadata fields present; no protected-path changes or generated dependency/cache additions; conservative changed-file bytes below 8MiB. `export-audit.json` |

No Solidity tests were rerun because contracts were unchanged. The source hashes were checked by deployment verification. Browser tests use a bounded foreground static server at `/preview/`, exercise real compiled JS/CSS, decode mocked transaction calldata and send nothing to a chain. There are no dummy production records or signing credentials.

The 19 scenarios cover: binary cards/local assets; 320/390/800/980/1440 responsiveness; status/duration/search/sort/reset; stake validation/quick amounts/payout rules; connect/draft preservation/decline/retry/calldata; 50/50 and pool updates; creation/draft/window calldata; position claims; resolution/refunds; positions/help/navigation; wrong network/account changes; mobile wallet links; keyboard/focus/inertness; honest zero markets; RPC retry/runtime mismatch; long uint64 questions; pagination/lookup; axe/contrast; no uncaught page errors or missing local resources.

## Evidence and remaining limitations

Current screenshots only, all from the final export:

- `screenshots/fixture-320.png`, `fixture-390.png`, `fixture-1440.png`: **mocked** populated market board.
- `screenshots/mobile-bet-slip.png`, `keyboard-focus-390.png`, `wallet-390.png`, `positions-1440.png`: **mocked** interaction states. The visible test wallet is a test-only EIP-6963 provider.
- `screenshots/live-390.png`, `live-1440.png`, `live-creation-390.png`: **real read-only** chain state and creation dates. Entering a draft target does not create a market.
- `contrast.json`: six measured rendered pairs. `taste.json`: unmodified final probe output. The probe's disposable screenshots were inspected; no claim is made that its outage view was a populated/live-read pass.

WebKit, physical-device behavior, actual wallet signatures, Coinbase passkey creation, vendor app handoff, screen-reader output, native browser zoom, RTL/localization and manual animation-panel playback remain unverified. Direct browser access to the public RPCs was restricted here; curl could reach them. Runtime RPC availability and the creation of actual markets depend on the public chain and its participants. The export has no backend, private key, indexer, automated market seeding or settlement service.

The previous frontend's screenshots/reproduction report were replaced with this redesign's inspected evidence. The existing artifacts budget remains below 1.5MiB without changing any ignore file. Required source, lockfile, runtime assets and licenses remain complete; dependencies/caches/browser binaries stay outside the submission.
