// ─── CONTRACT CONFIG ──────────────────────────────────────────────────────────
// This is the only file that needs editing for site configuration.
// All tokens, images, locations and collectors are read live from the blockchain.

const CONTRACT        = "KT1V35dHCUUpXT9ZUbCY58KbWJzkgEpeE5E9";
const CREATOR_ADDRESS = "tz1MNyWtbh2BLJZvRq68o4LCaHdRWjETjjwV";
const OBJKT_BASE      = "https://objkt.com/tokens/" + CONTRACT + "/";
const BURN_ADDRESS    = "tz1burnburnburnburnburnburnburjAYjjX";
const MARKET_CONTRACTS = new Set([
  "KT1WvzYHCNBvDSdwafTHv7nJ1dWmZ8GZL1vg", // objkt marketplace v1
  "KT1FvqJwELVY9g5ggPYA7bDYyDgAtaRs1XNT", // objkt marketplace v2
  "KT1Aq4wWmVanpQhq4TTfjZXB5AjFpx15iQMM", // objkt english auctions
  "KT18p94vjkkHYY3nPmernmgVR7HiZi3Tf89e", // hen marketplace
  "KT18iSHoRW1iogamADWwQSDoZa3QkN4izkqj", // objkt english auctions v2
]);

const ACCOUNT_NAMES = {
  [CREATOR_ADDRESS]: "Steve Tucker",
};

// ─── KNOWN TOKEN DETAILS ──────────────────────────────────────────────────────
// Matched against token name + description (case-insensitive substring).
// Provides coords, location label, and optional place links.
// New mints are handled automatically — add an entry here only to improve
// geocoding accuracy for a specific sketch.
const KNOWN_TOKEN_DETAILS = [
  { match: "philmont",            loc: "Philmont Scout Ranch, Cimarron, NM",       lat: 36.5041, lng: -104.9170 },
  { match: "tahquamenon",         loc: "Tahquamenon River, Michigan UP",             lat: 46.5596, lng: -85.0310 },
  { match: "cimarron",            loc: "Cimarron, New Mexico",                       lat: 36.5109, lng: -104.9158, streetView: true, placePhotos: true },
  { match: "quiet morning in camp", loc: "Philmont Scout Ranch, Cimarron, NM",      lat: 36.5041, lng: -104.9170 },
  { match: "red willow creek",    loc: "Taos Pueblo, New Mexico",                    lat: 36.4386, lng: -105.5444, placePhotos: true },
  { match: "rend lake",           loc: "Rend Lake, Southern Illinois",               lat: 37.9970, lng: -88.8770,  placePhotos: true, photoQuery: "Rend Lake, Illinois" },
  { match: "lady security officer", loc: "Taos Indian Casino, NM",                  lat: 36.4350, lng: -105.5750 },
  { match: "barking sands",       loc: "Polihale State Park, Kauai, HI",             lat: 22.0797, lng: -159.7596, placePhotos: true },
  { match: "old kaloa",           loc: "Old Koloa Town, Kauai, HI",                  lat: 21.9069, lng: -159.4694, streetView: true, placePhotos: true },
  { match: "old koloa",           loc: "Old Koloa Town, Kauai, HI",                  lat: 21.9069, lng: -159.4694, streetView: true, placePhotos: true },
  { match: "hanalei",             loc: "Hanalei, Kauai, HI",                         lat: 22.2034, lng: -159.4971, streetView: true, placePhotos: true },
  { match: "glass beach",         loc: "Glass Beach, Port Allen, Kauai, HI",         lat: 21.9024, lng: -159.5904, streetView: true, placePhotos: true },
  { match: "koloa landing",       loc: "Koloa Landing, Kauai, HI",                   lat: 21.8779, lng: -159.4736, streetView: true, placePhotos: true },
  { match: "pictured rocks",      loc: "Pictured Rocks National Lakeshore, MI",      lat: 46.5618, lng: -86.3168,  placePhotos: true },
  { match: "skylift",             loc: "Natural Bridge State Resort Park, Slade, KY", lat: 37.7781, lng: -83.6851, streetView: true, placePhotos: true },
  { match: "north shore campers", loc: "North Shore, Kauai, HI",                     lat: 22.2093, lng: -159.4686, placePhotos: true },
  { match: "wind-blown tree",     loc: "Kealia Beach, Kauai, HI",                    lat: 22.0979, lng: -159.3073, streetView: true, placePhotos: true },
  { match: "taos pueblo",         loc: "Taos Pueblo, New Mexico",                    lat: 36.4386, lng: -105.5444, placePhotos: true },
  { match: "quiet creek",         loc: "Taos Pueblo, New Mexico",                    lat: 36.4386, lng: -105.5444, placePhotos: true },
  { match: "cozumel",             loc: "Cozumel, Mexico",                            lat: 20.4229, lng: -86.9223,  streetView: true, placePhotos: true },
  { match: "sandusky campground", loc: "S. Sandusky Campground, Benton, IL",         lat: 37.9656, lng: -88.8914,  placePhotos: true },
  { match: "sandusky campsite",   loc: "S. Sandusky Campground, Benton, IL",         lat: 37.9656, lng: -88.8914,  placePhotos: true },
  { match: "marcum campground",   loc: "S. Marcum Campground, Benton, IL",           lat: 37.9589, lng: -88.9012,  placePhotos: true },
  { match: "marcum campgrounds",  loc: "S. Marcum Campground, Benton, IL",           lat: 37.9589, lng: -88.9012,  placePhotos: true },
];

// Runtime — populated by chain.js on every page load
let TOKENS = [];

// Fallback shown if TzKT is unreachable — no local images, just placeholders
const FALLBACK_TOKENS = [];
