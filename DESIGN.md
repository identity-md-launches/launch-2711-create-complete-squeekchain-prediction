# Squeek Predict design system

## Overview

Squeek Predict is a compact prediction-market board for Squeekchain activity. It uses a dark navy canvas, flat bordered cards, a restrained blue primary action and green Yes / rose No choices. Small original hamster/block illustrations identify questions without becoming a hero. The product comes before explanatory content: name and wallet, heading, search/filters, then the market grid.

The active source is `web/src/`; the static export is `dist/`. `App.tsx` renders Markets and My Positions with hash navigation. `catalog.ts` supplies twelve binary practice templates, and real verified open markets join the same board. Practice and on-chain data have separate labels, stakes and positions. There is no create-market surface. Historical modules are retained but are not imported by the active app.

This document describes implemented source values, not an approved mockup or a claim of rendered inspection. Native browsers could not create a page on this machine. Source review, declared contrast calculations and DOM interaction evidence are recorded in `artifacts/validation.md`; responsive layouts and focus confinement remain unverified in a real browser.

## Colors

Canonical colors are hex semantic CSS properties in `web/src/styles.css:root`. Reuse a token for its role rather than copying a visually similar value.

| Token | Value | Role |
| --- | --- | --- |
| `--page` | `#10141c` | Canvas, header, amount field |
| `--surface` | `#191f2b` | Cards, dialogs, search |
| `--raised` / `--hover` | `#222a38` / `#293345` | Neutral controls and hover |
| `--line` | `#303a4a` | Structural card/divider borders |
| `--control-line` | `#63718a` | Inputs, selects, search and unselected radio boundaries |
| `--text` / `--muted` | `#f0f3f8` / `#a6b1c3` | Questions/headings and supporting text |
| `--accent` / `--accent-hover` | `#3270df` / `#2868d5` | Primary wallet/action fill and hover |
| `--accent-ink` / `--accent-wash` | `#ffffff` / `#20304d` | Primary text and neutral explanatory illustration wells |
| `--yes` / `--yes-bg` / `--yes-hover` | `#62ddb0` / `#173b32` / `#20503f` | Yes outcome, payout status and positive selection |
| `--no` / `--no-bg` / `--no-hover` | `#ff96a4` / `#412731` / `#57313d` | No outcome, errors and negative selection |
| `--focus` | `#c6ddff` | Keyboard outline |
| `--warning` | `#f3cb80` | Unavailable RPC/storage notice |

Color is accompanied by words and icons: Yes has a check, No a cross, open states say Open, practice cards say Practice and real cards say On-chain · Sepolia. Side radios also retain the native checked state and a selected border. Status is never communicated solely by a dot.

`MarketArt.tsx` uses decorative icon wells: orange `#463325/#ffbf82`, violet `#36304e/#c4a7fa`, mint `#203d35/#7be0b0`, blue `#253a55/#8cbcff`, yellow `#423c25/#efce72`, cyan `#213c46/#7ad6e5`, pink `#422b40/#efa6d6` (background/foreground). These are illustration palettes, not additional action colors. The mark's secondary text is `#b9c5d9`.

Practice submission uses a Yes fill with `#10251d` text, or No fill with `#30131b` text. The hover fills are `#88ebc5` and `#ffb6bf`. The status words and selected native radio remain explicit.

`node web/scripts/check-colors.mjs` calculates declared solid pairs. White on the primary blue is **4.65:1**, muted metadata on cards **7.62:1**, Yes on its base fill **7.31:1**, No **6.51:1**, and input boundaries against cards **3.35:1**. These are source calculations; rendered backgrounds, opacity, forced-colors and all transient states were not measured. Full results are in `artifacts/contrast.json`.

## Typography

