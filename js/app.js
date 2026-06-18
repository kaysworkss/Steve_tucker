// ─── APP.JS ───────────────────────────────────────────────────────────────────

let mapInstance, markersLayer;
let currentIdx = 0;
let DISPLAY_TOKENS = [];
let OWNED_TOKEN_IDS = new Set();
let ACTIVE_WALLET_ADDRESS = "";
let collectionMode = "all";
const pinsByTokenId  = {};
const activeCarousel = {};

document.addEventListener("DOMContentLoaded", async () => {
  const grid    = document.getElementById("gallery");
  const counter = document.getElementById("sketch-count");
  grid.innerHTML = `<p class="loading-msg" style="grid-column:1/-1">Loading from the blockchain…</p>`;

  if (window.L) {
    mapInstance = L.map("map", {
      scrollWheelZoom: false,
      tap: true,
      touchZoom: true,
      zoomControl: false,
    }).setView([36, -100], 4);
    L.control.zoom({ position: "bottomright" }).addTo(mapInstance);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© <a href='https://openstreetmap.org'>OpenStreetMap</a>", maxZoom: 18,
    }).addTo(mapInstance);
    markersLayer = L.layerGroup().addTo(mapInstance);
  } else {
    document.getElementById("map").innerHTML = `<p class="loading-msg">Map unavailable. The sketches still load below.</p>`;
  }

  try { await loadAllTokens(); }
  catch {
    grid.innerHTML = `<p class="loading-msg" style="grid-column:1/-1">Could not reach the blockchain. Reload to try again.</p>`;
    return;
  }

  await fetchAvailability();
  DISPLAY_TOKENS = uniqueArtworkTokens(TOKENS);

  if (counter) counter.textContent = DISPLAY_TOKENS.length;
  grid.innerHTML = "";
  DISPLAY_TOKENS.forEach((t, i) => addCard(t, i));

  // setupLightbox BEFORE applyCoords so openLightbox is defined when pins are clicked
  setupLightbox();
  await applyCoords(token => {
    if (DISPLAY_TOKENS.some(t => String(t.tokenId) === String(token.tokenId))) addPin(token);
  });
  fitMapToPins();
  renderCollectors();

  startLiveUpdates(newToken => {
    DISPLAY_TOKENS = uniqueArtworkTokens(TOKENS);
    const i = DISPLAY_TOKENS.findIndex(t => String(t.tokenId) === String(newToken.tokenId));
    if (i >= 0) addCard(DISPLAY_TOKENS[i], i);
    if (newToken.lat && newToken.lng) addPin(newToken);
    if (counter) counter.textContent = DISPLAY_TOKENS.length;
    showToast(`New sketch: "${newToken.name}"`);
    renderCollectors();
  });
});

