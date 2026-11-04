# Squeek Predict design system

## Overview

Squeek Predict is a prediction-market board for the Squeekchain hamster, using Sepolia test ETH. The final React source is in `web/src/`; `dist/` is its static export. The interface uses a light neutral canvas, white cards, blue navigation and actions, green Over buttons and red Under buttons. The live board precedes the existing hamster and founder catalog. The hamster logo and small wheel illustration carry the branding without becoming a landing-page hero.

The system has one light theme. All shared styles and tokens are in `web/src/styles.css`. This document describes the implementation, not proposed components. Review evidence and limitations are in `artifacts/validation.md`.

## Colors

The existing semantic token names are retained, with hex values in `:root`.

| Token | Value | Role |
| --- | --- | --- |
| `--bg` | `#f7f8fb` | Page canvas |
| `--surface` | `#ffffff` | Cards, header, dialogs, fields |
| `--raised` / `--hover` | `#f0f3f8` / `#e9edf5` | Secondary controls and tonal layers |
| `--line` / `--line-strong` | `#e0e5ed` / `#c6cfde` | Structural borders / emphasized outlines |
| `--ink` | `#182338` | Primary text |
| `--muted` / `--faint` | `#606d81` / `#6b778b` | Supporting text / placeholders and icons |
| `--accent` / `--accent-hover` | `#2b57d9` / `#2148bd` | Primary action and its hover state |
| `--on-accent` / `--accent-soft` | `#ffffff` / `#edf2ff` | Primary button text / selected neutral controls |
| `--yes` / `--yes-bg` / `--yes-line` | `#08734b` / `#e8f6ee` / `#b9dfc9` | Over, block-completion Yes, claimable funds |
| `--no` / `--no-bg` / `--no-line` | `#b43c48` / `#fdf0f0` / `#f0c8ce` | Under and block-completion No |
| `--live` / `--live-bg` | `#315cc7` / `#edf2ff` | In-progress status, links and activity bars |
| `--warn` / `--warn-bg` | `#886014` / `#fff7e6` | Settlement waits / outage notice background |
| `--error` | `#b72d40` | Form and transaction errors |
| `--focus` | `#2856db` | 2px keyboard outline, 3px offset |
| `--brand` / `--brand-soft` | `#b3833e` / `#f8f1e4` | Activity chart and the wheel icon well |

Weekly market icons also use the local pair `#6d4ab4` / `#f3edfd` in `.symbol-weekly`. Keep this categorical treatment distinct from action blue. Status has a written label and a dot; sides have explicit names. Color is never the only way to identify a choice or result. Rendered normal-state contrast measurements are saved in `artifacts/contrast.json`; no claim is made for every possible OS rendering or disabled-state contrast.

## Typography

One system sans-serif stack: `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`. It requires no font download. Weights are 400, 600 and 700. Platform fonts vary by device; screenshots confirm the system stack in Chromium, not a proprietary font.

| Token | Size | Use |
| --- | --- | --- |
| `--t-small` | 14px / `.875rem` | Metadata, chips on phones, supporting text |
| `--t-body` | 16px / `1rem` | Body, controls, inputs and selects |
| `--t-title` | 18px / `1.125rem` | Market questions, panel and dialog headings |
| `--t-section` | 22px / `1.375rem` | Section headings, odds, payout estimate |
| `--t-display` | 28px / `1.75rem` | Main heading at 381–960px |
| `--t-hero` | 36px / `2.25rem` | Main heading above 960px |

At 380px and below the main heading is 22px. Body line-height is 1.5; H1 is 1.15, H2 1.3 and H3 / market questions 1.4. Heading tracking is −.035em / −.02em / −.01em. Headings balance, prose uses `text-wrap: pretty`, and important values wrap instead of being ellipsized. `.num` supplies tabular digits for timers, pools and odds. The full uint64 threshold fits cards and slips at 320, 390 and 1440px. All editable mobile controls remain at least 16px; stake inputs are 22px.

## Layout

The spacing tokens are 4, 8, 12, 16, 20, 24, 32 and 48px (`--s-1` through `--s-12`). Shared alignment follows `.header-inner`, `.page` and `.footer-inner`, with a 1440px maximum width and 32px desktop gutters.

The introduction is compact and the primary board follows immediately. The desktop layout is `minmax(0, 1fr) 288px`, separated by 24px. The market grid uses `repeat(auto-fill, minmax(280px, 1fr))`, producing three cards beside the sidebar at 1440px. Cards have 20px padding and 16px grid gaps. Market titles reserve 76px on wide screens to stabilize their starting rows; phones let titles use their natural height.

| Breakpoint | Implemented behavior |
| --- | --- |
| ≤1260px | Search spans the toolbar; three selects follow beneath it. Header spacing contracts. |
| ≤1060px | Board fills the width. Positions/activity panels move below it in two columns; history becomes one column. |
| ≤960px | Main nav becomes sticky Markets / My positions / Stats links below the introduction. Header is 64px. Main heading is 28px; page gutters are 20px. |
| ≤640px | One market card per row; 16px page gutters and card padding. Search/sort and window/type form two rows. The 68×60px hamster illustration has reserved text space. The desktop positions summary is hidden; the My positions navigation and full view remain. Activity panels stack. Dialogs become bottom sheets. |
| ≤380px | Main heading is 22px. Connected header shows the named logo link and wallet/network control; the complete product name remains in H1. Wallet/action icons yield space to text. Position summary tiles stack. |

