/* DOM integration fallback; no rendering/layout claims. Install optional happy-dom in test/scratch/dom. */
import { Window } from "../../test/scratch/dom/node_modules/happy-dom/lib/index.js";
import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { parseEther, getAddress } from "viem";
import {
  TEMPLATES,
  templateMarket,
  placePractice,
  emptyBook,
} from "../src/catalog.ts";
import {
  fixture,
  resetFixtures,
  rpc,
  ACCOUNT,
  OTHER,
  installWallet,
  recordTransaction,
  proof,
} from "./fixtures.mjs";
process.chdir(fileURLToPath(new URL("../../", import.meta.url)));
const index = await readFile("dist/index.html", "utf8");
const script = index.match(/<script\b[^>]*src="([^"]+)"/);
assert.ok(script, "production entry script exists");
const built = await build({
  // Rebundle actual production chunks for the emulator; this does not emulate HTML/CSS layout.
  entryPoints: [resolve("dist", script[1])],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "skip-css",
      setup(b) {
        b.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "js" }));
      },
    },
  ],
});
const bundle = built.outputFiles[0].text;
const results = [];
let active = [];
const wait = async (fn, label = "condition") => {
  const start = Date.now();
  while (Date.now() - start < 8000) {
    const result = await fn();
    if (result) return result;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw Error(`Timed out: ${label}`);
};
const all = (win, selector) => [...win.document.querySelectorAll(selector)];
const text = (win, selector) =>
  all(win, selector)
    .map((el) => el.textContent)
    .join(" ");
function button(win, label, scope = win.document) {
  const found = [...scope.querySelectorAll("button")].find(
    (el) => el.textContent.replace(/\s+/g, " ").trim() === label,
  );
  assert.ok(found, `button ${label} exists`);
  return found;
}
function fill(win, el, value) {
  assert.ok(el, "input exists");
  Object.getOwnPropertyDescriptor(
    win.HTMLInputElement.prototype,
    "value",
  ).set.call(el, value);
  el.dispatchEvent(new win.Event("input", { bubbles: true }));
  el.dispatchEvent(new win.Event("change", { bubbles: true }));
}
async function click(el) {
  assert.ok(el, "click target exists");
  el.click();
  await new Promise((r) => setTimeout(r, 20));
}
async function page(populated = false, mobile = false, options = {}) {
  resetFixtures(populated);
  if (options.rpcMode) fixture.mode = options.rpcMode;
  if (options.history) fixture.history = options.history;
  const win = new Window({
    url: "http://squeek.test/preview/",
    width: 390,
    height: 844,
    settings: {
      navigator: {
        userAgent: mobile
          ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"
          : "DOM validation desktop",
      },
    },
  });
  win.console.timeStamp = () => {};
  win.console.error = (...args) => console.error("DOM ERROR", ...args);
  win.addEventListener("error", (event) =>
    console.error("DOM WINDOW ERROR", event.message, event.error?.stack),
  );
  // Emulator only: native top-layer/inert/focus confinement must be checked in real browsers.
  win.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
    this.setAttribute("open", "");
    this.querySelector("button")?.focus();
  };
  win.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.removeAttribute("open");
  };
  win.scrollTo = () => {};
  win.fetch = async (input, init) => {
    if (init?.method === "HEAD") return new win.Response("", { status: 200 });
    try {
      const q = JSON.parse(init?.body ?? (await input.text()));
      return new win.Response(JSON.stringify(rpc(q)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    } catch {
      return new win.Response("offline", { status: 503 });
    }
  };
  if (!mobile) installWallet(win, ACCOUNT, recordTransaction);
  if (options.saved)
    win.localStorage.setItem("squeek-predict-practice-v1", options.saved);
  if (options.noStorage)
    Object.defineProperty(win, "localStorage", {
      value: {
        getItem: () => null,
        setItem: () => {
          throw Error("Storage unavailable");
        },
        removeItem: () => {},
      },
    });
  win.document.body.innerHTML = '<div id="root"></div>';
  active.push(win);
  win.eval(bundle);
  await wait(
    () => all(win, "article.market-card").length === 12,
    "12 market cards",
  );
  await wait(
    () =>
      text(win, ".chain-status").includes(
        options.rpcMode === "fail" ? "unavailable" : "Sepolia connected",
      ),
    "verified snapshot",
  );
  return win;
}
async function connect(win) {
  await click(win.document.querySelector(".wallet-button"));
  await wait(
    () => text(win, ".wallet-list").includes("Test Browser Wallet"),
    "wallet discovery",
  );
  await click(button(win, "Test Browser Wallet"));
  await wait(() => text(win, ".wallet-button").includes("0x1234"), "connected");
  await wait(
    () => !win.document.querySelector(".wallet-modal"),
    "sheet closes",
  );
}
async function test(name, fn) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  try {
    await fn();
    results.push({ name, passed: true });
    console.log("PASS", name);
  } catch (e) {
    results.push({ name, passed: false, error: e.message });
    console.error("FAIL", name, e.stack);
  } finally {
    for (const win of active) await win.happyDOM.abort();
    active = [];
  }
}
try {
  await test("Zero chain markets renders twelve open binary cards with odds, volume, time and no creation action", async () => {
    const win = await page();
    assert.equal(all(win, ".market-card").length, 12);
    for (const card of all(win, ".market-card")) {
      assert.equal(card.querySelectorAll(".odds").length, 2);
      assert.match(card.textContent, /50%/);
      assert.match(card.textContent, /0 ETH vol\./);
      assert.match(card.textContent, /left/);
      assert.match(card.textContent, /Practice/);
    }
    assert.ok(
      !/Create market|Open this market|Set a target/.test(
        win.document.body.textContent,
      ),
    );
    assert.match(text(win, "h1"), /Predict the next block/);
  });
  await test("Category, search, no-results recovery and source filters work", async () => {
    const win = await page();
    await click(button(win, "Weekly blocks"));
    assert.equal(all(win, ".market-card").length, 3);
    await click(button(win, "All markets"));
    fill(win, win.document.querySelector('input[type="search"]'), "10,000");
    await wait(() => all(win, ".market-card").length === 1, "search");
    fill(
      win,
      win.document.querySelector('input[type="search"]'),
      "missing-question",
    );
    await wait(
      () => text(win, ".empty").includes("No matching markets"),
      "empty search",
    );
    await click(button(win, "Show all markets"));
    assert.equal(all(win, ".market-card").length, 12);
    const source = win.document.querySelector('[aria-label="Market type"]');
    source.value = "chain";
    source.dispatchEvent(new win.Event("change", { bubbles: true }));
    await wait(
      () => text(win, ".empty").includes("No open on-chain markets yet"),
      "chain empty",
    );
    await click(button(win, "Show all markets"));
  });
  await test("Practice side, amount validation, quick amounts and rules work before connecting", async () => {
    const win = await page();
    await click(win.document.querySelector(".odds-no"));
    const slip = win.document.querySelector(".practice-slip");
    assert.ok(slip.querySelector(".selected-no input").checked);
    fill(win, slip.querySelector("#practice-stake"), "0.00001");
    slip.querySelector("form").requestSubmit();
    await wait(
      () => text(win, "#practice-error").includes("at least 0.0001"),
      "minimum",
    );
    assert.equal(
      slip.querySelector("#practice-stake").getAttribute("aria-invalid"),
      "true",
    );
    await click(button(win, "0.005 ETH", slip));
    assert.equal(slip.querySelector("#practice-stake").value, "0.005");
    assert.match(slip.textContent, /No deposit, gas or wallet signature/);
    assert.match(
      slip.querySelector(".market-details").textContent,
      /Exactly 1,000 is No/,
    );
  });
  await test("Connect preserves No draft; practice bet keeps opening odds and saves stake, volume and positions without a transaction", async () => {
    const win = await page();
    await click(win.document.querySelector(".odds-no"));
    let slip = win.document.querySelector(".practice-slip");
    await click(button(win, "0.005 ETH", slip));
    slip.querySelector("form").requestSubmit();
    await wait(
      () => win.document.querySelector(".wallet-modal"),
      "connect prompt",
    );
    await wait(
      () => text(win, ".wallet-list").includes("Test Browser Wallet"),
      "named wallet",
    );
    await click(button(win, "Test Browser Wallet"));
    await wait(() => !win.document.querySelector(".wallet-modal"), "connected");
    slip = win.document.querySelector(".practice-slip");
    assert.equal(slip.querySelector("#practice-stake").value, "0.005");
    assert.ok(slip.querySelector(".selected-no input").checked);
    slip.querySelector("form").requestSubmit();
    await wait(
      () => text(win, ".success-state").includes("backing No"),
      "success",
    );
    assert.equal(fixture.transactions.length, 0);
    await click(button(win, "Keep exploring"));
    assert.match(
      text(win, ".market-card:first-child .card-foot"),
      /0.005 ETH vol/,
    );
    assert.equal(
      win.document.querySelector(".market-card .odds-no strong").textContent,
      "50%",
    );
    assert.equal(
      win.document.querySelector(".market-card .card-odds strong").textContent,
      "50%",
    );
    assert.match(
      text(win, ".market-card:first-child .your-pick"),
      /Your stake 0.005 ETH No/,
    );
    const saved = JSON.parse(
      win.localStorage.getItem("squeek-predict-practice-v1"),
    );
    assert.equal(saved.positions[0].no, parseEther("0.005").toString());
    assert.equal(
      saved.positions[0].account.toLowerCase(),
      ACCOUNT.toLowerCase(),
    );
    win.location.hash = "#positions";
    await wait(
      () => text(win, ".position-list").includes("No · 0.005 ETH"),
      "position",
    );
    assert.equal(
      text(win, ".page-heading p"),
      "Practice and Sepolia positions for your connected wallet.",
    );
    win.testWallet.setAccount(OTHER);
    await wait(
      () => !win.document.querySelector(".position-row"),
      "account isolation",
    );
  });
  await test("Practice stakes on both sides keep 50/50 opening odds and volume sorting prioritizes their market", async () => {
    const win = await page();
    await connect(win);
    const card = all(win, ".market-card")[2];
    const question = card.querySelector("h2").textContent;
    for (const side of ["yes", "no"]) {
      await click(card.querySelector(`.odds-${side}`));
      assert.deepEqual(
        all(win, ".practice-slip .side-choice strong").map((el) => el.textContent),
        ["50%", "50%"],
      );
      win.document.querySelector(".practice-slip form").requestSubmit();
      await wait(
        () => win.document.querySelector(".success-state"),
        "prediction",
      );
      await click(button(win, "Keep exploring"));
      assert.equal(card.querySelector(".card-odds strong").textContent, "50%");
    }
    assert.equal(card.querySelector(".odds-yes strong").textContent, "50%");
    assert.equal(card.querySelector(".odds-no strong").textContent, "50%");
    assert.match(card.textContent, /0.002 ETH vol/);
    assert.match(card.textContent, /Your stake 0.001 ETH Yes \+ 0.001 ETH No/);
    const sort = win.document.querySelector('[aria-label="Sort markets"]');
    sort.value = "volume";
    sort.dispatchEvent(new win.Event("change", { bubbles: true }));
    await wait(
      () => text(win, ".market-card:first-child h2") === question,
      "sort",
    );
  });
  await test("Live cards replace templates; wallet rejection recovers and correct deployed bet calldata is sent", async () => {
    const win = await page(true);
    assert.equal(all(win, ".market-card").length, 12);
    assert.equal(
      all(win, ".market-card .card-bottom").filter((el) =>
        el.textContent.includes("On-chain"),
      ).length,
      2,
    );
    const card = all(win, ".market-card").find((el) =>
      el.textContent.includes("Market #1"),
    );
    assert.equal(card.querySelector(".odds-yes strong").textContent, "60%");
    assert.match(card.textContent, /0.02 ETH vol/);
    await connect(win);
    await click(card.querySelector(".odds-no"));
    const slip = win.document.querySelector(".sheet:not(.practice-slip)");
    await click(button(win, "0.005 ETH", slip));
    win.testWallet.reject = true;
    slip.querySelector("form").requestSubmit();
    await wait(
      () => text(win, ".transaction-notice").includes("Request declined"),
      "rejection",
    );
    assert.equal(fixture.transactions.length, 0);
    slip.querySelector("form").requestSubmit();
    await wait(
      () =>
        text(win, ".transaction-notice").includes("Your No bet is confirmed"),
      "confirmed",
    );
    assert.deepEqual(
      fixture.transactions.map((tx) => [tx.functionName, ...tx.args]),
      [["bet", "1", "false"]],
    );
    assert.equal(BigInt(fixture.transactions[0].value), parseEther("0.005"));
    assert.equal(
      fixture.transactions[0].to.toLowerCase(),
      proof.address.toLowerCase(),
    );
  });
  await test("On-chain positions claim winnings with the connected recipient", async () => {
    const win = await page(true);
    await connect(win);
    win.location.hash = "#positions";
    await wait(() => win.document.querySelector(".claim-row"), "claimable");
    await click(button(win, "Claim", win.document.querySelector(".claim-row")));
    await wait(
      () =>
        text(win, ".transaction-notice").includes(
          "Winnings from market #4 claimed",
        ),
      "claim",
    );
    assert.deepEqual(fixture.transactions[0].args, ["4", getAddress(ACCOUNT)]);
    assert.ok(!win.document.querySelector(".claim-row"));
    assert.match(text(win, ".position-coverage"), /Loaded 6 of 6/);
  });
  await test("Wrong chain disables real bets; switch recovers; account changes close the slip", async () => {
    const win = await page(true);
    await connect(win);
    win.testWallet.setChain("0x1");
    await wait(
      () => text(win, ".wallet-button").includes("Switch to Sepolia"),
      "wrong chain",
    );
    const card = all(win, ".market-card").find((el) =>
      el.textContent.includes("Market #1"),
    );
    await click(card.querySelector(".odds-yes"));
    let slip = win.document.querySelector(".sheet:not(.practice-slip)");
    assert.ok(button(win, "Switch to Sepolia in the header", slip).disabled);
    await click(slip.querySelector('[aria-label="Close"]'));
    await click(win.document.querySelector(".wallet-button"));
    await wait(() => text(win, ".wallet-button").includes("0x1234"), "switch");
    await click(card.querySelector(".odds-yes"));
    win.testWallet.setAccount(OTHER);
    await wait(() => !win.document.querySelector(".sheet"), "account change");
    assert.equal(fixture.transactions.length, 0);
  });
  await test("Phone wallet chooser lists all four browser links and Coinbase Smart Wallet", async () => {
    const win = await page(false, true);
    await click(win.document.querySelector(".wallet-button"));
    await wait(() => win.document.querySelector(".wallet-modal"), "sheet");
    for (const name of ["MetaMask", "Coinbase Wallet", "Rabby", "Phantom"])
      assert.ok(
        all(win, ".wallet-row").some((el) =>
          el.textContent.includes(`Open in ${name}`),
        ),
        name,
      );
    assert.match(text(win, ".wallet-list"), /Coinbase Smart Wallet/);
    assert.ok(!text(win, ".wallet-list").includes("Injected"));
  });
  await test("Runtime mismatch disables chain submissions while the practice board stays usable", async () => {
    const win = await page(true);
    await connect(win);
    fixture.mode = "mismatch";
    await click(
      win.document.querySelector('[aria-label="Refresh chain data"]'),
    );
    await wait(
      () => text(win, ".chain-status").includes("unavailable"),
      "verification error",
    );
    const card = all(win, ".market-card").find((el) =>
      el.textContent.includes("Market #1"),
    );
    await click(card.querySelector(".odds-yes"));
    const slip = win.document.querySelector(".sheet:not(.practice-slip)");
    assert.ok(button(win, "Bet Yes", slip).disabled);
    assert.match(slip.textContent, /Fresh verified chain data is unavailable/);
    assert.equal(fixture.transactions.length, 0);
  });
  await test("Saved practice positions reload with their original windows and settle only from certified endpoints", async () => {
    const past = Math.floor(Date.now() / 1000) - 3 * 86400;
    const market = templateMarket(TEMPLATES[0], past);
    const saved = JSON.stringify(
      placePractice(emptyBook(), market, ACCOUNT, false, "0.003", past),
    );
    let win = await page(false, false, { saved });
    await connect(win);
    win.location.hash = "#positions";
    await wait(
      () => text(win, ".position-list").includes("No won · 432 blocks"),
      "certified endpoints",
    );
    assert.match(text(win, ".position-sides"), /No · 0.003 ETH/);
    assert.equal(
      JSON.parse(win.localStorage.getItem("squeek-predict-practice-v1"))
        .positions[0].market.startsAt,
      market.startsAt,
    );
    win = await page(false, false, { saved, history: "uncertified" });
    await connect(win);
    win.location.hash = "#positions";
    await wait(
      () => text(win, ".position-list").includes("Awaiting certified result"),
      "uncertified result stays unknown",
    );
    assert.ok(!text(win, ".position-list").includes("won"));
  });
  await test("Unavailable storage is disclosed in the success dialog and does not lose the in-memory position", async () => {
    const win = await page(false, false, { noStorage: true });
    await connect(win);
    await click(win.document.querySelector(".odds-yes"));
    win.document.querySelector(".practice-slip form").requestSubmit();
    await wait(
      () => text(win, ".success-state").includes("saved for this visit only"),
      "storage disclosure",
    );
    await click(button(win, "Keep exploring"));
    win.location.hash = "#positions";
    await wait(
      () => text(win, ".position-list").includes("Yes · 0.001 ETH"),
      "in-memory position",
    );
    assert.match(text(win, ".storage-notice"), /last for this visit only/);
  });
  await test("Initial RPC failure retains all ready practice cards and permits a practice prediction", async () => {
    const win = await page(false, false, { rpcMode: "fail" });
    assert.equal(all(win, ".market-card").length, 12);
    await connect(win);
    await click(win.document.querySelector(".odds-yes"));
    win.document.querySelector(".practice-slip form").requestSubmit();
    await wait(
      () => win.document.querySelector(".success-state"),
      "offline practice success",
    );
    assert.equal(fixture.transactions.length, 0);
  });
} finally {
  await mkdir("test/scratch/dom-results", { recursive: true });
  await writeFile(
    "test/scratch/dom-results/results.json",
    JSON.stringify(
      {
        runtime: "happy-dom (no layout engine)",
        target:
          "dist/index.html production JavaScript chunks rebundled as IIFE",
        results,
      },
      null,
      2,
    ) + "\n",
  );
  const failed = results.filter((r) => !r.passed);
  console.log(
    `${results.length - failed.length}/${results.length} DOM scenarios passed`,
  );
  if (failed.length) process.exitCode = 1;
}
