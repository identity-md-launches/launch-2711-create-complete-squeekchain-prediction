# Hamster markets restoration — 2026-11-03

This job restores the hamster markets that had dropped off the board, and keeps the founder/NFT previews and the homepage work from the previous job. Earlier sections below are historical records.

## What was wrong

A read of the live contract at the start of this job showed `marketCount()` = **0** for `0x8bd658e58e94ab6a18a8b9d8c6108d1287facacf` on Sepolia. The previous build only listed hamster markets that already existed on-chain, plus a short "Up next" list of create buttons. With no on-chain markets, the founder/NFT preview cards were the only market cards on the page, so the hamster markets looked gone. The 1h/6h windows, longest runs and activity windows only appeared as Wheel form statistics.

## What changed

- `web/src/hamster.ts` (new, pure): an 11-market hamster catalog in three groups.
  - **Block counts**: next hour, next 6 hours, 24-hour line, 7-day line, record attempt.
  - **Longest runs**: longest block streak tomorrow, rounds with blocks tomorrow.
  - **Activity windows**: block in the next hour (yes/no), busiest part of tomorrow, 24-hour wake-up line, night shift.
  - Also in the file: UTC window maths, the round grid, settlement rules and browser storage.
- `web/src/HamsterMarkets.tsx` (new): the catalog is always visible.
  - **On-chain lines** (24h, 7d, wake-up, record, night shift) show any matching open SqueekPredict market with live odds. Tapping a side opens the existing bet slip. If no market is open for that line, **Open this market** opens the existing create dialog with the line already filled in.
  - **Free calls** (1h, 6h, streak, active rounds, wake-up hour, busiest daypart) take no ETH, because the deployed contract cannot settle them. They lock when the window starts.
  - Free calls are settled in the browser from certified SqueekCore `roundPage` heights once SqueekCore has certified the window. Only the endpoints those windows need are read (`readRoundHeights`, `web/src/history.ts`).
- `web/src/App.tsx:207-210`: new category chips (All markets / Block counts / Longest runs / Activity windows / Founder & NFT), then the hamster catalog, **Set your own line**, and the founder/NFT previews. Below them, the full on-chain list keeps its filters, search, sort and the My bets tab. The old "Up next" idea buttons are now part of the catalog. The custom window is still available through **Set your own line**.
- `web/src/HistoryPanel.tsx`: under Stats, "Your hamster calls" lists each saved free call as Right/Missed with the certified count. Other states are "Window not finished", "Awaiting certification" and "Couldn't check yet". "Your founder calls" is unchanged.
- Unchanged: the homepage (Squeek Predict title, hamster-on-neon-wheel image, credits line), Wheel form, past weeks, all founder/NFT markets, the wallet, betting, creation, claims, resolution and contract verification.

## Better Interface review (six domains) and findings

| Domain | Coverage | Findings and fixes |
| --- | --- | --- |
| Accessibility | Category chips and call options are real buttons with `aria-pressed`. Groups have `role="group"` and labels. Sections have h2/h3 headings. The 390/320 axe WCAG 2.2 AA scan in the browser suite ran with the new catalog and reported 0 violations. | None open. |
| Layout | The catalog uses `repeat(auto-fill, minmax(280px, 1fr))` and drops to one column on phones. The category chips scroll sideways on phones like the status chips. `noOverflow` checks at 1440 (new hamster test), 390 and 320 passed. | None open. |
| Writing | Each card says whether it is "On-chain · test ETH" or "Free call · no ETH". Each has a "How it settles" disclosure. When SqueekCore data has not loaded, cards never show an invented line. | `HamsterMarkets.tsx:97`: chain cards showed a fallback line ("1,000.5") before data loaded. **Fixed**: they now show a generic title until the 7-day average is known. |
| Typography | Uses the existing six-size scale. Card titles reuse `h3`/`--t-title`. No new sizes were added. | None. |
| Colors | Existing tokens only. Free calls keep the dashed edge used by founder previews; on-chain lines use solid edges. The taste contrast check passed. | None. |
| UI | Covered states: loading/unavailable (disabled options with a reason), saved call, cleared call, open on-chain market, no open market, settled/awaiting/unchecked history. | `HamsterMarkets.tsx:86-87`, `:127-128`, `MarketCard.tsx:16-17`: the taste probe flagged status pills placed above headings as eyebrows (5 at 1440px). **Fixed**: the heading now comes first, with type and status on the line below. `App.tsx:238`: with zero on-chain markets the board said "Every listed window has closed". **Fixed**: that notice now only shows when markets exist. |

