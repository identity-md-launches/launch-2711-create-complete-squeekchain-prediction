// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {SqueekPredict} from "src/SqueekPredict.sol";
import {TimelineSqueekCore} from "./mocks/TimelineSqueekCore.sol";

contract StatefulRejectingRecipient {
    receive() external payable {
        revert("recipient unavailable");
    }
}

contract PredictLifecycleHandler is Test {
    uint256 internal constant MINIMUM = 0.0001 ether;
    uint256 internal constant LIMIT = 100 ether; // Per side.
    uint256 internal constant GRACE = 30 days;
    uint256 internal constant INITIAL_BALANCE = 1_000_000 ether;
    uint64 internal constant GENESIS = 1_700_000_000;
    uint256 internal constant ACTORS = 6;

    struct Model {
        uint64 startRound;
        uint64 startsAt;
        uint64 duration;
        uint64 threshold;
        SqueekPredict.Status status;
        bool yesWins;
        uint256 yes;
        uint256 no;
        uint256 paid;
    }

    SqueekPredict public immutable market;
    TimelineSqueekCore public immutable oracle;
    StatefulRejectingRecipient public immutable rejector;
    address[6] public actors;
    Model[] internal models;
    mapping(uint256 => mapping(uint256 => uint256)) internal yesStakes;
    mapping(uint256 => mapping(uint256 => uint256)) internal noStakes;
    mapping(uint256 => mapping(uint256 => bool)) internal claimed;
    uint256[6] internal spent;
    uint256[6] internal received;
    uint256 public deposits;
    uint256 public payouts;
    uint256 public surplus;
    uint256 public successfulBets;
    uint256 public successfulClaims;
    uint256 public successfulResolutions;
    uint256 public successfulCancellations;
    uint256 public expectedRejections;

    constructor(SqueekPredict market_, TimelineSqueekCore oracle_) {
        market = market_;
        oracle = oracle_;
        rejector = new StatefulRejectingRecipient();
        models.push(); // Market ids start at one.
        for (uint256 i; i < ACTORS; ++i) {
            actors[i] = makeAddr(string.concat("lifecycle actor ", vm.toString(i)));
            vm.deal(actors[i], INITIAL_BALANCE);
        }
    }

    function create(uint64 thresholdSeed, bool weekly, uint8 leadSeed) public {
        if (models.length > 24) return;
        uint64 duration = weekly ? uint64(7 days) : uint64(1 days);
        uint64 blocksInWindow = weekly ? 126 : 18;
        uint64 threshold;
        uint256 choice = thresholdSeed % 5;
        if (choice == 1) threshold = blocksInWindow - 1;
        if (choice == 2) threshold = blocksInWindow;
        if (choice == 3) threshold = blocksInWindow + 1;
        if (choice == 4) threshold = type(uint64).max;
        uint64 round = uint64((block.timestamp + 1 hours - GENESIS + 599) / 600 + 1 + leadSeed % 37);
        if (oracle.offline()) {
            vm.expectRevert(bytes("timeline offline"));
            market.createMarket(threshold, round, duration);
            ++expectedRejections;
            return;
        }
        if (oracle.isPaused()) {
            vm.expectRevert(SqueekPredict.CorePaused.selector);
            market.createMarket(threshold, round, duration);
            ++expectedRejections;
            return;
        }
        uint256 id = market.createMarket(threshold, round, duration);
        assertEq(id, models.length, "creation must allocate exactly one id");
        models.push(
            Model({
                startRound: round,
                startsAt: GENESIS + (round - 1) * 600,
                duration: duration,
                threshold: threshold,
                status: SqueekPredict.Status.Open,
                yesWins: false,
                yes: 0,
                no: 0,
                paid: 0
            })
        );
    }

    function bet(uint256 marketSeed, uint256 actorSeed, bool side, uint96 amountSeed) public {
        uint256 id = _id(marketSeed);
        uint256 actor = actorSeed % ACTORS;
        Model storage m = models[id];
        uint256 room = LIMIT - (side ? m.yes : m.no);
        uint256 mode = amountSeed % 8;
        uint256 amount;
        if (mode == 0) amount = 0;
        else if (mode == 1) amount = 1;
        else if (mode == 2) amount = MINIMUM - 1;
        else if (mode == 3) amount = MINIMUM;
        else if (mode == 4) amount = room;
        else if (mode == 5) amount = room + 1;
        else amount = bound(amountSeed, MINIMUM, 10 ether);
        bytes4 error;
        if (m.status != SqueekPredict.Status.Open) error = SqueekPredict.MarketFinalized.selector;
        else if (block.timestamp >= m.startsAt) error = SqueekPredict.BettingClosed.selector;
        else if (amount < MINIMUM) error = SqueekPredict.InvalidStake.selector;
        else if (amount > room) error = SqueekPredict.PoolLimit.selector;
        if (error != bytes4(0)) {
            vm.expectRevert(error);
            vm.prank(actors[actor]);
            market.bet{value: amount}(id, side);
            ++expectedRejections;
            return;
        }
        vm.prank(actors[actor]);
        market.bet{value: amount}(id, side);
        if (side) {
            m.yes += amount;
            yesStakes[id][actor] += amount;
        } else {
            m.no += amount;
            noStakes[id][actor] += amount;
        }
        deposits += amount;
        spent[actor] += amount;
        ++successfulBets;
    }

    function advance(uint32 delta) external {
        vm.warp(block.timestamp + bound(delta, 0, 12 hours));
    }

    function jumpToBoundary(uint256 marketSeed, uint8 boundarySeed, uint8 offsetSeed) public {
        Model storage m = models[_id(marketSeed)];
        uint256 time = m.startsAt;
        uint256 boundary = boundarySeed % 3;
        if (boundary != 0) time += m.duration;
        if (boundary == 2) time += GRACE;
        time = time - 1 + offsetSeed % 3;
        if (time > block.timestamp) vm.warp(time);
    }

    function changeOracle(bool offline, bool paused, uint32 lagSeed) public {
        oracle.setAvailability(offline, paused);
        if (paused) return;
        uint64 elapsed = uint64((block.timestamp - GENESIS) / 600);
        uint64 lag = uint64(bound(lagSeed, 0, elapsed - oracle.frontier()));
        oracle.certify(elapsed - lag);
    }

    function finalize(uint256 marketSeed, uint8 actionSeed) public {
        uint256 id = _id(marketSeed);
        Model storage m = models[id];
        uint256 action = actionSeed % 3;
        uint256 ends = uint256(m.startsAt) + m.duration;
        uint256 refund = ends + GRACE;
        bytes4 error;
        bool offlineFailure;
        if (m.status != SqueekPredict.Status.Open) {
            error = SqueekPredict.MarketFinalized.selector;
        } else if (action == 0) {
            if (block.timestamp < ends) error = SqueekPredict.TooEarly.selector;
            else if (block.timestamp >= refund) error = SqueekPredict.ResolutionExpired.selector;
            else if (oracle.offline()) offlineFailure = true;
            else if (oracle.frontier() < m.startRound - 1 + m.duration / 600) error = SqueekPredict.NotSettled.selector;
        } else if (action == 1) {
            if (block.timestamp < m.startsAt) error = SqueekPredict.TooEarly.selector;
            else if (m.yes != 0 && m.no != 0) error = SqueekPredict.BothSidesFunded.selector;
        } else if (block.timestamp < refund) {
            error = SqueekPredict.TooEarly.selector;
        }

        if (offlineFailure) vm.expectRevert(bytes("timeline offline"));
        else if (error != bytes4(0)) vm.expectRevert(error);
        if (action == 0) market.resolve(id);
        else if (action == 1) market.cancelUnmatched(id);
        else market.cancelExpired(id);
        if (offlineFailure || error != bytes4(0)) {
            ++expectedRejections;
            return;
        }

        if (action == 0) m.yesWins = (m.duration == 1 days ? 18 : 126) > m.threshold;
        if (action == 0 && m.yes != 0 && m.no != 0) {
            m.status = SqueekPredict.Status.Resolved;
            ++successfulResolutions;
        } else {
            m.status = SqueekPredict.Status.Cancelled;
            ++successfulCancellations;
        }
    }

    function withdraw(uint256 marketSeed, uint256 actorSeed, uint8 recipientSeed) public {
        _withdraw(_id(marketSeed), actorSeed % ACTORS, recipientSeed % 8);
    }

    function donate(uint96 amountSeed) public {
        uint256 amount = bound(amountSeed, 0, 100 ether);
        // Models ETH forced into the account; no participant receives credit for it.
        vm.deal(address(market), address(market).balance + amount);
        surplus += amount;
    }

    function _withdraw(uint256 id, uint256 actor, uint256 destination) internal {
        Model storage m = models[id];
        address payable to = destination < ACTORS
            ? payable(actors[destination])
            : destination == 6 ? payable(address(0)) : payable(address(rejector));
        bytes4 error;
        uint256 stake = m.yesWins ? yesStakes[id][actor] : noStakes[id][actor];
        bool entitled =
            m.status == SqueekPredict.Status.Cancelled ? yesStakes[id][actor] + noStakes[id][actor] != 0 : stake != 0;
        if (m.status == SqueekPredict.Status.Open) error = SqueekPredict.NotFinalized.selector;
        else if (destination == 6) error = SqueekPredict.InvalidRecipient.selector;
        else if (claimed[id][actor]) error = SqueekPredict.AlreadyClaimed.selector;
        else if (!entitled) error = SqueekPredict.NothingToClaim.selector;
        else if (destination == 7) error = SqueekPredict.PaymentFailed.selector;
        if (error != bytes4(0)) {
            vm.expectRevert(error);
            vm.prank(actors[actor]);
            market.claim(id, to);
            ++expectedRejections;
            return;
        }
        uint256 beforeBalance = to.balance;
        uint256 preview = market.claimable(id, actors[actor]);
        vm.prank(actors[actor]);
        uint256 amount = market.claim(id, to);
        assertGt(amount, 0, "entitled position paid nothing");
        assertEq(to.balance - beforeBalance, amount, "recipient did not receive returned amount");
        assertEq(amount, preview, "preview differs without an intervening state change");
        if (m.status == SqueekPredict.Status.Cancelled) {
            assertEq(amount, yesStakes[id][actor] + noStakes[id][actor], "refund differs from deposits");
        } else {
            uint256 remainingWinners;
            for (uint256 a; a < ACTORS; ++a) {
                if (!claimed[id][a] && (m.yesWins ? yesStakes[id][a] : noStakes[id][a]) != 0) ++remainingWinners;
            }
            uint256 winningPool = m.yesWins ? m.yes : m.no;
            uint256 numerator = stake * (m.yes + m.no);
            if (remainingWinners == 1) {
                assertEq(amount, m.yes + m.no - m.paid, "last winner must drain this market only");
                assertGe(amount * winningPool, numerator);
                assertLt(amount * winningPool, numerator + ACTORS * winningPool);
            } else {
                assertLe(amount * winningPool, numerator, "early payout rounded up");
                assertGt((amount + 1) * winningPool, numerator, "early payout underpaid");
            }
        }
        claimed[id][actor] = true;
        m.paid += amount;
        payouts += amount;
        received[destination] += amount;
        ++successfulClaims;
    }

    function assertAccounting() external view {
        assertEq(market.marketCount(), models.length - 1);
        assertEq(market.totalLiability(), deposits - payouts, "ghost cashflow vs global liability");
        assertEq(address(market).balance, deposits - payouts + surplus, "actual cash vs independent cashflow");
        uint256 unpaid;
        for (uint256 id = 1; id < models.length; ++id) {
            Model storage expected = models[id];
            SqueekPredict.Market memory actual = market.getMarket(id);
            assertEq(actual.yesPool, expected.yes);
            assertEq(actual.noPool, expected.no);
            assertLe(actual.yesPool, LIMIT);
            assertLe(actual.noPool, LIMIT);
            unpaid += expected.yes + expected.no - expected.paid;
            uint256 remainingStake;
            uint256 previews;
            uint256 unclaimedWinners;
            for (uint256 a; a < ACTORS; ++a) {
                (uint256 yes, uint256 no, bool didClaim) = market.positions(id, actors[a]);
                assertEq(yes, yesStakes[id][a], "another wallet's YES stake changed");
                assertEq(no, noStakes[id][a], "another wallet's NO stake changed");
                assertEq(didClaim, claimed[id][a], "claim flag differs from successful withdrawals");
                uint256 preview = market.claimable(id, actors[a]);
                if (claimed[id][a] || expected.status == SqueekPredict.Status.Open) {
                    assertEq(preview, 0);
                } else if (expected.status == SqueekPredict.Status.Cancelled) {
                    assertEq(preview, yes + no);
                } else {
                    uint256 stake = expected.yesWins ? yes : no;
                    remainingStake += stake;
                    if (stake == 0) {
                        assertEq(preview, 0, "loser received an entitlement");
                    } else {
                        assertGt(preview, 0);
                        ++unclaimedWinners;
                    }
                }
                previews += preview;
            }
            assertEq(actual.remainingWinningStake, remainingStake);
            if (expected.status == SqueekPredict.Status.Open) {
                assertEq(actual.remainingPayout, 0);
            } else {
                assertEq(actual.remainingPayout, expected.yes + expected.no - expected.paid);
                assertLe(previews, actual.remainingPayout, "previews overcommit the market");
                if (expected.status == SqueekPredict.Status.Cancelled || unclaimedWinners <= 1) {
                    assertEq(previews, actual.remainingPayout);
                } else {
                    // Dust can include fractions left by already-paid winners as well.
                    assertLt(actual.remainingPayout - previews, ACTORS);
                }
            }
        }
        assertEq(unpaid, market.totalLiability());
        for (uint256 a; a < ACTORS; ++a) {
            assertEq(actors[a].balance, INITIAL_BALANCE - spent[a] + received[a], "wallet cashflow mismatch");
        }
        assertEq(address(rejector).balance, 0);
    }

    function assertStateMachine() external view {
        for (uint256 id = 1; id < models.length; ++id) {
            Model storage expected = models[id];
            SqueekPredict.Market memory actual = market.getMarket(id);
            assertEq(uint256(actual.status), uint256(expected.status), "unexpected status transition");
            assertEq(actual.yesWins, expected.yesWins, "outcome changed or used a different window");
            assertEq(actual.threshold, expected.threshold);
            assertEq(actual.startRound, expected.startRound);
            assertEq(actual.endRound, expected.startRound - 1 + expected.duration / 600);
            assertEq(actual.startsAt, expected.startsAt);
            assertEq(actual.endsAt, uint256(expected.startsAt) + expected.duration);
            assertEq(actual.refundAt, uint256(expected.startsAt) + expected.duration + GRACE);
            assertEq(actual.genesisTimestamp, GENESIS);
            assertEq(actual.streamId, oracle.STREAM());
            assertEq(actual.implementation, address(oracle));
            if (expected.status == SqueekPredict.Status.Resolved) {
                assertEq(actual.startBlockUnits, uint256(expected.startRound - 1) * 125_000_000);
                assertEq(actual.endBlockUnits - actual.startBlockUnits, expected.duration == 1 days ? 18e9 : 126e9);
            }
        }
    }

    function closeAll(uint256 orderSeed) external {
        // Drain even with a permanently unavailable oracle, and never move time backwards.
        oracle.setAvailability(true, true);
        uint256 deadline = vm.getBlockTimestamp();
        for (uint256 id = 1; id < models.length; ++id) {
            uint256 refund = uint256(models[id].startsAt) + models[id].duration + GRACE;
            if (refund > deadline) deadline = refund;
        }
        vm.warp(deadline);
        for (uint256 id = 1; id < models.length; ++id) {
            if (models[id].status == SqueekPredict.Status.Open) finalize(id - 1, 2);
            for (uint256 j; j < ACTORS; ++j) {
                uint256 actor = (j + orderSeed % ACTORS) % ACTORS;
                // Entitlement comes from the ghost positions, not claimable(). A bad
                // preview therefore cannot silently make the drain skip an owed claim.
                Model storage m = models[id];
                uint256 stake = m.status == SqueekPredict.Status.Cancelled
                    ? yesStakes[id][actor] + noStakes[id][actor]
                    : m.yesWins ? yesStakes[id][actor] : noStakes[id][actor];
                if (!claimed[id][actor] && stake != 0) _withdraw(id, actor, (actor + 1) % ACTORS);
            }
        }
    }

    function _id(uint256 seed) internal view returns (uint256) {
        return 1 + seed % (models.length - 1);
    }
}

