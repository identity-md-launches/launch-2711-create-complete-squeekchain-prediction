// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ISqueekCore} from "./interfaces/ISqueekCore.sol";

/// @title Squeek Predict
/// @notice Sepolia ETH pari-mutuel markets on official Squeekchain completed blocks.
/// @dev No owner, fees, upgrade path, keeper privilege, or access to unclaimed stakes.
contract SqueekPredict {
    ISqueekCore public constant CORE = ISqueekCore(0x74665dAecA35A2303e767E76a2FF1FB6F93e119f);
    uint256 public constant CHAIN_ID = 11_155_111;
    uint64 public constant ROUND_DURATION = 600;
    uint96 public constant BLOCK_UNITS = 1_000_000_000;
    uint64 public constant DAY = 1 days;
    uint64 public constant WEEK = 7 days;
    uint64 public constant MIN_LEAD_TIME = 1 hours;
    uint64 public constant MAX_LEAD_TIME = 7 days;
    // Resolution stays exclusive for this long after the window ends. The Reporter has certified
    // rounds more than 3 days late on Sepolia, so this must comfortably outlast such an outage;
    // a market is refunded only if Core never certifies its last round within it.
    uint64 public constant RESOLUTION_GRACE = 30 days;
    uint256 public constant MIN_BET = 0.0001 ether;
    // Per-side cap: one side filling up cannot lock the other side out of the market.
    // Bounds stake * pool well below uint256.max; also limits exposure for this MVP.
    uint256 public constant MAX_SIDE_POOL = 100 ether;

    enum Status {
        Open,
        Resolved,
        Cancelled
    }

    struct Market {
        uint64 threshold;
        uint64 startRound;
        uint64 endRound;
        uint64 startsAt;
        uint64 endsAt;
        uint64 refundAt;
        uint64 genesisTimestamp;
        bytes32 streamId;
        address implementation;
        Status status;
        bool yesWins;
        uint96 startBlockUnits;
        uint96 endBlockUnits;
        uint256 yesPool;
        uint256 noPool;
        uint256 remainingWinningStake;
        uint256 remainingPayout;
    }

    struct Position {
        uint256 yes;
        uint256 no;
        bool claimed;
    }

    uint256 public marketCount;
    uint256 public totalLiability;
    mapping(uint256 => Market) private _markets;
    mapping(uint256 => mapping(address => Position)) public positions;
    bool private _entered;

    error WrongChain();
    error InvalidDuration();
    error InvalidStart();
    error UnsupportedCore();
    error CorePaused();
    error CoreChanged();
    error InvalidMarket();
    error MarketFinalized();
    error BettingClosed();
    error InvalidStake();
    error PoolLimit();
    error TooEarly();
    error ResolutionExpired();
    error NotSettled();
    error InvalidHistory();
    error BothSidesFunded();
    error NotFinalized();
    error NothingToClaim();
    error AlreadyClaimed();
    error InvalidRecipient();
    error PaymentFailed();
    error Reentrancy();

    event MarketCreated(
        uint256 indexed marketId,
        address indexed creator,
        uint64 threshold,
        uint64 startRound,
        uint64 endRound,
        uint64 startsAt,
        uint64 endsAt
    );
    event BetPlaced(uint256 indexed marketId, address indexed bettor, bool yes, uint256 amount);
    event MarketResolved(
        uint256 indexed marketId, bool yesWins, uint256 completedBlocks, uint96 startBlockUnits, uint96 endBlockUnits
    );
    event MarketCancelled(uint256 indexed marketId);
    event Claimed(uint256 indexed marketId, address indexed bettor, address indexed recipient, uint256 amount);

    modifier nonReentrant() {
        if (_entered) revert Reentrancy();
        _entered = true;
        _;
        _entered = false;
    }

    /// @notice Creates "more than threshold blocks" over DAY or WEEK, beginning at startRound.
    /// @dev startRound is the first included round; betting ends at its start, at least 1h away.
    ///      Construction has no external calls, so factory deployment also works on an empty chain.
    function createMarket(uint64 threshold, uint64 startRound, uint64 duration) external returns (uint256 id) {
        if (block.chainid != CHAIN_ID) revert WrongChain();
        if (duration != DAY && duration != WEEK) revert InvalidDuration();
        ISqueekCore.CoreConfiguration memory config = _configuration();
        if (CORE.state().paused) revert CorePaused();
        if (startRound == 0) revert InvalidStart();
        uint256 startsAt = uint256(config.genesisTimestamp) + uint256(startRound - 1) * ROUND_DURATION;
        if (startsAt < block.timestamp + MIN_LEAD_TIME || startsAt > block.timestamp + MAX_LEAD_TIME) {
            revert InvalidStart();
        }
        uint256 endRound = uint256(startRound) - 1 + duration / ROUND_DURATION;
        uint256 refundAt = startsAt + duration + RESOLUTION_GRACE;
        if (endRound > type(uint64).max || refundAt > type(uint64).max) revert InvalidStart();
        address implementation = CORE.implementationCodeAddress();
        if (implementation == address(0)) revert UnsupportedCore();

        id = ++marketCount;
        Market storage m = _markets[id];
        m.threshold = threshold;
        m.startRound = startRound;
        m.endRound = uint64(endRound);
        m.startsAt = uint64(startsAt);
        m.endsAt = uint64(startsAt + duration);
        m.refundAt = uint64(refundAt);
        m.genesisTimestamp = config.genesisTimestamp;
        m.streamId = config.streamId;
        m.implementation = implementation;
        emit MarketCreated(id, msg.sender, threshold, startRound, m.endRound, m.startsAt, m.endsAt);
    }

    /// @notice Adds Sepolia ETH to either side. A wallet may add stakes on both sides.
    /// @dev Each side is capped on its own, so a full YES pool still accepts NO stakes and vice versa.
    function bet(uint256 id, bool yes) external payable {
        Market storage m = _openMarket(id);
        if (block.timestamp >= m.startsAt) revert BettingClosed();
        if (msg.value < MIN_BET) revert InvalidStake();
        if (msg.value > MAX_SIDE_POOL - (yes ? m.yesPool : m.noPool)) revert PoolLimit();
        Position storage p = positions[id][msg.sender];
        if (yes) {
            p.yes += msg.value;
            m.yesPool += msg.value;
        } else {
            p.no += msg.value;
            m.noPool += msg.value;
        }
        totalLiability += msg.value;
        emit BetPlaced(id, msg.sender, yes, msg.value);
    }

    /// @notice Anyone can resolve using exact certified endpoints, including after delayed settlement.
    /// @dev Resolution is disabled at refundAt, eliminating a refund/resolution race at that boundary:
    ///      a losing side can never front-run a late resolution with cancelExpired.
    function resolve(uint256 id) external {
        Market storage m = _openMarket(id);
        if (block.timestamp < m.endsAt) revert TooEarly();
        if (block.timestamp >= m.refundAt) revert ResolutionExpired();
        ISqueekCore.CoreConfiguration memory config = _configuration();
        if (
            config.genesisTimestamp != m.genesisTimestamp || config.streamId != m.streamId
                || CORE.implementationCodeAddress() != m.implementation
        ) revert CoreChanged();
        if (CORE.state().settledThroughRound < m.endRound) revert NotSettled();

        ISqueekCore.LedgerPosition memory start = _point(m.startRound - 1);
        ISqueekCore.LedgerPosition memory end = _point(m.endRound);
        if (end.cumulativeBlockUnits < start.cumulativeBlockUnits || end.cumulativeWork < start.cumulativeWork) {
            revert InvalidHistory();
        }
        uint256 completed =
            uint256(end.cumulativeBlockUnits) / BLOCK_UNITS - uint256(start.cumulativeBlockUnits) / BLOCK_UNITS;
        m.startBlockUnits = start.cumulativeBlockUnits;
        m.endBlockUnits = end.cumulativeBlockUnits;
        m.yesWins = completed > m.threshold;
        // A pool without opposition is refunded, regardless of the observed outcome.
        if (m.yesPool == 0 || m.noPool == 0) {
            _cancel(id, m);
            return;
        }
        m.status = Status.Resolved;
        m.remainingWinningStake = m.yesWins ? m.yesPool : m.noPool;
        m.remainingPayout = m.yesPool + m.noPool;
        emit MarketResolved(id, m.yesWins, completed, start.cumulativeBlockUnits, end.cumulativeBlockUnits);
    }

    /// @notice Refunds empty or one-sided markets after betting closes, without requiring the oracle.
    function cancelUnmatched(uint256 id) external {
        Market storage m = _openMarket(id);
        if (block.timestamp < m.startsAt) revert TooEarly();
        if (m.yesPool != 0 && m.noPool != 0) revert BothSidesFunded();
        _cancel(id, m);
    }

    /// @notice Unresolved markets can always be refunded after a fixed grace period, even if Core fails.
    function cancelExpired(uint256 id) external {
        Market storage m = _openMarket(id);
        if (block.timestamp < m.refundAt) revert TooEarly();
        _cancel(id, m);
    }

    /// @notice Pulls this wallet's payout/refund to a chosen recipient; no third party can redirect it.
    function claim(uint256 id, address payable recipient) external nonReentrant returns (uint256 amount) {
        Market storage m = _market(id);
        if (m.status == Status.Open) revert NotFinalized();
        if (recipient == address(0) || recipient == address(this)) revert InvalidRecipient();
        Position storage p = positions[id][msg.sender];
        if (p.claimed) revert AlreadyClaimed();
        amount = _claimable(m, p);
        if (amount == 0) revert NothingToClaim();

        p.claimed = true;
        if (m.status == Status.Resolved) m.remainingWinningStake -= m.yesWins ? p.yes : p.no;
        m.remainingPayout -= amount;
        totalLiability -= amount;
        emit Claimed(id, msg.sender, recipient, amount);
        (bool success,) = recipient.call{value: amount}("");
        if (!success) revert PaymentFailed();
    }

    function getMarket(uint256 id) external view returns (Market memory) {
        return _market(id);
    }

    /// @notice Current claim amount; other winners claiming can change the final claimant's rounding dust.
    function claimable(uint256 id, address bettor) external view returns (uint256) {
        Market storage m = _market(id);
        Position storage p = positions[id][bettor];
        if (m.status == Status.Open || p.claimed) return 0;
        return _claimable(m, p);
    }

    function _claimable(Market storage m, Position storage p) private view returns (uint256) {
        if (m.status == Status.Cancelled) return p.yes + p.no;
        uint256 stake = m.yesWins ? p.yes : p.no;
        if (stake == 0) return 0;
        // All earlier winners receive floor(stake * original total / original winning pool).
        // The final winner receives the remainder, so no participant funds become stuck as dust.
        if (stake == m.remainingWinningStake) return m.remainingPayout;
        return stake * (m.yesPool + m.noPool) / (m.yesWins ? m.yesPool : m.noPool);
    }

    function _cancel(uint256 id, Market storage m) private {
        m.status = Status.Cancelled;
        m.remainingPayout = m.yesPool + m.noPool;
        emit MarketCancelled(id);
    }

    function _configuration() private view returns (ISqueekCore.CoreConfiguration memory config) {
        if (CORE.implementationCodeVersion() != 3) revert UnsupportedCore();
        config = CORE.configuration();
        if (
            config.roundDuration != ROUND_DURATION || config.blockUnitsPerBlock != BLOCK_UNITS
                || config.streamId == bytes32(0) || config.genesisTimestamp == 0
                || config.genesisTimestamp > block.timestamp
        ) revert UnsupportedCore();
    }

    function _point(uint64 round) private view returns (ISqueekCore.LedgerPosition memory result) {
        ISqueekCore.RoundPage memory page = CORE.roundPage(round, round, 0);
        if (
            page.certifiedThroughRound != round || page.rounds.length != 0
                || page.start.cumulativeBlockUnits != page.end.cumulativeBlockUnits
                || page.start.cumulativeWork != page.end.cumulativeWork
                || page.start.workPerThousandBlocks != page.end.workPerThousandBlocks
        ) revert InvalidHistory();
        return page.end;
    }

    function _market(uint256 id) private view returns (Market storage m) {
        if (id == 0 || id > marketCount) revert InvalidMarket();
        return _markets[id];
    }

    function _openMarket(uint256 id) private view returns (Market storage m) {
        m = _market(id);
        if (m.status != Status.Open) revert MarketFinalized();
    }
}