Rendered checks were run in headless Chromium (Playwright) against the production export. Not covered: screen-reader sessions, physical phones, native zoom, WebKit, and real wallet signatures.

## Commands and actual results (this job)

| Command (from `web/` unless noted) | Result |
| --- | --- |
| `npm ci` | Installed from the unchanged lockfile. |
| `npx tsc --noEmit` (`npm run typecheck`) | Passed. |
| `npm test` | **20/20** passed, including 7 new tests in `tests/hamster.test.mjs`. They cover catalog families, UTC windows, window ids, round-grid alignment with the live genesis, the strict over rule (exactly the line is under), and streak/active/daypart settlement with ties. |
| `npm run build` | Passed (Vite 7). Main chunk about 683 kB minified / 208 kB gzip. The existing >500 kB advisory remains. |
| `node web/tests/browser-check.mjs` (repo root) | **18/18** Chromium scenarios passed against `dist/` at `/preview/`, with mocked RPC and wallet. `npx playwright install` could not download its newer browser here, so a preload (in `test/scratch/`, not delivered) pointed `chromium.launch` at the cached Chromium 1247 headless shell. The new scenario checks all 11 hamster cards and 4 founder cards. It also checks that a free 1h call (Over 20.5) and a streak call survive a reload, and that a pre-seeded past-hour call settles as "Right · 18 blocks" from mocked certified heights. It then checks the 24h on-chain card opening the bet slip, the category filters, that no wallet transactions were sent, and that nothing overflows. [interaction-results.json](interaction-results.json) |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` (repo root, `IMD_PLAYWRIGHT` set to the repo's Playwright) | First run: 15/16, eyebrows failed (see above). After the fix: **16/16** at 320/390/1440. The sandboxed probe could not reach Sepolia, so it measured the RPC-unavailable state. [taste.json](taste.json) |
| 390 screenshot review | The first screen shows the header, the "Squeek Predict" title, the hamster image, the lead line and **Bet on a market** / **Create market**, with the category chips and "Hamster markets" just below. |

Screenshots updated: `screenshots/fixture-1440.png`, `fixture-390.png`, `fixture-320.png`.

Limitations:
- Free calls are stored per browser and carry no stake.
- Certification currently runs about 7–8 days behind real time (`settledThroughRound` 1973 when read this job), so free calls stay "Awaiting certification" for that long.
- Real-ETH markets for 1h/6h, streak and daypart need a new contract version. This job deploys nothing.

---

# Revision validation — 2026-11-03

This is the current review of the revised export. The original upgrade record below is historical; its counts, live observations and limitations are superseded by this section where they differ. All four reported defects reproduced before source changes and are fixed. Raw original measurements: [revision-reproduction.json](revision-reproduction.json).

## Scope and corrections

This revision preserves the existing application, contracts, ABI/runtime verification, wallet connectors and transaction construction. No dependency, package manifest, lockfile, build configuration or ignore file changed. Only the reported layout, history completeness and block-completion terminology were corrected, with regression tests and rebuilt static assets.

| Finding | Source in final implementation | Original reproduction | Correction and recheck |
| --- | --- | --- | --- |
| High: long valid market lines | `web/src/styles.css:131`, `:234`, `:242`, `:290`, `:334` | At both 320/390px, uint64 max made the board 567px wide. Slip scrollWidth 744px; normal 1,000.5 line at 320px scrolled to 327px. | Zero-minimum two-column grids and children, wrapping full labels/numbers, stacked side labels/multipliers on phones, wrapping submit action. Full uint64 cards and connected slips pass at 320/390/1440px; normal 1,000.5 passes at 320px. Final 320/390 document widths equal the viewport; 318/388 slip client and scroll widths match. Text-range bounds prove labels and multipliers fit, and keyboard side selection works. |
| High: wallet header overflow | `web/src/styles.css:304`, `:345` | Wrong-network header reached 407px at 375/390; disconnected header reached 827px at 761–820. | Compact header + navigation through 900px; linked, named logo without brand text through 420px. A first 850px cutoff still failed at 851 after the claim badge loaded (right edge 876.25), so only header/navigation use 900; the existing content breakpoints remain. Disconnected, connected and network-switch states pass at 16 widths, and switching succeeds through the mock provider. |
| Medium: unavailable history became zero | `web/src/history.ts:34`, `:78` | Missing rounds 99995–100000 changed 18/54/108/216/432/3024 blocks to six zeros and Resting. | Require every requested certified endpoint; throw on missing nonnegative data. Six failed endpoints, a single interior failure and an uncertified endpoint all show the wheel retry state without stats. Retry restores exact complete totals. Known pre-genesis time remains zero; short-history regression passes. |
| Medium: activity claims differed from the wager | `web/src/model.ts:89`, `:93`; `WheelPanel.tsx:16`, `:35`, `:44`; `App.tsx:68`; `CreateDialog.tsx:74`; `MarketCard.tsx:32` | Positive fractional work was called Resting; zero-threshold questions offered Runs/Rests. | Wager sides say At least one block / No blocks, for either supported duration. Wheel labels name completed blocks and explain block streaks. Positive partial work stays zero **completed blocks** without a resting claim. A fixture with start/end 0.1/0.5 blocks displays No blocks as winner. |

## Better Interface coverage

Applied the pinned workflow and all six domains to the affected surfaces while keeping the incumbent design.

| Domain | Coverage and evidence | Limits |
| --- | --- | --- |
| Accessibility | Checked native side radios by keyboard, dialog close, named linked logo at compact sizes, full network-switch action, focus ring visible in the long-line slip screenshot; populated-board axe WCAG 2.2 AA scan at 390px: 0 violations. | No screen-reader, physical device, native zoom, forced-colors or full manual keyboard audit. |
| Layout | Checked board, dialogs and header across phone/tablet/desktop widths. Text-fragment bounds and container scroll widths are asserted, including the extreme uint64 line. Product and Create market remain on the first screen at 390px. | Viewport emulation is not native zoom. RTL/localization is not implemented or tested. |
| Writing | Checked every zero-threshold path (card, pools, sides, result, preset and create help). Missing history stays unknown; status and streak labels name completed blocks rather than physical activity. | These are block-derived statistics, not physical-wheel telemetry. |
| Typography | Existing six-size scale, system font and weights retained. Long numerical labels wrap completely without ellipsis; side labels stack over multipliers on phones. | Other OS system-font rendering not tested. |
| Colors | Existing tokens retained. Offline taste probe: all measured solid-background text passes 4.5:1 (3:1 large). | 29 text boxes over gradients/media were not measured by the probe; no claim of complete contrast coverage. |
| UI | Loading, success, unavailable-history, retry/recovery and wrong-network states exercised. Short motion retained; populated wheel reduced-motion check confirms one iteration. Offline probe reports no `transition: all` or endless reduced-motion animation. | No slowed Animations-panel review or physical-device testing. |

## Commands and actual results

Build/test dependencies were installed with `npm ci --cache /tmp/squeek-npm-cache --no-audit --no-fund` in a disposable `/tmp/squeek-revision/web` mirror copied from the repository, including its unchanged `.npmrc`, package manifest, lockfile and Vite configuration. Source and export were compared to the delivered versions. No packages or caches from this mirror are submitted.

| Command | Result |
| --- | --- |
| `npm run typecheck` (mirror `web/`) | Passed, no TypeScript errors after final source corrections. |
| `npm test` (mirror `web/`) | 9/9 passed. |
| `npm run build` (mirror `web/`) | Passed, Vite 7.3.7, 1,841 modules; main chunk 656.33 kB minified / 199.87 kB gzip. Existing >500 kB advisory remains. Copied the complete output to repository `dist/`, removing obsolete hashed chunks. |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/squeek-browsers SHOTS_DIR=<repository>/test/scratch/revision node /tmp/squeek-revision/web/tests/browser-check.mjs` | 15/15 Chromium scenarios passed against the production export at `/preview/`. [interaction-results.json](interaction-results.json). |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/squeek-browsers IMD_PLAYWRIGHT=/tmp/squeek-revision/web/node_modules/playwright/index.mjs node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste --offline` (repo root) | 16/16 passed at 320/390/1440px, including relative local assets and share metadata. [taste.json](taste.json). Measures the RPC-unavailable entry state, not populated markets. |
| Final screenshot capture using the same fixture helpers, after entry animations | Passed at 320/390/1440px; populated wheel reduced-motion check passed. |
| Browser MCP inspection at 1280×720 | Inspected actual export under `/preview/`, opened Wake-up call creation, read its block-completion labels, used Connect to create market to reach wallet chooser, closed it. Offline preview deliberately blocks RPC with CSP; console network errors are expected in that inspection. No signature requested. |
| WebKit launch | Could not launch: required system libraries (including libgtk-4, libgraphene and libevent) are absent. No WebKit result is claimed. |
| `git diff --check` | Passed. |

Header widths: 320, 375, 390, 420, 421, 760, 761, 768, 800, 820, 850, 851, 876, 900, 901 and 1440 CSS px. New regression cases are in `web/tests/browser-check.mjs`; earlier filter, stake, create, claim, resolve, phone wallet and RPC-outage interactions still pass. Fixtures do not send real transactions. Reproduction failures were observed against the original export before editing, not inferred from the report.

Current screenshots: `screenshots/fixture-390.png`, `fixture-320.png`, `fixture-1440.png`, `mobile-bet-slip.png`, `long-line-slip-390.png`, `wrong-network-390.png`. Viewed the final phone, desktop, full-line and wrong-network images. `live-390.png`, `live-1440.png` and `chain-observation.json` remain historical evidence from the original upgrade; no live RPC observation was repeated in this revision.

Complete for the four findings. Remaining limitations: WebKit unavailable; no physical phone, native zoom, screen reader, real wallet signature or live transaction; no new live-chain availability claim. Required source, unchanged dependency lockfile, static export, metadata and runtime assets remain included. Packaging checks: `dist/` is 871,197 bytes; all artifacts remain under 1.1 MiB (within the existing 1.5 MiB path budget); added/changed submission files, conservatively including the review response metadata, remain under 1.7 MiB (limit 8 MiB). No submodule, dependency directory, cache, package archive or obsolete asset chunk was added. No ignore file was changed.

---

## Original upgrade record (historical)

### Validation: Squeek Predict website upgrade

## Scope and assumptions

- Upgraded the existing `web/` React + TypeScript + Vite dapp into a dark sportsbook-style site; export in `dist/` (`base: './'`, hash navigation, local assets).
- Contracts unchanged: SqueekPredict `0x8bd658e58e94ab6a18a8b9d8c6108d1287facacf` on Sepolia from `.imd/reads/deployment.json`; ABIs and runtime-hash verification carried over from the previous job (`web/scripts/deployment-proof.json`). SqueekCore's address is read from the contract's `CORE()`.
- The contract only settles "more than T blocks in 24h or 7d". Requested 1h/3h/6h/12h windows, longest-run and daypart comparisons are therefore shown as certified **stats** in the Wheel form panel, not bets. Activity (line 0), record attempt (line = best 24h this week), weekly line and custom start times are real markets.
- Live data at build time: 0 markets on-chain; SqueekCore certified through round 1973, about 8 days behind real time. The site states this lag.
- Single dark theme; no localization variants.

## Coverage (Better Interface, six domains)

| Domain | Status | Evidence |
| --- | --- | --- |
| Accessibility | Checked | Native buttons/links/`<dialog>`/radios; skip link; visible 2px focus ring; labelled selects and inputs; errors in `role="alert"`; status live region; reduced-motion rule; axe WCAG 2.2 AA scan at 390 (mocked data, bet slip closed) found 0 violations. Not performed: screen-reader session, native 200% zoom, physical device. |
| Layout | Checked | Board + sticky side panel on desktop, single column below 1080px; first screen at 390 shows H1, one line, Create market, wheel status and tabs (screenshots). No horizontal scroll at 320/390/1440 (probe + browser test). |
| Writing | Checked | One term per concept (Over/Under, line, market, My bets); action labels say the outcome ("Bet Under 1,000.5", "Claim"); errors say how to recover; no slogans stack, no em dashes. |
| Typography | Checked | One family, 3 weights, 5 sizes per width, tabular numbers for odds/pools/stats, balanced headings. |
| Colors | Checked | Token roles in `styles.css:3`; probe measured all solid-background text pairs at ≥4.5:1. 37 text boxes over the gradient body background were not measured by the probe. |
| UI | Checked | Status pills carry text; odds buttons carry side names; skeleton loading; empty and error states; motion limited to entry/press/status; no `transition: all`; no endless animation under reduced motion. |

## Findings and fixes

1. **HIGH, layout** `web/src/styles.css:297` (was `.layout { grid-template-columns: 1fr }`): at 390 and 320 the board's min-content widened the page (probe: 405px at 390, header wallet button clipped). Fixed with `minmax(0, 1fr)` for layout and hero. Rechecked by probe.
2. **HIGH, layout** `web/src/styles.css:322`: `.filters` kept `flex-wrap: wrap` in its mobile column layout, so the line's cross size took the search field's max-content width (page 367px at 320). Fixed with `flex-wrap: nowrap`; plus `minmax(0,1fr)` select columns (`:325`). Probe now passes layout at 320.
3. **MEDIUM, layout/writing** `web/src/Wallet.tsx:28`: "Connect wallet" clipped at 390 beside the brand. Label is "Connect" under 760px (`.wide-only`, `styles.css:305`); accessible name stays meaningful.
4. **MEDIUM, typography (eyebrows)** `web/src/App.tsx:179`: the open-count pill in the mobile tab sat directly above the "Markets" heading and read as a kicker label. Removed the count pill; the claim count is plain text in the tab.
5. **LOW, layout** `web/src/history.ts:44`, `styles.css:210`: daypart hour ranges wrapped to three lines in the 92px column. Shortened to "00 to 06h" and widened the column to 96px.
6. **LOW, UI** `web/src/styles.css` desktop media query at the end: the hero's wheel status card duplicated the always-visible side panel at ≥1081px. Hidden there.

No open findings remain from the checks that ran.

## Verification (commands run, final source)

| Command (from `web/` unless noted) | Result |
| --- | --- |
| `npm ci` | 97 packages installed |
| `npx tsc --noEmit` | passed, no errors |
| `npm run build` | passed; advisory: main chunk 656 kB minified (> 500 kB warning) |
| `node --test tests/*.test.mjs` | 8/8 passed |
| `node web/tests/browser-check.mjs` (repo root, Chromium, mocked RPC + EIP-6963 wallet) | 10/10 passed, see `artifacts/interaction-results.json` |
| `IMD_PLAYWRIGHT=web/node_modules/playwright/index.mjs node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` (repo root, live Sepolia reads) | 16/16 passed, see `artifacts/taste.json` |

Browser scenarios: render with odds and wheel stats and no page errors (1440); status/length/type/search filters and clear; connect, open bet slip from the Under odds button, bet 0.005 (asserted `bet(1,false)` and value); stake below minimum shows error and sends nothing; create from the Record attempt idea with a custom start (asserted duration 86400 and round snapping); a start 10 minutes away is refused before the wallet; My bets one-tap claim (asserted `claim(4, account)`) and resolve; 390 and 320 first screen and no overflow, bet slip without overflow, axe scan; phone wallet sheet (Open in MetaMask/Coinbase Wallet/Rabby/Phantom, Coinbase Smart Wallet); RPC outage notice then retry.

Screenshots: `artifacts/screenshots/live-390.png` and `live-1440.png` (probe, real Sepolia data, empty board), `fixture-1440.png`, `fixture-390.png`, `fixture-320.png`, `mobile-bet-slip.png` (mocked markets). The 390 screenshots confirm the H1, Create market and wheel status are on the first screen.

## Completion

Complete for the stated scope. Limitations: no Safari/WebKit, physical phone, native zoom or screen-reader session; no real wallet signature or transaction was sent; the browser tool for interactive MCP inspection was not used, the Playwright scripts above stand in for it. Wheel stats depend on public RPCs answering about 290 batched point reads; if they fail the panel shows a retry. Market types beyond 24h/7d totals need a new contract version.
