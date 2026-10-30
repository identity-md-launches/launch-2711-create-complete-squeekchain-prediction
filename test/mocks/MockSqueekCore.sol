// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ISqueekCore} from "../../src/interfaces/ISqueekCore.sol";

/// @dev Models V3 point reads, including certified zero-work gaps. Setters are test-only.
contract MockSqueekCore is ISqueekCore {
    CoreConfiguration private _config;
    uint64 public frontier;
    uint64 public version;
    address public implementation;
    bool public isPaused;
    bool public unavailable;
    uint8 public pageFault;
    uint64[] private _rounds;
    mapping(uint64 => LedgerPosition) private _points;

    function configure(uint64 genesis) external {
        _config.genesisTimestamp = genesis;
        _config.roundDuration = 600;
        _config.blockUnitsPerBlock = 1_000_000_000;
        _config.streamId = keccak256("local Squeekchain fixture");
        _config.maxWorkPerRound = 10_000;
        _config.maxRoundsPerBatch = 16;
        _config.initialWorkPerThousandBlocks = 10_875;
        _config.targetBlocksPerActiveRound = 40;
        _config.difficultySmoothingRounds = 30;
        version = 3;
        implementation = address(this);
    }

    function configuration() external view returns (CoreConfiguration memory) {
        require(!unavailable, "Core unavailable");
        return _config;
    }

    function state() external view returns (CoreState memory result) {
        require(!unavailable, "Core unavailable");
        LedgerPosition memory p = _position(frontier);
        result.settledThroughRound = frontier;
        result.cumulativeWork = p.cumulativeWork;
        result.cumulativeBlockUnits = p.cumulativeBlockUnits;
        result.blockHeight = uint64(p.cumulativeBlockUnits / 1_000_000_000);
        result.blockProgress = p.cumulativeBlockUnits % 1_000_000_000;
        result.workPerThousandBlocks = p.workPerThousandBlocks;
        result.paused = isPaused;
    }

    function roundPage(uint64 afterRound, uint64 throughRound, uint256 maxRecords)
        external
        view
        returns (RoundPage memory result)
    {
        require(!unavailable && pageFault != 4, "Core unavailable");
        require(afterRound == throughRound && throughRound <= frontier && maxRecords == 0, "invalid point query");
        result.certifiedThroughRound = pageFault == 1 ? throughRound - 1 : throughRound;
        result.start = _position(afterRound);
        result.end = LedgerPosition(
            result.start.cumulativeWork, result.start.cumulativeBlockUnits, result.start.workPerThousandBlocks
        );
        if (pageFault == 2) result.end.cumulativeBlockUnits += 1;
        if (pageFault == 5) result.end.cumulativeWork += 1;
        if (pageFault == 6) result.end.workPerThousandBlocks += 1;
        result.rounds = new RoundCheckpoint[](pageFault == 3 ? 1 : 0);
    }

    function implementationCodeVersion() external view returns (uint64) {
        require(!unavailable, "Core unavailable");
        return version;
    }

    function implementationCodeAddress() external view returns (address) {
        return implementation;
    }

    function setPoint(uint64 round, uint64 work, uint96 units) external {
        require(_rounds.length == 0 || round > _rounds[_rounds.length - 1], "unsorted fixture");
        _rounds.push(round);
        _points[round] = LedgerPosition(work, units, 10_875);
    }

    function setFrontier(uint64 round) external {
        frontier = round;
    }

    function setPaused(bool value) external {
        isPaused = value;
    }

    function setUnavailable(bool value) external {
        unavailable = value;
    }

    function setVersion(uint64 value) external {
        version = value;
    }

    function setImplementation(address value) external {
        implementation = value;
    }

    function setConfiguration(CoreConfiguration calldata value) external {
        _config = value;
    }

    function setPageFault(uint8 value) external {
        pageFault = value;
    }

    function _position(uint64 round) private view returns (LedgerPosition memory) {
        for (uint256 i = _rounds.length; i > 0; --i) {
            if (_rounds[i - 1] <= round) return _points[_rounds[i - 1]];
        }
        return LedgerPosition(0, 0, 10_875);
    }
}
