/* Browser-only fixtures. No signing keys, broadcasts, or sample data in the shipped app.
 * All RPC and wallet actions are mocked; nothing is sent to a real chain.
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
const shots = process.env.SHOTS_DIR ?? 'test/scratch/shots';
await mkdir(shots,{recursive:true});
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
          case 'roundPage': { const r=d.args[0]; const h=r*3n; result=encoded(coreAbi,d.functionName,{certifiedThroughRound:r,start:{cumulativeWork:r,cumulativeBlockUnits:h*1000000000n,workPerThousandBlocks:1000},end:{cumulativeWork:r,cumulativeBlockUnits:h*1000000000n,workPerThousandBlocks:1000},rounds:[]}); break; }
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
  await page.locator('article.market-card').first().waitFor({timeout:20000});
  return {page,context};
}
async function test(name,fn) {try{await fn();results.push({name,passed:true});console.log('PASS',name);}catch(e){results.push({name,passed:false,error:e.message});console.error('FAIL',name,e.stack);}}
const noOverflow = async page => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'page scrolls horizontally');
try {
  await test('Markets render with odds, wheel stats and no console errors (1440)', async () => {
    resetFixtures(); const {page,context}=await fixturePage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    assert.equal(await page.locator('article.market-card').count(), 6);
    await page.getByRole('heading',{name:'Wheel form'}).waitFor();
    await page.locator('.window-grid dd').first().waitFor({timeout:20000});
    assert.equal(await page.locator('.window-grid dd').nth(4).innerText(), '432'); // 144 rounds x 3 blocks, mocked
    const first = page.locator('article.market-card').filter({hasText:'#1'});
    assert.match(await first.innerText(), /Over 1,000\.5/);
    assert.match(await first.locator('.odds-yes .odds-price').innerText(), /^\d+\.\d\dx$/);
    await noOverflow(page); await page.screenshot({path:`${shots}/fixture-1440.png`}); assert.deepEqual(errors, []); await context.close();
  });
  await test('Filters: status, length, type, search and clear', async () => {
    resetFixtures(); const {page,context}=await fixturePage(); const cards=page.locator('article.market-card');
    await page.getByRole('button',{name:'Open',exact:true}).click(); assert.equal(await cards.count(), 2);
    await page.getByRole('button',{name:'Settled',exact:true}).click(); assert.equal(await cards.count(), 1);
    await page.getByRole('button',{name:'All',exact:true}).click();
    await page.getByLabel('Window length').selectOption({label:'7 days'}); assert.equal(await cards.count(), 1);
    await page.getByLabel('Window length').selectOption({label:'Any length'});
    await page.getByLabel('Market type').selectOption('Weekly total'); assert.equal(await cards.count(), 1);
    await page.getByLabel('Market type').selectOption('Activity'); await page.getByText('No markets match').waitFor();
    await page.getByRole('button',{name:'Clear filters'}).click(); assert.equal(await cards.count(), 6);
    await page.getByLabel('Search by line or market number').fill('10000'); assert.equal(await cards.count(), 1);
    await context.close();
  });
  await test('Connect wallet, open bet slip from odds, place an Under bet', async () => {
    resetFixtures(); const {page,context}=await fixturePage();
    await page.getByRole('button',{name:'Connect wallet'}).click(); await page.getByRole('button',{name:/Test Browser Wallet/}).click();
    await page.getByRole('button',{name:/0x1234…7890/}).waitFor();
    await page.locator('article.market-card').filter({hasText:'#1'}).locator('.odds-no').click();
    const slip=page.getByRole('dialog',{name:'Bet slip'}); await slip.waitFor();
    assert.ok(await slip.getByRole('radio',{name:/Under 1,000\.5/}).isChecked());
    await slip.getByRole('button',{name:'0.005 ETH'}).click();
    await slip.getByRole('button',{name:'Bet Under 1,000.5'}).click();
    await slip.getByText('Your Under 1,000.5 bet is confirmed.').waitFor();
    assert.deepEqual(transactions.map(t=>[t.functionName,...t.args]), [['bet','1','false']]);
    assert.equal(BigInt(transactions[0].value), parseEther('0.005'));
    await page.keyboard.press('Escape'); await slip.waitFor({state:'hidden'}); await context.close();
  });
  await test('Invalid stake shows a recoverable error and sends nothing', async () => {
    resetFixtures(); const {page,context}=await fixturePage();
    await page.locator('article.market-card').first().locator('.odds-yes').click();
    const slip=page.getByRole('dialog',{name:'Bet slip'}); await slip.getByLabel(/Your stake/).fill('0.00001');
    await slip.getByRole('button',{name:/Connect to place bet|Bet Over/}).click();
    await slip.getByText('Enter at least 0.0001 test ETH.').waitFor(); assert.equal(transactions.length, 0); await context.close();
  });
  await test('Create market from an idea with a custom start time', async () => {
    resetFixtures(); const {page,context}=await fixturePage();
    await page.getByRole('button',{name:'Connect wallet'}).click(); await page.getByRole('button',{name:/Test Browser Wallet/}).click();
    await page.getByRole('button',{name:/Record attempt/}).click();
    const d=page.getByRole('dialog',{name:'Create a market'}); await d.waitFor();
    await d.getByRole('button',{name:'Raise the line by 10'}).click();
    await d.getByText('Pick a time').click();
    const t=new Date((Number(now)+3*3600)*1000); const pad=n=>String(n).padStart(2,'0');
    await d.getByLabel('Start date and time').fill(`${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`);
    await d.getByRole('button',{name:'Create market'}).click();
    await d.getByText(/Your market is live/).waitFor();
    const tx=transactions[0]; assert.equal(tx.functionName,'createMarket'); assert.equal(tx.args[2],'86400');
    const startsAt=genesis+(BigInt(tx.args[1])-1n)*600n; assert.ok(startsAt>=now+3n*3600n-60n && startsAt<now+3n*3600n+600n, 'start snaps to the next round after the chosen time');
    await context.close();
  });
  await test('Too-early custom start is refused before the wallet', async () => {
    resetFixtures(); const {page,context}=await fixturePage();
    await page.getByRole('button',{name:'Connect wallet'}).click(); await page.getByRole('button',{name:/Test Browser Wallet/}).click();
    await page.getByRole('button',{name:'Create market',exact:true}).first().click();
    const d=page.getByRole('dialog',{name:'Create a market'}); await d.getByText('Pick a time').click();
    const t=new Date((Number(now)+600)*1000); const pad=n=>String(n).padStart(2,'0');
    await d.getByLabel('Start date and time').fill(`${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`);
    await d.getByText(/at least 65 minutes/).waitFor(); assert.ok(await d.getByRole('button',{name:'Create market'}).isDisabled()); assert.equal(transactions.length,0); await context.close();
  });
  await test('My bets: one-tap claim and resolve flow', async () => {
    resetFixtures(); const {page,context}=await fixturePage();
    await page.getByRole('button',{name:'Connect wallet'}).click(); await page.getByRole('button',{name:/Test Browser Wallet/}).click();
    await page.getByRole('link',{name:/My bets/}).first().click();
    await page.getByRole('heading',{name:'Ready to claim'}).waitFor();
    await page.locator('.claim-list').getByRole('button',{name:'Claim'}).click();
    await page.getByText('Winnings from market #4 claimed.').first().waitFor();
    assert.deepEqual(transactions.map(t=>[t.functionName,...t.args]), [['claim','4',getAddress(ACCOUNT)]]);
    await page.getByRole('link',{name:'Markets',exact:true}).first().click();
    await page.locator('article.market-card').filter({hasText:'#6'}).getByRole('button',{name:'Resolve market'}).click();
    await page.getByRole('dialog',{name:'Market details'}).getByRole('button',{name:'Resolve market'}).click();
    await page.getByText('Market resolved. Winning positions can now claim.').first().waitFor();
    assert.equal(transactions.at(-1).functionName,'resolve'); await context.close();
  });
  await test('390 and 320 layouts: product and main action on first screen, no overflow, accessible', async () => {
    resetFixtures();
    for (const width of [390, 320]) {
      const {page,context}=await fixturePage({width,height:844},true);
      await noOverflow(page);
      const create=await page.getByRole('button',{name:'Create market',exact:true}).first().boundingBox(); assert.ok(create && create.y+create.height<844);
      const h1=await page.locator('h1').boundingBox(); assert.ok(h1.y<200);
      await page.screenshot({path:`${shots}/fixture-${width}.png`});
      await page.locator('article.market-card').first().locator('.odds-yes').click();
      await page.getByRole('dialog',{name:'Bet slip'}).waitFor(); await noOverflow(page);
      if (width===390) await page.screenshot({path:`${shots}/mobile-bet-slip.png`});
      await page.keyboard.press('Escape');
      if (width===390) { const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze(); assert.deepEqual(axe.violations.map(v=>`${v.id}: ${v.nodes.length}`), []); }
      await context.close();
    }
  });
  await test('Phone wallet sheet offers Open in links and Coinbase Smart Wallet', async () => {
    resetFixtures(); const {page,context}=await fixturePage({width:390,height:844},true);
    await page.getByRole('button',{name:/^Connect( wallet)?$/}).click();
    for (const name of ['MetaMask','Coinbase Wallet','Rabby','Phantom']) await page.getByRole('link',{name:`Open in ${name}`}).waitFor();
    await page.getByRole('button',{name:'Coinbase Smart Wallet'}).waitFor(); await context.close();
  });
  await test('RPC outage shows a retry notice instead of a blank page', async () => {
    resetFixtures(); rpcMode='fail'; const context=await browser.newContext({viewport:{width:1440,height:900}}); const page=await context.newPage();
    await context.route(/ethereum-sepolia-rpc\.publicnode\.com|rpc\.sepolia\.ethpandaops\.io|sepolia\.rpc\.sentio\.xyz/,routeRpc);
    await page.goto(url); await page.getByText('Couldn’t load fresh market data').waitFor({timeout:30000});
    rpcMode='ok'; await page.getByRole('button',{name:'Retry',exact:true}).click(); await page.locator('article.market-card').first().waitFor({timeout:20000}); await context.close();
  });
} finally {
  await browser.close(); server.close();
  await writeFile(`${shots}/results.json`, JSON.stringify(results,null,2));
  const failed=results.filter(r=>!r.passed); console.log(`${results.length-failed.length}/${results.length} passed`); if (failed.length) process.exitCode=1;
}
