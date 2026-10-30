// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {SqueekPredict} from "../src/SqueekPredict.sol";
import {ISqueekCore} from "../src/interfaces/ISqueekCore.sol";
import {MockSqueekCore} from "./mocks/MockSqueekCore.sol";

contract ClaimReceiver {
    SqueekPredict private immutable _predict;
    uint256 private _id;
    bool public reject;
    bool public attack;
    bool public reentrySucceeded;
    bytes4 public reentryError;

    constructor(SqueekPredict predict) {
        _predict = predict;
    }

    function place(uint256 id, bool yes) external payable {
        _id = id;
        _predict.bet{value: msg.value}(id, yes);
    }

    function withdraw(address payable recipient) external {
        _predict.claim(_id, recipient);
    }

    function configure(bool reject_, bool attack_) external {
        reject = reject_;
        attack = attack_;
    }

    receive() external payable {
        require(!reject, "recipient rejects ETH");
        if (attack) {
            bytes memory result;
            (reentrySucceeded, result) =
                address(_predict).call(abi.encodeCall(SqueekPredict.claim, (_id, payable(address(this)))));
            if (result.length >= 4) reentryError = bytes4(result);
        }
    }
}

contract SqueekPredictTest is Test {
    uint64 internal constant GENESIS = 1_700_000_000;
    uint64 internal constant START = 107; // Current round = 101; opens exactly one hour from now.
    address internal constant CORE = 0x74665dAecA35A2303e767E76a2FF1FB6F93e119f;
    SqueekPredict internal predict;
    MockSqueekCore internal core;
    address internal alice;
    address internal bob;
    address internal carol;

    function setUp() public {
        vm.chainId(11_155_111);
        vm.warp(GENESIS + 100 * 600);
        MockSqueekCore template = new MockSqueekCore();
        vm.etch(CORE, address(template).code);
        core = MockSqueekCore(CORE);
        core.configure(GENESIS);
        core.setFrontier(100);
        predict = new SqueekPredict();
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        carol = makeAddr("carol");
        vm.deal(alice, 1000 ether);
        vm.deal(bob, 1000 ether);
        vm.deal(carol, 1000 ether);
        vm.deal(address(this), 1000 ether);
    }

    function _create(uint64 threshold) internal returns (uint256) {
        return predict.createMarket(threshold, START, 1 days);
    }

    function _bet(uint256 id, address bettor, bool yes, uint256 amount) internal {
        vm.prank(bettor);
        predict.bet{value: amount}(id, yes);
    }

    function _fund(uint256 id) internal {
        _bet(id, alice, true, 2 ether);
        _bet(id, bob, false, 3 ether);
    }

    function _settle(uint256 id, uint96 startUnits, uint96 endUnits) internal {
        SqueekPredict.Market memory m = predict.getMarket(id);
        core.setPoint(m.startRound - 1, 100, startUnits);
        core.setPoint(m.endRound, 200, endUnits);
        core.setFrontier(m.endRound);
        vm.warp(m.endsAt);
        predict.resolve(id);
    }

    function test_DeploysOnEmptyChainWithoutAdminOrExternalCalls() public {
        vm.etch(CORE, hex"");
        vm.chainId(1);
        SqueekPredict fresh = new SqueekPredict();
        assertEq(fresh.marketCount(), 0);
        assertEq(fresh.totalLiability(), 0);
        assertEq(address(fresh.CORE()), CORE);
    }

    function test_CreateDailyAndWeeklyExactWindow() public {
        uint256 daily = _create(10);
        uint256 weekly = predict.createMarket(70, START, 7 days);
        SqueekPredict.Market memory d = predict.getMarket(daily);
        SqueekPredict.Market memory w = predict.getMarket(weekly);
        assertEq(daily, 1);
        assertEq(weekly, 2);
        assertEq(d.endRound - d.startRound + 1, 144);
        assertEq(w.endRound - w.startRound + 1, 1008);
        assertEq(d.startsAt, block.timestamp + 1 hours);
        assertEq(d.endsAt - d.startsAt, 1 days);
        assertEq(w.endsAt - w.startsAt, 7 days);
        assertEq(d.refundAt - d.endsAt, 3 days);
        assertEq(d.threshold, 10);
        assertEq(uint256(d.status), uint256(SqueekPredict.Status.Open));
    }

    function test_CreateRejectsWrongChainAndInvalidDuration() public {
        vm.chainId(1);
        vm.expectRevert(SqueekPredict.WrongChain.selector);
        _create(1);
        vm.chainId(11_155_111);
        vm.expectRevert(SqueekPredict.InvalidDuration.selector);
        predict.createMarket(1, START, 2 days);
    }

    function test_CreateRejectsInvalidStartsAndAllowsMaxLead() public {
        vm.expectRevert(SqueekPredict.InvalidStart.selector);
        predict.createMarket(1, 0, 1 days);
        vm.expectRevert(SqueekPredict.InvalidStart.selector);
        predict.createMarket(1, START - 1, 1 days);
        vm.expectRevert(SqueekPredict.InvalidStart.selector);
        predict.createMarket(1, 1110, 1 days);
        vm.expectRevert(SqueekPredict.InvalidStart.selector);
        predict.createMarket(1, type(uint64).max, 1 days);
        uint256 id = predict.createMarket(1, 1109, 1 days);
        assertEq(predict.getMarket(id).startsAt, block.timestamp + 7 days);
    }

    function test_CreateRejectsPausedOrMissingCore() public {
        core.setPaused(true);
        vm.expectRevert(SqueekPredict.CorePaused.selector);
        _create(1);
        core.setPaused(false);
        vm.etch(CORE, hex"");
        vm.expectRevert();
        _create(1);
    }

    function test_CreateRejectsTimestampThatWouldTruncateStoredDeadline() public {
        vm.warp(uint256(type(uint64).max) - 1 days);
        uint64 start = uint64((block.timestamp + 1 hours - GENESIS + 599) / 600 + 1);
        vm.expectRevert(SqueekPredict.InvalidStart.selector);
        predict.createMarket(1, start, 1 days);
    }

    function test_CreateRejectsUnsupportedVersionAndConfiguration() public {
        core.setVersion(2);
        vm.expectRevert(SqueekPredict.UnsupportedCore.selector);
        _create(1);
        core.setVersion(3);
        ISqueekCore.CoreConfiguration memory cfg = core.configuration();
        cfg.roundDuration = 60;
        core.setConfiguration(cfg);
        vm.expectRevert(SqueekPredict.UnsupportedCore.selector);
        _create(1);
        cfg.roundDuration = 600;
        cfg.blockUnitsPerBlock = 1;
        core.setConfiguration(cfg);
        vm.expectRevert(SqueekPredict.UnsupportedCore.selector);
        _create(1);
        cfg.blockUnitsPerBlock = 1e9;
        cfg.streamId = bytes32(0);
        core.setConfiguration(cfg);
        vm.expectRevert(SqueekPredict.UnsupportedCore.selector);
        _create(1);
        cfg.streamId = keccak256("fixture");
        cfg.genesisTimestamp = uint64(block.timestamp + 1);
        core.setConfiguration(cfg);
        vm.expectRevert(SqueekPredict.UnsupportedCore.selector);
        _create(1);
        cfg.genesisTimestamp = 0;
        core.setConfiguration(cfg);
        vm.expectRevert(SqueekPredict.UnsupportedCore.selector);
        _create(1);
        cfg.genesisTimestamp = GENESIS;
        core.setConfiguration(cfg);
        core.setImplementation(address(0));
        vm.expectRevert(SqueekPredict.UnsupportedCore.selector);
        _create(1);
    }

    function test_RepeatedAndBothSideBetsAccumulate() public {
        uint256 id = _create(10);
        _fund(id);
        _bet(id, alice, true, 1 ether);
        _bet(id, alice, false, 2 ether);
        (uint256 yes, uint256 no, bool claimed) = predict.positions(id, alice);
        assertEq(yes, 3 ether);
        assertEq(no, 2 ether);
        assertFalse(claimed);
        assertEq(predict.getMarket(id).yesPool, 3 ether);
        assertEq(predict.getMarket(id).noPool, 5 ether);
        assertEq(predict.totalLiability(), 8 ether);
        assertEq(address(predict).balance, 8 ether);
    }

    function test_BettingClosesAtExactStart() public {
        uint256 id = _create(1);
        uint64 start = predict.getMarket(id).startsAt;
        vm.warp(start - 1);
        _bet(id, alice, true, 1 ether);
        vm.warp(start);
        vm.expectRevert(SqueekPredict.BettingClosed.selector);
        _bet(id, bob, false, 1 ether);
    }

    function test_StakeMinimumAndPoolCap() public {
        uint256 id = _create(1);
        vm.expectRevert(SqueekPredict.InvalidStake.selector);
        _bet(id, alice, true, 0);
        vm.expectRevert(SqueekPredict.InvalidStake.selector);
        _bet(id, alice, true, 0.0001 ether - 1);
        _bet(id, alice, true, 0.0001 ether);
        _bet(id, bob, false, 100 ether - 0.0001 ether);
        vm.expectRevert(SqueekPredict.PoolLimit.selector);
        _bet(id, alice, true, 0.0001 ether);
        assertEq(predict.totalLiability(), 100 ether);
    }

    function test_YesWinAndProportionalPayout() public {
        uint256 id = _create(10);
        _fund(id);
        _bet(id, carol, true, 1 ether);
        _settle(id, 100e9, 111e9);
        assertTrue(predict.getMarket(id).yesWins);
        assertEq(predict.claimable(id, alice), 4 ether);
        assertEq(predict.claimable(id, carol), 2 ether);
        assertEq(predict.claimable(id, bob), 0);
        uint256 before = alice.balance;
        vm.prank(alice);
        predict.claim(id, payable(alice));
        assertEq(alice.balance - before, 4 ether);
        vm.prank(carol);
        predict.claim(id, payable(carol));
        assertEq(address(predict).balance, 0);
        assertEq(predict.totalLiability(), 0);
        assertEq(predict.getMarket(id).remainingPayout, 0);
    }

    function test_EqualThresholdIsNoAndBothSideHolderOnlyReceivesWinningPayout() public {
        uint256 id = _create(10);
        _fund(id);
        _bet(id, alice, false, 1 ether);
        _settle(id, 100e9, 110e9);
        assertFalse(predict.getMarket(id).yesWins);
        assertEq(predict.claimable(id, alice), 1.5 ether);
        assertEq(predict.claimable(id, bob), 4.5 ether);
    }

    function test_CarriedProgressCountsCompletedBlockRatherThanFloorOfDelta() public {
        uint256 id = _create(0);
        _fund(id);
        _settle(id, 900_000_000, 1_100_000_000);
        assertTrue(predict.getMarket(id).yesWins);
        assertEq(predict.claimable(id, alice), 5 ether);
    }

    function test_CertifiedZeroWorkGapsResolveNo() public {
        uint256 id = _create(0);
        _fund(id);
        core.setPoint(START - 2, 100, 999_000_000);
        SqueekPredict.Market memory m = predict.getMarket(id);
        core.setFrontier(m.endRound);
        vm.warp(m.endsAt);
        predict.resolve(id);
        assertFalse(predict.getMarket(id).yesWins);
        assertEq(predict.claimable(id, bob), 5 ether);
    }

    function test_DelayedResolutionExcludesLaterWorkAndBatchedFrontier() public {
        uint256 id = _create(10);
        _fund(id);
        SqueekPredict.Market memory m = predict.getMarket(id);
        core.setPoint(m.startRound - 1, 100, 100e9);
        core.setPoint(m.endRound, 200, 105e9);
        core.setPoint(m.endRound + 1, 300, 1000e9);
        core.setFrontier(m.endRound + 100);
        vm.warp(m.endsAt + 1 days);
        predict.resolve(id);
        assertFalse(predict.getMarket(id).yesWins);
        assertEq(predict.getMarket(id).endBlockUnits, 105e9);
    }

    function test_WeeklyMarketResolves() public {
        uint256 id = predict.createMarket(100, START, 7 days);
        _fund(id);
        _settle(id, 0, 101e9);
        assertTrue(predict.getMarket(id).yesWins);
    }

    function test_NotElapsedOrNotSettledCannotResolve() public {
        uint256 id = _create(1);
        _fund(id);
        SqueekPredict.Market memory m = predict.getMarket(id);
        vm.warp(m.endsAt - 1);
        vm.expectRevert(SqueekPredict.TooEarly.selector);
        predict.resolve(id);
        vm.warp(m.endsAt);
        core.setFrontier(m.endRound - 1);
        vm.expectRevert(SqueekPredict.NotSettled.selector);
        predict.resolve(id);
        assertEq(uint256(predict.getMarket(id).status), uint256(SqueekPredict.Status.Open));
    }

    function test_PausedCoreCanResolveAlreadyCertifiedHistory() public {
        uint256 id = _create(0);
        _fund(id);
        core.setPaused(true);
        _settle(id, 0, 1e9);
        assertTrue(predict.getMarket(id).yesWins);
    }

    function test_CoreUpgradeInvalidatesMarketAndTimeoutStillRefunds() public {
        uint256 id = _create(0);
        _fund(id);
        SqueekPredict.Market memory m = predict.getMarket(id);
        vm.warp(m.endsAt);
        core.setImplementation(makeAddr("changed implementation"));
        vm.expectRevert(SqueekPredict.CoreChanged.selector);
        predict.resolve(id);
        core.setUnavailable(true);
        vm.warp(m.refundAt);
        predict.cancelExpired(id);
        assertEq(predict.claimable(id, alice), 2 ether);
    }

    function test_CoreStreamAndGenesisChangesCannotResolve() public {
        uint256 id = _create(0);
        _fund(id);
        vm.warp(predict.getMarket(id).endsAt);
        ISqueekCore.CoreConfiguration memory cfg = core.configuration();
        cfg.streamId = keccak256("changed fixture");
        core.setConfiguration(cfg);
        vm.expectRevert(SqueekPredict.CoreChanged.selector);
        predict.resolve(id);
        cfg.streamId = predict.getMarket(id).streamId;
        cfg.genesisTimestamp += 1;
        core.setConfiguration(cfg);
        vm.expectRevert(SqueekPredict.CoreChanged.selector);
        predict.resolve(id);
    }

    function test_MalformedPointResponsesAreRejected() public {
        uint256 id = _create(1);
        _fund(id);
        SqueekPredict.Market memory m = predict.getMarket(id);
        core.setFrontier(m.endRound);
        vm.warp(m.endsAt);
        for (uint8 fault = 1; fault <= 6; ++fault) {
            core.setPageFault(fault);
            if (fault == 4) vm.expectRevert(bytes("Core unavailable"));
            else vm.expectRevert(SqueekPredict.InvalidHistory.selector);
            predict.resolve(id);
        }
    }

    function test_DecreasingHistoryIsRejected() public {
        uint256 id = _create(1);
        _fund(id);
        SqueekPredict.Market memory m = predict.getMarket(id);
        core.setPoint(m.startRound - 1, 100, 10e9);
        core.setPoint(m.endRound, 200, 9e9);
        core.setFrontier(m.endRound);
        vm.warp(m.endsAt);
        vm.expectRevert(SqueekPredict.InvalidHistory.selector);
        predict.resolve(id);
    }

    function test_TimeoutBoundaryIsExclusiveForResolutionAndInclusiveForRefunds() public {
        uint256 id = _create(0);
        _fund(id);
        SqueekPredict.Market memory m = predict.getMarket(id);
        core.setFrontier(m.endRound);
        vm.warp(m.refundAt - 1);
        vm.expectRevert(SqueekPredict.TooEarly.selector);
        predict.cancelExpired(id);
        vm.warp(m.refundAt);
        vm.expectRevert(SqueekPredict.ResolutionExpired.selector);
        predict.resolve(id);
        predict.cancelExpired(id);
        assertEq(predict.claimable(id, alice), 2 ether);
        assertEq(predict.claimable(id, bob), 3 ether);
        vm.prank(alice);
        predict.claim(id, payable(carol));
        vm.prank(bob);
        predict.claim(id, payable(bob));
        assertEq(predict.totalLiability(), 0);
        assertEq(address(predict).balance, 0);
    }

    function test_ResolutionJustBeforeTimeoutBecomesFinalAndCannotBeRefunded() public {
        uint256 id = _create(0);
        _fund(id);
        SqueekPredict.Market memory m = predict.getMarket(id);
        core.setPoint(m.endRound, 100, 1e9);
        core.setFrontier(m.endRound);
        vm.warp(m.refundAt - 1);
        predict.resolve(id);
        vm.warp(m.refundAt);
        vm.expectRevert(SqueekPredict.MarketFinalized.selector);
        predict.cancelExpired(id);
        assertEq(predict.claimable(id, alice), 5 ether);
    }

    function test_ClaimRefundCannotBeRepeatedAndCancelledMarketStaysFinal() public {
        uint256 id = _create(0);
        _bet(id, alice, true, 1 ether);
        vm.warp(predict.getMarket(id).startsAt);
        predict.cancelUnmatched(id);
        vm.prank(alice);
        predict.claim(id, payable(alice));
        vm.expectRevert(SqueekPredict.AlreadyClaimed.selector);
        vm.prank(alice);
        predict.claim(id, payable(alice));
        vm.expectRevert(SqueekPredict.MarketFinalized.selector);
        predict.resolve(id);
        vm.expectRevert(SqueekPredict.MarketFinalized.selector);
        predict.cancelUnmatched(id);
        assertEq(predict.getMarket(id).remainingPayout, 0);
    }

    function test_UnmatchedAndEmptyMarketsRefundAfterBettingCloses() public {
        uint256 empty = _create(0);
        uint256 id = _create(0);
        _bet(id, alice, false, 2 ether);
        vm.expectRevert(SqueekPredict.TooEarly.selector);
        predict.cancelUnmatched(id);
        vm.warp(predict.getMarket(id).startsAt);
        core.setUnavailable(true);
        predict.cancelUnmatched(id);
        predict.cancelUnmatched(empty);
        assertEq(predict.claimable(id, alice), 2 ether);
        assertEq(predict.claimable(empty, alice), 0);
    }

    function test_ResolveAlsoRefundsOneSidedMarket() public {
        uint256 id = _create(0);
        _bet(id, alice, false, 2 ether);
        _settle(id, 0, 1e9);
        assertEq(uint256(predict.getMarket(id).status), uint256(SqueekPredict.Status.Cancelled));
        assertEq(predict.claimable(id, alice), 2 ether);
    }

    function test_MatchedMarketCannotCancelEarly() public {
        uint256 id = _create(0);
        _fund(id);
        vm.warp(predict.getMarket(id).startsAt);
        vm.expectRevert(SqueekPredict.BothSidesFunded.selector);
        predict.cancelUnmatched(id);
    }

    function test_InvalidMarketIdsAndClaims() public {
        vm.expectRevert(SqueekPredict.InvalidMarket.selector);
        predict.getMarket(0);
        vm.expectRevert(SqueekPredict.InvalidMarket.selector);
        predict.bet{value: 1 ether}(1, true);
        uint256 id = _create(0);
        _fund(id);
        assertEq(predict.claimable(id, alice), 0);
        vm.expectRevert(SqueekPredict.NotFinalized.selector);
        vm.prank(alice);
        predict.claim(id, payable(alice));
        _settle(id, 0, 1e9);
        vm.expectRevert(SqueekPredict.NothingToClaim.selector);
        vm.prank(bob);
        predict.claim(id, payable(bob));
        vm.expectRevert(SqueekPredict.NothingToClaim.selector);
        vm.prank(carol);
        predict.claim(id, payable(carol));
        vm.expectRevert(SqueekPredict.InvalidRecipient.selector);
        vm.prank(alice);
        predict.claim(id, payable(address(0)));
        vm.expectRevert(SqueekPredict.InvalidRecipient.selector);
        vm.prank(alice);
        predict.claim(id, payable(address(predict)));
        vm.prank(alice);
        predict.claim(id, payable(carol));
        vm.expectRevert(SqueekPredict.AlreadyClaimed.selector);
        vm.prank(alice);
        predict.claim(id, payable(alice));
        assertEq(predict.claimable(id, alice), 0);
    }

    function test_FinalStatesCannotChangeOrAcceptBets() public {
        uint256 id = _create(0);
        _fund(id);
        _settle(id, 0, 1e9);
        vm.expectRevert(SqueekPredict.MarketFinalized.selector);
        predict.resolve(id);
        vm.expectRevert(SqueekPredict.MarketFinalized.selector);
        predict.cancelExpired(id);
        vm.expectRevert(SqueekPredict.MarketFinalized.selector);
        predict.cancelUnmatched(id);
        vm.expectRevert(SqueekPredict.MarketFinalized.selector);
        _bet(id, alice, true, 1 ether);
    }

    function test_RejectingRecipientDoesNotConsumeClaimOrBlockOtherWinner() public {
        uint256 id = _create(0);
        ClaimReceiver receiver = new ClaimReceiver(predict);
        receiver.place{value: 1 ether}(id, true);
        _fund(id);
        _settle(id, 0, 1e9);
        receiver.configure(true, false);
        vm.expectRevert(SqueekPredict.PaymentFailed.selector);
        receiver.withdraw(payable(address(receiver)));
        assertEq(predict.claimable(id, address(receiver)), 2 ether);
        assertEq(predict.totalLiability(), 6 ether);
        vm.prank(alice);
        predict.claim(id, payable(alice));
        receiver.withdraw(payable(carol));
        assertEq(predict.totalLiability(), 0);
    }

    function test_ReentrancyCannotDoubleClaim() public {
        uint256 id = _create(0);
        ClaimReceiver receiver = new ClaimReceiver(predict);
        receiver.place{value: 1 ether}(id, true);
        _bet(id, bob, false, 1 ether);
        _settle(id, 0, 1e9);
        receiver.configure(false, true);
        receiver.withdraw(payable(address(receiver)));
        assertFalse(receiver.reentrySucceeded());
        assertEq(receiver.reentryError(), SqueekPredict.Reentrancy.selector);
        assertEq(address(receiver).balance, 2 ether);
        assertEq(predict.totalLiability(), 0);
    }

    function test_MarketsAreFinanciallyIsolated() public {
        uint256 a = _create(0);
        uint256 b = _create(0);
        _fund(a);
        _bet(b, alice, true, 7 ether);
        _settle(a, 0, 1e9);
        vm.prank(alice);
        predict.claim(a, payable(alice));
        assertEq(address(predict).balance, 7 ether);
        assertEq(predict.totalLiability(), 7 ether);
        vm.warp(predict.getMarket(b).startsAt + 1 days);
        predict.cancelUnmatched(b);
        vm.prank(alice);
        predict.claim(b, payable(alice));
        assertEq(address(predict).balance, 0);
    }

    function test_DirectEthIsRejectedAndForcedSurplusCannotInflatePayouts() public {
        (bool success,) = address(predict).call{value: 1 ether}("");
        assertFalse(success);
        uint256 id = _create(0);
        _fund(id);
        vm.deal(address(predict), 15 ether); // Simulates forced ETH without a forbidden opcode.
        _settle(id, 0, 1e9);
        assertEq(predict.claimable(id, alice), 5 ether);
        vm.prank(alice);
        predict.claim(id, payable(alice));
        assertEq(predict.totalLiability(), 0);
        assertEq(address(predict).balance, 10 ether);
    }

    function testFuzz_CompletePayoutConservesFundsAndRounding(
        uint96 a,
        uint96 b,
        uint96 c,
        bool yesWins,
        bool reverseOrder
    ) public {
        uint256 min = predict.MIN_BET();
        uint256 aStake = bound(a, min, 30 ether);
        uint256 bStake = bound(b, min, 30 ether);
        uint256 cStake = bound(c, min, 30 ether);
        uint256 id = _create(0);
        _bet(id, alice, yesWins, aStake);
        _bet(id, bob, yesWins, bStake);
        _bet(id, carol, !yesWins, cStake);
        _settle(id, 0, yesWins ? uint96(1e9) : uint96(0));
        address first = reverseOrder ? bob : alice;
        address last = reverseOrder ? alice : bob;
        uint256 firstStake = reverseOrder ? bStake : aStake;
        uint256 pool = aStake + bStake + cStake;
        uint256 expected = firstStake * pool / (aStake + bStake);
        assertEq(predict.claimable(id, first), expected);
        vm.prank(first);
        uint256 firstPaid = predict.claim(id, payable(first));
        vm.prank(last);
        uint256 lastPaid = predict.claim(id, payable(last));
        assertEq(firstPaid + lastPaid, pool);
        assertEq(address(predict).balance, 0);
        assertEq(predict.totalLiability(), 0);
        assertEq(predict.getMarket(id).remainingWinningStake, 0);
        assertEq(predict.getMarket(id).remainingPayout, 0);
    }

    function testFuzz_OfficialHeightDifference(uint64 whole, uint32 fraction, uint64 gain, uint64 threshold) public {
        uint96 initial = uint96(bound(whole, 0, 1e12) * 1e9 + bound(fraction, 0, 1e9 - 1));
        uint96 finalUnits = initial + uint96(bound(gain, 0, 1e15));
        uint256 id = _create(threshold);
        _fund(id);
        _settle(id, initial, finalUnits);
        assertEq(predict.getMarket(id).yesWins, uint256(finalUnits) / 1e9 - uint256(initial) / 1e9 > threshold);
    }

    function testFuzz_TimeoutRefundsBothPositions(uint96 yesAmount, uint96 noAmount) public {
        uint256 yes = bound(yesAmount, predict.MIN_BET(), 40 ether);
        uint256 no = bound(noAmount, predict.MIN_BET(), 40 ether);
        uint256 id = _create(0);
        _bet(id, alice, true, yes);
        _bet(id, alice, false, no);
        core.setUnavailable(true);
        vm.warp(predict.getMarket(id).refundAt);
        predict.cancelExpired(id);
        assertEq(predict.claimable(id, alice), yes + no);
        vm.prank(alice);
        predict.claim(id, payable(bob));
        assertEq(address(predict).balance, 0);
        assertEq(predict.totalLiability(), 0);
    }
}
