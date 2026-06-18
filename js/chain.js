// ─── CHAIN.JS — reads everything from Tezos via TzKT + Claude vision ─────────
// No hardcoded coords. Location is extracted from the sketch image itself.

const TZKT     = "https://api.tzkt.io/v1";
const IPFS_GW  = "https://ipfs.io/ipfs/";
const IPFS_GW2 = "https://cloudflare-ipfs.com/ipfs/"; // fallback gateway
const OBJKT_GQL = "https://data.objkt.com/v3/graphql";

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

function knownDetailsFor(name, description = "") {
  const haystack = `${name || ""} ${description || ""}`.toLowerCase();
  return KNOWN_TOKEN_DETAILS.find(item => haystack.includes(item.match)) || null;
}

function dateFromDescription(description = "") {
  return description.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},\s+\d{4}\b/i)?.[0]
    || description.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/)?.[0]
    || "";
}

function locFromDescription(description = "") {
  if (!description.trim()) return "";

  // Split on blank line (the separator Steve uses between place and date)
  const parts = description.split(/\n\n+/).map(s => s.trim()).filter(Boolean);

  // If there's more than one part, everything before the last part is location
  if (parts.length >= 2) {
    const loc = parts.slice(0, -1)
      .join(", ")
      .replace(/\n+/g, ", ") // normalize any single newlines within the loc
      .trim();
    // Make sure we're not returning a date string as the location
    if (!dateFromDescription(loc) || loc.length > 20) return loc;
  }

  // Single part — check if it's just a date; if so, no location
  const single = parts[0]?.replace(/\n+/g, ", ").trim() || "";
  if (dateFromDescription(single) && single.length < 30) return "";

  // Single part that's not a date: treat as location
  return single;
}

// Returns true when a name/description refers to a context that has no fixed
// geographic pin — e.g. a cruise ship, plane, or open ocean.
// These tokens still show in the gallery with their description, just no map pin.
const NO_PIN_PATTERNS = /\b(cruise|cruise\s*ship|ship|vessel|ocean\s*liner|ms\s+\w+|mv\s+\w+|ss\s+\w+|rms\s+\w+|at\s+sea|open\s+ocean|international\s+waters)\b/i;

function isNoPin(name = "", description = "") {
  return NO_PIN_PATTERNS.test(name) || NO_PIN_PATTERNS.test(description);
}

function shortAddress(address) {
  return address ? address.slice(0, 7) + "…" + address.slice(-5) : "";
}

function accountDisplayName(accountOrAddress) {
  const address = typeof accountOrAddress === "string" ? accountOrAddress : accountOrAddress?.address;
  if (!address) return "";
  return ACCOUNT_NAMES[address]
    || (typeof accountOrAddress === "object" ? accountOrAddress.alias : "")
    || shortAddress(address);
}