Local Inter Variable is served from `web/public/fonts/InterVariable.woff2`, preloaded in `web/index.html` and referenced from exported CSS with `../fonts/InterVariable.woff2`. Its OFL license is bundled alongside it. The face declares normal style, weights 100–900, and `font-display: swap`. The interface requests only **400, 500 and 600**, with `font-synthesis: none`; fallback order is `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Actual font loading could not be observed in a browser.

| Token | Implemented size | Usage |
| --- | --- | --- |
| `--text-xs` | 0.75rem / 12px | Metadata, category, volume, timing, supporting copy |
| `--text-sm` | 0.875rem / 14px | Controls, navigation, dense UI copy |
| `--text-base` | 1rem / 16px | Market questions, phone inputs/selects, labels |
| `--text-lg` | 1.25rem / 20px | Brand, section/dialog headings |
| `--text-xl` | 1.75rem / 28px | Page heading, main odds, portfolio and amount input |

This is one five-size scale. Body line-height is 1.5, prose 1.6, page heading 1.2, question text 1.5, and dialog/section headings 1.4. Page heading/large odds and brand use −.035em tracking. Content otherwise uses normal casing and tracking. `strong` is 600; ordinary action emphasis uses 500 or 600.

Questions are complete, wrapping button labels, not line clamps. Long identifiers use `overflow-wrap: anywhere`; exact amounts remain readable. `.num`, pool metadata and amount inputs use tabular numerals. Prose is constrained to roughly 48–74ch by context. Main prose uses `text-wrap: pretty`, and empty headings use `balance`. Inputs/selects are at least 16px on phones; stake inputs are 28px. At ≤359px the brand and modal title use existing 16px tokens. No additional font sizes are introduced by breakpoints.

## Layout

Shared layout lives in `styles.css`. `.header-inner` and `.page` have a **1392px maximum border-box width** with **40px side padding** on desktop; this gives a 1312px content width. The footer aligns to a 1312px maximum width. Gaps use 4/8px for compact metadata, 10/12px within controls/cards, 14/16/18/20px between related elements, and 24/28/34/36/40px between larger groups.

`.market-grid` uses `minmax(0,1fr)` columns and a **16px gap**. Cards are flex columns; the action row aligns across cards with `margin-top: auto`. The heading has a minimum height but remains free to grow with a long question. Filters precede the content they affect. Search and sort are not hidden on phones. Categories wrap; no horizontal scroller conceals options.

| Width | Source-defined response |
| --- | --- |
| ≥1200px | Four market columns; one header row; 40px page gutters |
| ≥1500px | Same capped content width, 40px top padding and 20px card padding |
| ≤1199px | Three columns, 28px gutters, network label hidden from the crowded header |
| ≤899px | Two columns; footer wraps; position row actions can wrap below the question |
| ≤639px | One market column with 14px gaps, 20px gutters; nav moves below name/wallet; search becomes full-width with two selects beneath; categories wrap; phone sheets anchor to the bottom |
| ≤359px | 16px gutters; compact wordmark and existing 12px wallet-label token; questions get more minimum height |

The first phone screen is deliberately compact: no marketing hero, account sidebar or creation prompt precedes the market. Both side actions are normal-flow buttons. There is no fixed bottom navigation covering content and no global overflow hiding. This structure is intended to show a market and its main action at 390×844; that exact rendered condition remains **unverified** because native browsers failed before loading a page.

Positions use a three-column summary on desktop, two columns plus a full-width practice total on phones. Practice positions are readable rows with question, state and separately written side stakes. On-chain positions retain cards and direct claim controls. Empty/filter/error states provide a next action. Hash navigation scrolls to the top and focuses `main`.

## Elevation & Depth

Surfaces are flat, with a tonal fill and a single structural border; there are no card shadows, glows, floating panels or gradient text. Selected navigation has a 3px blue underline. Decorative SVGs stay within their color wells.

`Modal.tsx` uses native `dialog.showModal()` for the top layer. The backdrop is `#070a11c9` with a 4px blur. Desktop dialogs are 480px wide, at most `100vw - 32px`, and capped at `100dvh - 48px`. Phone dialogs are full-width, have only rounded top corners, cap at `100dvh - 20px`, and include safe-area bottom padding. The submit action can remain sticky inside a phone sheet's own scrolling content; page content is not covered by site navigation.

## Shapes

`--radius: 12px` is the market-card/summary radius. `--control-radius: 7px` is the shared action/input radius. Art wells use 10px, small amount controls 5px, category chips 6px, count labels 4px, and dialogs 16px. Status dots and success/empty illustration wells are circular. The blue hamster/check favicon is original local SVG artwork.

