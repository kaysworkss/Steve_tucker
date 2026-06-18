// ─── CHAIN.JS ─────────────────────────────────────────────────────────────────
// Reads all tokens from TzKT. For each token:
//   1. Checks KNOWN[tokenId] for a local image and cached loc/date
//   2. Falls back to IPFS displayUri for the image if no local file
//   3. Falls back to Claude vision + Nominatim geocoding for new tokens
// No fuzzy matching. No name guessing. TokenId is the single source of truth.

const IPFS_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
];

function ipfsToHttp(uri, gatewayIndex = 0) {
  if (!uri) return null;
  if (uri.startsWith("ipfs://")) return IPFS_GATEWAYS[gatewayIndex] + uri.slice(7);
  return uri;
}

// ── 1. Load all tokens ────────────────────────────────────────────────────────
async function loadAllTokens() {
  const res = await fetch(`${TZKT_API}/tokens?contract=${CONTRACT}&limit=200&sort.asc=tokenId`);
  if (!res.ok) throw new Error("TzKT " + res.status);
  const raw = await res.json();

  TOKENS = raw.map(t => {
    const tid  = parseInt(t.tokenId);
    const meta = t.metadata || {};
    const known = KNOWN[tid] || {};

    // Image: local file → IPFS (no fallback chain, just two clear options)
    const ipfsImg = ipfsToHttp(meta.displayUri || meta.artifactUri);
    const img     = known.localImg || ipfsImg || "";

    // Location + date: KNOWN table → parse from description → blank
    let loc  = known.loc  || "";
    let date = known.date || "";

    // For unknown tokens, try parsing description (format Tucker uses: "Place\n\nDate")
    if ((!loc || !date) && meta.description) {
      const parts = meta.description.split(/\n\n/).map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2 && !loc)  loc  = parts[0];
      if (parts.length >= 2 && !date) date = parts[parts.length - 1];
      if (parts.length === 1 && !loc) loc  = parts[0];
    }

    return {
      tokenId:  tid,
      name:     meta.name || `Token #${tid}`,
      subtitle: meta.description || "",
      loc,
      date,
      img,
      ipfsImg,
      supply:   parseInt(t.totalSupply) || 0,
      holders:  t.holdersCount || 0,
      objktUrl: OBJKT_BASE + tid,
      // lat/lng start null; filled by geocoding for unknown tokens
      lat: null,
      lng: null,
    };
  });

  return TOKENS;
}

// ── 2. Geocoding — only runs for tokens not in KNOWN ─────────────────────────
// Uses OpenStreetMap Nominatim (free, no key). Results cached in localStorage.

const GEO_CACHE_KEY = "tucker_geo_v1";

function geoCache() {
  try { return JSON.parse(localStorage.getItem(GEO_CACHE_KEY) || "{}"); } catch { return {}; }
}
function saveGeo(cache) {
  try { localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache)); } catch {}
}

// Hardcoded coords for KNOWN tokens — no geocoding needed for these
const KNOWN_COORDS = {
  // Philmont Scout Ranch, NM
  0: { lat: 36.469, lng: -104.894 },
  1: { lat: 36.469, lng: -104.894 },
  2: { lat: 36.469, lng: -104.894 },
  // Tahquamenon River, UP Michigan
  3: { lat: 46.596, lng: -85.234 },
  // Cimarron, NM
  4: { lat: 36.511, lng: -104.914 },
  5: { lat: 37.774, lng: -83.683 }, // Red River Gorge KY
  6: { lat: 36.443, lng: -105.549 }, // Taos Pueblo
  7: { lat: 37.997, lng: -88.877 },  // Rend Lake IL
  8: { lat: 36.407, lng: -105.573 }, // Taos Indian Casino
  9: { lat: 36.511, lng: -104.914 }, // Cimarron NM
  10:{ lat: 22.075, lng: -159.765 }, // Polihale Kauai
  11:{ lat: 22.075, lng: -159.765 }, // Polihale Kauai (duplicate)
  12:{ lat: 21.904, lng: -159.472 }, // Old Koloa Kauai
  13:{ lat: 22.204, lng: -159.498 }, // Hanalei Kauai
  14:{ lat: 21.898, lng: -159.594 }, // Glass Beach Kauai
  15:{ lat: 21.882, lng: -159.468 }, // Koloa Landing Kauai
  16:{ lat: 46.516, lng: -86.378 },  // Pictured Rocks MI
  17:{ lat: 37.774, lng: -83.683 },  // Natural Bridge KY
  18:{ lat: 22.217, lng: -159.502 }, // North Shore Kauai
  19:{ lat: 37.800, lng: -88.900 },  // Southern Illinois
  20:{ lat: 22.079, lng: -159.322 }, // Kealia Beach Kauai
  21:{ lat: 36.443, lng: -105.549 }, // Taos Pueblo
};

