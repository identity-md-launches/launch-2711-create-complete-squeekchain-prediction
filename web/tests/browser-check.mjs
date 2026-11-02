/* Browser-only fixtures. No signing keys, broadcasts, or sample data in the shipped app.
 * All RPC and wallet actions are mocked unless CHECK_LIVE_RPC=1 enables one read-only check.
 * Serves the production export at /preview/ for the lifetime of this process. */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { decodeFunctionData, encodeFunctionResult, parseEther, getAddress } from 'viem';

process.chdir(fileURLToPath(new URL('../../', import.meta.url)));
const root = resolve('dist');
const abi = JSON.parse(await readFile('web/scripts/deployment-proof.json')).abi;
const coreAbi = JSON.parse((await readFile('web/src/coreAbi.ts','utf8')).split('export const coreAbi = ')[1].split(' as const;')[0]);
const proof = JSON.parse(await readFile('web/scripts/deployment-proof.json'));
const CORE = '0x74665dAecA35A2303e767E76a2FF1FB6F93e119f';
const ACCOUNT = '0x1234567890123456789012345678901234567890'; // Test-only, never sent to a real chain.
const HASH = `0x${'12'.repeat(32)}`;
const now = BigInt(Math.floor(Date.now() / 1000));
const genesis = now - 30n * 86400n;
const empty = { yes: 0n, no: 0n, claimed: false, claimable: 0n };
const base = { threshold: 1000n, startRound: 4300n, endRound: 4443n, startsAt: now + 7200n, endsAt: now + 7200n + 86400n, refundAt: now + 7200n + 31n*86400n, genesisTimestamp: genesis, streamId: `0x${'11'.repeat(32)}`, implementation: CORE, status: 0, yesWins: false, startBlockUnits: 0n, endBlockUnits: 0n, yesPool: parseEther('0.012'), noPool: parseEther('0.008'), remainingWinningStake: 0n, remainingPayout: 0n };
let markets;
let positions;
let transactions;
let rpcMode = 'ok';
function resetFixtures() {
  markets = {
    1: { ...base },
    2: { ...base, threshold: 10000n, endsAt: base.startsAt + 604800n, refundAt: base.startsAt + 31n*86400n + 604800n },
    3: { ...base, startsAt: now-3600n, endsAt: now+82800n },
    4: { ...base, startsAt: now-2n*86400n, endsAt: now-86400n, status: 1, yesWins: true, yesPool: parseEther('0.002'), noPool: parseEther('0.002'), remainingWinningStake: parseEther('0.002'), remainingPayout: parseEther('0.004'), endBlockUnits: 1500n*1000000000n },
    5: { ...base, startsAt: now-3600n, endsAt: now+82800n, noPool: 0n },
    6: { ...base, startsAt: now-2n*86400n, endsAt: now-86400n },
  };
  positions = { 1: {...empty, yes: parseEther('0.001')}, 4: {...empty, yes: parseEther('0.002'), claimable: parseEther('0.004')}, 5: {...empty, yes:parseEther('0.001')} };
  transactions = []; rpcMode='ok';
}
resetFixtures();
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
const server = createServer(async (req,res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (!path.startsWith('/preview/')) { res.writeHead(404).end(); return; }
  const local = path.slice(9) || 'index.html';
  if (local.includes('..')) { res.writeHead(403).end(); return; }
  try { const data = await readFile(resolve(root, local)); res.writeHead(200, {'content-type':mime[extname(local)] || 'application/octet-stream'}).end(data); } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0,'127.0.0.1',r));