async function hydrateAccountNames(addresses) {
  const missing = [...new Set(addresses)]
    .filter(Boolean)
    .filter(addr => !ACCOUNT_NAMES[addr] && !MARKET_CONTRACTS.has(addr) && addr !== BURN_ADDRESS);

  if (!missing.length) return ACCOUNT_NAMES;

  try {
    const res = await fetch(OBJKT_GQL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query HolderNames($addresses:[String!]) {
          holder(where:{address:{_in:$addresses}}) {
            address
            alias
            tzdomain
            twitter
          }
        }`,
        variables: { addresses: missing },
      }),
    });
    if (!res.ok) throw new Error("objkt profiles " + res.status);
    const data = await res.json();
    for (const holder of data.data?.holder || []) {
      const name = holder.alias || holder.tzdomain || holder.twitter?.replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//, "@");
      if (name) ACCOUNT_NAMES[holder.address] = name;
    }
  } catch (err) {
    console.warn("objkt profile lookup failed:", err);
  }

  return ACCOUNT_NAMES;
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
    const imgUri = ipfsToHttp(meta.displayUri || meta.artifactUri || meta.thumbnailUri || meta.image);
    const known  = knownDetailsFor(name, meta.description);

    // Check if on-chain attributes already have coords (future-proof)
    const latAttr = parseFloat(attr(meta, "lat"));
    const lngAttr = parseFloat(attr(meta, "lng"));

    // Check cache
    const cached = cache[t.tokenId];
    const descLoc = locFromDescription(meta.description);
    const neverPin = isNoPin(name, meta.description || "");

    return {
      tokenId:  t.tokenId,
      name,
      subtitle: meta.description || "",
      img:      imgUri || "",
      ipfsImg:  imgUri,
      supply:   parseInt(t.totalSupply) || 0,
      holders:  t.holdersCount || 0,
      objktUrl: OBJKT_BASE + t.tokenId,
      creator:  meta.creators?.[0] || CREATOR_ADDRESS,
      listed:   null,
      soldOut:  false,
      price:    null,
      availabilityText: "",
      availabilityKind: "",
      streetView: !!known?.streetView,
      placePhotos: !!known?.placePhotos,
      photoQuery: known?.photoQuery || known?.loc || "",
      // noPin: true means the subject has no fixed location (cruise, open ocean, etc.)
      // The card still renders fully — just no map pin is ever placed.
      noPin: neverPin,
      // From chain attributes (if Tucker adds them later)
      lat:      neverPin ? null : (isNaN(latAttr) ? known?.lat ?? null : latAttr),
      lng:      neverPin ? null : (isNaN(lngAttr) ? known?.lng ?? null : lngAttr),
      // loc: best available description of where the sketch was made
      loc:      cached?.loc  || attr(meta, "location") || known?.loc || descLoc || "",
      date:     cached?.date || attr(meta, "date") || known?.date || dateFromDescription(meta.description),
      // needs vision only when: no cache, no known entry, no on-chain location attr,
      // no description-parsed loc, AND not a known no-pin subject
      _needsExtraction: !neverPin && !cached && isNaN(latAttr) && !known && !attr(meta, "location") && !descLoc,
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
  const byTokenId = {};

  try {
    let offset = 0;
    while (true) {
      const url = `${TZKT}/tokens/balances?token.contract=${CONTRACT}&balance.gt=0&limit=500&offset=${offset}&select=account,balance,token`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("TzKT balances " + res.status);
      const batch = await res.json();
      for (const b of batch) {
        const tid = String(b.token.tokenId);
        if (!byTokenId[tid]) byTokenId[tid] = [];
        byTokenId[tid].push(b);
      }
      if (batch.length < 500) break;
      offset += 500;
    }
  } catch (err) {
    console.warn("Availability lookup failed:", err);
  }

  await hydrateAccountNames(Object.values(byTokenId)
    .flat()
    .map(b => b.account.address));

  TOKENS.forEach(t => {
    const balances = byTokenId[String(t.tokenId)] || [];
    const creatorBalance = balances
      .filter(b => b.account.address === (t.creator || CREATOR_ADDRESS))
      .reduce((sum, b) => sum + Number(b.balance || 0), 0);
    const marketBalance = balances
      .filter(b => MARKET_CONTRACTS.has(b.account.address))
      .reduce((sum, b) => sum + Number(b.balance || 0), 0);
    const burnBalance = balances
      .filter(b => b.account.address === BURN_ADDRESS)
      .reduce((sum, b) => sum + Number(b.balance || 0), 0);
    const collectorEntries = balances
      .filter(b => b.account.address !== (t.creator || CREATOR_ADDRESS))
      .filter(b => b.account.address !== BURN_ADDRESS)
      .filter(b => !MARKET_CONTRACTS.has(b.account.address))
      .map(b => ({
        address: b.account.address,
        name: accountDisplayName(b.account),
        count: Number(b.balance || 0),
      }));

    t.price = null;
    t.collectors = collectorEntries;
    if (t.supply > 1) {
      t.listed = creatorBalance;
      t.soldOut = creatorBalance === 0;
      t.availabilityKind = creatorBalance > 0 ? "open" : "sold";
      t.availabilityText = creatorBalance > 0
        ? `${creatorBalance} of ${t.supply} editions left`
        : "Sold out";
    } else if (marketBalance > 0) {
      t.listed = marketBalance;
      t.soldOut = false;
      t.availabilityKind = "auction";
      t.availabilityText = "At auction";
    } else if (creatorBalance > 0) {
      t.listed = 0;
      t.soldOut = false;
      t.availabilityKind = "artist";
      t.availabilityText = "Held by artist";
    } else {
      t.listed = 0;
      t.soldOut = true;
      t.availabilityKind = burnBalance > 0 ? "burned" : "sold";
      t.availabilityText = burnBalance > 0 ? "Burned" : "Collected";
    }
  });
}

async function applyCoords(onTokenReady) {
  // Pass 1 — tokens that already have coords (from KNOWN_TOKEN_DETAILS or cache)
  TOKENS.filter(t => !t.noPin && t.lat && t.lng).forEach(t => onTokenReady?.(t));

  if (TOKENS.some(t => t._isFallback)) return;

  // Pass 2 — tokens with a loc string but no coords yet: geocode the loc
  const needsGeocode = TOKENS.filter(t => !t.noPin && !t.lat && !t.lng && t.loc);
  for (const token of needsGeocode) {
    const coords = await geocode(token.loc);
    if (coords) {
      token.lat = coords.lat;
      token.lng = coords.lng;
      const cache = loadCache();
      cache[token.tokenId] = { ...cache[token.tokenId], lat: coords.lat, lng: coords.lng };
      saveCache(cache);
      onTokenReady?.(token);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // Pass 3 — tokens with no loc but a meaningful name: try geocoding the name.
  const needsNameGeocode = TOKENS.filter(t =>
    !t.noPin && !t.lat && !t.lng && !t.loc &&
    t.name && !t.name.startsWith("Token #") && !t._needsExtraction
  );
  for (const token of needsNameGeocode) {
    const looksLikePlace = /,|beach|lake|park|river|canyon|mountain|island|falls|bay|cove|trail|camp|pueblo|ranch|gorge/i.test(token.name);
    if (!looksLikePlace) continue;
    const coords = await geocode(token.name);
    if (coords) {
      token.lat = coords.lat;
      token.lng = coords.lng;
      token.loc = token.loc || token.name;
      const cache = loadCache();
      cache[token.tokenId] = { ...cache[token.tokenId], lat: coords.lat, lng: coords.lng, loc: token.loc };
      saveCache(cache);
      onTokenReady?.(token);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // Pass 4 — tokens with no loc, no coords, and no description: use vision
  const needsVision = TOKENS.filter(t => !t.noPin && !t.lat && !t.lng && !t.loc && t.ipfsImg && t._needsExtraction);
  if (!needsVision.length) return;
  await enrichTokensWithVision(token => {
    onTokenReady?.(token);
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
    const byAddr   = {};

    for (const b of balances) {
      const addr = b.account.address;
      if (addr === BURN_ADDRESS || MARKET_CONTRACTS.has(addr)) continue;
      if (!byAddr[addr]) byAddr[addr] = { total: 0, tokenIds: [], name: ACCOUNT_NAMES[addr] || b.account.alias || "" };
      if (b.account.alias && !byAddr[addr].name) byAddr[addr].name = b.account.alias;
      byAddr[addr].total += Number(b.balance);
      byAddr[addr].tokenIds.push(b.token.tokenId);
    }

    await hydrateAccountNames(Object.keys(byAddr));
    for (const [addr, info] of Object.entries(byAddr)) {
      info.name = ACCOUNT_NAMES[addr] || info.name;
    }

    const entries = Object.entries(byAddr).sort((a, b) => b[1].total - a[1].total);
    const totalEl = document.getElementById("collectors-total");
    if (totalEl) totalEl.textContent = `${entries.length} collector${entries.length !== 1 ? "s" : ""}`;

    if (entries.length === 0) {
      wrap.innerHTML = `<p class="collectors-empty">No collectors found on-chain yet.</p>`;
      return;
    }

    const rows = entries.map(([addr, info], i) => {
      const short = shortAddress(addr);
      const displayName = info.name || short;
      const addrLine = info.name ? short : "";
      const works = info.tokenIds
        .map(tid => TOKENS.find(t => t.tokenId == tid)?.name || `#${tid}`)
        .filter((v, j, a) => a.indexOf(v) === j).slice(0, 3).join(", ");
      return `<tr class="collector-row" data-addr="${addr}">
        <td class="col-rank">${i + 1}</td>
        <td class="col-addr">
          <span class="collector-identity">
            <span class="collector-name" title="${addr}">${displayName}</span>
            ${addrLine ? `<span class="collector-addr-short">${addrLine}</span>` : ""}
          </span>
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
    const activeWallet = window.ACTIVE_TUCKER_WALLET || "";
    if (activeWallet) {
      document.querySelectorAll(".collector-row").forEach(r =>
        r.classList.toggle("is-me", r.dataset.addr === activeWallet));
    }
  } catch (err) {
    console.error(err);
    wrap.innerHTML = `<p class="collectors-empty">Could not reach the blockchain. Reload to try again.</p>`;
  }
}

async function markWalletOwned(address) {
  try {
    const holdings = await loadWalletHoldings(address);
    const ownedIds = new Set(holdings.map(h => String(h.token.tokenId)));
    const count = [...document.querySelectorAll(".sketch-card")].filter(card => {
      const ids = (card.dataset.relatedTokenIds || card.dataset.tokenId || "").split(",").filter(Boolean);
      return ids.some(id => ownedIds.has(String(id)));
    }).length;
    document.getElementById("my-col-count").textContent = count;
    document.getElementById("my-col-sub").textContent = count === 0
      ? "You don't hold any Tucker sketches yet."
      : count === 1 ? "You hold 1 Tucker sketch. It has moved to the top of the gallery."
      : `You hold ${count} Tucker sketches. They have moved to the top of the gallery.`;
    window.applyWalletCollectionState?.(address, holdings);
    return count;
  } catch (err) {
    console.warn("Wallet holdings error:", err);
    return 0;
  }
}
