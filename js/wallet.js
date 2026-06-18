(function () {
  // Tezos wallet connection. Mirrors the proven claim-token.html flow:
  // Temple direct on desktop when available, Beacon for mobile and fallback.

  const walletState = {
    activeAddress: "",
    thanksShownFor: "",
    uiReady: false,
    beaconClient: null,
    beaconSdkPromise: null,
  };

  const BEACON_SCRIPT_SOURCES = [
    "https://unpkg.com/@airgap/beacon-sdk@4.6.2/dist/walletbeacon.min.js",
    "https://cdn.jsdelivr.net/npm/@airgap/beacon-sdk@4.6.2/dist/walletbeacon.min.js",
  ];

  const BEACON_MODULE_SOURCES = [
    "https://esm.sh/@airgap/beacon-sdk@4.6.2?bundle",
    "https://cdn.jsdelivr.net/npm/@airgap/beacon-sdk@4.6.2/+esm",
  ];

  const MATRIX_NODES = [
    "beacon-node-1.octez.io",
    "beacon-node-2.octez.io",
    "beacon-node-3.octez.io",
    "beacon-node-4.octez.io",
    "beacon-node-5.octez.io",
    "beacon-node-6.octez.io",
    "beacon-node-7.octez.io",
    "beacon-node-8.octez.io",
  ];

  function beaconGlobal() {
    return window.beacon || window.walletbeacon || window.beaconSdk || window.airgapBeaconSdk || null;
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
      if (Array.from(document.scripts).some(script => script.src === src && script.dataset.loaded === "true")) {
        resolve();
        return;
      }

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

  async function getBeaconSdk() {
    const existing = beaconGlobal();
    if (existing?.DAppClient) return existing;
    if (walletState.beaconSdkPromise) return walletState.beaconSdkPromise;

    walletState.beaconSdkPromise = (async () => {
      for (const src of BEACON_SCRIPT_SOURCES) {
        try {
          await loadScript(src);
          const sdk = beaconGlobal();
          if (sdk?.DAppClient) return sdk;
        } catch (_) {}
      }

      for (const src of BEACON_MODULE_SOURCES) {
        try {
          const sdk = await import(src);
          if (sdk?.DAppClient) return sdk;
        } catch (_) {}
      }

      throw new Error("Beacon SDK did not load.");
    })();

    return walletState.beaconSdkPromise;
  }

  function beaconNetworkConfig(sdk) {
    const networkTypes = sdk?.NetworkType || {};
    return { type: networkTypes.MAINNET || "mainnet" };
  }

  function beaconPermissionScopes(sdk) {
    const scopes = sdk?.PermissionScope || {};
    return [
      scopes.OPERATION_REQUEST || "operation_request",
      scopes.SIGN || "sign",
    ].filter(Boolean);
  }

  function beaconMatrixNodes(sdk) {
    const regions = sdk?.Regions || {};
    const region = regions.EUROPE_WEST || "EUROPE_WEST";
    return { [region]: MATRIX_NODES };
  }

  function makeBeaconClient(DAppClient, sdk) {
    return new DAppClient({
      name: "Tucker Sketchbook",
      appUrl: location.origin,
      network: beaconNetworkConfig(sdk),
      featuredWallets: ["temple", "kukai", "umami", "naan", "airgap"],
      matrixNodes: beaconMatrixNodes(sdk),
    });
  }

  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(label)), ms)),
    ]);
  }

  async function resetBeaconClient(client) {
    if (!client) return;
    const tasks = [
      () => client.removeAllAccounts?.(),
      () => client.clearActiveAccount?.(),
      () => client.setActiveAccount?.(),
      () => client.destroy?.(),
    ];
    for (const task of tasks) {
      try { await task(); } catch (_) {}
    }
  }

  async function requestBeaconPermission(client, sdk) {
    const permissionRequest = { scopes: beaconPermissionScopes(sdk) };
    try {
      return await withTimeout(
        client.requestPermissions(permissionRequest),
        90000,
        "Beacon permission timed out."
      );
    } catch (err) {
      const message = err?.message || String(err);
      if (/not accepted|invalid|unknown|unexpected/i.test(message)) {
        return await withTimeout(client.requestPermissions(), 90000, "Beacon permission timed out.");
      }
      throw err;
    }
  }

  async function connectBeaconWallet(resetFirst = false) {
    const sdk = await getBeaconSdk();
    const DAppClient = sdk?.DAppClient;
    if (typeof DAppClient !== "function") throw new Error("Beacon SDK did not load.");

    if (resetFirst) {
      await resetBeaconClient(walletState.beaconClient);
      walletState.beaconClient = null;
    }

    const client = walletState.beaconClient || makeBeaconClient(DAppClient, sdk);
    walletState.beaconClient = client;
    const permission = await requestBeaconPermission(client, sdk);
    const account = await client.getActiveAccount?.();
    const address = permission?.address || account?.address;
    if (!address) throw new Error("Beacon connected but returned no Tezos address.");
    return address;
  }

  function templePageRequest(payload, timeoutMs = 90000) {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2);
      let timer;
      function cleanup() {
        window.removeEventListener("message", onMessage);
        clearTimeout(timer);
      }
      function onMessage(evt) {
        const data = evt.data;
        if (evt.source !== window || !data || data.type !== "TEMPLE_PAGE_RESPONSE" || data.id !== id) return;
        cleanup();
        if (data.error) reject(new Error(data.error.message || data.error));
        else resolve(data.payload);
      }
      window.addEventListener("message", onMessage);
      window.postMessage({ type: "TEMPLE_PAGE_REQUEST", id, payload }, "*");
      timer = setTimeout(() => {
        cleanup();
        reject(new Error("Temple request timed out."));
      }, timeoutMs);
    });
  }

  function templeDirectAvailable(timeoutMs = 600) {
    return new Promise(resolve => {
      let done = false;
      let timer;
      function finish(value) {
        if (done) return;
        done = true;
        window.removeEventListener("message", onMessage);
        clearTimeout(timer);
        resolve(value);
      }
      function onMessage(evt) {
        const data = evt.data;
        if (evt.source === window && data && data.type === "TEMPLE_PAGE_RESPONSE" && data.payload === "PONG") {
          finish(true);
        }
      }
      window.addEventListener("message", onMessage);
      window.postMessage({ type: "TEMPLE_PAGE_REQUEST", payload: "PING" }, "*");
      timer = setTimeout(() => finish(false), timeoutMs);
    });
  }

  async function connectTempleDirect() {
    if (!(await templeDirectAvailable())) throw new Error("Temple was not detected.");
    const permission = await templePageRequest({
      type: "PERMISSION_REQUEST",
      network: "mainnet",
      appMeta: { name: "Tucker Sketchbook" },
      force: true,
    });
    if (!permission?.pkh) throw new Error("Temple connected but returned no Tezos address.");
    return permission.pkh;
  }

  function openWalletModal() {
    document.getElementById("tezos-wallet-modal")?.classList.add("show");
    document.body.style.overflow = "hidden";
  }

  function closeWalletModal() {
    document.getElementById("tezos-wallet-modal")?.classList.remove("show");
    if (!document.getElementById("collector-thanks")?.classList.contains("open")) {
      document.body.style.overflow = "";
    }
  }

  async function connectWithConnector(connector, label) {
    try {
      closeWalletModal();
      setWalletButton("loading", label || "Connecting...");
      const address = await connector();
      await onConnected(address);
    } catch (err) {
      const message = String(err?.message || err);
      if (!/aborted|closed|cancel|not granted|not accepted/i.test(message)) {
        console.warn("Wallet connection failed:", err);
        showToast?.("Wallet connection failed. Please try again.");
      }
      setWalletButton(
        walletState.activeAddress ? "connected" : "idle",
        walletState.activeAddress ? shortWallet(walletState.activeAddress) : "Connect Wallet"
      );
    }
  }

  async function connectBeaconFromButton() {
    return connectWithConnector(async () => {
      try {
        return await connectBeaconWallet(false);
      } catch (firstBeaconErr) {
        const message = String(firstBeaconErr?.message || firstBeaconErr);
        if (/aborted|closed|cancel|not granted|not accepted/i.test(message)) throw firstBeaconErr;
        return connectBeaconWallet(true);
      }
    }, "Opening Beacon...");
  }

  async function connectTempleFromButton() {
    return connectWithConnector(async () => {
      try {
        return await connectTempleDirect();
      } catch (err) {
        const message = String(err?.message || err);
        if (/Temple was not detected/i.test(message)) return connectBeaconWallet(true);
        throw err;
      }
    }, "Opening Temple...");
  }

  async function disconnectWallet() {
    await resetBeaconClient(walletState.beaconClient);
    walletState.beaconClient = null;
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
      btn.onclick = openWalletModal;
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
      const sdk = await getBeaconSdk();
      const DAppClient = sdk?.DAppClient;
      if (typeof DAppClient !== "function") return;
      const client = walletState.beaconClient || makeBeaconClient(DAppClient, sdk);
      walletState.beaconClient = client;
      const account = await client.getActiveAccount?.();
      if (account?.address) await onConnected(account.address);
    } catch (err) {
      console.warn("Wallet restore skipped:", err);
    }
  }

  function initWalletUI() {
    if (walletState.uiReady) return;
    walletState.uiReady = true;

    const btn = document.getElementById("wallet-btn");
    if (btn) btn.onclick = openWalletModal;

    document.getElementById("wallet-beacon-btn")?.addEventListener("click", connectBeaconFromButton);
    document.getElementById("wallet-temple-btn")?.addEventListener("click", connectTempleFromButton);
    document.getElementById("wallet-dismiss")?.addEventListener("click", closeWalletModal);
    document.getElementById("tezos-wallet-modal")?.addEventListener("click", e => {
      if (e.target.id === "tezos-wallet-modal") closeWalletModal();
    });

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
    closeCollectorThanks,
    connectBeaconWallet,
    connectBeaconFromButton,
    connectTempleDirect,
    connectTempleFromButton,
    disconnectWallet,
    getBeaconSdk,
    initWalletUI,
    openWalletModal,
    onConnected,
    onDisconnected,
    showCollectorThanks,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWalletUI);
  } else {
    initWalletUI();
  }
})();
