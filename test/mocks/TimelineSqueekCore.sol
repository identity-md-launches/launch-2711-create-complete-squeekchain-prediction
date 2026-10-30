// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ISqueekCore} from "src/interfaces/ISqueekCore.sol";

/// @dev Deterministic, coherent history for overlapping windows created in arbitrary order.
/// One eighth of a block per round means every DAY contains 18 blocks and every WEEK 126,
/// independent of the fractional progress at its start. No future round can be certified.
contract TimelineSqueekCore is ISqueekCore {
    uint64 public constant GENESIS = 1_700_000_000;
    bytes32 public constant STREAM = keccak256("stateful Squeek history");
    uint64 public frontier;
    bool public offline;
    bool public isPaused;

    function setAvailability(bool offline_, bool paused_) external {
        offline = offline_;
        isPaused = paused_;
    }

    function certify(uint64 round) external {
        require(!isPaused, "timeline paused");
        require(round >= frontier && round <= (block.timestamp - GENESIS) / 600, "invalid frontier");
        frontier = round;
    }

    function configuration() external view returns (CoreConfiguration memory config) {
        require(!offline, "timeline offline");
        config.genesisTimestamp = GENESIS;
        config.streamId = STREAM;
        config.roundDuration = 600;
        config.blockUnitsPerBlock = 1e9;
        config.initialWorkPerThousandBlocks = 800_000;
    }

    function state() external view returns (CoreState memory result) {
        require(!offline, "timeline offline");
        result.settledThroughRound = frontier;
        result.cumulativeWork = frontier * 100;
        result.cumulativeBlockUnits = uint96(frontier) * 125_000_000;
        result.blockHeight = frontier / 8;
        result.blockProgress = uint96(frontier % 8) * 125_000_000;
        result.workPerThousandBlocks = 800_000;
        result.paused = isPaused;
    }

    function roundPage(uint64 afterRound, uint64 throughRound, uint256 maxRecords)
        external
        view
        returns (RoundPage memory page)
    {
        require(!offline, "timeline offline");
        require(afterRound == throughRound && throughRound <= frontier && maxRecords == 0, "invalid point");
        page.certifiedThroughRound = throughRound;
        page.start = LedgerPosition(throughRound * 100, uint96(throughRound) * 125_000_000, 800_000);
        page.end = LedgerPosition(throughRound * 100, uint96(throughRound) * 125_000_000, 800_000);
        page.rounds = new RoundCheckpoint[](0);
    }

    function implementationCodeVersion() external view returns (uint64) {
        require(!offline, "timeline offline");
        return 3;
    }

    function implementationCodeAddress() external view returns (address) {
        require(!offline, "timeline offline");
        return address(this);
    }
}
