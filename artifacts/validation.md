# Squeek Predict frontend validation

## Scope and assumptions

Complete for the stated repository scope, with the runtime limitations below. This is the worker's own evidence, not an independent certification.

The maintained application is `web/`; the finished static export is `dist/`. The existing Solidity contracts, Foundry configuration, dependencies and legacy client were preserved. The incomplete second duration in the brief is implemented as **7 days**, matching the previous project request and the deployed contract's only other supported window. A “wheel turn” is represented by official settled Squeek work/blocks; the interface explicitly does not claim one physical revolution equals one block.

The one visual idea is a compact cream-and-green market board with the hamster's wheel as its identifying illustration. This is an application, so questions and actions take priority over marketing copy.

## Acceptance coverage

| Requirement | Result and evidence |
| --- | --- |
| Usable site, working primary interactions | Met in production-export Chromium tests; browsing, filters, creation, betting, positions, claims, refunds and resolution exercised |
| Multiple realistic activity options | Editable 1,000/2,000 daily-block ideas and 10,000 weekly-block idea; 24-hour and 7-day real contract durations |
| Live deployment integration | Source/ABI/creation/runtime checks passed; read-only browser RPC observation matched Sepolia and deployed code |
| Current pools and own position | Same-block contract reads; short card values plus exact details; tested with mock positions on both lifecycle paths |
| Claim winnings | Correct contract call, recipient and resulting claimed state verified through a mock wallet; no real signature sent |
| Static `dist/index.html` and assets | Present with relative URLs, local SVG/PNG and hashed JS/CSS; served successfully at `/preview/` |
| Source and lockfile | `web/src/`, frontend configuration, `web/package.json`, `web/package-lock.json` included |
| Production build and typecheck | Both exited 0 after final source changes |
| Useful interaction validation | 14 Chromium scenarios with optional live read enabled; six focused model tests passed |
| Pinned design guides | All six domains reviewed below; applicable findings fixed and rechecked |
| Product/action on first screen at 390 | Real empty state shows product and Create; fixture with open markets shows both Bet buttons entirely within 390×844 |
| Share metadata | Title, favicon, description, `og:title`, and local 1200×630 `share.png` present |
| Design and setup documentation | Root `DESIGN.md` and updated README describe the final implementation and commands |

Hosting/IPFS naming occurs after this repository delivery; nothing was published by this task. No chain deployment, contract mutation or token issuance was performed.

## Commands and actual results

| Command | Result |
| --- | --- |
| `forge build --offline` | Exit 0; Solidity 0.8.26 compiled pinned sources. Existing timestamp/cast/send lint warnings were reported; Solidity was not changed |
| `npm ci` in `web/` | Exit 0 from the delivered lockfile; cache redirected outside the submission on this runtime |
| `npm run --prefix web verify:deployment` | Exit 0; canonical ABI hash, source digests, frontend ABI and creation bytecode matched; expected runtime hash regenerated |
| `npm run --prefix web typecheck` | Exit 0 |
| `npm run --prefix web build` | Exit 0; one advisory for the ~645 kB minified main chunk (~196 kB gzip) exceeding Vite's default warning threshold |
| `npm test --prefix web` | Exit 0; 6/6 tests passed |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/squeek-browsers CHECK_LIVE_RPC=1 npm run --prefix web test:browser` | Exit 0; 14/14 scenarios passed against `dist/` at `/preview/` |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/squeek-browsers IMD_PLAYWRIGHT=/tmp/squeek-check/node_modules/playwright/index.mjs node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | Exit 0; 16/16 checks passed on the final export |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/squeek-browsers node test/scratch/extra-checks.mjs` | Exit 0; additional Chromium creation/connect, modal accessibility, keyboard, RTL, reduced-motion and 200% text-enlargement checks passed |
| `git diff --check` | Passed |

Temporary browser binaries, extracted runtime libraries, dependency caches and scratch checks are excluded from delivery. The committed browser test is self-contained in `web/tests/browser-check.mjs` and uses standard dev dependencies. It owns and closes its temporary server/browser. The original Solidity test suites were not rerun because their implementation was unchanged.

