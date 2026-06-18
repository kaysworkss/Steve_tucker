// ─── WALLET.JS — Beacon SDK for Tezos ────────────────────────────────────────

async function getClient() {
  if (!window._beacon) {
    const { DAppClient, NetworkType } = window.beacon;
    window._beacon = new DAppClient({
      name: "Tucker Sketchbook",
      network: { type: NetworkType.MAINNET },
    });
  }
  return window._beacon;
}

async function connectWallet() {
  try {
    const client = await getClient();
    let acc = await client.getActiveAccount();
    if (!acc) {
      await client.requestPermissions();
      acc = await client.getActiveAccount();
    }
    if (acc) onConnected(acc.address);
  } catch (err) {
    if (!String(err).includes("Aborted")) console.warn("Wallet:", err);
  }
}

async function disconnectWallet() {
  const client = await getClient();
  await client.clearActiveAccount();
  onDisconnected();
}

function onConnected(address) {
  const btn = document.getElementById("wallet-btn");
  btn.textContent = address.slice(0, 6) + "…" + address.slice(-4);
  btn.classList.add("connected");
  btn.title = address;
  btn.onclick = disconnectWallet;
  document.getElementById("my-collection").classList.add("visible");
  markWalletOwned(address);
}

function onDisconnected() {
  const btn = document.getElementById("wallet-btn");
  btn.textContent = "Connect Wallet";
  btn.classList.remove("connected");
  btn.title = "";
  btn.onclick = connectWallet;
  document.getElementById("my-collection").classList.remove("visible");
  document.querySelectorAll(".card-owned").forEach(b => b.remove());
  document.querySelectorAll(".collector-row.is-me").forEach(r => r.classList.remove("is-me"));
}

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("wallet-btn").onclick = connectWallet;
  try {
    const client = await getClient();
    const acc = await client.getActiveAccount();
    if (acc) onConnected(acc.address);
  } catch (_) {}
});
