# Squeek Predict design system

## Overview

A compact prediction market for people using Sepolia test ETH. Cream surfaces, dark green controls, and an original hamster-and-wheel illustration make the activity recognizable without crowding the questions. The main task is choosing a side; open markets appear first. Claimable positions lead the positions view. No market, pool, position or activity number is simulated in the product.

The implementation is `web/src/`, with the shared visual rules in `web/src/styles.css`. `App.tsx` composes one page with hash navigation. `dist/` is the generated production export. This document describes the implemented source, not proposed additions.

## Colors

Colors use hex values and semantic CSS custom properties in `styles.css:1`.

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#f6f5ef` | Page background |
| `--surface` | `#fffefa` | Header, cards, inputs and dialogs |
| `--soft` | `#eeeee5` | Neutral hover surface |
| `--ink` | `#29382e` | Headings and primary text |
| `--muted` | `#667063` | Supporting copy and labels |
| `--line` | `#dce0d3` | Structural dividers and neutral borders |
| `--accent` / `--accent-hover` | `#254d37` / `#183e2a` | Filled primary action and hover |
| `--accent-soft` | `#e5ecdc` | Selected filters and neutral selection |
| `--yes` / `--yes-bg` | `#345c3c` / `#e8efdf` | Yes category and selected side |
| `--no` / `--no-bg` | `#8c4b36` / `#f6e8de` | No category and selected side |
| `--warning` / `--warning-bg` | `#845a26` / `#f5eddd` | Connection notices |
| `--error` | `#a1392c` | Validation and transaction errors |
| `--focus` | `#385dce` | Keyboard focus ring |

Pool bars use `#65845c` and `#dec2ae` as decorative fills; text also names each side and its percentage. Empty bars use `--line`. Illustration colors belong to the artwork in `icons.tsx`, not to the control palette. The interface implements one light theme; there is no theme toggle or unused dark palette.

The rendered probe measured `--ink` against `--bg` at 11.31:1, `--muted` against `--bg` at 4.73:1, primary button text against `--accent` at 9.48:1, and muted empty-state copy against `#f1f2e9` at 4.58:1. These are identified measured pairs, not a claim about every possible state. See `artifacts/validation.md` for scan coverage and limits.

## Typography

The declared system stack is `'Trebuchet MS', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`. No font request or font file is required; the available system face varies by platform. Weights are 400 and 700. There are no italic or monospace interface roles.

| Token | Default | Role |
| --- | --- | --- |
| `--text-caption` | 13px / `.8125rem` | Dates, status, notes |
| `--text-small` | 14px / `.875rem` | Controls and supporting interface copy |
| `--text-body` | 16px / `1rem` | Body, form inputs, wallet rows |
| `--text-title` | 20px / `1.25rem` | Market questions and small section titles |
| `--text-section` | 24px / `1.5rem` | Section and dialog headings |
| `--text-display` | 40px / `2.5rem` | Page heading; 32px below 39.99rem |

At widths below 22rem the page heading uses the 24px section size. Heading line heights are 1.15, 1.3 and 1.4; body copy is 1.5. Display tracking is `-.045em`; ordinary headings use `-.025em` or `-.02em`, and prose uses natural tracking. Questions can wrap fully and are never line-clamped. Long addresses use `overflow-wrap: anywhere`. Pool amounts, stakes, claim values and changing counts use tabular numerals. Inputs are at least 16px on phones. The root sets font smoothing once.

## Layout

The shared content width is 1248px, including 32px desktop side padding. The ordinary spacing tokens are 4, 8, 12, 16, 24, 32 and 48px; component-specific values such as 20px and 22px remain explicit. Main cards use 22px padding on desktop, 20px on phones and 16px at the narrowest breakpoint. Groups use space before dividers.

| Breakpoint | Implemented behavior |
| --- | --- |
| Above 70rem | Three market columns, three starting-idea columns, desktop navigation and Core summary |
| At/below 70rem | Two market columns, one starting-idea column, compact help control |
| At/below 53rem | Navigation moves below the introduction; Core summary hides; filter tools occupy another row |
| Below 39.99rem | One market column, 16px page margins, compact 140px minimum introduction, smaller decorative wheel, abbreviated visible Create label, bottom dialogs |
| At/below 22rem | Brand subtitle wraps, heading becomes 24px, narrower card padding |

The mobile Create button keeps the accessible name “Create market.” Header controls, section headings and filters wrap when enlarged text needs more space. Forms and amounts stay in normal flow; nothing important is anchored behind a fixed footer. The native dialog scrolls within `100dvh - 20px` on phones and includes the bottom safe area. Mobile and desktop layouts, the initial 390px bet action, 320px reflow, an intermediate 768px viewport, RTL reflow, and 200% text enlargement were checked in Chromium. Native browser zoom and Safari remain unverified.

