# Squeek Predict design system

## Overview

Squeek Predict is a two-outcome prediction market for Squeekchain activity, using Sepolia test ETH. The maintained interface is React/TypeScript in `web/src/`; its complete static export is `dist/`. The design uses a dark canvas, restrained violet branding, flat market cards and prominent green Yes / rose No choices. The question, closing time, pool split and side actions are the primary hierarchy.

There is one dark theme. Shared styles and tokens live in `web/src/styles.css`. `App.tsx` implements the market board and My positions with hash navigation. Browser-only community calls, NFT previews and multi-choice catalogs are absent from the rendered app. Historical source modules remain in the repository but are not part of the active product.

This document describes the final implementation. Commands, review evidence, screenshots and unperformed checks are recorded in `artifacts/validation.md`.

## Colors

The canonical notation is hex. CSS custom properties in `:root` name semantic roles; components reference these tokens.

| Token | Value | Use |
| --- | --- | --- |
| `--page` | `#0c0e14` | Page, header, amount fields |
| `--surface` | `#141720` | Market cards, portfolio, templates, dialogs |
| `--raised` | `#1c202c` | Secondary controls, selected status chip |
| `--hover` | `#242938` | Neutral control hover |
| `--line` | `#2b3040` | Structural borders and dividers |
| `--control-line` | `#596176` | Input/control outlines; empty board dashed outline |
| `--text` | `#eff1f7` | Questions, headings, primary text |
| `--muted` | `#a0a7b8` | Supporting text, metadata, placeholders |
| `--accent` / `--accent-hover` | `#b7a0ff` / `#c8b6ff` | Primary actions and hover |
| `--accent-ink` / `--accent-wash` | `#181125` / `#282238` | Primary-action text / icon and selection backgrounds |
| `--yes` / `--yes-bg` / `--yes-hover` | `#5ad8aa` / `#12362e` / `#194638` | Yes side, available payout, positive state |
| `--no` / `--no-bg` / `--no-hover` | `#f49aaf` / `#3d222e` / `#4a2837` | No side; errors reuse the rose foreground |
| `--focus` | `#ffffff` | Keyboard outline |

Outcome choices always include the written Yes/No label. Cards add check/cross icons, and statuses combine a dot with a written state. Selection also has an outline and a checked native radio. A cancelled market says **Cancelled**; actual claims are separately identified.

Normal-state rendered contrast measurements are retained in `artifacts/contrast.json`: primary card text 15.85:1, metadata 7.43:1, Yes percentage 7.43:1, No percentage 6.88:1, wallet action 8.28:1, selected status chip 14.39:1. These are measured solid foreground/background pairs, not a claim about every state or OS rendering.

## Typography

Inter is bundled locally at `web/public/fonts/InterVariable.woff2` with its SIL Open Font License. `@font-face` declares normal style, weight range 100–900 and `font-display: swap`. The interface uses only 400, 500 and 600; headings and strong text use 600. Fallbacks are `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`. The font is preloaded from `web/index.html`; production CSS references `../fonts/InterVariable.woff2`. No font CDN is required at runtime.

| Token | Size | Role |
| --- | --- | --- |
| `--text-xs` | 13px / `.8125rem` | Metadata, supporting copy, small controls |
| `--text-sm` | 14px / `.875rem` | Dense interface copy, action labels |
| `--text-base` | 16px / `1rem` | Inputs/selects on phones, panel headings |
| `--text-lg` | 18px / `1.125rem` | Market questions and template-section heading |
| `--text-xl` | 20px / `1.25rem` | Desktop dialog headings, percentage values |
| `--text-display` | 32px / `2rem`; 28px / `1.75rem` at ≤639px | H1 and portfolio balances |

Body line-height is 1.5; prose inside dialogs is 1.6, questions 1.5, heading defaults 1.4 and H1 1.2. H1 uses −.035em tracking and the brand uses −.02em; content otherwise has natural tracking/casing. `.num` uses tabular numerals for stable timers, balances and percentages. Questions, addresses and exact amounts wrap; no essential value is ellipsized. Descriptions use `text-wrap: pretty`; compact empty-state headings use `balance`. Stake inputs are 20px; all other editable phone controls are at least 16px.

## Layout

The main `.page` and `.header-inner` have a 1440px maximum width. Gutters are 40px on large screens, 28px at ≤1199px, 20px at ≤639px and 16px at ≤359px. Common spacing is 8/12px within controls, 16/20/24px between related elements, and 28/32/40px between major groups. These are CSS values, not a separate spacing-token system.

The heading is compact, followed by the network/loaded-market summary and board. There is no marketing hero before the product. Filters sit directly above the results. When the chain has no markets, irrelevant filters disappear and the empty board presents Create market. Templates follow the board, clearly described as templates rather than open bets.

| Width | Implemented behavior |
| --- | --- |
| ≥1200px | Board beside a 292px sidebar, 32px gap; market cards in two columns; three template columns |
| ≥1600px | Sidebar becomes 300px inside the same maximum page width |
| 980–1199px | Sidebar is 260px, main gap 24px; templates become compact full-width rows |
| ≤979px | Board fills the page; portfolio and guide move below in two columns; templates use three columns |
| ≤639px | One market/template/sidebar column; header navigation moves to its own row; search spans a row above two selects; H1 is 28px; desktop Create market shortcut is hidden |
| ≤359px | 16px gutters, smaller wordmark and compact status controls |

