# Squeek Predict design system

Taken from the final source in `web/src/styles.css` and the React components in `web/src/`. The site is a single dark theme (`color-scheme: dark`); there is no light variant.

## Direction

A serious but friendly sportsbook board for one hamster. Dark graphite surfaces, an amber hamster accent for primary actions, mint for Over/Yes and coral for Under/No, and odds shown as large tabular numbers. Motion is short and functional: cards rise in, buttons press, the wheel icon spins only when a block completed in the last certified hour.

## Color tokens (`:root`)

| Token | Value | Role |
| --- | --- | --- |
| `--bg` | `#0b0f14` | Page background (with a soft radial highlight top right) |
| `--surface` | `#131a23` | Cards, panels, header-adjacent surfaces, dialogs |
| `--raised` | `#1a232f` | Inner tiles, inputs on surface, hover base |
| `--hover` | `#212c3a` | Hover fill |
| `--line` / `--line-strong` | `#263243` / `#344358` | Borders and dividers |
| `--ink` | `#eef2f6` | Primary text |
| `--muted` | `#9eabbb` | Secondary text |
| `--faint` | `#6f7d8f` | Icons and placeholders only, never body text |
| `--accent` / `--accent-hover` | `#f6b84b` / `#ffc965` | Primary buttons, active chips, wallet button, chart bars |
| `--on-accent` | `#1b1305` | Text on accent |
| `--accent-soft` | `#2b2312` | Icon wells, estimate box, warning notice |
| `--yes` / `--yes-bg` / `--yes-line` | `#43d99b` / `#0f2a20` / `#1f5c43` | Over/Yes side, open status, gains |
| `--no` / `--no-bg` / `--no-line` | `#ff8a7a` / `#2d1717` / `#6a2e2a` | Under/No side |
| `--live` / `--live-bg` | `#6cb6ff` / `#13253a` | In-play status, links, daypart bars |
| `--warn` | `#f2c46d` | Awaiting settlement and refund status |
| `--error` | `#ff8f84` | Inline errors |
| `--focus` | `#8ec5ff` | 2px focus outline |

Status never relies on color alone: every status pill carries its text label, and odds buttons carry the side name.

## Typography

One family: the system UI stack (`ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, …`). Weights 400, 600, 700. Numbers use `font-variant-numeric: tabular-nums` (`.num`). No uppercase labels and no letter-spacing beyond -0.03em on display type.

| Token | Size | Use |
| --- | --- | --- |
| `--t-small` | 0.8125rem (13px) | Meta, captions, stat labels, pills |
| `--t-body` | 1rem (16px) | Body, controls, inputs (16px avoids iOS zoom) |
| `--t-title` | 1.125rem (18px) | Card questions, odds prices, brand, dialog titles |
| `--t-section` | 1.375rem (22px) | Section headings, dialog question, summary amounts |
| `--t-display` | 1.875rem (30px) | H1 on phones |
| `--t-hero` | 2.75rem (44px) | H1 on wider screens |

The original populated-board probe counted 5 sizes per width (390: 13/16/18/22/30, 1440: 13/16/18/22/44). The revision probe, run offline, uses a subset of the same scale. Market questions, numerical lines, side labels and multipliers use `overflow-wrap: anywhere`, preserving the entire value rather than clipping or ellipsizing it.

## Spacing, radius, motion

- Spacing scale: `--s-1` 4px, `--s-2` 8px, `--s-3` 12px, `--s-4` 16px, `--s-5` 20px, `--s-6` 24px, `--s-8` 32px, `--s-12` 48px.
- Radius: cards `--r-card` 14px, controls `--r-control` 10px, pills `--r-pill`, dialogs 18px.
- Easing `--ease: cubic-bezier(.2,.8,.2,1)`. Transitions name their properties (never `all`), 120 to 400ms. Keyframes: `rise` (card entry), `pop`/`sheet` (dialog entry), `pulse` (status dots), `spin` (wheel icon), `shimmer` (skeletons). `prefers-reduced-motion: reduce` cuts all animation and transition to 1ms and one iteration, and removes card lift.
- Targets: buttons, links in nav, wallet rows and odds buttons are at least 44px tall; chips and selects are 40px.

## Components

