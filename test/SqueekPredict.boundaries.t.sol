// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {PredictTestBase} from "./helpers/PredictTestBase.sol";
import {SqueekPredict} from "src/SqueekPredict.sol";
import {ISqueekCore} from "src/interfaces/ISqueekCore.sol";

/// forge-config: default.fuzz.runs = 1000
contract SqueekPredictBoundariesTest is PredictTestBase {
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

    function testFuzz_OnlyDailyAndWeeklyDurationsAreAccepted(uint64 duration) public {
        if (duration == 1 days || duration == 7 days) ++duration;
        vm.expectRevert(SqueekPredict.InvalidDuration.selector);
        market.createMarket(0, START_ROUND, duration);
        assertEq(market.marketCount(), 0, "failed creation allocated an id");
    }

    function test_LeadTimeLimitsToTheSecond() public {
        uint64 startTime = GENESIS + (START_ROUND - 1) * 600;
        vm.warp(startTime - 1 hours + 1);
        vm.expectRevert(SqueekPredict.InvalidStart.selector);
        _create(0);
        vm.warp(startTime - 1 hours);
        assertEq(_create(0), 1);

        // Use another boundary in the future so genesis remains in the past.
        uint64 laterRound = 1200;
        uint64 laterStart = GENESIS + (laterRound - 1) * 600;
        vm.warp(laterStart - 7 days - 1);
        vm.expectRevert(SqueekPredict.InvalidStart.selector);
        market.createMarket(0, laterRound, 7 days);
        vm.warp(laterStart - 7 days);
        uint256 id = market.createMarket(type(uint64).max, laterRound, 7 days);
        assertEq(id, 2);
        assertEq(market.getMarket(id).threshold, type(uint64).max);
    }

    function testFuzz_RoundAlignmentAndImmutableIdentity(uint32 offset, bool weekly, uint64 threshold) public {
        vm.warp(vm.getBlockTimestamp() + bound(offset, 0, 10_000_000));
        uint64 start = uint64((block.timestamp + 1 hours - GENESIS + 599) / 600 + 1);
        uint64 duration = weekly ? uint64(7 days) : uint64(1 days);
        vm.prank(bob);
        uint256 id = market.createMarket(threshold, start, duration);
        SqueekPredict.Market memory m = market.getMarket(id);
        assertGe(m.startsAt - block.timestamp, 1 hours);
        assertLt(m.startsAt - block.timestamp, 1 hours + 600);
        assertEq(m.endsAt - m.startsAt, duration);
        assertEq(m.endRound - m.startRound + 1, weekly ? 1008 : 144);
        assertEq(m.refundAt - m.endsAt, 30 days);
        assertEq(m.genesisTimestamp, GENESIS);
        assertEq(m.streamId, oracle.configuration().streamId);
        assertEq(m.implementation, CORE);
        assertEq(m.threshold, threshold);
        assertEq(m.remainingPayout, 0);
        assertEq(m.remainingWinningStake, 0);
    }

    function test_EventsDescribeCreationBetResolutionAndActualPayment() public {
        uint64 starts = GENESIS + (START_ROUND - 1) * 600;
        vm.expectEmit(true, true, false, true, address(market));
        emit MarketCreated(1, alice, 0, START_ROUND, 250, starts, starts + 1 days);
        vm.prank(alice);
        uint256 id = _create(0);
        vm.expectEmit(true, true, false, true, address(market));
        emit BetPlaced(id, alice, true, 2 ether);
        _bet(id, alice, true, 2 ether);
        _bet(id, bob, false, 3 ether);
        _history(id, 999_999_999, 1_000_000_000);
        vm.expectEmit(true, false, false, true, address(market));
        emit MarketResolved(id, true, 1, 999_999_999, 1_000_000_000);
        vm.prank(recipient); // Resolution has no creator/keeper privilege.
        market.resolve(id);
        vm.expectEmit(true, true, true, true, address(market));
        emit Claimed(id, alice, recipient, 5 ether);
        vm.prank(alice);
        assertEq(market.claim(id, payable(recipient)), 5 ether);
        assertEq(recipient.balance, 5 ether);
    }

    function test_TimeoutCancellationEmitsOnceAndRefundIgnoresCore() public {
        uint256 id = _matched(0);
        oracle.setUnavailable(true);
        vm.warp(market.getMarket(id).refundAt);
        vm.expectEmit(true, false, false, true, address(market));
        emit MarketCancelled(id);
        vm.prank(recipient);
        market.cancelExpired(id);
        vm.expectRevert(SqueekPredict.MarketFinalized.selector);
        market.cancelExpired(id);
        vm.expectEmit(true, true, true, true, address(market));
        emit Claimed(id, alice, recipient, 2 ether);
        vm.prank(alice);
        market.claim(id, payable(recipient));
        assertEq(recipient.balance, 2 ether);
    }

    function testFuzz_ResolutionAndTimeoutRefundNeverOverlapAcrossTheGrace(uint32 lateness) public {
        uint256 id = _matched(0);
        SqueekPredict.Market memory m = market.getMarket(id);
        assertEq(m.refundAt - m.endsAt, market.RESOLUTION_GRACE());
        oracle.setPoint(m.startRound - 1, 100, 0);
        oracle.setPoint(m.endRound, 200, 1e9);
        oracle.setFrontier(m.endRound);
        uint256 t = m.endsAt + bound(lateness, 0, m.refundAt - m.endsAt - 1);
        vm.warp(t);
        // Inside the grace a losing side cannot pre-empt resolution with a refund.
        vm.expectRevert(SqueekPredict.TooEarly.selector);
        market.cancelExpired(id);
        market.resolve(id);
        assertTrue(market.getMarket(id).yesWins);
        assertEq(market.claimable(id, alice), 5 ether);
        vm.warp(m.refundAt + 1);
        vm.expectRevert(SqueekPredict.MarketFinalized.selector);
        market.cancelExpired(id);
    }

    function test_CertifiedDataAtRefundAtCannotResolveOnlyRefund() public {
        uint256 id = _matched(0);
        SqueekPredict.Market memory m = market.getMarket(id);
        oracle.setPoint(m.startRound - 1, 100, 0);
        oracle.setPoint(m.endRound, 200, 1e9);
        oracle.setFrontier(m.endRound);
        vm.warp(m.refundAt);
        vm.expectRevert(SqueekPredict.ResolutionExpired.selector);
        market.resolve(id);
        market.cancelExpired(id);
        assertEq(market.claimable(id, alice), 2 ether);
        assertEq(market.claimable(id, bob), 3 ether);
    }

    function testFuzz_EachSideIsCappedIndependentlyToTheWei(uint96 firstSeed, bool fullSide) public {
        uint256 id = _create(0);
        uint256 first = bound(firstSeed, MINIMUM, LIMIT - MINIMUM);
        vm.deal(alice, 2 * LIMIT);
        vm.deal(bob, 2 * LIMIT);
        _bet(id, alice, fullSide, first);
        _bet(id, bob, fullSide, LIMIT - first);
        vm.expectRevert(SqueekPredict.PoolLimit.selector);
        _bet(id, bob, fullSide, MINIMUM);
        // The full side does not consume the other side's room.
        _bet(id, alice, !fullSide, LIMIT);
        vm.expectRevert(SqueekPredict.PoolLimit.selector);
        _bet(id, bob, !fullSide, MINIMUM);
        SqueekPredict.Market memory m = market.getMarket(id);
        assertEq(m.yesPool, LIMIT);
        assertEq(m.noPool, LIMIT);
        assertEq(market.totalLiability(), 2 * LIMIT);
        assertEq(address(market).balance, 2 * LIMIT);
    }

    function test_OneWeiAndOversizedBetsRevertWithoutChangingAccounting() public {
        uint256 id = _matched(0);
        bytes32 beforeMarket = _marketHash(id);
        bytes32 beforePosition = _positionHash(id, alice);
        uint256 beforeBalance = alice.balance;
        vm.expectRevert(SqueekPredict.InvalidStake.selector);
        _bet(id, alice, true, 1);
        vm.expectRevert(SqueekPredict.PoolLimit.selector);
        _bet(id, alice, false, LIMIT);
        assertEq(_marketHash(id), beforeMarket);
        assertEq(_positionHash(id, alice), beforePosition);
        assertEq(alice.balance, beforeBalance);
        assertEq(market.totalLiability(), 5 ether);
        assertEq(address(market).balance, 5 ether);
    }

    function testFuzz_InvalidIdsNeverAllocatePositionsOrAcceptValue(uint256 seed) public {
        uint256 id = seed == 0 ? 0 : bound(seed, 2, type(uint256).max);
        _matched(0);
        vm.expectRevert(SqueekPredict.InvalidMarket.selector);
        market.getMarket(id);
        vm.expectRevert(SqueekPredict.InvalidMarket.selector);
        market.claimable(id, alice);
        vm.expectRevert(SqueekPredict.InvalidMarket.selector);
        _bet(id, alice, true, MINIMUM);
        vm.expectRevert(SqueekPredict.InvalidMarket.selector);
        market.resolve(id);
        vm.expectRevert(SqueekPredict.InvalidMarket.selector);
        market.cancelUnmatched(id);
        vm.expectRevert(SqueekPredict.InvalidMarket.selector);
        market.cancelExpired(id);
        vm.expectRevert(SqueekPredict.InvalidMarket.selector);
        vm.prank(alice);
        market.claim(id, payable(recipient));
        (uint256 yes, uint256 no, bool claimed) = market.positions(id, alice);
        assertEq(yes + no, 0);
        assertFalse(claimed);
        assertEq(market.marketCount(), 1);
        assertEq(market.totalLiability(), 5 ether);
    }

    function test_NoBlockCompletedAtThresholdZeroPaysNo() public {
        uint256 id = _matched(0);
        _history(id, 1_000_000_000, 1_999_999_999);
        market.resolve(id);
        assertFalse(market.getMarket(id).yesWins);
        assertEq(market.claimable(id, bob), 5 ether);
    }

    function test_MaximumRepresentableBlockHeightAndThreshold() public {
        uint256 equal = _matched(type(uint64).max);
        uint256 above = _matched(type(uint64).max - 1);
        _history(equal, 0, uint96(uint256(type(uint64).max) * 1e9));
        market.resolve(equal);
        market.resolve(above);
        assertFalse(market.getMarket(equal).yesWins);
        assertTrue(market.getMarket(above).yesWins);
        assertEq(market.claimable(equal, bob), 5 ether);
        assertEq(market.claimable(above, alice), 5 ether);
    }

    function testFuzz_BlockCompletionCountsProgressCarry(
        uint64 heightSeed,
        uint64 gainSeed,
        uint32 fractionSeed,
        uint32 progressSeed,
        bool weekly
    ) public {
        // Construct the expected count from whole blocks plus a possible carry,
        // instead of repeating the contract's subtraction of floored endpoints.
        uint256 height = bound(heightSeed, 0, type(uint64).max - 2);
        uint256 gain = bound(gainSeed, 0, type(uint64).max - height - 1);
        uint256 fraction = bound(fractionSeed, 0, 1e9 - 1);
        uint256 progress = bound(progressSeed, 0, 1e9 - 1);
        uint96 from = uint96(height * 1e9 + fraction);
        uint96 to = uint96(uint256(from) + gain * 1e9 + progress);
        uint64 count = uint64(gain + (fraction + progress >= 1e9 ? 1 : 0));
        uint64 duration = weekly ? uint64(7 days) : uint64(1 days);
        uint256 equal = market.createMarket(count, START_ROUND, duration);
        uint256 below = market.createMarket(count == 0 ? 0 : count - 1, START_ROUND, duration);
        _bet(equal, alice, true, MINIMUM);
        _bet(equal, bob, false, MINIMUM);
        _bet(below, alice, true, MINIMUM);
        _bet(below, bob, false, MINIMUM);
        _history(equal, from, to);
        market.resolve(equal);
        market.resolve(below);
        assertFalse(market.getMarket(equal).yesWins, "strict threshold equality");
        assertEq(market.getMarket(below).yesWins, count != 0, "one below completed count");
        assertEq(market.getMarket(equal).startBlockUnits, from);
        assertEq(market.getMarket(equal).endBlockUnits, to);
    }

    function testFuzz_EitherMalformedEndpointRollsBackAndCanBeRetried(bool endPoint, uint8 faultSeed) public {
        uint256 id = _matched(0);
        _history(id, 999_999_999, 1_000_000_000);
        SqueekPredict.Market memory m = market.getMarket(id);
        uint64 round = endPoint ? m.endRound : m.startRound - 1;
        ISqueekCore.RoundPage memory page = oracle.roundPage(round, round, 0);
        uint256 fault = bound(faultSeed, 0, 5);
        if (fault == 0) page.certifiedThroughRound = round - 1;
        if (fault == 1) page.certifiedThroughRound = round + 1;
        if (fault == 2) page.rounds = new ISqueekCore.RoundCheckpoint[](1);
        if (fault == 3) ++page.start.cumulativeBlockUnits;
        if (fault == 4) ++page.start.cumulativeWork;
        if (fault == 5) ++page.start.workPerThousandBlocks;
        vm.mockCall(CORE, abi.encodeCall(ISqueekCore.roundPage, (round, round, 0)), abi.encode(page));
        bytes32 beforeMarket = _marketHash(id);
        vm.expectRevert(SqueekPredict.InvalidHistory.selector);
        market.resolve(id);
        assertEq(_marketHash(id), beforeMarket, "failed resolution wrote snapshots/outcome");
        assertEq(market.totalLiability(), 5 ether);
        assertEq(address(market).balance, 5 ether);
        vm.clearMockedCalls();
        market.resolve(id);
        assertTrue(market.getMarket(id).yesWins);
    }

    function test_DecreasingWorkIsRejectedEvenWhenBlockUnitsIncrease() public {
        uint256 id = _matched(0);
        SqueekPredict.Market memory m = market.getMarket(id);
        oracle.setPoint(m.startRound - 1, 200, 0);
        oracle.setPoint(m.endRound, 199, 1e9);
        oracle.setFrontier(m.endRound);
        vm.warp(m.endsAt);
        bytes32 beforeMarket = _marketHash(id);
        vm.expectRevert(SqueekPredict.InvalidHistory.selector);
        market.resolve(id);
        assertEq(_marketHash(id), beforeMarket);
    }

    function test_ResolutionUsesBothExactPointsNotCurrentStateOrDifficulty() public {
        uint256 id = _matched(1);
        _history(id, 999_999_999, 2_000_000_000);
        SqueekPredict.Market memory m = market.getMarket(id);
        oracle.setPoint(m.endRound + 20, type(uint64).max, uint96(10_000e9));
        oracle.setFrontier(m.endRound + 20);
        vm.warp(m.endsAt + 20 * 600);
        ISqueekCore.RoundPage memory page = oracle.roundPage(m.endRound, m.endRound, 0);
        page.start.workPerThousandBlocks = type(uint32).max;
        page.end.workPerThousandBlocks = type(uint32).max;
        vm.mockCall(CORE, abi.encodeCall(ISqueekCore.roundPage, (m.endRound, m.endRound, 0)), abi.encode(page));
        vm.expectCall(CORE, abi.encodeCall(ISqueekCore.roundPage, (m.startRound - 1, m.startRound - 1, 0)), 1);
        vm.expectCall(CORE, abi.encodeCall(ISqueekCore.roundPage, (m.endRound, m.endRound, 0)), 1);
        market.resolve(id);
        assertTrue(market.getMarket(id).yesWins);
        assertEq(market.getMarket(id).endBlockUnits, 2_000_000_000);
    }

    function testFuzz_IncompatibleConfigurationAtResolutionStillAllowsFullRefund(uint8 faultSeed) public {
        uint256 id = _matched(0);
        _history(id, 0, 1e9);
        ISqueekCore.CoreConfiguration memory cfg = oracle.configuration();
        uint256 fault = bound(faultSeed, 0, 5);
        if (fault == 0) oracle.setVersion(4);
        if (fault == 1) cfg.roundDuration = 601;
        if (fault == 2) cfg.blockUnitsPerBlock = 1e9 + 1;
        if (fault == 3) cfg.streamId = bytes32(0);
        if (fault == 4) cfg.genesisTimestamp = 0;
        if (fault == 5) cfg.genesisTimestamp = uint64(block.timestamp + 1);
        oracle.setConfiguration(cfg);
        bytes32 beforeMarket = _marketHash(id);
        vm.expectRevert(SqueekPredict.UnsupportedCore.selector);
        market.resolve(id);
        assertEq(_marketHash(id), beforeMarket);
        vm.etch(CORE, hex"");
        vm.warp(market.getMarket(id).refundAt);
        market.cancelExpired(id);
        vm.prank(alice);
        assertEq(market.claim(id, payable(recipient)), 2 ether);
        vm.prank(bob);
        assertEq(market.claim(id, payable(recipient)), 3 ether);
        assertEq(recipient.balance, 5 ether);
        assertEq(market.totalLiability(), 0);
    }

    function testFuzz_TruncatedOracleReturnNeverFinalizes(uint8 methodSeed) public {
        uint256 id = _matched(0);
        _history(id, 0, 1e9);
        uint256 method = bound(methodSeed, 0, 4);
        bytes4[5] memory selectors = [
            ISqueekCore.implementationCodeVersion.selector,
            ISqueekCore.configuration.selector,
            ISqueekCore.implementationCodeAddress.selector,
            ISqueekCore.state.selector,
            ISqueekCore.roundPage.selector
        ];
        vm.mockCall(CORE, selectors[method], hex"01");
        bytes32 beforeMarket = _marketHash(id);
        // ABI decoding failures need not use an application custom error.
        (bool success,) = address(market).call(abi.encodeCall(SqueekPredict.resolve, (id)));
        assertFalse(success, "accepted truncated ABI response");
        assertEq(_marketHash(id), beforeMarket);
        assertEq(market.totalLiability(), 5 ether);
        vm.clearMockedCalls();
        market.resolve(id);
        assertEq(uint256(market.getMarket(id).status), uint256(SqueekPredict.Status.Resolved));
    }
}
