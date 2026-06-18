// ─── APP.JS ───────────────────────────────────────────────────────────────────

let mapInstance, markersLayer;
let currentIdx = 0;
const pinsByTokenId = {};

document.addEventListener("DOMContentLoaded", async () => {
  const grid    = document.getElementById("gallery");
  const counter = document.getElementById("sketch-count");
  grid.innerHTML = `<p class="loading-msg" style="grid-column:1/-1">Loading from the blockchain…</p>`;

  // Init map early
  mapInstance = L.map("map", { scrollWheelZoom: false }).setView([36, -100], 4);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© <a href='https://openstreetmap.org'>OpenStreetMap</a>", maxZoom: 18,
  }).addTo(mapInstance);
  markersLayer = L.layerGroup().addTo(mapInstance);

  // Load tokens from chain
  try { await loadAllTokens(); }
  catch (err) {
    grid.innerHTML = `<p class="loading-msg" style="grid-column:1/-1">Could not reach the blockchain. Reload to try again.</p>`;
    return;
  }

  if (counter) counter.textContent = TOKENS.length;

  // Build gallery
  grid.innerHTML = "";
  TOKENS.forEach((t, i) => addCard(t, i));

  // Apply coords instantly for known tokens, geocode unknowns in background
  await applyCoords(token => addPin(token));

  // Lightbox
  setupLightbox();

  // Collectors
  renderCollectors();

  // ── Live updates ────────────────────────────────────────────────────────────
  startLiveUpdates((newToken) => {
    // Add gallery card
    const i = TOKENS.length - 1; // it was just pushed to TOKENS in chain.js
    addCard(newToken, i);

    // Add map pin
    if (newToken.lat && newToken.lng) addPin(newToken);

    // Update counter
    if (counter) counter.textContent = TOKENS.length;

    // Toast notification
    showToast(`New sketch minted: "${newToken.name}"`);

    // Refresh collectors (new mint = new holder activity)
    renderCollectors();
  });
});

// ── Build a gallery card ──────────────────────────────────────────────────────
function addCard(token, i) {
  const grid = document.getElementById("gallery");
  const card = document.createElement("article");
  card.className = "sketch-card";
  card.dataset.tokenId = token.tokenId;
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
}

// ── Map pin ───────────────────────────────────────────────────────────────────
const PIN_SVG = `<svg width="18" height="26" viewBox="0 0 18 26" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="9" cy="25" rx="4" ry="1.3" fill="rgba(22,18,12,0.18)"/>
  <path d="M9 0C4.03 0 0 4.03 0 9c0 6.3 9 16 9 16S18 15.3 18 9C18 4.03 13.97 0 9 0z" fill="#7c3317"/>
  <circle cx="9" cy="9" r="3.5" fill="#f0ebe0"/>
</svg>`;

function addPin(token) {
  if (pinsByTokenId[token.tokenId] || !token.lat || !token.lng) return;
  const idx    = TOKENS.findIndex(t => t.tokenId === token.tokenId);
  const marker = L.marker([token.lat, token.lng], {
    icon: L.divIcon({ className: "", html: PIN_SVG, iconSize: [18,26], iconAnchor: [9,26], popupAnchor: [0,-28] })
  });
  marker.bindPopup(`
    <div style="font-family:'Instrument Sans',sans-serif;min-width:155px;">
      <strong style="font-family:'DM Serif Display',serif;font-size:0.95rem;display:block;margin-bottom:3px;">${token.name}</strong>
      ${token.loc  ? `<span style="font-size:0.75rem;color:#7a6e5a;display:block;">${token.loc}</span>`  : ""}
      ${token.date ? `<span style="font-size:0.7rem;color:#7a6e5a;font-style:italic;">${token.date}</span>` : ""}
    </div>`);
  marker.on("click", () => setTimeout(() => openLightbox(idx), 250));
  markersLayer.addLayer(marker);
  pinsByTokenId[token.tokenId] = marker;
}

// ── Toast notification ────────────────────────────────────────────────────────
function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast-show"));
  setTimeout(() => {
    toast.classList.remove("toast-show");
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
function setupLightbox() {
  const lb         = document.getElementById("lightbox");
  const lbImg      = document.getElementById("lb-img");
  const lbTitle    = document.getElementById("lb-title");
  const lbSubtitle = document.getElementById("lb-subtitle");
  const lbDate     = document.getElementById("lb-date");
  const lbSupply   = document.getElementById("lb-supply");
  const lbObjkt    = document.getElementById("lb-objkt");

  window.openLightbox = function(i) {
    currentIdx = i;
    const t = TOKENS[i];
    lbImg.src              = t.img;
    lbImg.alt              = t.name;
    lbTitle.textContent    = t.name;
    lbSubtitle.textContent = t.subtitle || "";
    lbDate.textContent     = [t.date, t.loc].filter(Boolean).join(" · ");
    lbSupply.textContent   = t.supply
      ? `Edition of ${t.supply} · ${t.holders} collector${t.holders !== 1 ? "s" : ""}` : "";
    lbObjkt.href           = t.objktUrl;
    lb.classList.add("open");
    document.body.style.overflow = "hidden";
  };

  const close = () => { lb.classList.remove("open"); document.body.style.overflow = ""; };
  const step  = d  => openLightbox((currentIdx + d + TOKENS.length) % TOKENS.length);

  document.getElementById("lb-close").addEventListener("click", close);
  lb.addEventListener("click", e => { if (e.target === lb) close(); });
  document.getElementById("lb-prev").addEventListener("click", () => step(-1));
  document.getElementById("lb-next").addEventListener("click", () => step(1));
  document.addEventListener("keydown", e => {
    if (!lb.classList.contains("open")) return;
    if (e.key === "Escape")     close();
    if (e.key === "ArrowLeft")  step(-1);
    if (e.key === "ArrowRight") step(1);
  });
}
