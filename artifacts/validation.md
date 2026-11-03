# Validation: Squeek Predict website upgrade

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
