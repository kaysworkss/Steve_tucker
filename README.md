# Tucker Sketchbook

A self-sustaining site for Tucker's field sketches. Tucker mints on objkt.
The site updates itself. Nothing else required.

**Contract:** `KT1V35dHCUUpXT9ZUbCY58KbWJzkgEpeE5E9`

---

## How it works

Tucker writes the place name and date directly on every sketch — always has.
The site uses that.

**On every page load:**
1. Fetches all tokens in the contract from `api.tzkt.io`
2. For each token, loads the sketch image from IPFS
3. Sends the image to Claude vision — reads Tucker's handwriting to extract location + date
4. Geocodes the place name via OpenStreetMap Nominatim → gets lat/lng
5. Places a pin on the map, fills the gallery card, updates the collectors list

Results are cached in localStorage so vision only runs once per token per device.
New mints appear automatically on the next page load.

**Tucker doesn't need to do anything differently when minting.**

---

## Deploy to Vercel

1. Push `tucker-site/` to a GitHub repo
2. Import at vercel.com — no build step, output directory `.`
3. Done

---

## Structure

```
tucker-site/
├── index.html
├── vercel.json
├── css/style.css
├── js/
│   ├── data.js      ← Contract address + local image map (only config needed)
│   ├── chain.js     ← TzKT reads + Claude vision + Nominatim geocoding + collectors
│   ├── app.js       ← Gallery, map, lightbox
│   └── wallet.js    ← Beacon SDK wallet connect
└── images/
    └── s0–s13.jpg   ← Optimised local images for first 14 sketches
                        New tokens load from IPFS automatically
```

## Adding a local image for a new sketch (optional)

New tokens load from IPFS by default. For a faster local image:
1. Add the file to `images/`
2. Add one line to `js/data.js` LOCAL_IMAGES object

That's the only code change you'll ever need to make.
