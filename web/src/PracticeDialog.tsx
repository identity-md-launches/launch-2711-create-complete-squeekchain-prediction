import { useRef, useState } from "react";
import { useConnection } from "wagmi";
import { Modal } from "./Modal";
import { Icon } from "./icons";
import { MarketArt } from "./MarketArt";
import {
  practicePools,
  type PracticeBook,
  type TemplateMarket,
} from "./catalog";
import {
  amount,
  date,
  eth,
  payout,
  percentLabel,
  poolPercent,
  timeLeft,
} from "./model";

export function PracticeDialog({
  market: m,
  yes: initialYes,
  book,
  now,
  onClose,
  onConnect,
  onPlace,
}: {
  market: TemplateMarket;
  yes: boolean;
  book: PracticeBook;
  now: number;
  onClose: () => void;
  onConnect: () => void;
  onPlace: (market: TemplateMarket, yes: boolean, input: string) => boolean;
}) {
  const { address } = useConnection();
  const [yes, setYes] = useState(initialYes);
  const [stake, setStake] = useState("0.001");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [persisted, setPersisted] = useState(true);
  const field = useRef<HTMLInputElement>(null);
  const pools = practicePools(book, m.id);
  const openingPools = { yesPool: 0n, noPool: 0n };
  const previous = book.positions.find(
    (p) =>
      p.market.id === m.id &&
      p.account.toLowerCase() === address?.toLowerCase(),
  );
  let value = 0n;
  try {
    value = amount(stake);
  } catch {
    /* Explained at submit. */
  }
  const estimate = value
    ? payout(
        pools,
        yes,
        value,
        BigInt((yes ? previous?.yes : previous?.no) ?? "0"),
      )
    : null;
  const closed = now >= m.startsAt;
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      amount(stake);
      if (!address) {
        onConnect();
        return;
      }
      setPersisted(onPlace(m, yes, stake));
      setDone(true);
    } catch (e) {
      setError((e as Error).message.replace("test ETH", "practice ETH"));
      field.current?.focus();
    }
  }
  return (
    <Modal
      title={done ? "Prediction placed" : "Place a prediction"}
      onClose={onClose}
      className="sheet practice-slip"
    >
      <div className="slip-market">
        <MarketArt art={m.art} color={m.color} />
        <h3>{m.question}</h3>
      </div>
      <div className="slip-meta">
        <span className="mode-label">
          <Icon name="ticket" size={14} />
          Practice market
        </span>
        <span>
          <Icon name="clock" size={14} />
          {timeLeft(BigInt(m.startsAt), BigInt(now))}
        </span>
      </div>
      {done ? (
        <div className="success-state">
          <span className="success-icon">
            <Icon name="check" size={28} />
          </span>
          <h3>You’re backing {yes ? "Yes" : "No"}</h3>
          <p>
            <strong>{stake} practice ETH</strong>{" "}
            {persisted
              ? "saved to your positions on this device."
              : "saved for this visit only. Browser storage is unavailable."}{" "}
            No funds moved.
          </p>
          <a
            className="button primary full"
            href="#positions"
            onClick={onClose}
          >
            View my positions
            <Icon name="arrow" size={17} />
          </a>
          <button className="secondary full" onClick={onClose}>
            Keep exploring
          </button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <fieldset className="side-choice">
            <legend>Choose a side</legend>
            {[true, false].map((side) => (
              <label
                key={String(side)}
                className={
                  yes === side ? (side ? "selected-yes" : "selected-no") : ""
                }
              >
                <input
                  type="radio"
                  name="side"
                  checked={yes === side}
                  onChange={() => setYes(side)}
                />
                <span>
                  <Icon name={side ? "check" : "close"} size={16} />
                  {side ? "Yes" : "No"}
                </span>
                <strong className="num">
                  {percentLabel(poolPercent(openingPools, side))}
                </strong>
              </label>
            ))}
          </fieldset>
          <label className="field-label" htmlFor="practice-stake">
            Amount <span>Practice ETH</span>
          </label>
          <div className="amount-field">
            <input
              id="practice-stake"
              name="practice-stake"
              inputMode="decimal"
              autoComplete="off"
              ref={field}
              value={stake}
              onChange={(e) => {
                setStake(e.target.value);
                setError("");
              }}
              aria-invalid={Boolean(error)}
              aria-describedby="practice-help practice-error"
            />
            <span>ETH</span>
          </div>
          <div className="quick-amounts">
            {["0.001", "0.005", "0.01"].map((v) => (
              <button
                type="button"
                key={v}
                className={stake === v ? "chosen" : ""}
                onClick={() => {
                  setStake(v);
                  setError("");
                }}
              >
                {v} ETH
              </button>
            ))}
          </div>
          <p id="practice-help" className="small muted">
            Virtual stake. No deposit, gas or wallet signature.
          </p>
          <dl className="slip-estimate">
            <div>
              <dt>Potential practice return</dt>
              <dd className="num">
                {estimate === null
                  ? "Needs opposing bets"
                  : `${eth(estimate)} ETH`}
              </dd>
            </div>
            <div>
              <dt>Platform fee</dt>
              <dd>0%</dd>
            </div>
          </dl>
          <p className="small muted">
            Includes your stakes on this side. Returns share the local practice
            pool and change with bets. An unmatched position has no winnings.
          </p>
          <p className="inline-error" role="alert" id="practice-error">
            {error}
          </p>
          <button
            className={`primary full bet-submit ${yes ? "submit-yes" : "submit-no"}`}
            type="submit"
            disabled={closed}
          >
            {closed
              ? "Betting closed"
              : !address
                ? "Connect wallet to predict"
                : `Place ${yes ? "Yes" : "No"} prediction`}
            <Icon name="arrow" size={18} />
          </button>
          <p className="slip-disclosure small">
            Practice only. Positions and volume stay in this browser, linked to
            your connected address. Nothing is sent on-chain.
          </p>
        </form>
      )}
      <details className="market-details">
        <summary>
          Rules & verification
          <Icon name="chevron" size={15} />
        </summary>
        <p>
          Yes wins if official settled SqueekCore whole-block heights increase
          by strictly more than {m.threshold.toLocaleString()} during this{" "}
          {m.hours === 168 ? "7-day" : `${m.hours}-hour`} window. Exactly{" "}
          {m.threshold.toLocaleString()} is No.
        </p>
        <dl className="market-facts">
          <div>
            <dt>Betting closes / window starts</dt>
            <dd>{date(BigInt(m.startsAt))}</dd>
          </div>
          <div>
            <dt>Window ends</dt>
            <dd>{date(BigInt(m.endsAt))}</dd>
          </div>
        </dl>
        <p className="small muted">
          {m.key === "night-500" ? "Overnight means 00:00–06:00 UTC. " : ""}
          Results appear only after SqueekCore certifies both endpoints.
          Certification may lag. Practice results are informational, with no
          redeemable payout.
        </p>
      </details>
    </Modal>
  );
}
