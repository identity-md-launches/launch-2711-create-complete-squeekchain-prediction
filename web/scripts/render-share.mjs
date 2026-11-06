/* Rebuild the social PNG from the committed SVG and local Inter font. */
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
const font = (
  await readFile(
    new URL("../public/fonts/InterVariable.woff2", import.meta.url),
  )
).toString("base64");
const svg = await readFile(
  new URL("../public/share.svg", import.meta.url),
  "utf8",
);
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<style>@font-face{font-family:Inter;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900}body{margin:0}svg{display:block}</style>${svg}`,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: new URL("../public/share.png", import.meta.url).pathname,
  });
  console.log("Rendered social card at 1200 × 630.");
} finally {
  await browser.close();
}
