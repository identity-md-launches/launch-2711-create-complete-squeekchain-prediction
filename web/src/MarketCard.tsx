import type { Market, Position } from "./model";
import {
  date,
  durationName,
  eth,
  exactEth,
  kind,
  percentLabel,
  phase,
  poolPercent,
  sideName,
  timeLeft,
  title,
} from "./model";
import { Icon } from "./icons";
import { MarketArt } from "./MarketArt";

export const phaseTone = (status: string) =>
  status === "Open for bets"
    ? "open"
    : status === "In progress"
      ? "live"
      : status === "Resolved" || status === "Cancelled"
        ? "done"
        : "wait";
export function MarketCard({
  market: m,
  position: p,
  now,
  settled,
  best24,
  busy = false,
  onOpen,
}: {
  market: Market;
  position?: Position;
  now: bigint;
  settled?: bigint;
  best24?: number;
  busy?: boolean;
  onOpen: (market: Market, yes?: boolean) => void;
}) {
  const status = phase(m, now, settled);
  const total = m.yesPool + m.noPool;
  const yesPercent = poolPercent(m, true);
  const open = status === "Open for bets";
  const hasPosition = p && p.yes + p.no > 0n;
  const k = kind(m, best24);
  const completed =
    m.endBlockUnits / 1000000000n - m.startBlockUnits / 1000000000n;
  return (
    <article className={`market-card tone-${phaseTone(status)}`}>
      <div className="card-heading">
        <MarketArt
          art={
            k === "Activity"
              ? "bolt"
              : k === "Weekly total"
                ? "chart"
                : "hamster"
          }
          color={
            k === "Activity" ? "mint" : k === "Weekly total" ? "blue" : "orange"
          }
        />
        <div>
          <span className="card-category">
            {k} · {durationName(m)}
          </span>
          <h2>
            <button
              className="question-button"
              disabled={busy}
              onClick={() => onOpen(m)}
            >
              {title(m, best24)}
            </button>
          </h2>
        </div>
      </div>
      <div className="card-odds">
        <div>
          <strong className="num">{percentLabel(yesPercent)}</strong>
          <span>chance of Yes</span>
        </div>
        <span className="open-label">
          <span className="status-dot" />
          {open ? "Open" : status}
        </span>
      </div>
      {m.status === 1 ? (
        <div className="resolved-result">
          <Icon name="check" />
          <span>
            <strong>{sideName(m, m.yesWins)} won</strong> ·{" "}
            {completed.toLocaleString()} blocks
          </span>
        </div>
      ) : (
        <div className="odds-row">
          {[true, false].map((yes) => (
            <button
              key={String(yes)}
              className={`odds ${yes ? "odds-yes" : "odds-no"}`}
              disabled={busy}
              onClick={() => onOpen(m, open ? yes : undefined)}
            >
              <span>
                <Icon name={yes ? "check" : "close"} size={16} />
                {sideName(m, yes)}
              </span>
              <strong className="num">
                {percentLabel(poolPercent(m, yes))}
              </strong>
            </button>
          ))}
        </div>
      )}
      <div className="card-foot">
        <span title={`${exactEth(total)} Sepolia test ETH`}>
          <Icon name="chart" size={14} />
          {eth(total)} ETH vol.
        </span>
        <span>
          <Icon name="clock" size={14} />
          {open
            ? timeLeft(m.startsAt, now)
            : now < m.endsAt
              ? timeLeft(m.endsAt, now)
              : `Ended ${date(m.endsAt)}`}
        </span>
      </div>
      {hasPosition && (
        <div className="position-line">
          <Icon name="ticket" size={16} />
          <span>
            {p.claimed ? (
              "Position claimed"
            ) : p.claimable > 0n ? (
              <>
                <strong className="num">{eth(p.claimable)} ETH</strong> ready to
                claim
              </>
            ) : (
              <>
                Your stake{" "}
                <strong className="num">{eth(p.yes + p.no)} ETH</strong>
              </>
            )}
          </span>
        </div>
      )}
      {!open &&
        (p && p.claimable > 0n ? (
          <button
            className="primary full"
            disabled={busy}
            onClick={() => onOpen(m)}
          >
            {m.status === 2 ? "Claim refund" : "Claim winnings"}
            <Icon name="arrow" size={17} />
          </button>
        ) : status === "Ready to resolve" || status === "Refund available" ? (
          <button
            className="secondary full"
            disabled={busy}
            onClick={() => onOpen(m)}
          >
            {status === "Ready to resolve" ? "Resolve market" : "Open refunds"}
            <Icon name="arrow" size={17} />
          </button>
        ) : null)}
      <div className="card-bottom">
        <span className="mode-label">
          <Icon name="shield" size={13} />
          On-chain · Sepolia
        </span>
        <span>Market #{m.id}</span>
      </div>
    </article>
  );
}