## Elevation & Depth

Cards and notices use a single structural border without a shadow. The page has no gradients or floating dashboard chrome. Only the modal uses elevation: `0 16px 60px #1a31252b`, with no border. The native top layer and `#18291fcc` backdrop separate it from inert background content. The skip link is the only fixed navigation aid and appears when focused.

## Shapes

`--radius` is 16px for market cards and `--radius-control` is 8px for buttons and inputs. Starting ideas and connection notices use 12px corners. Dialogs have 20px corners; the mobile bottom sheet keeps only its upper corners rounded. Dots and step counters are circular. Pool bars are 7px tall with a 4px radius and carry no essential text inside the clipped area.

## Components

- **`MarketCard` (`MarketCard.tsx`)** accepts a market, optional wallet position, current time and settled frontier. It shows the complete question, status, duration, close time, percentages, total pool and position summary. Bet controls open the detail form with that side selected; finalized cards expose claims or details. Pool percentages describe stake distribution, not fixed odds.
- **`MarketDialog` (`MarketDialog.tsx`)** shows exact dates and pool amounts, a native radio group, labelled amount input, three quick amounts, minimum/gas guidance, changing payout estimate, position details, claims and eligible settlement/refund actions. Exact values remain in details even when a card uses a short amount. Invalid fields have associated error text and receive focus.
- **`CreateDialog` (`CreateDialog.tsx`)** accepts an editable preset and current snapshot. It offers a whole-number target, 24-hour/7-day radios, and 2/6/24-hour betting windows. The preview explains when betting closes. Creation is unavailable without compatible fresh Core state.
- **`Wallet` (`Wallet.tsx`, `config.ts`, `open-in.ts`)** uses one control, EIP-6963 discovery and Coinbase's SDK, with official marks. The mobile sheet links to four wallet browsers and offers Coinbase Smart Wallet. States include pending connection, rejection, connected address, account details, disconnect, and network switching. Wagmi restores an existing connection on reload. No relay or project ID is configured.
- **`Modal` (`Modal.tsx`)** uses native `dialog.showModal()` for focus containment and background inertness. Escape, the close button and backdrop close it; cleanup restores the triggering focus and body scrolling. Wallet sheets cap at 420px; market/create sheets cap at 480px on desktop.
- **Buttons and fields (`styles.css`)** use `.primary`, `.secondary`, `.icon-button`, `.text-input` and `.amount-field`. Routine controls target at least 44px; wallet rows are at least 52px. Rest, hover, active, disabled and keyboard focus are explicit. The focus ring is 2px with a 3px offset, with a system-color fallback in forced colors.
- **Filters and navigation (`App.tsx`)** use real links, buttons with `aria-pressed`, native selects and a search input. Status filters reset when changing tabs; older-ID lookup isolates the exact ID. Loaded-market totals say what they cover.
- **Transaction feedback (`App.tsx`, `TransactionNotice`)** distinguishes checking, wallet approval, pending, success and failure. A persistent offscreen polite status region announces non-urgent updates; visible urgent failures use alerts. Errors and explorer links persist. A submission lock prevents concurrent sends; stale reads and wrong networks disable transaction controls.

Transitions name background, color and border color and last 150ms. There is no entrance or endless animation. Press feedback scales to `.96` only with no motion preference; reduced motion disables transitions. Icons use one original inline SVG set, current color and a consistent 1.7px stroke. The hamster SVG is decorative and hidden from assistive technology.

## Do's and Don'ts

- Reuse the existing semantic tokens, six-size scale and spacing. Use the filled primary style for the next consequential action.
- Keep complete questions, window dates, testnet context, stake risk and gas guidance close to their controls.
- Keep source state in contract reads. Starting ideas must remain explicitly labelled as ideas; never present them as funded markets.
- Use `Modal` and native controls for new forms. Preserve focus, labels, pending states, retry paths and reduced motion.
- Keep secondary views within hash navigation or explicitly exported static pages. Do not assume a server rewrite.

To extend a view, start inside `.page-wrap`, compose the existing heading/filter patterns and `MarketCard`, and reuse `Modal` for details. Add a token only for an actual new role, then check the production export at 320, 390 and desktop widths. Refresh this document after changes.

Design and documentation guidance attribution and licenses are retained in `THIRD_PARTY.md` and `docs/DESIGN_GUIDANCE_LICENSE.txt`.
