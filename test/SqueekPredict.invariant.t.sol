// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {SqueekPredict} from "../src/SqueekPredict.sol";
import {MockSqueekCore} from "./mocks/MockSqueekCore.sol";

contract MarketHandler is Test {
    SqueekPredict public immutable predict;
    MockSqueekCore public immutable core;
    address[6] public actors;
    uint256 public deposited;
    uint256 public paid;

    constructor(SqueekPredict predict_, MockSqueekCore core_) {
        predict = predict_;
        core = core_;
        for (uint256 i; i < actors.length; ++i) {
            actors[i] = makeAddr(string.concat("invariant actor ", vm.toString(i)));
            vm.deal(actors[i], 1000 ether);
        }
    }

    function place(uint256 marketSeed, uint256 actorSeed, bool yes, uint96 amountSeed) external {
        uint256 id = 1 + marketSeed % 4;
        SqueekPredict.Market memory m = predict.getMarket(id);
        if (m.status != SqueekPredict.Status.Open || block.timestamp >= m.startsAt) return;
        uint256 available = predict.MAX_SIDE_POOL() - (yes ? m.yesPool : m.noPool);
        if (available < predict.MIN_BET()) return;
        uint256 amount = bound(amountSeed, predict.MIN_BET(), available < 5 ether ? available : 5 ether);
        address actor = actors[actorSeed % actors.length];
        vm.prank(actor);
        predict.bet{value: amount}(id, yes);
        deposited += amount;
    }

    function advance(uint32 secondsSeed) external {
        vm.warp(block.timestamp + bound(secondsSeed, 0, 12 hours));
    }

    function finalize(uint256 marketSeed, bool settleHistory) external {
        uint256 id = 1 + marketSeed % 4;
        SqueekPredict.Market memory m = predict.getMarket(id);
        if (m.status != SqueekPredict.Status.Open) return;
        if (block.timestamp >= m.refundAt) {
            predict.cancelExpired(id);
        } else if (block.timestamp >= m.startsAt && (m.yesPool == 0 || m.noPool == 0)) {
            predict.cancelUnmatched(id);
        } else if (block.timestamp >= m.endsAt && settleHistory) {
            core.setFrontier(m.endRound);
            predict.resolve(id);
        }
    }

    function withdraw(uint256 marketSeed, uint256 actorSeed) external {
        _withdraw(1 + marketSeed % 4, actors[actorSeed % actors.length]);
    }

    function closeAll() external {
        vm.warp(predict.getMarket(1).refundAt);
        for (uint256 id = 1; id <= 4; ++id) {
            if (predict.getMarket(id).status == SqueekPredict.Status.Open) predict.cancelExpired(id);
            for (uint256 a; a < actors.length; ++a) {
                _withdraw(id, actors[a]);
            }
        }
    }

    function _withdraw(uint256 id, address actor) private {
        if (predict.claimable(id, actor) == 0) return;
        vm.prank(actor);
        paid += predict.claim(id, payable(actor));
    }
}

contract SqueekPredictInvariantTest is StdInvariant, Test {
    SqueekPredict private predict;
    MarketHandler private handler;

    function setUp() public {
        vm.chainId(11_155_111);
        vm.warp(1_700_060_000);
        MockSqueekCore template = new MockSqueekCore();
        address coreAddress = 0x74665dAecA35A2303e767E76a2FF1FB6F93e119f;
        vm.etch(coreAddress, address(template).code);
        MockSqueekCore core = MockSqueekCore(coreAddress);
        core.configure(1_700_000_000);
        core.setFrontier(100);
        core.setPoint(106, 100, 900_000_000);
        core.setPoint(250, 200, 5_100_000_000);
        predict = new SqueekPredict();
        // The same history resolves YES for thresholds 0/1 and NO for thresholds 5/6.
        predict.createMarket(0, 107, 1 days);
        predict.createMarket(1, 107, 1 days);
        predict.createMarket(5, 107, 1 days);
        predict.createMarket(6, 107, 1 days);
        handler = new MarketHandler(predict, core);
        bytes4[] memory selectors = new bytes4[](4);
        selectors[0] = MarketHandler.place.selector;
        selectors[1] = MarketHandler.advance.selector;
        selectors[2] = MarketHandler.finalize.selector;
        selectors[3] = MarketHandler.withdraw.selector;
        targetSelector(FuzzSelector(address(handler), selectors));
        targetContract(address(handler));
    }

    function invariant_BalanceAndLiabilitiesConserveEveryDeposit() public view {
        assertEq(address(predict).balance, predict.totalLiability());
        assertEq(address(predict).balance + handler.paid(), handler.deposited());
    }

    function invariant_AllMarketsBackTheirRemainingPayouts() public view {
        uint256 expected;
        for (uint256 id = 1; id <= 4; ++id) {
            SqueekPredict.Market memory m = predict.getMarket(id);
            expected += m.status == SqueekPredict.Status.Open ? m.yesPool + m.noPool : m.remainingPayout;
        }
        assertEq(expected, predict.totalLiability());
    }

    function afterInvariant() public {
        handler.closeAll();
        assertEq(predict.totalLiability(), 0, "every remaining liability is eventually claimable");
        assertEq(address(predict).balance, 0, "no rounding dust");
        assertEq(handler.paid(), handler.deposited(), "all deposits paid to participants");
    }
}