At 390×844 the populated board's first card and both side buttons are visible on the first screen. The real zero-market state puts Create market higher, without empty search/filter chrome. The header retains the product name and one wallet control. No fixed bottom navigation covers the board. Layout does not hide document overflow to mask errors.

Hash navigation returns to the top and focuses `main`. The skip link preserves the active view. Markets initially filters to Open; My positions defaults to All positions. Totals and position coverage explicitly refer to loaded markets; pagination and number lookup find earlier entries.

## Elevation & Depth

The system is flat. Surfaces use a tonal background and one structural border, without shadows or hover lift. Active navigation has a 2px violet underline. Cards use a three-pixel Yes/No pool bar as a secondary numeric cue.

Native dialogs occupy the browser top layer. Their backdrop is `#000000b3` with a 4px blur. Desktop dialogs are at most 480px wide and leave 16px side margins; phone dialogs span the viewport as bottom sheets with safe-area padding. `max-width: none` overrides the browser dialog default so it cannot leave an asymmetric phone gutter. Dialog contents scroll; the phone form's submit action is sticky within that scroll area. Background page content is inert while a modal is open.

## Shapes

Controls and icon wells use 8px radii; templates use 10px; market cards, portfolio and empty board use 12px; dialogs use 16px. Phone sheets round only their top corners. Status dots and illustrative icon wells are circular. Empty boards use a dashed outline to distinguish the state from a funded market. The compact hamster/check favicon is local original vector artwork.

## Components

| Source | Reuse and behavior |
| --- | --- |
| `App.tsx` | Market/position views, filters, sorting, pagination, number lookup, templates, portfolio summary and help. Empty states have creation, connection or filter-recovery actions. Read failures expose Retry and label cached data. |
| `MarketCard.tsx` | `market`, optional `position`, `now`, `settled`, `busy`, `onOpen`. Complete question, category, written phase, countdown, Yes/No percentage actions, volume and position. Closed cards open details; settlement/claim controls appear when applicable. `SkeletonCard` preserves the loading structure without inventing data. |
| `model.ts` | Question/side formatting and exact pool/payout math. Empty pools display 50/50. Funded percentages represent staked-pool shares, not fixed prices or guaranteed probability. Yes requires strictly more than the threshold; exactly the target is No. |
| `MarketDialog.tsx` | Bet slip with native side radios, stake, quick amounts, estimated payout and one wallet-confirmed submit. Details disclose exact pools, timing, strict threshold, refund rules and contract link. Invalid amounts focus the field; errors keep the draft. Connecting leaves the bet slip mounted. Success replaces betting fields with a confirmation and Done. |
| `CreateDialog.tsx` | Native daily/weekly selection, uint64 target field/stepper, round-aligned start options and date preview. Daily/weekly templates start with a blank target; the activity template uses the explicit any-block condition. Drafts survive connection. Success offers Done. |
| `Modal.tsx` | Native `dialog.showModal()`, named heading, Escape/backdrop/close handling, body-scroll preservation and focus restoration. The wallet sheet can stack above a bet slip without losing the draft. |
| `Wallet.tsx`, `open-in.ts` | EIP-6963 named extensions; four mobile wallet-browser links; Coinbase Wallet/Smart Wallet; account view, disconnect and Sepolia switch/add flow. No relay or project ID. Header control is enabled before any market read completes. |
| `icons.tsx` | One outline SVG set, using `currentColor`, decorative accessibility semantics and a consistent 1.7px stroke. Wallet marks remain the bundled official multicolor assets. |
| `styles.css` | `.primary`, `.secondary`, `.ghost`, `.text-button`, `.icon-button`, `.field-label`, `.text-input`, `.chip` and all responsive primitives. |

Most controls are at least 44px tall. Card sides are at least 58px; phone wallet rows at least 56px. The compact refresh action and footer/help links are 28/32px with spacing. Native disabled states are dimmed to 60%. Hover applies only to hover-capable devices. Focus is a 2px white outline with a 3px offset, including the wrapping label of visually hidden radios; forced-colors mode uses system Highlight.

Transitions name only background color, text color and border color at 150ms. Press feedback uses `.96` scale only when reduced motion is not requested. Reduced motion removes animation, transitions and smooth scrolling. Loading skeletons are static. Error and transaction messages persist and use inline field associations or status/alert regions.

## Do's and Don'ts

- Start another view with `.page`, `.page-heading` and the same six-size scale; use hash navigation for static hosting.
- Use violet for the primary action and Yes/No colors for outcome meaning. Keep neutral secondary actions subordinate.
- Keep questions, side choices and a recoverable empty state ahead of explanatory content.
- Preserve exact on-chain semantics, complete values, test-ETH context and loaded-market coverage labels.
- Use native controls and `Modal`; label every new control and recheck its focus path.
- Keep fixtures in validation code. Never ship fabricated markets, odds, volume, balances or community results.
- Keep runtime assets local, rebuild `dist/` after source changes and test from a subpath.

Design guidance attribution and licenses are retained in `docs/DESIGN_GUIDANCE_LICENSE.txt` and `THIRD_PARTY.md` (Better Interface / Impeccable). Inter's license is bundled beside the font.