function uniqueArtworkTokens(tokens) {
  const groups = new Map();
  for (const token of tokens) {
    const key = token.img || `token-${token.tokenId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(token);
  }

  return [...groups.values()].map(group => {
    if (group.length === 1) return group[0];

    const sorted = [...group].sort((a, b) => artworkRank(b) - artworkRank(a));
    const chosen = { ...sorted[0] };
    const seen = new Set();
    chosen.collectors = group
      .flatMap(t => t.collectors || [])
      .filter(c => {
        if (!c.address || seen.has(c.address)) return false;
        seen.add(c.address);
        return true;
      });
    chosen.relatedTokens = group.map(t => t.tokenId);
    return chosen;
  });
}

function artworkRank(token) {
  let score = 0;
  if (token.availabilityKind !== "burned") score += 100;
  if (token.supply > 1) score += 40;
  if (token.availabilityKind === "open" || token.availabilityKind === "auction") score += 20;
  if ((token.collectors || []).length) score += 10;
  return score;
}

// ── Availability ──────────────────────────────────────────────────────────────
function availabilityBadge(token) {
  if (token.listed === null) return "";
  const text = token.availabilityText || (token.soldOut ? "Sold out" : "View on objkt");
  if (token.availabilityKind === "open" || token.availabilityKind === "auction") {
    return `<span class="avail-badge avail-open"><span class="avail-dot"></span>${text}</span>`;
  }
  if (token.soldOut) return `<span class="avail-badge avail-sold">${text}</span>`;
  return `<span class="avail-badge avail-unlisted">${text}</span>`;
}

function collectorLine(token) {
  const collectors = token.collectors || [];
  if (!collectors.length) return "";
  const names = collectors.map(c => c.name).filter(Boolean);
  const shown = names.slice(0, 3).join(", ");
  const extra = names.length > 3 ? ` +${names.length - 3}` : "";
  return `<p class="card-collectors">Collected by ${shown}${extra}</p>`;
}

function streetViewUrl(token) {
  if (!token?.streetView || !token?.lat || !token?.lng) return "";
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${token.lat},${token.lng}`;
}

function locationUrl(token) {
  if (!token?.lat || !token?.lng) return "";
  return `https://www.google.com/maps/search/?api=1&query=${token.lat},${token.lng}`;
}

function placePhotosUrl(token) {
  const query = token?.photoQuery || token?.loc;
  if (!token?.placePhotos || !query) return "";
  return `https://www.google.com/maps/search/${encodeURIComponent(query + " photos")}`;
}

function updateCardAvailability(card, token) {
  const existing = card.querySelector(".card-avail");
  if (existing) existing.remove();
  const existingCollectors = card.querySelector(".card-collectors");
  if (existingCollectors) existingCollectors.remove();
  if (token.listed === null) return;

  const div = document.createElement("div");
  div.className = "card-avail";
  const badge = availabilityBadge(token);

  if (token.availabilityKind === "open" || token.availabilityKind === "auction") {
    const a = document.createElement("a");
    a.className = "collect-btn";
    a.href = token.objktUrl;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = token.availabilityKind === "auction" ? "View auction" : "View on objkt";
    a.addEventListener("click", e => e.stopPropagation());
    div.innerHTML = badge;
    div.appendChild(a);
  } else {
    div.innerHTML = badge;
  }

  const body = card.querySelector(".card-body");
  body.appendChild(div);
  body.insertAdjacentHTML("beforeend", collectorLine(token));
  if (streetViewUrl(token)) {
    const a = document.createElement("a");
    a.className = "street-link";
    a.href = streetViewUrl(token);
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "Street view";
    a.addEventListener("click", e => e.stopPropagation());
    body.appendChild(a);
  }
  if (placePhotosUrl(token)) {
    const a = document.createElement("a");
    a.className = "street-link place-photos-link";
    a.href = placePhotosUrl(token);
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "Place photos";
    a.addEventListener("click", e => e.stopPropagation());
    body.appendChild(a);
  }
}
// ── Gallery card ──────────────────────────────────────────────────────────────
function addCard(token, i) {
  const grid = document.getElementById("gallery");
  const card = document.createElement("article");
  card.className = "sketch-card";
  card.dataset.tokenId = token.tokenId;
  card.dataset.relatedTokenIds = [token.tokenId, ...(token.relatedTokens || [])].map(String).join(",");
  card.setAttribute("tabindex", "0");
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `View ${token.name}`);
  card.innerHTML = `
    <div class="card-img-wrap">
      <img class="card-img" src="${token.img}" alt="${token.name}" loading="lazy"
           onerror="this.parentElement.style.background='var(--paper-3)'">
    </div>
    <div class="card-body">
      <p class="card-title">${token.name}</p>
      <p class="card-loc">${token.loc || "—"}</p>
      <p class="card-date">${token.date || ""}</p>
    </div>`;
  card.addEventListener("click", () => openLightbox(i));
  card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") openLightbox(i); });
  grid.appendChild(card);
  if (token.listed !== null) updateCardAvailability(card, token);
  updateCardOwnedState(card);
}

// ── Map pin + carousel popup ──────────────────────────────────────────────────
function pinSvg(owned = false) {
  const fill = owned ? "#4a6650" : "#7c3317";
  const ring = owned ? "#d8c07a" : "#f0ebe0";
  return `<svg width="22" height="30" viewBox="0 0 22 30" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="9" cy="25" rx="4" ry="1.3" fill="rgba(22,18,12,0.18)"/>
  <path d="M11 0C4.93 0 0 4.93 0 11c0 7.7 11 19 11 19s11-11.3 11-19C22 4.93 17.07 0 11 0z" fill="${fill}"/>
  ${owned ? `<path d="M11 3.2a7.8 7.8 0 1 1 0 15.6 7.8 7.8 0 0 1 0-15.6z" fill="none" stroke="${ring}" stroke-width="1.4"/>` : ""}
  <circle cx="11" cy="11" r="3.8" fill="#f0ebe0"/>
</svg>`;
}