Mobile category chips scroll horizontally with a visible partial next option and a thin scrollbar. No page-level overflow is hidden to disguise a layout failure. Hash navigation to Markets or My positions scrolls to the top and focuses `main`; detail anchors retain their target section.

The final export was checked at 320, 390, 800 and 1440px, with additional wallet-header checks at 16 widths. Native 200% browser zoom, RTL and translated copy were not tested.

## Elevation & Depth

Cards use a white tonal layer and one structural border, without shadow or hover lift. The sticky header is solid white and has a bottom divider. Selected states use colored outlines or underlines. Dialogs alone use `0 24px 90px rgb(24 35 56 / .16)` and a `rgb(20 30 48 / .45)` backdrop; they have no decorative border. The header and mobile nav use z-index 20 and 10; native modal dialogs use the browser's top layer.

## Shapes

Cards use `--r-card: 16px`, controls `--r-control: 8px`, and dots/network badges `--r-pill: 999px`. The market-symbol well is 10px. Dialogs have a 20px radius; phone sheets keep only their top corners rounded. Free-call cards use dashed borders, with written labels explaining their local, free nature.

## Components

- **`App.tsx`** owns market/position navigation, filters, search, sorting, pagination, creation presets and the desktop position summary. Transactions retain contract verification, simulation, account/network checks, pending states and receipt links. Errors identify stale reads and offer Retry.
- **`MarketCard.tsx`** shows a category icon, named status, complete question, closing/window countdown, two large side buttons, pool split and volume in test ETH. `market`, `position`, `now` and `onOpen` determine its content and interaction. A closed card opens details; a resolved card shows its result. Refund/resolve/claim controls appear when applicable. Loading uses `SkeletonCard` with the same main structure.
- **`model.ts`** provides `poolPercent` and `percentLabel`. An empty market is displayed as 50/50. Once funded, percentages are each side's share of the original pool, with one decimal place when needed. They are not fixed-price shares or guaranteed probabilities. Volume is the sum of original stakes. `odds` and `payout` still implement the existing pari-mutuel return calculations.
- **`MarketDialog.tsx`** is the bet slip: selected side and percentage, stake field, quick amounts, estimated payout, risk note and one submit action. Rules, exact pools and dates are disclosed under Market rules & details. Wallet connection leaves the slip and its draft intact. Busy actions disable inputs; successful bets replace the form with confirmation and Done. Field errors focus the input; transaction errors retain their receipt link when one exists.
- **`Modal.tsx`** uses native `dialog.showModal()`, a unique heading ID, Escape/backdrop/close-button handling and focus restoration. It preserves the page's prior body-scroll state when a wallet dialog is stacked above a slip. Native browser chrome remains reachable by Tab; background page controls are inert.
- **`Wallet.tsx`** retains named EIP-6963 extensions, mobile Open in wallet links, Coinbase Smart Wallet, account management and Sepolia switching. The header control uses `.is-connected` for compact layouts. No relay/project ID is used.
- **`CreateDialog.tsx`** retains daily/weekly windows, line and time controls and the exact on-chain creation flow. The integer line stepper clamps within uint64 without converting to Number. Creation drafts survive connection.
- **`HamsterMarkets.tsx` / `CommunityMarkets.tsx`** preserve all existing block-count, streak, activity, founder-post and NFT calls/templates. They follow the live board under Explore more predictions. Chain cards use the same percentage odds and volume treatment. Free calls are explicitly saved in this browser and cannot stake ETH.
- **`WheelPanel.tsx` / `HistoryPanel.tsx`** retain certified activity charts, weekly totals, past outcomes and free-call history. Unknown certified data produces a retry state, never fabricated zeroes.

Buttons are at least 44px tall; status/category chips and quick amounts are 40px, with separate targets. Focus is visible, errors are associated with their fields, and success messages use a stable polite status region. Motion uses `--ease: cubic-bezier(.2, 0, 0, 1)` and named properties. Dialog entrance is 150ms; press scale is `.96` only with no motion preference. Reduced motion removes animations, transitions and smooth scrolling. The retained illustration has its own reduced-motion rule.

## Do's and Don'ts

- Start another view inside `.page`, reuse the semantic tokens, and follow the current heading scale.
- Use blue for the main action; use the green/red side variants only for market outcomes and positions.
- Keep the live product and its action ahead of explanations or the free-call catalog.
- Preserve full questions, thresholds, amounts and written statuses. Keep all wallet amounts labeled as test ETH in their context.
- Use native buttons, links, radios, fields and `Modal`. Give new icon-only controls a name.
- Keep free-call state local and labeled. Do not seed pretend markets, volumes, accounts or results into production.
- Reuse relative assets from `web/public/`; rebuild the entire `dist/` after a source change.

Design guidance attribution and licenses remain in `docs/DESIGN_GUIDANCE_LICENSE.txt` and `THIRD_PARTY.md` (Better Interface / Impeccable).
