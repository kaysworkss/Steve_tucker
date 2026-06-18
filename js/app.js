// ─── APP.JS ───────────────────────────────────────────────────────────────────

let mapInstance, markersLayer;
let currentIdx = 0;
const pinsByTokenId  = {};
const activeCarousel = {};

document.addEventListener("DOMContentLoaded", async () => {
  const grid    = document.getElementById("gallery");
  const counter = document.getElementById("sketch-count");
  grid.innerHTML = `<p class="loading-msg" style="grid-column:1/-1">Loading from the blockchain…</p>`;

  if (window.L) {
    mapInstance = L.map("map", { scrollWheelZoom: false }).setView([36, -100], 4);
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

  if (counter) counter.textContent = TOKENS.length;
  grid.innerHTML = "";
  TOKENS.forEach((t, i) => addCard(t, i));

  // Fetch availability in background after cards exist, then update badges.
  fetchAvailability().then(() => {
    document.querySelectorAll(".sketch-card").forEach(card => {
      const tid   = String(card.dataset.tokenId);
      const token = TOKENS.find(t => String(t.tokenId) === tid);
      if (token) updateCardAvailability(card, token);
    });
  });

  // setupLightbox BEFORE applyCoords so openLightbox is defined when pins are clicked
  setupLightbox();
  await applyCoords(token => addPin(token));
  fitMapToPins();
  renderCollectors();

  startLiveUpdates(newToken => {
    const i = TOKENS.length - 1;
    addCard(newToken, i);
    if (newToken.lat && newToken.lng) addPin(newToken);
    if (counter) counter.textContent = TOKENS.length;
    showToast(`New sketch: "${newToken.name}"`);
    renderCollectors();
  });
});

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
}
// ── Gallery card ──────────────────────────────────────────────────────────────
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
  if (token.listed !== null) updateCardAvailability(card, token);
}

// ── Map pin + carousel popup ──────────────────────────────────────────────────
const PIN_SVG = `<svg width="18" height="26" viewBox="0 0 18 26" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="9" cy="25" rx="4" ry="1.3" fill="rgba(22,18,12,0.18)"/>
  <path d="M9 0C4.03 0 0 4.03 0 9c0 6.3 9 16 9 16S18 15.3 18 9C18 4.03 13.97 0 9 0z" fill="#7c3317"/>
  <circle cx="9" cy="9" r="3.5" fill="#f0ebe0"/>
</svg>`;

function addPin(token) {
  if (!window.L || !markersLayer || !token.lat || !token.lng) return;

  const grouped = TOKENS.filter(t =>
    t.lat && t.lng &&
    t.lat.toFixed(4) === token.lat.toFixed(4) &&
    t.lng.toFixed(4) === token.lng.toFixed(4)
  );

  // Reuse existing pin at same location
  const existingTid = Object.keys(pinsByTokenId).find(tid => {
    const t = TOKENS.find(x => x.tokenId === parseInt(tid));
    return t?.lat?.toFixed(4) === token.lat.toFixed(4) && t?.lng?.toFixed(4) === token.lng.toFixed(4);
  });
  if (existingTid) { pinsByTokenId[token.tokenId] = pinsByTokenId[existingTid]; return; }

  const marker = L.marker([token.lat, token.lng], {
    icon: L.divIcon({ className: "", html: PIN_SVG, iconSize: [18,26], iconAnchor: [9,26], popupAnchor: [0,-28] })
  });

  marker.on("mouseover", () => showCarousel(marker, grouped));
  marker.on("mouseout",  () => scheduleCarouselClose(`${token.lat.toFixed(4)},${token.lng.toFixed(4)}`));

  markersLayer.addLayer(marker);
  pinsByTokenId[token.tokenId] = marker;
}

function fitMapToPins() {
  if (!mapInstance || !markersLayer || markersLayer.getLayers().length === 0) return;
  const bounds = L.latLngBounds(markersLayer.getLayers().map(marker => marker.getLatLng()));
  mapInstance.fitBounds(bounds.pad(0.2), { maxZoom: 5 });
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
  const tokenIdx = TOKENS.indexOf(t);
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
    maxWidth: 220, minWidth: 200, className: "carousel-leaflet-popup", closeButton: false,
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

  window.openLightbox = function(i) {
    currentIdx = i;
    const t = TOKENS[i];
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
            if (pin) showCarousel(pin, TOKENS.filter(x =>
              x.lat?.toFixed(4) === t.lat.toFixed(4) && x.lng?.toFixed(4) === t.lng.toFixed(4)));
            document.getElementById("map-section")?.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 350);
        };
      } else {
        lbLocate.style.display = "none";
      }
    }

    lb.classList.add("open");
    document.body.style.overflow = "hidden";
  };

  function closeLightbox() { lb.classList.remove("open"); document.body.style.overflow = ""; }
  window.closeLightbox = closeLightbox;

  const step = d => openLightbox((currentIdx + d + TOKENS.length) % TOKENS.length);

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

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(message) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = message;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("toast-show"));
  setTimeout(() => { t.classList.remove("toast-show"); setTimeout(() => t.remove(), 400); }, 4000);
}