- **Header** (`App.tsx`): sticky, blurred translucent bar; logo + "Squeek Predict"; nav (Markets, My bets with a claim badge, Wheel form); How it works; wallet button (amber; "Connect" on phones, short address when connected, "Switch to Sepolia" on the wrong chain).
- **Hero**: H1 "Bet on the hamster’s wheel.", one plain line, primary **Create market** and secondary **How it works**. On phones and tablets a **WheelPulse** card follows (blocks completed in the last certified hour, certified 24h blocks, lag) linking to the wheel panel.
- **Tab bar** (up to 900px): sticky segmented Markets / My bets below the header.
- **Filters**: status chips (horizontal scroll on phones), search field, length, type and sort selects.
- **MarketCard** (`MarketCard.tsx`): type tag with icon, status pill (open mint, in play blue, waiting amber, done grey), question as a button, countdown, two odds buttons (Over mint, Under coral; line zero uses At least one block / No blocks; multiplier `1.67x` or `Open`), pool split bar, pool total / share / market number, your position line, and a claim / resolve / refund action when relevant. Resolved cards show the winning side and the certified block count. `SkeletonCard` is the loading state.
- **WheelPanel** (`WheelPanel.tsx`): heading with spinning wheel when a block completed in the last certified hour, certification line with certification lag, 144-bar sparkline of blocks per round, 3×2 window grid (1h to 7 days), facts list (longest block streak, rounds with blocks, best 24h, daily average), daypart bars, and a note that these are stats only. Loading skeleton, error with retry when any requested certified endpoint is unavailable. The streak is explicitly defined as consecutive rounds with completed blocks, not continuous running.
- **Bet slip** (`MarketDialog.tsx` in `Modal.tsx`): native `<dialog>` with focus return; centered on desktop, bottom sheet on phones. Window dates, side pools, side picker with pool odds, stake field with quick amounts, payout estimate, position and claim with an editable receiving address, resolve/refund actions, settlement details. Odds, side-choice and fact grids use `repeat(2, minmax(0, 1fr))`; side labels and multipliers have zero minimum width. At ≤760px each side label sits above its multiplier; long submit labels wrap as well.
- **Create dialog** (`CreateDialog.tsx`): segmented 24 hours / 7 days, line stepper (±10), Over/Under explanation, start chips (about 1 hour, 6 hours, next 06:00, next 18:00, pick a time with `datetime-local`), window preview, inline validation of the 65-minute to 7-day lead.
- **Market ideas**: six idea buttons with icon wells, lines computed from the last 7 certified days.
- **My bets**: staked / ready-to-claim summary tiles and a mint claim list with one-tap Claim per market.
- **Empty states**: dashed outline, icon well, one heading, one line, one action. **Notice**: amber-tinted retry banner for RPC failure.
- **Wallet sheet** (`Wallet.tsx`): EIP-6963 extensions by name, Open in MetaMask / Coinbase Wallet / Rabby / Phantom on phones, Coinbase (Smart) Wallet.

## Responsive behavior

- **≥1081px**: content max 1280px; two columns, board `minmax(0,1fr)` and a 360px sticky wheel panel; hero single column (the pulse card is hidden because the panel is visible); market grid auto-fills 300px+ cards.
- **≤1080px**: one column; wheel panel moves below the board; hero shows the pulse card.
- **≤900px**: 56px compact header with nav and help hidden, wallet label shortened; sticky Markets / My bets tabs provide navigation. This includes the connected claim-badge and wrong-network states.
- **≤760px**: H1 30px; secondary hero button hidden; status chips scroll horizontally edge to edge; search full width over three selects; one card per row; dialogs become bottom sheets; side-picker labels stack above their multipliers.
- **≤420px**: brand text hidden; the linked logo and its “Squeek Predict home” accessible name remain, leaving room for the complete “Switch to Sepolia” action.
- **≤360px**: selects in two columns, summary tiles stacked.
- Header checked disconnected, connected and on the wrong network at 320, 375, 390, 420, 421, 760, 761, 768, 800, 820, 850, 851, 876, 900, 901 and 1440px with no horizontal scroll. Full uint64 lines checked in cards and connected slips at 320, 390 and 1440px; the ordinary 1,000.5 line also checked at 320px.
