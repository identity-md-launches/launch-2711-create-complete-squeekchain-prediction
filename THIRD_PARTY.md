# Third-party code

| Directory / file | Version and origin | License |
| --- | --- | --- |
| `lib/forge-std/src/` | forge-std v1.9.7, https://github.com/foundry-rs/forge-std/tree/v1.9.7 | MIT or Apache-2.0; both license files are included |
| `frontend/vendor/ethers-6.15.0.umd.min.js` | ethers 6.15.0, https://cdn.jsdelivr.net/npm/ethers@6.15.0/dist/ethers.umd.min.js | MIT; `frontend/vendor/ethers-LICENSE.md` included |

The original contract and legacy-client dependencies listed above are ordinary repository files and require no package install or submodule. The maintained frontend below uses npm. SqueekCore ABI definitions are derived from the project's official published interface, linked in the README; no SqueekCore implementation is deployed by this project.

## Maintained frontend

`web/` uses normal npm packages pinned in `web/package-lock.json`: React/React DOM (MIT), Vite and its React plugin (MIT), TypeScript (Apache-2.0), TanStack Query (MIT), viem and wagmi (MIT), and Coinbase Wallet SDK (Apache-2.0). Playwright (Apache-2.0) and axe-core's Playwright integration (MPL-2.0) are development-only validation tools. Install them with `npm ci` in `web/`; dependency directories and registries are not vendored. The original no-install contract dependencies and legacy frontend remain as listed above.

Wallet marks in `web/public/marks/` are copied from the MetaMask, Rabby and Phantom assets distributed with RainbowKit 2.2.11 (MIT), and from the pinned Coinbase mark (Apache-2.0). Their notices are bundled beside the marks. The hamster illustration and favicon are original inline/vector artwork for this frontend.

Inter Variable is bundled locally in `web/public/fonts/InterVariable.woff2`, from https://github.com/rsms/inter (the project's `docs/font-files/InterVariable.woff2`). Copyright © 2016 The Inter Project Authors. The complete SIL Open Font License 1.1 is included as `web/public/fonts/LICENSE-Inter.txt` and copied into the static export with the font. The redesigned favicon and social-card composition are original frontend assets; `web/scripts/render-share.mjs` regenerates the social card from local assets.

Design guidance was adapted from Jakub Krehel's Better Interface at commit `267330e1adfc66a718fb65fa6918c1f06d0a689e` (MIT), https://github.com/jakubkrehel/skills/tree/267330e1adfc66a718fb65fa6918c1f06d0a689e/skills/better-interface. The documentation method was adapted from Paul Bakaus's Impeccable at commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8` (Apache-2.0), https://github.com/pbakaus/impeccable/blob/9d715cc4f5564a990ca8345abfdd5df6dc9b41c8/skill/reference/document.md. The combined notices and full licenses are retained in `docs/DESIGN_GUIDANCE_LICENSE.txt`.

Rabby's mobile handoff uses the `_cmd=open-dapp&dapp=…` handler verified in its public source: https://github.com/RabbyHub/rabby-mobile/blob/develop/apps/mobile/src/hooks/universalLink.ts. Wallet setup follows the [wagmi connector guide](https://wagmi.sh/react/guides/connect-wallet); transaction preflight follows [viem's simulation API](https://viem.sh/docs/contract/simulateContract). These references supplement the locally pinned configuration; they are not runtime dependencies.
