#!/usr/bin/env node
"use strict";

// Read-only diagnostic. No environment, filesystem configuration, wallet or signing access.
const { JsonRpcProvider, Contract } = require("../frontend/vendor/ethers-6.15.0.umd.min.js");
const abi = require("../frontend/core-abi.json");
const { CORE, CHAIN_ID } = require("../frontend/helpers.js");

async function readCore(rpcUrl) {
  if (!rpcUrl || !["https:", "http:"].includes(new URL(rpcUrl).protocol)) {
    throw new Error("Supply an explicit Sepolia HTTP(S) RPC URL as the only argument.");
  }
  const provider = new JsonRpcProvider(rpcUrl);
  try {
    if (BigInt(await provider.send("eth_chainId", [])) !== CHAIN_ID) throw new Error("Wrong chain; require Sepolia.");
    const tip = await provider.getBlockNumber();
    const blockTag = Math.max(0, tip - 12);
    const block = await provider.getBlock(blockTag);
    const core = new Contract(CORE, abi, provider);
    const overrides = { blockTag };
    const [version, implementation, config, state] = await Promise.all([
      core.implementationCodeVersion(overrides), core.implementationCodeAddress(overrides),
      core.configuration(overrides), core.state(overrides)
    ]);
    if (version !== 3n || config.roundDuration !== 600n || config.blockUnitsPerBlock !== 1000000000n) {
      throw new Error("Unsupported Core version or units.");
    }
    const q = config.blockUnitsPerBlock;
    if (state.blockHeight !== state.cumulativeBlockUnits / q || state.blockProgress !== state.cumulativeBlockUnits % q) {
      throw new Error("Inconsistent Core height/progress.");
    }
    const round = state.settledThroughRound;
    const point = await core.roundPage(round, round, 0, overrides);
    if (point.certifiedThroughRound !== round || point.rounds.length !== 0
        || point.start.cumulativeBlockUnits !== state.cumulativeBlockUnits
        || point.end.cumulativeBlockUnits !== state.cumulativeBlockUnits
        || point.end.cumulativeWork !== state.cumulativeWork) throw new Error("Inconsistent certified point read.");
    return {
      chainId: CHAIN_ID.toString(), core: CORE, ethereumBlock: blockTag,
      ethereumBlockHash: block.hash, ethereumTimestamp: block.timestamp,
      version: version.toString(), implementation, streamId: config.streamId,
      genesisTimestamp: config.genesisTimestamp.toString(), roundDuration: config.roundDuration.toString(),
      blockUnitsPerBlock: q.toString(), settledThroughRound: round.toString(),
      cumulativeWork: state.cumulativeWork.toString(), cumulativeBlockUnits: state.cumulativeBlockUnits.toString(),
      blockHeight: state.blockHeight.toString(), blockProgress: state.blockProgress.toString(), paused: state.paused
    };
  } finally { provider.destroy(); }
}

if (require.main === module) {
  readCore(process.argv[2]).then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch((error) => {
    process.stderr.write(`Core read failed: ${error.shortMessage || error.message}\n`);
    process.exitCode = 1;
  });
}
module.exports = { readCore };
