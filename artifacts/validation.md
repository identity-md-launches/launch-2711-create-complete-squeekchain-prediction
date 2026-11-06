# Frontend validation — Squeek Predict redesign

## Scope and assumptions

This revision changes the website, its assets, frontend validation and documentation. The active product is `web/src/App.tsx`; the delivered static export is `dist/`. Contracts, their configuration/dependencies, existing frontend package manifest/lockfile and Vite configuration remain unchanged. No publishing, deployment, minting, keys or real wallet transactions were used.

The design is a compact Polymarket-style market board: navy canvas, flat cards, large binary choices, restrained blue primary action, professional local type and small hamster illustrations. Ordinary layout/copy decisions were inferred without an interview.

The verified live deployment had **zero markets** at block **12075955**, observed on 2026-11-06. The brief explicitly permits template markets. Twelve ready practice markets therefore supply the immediate experience; they are visibly local/virtual and never masquerade as funded on-chain contracts. Verified real open markets automatically join the board. Practice outcomes use the same certified whole-block difference rule, but have no redeemable winnings. Unknown endpoints never become guessed results. The full real observation is `artifacts/chain-observation.json`.

## Requirement coverage

| Requirement | Result / evidence |
| --- | --- |
| No market-creation request | Met. No active creation imports, entry points or prompts. DOM suite asserts their absence. Historical source remains unused. |
| Homepage with 10–15 ready cards | Met. Twelve open binary cards immediately, even with zero chain markets or unavailable RPC. Filters may intentionally narrow the result. Real cards replace templates in Featured. |
| Questions, 50/50 start, large sides, time and volume | Met in source and DOM checks. Empty pools are 50/50; only actual local practice or actual chain stakes affect percentages/volume. |
| Connect wallet and choose a side | Met in DOM interaction tests, including preserved draft and correct real-bet calldata. Actual wallet app/passkey/signature handoff unverified. |
| Verifiable Squeekchain/Sepolia activity | Met. Only block-completion questions; UTC windows; certified endpoint differences with strict greater-than resolution. Certified and uncertified test paths covered. |
| My Positions | Met. Address-scoped local positions, frozen windows/results, separate live stakes, claims and older-position coverage. |
| Dark modern design | Implemented and reviewed in source: five-size Inter scale, navy surfaces, restrained blue, green/rose side actions and original small illustrations. Rendered appearance not observed. |
| Responsive / first screen at 390 | Implemented source rules for 320–1440+; no hero before cards. **Not rendered-verified.** Native browser runtimes could not create a page. |
| Static export and metadata | Met. Root `dist/index.html`, relative local references, hashes, title/favicon/description/og:title/og:image; asset audit passes. Existing source manifest and lockfile remain included unchanged. |
| Production build, typecheck, useful interactions | Met. Build/typecheck, 28 unit tests, 13 DOM integration scenarios, declared-color check and asset/path checks ran. Actual results below. |
| Better Interface review and DESIGN/README | Met for source and available DOM checks across all six domains; browser-specific checks explicitly unperformed. Current documents describe final source. |

## Six-domain Better Interface review

The pinned workflow, all six core domains and the documentation method were read and applied while building. Scope is the active board, wallet path, practice slip/success/error, live bet/claim path, positions, loading/outage and filtering. A checked source domain does not mean its rendered subchecks ran.

