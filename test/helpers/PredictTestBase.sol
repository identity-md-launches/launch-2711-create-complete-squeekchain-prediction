// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {SqueekPredict} from "src/SqueekPredict.sol";
import {ISqueekCore} from "src/interfaces/ISqueekCore.sol";
import {MockSqueekCore} from "../mocks/MockSqueekCore.sol";

abstract contract PredictTestBase is Test {
    uint64 internal constant GENESIS = 1_700_000_000;
    uint64 internal constant START_ROUND = 107;
    uint256 internal constant MINIMUM = 0.0001 ether;
    uint256 internal constant LIMIT = 100 ether;
    address internal constant CORE = 0x74665dAecA35A2303e767E76a2FF1FB6F93e119f;
    SqueekPredict internal market;
    MockSqueekCore internal oracle;
    address internal alice;
    address internal bob;
    address internal recipient;

    function setUp() public virtual {
        vm.chainId(11_155_111);
        vm.warp(GENESIS + 100 * 600);
        MockSqueekCore template = new MockSqueekCore();
        vm.etch(CORE, address(template).code);
        oracle = MockSqueekCore(CORE);
        oracle.configure(GENESIS);
        oracle.setFrontier(100);
        market = new SqueekPredict();
        alice = makeAddr("adversarial alice");
        bob = makeAddr("adversarial bob");
        recipient = makeAddr("adversarial recipient");
        vm.deal(alice, 1000 ether);
        vm.deal(bob, 1000 ether);
        vm.deal(address(this), 1000 ether);
    }

    function _create(uint64 threshold) internal returns (uint256) {
        return market.createMarket(threshold, START_ROUND, 1 days);
    }

    function _bet(uint256 id, address actor, bool side, uint256 value) internal {
        vm.prank(actor);
        market.bet{value: value}(id, side);
    }

    function _matched(uint64 threshold) internal returns (uint256 id) {
        id = _create(threshold);
        _bet(id, alice, true, 2 ether);
        _bet(id, bob, false, 3 ether);
    }

    function _history(uint256 id, uint96 fromUnits, uint96 toUnits) internal {
        SqueekPredict.Market memory m = market.getMarket(id);
        oracle.setPoint(m.startRound - 1, 100, fromUnits);
        oracle.setPoint(m.endRound, 200, toUnits);
        oracle.setFrontier(m.endRound);
        vm.warp(m.endsAt);
    }

    function _marketHash(uint256 id) internal view returns (bytes32) {
        return keccak256(abi.encode(market.getMarket(id)));
    }

    function _positionHash(uint256 id, address actor) internal view returns (bytes32) {
        (uint256 yes, uint256 no, bool claimed) = market.positions(id, actor);
        return keccak256(abi.encode(yes, no, claimed));
    }
}