async function geocode(placeName) {
  const cache = geoCache();
  if (cache[placeName]) return cache[placeName];
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(placeName)}&format=json&limit=1`,
      { headers: { "Accept-Language": "en", "User-Agent": "TuckerSketchbook/1.0" } }
    );
    const data = await res.json();
    if (data.length > 0) {
      const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      cache[placeName] = result;
      saveGeo(cache);
      return result;
    }
  } catch (e) { console.warn("Geocode failed:", placeName, e); }
  return null;
}

// Apply coords and geocode unknown tokens in the background
async function applyCoords(onUpdate) {
  for (const token of TOKENS) {
    const known = KNOWN_COORDS[token.tokenId];
    if (known) {
      token.lat = known.lat;
      token.lng = known.lng;
      if (onUpdate) onUpdate(token);
    } else if (token.loc) {
      // Unknown future token — geocode from loc string
      const coords = await geocode(token.loc);
      if (coords) {
        token.lat = coords.lat;
        token.lng = coords.lng;
        if (onUpdate) onUpdate(token);
      }
      await new Promise(r => setTimeout(r, 500)); // rate limit
    }
  }
}

// ── 3. Collectors ─────────────────────────────────────────────────────────────
async function loadAllHolders() {
  let all = [], offset = 0;
  while (true) {
    const res = await fetch(
      `${TZKT_API}/tokens/balances?token.contract=${CONTRACT}&balance.gt=0&limit=500&offset=${offset}&select=account,balance,token`
    );
    if (!res.ok) break;
    const batch = await res.json();
    all = all.concat(batch);
    if (batch.length < 500) break;
    offset += 500;
  }
  return all;
}

async function loadWalletHoldings(address) {
  const res = await fetch(
    `${TZKT_API}/tokens/balances?token.contract=${CONTRACT}&account=${address}&balance.gt=0&select=token,balance`
  );
  if (!res.ok) throw new Error("TzKT wallet " + res.status);
  return res.json();
}

async function renderCollectors() {
  const wrap = document.getElementById("collectors-wrap");
  wrap.innerHTML = `<p class="loading-msg">Reading the Tezos blockchain…</p>`;
  try {
    const balances = await loadAllHolders();
    const BURN = "tz1burnburnburnburnburnburnburjAYjjX";
    const byAddr = {};
    for (const b of balances) {
      const addr = b.account.address;
      if (addr === BURN) continue;
      if (!byAddr[addr]) byAddr[addr] = { total: 0, tokenIds: [] };
      byAddr[addr].total += Number(b.balance);
      byAddr[addr].tokenIds.push(parseInt(b.token.tokenId));
    }
    const entries = Object.entries(byAddr).sort((a, b) => b[1].total - a[1].total);
    const totalEl = document.getElementById("collectors-total");
    if (totalEl) totalEl.textContent = `${entries.length} collector${entries.length !== 1 ? "s" : ""}`;
    if (!entries.length) {
      wrap.innerHTML = `<p class="collectors-empty">No collectors found on-chain yet.</p>`; return;
    }
    const rows = entries.map(([addr, info], i) => {
      const short = addr.slice(0, 7) + "…" + addr.slice(-5);
      const works = info.tokenIds
        .map(tid => TOKENS.find(t => t.tokenId === tid)?.name || `#${tid}`)
        .filter((v, j, a) => a.indexOf(v) === j).slice(0, 3).join(", ");
      return `<tr class="collector-row" data-addr="${addr}">
        <td class="col-rank">${i + 1}</td>
        <td class="col-addr">
          <span class="collector-addr" title="${addr}">${short}</span>
          <span class="collector-links">
            <a href="https://tzkt.io/${addr}" target="_blank" rel="noopener">tzkt ↗</a>
            <a href="https://objkt.com/profile/${addr}/collected" target="_blank" rel="noopener">objkt ↗</a>
          </span>
        </td>
        <td class="col-count"><span class="collector-count">${info.total}</span></td>
        <td class="col-works">${works || "—"}</td>
      </tr>`;
    }).join("");
    wrap.innerHTML = `<table class="collectors-table">
      <thead><tr><th>#</th><th>Collector</th><th>Held</th><th>Works</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  } catch (err) {
    console.error(err);
    wrap.innerHTML = `<p class="collectors-empty">Could not reach the blockchain. Reload to try again.</p>`;
  }
}

async function markWalletOwned(address) {
  try {
    const holdings = await loadWalletHoldings(address);
    const ownedIds = new Set(holdings.map(h => String(h.token.tokenId)));
    let count = 0;
    document.querySelectorAll(".sketch-card").forEach(card => {
      const existing = card.querySelector(".card-owned");
      if (ownedIds.has(String(card.dataset.tokenId))) {
        count++;
        if (!existing) {
          const b = document.createElement("div");
          b.className = "card-owned"; b.textContent = "Collected";
          card.appendChild(b);
        }
      } else if (existing) existing.remove();
    });
    document.getElementById("my-col-count").textContent = count;
    document.getElementById("my-col-sub").textContent = count === 0
      ? "You don't hold any Tucker sketches yet."
      : count === 1 ? "You hold 1 Tucker sketch — marked in the gallery."
      : `You hold ${count} Tucker sketches — marked in the gallery.`;
    document.querySelectorAll(".collector-row").forEach(r =>
      r.classList.toggle("is-me", r.dataset.addr === address));
  } catch (err) { console.warn("Wallet holdings:", err); }
}

// ─── LIVE UPDATES via TzKT WebSocket (SignalR) ───────────────────────────────
// Connects once on page load. When Tucker mints a new token, the site
// fetches it from TzKT and adds the card + map pin without any page refresh.

const TZKT_WS = "https://api.tzkt.io";

async function startLiveUpdates(onNewToken) {
  // SignalR is loaded via CDN in index.html
  const connection = new signalR.HubConnectionBuilder()
    .withUrl(TZKT_WS + "/v1/events")
    .withAutomaticReconnect([1000, 2000, 5000, 10000])
    .configureLogging(signalR.LogLevel.Warning)
    .build();

  // Subscribe to token transfers on this contract (mints are transfers from zero address)
  connection.on("token_transfers", async (msg) => {
    if (msg.type !== 1) return; // type 1 = data
    for (const transfer of (msg.data || [])) {
      // A mint = transfer where "from" is null
      if (transfer.from !== null && transfer.from !== undefined) continue;
      const tid = parseInt(transfer.token?.tokenId);
      if (isNaN(tid)) continue;
      // Skip if we already have this token
      if (TOKENS.some(t => t.tokenId === tid)) continue;

      // Fetch the full token metadata from TzKT
      try {
        const res = await fetch(`${TZKT_API}/tokens?contract=${CONTRACT}&tokenId=${tid}&limit=1`);
        if (!res.ok) continue;
        const [raw] = await res.json();
        if (!raw) continue;

        const meta  = raw.metadata || {};
        const known = KNOWN[tid]   || {};
        const ipfsImg = ipfsToHttp(meta.displayUri || meta.artifactUri);
        const img     = known.localImg || ipfsImg || "";

        let loc  = known.loc  || "";
        let date = known.date || "";
        if ((!loc || !date) && meta.description) {
          const parts = meta.description.split(/\n\n/).map(s => s.trim()).filter(Boolean);
          if (parts.length >= 2 && !loc)  loc  = parts[0];
          if (parts.length >= 2 && !date) date = parts[parts.length - 1];
          if (parts.length === 1 && !loc) loc  = parts[0];
        }

        const token = {
          tokenId:  tid,
          name:     meta.name || `Token #${tid}`,
          subtitle: meta.description || "",
          loc, date, img, ipfsImg,
          supply:   parseInt(raw.totalSupply) || 0,
          holders:  raw.holdersCount || 0,
          objktUrl: OBJKT_BASE + tid,
          lat: null, lng: null,
        };

        // Apply coords
        const knownCoords = KNOWN_COORDS[tid];
        if (knownCoords) {
          token.lat = knownCoords.lat;
          token.lng = knownCoords.lng;
        } else if (token.loc) {
          const coords = await geocode(token.loc);
          if (coords) { token.lat = coords.lat; token.lng = coords.lng; }
        }

        TOKENS.push(token);
        onNewToken(token);

      } catch (err) {
        console.warn("Failed to load new token", tid, err);
      }
    }
  });

  connection.onreconnected(() => {
    // Re-subscribe after reconnect
    subscribeToContract(connection);
  });

  try {
    await connection.start();
    await subscribeToContract(connection);
    console.log("TzKT live updates connected");
  } catch (err) {
    console.warn("TzKT WebSocket unavailable, live updates disabled:", err);
    // Site still works fine without it — just no auto-update
  }
}

async function subscribeToContract(connection) {
  await connection.invoke("SubscribeToTokenTransfers", {
    contract: CONTRACT,
  });
}