The supplied browser MCP could not start its configured Chrome installation. Local Playwright Chromium successfully provided rendered screenshots and interactions instead. Playwright WebKit was downloaded and attempted; after resolving user-space libraries, its process still closed before a page opened with “Could not create EGL display: no supported platform available.” No Safari result is claimed.

## Contract verification and real observations

Pinned source commit: `841002e57646285ae0bd5a31e9af3c08f4f4839d`. Both contract source files matched that commit before ABI generation. Source digests and compiler output are retained in `web/scripts/deployment-proof.json` for subsequent local verification.

- Chain: Sepolia, `11155111`.
- Prediction address: `0x8bd658e58e94ab6a18a8b9d8c6108d1287facacf`.
- Canonical Keccak ABI hash: `0x3d6fa830e7687fd236ee229edff0d15994319e898520fc82bc4e75ae1c3987ec`.
- Expected and observed runtime hash: `0xa428c2a0ae99d4bd68a02aa893d5cc70698af0c82d478efa475e35adeee6555b`.
- `CORE()` was read from the verified contract rather than supplied through a guessed runtime address.

At recorded block **12,050,951**, market count was **0**, Core height was **13,095**, certified frontier was **1,973**, and Core was not paused. These are dated observations in `chain-observation.json`, not seeded application state. Later screenshots may show a later Ethereum block. Command-line HTTP requests to all three supplied RPC endpoints returned 403, while browser-origin requests to the primary endpoint succeeded. The application retains all configured fallback RPCs and an explicit retry/stale-data state.

## Interaction coverage

`interaction-results.json` records each scenario. Tests covered:

1. Real read-only RPC state, exact bytecode verification, subpath assets and zero-market state.
2. Six market lifecycle states; open-market priority and fully visible mobile Bet controls.
3. Status/duration/search filters, unmatched searches and reset.
4. EIP-6963 wallet discovery, generic-row suppression, Escape, keyboard opening, focus restoration and connection.
5. Wrong-chain transaction disabling and a wallet network switch.
6. Invalid minimum stake, quick amounts, selected side, rejected approval, then successful payable bet; contract, ID, boolean and wei value asserted.
7. Positions/claimable filter, payout recipient/calldata and claimed state.
8. Opening unmatched refunds, claiming a refund and permissionless resolution.
9. Weekly market creation, invalid fractional target, corrected target and round-aligned calldata.
10. Exact older-ID lookup.
11. Help dialog and market-grid accessibility scan.
12. No horizontal overflow at 320, 390 and 768; mobile betting dialog fits its width.
13. Four phone wallet-app links, Coinbase Smart Wallet and absence of a QR/relay path.
14. RPC failure, explicit retry/recovery, and a deployed-code mismatch disabling usable state.

All market/position/transaction cases use explicitly test-only mocked providers. No test data or test wallet is bundled into the production application. The optional live scenario never requests an account or sends a transaction. A mock receipt and wallet approval validate frontend behavior, not execution on Sepolia.

## Better Interface coverage

| Domain | Reviewed and checked | Limits |
| --- | --- | --- |
| Accessibility | Native buttons/links/selects/radios/dialog, landmarks, skip link, labels, `aria-invalid`/descriptions, focus return, keyboard entry/Escape, visible focus styling, persistent transaction status region, text status alongside color. Market-grid and creation-dialog axe scans found zero violations in WCAG 2 A/AA, 2.1 AA and 2.2 AA tagged rules | No screen-reader session, physical device or complete accessibility-conformance claim. Announcement timing remains unverified with assistive technology |
| Layout | Source DOM order, shared edges, responsive grid, wrapping, subpath export, full questions, mobile/desktop screenshots, 320/390/768/1440 reflow, RTL reflow, 200% text enlargement. Open bets and claimable positions prioritized | Native browser zoom, translated content and every intermediate width not verified |
| Writing | Source and rendered controls/errors reviewed; test ETH, irreversible stake, gas, variable payouts, official settled data, strict threshold and future window explained. Empty/error states offer actions. Ideas explicitly distinguished from active markets | No localization or user research performed |
| Typography | Six-token scale, two weights, declared system-font fallbacks, full wrapping, selectable values and tabular numerals; narrow and desktop rendering inspected | Exact system fallback selection varies by platform; no custom webfont loading is claimed |
| Colors | Semantic hex tokens; live-export probe measured text contrast, all measured pairs passed. Examples: ink/page 11.31:1, muted/page 4.73:1, primary label/fill 9.48:1, muted/empty panel 4.58:1. Fixture market grid and create dialog also passed automated scans | No dark theme exists; forced-colors behavior is source-reviewed only; no claim that decorative artwork is text contrast evidence |
| UI | Rest/hover/active/disabled/loading/empty/error/success definitions inspected; dialogs, selected side, quick amounts, rejection/retry and pending/confirmation states exercised. Borders without card shadows, one icon set, 150ms named-property transitions, no endless animation, reduced-motion check | No 10%-speed Animations-panel session; real wallet SDK onboarding/handoff and native Safari animation behavior unverified |