function tokenIsOwned(token) {
  const ids = [token?.tokenId, ...(token?.relatedTokens || [])].map(String);
  return ids.some(id => OWNED_TOKEN_IDS.has(id));
}

function addPin(token) {
  if (!window.L || !markersLayer || !token.lat || !token.lng) return;

  const grouped = DISPLAY_TOKENS.filter(t =>
    t.lat && t.lng &&
    t.lat.toFixed(4) === token.lat.toFixed(4) &&
    t.lng.toFixed(4) === token.lng.toFixed(4)
  );

  // Reuse existing pin at same location
  const existingTid = Object.keys(pinsByTokenId).find(tid => {
    const t = DISPLAY_TOKENS.find(x => String(x.tokenId) === String(tid));
    return t?.lat?.toFixed(4) === token.lat.toFixed(4) && t?.lng?.toFixed(4) === token.lng.toFixed(4);
  });
  if (existingTid) { pinsByTokenId[token.tokenId] = pinsByTokenId[existingTid]; return; }

  const marker = L.marker([token.lat, token.lng], {
    icon: markerIconForGroup(grouped)
  });

  marker.on("mouseover", () => showCarousel(marker, grouped));
  marker.on("click", () => showCarousel(marker, grouped));
  marker.on("mouseout",  () => {
    if (isCoarsePointer()) return;
    scheduleCarouselClose(`${token.lat.toFixed(4)},${token.lng.toFixed(4)}`);
  });

  markersLayer.addLayer(marker);
  pinsByTokenId[token.tokenId] = marker;
}

function markerIconForGroup(tokens) {
  const owned = tokens.some(tokenIsOwned);
  return L.divIcon({
    className: owned ? "map-pin-icon map-pin-owned" : "map-pin-icon",
    html: pinSvg(owned),
    iconSize: [22, 30],
    iconAnchor: [11, 30],
    popupAnchor: [0, -30],
  });
}

function refreshOwnedPins() {
  if (!window.L) return;
  const seen = new Set();
  Object.entries(pinsByTokenId).forEach(([tokenId, marker]) => {
    if (!marker || seen.has(marker)) return;
    seen.add(marker);
    const token = DISPLAY_TOKENS.find(t => String(t.tokenId) === String(tokenId));
    if (!token?.lat || !token?.lng) return;
    const grouped = DISPLAY_TOKENS.filter(t =>
      t.lat && t.lng &&
      t.lat.toFixed(4) === token.lat.toFixed(4) &&
      t.lng.toFixed(4) === token.lng.toFixed(4)
    );
    marker.setIcon(markerIconForGroup(grouped));
  });
}

function isCoarsePointer() {
  return window.matchMedia?.("(pointer: coarse)")?.matches || window.innerWidth <= 600;
}

function fitMapToPins() {
  if (!mapInstance || !markersLayer || markersLayer.getLayers().length === 0) return;
  const bounds = L.latLngBounds(markersLayer.getLayers().map(marker => marker.getLatLng()));
  mapInstance.fitBounds(bounds.pad(isCoarsePointer() ? 0.08 : 0.2), { maxZoom: isCoarsePointer() ? 6 : 5 });
}

// ── Carousel ──────────────────────────────────────────────────────────────────
let carouselTimers = {};