| Domain | Checked | Not verified / not applicable |
| --- | --- | --- |
| Accessibility | Native buttons/links/forms; named search/select/amount controls; heading/landmark order; skip link; native radio names; field-linked validation; persistent status/error messages; visible focus CSS; reduced-motion guard; mobile target dimensions declared. DOM tests exercise forms, errors and recovery. | Native dialog focus trap/inertness, visible keyboard rings, axe, screen-reader sessions, physical touch and forced-colors rendering. DOM tests emulate dialog methods and cannot certify those properties. |
| Layout | Source order prioritizes cards; 4/3/2/1 column grid; minmax columns; wrapping categories and questions; full-width phone search; bottom sheets/safe-area padding; no fixed bottom navigation; filters before content; account switch preserves public board. | Actual 320/390/800/980/1440 reflow, text overlap, first-screen visibility, native 200% zoom, RTL/pseudo-localization. |
| Writing | Side/amount/submit terms match actions; creation language removed; practice provenance and no-funds disclosure before submission; no fabricated liquidity; honest errors and storage fallback; exact threshold/date rules; actionable empty states. | Localization was not requested. Native screen-reader announcements remain unverified. |
| Typography | One local Inter family, 400/500/600, five sizes (12/14/16/20/28), tabular numbers, 16px+ phone inputs, 1.5/1.6 line height, wrapping questions/addresses and no critical truncation. | Actual font loading, line wrapping/widows, text enlargement and fallback rendering in browser. |
| Colors | Semantic hex tokens and exact declared opaque pair calculations; primary fill corrected from failing 4.11:1 to 4.65:1; 15/15 selected text/focus/control pairs pass their thresholds. Outcome colors have words/icons. | Rendered contrast over opacity/backdrops, all transient states, forced-colors and physical display behavior. No rendered contrast claim is made. |
| UI | Flat structural borders; consistent art/icon/action patterns; hover/pressed/selected/disabled/pending/error/success source states; native dialogs; 150ms named-property transitions only under no-preference; no endless animation or loading skeleton that hides ready templates. | Real browser hover/focus/animation behavior, 10%-speed Animations-panel review and Safari rendering. No light theme, media playback, secondary trading or localization is part of this scope. |

## Findings, fixes and rechecks

These are source or DOM findings, not invented screenshot observations. Locations refer to the final source.

1. **High — empty board made creation the primary task.** `web/src/App.tsx:330`, `web/src/catalog.ts:24`. Before: zero deployed markets produced an empty board and creation prompts. Change: twelve ready binary templates, real markets joining automatically, no creation entry points. Why: explicit brief. Recheck: zero-market and RPC-outage DOM scenarios each retain 12 cards with both side controls.
2. **High — practice could be mistaken for chain liquidity without provenance.** `web/src/App.tsx:641`, `web/src/PracticeDialog.tsx:226`. Change: Practice labels, virtual-ETH disclosure before submit, browser-local volume/positions, separate on-chain cards and summaries; no invented contract IDs or balances. Why: template allowance does not authorize fake transactions. Recheck: practice bet changes local volume/odds/positions and emits **zero** wallet transactions; real fixture bet uses the supplied deployment.
3. **Medium — account connection briefly replaced live cards while fetching its positions.** `web/src/App.tsx:88`, `web/src/App.tsx:103`. Observed in the DOM interaction test: an existing card became detached during account query transition. Change: retain previous public snapshot but clear positions and disallow authorization until fresh account data. Recheck: connect/bet/rejection and account isolation scenarios pass.
4. **Medium — primary blue had inadequate declared white-label contrast.** `web/src/styles.css:18`. Before `#3979eb` / white calculated **4.11:1**. Change to `#3270df`, calculated **4.65:1**, preserving the blue direction. Recheck: `node web/scripts/check-colors.mjs` passes 15 selected pairs. This is declared, not rendered, measurement.
5. **Medium — failed persistence still produced a durable-save success claim.** `web/src/App.tsx:173`, `web/src/PracticeDialog.tsx:110`. Change: return persistence status and say “saved for this visit only” inside the success dialog as well as the page notice. Recheck: forced storage failure still preserves the in-memory position, clearly discloses the limit, and does not claim durable storage.
6. **Medium — sorting and filtering applied after capping separate source groups.** `web/src/App.tsx:330`. Change: filter the combined source set before capping and compare both types for closing/volume sorts. Featured retains chain priority. Recheck: category/search/type/empty recovery and funded-practice volume sorting pass.
7. **Medium — incompatible/missing history must not resolve a template.** `web/src/data.ts:107`, `web/src/data.ts:145`. Change: check Core's expected grid/units, require both exact certified endpoints, floor each endpoint, reject decreasing heights and leave missing data unknown. Recheck: expired saved fixture resolves No with 432 completed blocks; the same uncertified endpoints remain “Awaiting certified result”. Saved window boundaries do not roll forward.
8. **Low — compact close and input boundaries needed clearer source-defined affordances.** `web/src/styles.css:361`, `web/src/styles.css:953`. Change: 44px modal close targets and `--control-line` boundaries on search/select fields. Declared boundary contrast is 3.35:1 on cards. Source rechecked; actual touch/focus rendering remains unperformed.

