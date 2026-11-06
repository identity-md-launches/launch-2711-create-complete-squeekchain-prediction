/* Test-only chain and wallet doubles. No keys, network requests or broadcasts. */
import { readFileSync } from "node:fs";
import { decodeFunctionData, encodeFunctionResult, parseEther } from "viem";
export const proof = JSON.parse(
  readFileSync(new URL("../scripts/deployment-proof.json", import.meta.url)),
);
export const abi = proof.abi;
export const coreAbi = JSON.parse(
  readFileSync(new URL("../src/coreAbi.ts", import.meta.url), "utf8")
    .split("export const coreAbi = ")[1]
    .split(" as const;")[0],
);
export const CORE = "0x74665dAecA35A2303e767E76a2FF1FB6F93e119f";
export const ACCOUNT = "0x1234567890123456789012345678901234567890";
export const OTHER = "0x2234567890123456789012345678901234567890";
export const HASH = `0x${"12".repeat(32)}`;
const now = BigInt(Math.floor(Date.now() / 1000));
const genesis = now - 30n * 86400n - (now % 600n);
const empty = () => ({ yes: 0n, no: 0n, claimed: false, claimable: 0n });
const base = {
  threshold: 1000n,
  startRound: 4300n,
  endRound: 4443n,
  startsAt: now + 7200n,
  endsAt: now + 7200n + 86400n,
  refundAt: now + 7200n + 31n * 86400n,
  genesisTimestamp: genesis,
  streamId: `0x${"11".repeat(32)}`,
  implementation: CORE,
  status: 0,
  yesWins: false,
  startBlockUnits: 0n,
  endBlockUnits: 0n,
  yesPool: parseEther("0.012"),
  noPool: parseEther("0.008"),
  remainingWinningStake: 0n,
  remainingPayout: 0n,
};
export const fixture = {
  markets: {},
  positions: {},
  transactions: [],
  mode: "ok",
  history: "ok",
};
export function resetFixtures(populated = false) {
  fixture.markets = populated
    ? {
        1: { ...base },
        2: { ...base, threshold: 10000n, endsAt: base.startsAt + 604800n },
        3: { ...base, startsAt: now - 3600n, endsAt: now + 82800n },
        4: {
          ...base,
          startsAt: now - 2n * 86400n,
          endsAt: now - 86400n,
          status: 1,
          yesWins: true,
          yesPool: parseEther("0.002"),
          noPool: parseEther("0.002"),
          remainingWinningStake: parseEther("0.002"),
          remainingPayout: parseEther("0.004"),
          endBlockUnits: 1500n * 1000000000n,
        },
        5: { ...base, startsAt: now - 3600n, endsAt: now + 82800n, noPool: 0n },
        6: { ...base, startsAt: now - 2n * 86400n, endsAt: now - 86400n },
      }
    : {};
  fixture.positions = populated
    ? {
        1: { ...empty(), yes: parseEther("0.001") },
        4: {
          ...empty(),
          yes: parseEther("0.002"),
          claimable: parseEther("0.004"),
        },
        5: { ...empty(), yes: parseEther("0.001") },
      }
    : {};
  fixture.transactions = [];
  fixture.mode = "ok";
  fixture.history = "ok";
}
function block() {
  return {
    number: "0xb7e000",
    hash: HASH,
    parentHash: HASH,
    nonce: "0x0000000000000000",
    sha3Uncles: HASH,
    logsBloom: `0x${"00".repeat(256)}`,
    transactionsRoot: HASH,
    stateRoot: HASH,
    receiptsRoot: HASH,
    miner: CORE,
    difficulty: "0x0",
    totalDifficulty: "0x0",
    extraData: "0x",
    size: "0x100",
    gasLimit: "0x1c9c380",
    gasUsed: "0x1000",
    timestamp: `0x${now.toString(16)}`,
    transactions: [],
    uncles: [],
    baseFeePerGas: "0x3b9aca00",
    mixHash: HASH,
  };
}
export function rpc(q) {
  if (fixture.mode === "fail") throw Error("RPC offline");
  if (Array.isArray(q)) return q.map(rpc);
  let result;
  const encode = (a, name, value) =>
    encodeFunctionResult({ abi: a, functionName: name, result: value });
  switch (q.method) {
    case "eth_chainId":
      result = "0xaa36a7";
      break;
    case "eth_blockNumber":
      result = "0xb7e000";
      break;
    case "eth_getCode":
      result = fixture.mode === "mismatch" ? "0x6000" : proof.deployedBytecode;
      break;
    case "eth_getBlockByNumber":
      result = block();
      break;
    case "eth_getBalance":
      result = "0xde0b6b3a7640000";
      break;
    case "eth_getTransactionReceipt":
      result = {
        transactionHash: HASH,
        transactionIndex: "0x0",
        blockHash: HASH,
        blockNumber: "0xb7e000",
        from: ACCOUNT,
        to: proof.address,
        cumulativeGasUsed: "0x5208",
        gasUsed: "0x5208",
        effectiveGasPrice: "0x3b9aca00",
        contractAddress: null,
        logs: [],
        logsBloom: `0x${"00".repeat(256)}`,
        status: "0x1",
        type: "0x2",
      };
      break;
    case "eth_call": {
      const core = q.params[0].to.toLowerCase() === CORE.toLowerCase();
      const d = decodeFunctionData({
        abi: core ? coreAbi : abi,
        data: q.params[0].data,
      });
      const id = String(d.args?.[0]);
      switch (d.functionName) {
        case "marketCount":
          result = encode(
            abi,
            d.functionName,
            BigInt(Object.keys(fixture.markets).length),
          );
          break;
        case "CORE":
          result = encode(abi, d.functionName, CORE);
          break;
        case "getMarket":
          result = encode(abi, d.functionName, fixture.markets[id]);
          break;
        case "positions": {
          const p = fixture.positions[id] ?? empty();
          result = encode(abi, d.functionName, [p.yes, p.no, p.claimed]);
          break;
        }
        case "claimable":
          result = encode(
            abi,
            d.functionName,
            fixture.positions[id]?.claimable ?? 0n,
          );
          break;
        case "state":
          result = encode(coreAbi, d.functionName, {
            settledThroughRound: 100000n,
            cumulativeWork: 100000n,
            cumulativeBlockUnits: 13095000000000n,
            blockHeight: 13095n,
            blockProgress: 0n,
            workPerThousandBlocks: 1000,
            authorizationNonce: 1n,
            paused: false,
          });
          break;
        case "configuration":
          result = encode(coreAbi, d.functionName, {
            streamId: base.streamId,
            genesisTimestamp: genesis,
            roundDuration: 600n,
            maxWorkPerRound: 1000n,
            maxRoundsPerBatch: 100,
            guardian: CORE,
            reporter: CORE,
            initialWorkPerThousandBlocks: 1000,
            targetBlocksPerActiveRound: 1n,
            difficultySmoothingRounds: 1n,
            blockUnitsPerBlock: 1000000000n,
          });
          break;
        case "roundPage": {
          if (fixture.history === "fail") throw Error("History unavailable");
          const r = d.args[0];
          result = encode(coreAbi, d.functionName, {
            certifiedThroughRound:
              fixture.history === "uncertified" ? r - 1n : r,
            start: {
              cumulativeWork: r,
              cumulativeBlockUnits: r * 3n * 1000000000n,
              workPerThousandBlocks: 1000,
            },
            end: {
              cumulativeWork: r,
              cumulativeBlockUnits: r * 3n * 1000000000n,
              workPerThousandBlocks: 1000,
            },
            rounds: [],
          });
          break;
        }
        case "claim":
          result = encode(
            abi,
            d.functionName,
            fixture.positions[id]?.claimable ?? 0n,
          );
          break;
        default:
          result = "0x";
      }
      break;
    }
    default:
      throw Error(`Unhandled RPC ${q.method}`);
  }
  return { jsonrpc: "2.0", id: q.id, result };
}
export function recordTransaction(tx) {
  const d = decodeFunctionData({ abi, data: tx.data });
  fixture.transactions.push({
    functionName: d.functionName,
    args: d.args?.map(String),
    value: tx.value,
    to: tx.to,
  });
  const id = String(d.args[0]);
  if (d.functionName === "bet") {
    const side = d.args[1] ? "yes" : "no";
    fixture.markets[id][`${side}Pool`] += BigInt(tx.value);
    fixture.positions[id] ??= empty();
    fixture.positions[id][side] += BigInt(tx.value);
  }
  if (d.functionName === "claim") {
    fixture.positions[id].claimable = 0n;
    fixture.positions[id].claimed = true;
  }
  if (d.functionName === "resolve") {
    fixture.markets[id].status = 1;
    fixture.markets[id].yesWins = true;
  }
  if (
    d.functionName === "cancelUnmatched" ||
    d.functionName === "cancelExpired"
  ) {
    fixture.markets[id].status = 2;
    fixture.positions[id].claimable =
      fixture.positions[id].yes + fixture.positions[id].no;
  }
  return HASH;
}
/** Serializable for Playwright addInitScript; sender supplied by each test runtime. */
export function installWallet(win, account, sender) {
  const listeners = {};
  let connected = false;
  let chain = "0xaa36a7";
  const controls = {
    reject: false,
    setChain: (value) => {
      chain = value;
      (listeners.chainChanged ?? []).forEach((fn) => fn(chain));
    },
    setAccount: (value) => {
      account = value;
      (listeners.accountsChanged ?? []).forEach((fn) => fn([account]));
    },
  };
  const provider = {
    on: (event, fn) => (listeners[event] ??= []).push(fn),
    removeListener: (event, fn) => {
      listeners[event] = (listeners[event] ?? []).filter((x) => x !== fn);
    },
    request: async ({ method, params }) => {
      if (method === "eth_chainId") return chain;
      if (method === "eth_requestAccounts") {
        if (controls.reject) {
          controls.reject = false;
          throw Object.assign(Error("User rejected"), { code: 4001 });
        }
        connected = true;
        return [account];
      }
      if (method === "eth_accounts") return connected ? [account] : [];
      if (method === "wallet_switchEthereumChain") {
        controls.setChain(params[0].chainId);
        return null;
      }
      if (method === "wallet_addEthereumChain") return null;
      if (method === "eth_sendTransaction") {
        if (controls.reject) {
          controls.reject = false;
          throw Object.assign(Error("User rejected"), { code: 4001 });
        }
        return await sender(params[0]);
      }
      if (
        method === "eth_getCapabilities" ||
        method === "wallet_getCapabilities"
      )
        return {};
      throw Error(`Unhandled wallet ${method}`);
    },
  };
  win.ethereum = provider;
  win.testWallet = controls;
  const announce = () =>
    win.dispatchEvent(
      new win.CustomEvent("eip6963:announceProvider", {
        detail: {
          info: {
            uuid: "b440f663-24fc-4572-abdc-0c78d2542673",
            name: "Test Browser Wallet",
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
            rdns: "test.squeek.wallet",
          },
          provider,
        },
      }),
    );
  win.addEventListener("eip6963:requestProvider", announce);
  announce();
}
