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
const genesis = now - 30n * 86400n - now % 600n; // on the 10-minute grid, like the live SqueekCore genesis
const empty = { yes: 0n, no: 0n, claimed: false, claimable: 0n };
const base = { threshold: 1000n, startRound: 4300n, endRound: 4443n, startsAt: now + 7200n, endsAt: now + 7200n + 86400n, refundAt: now + 7200n + 31n*86400n, genesisTimestamp: genesis, streamId: `0x${'11'.repeat(32)}`, implementation: CORE, status: 0, yesWins: false, startBlockUnits: 0n, endBlockUnits: 0n, yesPool: parseEther('0.012'), noPool: parseEther('0.008'), remainingWinningStake: 0n, remainingPayout: 0n };
let markets;
let positions;
let transactions;
let rpcMode = 'ok';
let historyMode = 'complete';
let settledRound = 100000n;
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
  transactions = []; rpcMode='ok'; historyMode='complete'; settledRound=100000n;
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
          case 'state': result=encoded(coreAbi,d.functionName,{settledThroughRound:settledRound,cumulativeWork:100000n,cumulativeBlockUnits:13095000000000n,blockHeight:13095n,blockProgress:0n,workPerThousandBlocks:1000,authorizationNonce:1n,paused:false}); break;
          case 'configuration': result=encoded(coreAbi,d.functionName,{streamId:base.streamId,genesisTimestamp:genesis,roundDuration:600n,maxWorkPerRound:1000n,maxRoundsPerBatch:100,guardian:CORE,reporter:CORE,initialWorkPerThousandBlocks:1000,targetBlocksPerActiveRound:1n,difficultySmoothingRounds:1n,blockUnitsPerBlock:1000000000n}); break;
          case 'roundPage': { const r=d.args[0];
            if ((historyMode==='partial' && r>=99995n) || (historyMode==='interior' && r===99990n)) return {jsonrpc:'2.0',id:q.id,error:{code:-32000,message:'History unavailable'}};
            const h=r*3n; result=encoded(coreAbi,d.functionName,{certifiedThroughRound:historyMode==='uncertified' && r===settledRound?r-1n:r,start:{cumulativeWork:r,cumulativeBlockUnits:historyMode==='fractional'?r*1000n:h*1000000000n,workPerThousandBlocks:1000},end:{cumulativeWork:r,cumulativeBlockUnits:historyMode==='fractional'?r*1000n:h*1000000000n,workPerThousandBlocks:1000},rounds:[]}); break; }
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
async function test(name,fn) {if(process.env.ONLY && !name.includes(process.env.ONLY))return;try{await fn();results.push({name,passed:true});console.log('PASS',name);}catch(e){results.push({name,passed:false,error:e.message});console.error('FAIL',name,e.stack);}}
const noOverflow = async page => { const wide = await page.evaluate(() => { const w = document.documentElement.clientWidth; if (document.documentElement.scrollWidth <= w) return null; return `scroll ${document.documentElement.scrollWidth}/${w}: ` + [...document.querySelectorAll("body *")].filter(el => el.getBoundingClientRect().right > w).slice(-3).map(el => `${el.tagName}.${el.className} ${Math.round(el.getBoundingClientRect().right)}/${w}`).join(', '); }); assert.equal(wide, null, `page scrolls horizontally: ${wide}`); };
// Check scroll containers and the rendered text fragments, not just the document viewport.
const assertNoScroll = async locator => assert.ok(await locator.evaluate(el=>el.scrollWidth<=el.clientWidth), 'container scrolls horizontally');
const assertInViewport = async locator => assert.ok(await locator.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0 && r.right<=document.documentElement.clientWidth;}), 'control is outside viewport');
async function assertTextFits(locator) {
  for (const element of await locator.all()) {
    const outside=await element.evaluate(el=>{
      const box=el.getBoundingClientRect(); const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT); const failures=[];
      for(let node; (node=walker.nextNode());) {
        if(!node.textContent.trim())continue;
        const range=document.createRange(); range.selectNodeContents(node);
        for(const r of range.getClientRects())if(r.left<box.left-1 || r.right>box.right+1 || r.top<box.top-1 || r.bottom>box.bottom+1)failures.push(node.textContent);
      }
      return failures;
    });
    assert.deepEqual(outside,[], 'full label and multiplier must fit their control');
  }
}
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
  await test('Homepage name, hero art, credits, founder previews and stats history', async () => {
    resetFixtures(); const {page,context}=await fixturePage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    assert.equal(await page.locator('h1').innerText(), 'Squeek Predict');
    const art=page.locator('img.hero-art'); await art.waitFor();
    assert.ok(await art.evaluate(img=>img.complete && img.naturalWidth>0), 'hero image loads');
    assert.equal((await page.locator('.credits').textContent()).replace(/\s+/g,' ').trim(), 'Made by @squeektoshi @pillheadddd @le_chien65760 on @squeekchain');
    // Stats and history: 3 blocks per round in the fixture, so 432 a day and 3,024 a week.
    const history=page.locator('#history');
    await history.locator('.week-table tbody tr').first().waitFor({timeout:20000});
    assert.match(await history.locator('.week-table tbody tr').first().innerText(), /Latest 7 days\s+3,024/);
    assert.equal(await history.locator('.week-table tbody tr').count(), 4);
    assert.match(await history.locator('.overview').innerText(), /Markets created\s+6/);
    const results=history.locator('.history-list').first();
    assert.match(await results.innerText(), /Over 1,000\.5 won · 1,500 blocks/);
    assert.match(await results.innerText(), /#6/);
    assert.doesNotMatch(await results.innerText(), /#1 /, 'open markets are not history');
    // Founder previews: free calls persist in this browser and never touch the wallet or chain.
    const card=page.locator('.preview-card').filter({hasText:'today?'});
    assert.equal(await page.locator('.preview-card').count(), 4);
    await card.getByRole('button',{name:'5 to 14'}).click();
    assert.equal(await card.getByRole('button',{name:'5 to 14'}).getAttribute('aria-pressed'),'true');
    await page.reload(); await page.locator('article.market-card').first().waitFor({timeout:20000});
    assert.equal(await page.locator('.preview-card').filter({hasText:'today?'}).getByRole('button',{name:'5 to 14'}).getAttribute('aria-pressed'),'true');
    assert.equal(transactions.length,0);
    await page.getByRole('link',{name:'Stats',exact:true}).first().click();
    await page.waitForFunction(()=>location.hash==='#history');
    assert.ok(await page.locator('article.market-card').count()>0, 'Stats anchor keeps the markets view');
    await noOverflow(page); assert.deepEqual(errors, []); await context.close();
  });
  await test('Hamster markets: every family visible, categories, free calls persist and settle, on-chain lines bet', async () => {
    resetFixtures();
    // A saved 1-hour call for a window that ended two hours ago: 6 rounds x 3 blocks = 18 blocks, line 10, call Over.
    const hourStart = Number(now) - Number(now) % 3600 - 3 * 3600;
    const {page,context}=await fixturePage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.evaluate(id=>localStorage.setItem('squeek-predict-hamster-calls-v1', JSON.stringify({[id]:{pick:0,line:10}})), `blocks1h:${hourStart}`);
    await page.reload(); await page.locator('article.market-card').first().waitFor({timeout:20000});
    const hamster=page.locator('#hamster');
    assert.equal(await hamster.getByRole('heading',{level:2}).innerText(), 'Hamster markets');
    for (const name of ['Block counts','Longest runs','Activity windows']) await hamster.getByRole('heading',{name}).waitFor();
    for (const text of ['Squeek blocks in the next hour','Squeek blocks in the next 6 hours','Longest block streak tomorrow','Rounds with blocks tomorrow','Busiest part of tomorrow','Will the hamster complete a block next hour?']) assert.equal(await hamster.locator('.call-card').filter({hasText:text}).count(), 1, text);
    assert.equal(await hamster.locator('.chain-card').count(), 5);
    assert.equal(await page.locator('.preview-card').count(), 4, 'founder markets stay alongside');
    // Free 1-hour call: line from the 7-day average (432 a day -> 18 an hour -> 20).
    const hour=hamster.locator('.call-card').filter({hasText:'Squeek blocks in the next hour'});
    await hour.getByRole('button',{name:'Over 20.5'}).click();
    assert.equal(await hour.getByRole('button',{name:/Over 20\.5/}).getAttribute('aria-pressed'),'true');
    await hamster.locator('.call-card').filter({hasText:'Longest block streak'}).getByRole('button',{name:'3 to under 6 hours'}).click();
    await page.reload(); await page.locator('article.market-card').first().waitFor({timeout:20000});
    assert.equal(await page.locator('#hamster .call-card').filter({hasText:'Squeek blocks in the next hour'}).getByRole('button',{name:/Over 20\.5/}).getAttribute('aria-pressed'),'true');
    // Settled call shows under Stats with the certified count.
    const calls=page.locator('#history .history-list').filter({hasText:'Blocks in one hour'});
    await calls.getByText(/Right · 18 blocks/).waitFor({timeout:20000});
    assert.match(await calls.innerText(), /Window not finished/);
    // On-chain lines: the 24-hour card shows the open market's odds and opens the bet slip.
    const daily=hamster.locator('.chain-card').filter({hasText:'in 24 hours'}).first();
    await daily.locator('.odds-yes').click();
    await page.getByRole('dialog',{name:'Bet slip'}).waitFor(); await page.keyboard.press('Escape');
    // Categories filter the catalog; Founder & NFT hides hamster cards.
    await page.getByRole('button',{name:'Longest runs',exact:true}).click();
    assert.equal(await hamster.locator('.hamster-card').count(), 2);
    await page.getByRole('button',{name:'Founder & NFT',exact:true}).click();
    assert.equal(await page.locator('#hamster').count(), 0); assert.equal(await page.locator('.preview-card').count(), 4);
    await page.getByRole('button',{name:'All markets',exact:true}).click();
    assert.equal(await hamster.locator('.hamster-card').count(), 11);
    assert.equal(transactions.length,0, 'free calls never touch the wallet');
    await noOverflow(page); assert.deepEqual(errors, []); await context.close();
  });
  await test('No open markets suggests the next window', async () => {
    resetFixtures(); for (const id of Object.keys(markets)) if (markets[id].startsAt > now) markets[id] = { ...markets[id], startsAt: now-3600n, endsAt: now+82800n };
    const {page,context}=await fixturePage();
    await page.getByRole('button',{name:'Open next market'}).click();
    await page.getByRole('dialog').waitFor();
    assert.match(await page.getByRole('dialog').innerText(), /In about 1 hour/);
    await context.close();
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
    await page.locator('.chain-card').filter({hasText:'Will the hamster complete a block in the next 24 hours?'}).getByRole('button',{name:'Open this market'}).click();
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
      await page.getByRole('dialog',{name:'Bet slip'}).waitFor(); await noOverflow(page); await assertNoScroll(page.getByRole('dialog',{name:'Bet slip'}));
      if (width===390) await page.screenshot({path:`${shots}/mobile-bet-slip.png`});
      await page.keyboard.press('Escape');
      if (width===390) { const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze(); assert.deepEqual(axe.violations.map(v=>`${v.id}: ${v.nodes.length}`), []); }
      await context.close();
    }
  });
  await test('Full uint64 lines fit cards and connected slips at phone and desktop widths', async () => {
    for (const [threshold, width] of [[18446744073709551615n,390],[18446744073709551615n,320],[18446744073709551615n,1440],[1000n,320]]) {
      resetFixtures(); markets[1].threshold=threshold;
      const {page,context}=await fixturePage({width,height:844});
      await page.locator('.window-grid dd').first().waitFor();
      await page.waitForTimeout(600); // Finish card entry animation before measuring boxes.
      await noOverflow(page);
      const card=page.locator('article.market-card').filter({hasText:'#1'});
      const line=`${threshold.toLocaleString('en-US')}.5`;
      assert.deepEqual(await card.locator('.odds-side').allTextContents(), [`Over ${line}`,`Under ${line}`]);
      await assertTextFits(card.locator('.odds'));
      await page.getByRole('button',{name:/^Connect( wallet)?$/}).click();
      await page.getByRole('button',{name:/Test Browser Wallet/}).click();
      await page.getByRole('button',{name:/0x1234…7890/}).waitFor();
      await card.locator('.odds-yes').click();
      const slip=page.getByRole('dialog',{name:'Bet slip'});
      await page.waitForTimeout(300);
      await assertNoScroll(slip);
      await assertTextFits(slip.locator('.side-choice label'));
      await assertTextFits(slip.locator('button[type="submit"]'));
      await slip.getByRole('radio',{name:`Over ${line} 1.67x`,exact:true}).focus();
      await page.keyboard.press('ArrowRight');
      assert.ok(await slip.getByRole('radio',{name:`Under ${line} 2.50x`,exact:true}).isChecked());
      assert.ok(await slip.getByRole('button',{name:`Bet Under ${line}`,exact:true}).isVisible());
      await assertNoScroll(slip);
      if (width===390) await page.screenshot({path:`${shots}/long-line-slip-390.png`});
      await page.keyboard.press('Escape'); await noOverflow(page);
      await context.close();
    }
  });
  await test('Connect, connected and wrong-network headers fit across responsive breakpoints', async () => {
    for (const width of [320,375,390,420,421,760,761,768,800,820,850,851,876,900,901,1440]) {
      resetFixtures(); const {page,context}=await fixturePage({width,height:844});
      await page.waitForTimeout(600);
      await noOverflow(page); await assertInViewport(page.locator('.wallet-button'));
      await page.getByRole('button',{name:/^Connect( wallet)?$/}).click();
      await page.getByRole('button',{name:/Test Browser Wallet/}).click();
      await page.getByRole('button',{name:/0x1234…7890/}).waitFor();
      await noOverflow(page); await assertInViewport(page.locator('.wallet-button'));
      await page.evaluate(()=>window.setTestChain('0x1'));
      const action=page.getByRole('button',{name:'Switch to Sepolia'}); await action.waitFor();
      await page.waitForTimeout(200); // Allow the connected claim badge to arrive from RPC.
      await noOverflow(page); await assertInViewport(action); await assertTextFits(action);
      assert.ok(await page.getByRole('link',{name:'Squeek Predict home'}).isVisible());
      if (width===390) await page.screenshot({path:`${shots}/wrong-network-390.png`});
      await action.click(); await page.getByRole('button',{name:/0x1234…7890/}).waitFor();
      assert.equal(transactions.length,0);
      await context.close();
    }
  });
  await test('Incomplete history never becomes zero stats; retry restores certified values', async () => {
    for (const mode of ['partial','interior','uncertified']) {
      resetFixtures(); historyMode=mode;
      const {page,context}=await fixturePage({width:390,height:844});
      const retry=page.locator('#wheel').getByRole('button',{name:'Retry wheel stats'});
      await retry.waitFor({timeout:30000});
      assert.equal(await page.locator('.window-grid, .fact-list, .live-line').count(),0);
      assert.equal(await page.locator('.pulse strong').innerText(),'Wheel stats unavailable');
      if(mode==='partial') await page.locator('.wheel-panel').screenshot({path:`${shots}/history-error.png`});
      historyMode='complete'; await retry.click();
      await page.locator('.window-grid dd').first().waitFor({timeout:30000});
      assert.deepEqual(await page.locator('.window-grid dd').allTextContents(), ['18','54','108','216','432','3,024']);
      assert.match(await page.locator('.live-line').innerText(),/Blocks completed in the last certified hour/);
      assert.equal(await page.getByRole('button',{name:'Retry wheel stats'}).count(),0);
      await context.close();
    }
  });
  await test('First phone screen shows a complete hamster question and its answer buttons', async () => {
    resetFixtures();
    for (const width of [390, 320]) {
      const {page,context}=await fixturePage({width,height:844},true);
      await page.locator('.window-grid dd').first().waitFor({timeout:20000});
      await page.waitForTimeout(600);
      const actions=await page.locator('.hero-actions > *').evaluateAll(els=>els.map(e=>Math.round(e.getBoundingClientRect().top)));
      assert.equal(new Set(actions).size, 1, `hero actions share one row at ${width}`);
      await assertTextFits(page.locator('.hero-actions > *'));
      const first=page.locator('#hamster .hamster-card').first();
      const box=await first.locator('.call-options').evaluate(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom};});
      const title=await first.locator('h3').evaluate(el=>el.getBoundingClientRect().top);
      console.log(`  ${width}: first answer row ${box.top.toFixed(1)}-${box.bottom.toFixed(1)}`);
      if (width===390) { assert.ok(title>=0 && box.bottom<=844, `first hamster answer row ends at ${box.bottom}`); await page.screenshot({path:`${shots}/first-screen-390.png`}); }
      await noOverflow(page); await context.close();
    }
  });
  await test('Record attempt stays unknown while weekly history is unavailable', async () => {
    resetFixtures(); historyMode='partial'; markets[1].threshold=100n; // no open line reaches the record
    const {page,context}=await fixturePage({width:390,height:844});
    await page.locator('#wheel').getByRole('button',{name:'Retry wheel stats'}).waitFor({timeout:30000});
    const record=page.locator('.chain-card').filter({hasText:'Record attempt'});
    assert.match(await record.locator('h3').innerText(), /^Record attempt: weekly best unavailable$/);
    assert.ok(await record.getByRole('button',{name:'Open this market'}).isDisabled());
    assert.ok(await record.getByRole('button',{name:'Retry wheel stats'}).isVisible());
    // Other on-chain lines stay usable.
    assert.ok(await page.locator('.chain-card').filter({hasText:'Will the hamster complete a block in the next 24 hours?'}).getByRole('button',{name:'Open this market'}).isEnabled());
    historyMode='complete'; await record.getByRole('button',{name:'Retry wheel stats'}).click();
    await record.getByRole('heading',{name:'Record attempt: beat this week’s best day of 432 blocks'}).waitFor({timeout:30000});
    await record.getByRole('button',{name:'Open this market'}).click();
    const d=page.getByRole('dialog',{name:'Create a market'}); await d.waitFor();
    assert.equal(await d.getByLabel('Line: more than this many Squeek blocks').inputValue(), '432');
    assert.equal(transactions.length,0); await context.close();
  });
  await test('Known pre-genesis history stays zero without masking missing certified endpoints', async () => {
    resetFixtures(); settledRound=180n;
    const {page,context}=await fixturePage();
    await page.locator('.window-grid dd').first().waitFor();
    assert.deepEqual(await page.locator('.window-grid dd').allTextContents(), ['18','54','108','216','432','540']);
    assert.equal(await page.getByRole('button',{name:'Retry wheel stats'}).count(),0);
    await context.close();
  });
  await test('Partial-block work and threshold-zero wagers use block-completion wording', async () => {
    resetFixtures(); historyMode='fractional'; markets[1].threshold=0n; markets[2].threshold=0n;
    markets[4]={...markets[4],threshold:0n,yesWins:false,startBlockUnits:100000000n,endBlockUnits:500000000n};
    const {page,context}=await fixturePage({width:390,height:844});
    await page.locator('.window-grid dd').first().waitFor();
    const card=page.locator('article.market-card').filter({hasText:'#1'});
    assert.equal(await card.locator('.question-button').innerText(),'Will the hamster complete a block in this 24-hour window?');
    assert.deepEqual(await card.locator('.odds-side').allTextContents(),['At least one block','No blocks']);
    assert.match(await page.locator('article.market-card').filter({hasText:'#2'}).innerText(),/complete a block in this 7-day window/);
    assert.match(await page.locator('article.market-card').filter({hasText:'#4'}).innerText(),/No blocks won with 0 blocks/);
    assert.deepEqual(await page.locator('.window-grid dd').allTextContents(),['0','0','0','0','0','0']);
    assert.equal(await page.locator('.pulse strong').innerText(),'No blocks in last certified hour');
    assert.match(await page.locator('.live-line').innerText(),/No blocks completed in the last certified hour/);
    assert.match(await page.locator('.fact-list').innerText(),/Rounds with blocks, 24h\s+0 of 144/);
    assert.match(await page.locator('.wheel-panel').innerText(),/does not measure continuous running/);
    assert.doesNotMatch(await page.locator('.wheel-panel').innerText(),/Resting|Active rounds|Longest run/);
    await card.locator('.odds-no').click(); const slip=page.getByRole('dialog',{name:'Bet slip'});
    assert.ok(await slip.getByRole('radio',{name:/No blocks/}).isChecked()); await assertNoScroll(slip);
    await page.keyboard.press('Escape');
    // The hamster catalog's 24-hour wake-up line lists open market #1 with block-completion sides.
    const wake=page.locator('.chain-card').filter({hasText:'Market #1'}).filter({hasText:'at least one block in 24 hours'});
    assert.deepEqual(await wake.locator('.odds-side').allTextContents(),['At least one block','No blocks']);
    await page.getByRole('button',{name:'Set your own line'}).click();
    const create=page.getByRole('dialog',{name:'Create a market'});
    await create.getByLabel('Line: more than this many Squeek blocks').fill('0');
    assert.match(await create.locator('#line-help').innerText(),/At least one block or No blocks/);
    await page.keyboard.press('Escape');
    await page.locator('.wheel-panel').screenshot({path:`${shots}/partial-block-stats.png`});
    await noOverflow(page); await context.close();
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