function carouselHTML(key, tokens, idx) {
  const t    = tokens[idx];
  const dots = tokens.map((_, j) => `<span class="c-dot${j === idx ? " c-dot--on" : ""}"></span>`).join("");
  const avail = (t.availabilityKind === "open" || t.availabilityKind === "auction")
    ? `<a class="c-collect" href="${t.objktUrl}" target="_blank" rel="noopener">${t.availabilityKind === "auction" ? "View auction" : "View on objkt"}</a>`
    : t.soldOut
    ? `<span class="c-sold">${t.availabilityText || "Sold out"}</span>`
    : `<a class="c-collect c-collect--ghost" href="${t.objktUrl}" target="_blank" rel="noopener">View on objkt</a>`;
  const street = streetViewUrl(t)
    ? `<a class="c-open c-street" href="${streetViewUrl(t)}" target="_blank" rel="noopener">Street view</a>`
    : "";
  const photos = placePhotosUrl(t)
    ? `<a class="c-open c-street" href="${placePhotosUrl(t)}" target="_blank" rel="noopener">Place photos</a>`
    : "";
  const tokenIdx = DISPLAY_TOKENS.findIndex(token => String(token.tokenId) === String(t.tokenId));
  return `<div class="carousel-popup" data-key="${key}">
    <div class="c-img-wrap">
      <img class="c-img" src="${t.img}" alt="${t.name}">
      ${tokens.length > 1 ? `
        <button class="c-nav c-prev" onclick="carouselStep('${key}',-1)">‹</button>
        <button class="c-nav c-next" onclick="carouselStep('${key}',1)">›</button>` : ""}
    </div>
    <div class="c-body">
      <p class="c-title">${t.name}</p>
      <p class="c-meta">${[t.date, t.loc].filter(Boolean).join(" · ")}</p>
      ${avail}
      ${street}
      ${photos}
      <button class="c-open" onclick="openLightbox(${tokenIdx})">Open →</button>
    </div>
    ${tokens.length > 1 ? `<div class="c-dots">${dots}</div>` : ""}
  </div>`;
}

function showCarousel(marker, tokens) {
  const key = `${tokens[0].lat.toFixed(4)},${tokens[0].lng.toFixed(4)}`;
  clearTimeout(carouselTimers[key + "_close"]);

  let idx = activeCarousel[key]?.idx() ?? 0;
  activeCarousel[key] = { marker, tokens, idx: () => idx, setIdx: i => { idx = i; } };

  marker.unbindPopup();
  marker.bindPopup(carouselHTML(key, tokens, idx), {
    maxWidth: isCoarsePointer() ? 280 : 220,
    minWidth: isCoarsePointer() ? 250 : 200,
    className: "carousel-leaflet-popup",
    closeButton: isCoarsePointer(),
    autoPanPadding: isCoarsePointer() ? [18, 18] : [8, 8],
  });
  marker.openPopup();

  clearInterval(carouselTimers[key]);
  if (tokens.length > 1) {
    carouselTimers[key] = setInterval(() => {
      if (!marker.isPopupOpen()) { clearInterval(carouselTimers[key]); return; }
      idx = (idx + 1) % tokens.length;
      marker.getPopup()?.setContent(carouselHTML(key, tokens, idx));
    }, 3000);
  }

  // Keep open when hovering popup
  setTimeout(() => {
    const el = marker.getPopup()?.getElement();
    if (el) {
      el.addEventListener("mouseenter", () => clearTimeout(carouselTimers[key + "_close"]));
      el.addEventListener("mouseleave", () => scheduleCarouselClose(key));
    }
  }, 50);
}

window.carouselStep = function(key, dir) {
  const state = activeCarousel[key];
  if (!state) return;
  clearInterval(carouselTimers[key]);
  const newIdx = ((state.idx() + dir) + state.tokens.length) % state.tokens.length;
  state.setIdx(newIdx);
  state.marker.getPopup()?.setContent(carouselHTML(key, state.tokens, newIdx));
};

