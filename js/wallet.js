(function () {
  // Tezos wallet connection via Beacon.

  const walletState = {
    activeAddress: "",
    thanksShownFor: "",
    uiReady: false,
    beaconLoadPromise: null,
  };

  const BEACON_SOURCES = [
    "https://cdn.jsdelivr.net/npm/@airgap/beacon-dapp@4.8.1/dist/walletbeacon.dapp.min.js",
    "https://unpkg.com/@airgap/beacon-dapp@4.8.1/dist/walletbeacon.dapp.min.js",
  ];

  function beaconApi() {
    return window.beacon || window.beaconDapp || window.Beacon || null;
  }

  function shortWallet(address) {
    return address ? address.slice(0, 6) + "..." + address.slice(-4) : "";
  }

  function setWalletButton(state, label) {
    const btn = document.getElementById("wallet-btn");
    if (!btn) return;
    btn.disabled = state === "loading";
    btn.textContent = label;
    btn.classList.toggle("connected", state === "connected");
    btn.classList.toggle("loading", state === "loading");
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => {
        script.dataset.loaded = "true";
        resolve();
      };
      script.onerror = () => reject(new Error("Unable to load " + src));
      document.head.appendChild(script);
    });
  }

  async function ensureBeaconScript() {
    if (beaconApi()) return beaconApi();
    if (walletState.beaconLoadPromise) return walletState.beaconLoadPromise;

    walletState.beaconLoadPromise = (async () => {
      let lastError;
      for (const src of BEACON_SOURCES) {
        try {
          await loadScript(src);
          if (beaconApi()) return beaconApi();
        } catch (err) {
          lastError = err;
        }
      }
      throw lastError || new Error("Beacon SDK did not load");
    })();

    return walletState.beaconLoadPromise;
  }

  async function waitForBeacon(timeoutMs = 7000) {
    const started = Date.now();
    await ensureBeaconScript();

    while (!beaconApi()) {
      if (Date.now() - started > timeoutMs) throw new Error("Beacon SDK did not load");
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return beaconApi();
  }

  async function getClient() {
    if (window._beaconClient) return window._beaconClient;

    const api = await waitForBeacon();
    const DAppClient = api.DAppClient;
    const NetworkType = api.NetworkType || { MAINNET: "mainnet" };
    const mainnet = NetworkType.MAINNET || "mainnet";
    if (!DAppClient) throw new Error("Beacon DAppClient unavailable");

    window._beaconClient = new DAppClient({
      name: "Tucker Sketchbook",
      preferredNetwork: mainnet,
      network: { type: mainnet },
    });
    return window._beaconClient;
  }

  async function connectWallet() {
    try {
      setWalletButton("loading", "Connecting...");
      const client = await getClient();

      let account = await client.getActiveAccount();
      if (!account) {
        await client.requestPermissions({
          network: { type: "mainnet" },
        });
        account = await client.getActiveAccount();
      }

      if (!account?.address) throw new Error("No wallet account returned");
      await onConnected(account.address);
    } catch (err) {
      const message = String(err?.message || err);
      if (!/aborted|closed|cancel/i.test(message)) {
        console.warn("Wallet connection failed:", err);
        showToast?.("Wallet connection failed. Please try again.");
      }
      setWalletButton(
        walletState.activeAddress ? "connected" : "idle",
        walletState.activeAddress ? shortWallet(walletState.activeAddress) : "Connect Wallet"
      );
    }
  }

  async function disconnectWallet() {
    try {
      const client = await getClient();
      await client.clearActiveAccount();
    } catch (err) {
      console.warn("Wallet disconnect failed:", err);
    }
    onDisconnected();
  }

  async function onConnected(address) {
    walletState.activeAddress = address;
    const btn = document.getElementById("wallet-btn");
    if (btn) {
      btn.title = address;
      btn.onclick = disconnectWallet;
    }
    setWalletButton("connected", shortWallet(address));

    document.getElementById("my-collection")?.classList.add("visible");
    const count = await markWalletOwned(address);
    if (count > 0) showCollectorThanks(address, count);
    return count;
  }

  function onDisconnected() {
    walletState.activeAddress = "";
    const btn = document.getElementById("wallet-btn");
    if (btn) {
      btn.title = "";
      btn.onclick = connectWallet;
    }
    setWalletButton("idle", "Connect Wallet");
    document.getElementById("my-collection")?.classList.remove("visible");
    document.querySelectorAll(".card-owned").forEach(b => b.remove());
    document.querySelectorAll(".collector-row.is-me").forEach(r => r.classList.remove("is-me"));
  }

  function showCollectorThanks(address, count) {
    if (walletState.thanksShownFor === address) return;
    walletState.thanksShownFor = address;

    const modal = document.getElementById("collector-thanks");
    const body = document.getElementById("collector-thanks-body");
    if (!modal || !body) return;

    body.textContent = count === 1
      ? "You hold 1 Steve Tucker sketch. Thanks for helping one of these places find a home."
      : `You hold ${count} Steve Tucker sketches. Thanks for helping these places find their homes.`;

    modal.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeCollectorThanks() {
    document.getElementById("collector-thanks")?.classList.remove("open");
    document.body.style.overflow = "";
  }

  async function restoreWalletSession() {
    try {
      const client = await getClient();
      const account = await client.getActiveAccount();
      if (account?.address) await onConnected(account.address);
    } catch (err) {
      console.warn("Wallet restore skipped:", err);
    }
  }

  function initWalletUI() {
    if (walletState.uiReady) return;
    walletState.uiReady = true;

    const btn = document.getElementById("wallet-btn");
    if (btn) btn.onclick = connectWallet;

    document.getElementById("collector-thanks-close")?.addEventListener("click", closeCollectorThanks);
    document.getElementById("collector-thanks")?.addEventListener("click", e => {
      if (e.target.id === "collector-thanks") closeCollectorThanks();
    });
    document.getElementById("collector-thanks-action")?.addEventListener("click", () => {
      closeCollectorThanks();
      document.getElementById("my-collection")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") closeCollectorThanks();
    });

    restoreWalletSession();
  }

  window.tuckerWallet = {
    beaconApi,
    closeCollectorThanks,
    connectWallet,
    disconnectWallet,
    getClient,
    initWalletUI,
    onConnected,
    onDisconnected,
    showCollectorThanks,
  };

  window.connectWallet = connectWallet;
  window.disconnectWallet = disconnectWallet;
  window.onConnected = onConnected;
  window.showCollectorThanks = showCollectorThanks;
  window.closeCollectorThanks = closeCollectorThanks;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWalletUI);
  } else {
    initWalletUI();
  }
})();
