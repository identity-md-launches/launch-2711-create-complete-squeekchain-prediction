/* Real browser validation of the committed export at a gateway-like subpath.
 * RPC/wallet fixtures only: never signs or sends to a real network. */
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { chromium, webkit, firefox } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { parseEther } from "viem";
import {
  fixture,
  resetFixtures,
  rpc,
  ACCOUNT,
  installWallet,
  recordTransaction,
} from "./fixtures.mjs";
process.chdir(fileURLToPath(new URL("../../", import.meta.url)));
const root = resolve("dist");
const shots = process.env.SHOTS_DIR ?? "test/scratch/browser-results";
await mkdir(shots, { recursive: true });
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(
    new URL(req.url, "http://localhost").pathname,
  );
  if (!path.startsWith("/preview/")) {
    res.writeHead(404).end();
    return;
  }
  const local = path.slice(9) || "index.html";
  if (local.includes("..")) {
    res.writeHead(403).end();
    return;
  }
  try {
    const data = await readFile(resolve(root, local));
    res
      .writeHead(200, {
        "content-type": mime[extname(local)] ?? "application/octet-stream",
      })
      .end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/preview/`;
const results = [];
const pageErrors = [];
const missingAssets = [];
let browser;
let contexts = [];
const engineName = process.env.ENGINE ?? "chromium";
async function page(width = 1440, populated = false, mobile = false) {
  resetFixtures(populated);
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    ...(mobile
      ? {
          hasTouch: true,
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
        }
      : {}),
  });
  contexts.push(context);
  const p = await context.newPage();
  p.on("pageerror", (e) => pageErrors.push(e.message));
  p.on("response", (r) => {
    if (r.url().startsWith(url) && r.status() >= 400)
      missingAssets.push(new URL(r.url()).pathname);
  });
  await context.route(
    /ethereum-sepolia-rpc\.publicnode\.com|rpc\.sepolia\.ethpandaops\.io|sepolia\.rpc\.sentio\.xyz/,
    async (route) => {
      try {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(rpc(route.request().postDataJSON())),
        });
      } catch {
        await route.fulfill({ status: 503, body: "offline" });
      }
    },
  );
  if (!mobile) {
    await p.exposeFunction("recordTransaction", recordTransaction);
    await p.addInitScript({
      content: `(${installWallet.toString()})(window,${JSON.stringify(ACCOUNT)},tx=>window.recordTransaction(tx));`,
    });
  }
  await p.goto(url);
  await p.locator(".market-card").nth(11).waitFor();
  await p
    .locator(".chain-status")
    .getByText(/Sepolia connected/)
    .waitFor();
  await p.evaluate(() => document.fonts.ready);
  return p;
}
const noOverflow = async (p) =>
  assert.ok(
    await p.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
    "no horizontal document overflow",
  );
const connect = async (p) => {
  await p.locator(".wallet-button").click();
  await p.getByRole("button", { name: "Test Browser Wallet" }).click();
  await p.locator(".wallet-button").filter({ hasText: "0x1234" }).waitFor();
};
const chainCard = (p, id) =>
  p
    .locator("article.market-card")
    .filter({
      has: p
        .locator(".card-bottom")
        .getByText(`Market #${id}`, { exact: true }),
    });
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log("PASS", name);
  } catch (e) {
    results.push({ name, passed: false, error: e.message });
    console.error("FAIL", name, e.message);
  } finally {
    for (const context of contexts) await context.close();
    contexts = [];
  }
}
try {
  browser = await { chromium, webkit, firefox }[engineName].launch({
    headless: true,
    ...(engineName === "chromium" ? { args: ["--no-sandbox"] } : {}),
  });
  await test("Twelve cards, relative assets, metadata and product/action on the first 390 screen", async () => {
    for (const width of [320, 390, 800, 980, 1440]) {
      const p = await page(width);
      assert.equal(await p.locator(".market-card").count(), 12);
      assert.equal(
        await p
          .getByRole("button", { name: /Create market|Open this market/ })
          .count(),
        0,
      );
      await noOverflow(p);
      assert.ok(await p.evaluate(() => document.fonts.check("16px Inter")));
      for (const side of [".odds-yes", ".odds-no"]) {
        const r = await p.locator(side).first().boundingBox();
        assert.ok(r.height >= 44);
        if (width === 390)
          assert.ok(r.y + r.height <= 844, `${side} bottom ${r.y + r.height}`);
      }
      for (const selector of [
        'link[rel="icon"]',
        'meta[property="og:image"]',
      ]) {
        const ref = await p
          .locator(selector)
          .getAttribute(selector.startsWith("link") ? "href" : "content");
        assert.ok(ref.startsWith("./"));
        assert.ok((await p.request.get(new URL(ref, url).href)).ok());
      }
      await p.screenshot({
        path: `${shots}/markets-${width}.png`,
        animations: "disabled",
      });
    }
  });
  await test("Category/search/type/sort filters and empty recovery", async () => {
    const p = await page();
    await p.getByRole("button", { name: "Weekly blocks", exact: true }).click();
    assert.equal(await p.locator(".market-card").count(), 3);
    await p.getByRole("button", { name: "All markets", exact: true }).click();
    await p.getByRole("searchbox", { name: "Search markets" }).fill("10,000");
    assert.equal(await p.locator(".market-card").count(), 1);
    await p.getByRole("searchbox").fill("missing");
    await p.getByRole("heading", { name: "No matching markets" }).waitFor();
    await p.getByRole("button", { name: "Show all markets" }).click();
    await p.getByLabel("Market type").selectOption("chain");
    await p
      .getByRole("heading", { name: "No open on-chain markets yet" })
      .waitFor();
    await p.getByRole("button", { name: "Show all markets" }).click();
    await p.getByLabel("Sort markets").selectOption("closing");
    assert.equal(await p.locator(".market-card").count(), 12);
  });
  await test("No bet preserves draft through wallet connection and persists in My Positions", async () => {
    const p = await page(390);
    await p.locator(".odds-no").first().click();
    const slip = p.locator(".practice-slip");
    await slip.getByRole("button", { name: "0.005 ETH", exact: true }).click();
    await slip
      .getByRole("button", { name: "Connect wallet to predict" })
      .click();
    await p.getByRole("button", { name: "Test Browser Wallet" }).click();
    assert.equal(await slip.locator("#practice-stake").inputValue(), "0.005");
    assert.ok(await slip.locator(".selected-no input").isChecked());
    await slip.getByRole("button", { name: "Place No prediction" }).click();
    await slip.getByText("You’re backing No").waitFor();
    assert.equal(fixture.transactions.length, 0);
    await p.screenshot({
      path: `${shots}/practice-success-390.png`,
      animations: "disabled",
    });
    await slip.getByRole("link", { name: "View my positions" }).click();
    await p.locator(".position-row").getByText("No · 0.005 ETH").waitFor();
    await p.reload();
    await p.locator(".position-row").getByText("No · 0.005 ETH").waitFor();
    await noOverflow(p);
    await p.screenshot({
      path: `${shots}/positions-390.png`,
      animations: "disabled",
    });
  });
  await test("Invalid practice amounts remain editable and cannot submit", async () => {
    const p = await page(390);
    await p.locator(".odds-yes").first().click();
    const slip = p.locator(".practice-slip");
    await slip.locator("#practice-stake").fill("0.00001");
    await slip
      .getByRole("button", { name: "Connect wallet to predict" })
      .click();
    await slip.getByText("Enter at least 0.0001 practice ETH.").waitFor();
    assert.equal(await p.locator(".wallet-modal").count(), 0);
    assert.equal(
      await slip.locator("#practice-stake").getAttribute("aria-invalid"),
      "true",
    );
    await noOverflow(p);
    await p.screenshot({
      path: `${shots}/bet-slip-390.png`,
      animations: "disabled",
    });
  });
  await test("Live pools and actual bet calldata with rejection/retry", async () => {
    const p = await page(390, true);
    await connect(p);
    const card = chainCard(p, 1);
    assert.equal(await card.locator(".odds-yes strong").innerText(), "60%");
    await card.locator(".odds-no").click();
    const slip = p.getByRole("dialog", { name: "Bet slip" });
    await slip.getByRole("button", { name: "0.005 ETH", exact: true }).click();
    await p.evaluate(() => (window.testWallet.reject = true));
    await slip.getByRole("button", { name: "Bet No", exact: true }).click();
    await slip
      .getByText("Request declined in your wallet. You can try again.")
      .waitFor();
    assert.equal(fixture.transactions.length, 0);
    await slip.getByRole("button", { name: "Bet No", exact: true }).click();
    await slip.getByText("Your No bet is confirmed.").waitFor();
    assert.equal(fixture.transactions[0].functionName, "bet");
    assert.deepEqual(fixture.transactions[0].args, ["1", "false"]);
    assert.equal(BigInt(fixture.transactions[0].value), parseEther("0.005"));
  });
  await test("Claims work and wrong-chain betting is disabled", async () => {
    const p = await page(1440, true);
    await connect(p);
    await p
      .locator(".main-nav")
      .getByRole("link", { name: "My Positions" })
      .click();
    await p
      .locator(".claim-row")
      .getByRole("button", { name: "Claim", exact: true })
      .click();
    await p.getByText("Winnings from market #4 claimed.").waitFor();
    await p
      .locator(".main-nav")
      .getByRole("link", { name: "Markets", exact: true })
      .click();
    await p.evaluate(() => window.testWallet.setChain("0x1"));
    await chainCard(p, 1).locator(".odds-yes").click();
    assert.ok(
      await p
        .getByRole("button", { name: "Switch to Sepolia in the header" })
        .isDisabled(),
    );
  });
  await test("Phone wallet links, named desktop extension and no generic injected label", async () => {
    const p = await page(390, false, true);
    await p.locator(".wallet-button").click();
    for (const name of ["MetaMask", "Coinbase Wallet", "Rabby", "Phantom"])
      await p.getByRole("link", { name: `Open in ${name}` }).waitFor();
    await p.getByRole("button", { name: "Coinbase Smart Wallet" }).waitFor();
    assert.equal(await p.getByText("Injected", { exact: true }).count(), 0);
    await noOverflow(p);
    await p.screenshot({
      path: `${shots}/wallet-390.png`,
      animations: "disabled",
    });
  });
  await test("Keyboard focus, native modal trap and Escape focus return", async () => {
    const p = await page(390);
    const trigger = p.locator(".odds-yes").first();
    await trigger.focus();
    await p.keyboard.press("Enter");
    const slip = p.locator(".practice-slip");
    await p.keyboard.press("Tab");
    assert.ok(await slip.evaluate((el) => el.contains(document.activeElement)));
    await p.screenshot({
      path: `${shots}/focus-390.png`,
      animations: "disabled",
    });
    for (let i = 0; i < 20; i++) {
      await p.keyboard.press("Tab");
      assert.ok(
        await slip.evaluate((el) => el.contains(document.activeElement)),
      );
    }
    await p.keyboard.press("Escape");
    assert.ok(await trigger.evaluate((el) => document.activeElement === el));
  });
  await test("Axe scans of board and slip; reduced motion and resource failures", async () => {
    const p = await page(390);
    let scan = await new AxeBuilder({ page: p })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    assert.deepEqual(scan.violations, []);
    await p.locator(".odds-yes").first().click();
    scan = await new AxeBuilder({ page: p })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    assert.deepEqual(scan.violations, []);
    await p.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await p.evaluate(
        () =>
          document.getAnimations().filter((a) => a.playState === "running")
            .length,
      ),
      0,
    );
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(missingAssets, []);
  });
} catch (error) {
  results.push({
    name: `${engineName} runtime launch`,
    passed: false,
    error: error.message.split("\n")[0],
  });
  console.error(`${engineName} unavailable: ${error.message.split("\n")[0]}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
  await writeFile(
    `${shots}/results.json`,
    JSON.stringify({ engine: engineName, results }, null, 2) + "\n",
  );
  const failed = results.filter((r) => !r.passed);
  console.log(
    `${results.length - failed.length}/${results.length} browser checks passed`,
  );
  if (failed.length) process.exitCode = 1;
}