## Findings, corrections and rechecks

| Severity / source | Finding and impact | Correction and evidence |
| --- | --- | --- |
| High · `web/src/App.tsx:97`, `web/src/styles.css:197` | Newest-only ordering put closed markets above available bets. The first mobile bet action could be below the screen | Open markets lead; claimable positions lead their view. Compact mobile intro, navigation spacing and Create label. Final browser assertion requires the first Bet button's entire box below 844px at width 390; final `screenshots/fixture-390.png` confirms both sides visible |
| High · `web/src/styles.css:79`, `web/src/styles.css:196`, `web/src/styles.css:198` | At 200% text enlargement, header wallet control, Create control and status filters overflowed the viewport | Allow header, heading and filter groups to wrap. Recheck found no overflow; `screenshots/text-enlargement-200.png` records the final enlarged state |
| Medium · `web/src/App.tsx:48` | A positions-only filter could persist after returning to Markets and hide the expected actions | Reset status filter on hash navigation. Refund and resolution interaction scenario passed after the correction |
| Medium · `web/src/App.tsx:94` | Older-ID lookup could behave like substring search and include unrelated IDs/targets | Lookup now isolates the exact market ID. Interaction test returned one intended result |
| Low · `web/src/App.tsx:105`, `web/src/MarketDialog.tsx:12` | Non-urgent transaction announcements were tied to content that could be newly mounted or hidden | Keep one persistent polite live region outside conditional forms; preserve visible errors as alerts. Source/typecheck/interaction rechecked. Screen-reader timing remains explicitly unverified |

No known unresolved high/medium findings in the tested repository scope. The build chunk-size advisory remains a performance limitation, not a build failure. The real deployment's empty market list remains visible rather than being replaced with fictitious activity.

## Screenshots and probe evidence

All images are actual Chromium screenshots of `dist/`. The `fixture-*` files and the phone picker use test-only provider state, never real participants or real transaction confirmations.

- `screenshots/live-390.png`, `screenshots/live-1440.png`: real read-only empty market state; product/Create on the first phone screen.
- `screenshots/fixture-390.png`, `screenshots/fixture-1440.png`: several realistic market states from mocked reads; first mobile bet controls and desktop grid.
- `screenshots/fixture-mobile-bet.png`: actual mobile bet form with test-only market data.
- `screenshots/phone-wallet-picker.png`: actual phone picker with wallet links and Smart Wallet.
- `screenshots/text-enlargement-200.png`: 200% text enlargement, distinct from native browser zoom.
- `taste.json`: final 16/16 probe measurements; `additional-checks.json`: final extra Chromium checks.

The probe covered the real entry/empty state at 320, 390 and 1440, plus reduced motion. Fixture forms and other lifecycle states were checked separately; the probe is not claimed to cover every state.

## Remaining limitations and packaging

No real-wallet approval, passkey setup, mobile app handoff, on-chain bet/claim or third-party SDK service availability was established. Safari/WebKit, physical devices, native 200% zoom, screen readers and a detailed forced-colors visual inspection remain unperformed. Prediction settlement still depends on Core certification and someone paying gas to resolve/refund. Pool data can change between read, simulation and mining; the contract enforces the final result.

The Git additions fit the 8 MiB cap. Generated dependencies/caches have a zero-byte path budget at every nesting level. Delivered evidence under `artifacts/` has a 1.5 MiB budget. `dist/` includes the complete local runtime assets; there are no package archives, registries, caches, submodules or source maps in the export. See `package-budget.json` for the final measured path/byte inventory.
