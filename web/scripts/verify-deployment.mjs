import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { keccak256, toHex } from 'viem';
const proof = JSON.parse(fs.readFileSync(new URL('./deployment-proof.json', import.meta.url)));
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const abiHash = keccak256(toHex(JSON.stringify(canonical(proof.abi))));
if (abiHash.slice(2) !== proof.abiHash) throw Error(`ABI mismatch: ${abiHash}`);
for (const [path, expected] of Object.entries(proof.sources)) {
  const contents = fs.readFileSync(new URL('../../' + path, import.meta.url));
  if (createHash('sha256').update(contents).digest('hex') !== expected) throw Error('Pinned source mismatch: ' + path);
}
const generatedAbi = fs.readFileSync(new URL('../src/predictAbi.ts', import.meta.url), 'utf8').split('export const predictAbi = ')[1].split(' as const;')[0];
if (keccak256(toHex(JSON.stringify(canonical(JSON.parse(generatedAbi))))) !== abiHash) throw Error('Frontend ABI mismatch');
if (keccak256(proof.creationBytecode).slice(2) !== proof.creationCodeHash) throw Error('Creation bytecode mismatch');
const runtimeHash = keccak256(proof.deployedBytecode);
fs.writeFileSync(new URL('../src/verification.ts', import.meta.url), `/* Verified against the pinned Solidity build; see scripts/deployment-proof.json. */\nexport const EXPECTED_RUNTIME_HASH = '${runtimeHash}' as const;\nexport const VERIFIED_ABI_HASH = '${abiHash}' as const;\n`);
console.log(JSON.stringify({ abiHash, runtimeHash, sourceCommit: proof.sourceCommit, sourceFilesMatch: true }, null, 2));