const url = `http://127.0.0.1:${server.address().port}/preview/`;
await mkdir('test/scratch/shots',{recursive:true});
const results = [];
const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
function block() { return {number:'0xb7e000',hash:HASH,parentHash:HASH,nonce:'0x0000000000000000',sha3Uncles:HASH,logsBloom:`0x${'00'.repeat(256)}`,transactionsRoot:HASH,stateRoot:HASH,receiptsRoot:HASH,miner:CORE,difficulty:'0x0',totalDifficulty:'0x0',extraData:'0x',size:'0x100',gasLimit:'0x1c9c380',gasUsed:'0x1000',timestamp:`0x${now.toString(16)}`,transactions:[],uncles:[],baseFeePerGas:'0x3b9aca00',mixHash:HASH}; }
function encoded(whichAbi,name,result) { return encodeFunctionResult({abi:whichAbi,functionName:name,result}); }
async function routeRpc(route) {
  if (rpcMode === 'fail') { await route.fulfill({status:503,body:'offline'}); return; }
  const handle = q => {
    let result;
    switch(q.method) {
      case 'eth_chainId': result='0xaa36a7'; break;
      case 'eth_blockNumber': result='0xb7e000'; break;
      case 'eth_getCode': result=rpcMode==='mismatch'?'0x6000':proof.deployedBytecode; break;
      case 'eth_getBlockByNumber': result=block(); break;
      case 'eth_getBalance': result='0xde0b6b3a7640000'; break;
      case 'eth_getTransactionReceipt': result={transactionHash:HASH,transactionIndex:'0x0',blockHash:HASH,blockNumber:'0xb7e000',from:ACCOUNT,to:proof.address,cumulativeGasUsed:'0x5208',gasUsed:'0x5208',effectiveGasPrice:'0x3b9aca00',contractAddress:null,logs:[],logsBloom:`0x${'00'.repeat(256)}`,status:'0x1',type:'0x2'}; break;
      case 'eth_call': {
        const target = q.params[0];
        const core = target.to.toLowerCase() === CORE.toLowerCase();
        const d = decodeFunctionData({abi:core?coreAbi:abi,data:target.data});
        const id = d.args?.[0]?.toString();
        switch(d.functionName) {
          case 'marketCount': result=encoded(abi,d.functionName,BigInt(Object.keys(markets).length)); break;
          case 'CORE': result=encoded(abi,d.functionName,CORE); break;
          case 'getMarket': result=encoded(abi,d.functionName,markets[id]); break;
          case 'positions': { const p=positions[id]??empty; result=encoded(abi,d.functionName,[p.yes,p.no,p.claimed]); break; }
          case 'claimable': result=encoded(abi,d.functionName,positions[id]?.claimable??0n); break;
          case 'state': result=encoded(coreAbi,d.functionName,{settledThroughRound:100000n,cumulativeWork:100000n,cumulativeBlockUnits:13095000000000n,blockHeight:13095n,blockProgress:0n,workPerThousandBlocks:1000,authorizationNonce:1n,paused:false}); break;
          case 'configuration': result=encoded(coreAbi,d.functionName,{streamId:base.streamId,genesisTimestamp:genesis,roundDuration:600n,maxWorkPerRound:1000n,maxRoundsPerBatch:100,guardian:CORE,reporter:CORE,initialWorkPerThousandBlocks:1000,targetBlocksPerActiveRound:1n,difficultySmoothingRounds:1n,blockUnitsPerBlock:1000000000n}); break;
          case 'createMarket': result=encoded(abi,d.functionName,7n); break;
          case 'claim': result=encoded(abi,d.functionName,positions[id]?.claimable??0n); break;
          default: result='0x';
        }
        break;
      }
      default: throw new Error(`Unhandled RPC ${q.method}`);
    }
    return {jsonrpc:'2.0',id:q.id,result};
  };
  try {const data=route.request().postDataJSON(); await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(Array.isArray(data)?data.map(handle):handle(data))});} catch(e) {console.error('MOCK ERROR',e); await route.fulfill({status:500,body:String(e)});}
}
async function fixturePage(viewport={width:1440,height:1000}, mobile=false) {
  const context=await browser.newContext({viewport,...(mobile?{isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'}:{})});
  const page=await context.newPage();
  await context.route(/ethereum-sepolia-rpc\.publicnode\.com|rpc\.sepolia\.ethpandaops\.io|sepolia\.rpc\.sentio\.xyz/,routeRpc);
  await page.exposeFunction('recordTransaction', async tx => {
    const d=decodeFunctionData({abi,data:tx.data}); transactions.push({functionName:d.functionName,args:d.args?.map(String),value:tx.value,to:tx.to});
    const id=String(d.args[0]);
    if (d.functionName==='bet') { const yes=d.args[1]; const value=BigInt(tx.value); markets[id][yes?'yesPool':'noPool']+=value; positions[id]??={...empty}; positions[id][yes?'yes':'no']+=value; }
    if(d.functionName==='claim'){positions[id].claimable=0n;positions[id].claimed=true;}
    if(d.functionName==='resolve'){markets[id].status=1;markets[id].yesWins=true;markets[id].endBlockUnits=1500n*1000000000n;}
    if(d.functionName==='cancelUnmatched'||d.functionName==='cancelExpired'){markets[id].status=2;positions[id].claimable=positions[id].yes+positions[id].no;}
    if(d.functionName==='createMarket'){markets[7]={...base,threshold:d.args[0],startRound:d.args[1],startsAt:genesis+(d.args[1]-1n)*600n,endsAt:genesis+(d.args[1]-1n)*600n+d.args[2],yesPool:0n,noPool:0n};}
    return HASH;
  });
  if(!mobile) await page.addInitScript(({account})=>{
    const listeners={}; let connected=false; let chain='0xaa36a7';
    const provider={isMetaMask:false,on:(event,cb)=>(listeners[event]??=[]).push(cb),removeListener:(event,cb)=>{listeners[event]=(listeners[event]??[]).filter(x=>x!==cb)},request:async({method,params})=>{
      if(method==='eth_chainId')return chain;
      if(method==='eth_requestAccounts'){connected=true;return[account]}
      if(method==='eth_accounts')return connected?[account]:[];
      if(method==='wallet_switchEthereumChain'){if(window.rejectNext){window.rejectNext=false;throw Object.assign(new Error('User rejected'),{code:4001})}chain=params[0].chainId;(listeners.chainChanged??[]).forEach(cb=>cb(chain));return null;}
      if(method==='wallet_addEthereumChain')return null;
      if(method==='eth_sendTransaction'){if(window.rejectNext){window.rejectNext=false;throw Object.assign(new Error('User rejected'),{code:4001})} return await window.recordTransaction(params[0]);}
      if(method==='eth_getCapabilities'||method==='wallet_getCapabilities')return {};
      throw Error(`Unhandled wallet ${method}`);
    }};
    window.ethereum=provider;
    window.setTestChain=value=>{chain=value;(listeners.chainChanged??[]).forEach(cb=>cb(chain));};
    window.setTestAccount=value=>{account=value;(listeners.accountsChanged??[]).forEach(cb=>cb([account]));};
    const announce=()=>window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{uuid:'b440f663-24fc-4572-abdc-0c78d2542673',name:'Test Browser Wallet',icon:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',rdns:'test.squeek.wallet'},provider}}));
    window.addEventListener('eip6963:requestProvider',announce);announce();
  },{account:ACCOUNT});
  await page.goto(url);
  await page.getByText(/Block 12,050,432/).waitFor({timeout:20000}).catch(async()=>{await page.getByRole('button',{name:'Bet yes'}).first().waitFor({timeout:20000})});
  return {page,context};
}
async function test(name,fn) {try{await fn();results.push({name,passed:true});console.log('PASS',name);}catch(e){results.push({name,passed:false,error:e.message});console.error('FAIL',name,e.stack);throw e;}}
try {
  if (process.env.CHECK_LIVE_RPC === '1') await test('Subpath export and real RPC reads',async()=>{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    const responses=[];const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',async r=>{if(r.url().includes('publicnode.com')&&r.request().method()==='POST')try{responses.push({request:r.request().postDataJSON(),response:await r.json()})}catch{}});
    await page.goto(url);await page.locator('.chain-status').filter({hasText:/Block/}).waitFor({timeout:35000});
    if(await page.locator('article.market-card').count() === 0) await page.getByText('The next prediction starts with you.').waitFor();
    assert.equal(await page.locator('h1').innerText(),'Bet on the next turn.');
    const action=await page.getByRole('button',{name:'Create market',exact:true}).boundingBox();assert(action.y<844);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.equal(errors.length,0); await page.screenshot({path:'test/scratch/shots/live-390.png',fullPage:true});
    const number=await page.locator('.chain-status').innerText();
    await writeFile('test/scratch/live-observation.json',JSON.stringify({time:new Date().toISOString(),number,responses},null,2));
    await page.close();
  });
  resetFixtures();const {page,context}=await fixturePage();
  await test('Six lifecycle states render; open markets and bet controls lead at 390',async()=>{assert.equal(await page.locator('article.market-card').count(),6);await page.setViewportSize({width:390,height:844});const firstBet=await page.getByRole('button',{name:'Bet yes'}).first().boundingBox();assert(firstBet.y+firstBet.height<844,`Bet action is below first screen: ${firstBet.y}`);await page.screenshot({path:'test/scratch/shots/fixture-initial-390.png'});await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'test/scratch/shots/fixture-1440.png',fullPage:true});});
  await test('Status, duration, and search filters; reset empty results',async()=>{
    await page.getByRole('button',{name:'Open',exact:true}).click();assert.equal(await page.locator('article.market-card').count(),2);
    await page.getByLabel('Activity window',{exact:true}).selectOption('604800');assert.equal(await page.locator('article.market-card').count(),1);
    await page.getByRole('searchbox').fill('99999');await page.getByText('No matching markets',{exact:true}).waitFor();await page.getByRole('button',{name:'Reset filters'}).click();assert.equal(await page.locator('article.market-card').count(),6);
  });
  await test('Connect sheet EIP-6963 discovery, Escape, focus return, and connect',async()=>{
    const trigger=page.getByRole('button',{name:'Connect wallet',exact:true});await trigger.click();await page.getByRole('button',{name:'Test Browser Wallet'}).waitFor();assert.equal(await page.getByRole('button',{name:'Browser wallet',exact:true}).count(),0);
    await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').count(),0);await trigger.focus();await page.keyboard.press('Enter');await page.keyboard.press('Escape');assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
    await trigger.click();await page.getByRole('button',{name:'Test Browser Wallet'}).click();await page.getByRole('button',{name:/0x1234/}).waitFor();await page.getByRole('button',{name:'Bet yes'}).first().waitFor();
  });
  await test('Wrong chain disables transactions and switches through wallet control',async()=>{
    await page.evaluate(()=>window.setTestChain('0x1'));await page.getByRole('button',{name:'Switch to Sepolia',exact:true}).waitFor();await page.getByRole('button',{name:'Bet yes'}).first().click();assert(await page.getByRole('button',{name:'Switch to Sepolia in the header'}).isDisabled());await page.keyboard.press('Escape');await page.getByRole('button',{name:'Switch to Sepolia',exact:true}).click();await page.getByRole('button',{name:/0x1234/}).waitFor();
  });
  await test('Bet validation, changing side/amount, rejected signature and successful payable bet',async()=>{
    const card=page.locator('article.market-card').filter({hasText:'7 days'});await card.getByRole('button',{name:'Bet no'}).click();await page.getByLabel('Your stake').fill('0.00001');await page.getByRole('button',{name:'Place no bet',exact:true}).click();await page.getByText('Enter at least 0.0001 test ETH.').waitFor();assert.equal(transactions.length,0);
    await page.getByRole('button',{name:'0.005 ETH',exact:true}).click();await page.evaluate(()=>window.rejectNext=true);await page.getByRole('button',{name:'Place no bet',exact:true}).click();await page.getByText('Request declined in your wallet. You can try again.').waitFor();assert.equal(transactions.length,0);
    await page.getByRole('button',{name:'Place no bet',exact:true}).click();await page.locator('.transaction-notice').getByText('Your no bet is confirmed.').waitFor();assert.equal(transactions.at(-1).functionName,'bet');assert.deepEqual(transactions.at(-1).args,['2','false']);assert.equal(BigInt(transactions.at(-1).value),parseEther('0.005'));assert.equal(transactions.at(-1).to.toLowerCase(),proof.address.toLowerCase());await page.screenshot({path:'test/scratch/shots/bet-success.png'});await page.keyboard.press('Escape');
  });
  await test('Positions and winnings: exact claim calldata and claimed state',async()=>{
    await page.locator('header nav').getByRole('link',{name:'My positions'}).click();await page.getByRole('heading',{name:'My positions',exact:true}).waitFor();await page.getByRole('button',{name:'To claim',exact:true}).click();assert.equal(await page.locator('article.market-card').count(),1);await page.getByRole('button',{name:'Claim winnings',exact:true}).click();await page.getByRole('button',{name:'Claim 0.004 ETH winnings'}).click();await page.locator('.transaction-notice').getByText('Your winnings are claimed.').waitFor();assert.equal(transactions.at(-1).functionName,'claim');assert.deepEqual(transactions.at(-1).args,['4',getAddress(ACCOUNT)]);await page.getByText('Complete',{exact:true}).waitFor();await page.keyboard.press('Escape');
  });
  await test('Unmatched refunds open then claim; permissionless resolution',async()=>{
    await page.locator('header nav').getByRole('link',{name:'Markets',exact:true}).click();await page.getByRole('button',{name:'Open refunds',exact:true}).click();await page.locator('dialog').getByRole('button',{name:'Open refunds',exact:true}).click();await page.locator('.transaction-notice').getByText('Refunds are open. You can now claim your stake.').waitFor();await page.getByRole('button',{name:'Claim 0.001 ETH refund'}).click();await page.locator('.transaction-notice').getByText('Your refund is confirmed.').waitFor();await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Resolve market',exact:true}).click();await page.locator('dialog').getByRole('button',{name:'Resolve market',exact:true}).click();await page.locator('.transaction-notice').getByText('Market resolved. Winning positions can now claim.').waitFor();assert.equal(transactions.at(-1).functionName,'resolve');await page.keyboard.press('Escape');
  });
  await test('Create weekly market with strict integer validation and round-aligned calldata',async()=>{
    await page.getByRole('button',{name:'The long run',exact:false}).click();await page.getByLabel('Will the hamster complete more than…').fill('1.5');await page.locator('dialog').getByRole('button',{name:'Create market',exact:true}).click();await page.getByText('Enter a whole block count from 0 to 18446744073709551615.').waitFor();await page.getByLabel('Will the hamster complete more than…').fill('12500');await page.locator('dialog').getByRole('button',{name:'Create market',exact:true}).click();await page.locator('.transaction-notice').getByText('Your market is created. Find it at the top of the market list.').waitFor();assert.equal(transactions.at(-1).functionName,'createMarket');assert.equal(transactions.at(-1).args[0],'12500');assert.equal(transactions.at(-1).args[2],'604800');await page.keyboard.press('Escape');
  });
  await test('Lookup older market by ID isolates the result',async()=>{await page.getByText('Find an older market by ID').click();await page.getByLabel('Market ID',{exact:true}).fill('1');await page.getByRole('button',{name:'Find market',exact:true}).click();await page.locator('article.market-card').first().waitFor();assert.equal(await page.locator('article.market-card').count(),1);assert.match(await page.locator('article.market-card').innerText(),/1,000/);await page.getByRole('searchbox').fill('');});
  await test('Help dialog keyboard path and no accessibility scan violations on market grid',async()=>{
    await page.getByRole('button',{name:'How it works',exact:true}).first().click();await page.getByRole('heading',{name:'A small guide to Squeek'}).waitFor();await page.keyboard.press('Escape');
    const scan=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();await writeFile('test/scratch/axe-desktop.json',JSON.stringify(scan.violations,null,2));assert.deepEqual(scan.violations.map(v=>({id:v.id,impact:v.impact})),[]);
  });
  await test('Mobile widths 320/390/768: no overflow, main action above fold, usable betting form',async()=>{
    for(const width of [320,390,768]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const main=await page.getByRole('button',{name:'Create market',exact:true}).boundingBox();assert(main.y<844);await page.screenshot({path:`test/scratch/shots/fixture-${width}.png`,fullPage:true});}
    await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Bet yes'}).first().click();assert.equal(await page.evaluate(()=>document.querySelector('dialog').scrollWidth>document.querySelector('dialog').clientWidth),false);await page.screenshot({path:'test/scratch/shots/mobile-bet.png'});await page.keyboard.press('Escape');
  });
  await context.close();
  await test('Phone wallet picker has four app links, Coinbase Smart Wallet, no QR',async()=>{
    const {page,context}=await fixturePage({width:390,height:844},true);await page.getByRole('button',{name:'Connect wallet',exact:true}).click();for(const name of ['MetaMask','Coinbase Wallet','Rabby','Phantom'])await page.getByRole('link',{name:`Open in ${name}`}).waitFor();await page.getByRole('button',{name:'Coinbase Smart Wallet'}).waitFor();assert.equal(await page.getByText('WalletConnect',{exact:true}).count(),0);await page.screenshot({path:'test/scratch/shots/mobile-wallet.png'});await context.close();
  });
  await test('RPC failure and retry recover without fake markets; mismatch blocks writes',async()=>{
    resetFixtures();rpcMode='fail';const c=await browser.newContext();await c.route(/ethereum-sepolia-rpc\.publicnode\.com|rpc\.sepolia\.ethpandaops\.io|sepolia\.rpc\.sentio\.xyz/,routeRpc);const p=await c.newPage();await p.goto(url);await p.getByText('Couldn’t load fresh market data').waitFor();assert.equal(await p.locator('article.market-card').count(),0);await p.screenshot({path:'test/scratch/shots/rpc-error.png'});rpcMode='ok';await p.getByRole('button',{name:'Retry connection'}).click();await p.getByRole('button',{name:'Bet yes'}).first().waitFor();rpcMode='mismatch';await p.getByRole('button',{name:'Refresh markets'}).click();await p.getByText('Contract verification failed',{exact:true}).waitFor();await c.close();rpcMode='ok';
  });
} catch(e) { console.error('Validation stopped at first failed assertion.'); }
finally {await browser.close();await new Promise(r=>server.close(r));await writeFile('test/scratch/interaction-results.json',JSON.stringify({results,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length},null,2));}
if(results.some(r=>!r.passed))process.exitCode=1;
