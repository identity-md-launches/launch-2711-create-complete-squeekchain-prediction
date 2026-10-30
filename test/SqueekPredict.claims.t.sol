// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {PredictTestBase} from "./helpers/PredictTestBase.sol";
import {SqueekPredict} from "src/SqueekPredict.sol";

contract PredictCallbackReceiver {
    SqueekPredict public immutable market;
    uint256 public claimingId;
    uint256 public otherId;
    uint8 public action;
    bool public callbackSucceeded;
    bytes4 public callbackError;
    bool public observedClaimed;
    uint256 public observedClaimable;
    uint256 public observedLiability;

    constructor(SqueekPredict market_) {
        market = market_;
    }

    function place(uint256 id, bool side) external payable {
        market.bet{value: msg.value}(id, side);
    }

    function configure(uint8 action_, uint256 otherId_) external {
        action = action_;
        otherId = otherId_;
    }

    function withdraw(uint256 id, address payable to) external returns (uint256) {
        claimingId = id;
        return market.claim(id, to);
    }

    receive() external payable {
        require(action != 1, "reject payout");
        (,, observedClaimed) = market.positions(claimingId, address(this));
        observedClaimable = market.claimable(claimingId, address(this));
        observedLiability = market.totalLiability();
        bytes memory result;
        if (action == 2) {
            (callbackSucceeded, result) =
                address(market).call(abi.encodeCall(SqueekPredict.claim, (otherId, payable(address(this)))));
        } else if (action == 3) {
            (callbackSucceeded, result) =
                address(market).call{value: msg.value / 2}(abi.encodeCall(SqueekPredict.bet, (otherId, true)));
        }
        if (result.length >= 4) callbackError = bytes4(result);
    }
}