function scheduleCarouselClose(key) {
  carouselTimers[key + "_close"] = setTimeout(() => {
    activeCarousel[key]?.marker.closePopup();
    clearInterval(carouselTimers[key]);
    delete activeCarousel[key];
  }, 300);
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
function setupLightbox() {
  const lb         = document.getElementById("lightbox");
  const lbImg      = document.getElementById("lb-img");
  const lbTitle    = document.getElementById("lb-title");
  const lbSubtitle = document.getElementById("lb-subtitle");
  const lbDate     = document.getElementById("lb-date");
  const lbSupply   = document.getElementById("lb-supply");
  const lbCollect  = document.getElementById("lb-collect");
  const lbLocate   = document.getElementById("lb-locate");
  let lbStreet = document.getElementById("lb-street");
  if (!lbStreet && lbLocate?.parentElement) {
    lbStreet = document.createElement("a");
    lbStreet.id = "lb-street";
    lbStreet.className = "lb-btn lb-btn--locate";
    lbStreet.target = "_blank";
    lbStreet.rel = "noopener";
    lbStreet.textContent = "Street view";
    lbLocate.parentElement.appendChild(lbStreet);
  }
  let lbPhotos = document.getElementById("lb-photos");
  if (!lbPhotos && lbLocate?.parentElement) {
    lbPhotos = document.createElement("a");
    lbPhotos.id = "lb-photos";
    lbPhotos.className = "lb-btn lb-btn--locate";
    lbPhotos.target = "_blank";
    lbPhotos.rel = "noopener";
    lbPhotos.textContent = "Place photos";
    lbLocate.parentElement.appendChild(lbPhotos);
  }

  window.openLightbox = function(i) {
    currentIdx = i;
    const t = DISPLAY_TOKENS[i];
    lbImg.src              = t.img;
    lbImg.alt              = t.name;
    lbTitle.textContent    = t.name;
    lbSubtitle.textContent = t.subtitle || "";
    lbDate.textContent     = [t.date, t.loc].filter(Boolean).join(" · ");

    if (t.availabilityText) {
      lbSupply.textContent = t.availabilityText;
    } else if (t.supply === 1) {
      lbSupply.textContent = t.soldOut ? "1 of 1 · Sold" : t.listed > 0 ? "1 of 1 · Available" : "1 of 1";
    } else if (t.supply > 1) {
      lbSupply.textContent = `${t.listed ?? "?"} of ${t.supply} editions left`;
    } else {
      lbSupply.textContent = "";
    }

    if (lbCollect) {
      if (t.availabilityKind === "open" || t.availabilityKind === "auction") {
        lbCollect.textContent = t.availabilityKind === "auction" ? "View auction" : "View on objkt";
        lbCollect.classList.remove("lb-btn--ghost");
      } else {
        lbCollect.textContent = t.soldOut ? "Collected · objkt" : "View on objkt";
        lbCollect.classList.add("lb-btn--ghost");
      }
      lbCollect.href = t.objktUrl;
    }

    if (lbLocate) {
      if (mapInstance && t.lat && t.lng) {
        lbLocate.style.display = "";
        lbLocate.onclick = () => {
          closeLightbox();
          setTimeout(() => {
            mapInstance.flyTo([t.lat, t.lng], 10, { duration: 1.2 });
            const pin = pinsByTokenId[t.tokenId];
            if (pin) showCarousel(pin, DISPLAY_TOKENS.filter(x =>
              x.lat?.toFixed(4) === t.lat.toFixed(4) && x.lng?.toFixed(4) === t.lng.toFixed(4)));
            document.getElementById("map-section")?.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 350);
        };
      } else {
        lbLocate.style.display = "none";
      }
    }

    if (lbStreet) {
      const url = streetViewUrl(t);
      lbStreet.style.display = url ? "" : "none";
      lbStreet.href = url || "#";
    }

    if (lbPhotos) {
      const url = placePhotosUrl(t);
      lbPhotos.style.display = url ? "" : "none";
      lbPhotos.href = url || "#";
    }

    lb.classList.add("open");
    document.body.style.overflow = "hidden";
  };

  function closeLightbox() { lb.classList.remove("open"); document.body.style.overflow = ""; }
  window.closeLightbox = closeLightbox;

  const step = d => openLightbox((currentIdx + d + DISPLAY_TOKENS.length) % DISPLAY_TOKENS.length);

  document.getElementById("lb-close").addEventListener("click", closeLightbox);
  lb.addEventListener("click", e => { if (e.target === lb) closeLightbox(); });
  document.getElementById("lb-prev").addEventListener("click", () => step(-1));
  document.getElementById("lb-next").addEventListener("click", () => step(1));
  document.addEventListener("keydown", e => {
    if (!lb.classList.contains("open")) return;
    if (e.key === "Escape")     closeLightbox();
    if (e.key === "ArrowLeft")  step(-1);
    if (e.key === "ArrowRight") step(1);
  });
}

function setupCollectionControls() {
  const panel = document.getElementById("my-collection");
  if (!panel || panel.querySelector(".my-col-actions")) return;
  const actions = document.createElement("div");
  actions.className = "my-col-actions";
  actions.innerHTML = `
    <button type="button" class="my-col-action active" data-mode="all">All sketches</button>
    <button type="button" class="my-col-action" data-mode="owned">My sketches</button>
    <button type="button" class="my-col-action" data-mode="map">My places on map</button>
  `;
  panel.appendChild(actions);
  actions.addEventListener("click", e => {
    const btn = e.target.closest("button[data-mode]");
    if (!btn) return;
    collectionMode = btn.dataset.mode;
    actions.querySelectorAll(".my-col-action").forEach(b => b.classList.toggle("active", b === btn));
    applyCollectionMode();
  });
}

function updateCardOwnedState(card) {
  if (!card) return false;
  const ids = (card.dataset.relatedTokenIds || card.dataset.tokenId || "").split(",").filter(Boolean);
  const owned = ids.some(id => OWNED_TOKEN_IDS.has(String(id)));
  card.classList.toggle("is-owned", owned);
  card.hidden = collectionMode === "owned" && !owned;
  const existing = card.querySelector(".card-owned");
  if (owned && !existing) {
    const b = document.createElement("div");
    b.className = "card-owned";
    b.textContent = "In your collection";
    card.appendChild(b);
  } else if (!owned && existing) {
    existing.remove();
  }
  return owned;
}

function applyCollectionMode() {
  const ownedCards = [];
  const otherCards = [];
  document.querySelectorAll(".sketch-card").forEach(card => {
    (updateCardOwnedState(card) ? ownedCards : otherCards).push(card);
  });

  const grid = document.getElementById("gallery");
  if (grid) [...ownedCards, ...otherCards].forEach(card => grid.appendChild(card));

  document.getElementById("gallery-section")?.classList.toggle("show-owned-only", collectionMode === "owned");
  document.getElementById("map-section")?.classList.toggle("show-owned-map", collectionMode === "map");

  if (collectionMode === "owned") {
    document.getElementById("gallery-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (collectionMode === "map") {
    document.getElementById("map-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    fitMapToOwnedPins();
  }
}

function fitMapToOwnedPins() {
  if (!mapInstance || !markersLayer || OWNED_TOKEN_IDS.size === 0) return;
  const ownedLatLngs = DISPLAY_TOKENS
    .filter(t => tokenIsOwned(t) && t.lat && t.lng)
    .map(t => [t.lat, t.lng]);
  if (!ownedLatLngs.length) return;
  mapInstance.fitBounds(L.latLngBounds(ownedLatLngs).pad(0.22), { maxZoom: isCoarsePointer() ? 7 : 6 });
}

window.applyWalletCollectionState = function(address, holdings = []) {
  ACTIVE_WALLET_ADDRESS = address || "";
  window.ACTIVE_TUCKER_WALLET = ACTIVE_WALLET_ADDRESS;
  const ownedIds = holdings.map(h => String(h.token?.tokenId ?? h.tokenId)).filter(Boolean);
  OWNED_TOKEN_IDS = new Set(ownedIds);
  setupCollectionControls();
  applyCollectionMode();
  refreshOwnedPins();
  document.querySelectorAll(".collector-row").forEach(r =>
    r.classList.toggle("is-me", r.dataset.addr === address));
};

window.clearWalletCollectionState = function() {
  OWNED_TOKEN_IDS = new Set();
  ACTIVE_WALLET_ADDRESS = "";
  window.ACTIVE_TUCKER_WALLET = "";
  collectionMode = "all";
  document.querySelectorAll(".my-col-action").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.mode === "all"));
  applyCollectionMode();
  refreshOwnedPins();
  document.querySelectorAll(".collector-row.is-me").forEach(r => r.classList.remove("is-me"));
};

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(message) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = message;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("toast-show"));
  setTimeout(() => { t.classList.remove("toast-show"); setTimeout(() => t.remove(), 400); }, 4000);
}
