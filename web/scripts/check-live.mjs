/* Inspect the static export using real, read-only public RPC responses.
 * curl is only a transport bridge for restricted browser networks; no values are fabricated. */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { request } from './observe-chain.mjs';
process.chdir(fileURLToPath(new URL('../../', import.meta.url)));
const root=resolve('dist');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(!path.startsWith('/preview/')||path.includes('..')){res.writeHead(404).end();return;}
  try{const name=path.slice(9)||'index.html';res.writeHead(200,{'content-type':mime[extname(name)]??'application/octet-stream'}).end(await readFile(resolve(root,name)));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/preview/`;
const out='test/scratch/live';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const results=[];let rpcCalls=0;
try {
  for(const width of [320,390,800,1440]){
    const context=await browser.newContext({viewport:{width,height:844}});const page=await context.newPage();const errors=[];const missing=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(url)&&r.status()>=400)missing.push(r.status());});
    await context.route(/ethereum-sepolia-rpc\.publicnode\.com|rpc\.sepolia\.ethpandaops\.io|sepolia\.rpc\.sentio\.xyz/,async route=>{
      const payload=route.request().postDataJSON();const handle=async q=>{rpcCalls++;try{return{jsonrpc:'2.0',id:q.id,result:await request(q)}}catch(e){return{jsonrpc:'2.0',id:q.id,error:{code:-32000,message:e.message}}}};
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(Array.isArray(payload)?await Promise.all(payload.map(handle)):await handle(payload))});
    });
    await page.goto(url);await page.getByText('Auto-refresh · 30s').waitFor({state:'attached',timeout:60000});await page.evaluate(()=>document.fonts.ready);
    const isEmpty=await page.getByRole('heading',{name:'The next market starts with you'}).isVisible();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false);
    assert.equal(await page.evaluate(()=>document.fonts.check('500 16px Inter')),true);
    assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
    await page.screenshot({path:`${out}/live-${width}.png`,animations:'disabled'});
    if(width===390){await page.locator('.empty').getByRole('button',{name:'Create market'}).click();const form=page.getByRole('dialog',{name:'Create a market'});await form.waitFor();
      await form.getByLabel('Block target').fill('100');assert.match(await form.locator('.creation-preview').innerText(),/Betting closes when the window starts/);assert.equal(await form.locator('.creation-preview').getByText('Window preview unavailable').count(),0);
      await page.screenshot({path:`${out}/live-creation-390.png`,animations:'disabled'});await page.keyboard.press('Escape');}
    results.push({width,productionSubpath:true,liveRpc:true,emptyMarketBoard:isEmpty,interFontLoaded:true,pageErrors:errors,missingLocalResources:missing,horizontalOverflow:false});await context.close();
  }
  await writeFile(`${out}/results.json`,JSON.stringify({results,rpcCalls,transactionsSent:0},null,2));console.log(JSON.stringify({results,rpcCalls,transactionsSent:0},null,2));
} finally {await browser.close();server.close();}