/// forge-config: default.fuzz.runs = 1000
contract SqueekPredictClaimsTest is PredictTestBase {
    function test_RejectedTransferRollsBackEveryClaimEffectAndGuard() public {
        uint256 id = _matched(0);
        PredictCallbackReceiver receiver = new PredictCallbackReceiver(market);
        receiver.place{value: 1 ether}(id, true);
        _history(id, 0, 1e9);
        market.resolve(id);
        bytes32 beforeMarket = _marketHash(id);
        bytes32 beforePosition = _positionHash(id, address(receiver));
        uint256 preview = market.claimable(id, address(receiver));
        receiver.configure(1, 0);
        vm.expectRevert(SqueekPredict.PaymentFailed.selector);
        receiver.withdraw(id, payable(address(receiver)));
        assertEq(_marketHash(id), beforeMarket);
        assertEq(_positionHash(id, address(receiver)), beforePosition);
        assertEq(address(receiver).balance, 0);
        assertEq(address(market).balance, 6 ether);
        assertEq(market.totalLiability(), 6 ether);
        assertEq(market.claimable(id, address(receiver)), preview);
        // An independent winner remains live, and the failing wallet can redirect.
        vm.prank(alice);
        market.claim(id, payable(alice));
        receiver.withdraw(id, payable(recipient));
        assertEq(recipient.balance, 2 ether);
        assertEq(market.totalLiability(), 0);
    }

    function test_CrossMarketRecursiveClaimIsBlockedAndLaterClaimRemainsLive() public {
        uint256 a = _create(0);
        uint256 b = _create(0);
        PredictCallbackReceiver receiver = new PredictCallbackReceiver(market);
        receiver.place{value: 1 ether}(a, true);
        receiver.place{value: 2 ether}(b, true);
        _bet(a, bob, false, 1 ether);
        _bet(b, bob, false, 3 ether);
        _history(a, 0, 1e9);
        market.resolve(a);
        market.resolve(b);
        receiver.configure(2, b);
        receiver.withdraw(a, payable(address(receiver)));
        assertTrue(receiver.observedClaimed(), "effects precede transfer");
        assertEq(receiver.observedClaimable(), 0);
        assertEq(receiver.observedLiability(), 5 ether);
        assertFalse(receiver.callbackSucceeded());
        assertEq(receiver.callbackError(), SqueekPredict.Reentrancy.selector);
        assertEq(market.claimable(b, address(receiver)), 5 ether);
        assertEq(address(receiver).balance, 2 ether);
        receiver.configure(0, 0);
        receiver.withdraw(b, payable(address(receiver)));
        assertEq(address(receiver).balance, 7 ether);
        assertEq(market.totalLiability(), 0);
    }

    function test_CallbackCanReinvestOnlyPaidFundsWithoutCorruptingOtherMarket() public {
        uint256 first = _create(0);
        PredictCallbackReceiver receiver = new PredictCallbackReceiver(market);
        receiver.place{value: 1 ether}(first, true);
        _bet(first, bob, false, 1 ether);
        _history(first, 0, 1e9);
        market.resolve(first);
        uint64 nextRound = uint64((block.timestamp + 1 hours - GENESIS + 599) / 600 + 1);
        uint256 second = market.createMarket(10, nextRound, 7 days);
        receiver.configure(3, second);
        assertEq(receiver.withdraw(first, payable(address(receiver))), 2 ether);
        assertTrue(receiver.callbackSucceeded());
        assertTrue(receiver.observedClaimed());
        assertEq(receiver.observedLiability(), 0);
        assertEq(address(receiver).balance, 1 ether);
        assertEq(address(market).balance, 1 ether);
        assertEq(market.totalLiability(), 1 ether);
        (uint256 yes, uint256 no, bool claimed) = market.positions(second, address(receiver));
        assertEq(yes, 1 ether);
        assertEq(no, 0);
        assertFalse(claimed);
        assertEq(market.getMarket(first).remainingPayout, 0);
        vm.warp(market.getMarket(second).startsAt);
        market.cancelUnmatched(second);
        receiver.configure(0, 0);
        receiver.withdraw(second, payable(recipient));
        assertEq(recipient.balance, 1 ether);
        assertEq(market.totalLiability(), 0);
    }

    function test_LastWinnerReceivesExactlyThreeWeiOfRoundingDust() public {
        uint256 id = _create(0);
        address[4] memory winners;
        for (uint256 i; i < 4; ++i) {
            winners[i] = makeAddr(string.concat("dust winner ", vm.toString(i)));
            vm.deal(winners[i], MINIMUM);
            _bet(id, winners[i], true, MINIMUM);
        }
        _bet(id, bob, false, MINIMUM + 3);
        _history(id, 0, 1e9);
        market.resolve(id);
        uint256 ordinary = MINIMUM * 5 / 4;
        for (uint256 i; i < 4; ++i) {
            uint256 expected = ordinary + (i == 3 ? 3 : 0);
            assertEq(market.claimable(id, winners[i]), expected);
            vm.prank(winners[i]);
            assertEq(market.claim(id, payable(recipient)), expected);
        }
        assertEq(recipient.balance, 5 * MINIMUM + 3);
        assertEq(market.getMarket(id).remainingWinningStake, 0);
        assertEq(market.totalLiability(), 0);
        assertEq(address(market).balance, 0);
    }

    function test_FullPoolExtremeWinnerWeightsRemainPayable() public {
        uint256 id = _create(0);
        _bet(id, alice, true, LIMIT - 2 * MINIMUM);
        vm.deal(recipient, MINIMUM);
        _bet(id, recipient, true, MINIMUM);
        _bet(id, bob, false, MINIMUM);
        _history(id, 0, 1e9);
        market.resolve(id);
        uint256 smallPreview = market.claimable(id, recipient);
        assertGe(smallPreview, MINIMUM);
        vm.prank(alice);
        uint256 large = market.claim(id, payable(alice));
        vm.prank(recipient);
        uint256 small = market.claim(id, payable(recipient));
        assertEq(large + small, LIMIT);
        assertGe(small, smallPreview);
        assertLe(small - smallPreview, 1);
        assertEq(market.getMarket(id).remainingWinningStake, 0);
        assertEq(market.totalLiability(), 0);
        assertEq(address(market).balance, 0);
    }

    function test_ClaimsHaveNoExpiryAndOracleOutagesCannotEraseFinalEntitlements() public {
        uint256 id = _matched(0);
        _history(id, 0, 1e9);
        market.resolve(id);
        bytes32 finalized = _marketHash(id);
        oracle.setUnavailable(true);
        vm.warp(block.timestamp + 100 * 365 days);
        vm.expectRevert(SqueekPredict.MarketFinalized.selector);
        market.cancelExpired(id);
        assertEq(_marketHash(id), finalized);
        assertEq(market.claimable(id, alice), 5 ether);
        vm.prank(alice);
        assertEq(market.claim(id, payable(recipient)), 5 ether);
        assertEq(recipient.balance, 5 ether);
        assertEq(market.totalLiability(), 0);
    }

    function testFuzz_SplittingBetsWithinOneWalletCannotChangeItsEntitlement(uint96 seed, bool winSide) public {
        uint256 stake = bound(seed, 2 * MINIMUM, 40 ether);
        uint256 a = _create(0);
        uint256 b = _create(0);
        _bet(a, alice, winSide, stake);
        _bet(b, alice, winSide, MINIMUM);
        _bet(b, alice, winSide, stake - MINIMUM);
        _bet(a, bob, winSide, 7 ether);
        _bet(b, bob, winSide, 7 ether);
        _bet(a, bob, !winSide, 11 ether);
        _bet(b, bob, !winSide, 11 ether);
        _history(a, 0, winSide ? uint96(1e9) : uint96(0));
        market.resolve(a);
        market.resolve(b);
        assertEq(market.claimable(a, alice), market.claimable(b, alice));
        vm.prank(alice);
        uint256 paidA = market.claim(a, payable(recipient));
        vm.prank(alice);
        uint256 paidB = market.claim(b, payable(recipient));
        assertEq(paidA, paidB);
        assertEq(market.claimable(a, bob), market.claimable(b, bob));
        assertEq(market.getMarket(a).remainingPayout, market.getMarket(b).remainingPayout);
    }

    function testFuzz_SixWinnersBothSidePositionsAndArbitraryClaimOrder(
        uint96[6] memory winningSeeds,
        uint96[6] memory losingSeeds,
        uint256 orderSeed,
        bool winSide
    ) public {
        uint256 id = _create(0);
        address[6] memory actors;
        uint256[6] memory stakes;
        uint256[6] memory order;
        uint256 pool;
        uint256 winningPool;
        for (uint256 i; i < 6; ++i) {
            actors[i] = makeAddr(string.concat("payout actor ", vm.toString(i)));
            vm.deal(actors[i], 20 ether);
            stakes[i] = bound(winningSeeds[i], MINIMUM, 8 ether);
            uint256 lostStake = bound(losingSeeds[i], MINIMUM, 8 ether);
            winningPool += stakes[i];
            pool += stakes[i] + lostStake;
            _bet(id, actors[i], winSide, stakes[i]);
            _bet(id, actors[i], !winSide, lostStake);
            order[i] = i;
        }
        for (uint256 i = 5; i > 0; --i) {
            uint256 j = uint256(keccak256(abi.encode(orderSeed, i))) % (i + 1);
            (order[i], order[j]) = (order[j], order[i]);
        }
        _history(id, 0, winSide ? uint96(1e9) : uint96(0));
        market.resolve(id);
        uint256 paidTotal;
        uint256 stakePaid;
        for (uint256 i; i < 6; ++i) {
            uint256 index = order[i];
            uint256 preview = market.claimable(id, actors[index]);
            uint256 balanceBefore = recipient.balance;
            vm.prank(actors[index]);
            uint256 paid = market.claim(id, payable(recipient));
            assertEq(paid, preview);
            assertEq(recipient.balance - balanceBefore, paid);
            if (i != 5) {
                // Characterize floor rounding with inequalities, not a second division.
                assertLe(paid * winningPool, stakes[index] * pool);
                assertGt((paid + 1) * winningPool, stakes[index] * pool);
            } else {
                assertEq(paid, pool - paidTotal);
                assertGe(paid * winningPool, stakes[index] * pool);
                assertLt(paid * winningPool, stakes[index] * pool + 6 * winningPool);
            }
            paidTotal += paid;
            stakePaid += stakes[index];
            assertEq(market.getMarket(id).remainingPayout, pool - paidTotal);
            assertEq(market.getMarket(id).remainingWinningStake, winningPool - stakePaid);
            assertEq(market.claimable(id, actors[index]), 0);
            vm.expectRevert(SqueekPredict.AlreadyClaimed.selector);
            vm.prank(actors[index]);
            market.claim(id, payable(recipient));
        }
        assertEq(paidTotal, pool);
        assertEq(address(market).balance, 0);
        assertEq(market.totalLiability(), 0);
    }
}
