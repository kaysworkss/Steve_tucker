// ─── CHAIN.JS — reads everything from Tezos via TzKT + Claude vision ─────────
// No hardcoded coords. Location is extracted from the sketch image itself.

const TZKT     = "https://api.tzkt.io/v1";
const IPFS_GW  = "https://ipfs.io/ipfs/";
const IPFS_GW2 = "https://cloudflare-ipfs.com/ipfs/"; // fallback gateway

// ── Helpers ───────────────────────────────────────────────────────────────────

function ipfsToHttp(uri, gateway = IPFS_GW) {
  if (!uri) return null;
  if (uri.startsWith("ipfs://")) return gateway + uri.slice(7);
  return uri;
}

// Pull a named attribute from TZIP-21 attributes array (if Tucker ever adds them)
function attr(meta, name) {
  if (!meta?.attributes) return null;
  const a = meta.attributes.find(x => x.name?.toLowerCase() === name.toLowerCase());
  return a?.value ?? null;
}

function localImageFor(name) {
  const n = name.toLowerCase();
  const key = Object.keys(LOCAL_IMAGES).find(k => n.includes(k) || k.includes(n.split(/[–—,]/)[0].trim()));
  return key ? LOCAL_IMAGES[key] : null;
}

// ── GEOCODING — place name → lat/lng via Nominatim (free, no key) ─────────────
const geocodeCache = {};

async function geocode(placeName) {
  if (!placeName) return null;
  if (geocodeCache[placeName]) return geocodeCache[placeName];

  try {
    const q = encodeURIComponent(placeName);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
      { headers: { "Accept-Language": "en", "User-Agent": "TuckerSketchbook/1.0" } }
    );
    const data = await res.json();
    if (data.length > 0) {
      const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      geocodeCache[placeName] = result;
      return result;
    }
  } catch (e) {
    console.warn("Geocode failed for", placeName, e);
  }
  return null;
}

// ── VISION — call Claude API to read handwritten text from sketch image ────────
// Uses the Anthropic API (available in artifacts/client-side via the site)
async function extractLocationFromImage(imageUrl) {
  try {
    // Fetch the image and convert to base64
    let url = imageUrl;
    let imgRes = await fetch(url).catch(() => null);

    // Try fallback gateway if first fails
    if (!imgRes || !imgRes.ok) {
      url = imageUrl.replace(IPFS_GW, IPFS_GW2);
      imgRes = await fetch(url).catch(() => null);
    }
    if (!imgRes || !imgRes.ok) return null;

    const blob = await imgRes.blob();
    const base64 = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.readAsDataURL(blob);
    });
    const mimeType = blob.type || "image/jpeg";

    // Call Claude vision
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mimeType, data: base64 }
            },
            {
              type: "text",
              text: `This is a field sketch by an artist. Look at any handwritten text on the image — typically written at the bottom or sides. Extract:
1. The location/place name (e.g. "Glass Beach", "Rend Lake", "Taos Pueblo")
2. The full location with state/country if present (e.g. "Port Allen, Kauai, HI" or "Southern Illinois")
3. The date if present (e.g. "Jul 30, 2011" or "7-30-11")

Respond ONLY with valid JSON, no markdown:
{"name":"...", "location":"...", "date":"..."}`
            }
          ]
        }]
      })
    });

    if (!response.ok) return null;
    const data = await response.json();
    const text = data.content?.[0]?.text?.trim();
    if (!text) return null;

    try {
      return JSON.parse(text.replace(/```json|```/g, "").trim());
    } catch {
      return null;
    }
  } catch (err) {
    console.warn("Vision extraction failed:", err);
    return null;
  }
}

// ── CACHE — persist extracted location data in localStorage ───────────────────
const CACHE_KEY = `tucker_locations_${CONTRACT}`;

function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  } catch { return {}; }
}

function saveCache(cache) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch {}
}

// ── MAIN: load all tokens + extract locations ─────────────────────────────────

async function loadAllTokens() {
  let raw = [];
  try {
    const url = `${TZKT}/tokens?contract=${CONTRACT}&limit=200&sort.asc=tokenId`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("TzKT " + res.status);
    raw = await res.json();
  } catch (err) {
    console.warn("Using local Tucker sketch fallback:", err);
    TOKENS = [...FALLBACK_TOKENS];
    return TOKENS;
  }

  if (!raw.length) {
    TOKENS = [...FALLBACK_TOKENS];
    return TOKENS;
  }

  const cache = loadCache();

  // 2. Build initial token objects
  TOKENS = raw.map(t => {
    const meta   = t.metadata || {};
    const name   = meta.name || `Token #${t.tokenId}`;
    const imgUri = ipfsToHttp(meta.displayUri || meta.artifactUri);
    const local  = localImageFor(name);

    // Check if on-chain attributes already have coords (future-proof)
    const latAttr = parseFloat(attr(meta, "lat"));
    const lngAttr = parseFloat(attr(meta, "lng"));

    // Check cache
    const cached = cache[t.tokenId];

    return {
      tokenId:  t.tokenId,
      name,
      subtitle: meta.description || "",
      img:      local || imgUri || "",
      ipfsImg:  imgUri,
      supply:   parseInt(t.totalSupply) || 0,
      holders:  t.holdersCount || 0,
      objktUrl: OBJKT_BASE + t.tokenId,
      listed:   null,
      soldOut:  false,
      price:    null,
      // From chain attributes (if Tucker adds them later)
      lat:      isNaN(latAttr) ? null : latAttr,
      lng:      isNaN(lngAttr) ? null : lngAttr,
      // From cache (previously extracted by vision)
      loc:      cached?.loc  || attr(meta, "location") || "",
      date:     cached?.date || attr(meta, "date") || "",
      // Will be filled by vision + geocoding
      _needsExtraction: !cached && isNaN(latAttr),
    };
  });

  // Apply cached coords
  for (const t of TOKENS) {
    const cached = cache[t.tokenId];
    if (cached?.lat) { t.lat = cached.lat; t.lng = cached.lng; }
  }

  return TOKENS;
}