## Components

| Source / pattern | Usage and states |
| --- | --- |
| `App.tsx` | Markets/My Positions, hash navigation, search/category/type filters, global sorting, live snapshot and template composition. Twelve cards by default. RPC errors preserve practice; public data remains stable across connection while account positions clear. |
| `catalog.ts` | Twelve fixed binary questions, UTC window rotation, frozen saved positions, address-scoped practice storage, exact bigint pool math, input validation and safe storage parsing. No template is given an invented on-chain market ID. |
| `MarketCard.tsx` | Real market question, art, actual pool split/volume, phase/time, side buttons, position and claim/refund/resolution actions. `onOpen` chooses a side or details. Real cards always identify Sepolia and their actual contract ID. |
| Practice card in `App.tsx` | Same question/odds/action hierarchy. Props come from `TemplateMarket` and actual local practice pools. A Practice label and Your position link distinguish provenance and ownership. |
| `MarketArt.tsx` | Small original hamster, blocks, bolt, moon, chart and wheel SVGs. Decorative, `aria-hidden`, one stroke system; no remote artwork dependency. |
| `PracticeDialog.tsx` | Native side radios, precise amount, quick amounts, honest pool estimate, before-submit virtual-ETH disclosure, rules/dates, visible validation. Success offers View my positions/Keep exploring and discloses failed persistence. Connection retains the draft. |
| `MarketDialog.tsx` | Existing real-money-in-testnet flow: stake validation, pool estimate, simulation/wallet/receipt notices, wrong-chain disablement, claims, refunds and resolution. Exact pool/rule details remain available. |
| `Wallet.tsx`, `open-in.ts` | Existing EIP-6963 named extensions, four mobile browser links, Coinbase Wallet/Smart Wallet, account/disconnect and switch/add Sepolia. Official marks remain local; no relay/project ID. |
| `Modal.tsx` | Named native dialog, close button, Escape/backdrop close, scroll preservation and focus return. A wallet dialog can open above a slip. Native inertness/focus confinement was not verified in the DOM emulator. |
| Shared CSS | `.primary`, `.secondary`, `.text-button`, `.icon-button`, `.search-field`, `.amount-field`, `.side-choice`, `.category-chip`, `.empty`, `.position-summary`, `.position-row`. Hover, pressed, focus, selected, disabled, pending and recoverable error states have explicit styles/copy. |

Market side buttons are at least 46px tall on desktop and 48px on phones. Wallet rows are at least 56px; modal close targets are 44px; compact categories remain at least 36px. Native buttons/links/inputs are used rather than clickable divs. The skip link precedes header navigation. Focus is a 2px `--focus` outline offset by 3px, with the same treatment on a radio's wrapping label. Forced-colors mode uses system Highlight.

Transitions only run under `prefers-reduced-motion: no-preference`, naming background, text and border colors for 150ms with `cubic-bezier(.2,0,0,1)`. Press feedback uses .96 scale. There are no entrance sequences or endless animations. Error messages persist with alert/status semantics and field descriptions.

## Do's and Don'ts

- Start new views with `.page` and `.page-heading`; reuse the five-size scale and responsive gutters.
- Keep the question and two outcomes ahead of explanation. Use blue for primary actions and Yes/No colors for outcomes.
- Keep provenance visible. Practice remains local/virtual; on-chain data requires verified deployment reads. Never seed fake volume, balances or contract IDs.
- Use `Modal` and native form controls; retain names, keyboard paths, precise amounts and readable errors.
- Keep normal-case labels and full wrapping questions. Extend spacing rather than clip critical text.
- Use hash navigation, bundle runtime assets, rebuild `dist/`, and recheck the subpath export after source changes.
- Treat this document's responsive behavior as source-defined until it has been inspected in an actual browser; the DOM emulator cannot certify layout or accessibility.

Guidance attribution and licenses remain in `THIRD_PARTY.md` and `docs/DESIGN_GUIDANCE_LICENSE.txt`. The local Inter license and official wallet-mark notices accompany their assets. `share.svg` is the editable source for the 1200×630 social PNG, which is artwork rather than a product screenshot.
