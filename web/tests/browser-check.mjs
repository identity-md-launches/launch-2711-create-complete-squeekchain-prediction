/* Browser-only fixtures. No signing keys, broadcasts, or sample data in the shipped app.
 * All RPC and wallet actions are mocked; nothing is sent to a real chain.
 * Serves the production export at /preview/ for the lifetime of this process. */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
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
const pageErrors = [];
const resourceErrors = [];
let activeContexts = [];
const engine = process.env.ENGINE === 'webkit' ? webkit : chromium;
const browser = await engine.launch({headless:true,args:['--no-sandbox']});
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
async function fixturePage(viewport={width:1440,height:1000}, mobile=false, waitForCards=true) {
  const context=await browser.newContext({viewport,...(mobile?{isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'}:{})});
  activeContexts.push(context);
  const page=await context.newPage();
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('response', response => { if(response.url().startsWith(url) && response.status()>=400) resourceErrors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
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
  if (waitForCards) await page.locator('article.market-card').first().waitFor({timeout:20000});
  return {page,context};
}
async function test(name,fn) {if(process.env.ONLY && !name.includes(process.env.ONLY))return;try{await fn();results.push({name,passed:true});console.log('PASS',name);}catch(e){results.push({name,passed:false,error:e.message});console.error('FAIL',name,e.stack);}finally{await Promise.allSettled(activeContexts.map(c=>c.close()));activeContexts=[];}}
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
async function measureColors(page) {
  return page.evaluate(()=>{
    const selectors=['.question-button','.card-foot','.odds-yes .odds-price','.odds-no .odds-price','.wallet-button','.chip.active'];
    const luminance=rgb=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    return selectors.map(selector=>{
      const el=document.querySelector(selector);const foreground=getComputedStyle(el).color;let node=el;let background;
      while(node){background=getComputedStyle(node).backgroundColor;if(background!=='rgba(0, 0, 0, 0)')break;node=node.parentElement;}
      const rgb=color=>color.match(/[\d.]+/g).slice(0,3).map(Number);
      const a=luminance(rgb(foreground));const b=luminance(rgb(background));
      return {selector,foreground,background,ratio:Number(((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toFixed(2))};
    });
  });
}

const cardNumber = (page, id) => page.locator('article.market-card').filter({has:page.locator('.card-foot > span:last-child').filter({hasText:new RegExp(`^#${id}$`)})});
const slipOf = page => page.getByRole('dialog',{name:'Bet slip'});
const connectWallet = async page => { await page.getByRole('button',{name:/Test Browser Wallet/}).click(); await page.getByRole('button',{name:/0x1234…7890/}).waitFor(); };
try {
  await test('Open binary markets, pool odds and local assets render without page errors', async () => {
    resetFixtures(); const {page,context}=await fixturePage();
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    assert.equal(await page.locator('article.market-card').count(),2);
    const card=cardNumber(page,1);
    assert.match(await card.innerText(),/Will the hamster complete more than 1,000 blocks in 24 hours\?/);
    assert.deepEqual(await card.locator('.odds-price').allTextContents(),['60%','40%']);
    assert.match(await card.innerText(),/Volume\s+0.02 ETH/);
    assert.equal(await page.locator('.community-markets,.hamster-markets').count(),0);
    assert.equal(await page.locator('meta[property="og:title"]').count(),1);
    for(const selector of ['link[rel="icon"]','meta[property="og:image"]']) {
      const element=page.locator(selector); const asset=await element.getAttribute(selector.startsWith('link')?'href':'content');
      assert.ok(asset.startsWith('./')); const response=await page.request.get(new URL(asset,url).href); assert.ok(response.ok());
    }
    assert.deepEqual(errors,[]); await noOverflow(page);
    await page.screenshot({path:`${shots}/markets-1440.png`,animations:'disabled'});
    await context.close();
  });
  await test('Responsive board at 320, 390, 800, 980 and 1440; side buttons visible on first 390 screen', async () => {
    resetFixtures();
    for(const width of [320,390,800,980,1440]) {
      const {page,context}=await fixturePage({width,height:844});
      await noOverflow(page); await assertTextFits(page.locator('.odds'));
      for(const element of await page.locator('.odds').all()) {const r=await element.boundingBox();assert.ok(r.height>=44);}
      if(width===390) {const r=await page.locator('.odds-no').first().boundingBox();assert.ok(r.y+r.height<=844,`main action ends at ${r.y+r.height}`);}
      await page.screenshot({path:`${shots}/markets-${width}.png`,animations:'disabled'});
      await context.close();
    }
  });
  await test('Status, duration, search, sort and clear filters change the board', async () => {
    resetFixtures(); const {page,context}=await fixturePage();
    await page.getByRole('button',{name:'In progress',exact:true}).click(); assert.equal(await page.locator('article.market-card').count(),3);
    await page.getByRole('button',{name:'Settled',exact:true}).click(); assert.equal(await page.locator('article.market-card').count(),1);
    await page.getByRole('button',{name:'All markets',exact:true}).click(); assert.equal(await page.locator('article.market-card').count(),6);
    await page.getByLabel('Window length').selectOption('604800'); assert.equal(await page.locator('article.market-card').count(),1);
    await page.getByLabel('Window length').selectOption('all');
    await page.getByLabel('Sort markets').selectOption('newest'); assert.match(await page.locator('.card-foot').first().innerText(),/#6/);
    await page.getByLabel('Search markets').fill('missing question'); await page.getByRole('heading',{name:'No markets match this view'}).waitFor();
    await page.getByRole('button',{name:'Show all markets'}).click(); assert.equal(await page.locator('article.market-card').count(),6);
    await page.getByLabel('Search markets').fill('10,000'); assert.equal(await page.locator('article.market-card').count(),1);
    await context.close();
  });
  await test('Stake validation, quick amounts and payout rules are usable before connecting', async () => {
    resetFixtures(); const {page,context}=await fixturePage({width:390,height:844});
    await cardNumber(page,1).locator('.odds-no').click(); const slip=slipOf(page);
    assert.equal(Math.round((await slip.boundingBox()).width),390,'phone sheet spans the viewport');
    assert.ok(await slip.getByRole('radio',{name:/No/}).isChecked());
    await slip.getByLabel(/Your stake/).fill('0.00001'); await slip.getByRole('button',{name:'Connect to place bet'}).click();
    await slip.getByText('Enter at least 0.0001 test ETH.').waitFor(); assert.equal(await slip.getByLabel(/Your stake/).getAttribute('aria-invalid'),'true');
    await slip.getByRole('button',{name:'0.005 ETH',exact:true}).click(); assert.equal(await slip.getByLabel(/Your stake/).inputValue(),'0.005');
    assert.match(await slip.locator('.estimate').innerText(),/Estimated payout if No wins/);
    await slip.getByText('Market rules & details').click(); await slip.getByText(/Exactly 1,000 settles as No/).waitFor();
    await noOverflow(page); await page.screenshot({path:`${shots}/bet-slip-390.png`,animations:'disabled'}); await context.close();
  });
  await test('Connect preserves side and stake; rejection can retry and sends correct bet calldata', async () => {
    resetFixtures(); const {page,context}=await fixturePage({width:390,height:844});
    await cardNumber(page,1).locator('.odds-no').click(); const slip=slipOf(page);
    await slip.getByLabel(/Your stake/).fill('0.0067'); await slip.getByRole('button',{name:'Connect to place bet'}).click();
    await page.getByRole('dialog',{name:'Connect a wallet'}).waitFor(); await page.keyboard.press('Escape');
    assert.ok(await slip.isVisible()); assert.equal(await slip.getByLabel(/Your stake/).inputValue(),'0.0067');
    await slip.getByRole('button',{name:'Connect to place bet'}).click(); await connectWallet(page);
    assert.equal(await slip.getByLabel(/Your stake/).inputValue(),'0.0067'); assert.ok(await slip.getByRole('radio',{name:/No/}).isChecked());
    await page.evaluate(()=>window.rejectNext=true); await slip.getByRole('button',{name:'Bet No',exact:true}).click();
    await slip.getByText('Request declined in your wallet. You can try again.').waitFor(); assert.equal(transactions.length,0);
    await slip.getByRole('button',{name:'Bet No',exact:true}).click(); await slip.getByText('Your No bet is confirmed.').waitFor();
    assert.deepEqual(transactions.map(t=>[t.functionName,...t.args]),[['bet','1','false']]); assert.equal(BigInt(transactions[0].value),parseEther('0.0067'));
    assert.equal(transactions[0].to.toLowerCase(),proof.address.toLowerCase()); await slip.getByRole('button',{name:'Done',exact:true}).click();
    await cardNumber(page,1).getByText('0.0267 ETH',{exact:true}).waitFor(); await context.close();
  });
  await test('Empty pools begin at 50/50 and percentages update after confirmed Yes and No bets', async () => {
    resetFixtures(); markets[1].yesPool=0n;markets[1].noPool=0n;
    const {page,context}=await fixturePage(); const card=cardNumber(page,1);const slip=slipOf(page);
    assert.deepEqual(await card.locator('.odds-price').allTextContents(),['50%','50%']);
    await card.locator('.odds-yes').click(); await slip.getByRole('button',{name:'Connect to place bet'}).click(); await connectWallet(page);
    await slip.getByRole('button',{name:'Bet Yes',exact:true}).click();await slip.getByText('Your Yes bet is confirmed.').waitFor();await slip.getByRole('button',{name:'Done',exact:true}).click();
    await card.locator('.odds-yes .odds-price').filter({hasText:/^100%$/}).waitFor();assert.deepEqual(await card.locator('.odds-price').allTextContents(),['100%','0%']);
    await card.locator('.odds-no').click();await slip.getByRole('button',{name:'Bet No',exact:true}).click();await slip.getByText('Your No bet is confirmed.').waitFor();await slip.getByRole('button',{name:'Done',exact:true}).click();
    await card.locator('.odds-yes .odds-price').filter({hasText:/^50%$/}).waitFor();await card.locator('.card-foot').getByText('0.002 ETH',{exact:true}).waitFor();assert.deepEqual(await card.locator('.odds-price').allTextContents(),['50%','50%']); await context.close();
  });
  await test('Creation draft and chosen duration survive connection; creation sends exact target', async () => {
    resetFixtures(); const {page,context}=await fixturePage();
    await page.getByRole('button',{name:/Weekly block total/}).click(); const dialog=page.getByRole('dialog',{name:'Create a market'});
    assert.ok(await dialog.getByRole('radio',{name:'7 days',exact:true}).isChecked());
    assert.equal(await dialog.getByLabel('Block target').inputValue(),'');
    await dialog.getByRole('button',{name:'Connect to create market'}).click();await dialog.getByText('Enter a whole block count from 0 to 18446744073709551615.').waitFor();
    await dialog.getByLabel('Block target').fill('777');await dialog.getByRole('button',{name:'Connect to create market'}).click();await connectWallet(page);
    assert.equal(await dialog.getByLabel('Block target').inputValue(),'777');await dialog.getByRole('button',{name:'Create market',exact:true}).click();await dialog.getByText(/Your market is live/).waitFor();
    assert.deepEqual(transactions[0].args.filter((_,i)=>i!==1),['777','604800']);assert.ok(BigInt(transactions[0].args[1])>0n);await context.close();
  });
  await test('My positions shows stakes, claimable payouts and successful claims', async () => {
    resetFixtures();const {page,context}=await fixturePage();await page.locator('.wallet-button').click();await connectWallet(page);
    await page.locator('.main-nav').getByRole('link',{name:/My positions/}).click();await page.getByRole('heading',{name:'My positions',exact:true}).first().waitFor();
    assert.equal(await page.evaluate(()=>document.activeElement.id),'main');assert.equal(await page.evaluate(()=>scrollY),0);
    await page.locator('.claim-row').getByRole('button',{name:'Claim',exact:true}).click();await page.locator('.transaction-notice').getByText('Winnings from market #4 claimed.').waitFor();
    assert.deepEqual(transactions[0].args,['4',getAddress(ACCOUNT)]);await page.locator('.claim-row').waitFor({state:'detached'});
    assert.equal(await page.locator('article.market-card').count(),3);
    await page.screenshot({path:`${shots}/positions-1440.png`,animations:'disabled'});await context.close();
  });
  await test('Resolve certified results and open unmatched refunds through market details', async () => {
    resetFixtures();const {page,context}=await fixturePage();await page.locator('.wallet-button').click();await connectWallet(page);
    await page.getByRole('button',{name:'In progress',exact:true}).click();
    await cardNumber(page,6).getByRole('button',{name:'Resolve market'}).click();let dialog=page.getByRole('dialog',{name:'Market details'});
    await dialog.getByRole('button',{name:'Resolve market',exact:true}).click();await dialog.getByText('Market resolved. Winning positions can now claim.').waitFor();await page.keyboard.press('Escape');
    assert.equal(transactions[0].functionName,'resolve');assert.equal(transactions[0].args[0],'6');
    await cardNumber(page,5).getByRole('button',{name:'Open refunds'}).click();await dialog.getByRole('button',{name:'Open refunds',exact:true}).click();await dialog.getByText('Refunds are open. You can now claim your stake.').waitFor();
    assert.equal(transactions[1].functionName,'cancelUnmatched');assert.equal(transactions[1].args[0],'5');await context.close();
  });
  await test('Disconnected positions offer connect; navigation and market help work', async () => {
    resetFixtures();const {page,context}=await fixturePage({width:390,height:844});
    await page.locator('.main-nav').getByRole('link',{name:'My positions',exact:true}).click();await page.getByRole('heading',{name:'Your positions, all in one place'}).waitFor();
    await page.locator('.positions-empty').getByRole('button',{name:'Connect wallet'}).click();await page.getByRole('dialog',{name:'Connect a wallet'}).waitFor();await page.keyboard.press('Escape');
    await page.locator('.skip-link').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('h1').innerText(),'My positions');
    await page.locator('.main-nav').getByRole('link',{name:'Markets',exact:true}).click();await page.locator('.guide-panel').getByRole('button',{name:'How it works'}).click();
    await page.getByRole('dialog',{name:'How Squeek Predict works'}).waitFor();await page.keyboard.press('Escape');await noOverflow(page);await context.close();
  });
  await test('Wrong network blocks betting, switch recovers and account changes close the slip', async () => {
    resetFixtures();const {page,context}=await fixturePage();await page.locator('.wallet-button').click();await connectWallet(page);
    await page.evaluate(()=>window.setTestChain('0x1'));await cardNumber(page,1).locator('.odds-yes').click();const slip=slipOf(page);
    assert.ok(await slip.getByRole('button',{name:'Switch to Sepolia in the header'}).isDisabled());await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Switch to Sepolia',exact:true}).click();await page.getByRole('button',{name:/0x1234…7890/}).waitFor();
    await cardNumber(page,1).locator('.odds-yes').click();assert.ok(await slip.getByRole('button',{name:'Bet Yes',exact:true}).isEnabled());
    await page.evaluate(()=>window.setTestAccount('0x2234567890123456789012345678901234567890'));await slip.waitFor({state:'hidden'});assert.equal(transactions.length,0);await context.close();
  });
  await test('Phone wallet picker has all four wallet browsers and Coinbase Smart Wallet', async () => {
    resetFixtures();const {page,context}=await fixturePage({width:390,height:844},true);await page.locator('.wallet-button').click();
    for(const name of ['MetaMask','Coinbase Wallet','Rabby','Phantom']) await page.getByRole('link',{name:`Open in ${name}`}).waitFor();
    await page.getByRole('button',{name:'Coinbase Smart Wallet'}).waitFor();assert.equal(await page.getByRole('button',{name:'Injected',exact:true}).count(),0);
    await noOverflow(page);await page.screenshot({path:`${shots}/wallet-390.png`,animations:'disabled'});await context.close();
  });
  await test('Keyboard entry, focus ring, modal inert background and focus return', async () => {
    resetFixtures();const {page,context}=await fixturePage({width:390,height:844});const trigger=cardNumber(page,1).locator('.odds-yes');
    await trigger.focus();await page.keyboard.press('Enter');const slip=slipOf(page);await slip.waitFor();await page.keyboard.press('Tab');
    assert.ok(await slip.evaluate(el=>el.contains(document.activeElement)));const ring=await page.evaluate(()=>({outline:getComputedStyle(document.activeElement).outlineStyle,ancestor:getComputedStyle(document.activeElement.closest('label')??document.activeElement).outlineStyle}));assert.ok(ring.outline==='solid'||ring.ancestor==='solid');
    await page.screenshot({path:`${shots}/focus-390.png`,animations:'disabled'});
    for(let i=0;i<22;i++){await page.keyboard.press('Tab');assert.ok(await slip.evaluate(el=>el.contains(document.activeElement)||document.activeElement===document.body));}
    await trigger.focus();assert.ok(!await trigger.evaluate(el=>el===document.activeElement));await page.keyboard.press('Escape');assert.ok(await trigger.evaluate(el=>el===document.activeElement));await context.close();
  });
  await test('Zero markets renders an honest, actionable first screen at 320, 390 and 1440', async () => {
    resetFixtures();markets={};positions={};
    for(const width of [320,390,1440]) {const {page,context}=await fixturePage({width,height:844},false,false);await page.getByRole('heading',{name:'The next market starts with you'}).waitFor();
      assert.equal(await page.locator('article.market-card').count(),0);const r=await page.locator('.empty').getByRole('button',{name:'Create market'}).boundingBox();assert.ok(r.y+r.height<=844,`create action ends at ${r.y+r.height}`);
      await noOverflow(page);await page.screenshot({path:`${shots}/empty-${width}.png`,animations:'disabled'});await context.close();}
  });
  await test('RPC outage has Retry and recovers; runtime mismatch fails closed', async () => {
    resetFixtures();rpcMode='fail';const {page,context}=await fixturePage({width:390,height:844},false,false);
    await page.getByText('Couldn’t load fresh market data').waitFor({timeout:30000});await noOverflow(page);
    rpcMode='ok';await page.getByRole('button',{name:'Retry',exact:true}).click();await page.locator('article.market-card').first().waitFor();
    rpcMode='mismatch';await page.getByRole('button',{name:'Refresh markets'}).click();await page.getByText('Couldn’t load fresh market data').waitFor({timeout:30000});
    await cardNumber(page,1).locator('.odds-yes').click();await slipOf(page).getByText('Fresh verified chain data is unavailable. Close this window and retry the connection.').waitFor();assert.equal(transactions.length,0);await context.close();
  });
  await test('Long uint64 questions fit cards and slips without clipping', async () => {
    resetFixtures();markets[1].threshold=(1n<<64n)-1n;const {page,context}=await fixturePage({width:320,height:844});
    await noOverflow(page);await assertTextFits(cardNumber(page,1).locator('.question-button,.odds'));
    await cardNumber(page,1).locator('.odds-yes').click();await noOverflow(page);await assertTextFits(slipOf(page).locator('.dialog-question'));await context.close();
  });
  await test('Older-market lookup validates input and locates a market; load older reads more', async () => {
    resetFixtures();for(let id=7;id<=32;id++)markets[id]={...base,threshold:BigInt(id)};
    const {page,context}=await fixturePage();await page.getByRole('button',{name:'Load older markets'}).click();await cardNumber(page,1).waitFor();
    await page.getByText('Find an older market by number').click();await page.getByRole('button',{name:'Find market',exact:true}).click();await page.getByText('Enter a market number from 1 to 32.').waitFor();
    await page.getByLabel('Market number',{exact:true}).fill('2');await page.getByRole('button',{name:'Find market',exact:true}).click();await cardNumber(page,2).waitFor();await context.close();
  });
  await test('Axe WCAG scans and measured rendered contrast on board and bet slip', async () => {
    resetFixtures();const {page,context}=await fixturePage({width:390,height:844});
    let scan=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();assert.deepEqual(scan.violations,[]);
    const colors=await measureColors(page);await writeFile(`${shots}/contrast.json`,JSON.stringify(colors,null,2));for(const pair of colors)assert.ok(pair.ratio>=4.5,`${pair.selector}: ${pair.ratio}`);
    await cardNumber(page,1).locator('.odds-yes').click();scan=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();assert.deepEqual(scan.violations,[]);await context.close();
  });
  await test('No uncaught JavaScript errors or missing local resources across interaction scenarios', async () => {assert.deepEqual(pageErrors,[]);assert.deepEqual(resourceErrors,[]);});
} finally {
  await browser.close();server.close();await writeFile(`${shots}/results.json`,JSON.stringify(results,null,2));const failed=results.filter(r=>!r.passed);console.log(`${results.length-failed.length}/${results.length} passed`);if(failed.length)process.exitCode=1;
}