// ── Run vision + geocoding for tokens that need it ────────────────────────────
// Called after gallery renders so the UI isn't blocked.
// Processes one token at a time to avoid rate limits.

async function enrichTokensWithVision(onTokenUpdated) {
  const cache  = loadCache();
  const needed = TOKENS.filter(t => t._needsExtraction && !cache[t.tokenId]);

  if (needed.length === 0) return;

  for (const token of needed) {
    // Skip tokens with no IPFS image
    if (!token.ipfsImg) continue;

    try {
      // Step 1: Claude reads the sketch image
      const extracted = await extractLocationFromImage(token.ipfsImg);
      if (!extracted) continue;

      token.loc  = extracted.location || extracted.name || "";
      token.date = extracted.date || "";

      // Step 2: Geocode the extracted location
      const searchTerm = extracted.location || extracted.name;
      const coords = await geocode(searchTerm);
      if (coords) {
        token.lat = coords.lat;
        token.lng = coords.lng;
      }

      // Cache the result
      cache[token.tokenId] = {
        loc:  token.loc,
        date: token.date,
        lat:  token.lat,
        lng:  token.lng,
      };
      saveCache(cache);
      token._needsExtraction = false;

      // Notify app.js to update this token's card + map pin
      if (onTokenUpdated) onTokenUpdated(token);

    } catch (err) {
      console.warn(`Vision failed for token ${token.tokenId}:`, err);
    }

    // Small delay between tokens to be kind to rate limits
    await new Promise(r => setTimeout(r, 800));
  }
}

async function fetchAvailability() {
  // Availability is optional; keep the gallery usable even when objkt/TzKT data
  // is unavailable or the local fallback dataset is being shown.
  TOKENS.forEach(t => {
    if (typeof t.listed === "undefined") t.listed = null;
    if (typeof t.soldOut === "undefined") t.soldOut = false;
    if (typeof t.price === "undefined") t.price = null;
  });
}

async function applyCoords(onTokenReady) {
  TOKENS.filter(t => t.lat && t.lng).forEach(t => onTokenReady?.(t));

  if (TOKENS.some(t => t._isFallback)) return;

  enrichTokensWithVision(token => {
    const card = document.querySelector(`.sketch-card[data-token-id="${token.tokenId}"]`);
    if (card) {
      card.querySelector(".card-loc").textContent = token.loc || "—";
      card.querySelector(".card-date").textContent = token.date || "";
    }
    if (token.lat && token.lng) onTokenReady?.(token);
  });
}

function startLiveUpdates() {
  // Placeholder for future SignalR/event wiring. The static site should not fail
  // if live update transport is absent.
}

// ── COLLECTORS ────────────────────────────────────────────────────────────────

async function loadAllHolders() {
  let all = [], offset = 0;
  while (true) {
    const url = `${TZKT}/tokens/balances?token.contract=${CONTRACT}&balance.gt=0&limit=500&offset=${offset}&select=account,balance,token`;
    const res  = await fetch(url);
    if (!res.ok) break;
    const batch = await res.json();
    all = all.concat(batch);
    if (batch.length < 500) break;
    offset += 500;
  }
  return all;
}

async function loadWalletHoldings(address) {
  const url = `${TZKT}/tokens/balances?token.contract=${CONTRACT}&account=${address}&balance.gt=0&select=token,balance`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error("TzKT wallet " + res.status);
  return res.json();
}

async function renderCollectors() {
  const wrap = document.getElementById("collectors-wrap");
  wrap.innerHTML = `<p class="loading-msg">Reading the Tezos blockchain…</p>`;
  try {
    const balances = await loadAllHolders();
    const BURN     = "tz1burnburnburnburnburnburnburjAYjjX";
    const byAddr   = {};

    for (const b of balances) {
      const addr = b.account.address;
      if (addr === BURN) continue;
      if (!byAddr[addr]) byAddr[addr] = { total: 0, tokenIds: [] };
      byAddr[addr].total += Number(b.balance);
      byAddr[addr].tokenIds.push(b.token.tokenId);
    }

    const entries = Object.entries(byAddr).sort((a, b) => b[1].total - a[1].total);
    const totalEl = document.getElementById("collectors-total");
    if (totalEl) totalEl.textContent = `${entries.length} collector${entries.length !== 1 ? "s" : ""}`;

    if (entries.length === 0) {
      wrap.innerHTML = `<p class="collectors-empty">No collectors found on-chain yet.</p>`;
      return;
    }

    const rows = entries.map(([addr, info], i) => {
      const short = addr.slice(0, 7) + "…" + addr.slice(-5);
      const works = info.tokenIds
        .map(tid => TOKENS.find(t => t.tokenId == tid)?.name || `#${tid}`)
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

    wrap.innerHTML = `
      <table class="collectors-table">
        <thead><tr><th>#</th><th>Collector</th><th>Held</th><th>Works</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
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
          b.className = "card-owned";
          b.textContent = "Collected";
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
  } catch (err) {
    console.warn("Wallet holdings error:", err);
  }
}