No unresolved known application error remained in the checks that could run. The unresolved rendered-coverage limitation is material and listed below rather than called a pass.

## Commands and actual outcomes

| Command | Actual outcome |
| --- | --- |
| `npm ci --ignore-scripts --cache ../test/scratch/npm-cache --no-audit --no-fund` in `web/` | Passed; 97 locked packages installed. Existing manifest/lockfile unchanged. |
| `npm --prefix web run verify:deployment` | Passed. Canonical ABI `0x3d6fa830e7687fd236ee229edff0d15994319e898520fc82bc4e75ae1c3987ec`; runtime `0xa428c2a0ae99d4bd68a02aa893d5cc70698af0c82d478efa475e35adeee6555b`; pinned source digests match. |
| `node scripts/observe-chain.mjs` in `web/` | Passed. Actual public Sepolia chain 11155111; runtime matches; block 12075955; zero markets; Core read succeeds. No broadcast. |
| `npm --prefix web run typecheck` | Passed, exit 0. |
| `npm --prefix web test` | Passed, 28 tests, zero failures. Includes six new catalogue/UTC/storage/pool/boundary tests and retained existing tests. |
| `npm --prefix web run build` | Passed, exit 0. Export is 17 files / 1,220,529 bytes. Main JS 657.25 kB (199.62 kB gzip). Vite retains its chunk advisory and deliberate public-font URL warning. |
| `node web/tests/dom-check.mjs` | Passed, **13/13** scenarios against the actual production JS chunks rebundled into an emulator IIFE. Optional happy-dom 21.0.4 installed only in scratch. This is neither a real browser nor a CSS/layout test. |
| `node web/scripts/check-colors.mjs` | Passed, 15/15 declared solid foreground/background/control pairs; report `artifacts/contrast.json`. |
| `PLAYWRIGHT_BROWSERS_PATH=… node web/tests/browser-check.mjs` | Attempted, exit 1 before rendering: Chromium runtime failed to launch. No browser scenario or screenshot passed. Paths normalized in retained report. |
| Pinned `taste.mjs --out test/scratch/taste`, with local Playwright module/browser path | Attempted against final export, exit 2. Chromium terminated before rendering. **Zero design checks were measured**; no 320/390/1440 screenshots or pass count is claimed. |
| `node web/scripts/audit-export.mjs` | Passed. No missing local assets, absolute asset URLs, protected changes, submittable dependency/cache directories or over-budget additions. `artifacts/export-audit.json` records the final conservative count. |

The DOM test runs the production JavaScript after rebundling its chunks into one script for the emulator; `import.meta` chunk context is not a native module-loader test. Wallet/RPC providers are mocks. Happy DOM's native dialog methods are explicitly emulated. The suite is useful evidence for primary state transitions and calldata, not evidence of layout, appearance or full accessibility.

### Browser limitation

The supplied browser tool failed at initialization with a Chromium crashpad launch error. A locally installed Playwright Chromium also exited at launch with SIGTRAP. Firefox reported that it could not find its application directory. WebKit first reported missing shared libraries; temporary Ubuntu runtime libraries allowed launch, but the process closed before a page could be created. No machine/account details, caches, libraries, browser binaries or package archives are included in the submission.

Consequently the first screen at 390, responsive geometry at 320/390/800/980/1440, native focus/inertness/keyboard walks, visible rings, rendered contrast, font loading, console/resource behavior in a native browser, axe scans, Safari behavior, physical phones, browser-native zoom and screen readers remain **unperformed**. These are not reported as failures in the app or as passed checks. Real passkeys, wallet-app deep links and signed chain transactions are also unverified.

The only new raster artwork inspected is the 1200×630 social image generated from `web/public/share.svg`; it is **not a page screenshot**. It uses a DejaVu Sans rendering fallback because Chromium was unavailable. The PNG, editable SVG and normal Playwright regeneration script are delivered. Prior revision page screenshots are removed from the current evidence set because they do not represent this redesign.

## Completion

The website implementation, static export, source/lockfile preservation, documentation and all available non-rendered checks are complete. Native rendered verification remains incomplete due to the runtime failures above. `artifacts/interaction-results.json`, `contrast.json`, `chain-observation.json`, `taste.json`, `browser-runtime.json` and `export-audit.json` describe this revision; they are worker observations, not independent certification.
