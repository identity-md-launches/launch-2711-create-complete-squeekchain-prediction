# SqueekCore integration

Authoritative inputs:

- [SqueekCore V3 reference](https://docs.squeekchain.com/developers/core/)
- [Published ABI](https://docs.squeekchain.com/assets/abi/SqueekCore.json)
- [Deployment identity checks](https://docs.squeekchain.com/developers/quickstart/)

The Solidity interface in `src/interfaces/ISqueekCore.sol` preserves the ABI's field order and widths, including the dynamic array in `RoundPage`. `frontend/core-abi.json` is generated from that interface, and `frontend/abi.json` from the application. Refresh them after changing Solidity interfaces:

```sh
forge inspect ISqueekCore abi --json > frontend/core-abi.json
forge inspect SqueekPredict abi --json > frontend/abi.json
```

`node --test test/frontend.test.cjs` compares both packaged ABIs with build artifacts, so an outdated ABI fails locally. ABI JSON generation does not require network access.

The on-chain integration uses only static calls to the given proxy. It reads Core's configuration at market creation and records the source implementation, stream and genesis. At resolution it checks compatibility again, then queries the two fixed historical endpoints. The current cumulative total is never substituted for either endpoint. Endpoint responses must certify the requested round, return no active records for a point query, and have identical start/end ledger positions. Work and block units must not decrease across the window.

The source is trusted, not supplied by a bettor. No off-chain signature, relayer report or user-provided block count is accepted by the market. Pinning the implementation pointer prevents silently continuing through a changed implementation; source unavailability or incompatibility has a fixed refund path. A temporary source change restored before resolution is not independently detectable, and the market cannot prove the Reporter's data truthful.

## Live read evidence

`core-observation.json` was generated using the included read-only tool against public Sepolia RPC `https://ethereum-sepolia-rpc.publicnode.com`. Its block number, block hash and timestamp identify the chain observation. No mutable value from that file is used as a deployment default or test dependency.

The tool decoded the live V3 configuration and state, verified derived height/progress, and verified a certified point response at the same Ethereum block. That establishes ABI compatibility for the observed implementation, not future liveness or governance safety. Re-run it and the official deployment identity checks before launching. Default Forge tests remain fully offline and do not replace this integration check.
