(function () {
  "use strict";
  const { BrowserProvider, Contract, getAddress, isAddress, parseEther, formatEther } = ethers;
  const { CHAIN_ID, CORE, uint64, firstRound, phase } = SqueekUI;
  const $ = (id) => document.getElementById(id);
  let provider, signer, market, core, config, account, abi, chainTime, busy = false;
  const dates = (value) => new Date(Number(value) * 1000).toLocaleString();
  const eth = (value) => `${formatEther(value)} ETH`;

  function message(text, error = false) {
    $("status").textContent = text;
    $("status").classList.toggle("error", error);
  }
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  async function task(action) {
    if (busy) return;
    busy = true;
    document.querySelectorAll("button").forEach((b) => { b.disabled = true; });
    try { await action(); }
    catch (error) { message(error.revert?.name || error.reason || error.shortMessage || error.message, true); }
    finally {
      busy = false;
      document.querySelectorAll("button").forEach((b) => { b.disabled = false; });
    }
  }
  async function checkChain() {
    if (BigInt(await window.ethereum.request({ method: "eth_chainId" })) !== CHAIN_ID) {
      throw new Error("Switch your wallet to Sepolia (11155111), then reconnect.");
    }
    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    if (!account || !accounts.length || getAddress(accounts[0]) !== account) {
      throw new Error("Wallet account changed. Reconnect before continuing.");
    }
  }
  async function connect() {
    $("workspace").hidden = true;
    market = undefined;
    if (!window.ethereum) throw new Error("Install an Ethereum browser wallet to use this frontend.");
    const address = $("deployment").value.trim();
    if (!isAddress(address)) throw new Error("Enter the confirmed SqueekPredict deployment address.");
    await window.ethereum.request({ method: "eth_requestAccounts" });
    provider = new BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    account = await signer.getAddress();
    await checkChain();
    if (await provider.getCode(address) === "0x") throw new Error("No contract exists at that address on Sepolia.");
    const response = await fetch("abi.json");
    if (!response.ok) throw new Error("Cannot load the local contract ABI. Serve this folder over HTTP.");
    abi = await response.json();
    const candidate = new Contract(address, abi, signer);
    if (getAddress(await candidate.CORE()) !== getAddress(CORE) || await candidate.CHAIN_ID() !== CHAIN_ID) {
      throw new Error("This contract does not identify the required Sepolia SqueekCore.");
    }
    const coreResponse = await fetch("core-abi.json");
    if (!coreResponse.ok) throw new Error("Cannot load the local Core ABI.");
    core = new Contract(CORE, await coreResponse.json(), provider);
    config = undefined;
    try {
      const current = await core.configuration();
      if (await core.implementationCodeVersion() === 3n && current.roundDuration === 600n && current.blockUnitsPerBlock === 1000000000n) config = current;
    } catch { /* Listing, claims and timeout refunds remain available if Core is unavailable. */ }
    $("create-form").hidden = !config;
    $("core-warning").hidden = Boolean(config);
    market = candidate;
    $("wallet").textContent = `Connected: ${account} · Market: ${getAddress(address)}`;
    $("workspace").hidden = false;
    await refresh();
  }
  function preview() {
    if (!config || chainTime === undefined) return;
    const round = firstRound(config.genesisTimestamp, chainTime, BigInt($("lead").value));
    const start = config.genesisTimestamp + (round - 1n) * 600n;
    const duration = BigInt($("duration").value);
    $("preview").textContent = `Betting closes ${dates(start)} (round ${round}). Window ends ${dates(start + duration)}. Exact times are fixed when the transaction is mined.`;
  }
  async function refresh() {
    await checkChain();
    const block = await provider.getBlock("latest");
    chainTime = BigInt(block.timestamp);
    // Core failures must not disable market listing or oracle-independent refunds.
    try {
      const state = await core.state();
      $("height").textContent = state.blockHeight.toString();
      $("frontier").textContent = state.settledThroughRound.toString();
      $("core-status").textContent = state.paused ? "Paused" : "Active";
    } catch {
      $("height").textContent = "—";
      $("frontier").textContent = "—";
      $("core-status").textContent = "Unavailable";
    }
    const count = await market.marketCount();
    const list = $("markets");
    list.replaceChildren();
    if (count === 0n) list.append(element("p", "No markets yet. Create the first prediction.", "muted"));
    for (let id = count; id > 0n && id > count - 20n; id--) list.append(await card(id));
    preview();
    message(`Loaded ${count} markets. Values reflect the latest wallet RPC reads.`);
  }
  async function transact(send) {
    await checkChain();
    message("Review the transaction in your wallet.");
    const tx = await send();
    message(`Waiting for confirmation: ${tx.hash}`);
    const receipt = await tx.wait();
    if (receipt.status !== 1) throw new Error("Transaction reverted.");
    await refresh();
    message(`Confirmed: ${tx.hash}`);
  }
  function button(label, action, className = "secondary") {
    const node = element("button", label, className);
    node.type = "button";
    node.addEventListener("click", () => task(action));
    node.disabled = busy;
    return node;
  }
  async function card(id) {
    const m = await market.getMarket(id);
    const [position, amount] = await Promise.all([market.positions(id, account), market.claimable(id, account)]);
    const node = element("article", undefined, "market");
    node.append(element("div", `#${id} · ${phase(m, chainTime)}`, "tag"));
    node.append(element("h3", `More than ${m.threshold} blocks in ${m.endsAt - m.startsAt === 86400n ? "24 hours" : "7 days"}?`));
    node.append(element("p", `Betting closes / window starts: ${dates(m.startsAt)}`, "muted"));
    node.append(element("p", `Window ends: ${dates(m.endsAt)} · Rounds ${m.startRound}–${m.endRound}`, "muted"));
    node.append(element("p", `Unresolved refund time: ${dates(m.refundAt)}`, "muted"));
    const pools = element("div", undefined, "pool");
    for (const [label, value] of [["YES pool", m.yesPool], ["NO pool", m.noPool]]) {
      const box = element("div");
      box.append(element("span", label), element("strong", eth(value)));
      pools.append(box);
    }
    node.append(pools, element("p", `Your stakes: YES ${eth(position.yes)} / NO ${eth(position.no)}`, "muted"));
    if (Number(m.status) === 1) {
      node.append(element("p", `Official completed blocks: ${m.endBlockUnits / 1000000000n - m.startBlockUnits / 1000000000n}`));
    }
    const actions = element("div", undefined, "actions");
    if (Number(m.status) === 0 && chainTime < m.startsAt) {
      const inputId = `stake-${id}`;
      const label = element("label", "Stake in Sepolia ETH (minimum 0.0001)");
      label.htmlFor = inputId;
      const input = element("input");
      input.id = inputId;
      input.inputMode = "decimal";
      input.value = "0.001";
      const sendBet = (yes) => transact(() => {
        const value = parseEther(input.value.trim());
        if (value < 100000000000000n) throw new Error("Minimum stake is 0.0001 Sepolia ETH.");
        if (m.yesPool + m.noPool + value > 100000000000000000000n) throw new Error("This stake exceeds the 100 ETH pool limit.");
        return market.bet(id, yes, { value });
      });
      const choices = element("div", undefined, "row");
      choices.append(button("Bet YES", () => sendBet(true), "yes"), button("Bet NO", () => sendBet(false), "no"));
      actions.append(label, input, choices, element("p", "Stakes are final. Other bets can change your payout before betting closes.", "muted"));
    } else if (Number(m.status) === 0) {
      if (chainTime >= m.refundAt) actions.append(button("Cancel expired market", () => transact(() => market.cancelExpired(id))));
      else {
        if (m.yesPool === 0n || m.noPool === 0n) actions.append(button("Cancel unmatched market", () => transact(() => market.cancelUnmatched(id))));
        if (chainTime >= m.endsAt) actions.append(button("Resolve from SqueekCore", () => transact(() => market.resolve(id))));
      }
    }
    if (amount > 0n) {
      const label = element("label", `Claim ${eth(amount)} to`);
      const recipient = element("input");
      recipient.id = `recipient-${id}`;
      label.htmlFor = recipient.id;
      recipient.value = account;
      actions.append(label, recipient, button("Claim payout / refund", () => transact(() => {
        if (!isAddress(recipient.value.trim())) throw new Error("Enter a valid recipient address.");
        return market.claim(id, getAddress(recipient.value.trim()));
      })));
    } else if (position.claimed) actions.append(element("p", "Your payout has been claimed.", "muted"));
    node.append(actions);
    return node;
  }
  $("connect").addEventListener("click", () => task(connect));
  $("switch").addEventListener("click", () => task(async () => {
    if (!window.ethereum) throw new Error("No Ethereum browser wallet found.");
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xaa36a7" }] });
    message("Sepolia selected. Connect to load your deployment.");
  }));
  $("refresh").addEventListener("click", () => task(refresh));
  $("lead").addEventListener("change", preview);
  $("duration").addEventListener("change", preview);
  $("create-form").addEventListener("submit", (event) => {
    event.preventDefault();
    task(async () => {
      const threshold = uint64($("threshold").value.trim(), "Block target");
      const block = await provider.getBlock("latest");
      const startRound = firstRound(config.genesisTimestamp, BigInt(block.timestamp), BigInt($("lead").value));
      const duration = BigInt($("duration").value);
      if (![86400n, 604800n].includes(duration)) throw new Error("Choose 24 hours or 7 days.");
      await transact(() => market.createMarket(threshold, startRound, duration));
    });
  });
  $("find-form").addEventListener("submit", (event) => {
    event.preventDefault();
    task(async () => {
      await checkChain();
      const id = uint64($("market-id").value.trim(), "Market ID");
      if (id === 0n) throw new Error("Market IDs start at 1.");
      const block = await provider.getBlock("latest");
      chainTime = BigInt(block.timestamp);
      $("markets").replaceChildren(await card(id));
      message(`Loaded market #${id}.`);
    });
  });
  if (window.ethereum?.on) {
    for (const event of ["accountsChanged", "chainChanged"]) window.ethereum.on(event, () => {
      $("workspace").hidden = true;
      market = undefined;
      message("Wallet network or account changed. Reconnect to continue.");
    });
  }
})();