/// forge-config: default.invariant.runs = 256
/// forge-config: default.invariant.depth = 128
/// forge-config: default.invariant.fail-on-revert = true
contract SqueekPredictStatefulTest is StdInvariant, Test {
    SqueekPredict internal market;
    PredictLifecycleHandler internal handler;

    function setUp() public {
        vm.chainId(11_155_111);
        vm.warp(1_700_060_000);
        address core = 0x74665dAecA35A2303e767E76a2FF1FB6F93e119f;
        TimelineSqueekCore template = new TimelineSqueekCore();
        vm.etch(core, address(template).code);
        TimelineSqueekCore oracle = TimelineSqueekCore(core);
        oracle.certify(100);
        market = new SqueekPredict();
        handler = new PredictLifecycleHandler(market, oracle);
        handler.create(1, false, 0); // YES wins with certified history.
        handler.create(2, true, 0); // Equality means NO for the weekly market.
        handler.create(0, false, 12); // Kept unmatched initially.
        handler.bet(0, 0, true, 3);
        handler.bet(0, 1, false, 3);
        handler.bet(1, 2, true, 3);
        handler.bet(1, 3, false, 3);
        handler.bet(2, 4, false, 3);
        bytes4[] memory selectors = new bytes4[](8);
        selectors[0] = PredictLifecycleHandler.create.selector;
        selectors[1] = PredictLifecycleHandler.bet.selector;
        selectors[2] = PredictLifecycleHandler.advance.selector;
        selectors[3] = PredictLifecycleHandler.jumpToBoundary.selector;
        selectors[4] = PredictLifecycleHandler.changeOracle.selector;
        selectors[5] = PredictLifecycleHandler.finalize.selector;
        selectors[6] = PredictLifecycleHandler.withdraw.selector;
        selectors[7] = PredictLifecycleHandler.donate.selector;
        targetSelector(FuzzSelector(address(handler), selectors));
        targetContract(address(handler));
    }

    function invariant_EveryWeiAndEveryPositionMatchesIndependentCashflows() public view {
        handler.assertAccounting();
    }

    function invariant_QuestionsAreImmutableAndFinalStatesNeverReopen() public view {
        handler.assertStateMachine();
    }

    function afterInvariant() public {
        handler.closeAll(handler.successfulBets());
        handler.assertAccounting();
        handler.assertStateMachine();
        assertEq(market.totalLiability(), 0, "some participant funds cannot be withdrawn");
        assertEq(handler.payouts(), handler.deposits(), "some accounted ETH was lost or created");
        assertEq(address(market).balance, handler.surplus(), "only forced surplus may remain");
    }

    function test_HandlerExercisesSuccessRejectionRecoveryAndBothOutcomes() public {
        handler.finalize(0, 0); // Too early.
        handler.jumpToBoundary(0, 1, 1);
        handler.finalize(0, 0); // Unsettled.
        handler.changeOracle(false, false, 0);
        handler.finalize(0, 0);
        handler.withdraw(0, 0, 7); // Rejecting receiver.
        handler.withdraw(0, 0, 5);
        handler.withdraw(0, 0, 5); // Duplicate.
        handler.withdraw(0, 1, 5); // Loser.
        handler.create(1, false, 0); // New market while other positions remain live.
        handler.bet(3, 5, true, 3);
        handler.jumpToBoundary(1, 1, 1);
        handler.changeOracle(false, false, 0);
        handler.finalize(1, 0);
        handler.withdraw(1, 3, 4);
        handler.finalize(2, 1);
        handler.withdraw(2, 4, 0);
        handler.donate(1);
        handler.assertAccounting();
        handler.assertStateMachine();
        assertEq(handler.successfulResolutions(), 2);
        assertEq(handler.successfulCancellations(), 1);
        assertEq(handler.successfulClaims(), 3);
        assertGe(handler.expectedRejections(), 5);
        afterInvariant();
    }
}
