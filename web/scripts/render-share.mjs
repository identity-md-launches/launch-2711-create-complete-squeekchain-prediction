/* Render the site's social card from local type and brand assets. */
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const asset=path=>new URL(`../public/${path}`,import.meta.url);
const font=(await readFile(asset('fonts/InterVariable.woff2'))).toString('base64');
const icon=(await readFile(asset('favicon.svg'))).toString('base64');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try {
  const page=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
    @font-face{font-family:Inter;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900}
    *{box-sizing:border-box}body{margin:0;background:#0c0e14;color:#eff1f7;font-family:Inter,sans-serif;padding:64px 72px;width:1200px;height:630px}
    header{display:flex;align-items:center;gap:16px;font-size:30px;font-weight:600;letter-spacing:-1px}header img{width:48px;height:48px}header span{color:#a0a7b8}
    main{display:flex;align-items:center;justify-content:space-between;gap:60px;margin-top:68px}h1{font-size:60px;line-height:1.15;font-weight:600;letter-spacing:-2.5px;margin:0}p{font-size:21px;line-height:1.5;color:#a0a7b8;margin:24px 0 0;max-width:600px}
    .outcomes{width:310px;flex-shrink:0;background:#141720;border:1px solid #2b3040;border-radius:20px;padding:28px}.question{font-size:21px;line-height:1.5;font-weight:500;margin-bottom:28px}.row{display:flex;gap:12px}.row span{display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:600;flex:1;padding:18px;border-radius:10px}.yes{color:#5ad8aa;background:#12362e}.no{color:#f49aaf;background:#3d222e}.bar{height:4px;background:#f49aaf;margin-top:24px;border-radius:4px}.bar:before{content:'';display:block;width:50%;height:4px;background:#5ad8aa;border-radius:4px}
    footer{display:flex;align-items:center;gap:10px;margin-top:60px;font-size:17px;color:#a0a7b8}.dot{width:7px;height:7px;background:#5ad8aa;border-radius:50%}
    </style></head><body><header><img src="data:image/svg+xml;base64,${icon}" alt="">Squeek <span>Predict</span></header><main><div><h1>Take a side.<br>Let the blocks decide.</h1><p>On-chain prediction markets for Squeekchain.</p></div><div class="outcomes"><div class="question">Two outcomes.<br>One settled result.</div><div class="row"><span class="yes">Yes</span><span class="no">No</span></div><div class="bar"></div></div></main><footer><span class="dot"></span>Sepolia testnet · Test ETH only</footer></body></html>`);
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:new URL('../public/share.png',import.meta.url).pathname});
  console.log('Rendered web/public/share.png at 1200 × 630.');
} finally {await browser.close();}
