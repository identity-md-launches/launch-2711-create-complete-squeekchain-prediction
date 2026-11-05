/* Read-only deployment observation. No wallet, signing key or transactions. */
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createPublicClient, custom, keccak256 } from 'viem';
const run = promisify(execFile);
const here = path => new URL(path, import.meta.url);
const networkSource = await readFile(here('../src/network.ts'), 'utf8');
const network = JSON.parse(networkSource.split('export const network = ')[1].split(' as const;')[0]);
const proof = JSON.parse(await readFile(here('./deployment-proof.json'), 'utf8'));
const coreSource = await readFile(here('../src/coreAbi.ts'), 'utf8');
const coreAbi = JSON.parse(coreSource.split('export const coreAbi = ')[1].split(' as const;')[0]);
let rpcId = 0;
export async function request({method,params}) {
  for (const rpc of network.rpcUrls) {
    try {
      const {stdout} = await run('curl', ['--silent','--show-error','--fail','--max-time','15',rpc,'-H','content-type: application/json','--data',JSON.stringify({jsonrpc:'2.0',id:++rpcId,method,params:params??[]})], {maxBuffer:2*1024*1024});
      const response=JSON.parse(stdout);
      if (response.error) throw new Error(response.error.message);
      return response.result;
    } catch { /* Try the next configured public endpoint. */ }
  }
  throw new Error('Configured public Sepolia RPCs are unavailable.');
}
export const client=createPublicClient({transport:custom({request},{retryCount:0})});
if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  const block=await client.getBlock();
  const read={address:proof.address,abi:proof.abi,blockNumber:block.number};
  const [chainId,code,count,core]=await Promise.all([client.getChainId(),client.getBytecode({address:proof.address,blockNumber:block.number}),client.readContract({...read,functionName:'marketCount'}),client.readContract({...read,functionName:'CORE'})]);
  const result=await Promise.allSettled([client.readContract({address:core,abi:coreAbi,blockNumber:block.number,functionName:'state'}),client.readContract({address:core,abi:coreAbi,blockNumber:block.number,functionName:'configuration'})]);
  const observation={observedAt:new Date().toISOString(),sources:network.rpcUrls,chainId,address:proof.address,sourceCommit:proof.sourceCommit,abiHash:proof.abiHash,blockNumber:block.number,blockTimestamp:block.timestamp,marketCount:count,runtimeHash:code?keccak256(code):null,expectedRuntimeHash:keccak256(proof.deployedBytecode),runtimeMatches:Boolean(code && keccak256(code)===keccak256(proof.deployedBytecode)),coreAddress:core,coreState:result[0].status==='fulfilled'?result[0].value:null,coreConfig:result[1].status==='fulfilled'?result[1].value:null,transactionsSent:0};
  const json=JSON.stringify(observation,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n';
  await writeFile(here('../../artifacts/chain-observation.json'),json);console.log(json);
  if(chainId!==network.chainId||!observation.runtimeMatches)process.exitCode=1;
}
