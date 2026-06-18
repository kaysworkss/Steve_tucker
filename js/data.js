// ─── THE ONLY CONFIG NEEDED ───────────────────────────────────────────────────
// Everything else — tokens, locations, dates, collectors — is read automatically
// from the Tezos blockchain and the sketch images themselves.

const CONTRACT   = "KT1V35dHCUUpXT9ZUbCY58KbWJzkgEpeE5E9";
const OBJKT_BASE = "https://objkt.com/tokens/" + CONTRACT + "/";

// Optimised local images for the first 14 sketches.
// New tokens load from IPFS automatically — no entry needed here.
// Add an entry only if you want a faster/smaller local image for a new sketch.
const LOCAL_IMAGES = {
  "rend lake":              "images/s13.jpg",
  "lady security officer":  "images/s12.jpg",
  "cimarron":               "images/s11.jpg",
  "barking sands beach":    "images/s10.jpg",
  "banyan tree":            "images/s9.jpg",
  "hanalei":                "images/s8.jpg",
  "glass beach":            "images/s7.jpg",
  "koloa landing":          "images/s6.jpg",
  "twelvemile beach":       "images/s5.jpg",
  "skylift":                "images/s4.jpg",
  "north shore campers":    "images/s3.jpg",
  "nature's line art":      "images/s2.jpg",
  "wind-blown tree":        "images/s1.jpg",
  "red willow creek":       "images/s0.jpg",
};

const CREATOR_ADDRESS = "tz1MNyWtbh2BLJZvRq68o4LCaHdRWjETjjwV";
const BURN_ADDRESS = "tz1burnburnburnburnburnburnburjAYjjX";
const MARKET_CONTRACTS = new Set([
  "KT18iSHoRW1iogamADWwQSDoZa3QkN4izkqj", // objkt.com English Auctions
]);
const ACCOUNT_NAMES = {
  [CREATOR_ADDRESS]: "Steve Tucker",
};

const KNOWN_TOKEN_DETAILS = [
  { match: "philmont", loc: "Philmont Scout Ranch, Cimarron, NM", lat: 36.5041, lng: -104.9170 },
  { match: "tahquamenon", loc: "Tahquamenon River, Michigan UP", lat: 46.5596, lng: -85.0310 },
  { match: "cimarron", loc: "Cimarron, New Mexico", date: "June 7, 2009", lat: 36.5109, lng: -104.9158, streetView: true, placePhotos: true },
  { match: "quiet morning in camp", loc: "Philmont Scout Ranch, Cimarron, NM", lat: 36.5041, lng: -104.9170 },
  { match: "red willow creek", loc: "Taos Pueblo, New Mexico", date: "July 3, 2009", lat: 36.4386, lng: -105.5444, placePhotos: true },
  { match: "rend lake", loc: "Southern Illinois", lat: 38.0714, lng: -88.9673, placePhotos: true, photoQuery: "Rend Lake, Illinois" },
  { match: "lady security officer", loc: "United States", lat: 39.8283, lng: -98.5795 },
  { match: "barking sands", loc: "Polihale State Park, Kauai, HI", date: "August 7, 2011", lat: 22.0797, lng: -159.7596, placePhotos: true },
  { match: "old kaloa", loc: "Old Koloa Town, Kauai, HI", lat: 21.9069, lng: -159.4694, streetView: true, placePhotos: true },
  { match: "old koloa", loc: "Old Koloa Town, Kauai, HI", lat: 21.9069, lng: -159.4694, streetView: true, placePhotos: true },
  { match: "hanalei", loc: "Hanalei, Kauai, HI", lat: 22.2034, lng: -159.4971, streetView: true, placePhotos: true },
  { match: "glass beach", loc: "Glass Beach, Port Allen, Kauai, HI", lat: 21.9024, lng: -159.5904, streetView: true, placePhotos: true },
  { match: "koloa landing", loc: "Koloa Landing, Kauai, HI", lat: 21.8779, lng: -159.4736, streetView: true, placePhotos: true },
  { match: "pictured rocks", loc: "Pictured Rocks National Lakeshore, Michigan", lat: 46.5618, lng: -86.3168, placePhotos: true },
  { match: "skylift", loc: "Natural Bridge State Resort Park, Slade, KY", lat: 37.7781, lng: -83.6851, streetView: true, placePhotos: true },
  { match: "north shore campers", loc: "Kauai, Hawaii", date: "August 4, 2011", lat: 22.2093, lng: -159.4686, placePhotos: true, photoQuery: "North Shore Kauai camping" },
  { match: "nature's line art", loc: "Indiana", lat: 39.7684, lng: -86.1581 },
  { match: "wind-blown tree", loc: "Kealia Beach, Kauai, HI", lat: 22.0979, lng: -159.3073, streetView: true, placePhotos: true },
  { match: "taos pueblo", loc: "Taos Pueblo, New Mexico", lat: 36.4386, lng: -105.5444, placePhotos: true },
  { match: "quiet creek", loc: "Taos Pueblo, New Mexico", lat: 36.4386, lng: -105.5444, placePhotos: true },
  { match: "cozumel",     loc: "Cozumel, Mexico",         lat: 20.4229, lng: -86.9223,  streetView: true, placePhotos: true },
];

// Runtime — populated by chain.js on every page load
let TOKENS = [];

// Local fallback records for the bundled sketches. These render immediately when
// the blockchain API is unavailable, then live data replaces/enriches them.
const FALLBACK_TOKENS = [
  { tokenId: 0,  name: "Red Willow Creek",       loc: "New Mexico",             date: "2009", img: "images/s0.jpg",  lat: 36.7050, lng: -105.5720 },
  { tokenId: 1,  name: "Wind-Blown Tree",        loc: "New Mexico",             date: "2009", img: "images/s1.jpg",  lat: 35.0844, lng: -106.6504 },
  { tokenId: 2,  name: "Nature's Line Art",      loc: "Indiana",                date: "2010", img: "images/s2.jpg",  lat: 39.7684, lng: -86.1581 },
  { tokenId: 3,  name: "North Shore Campers",    loc: "Kauai, Hawaii",          date: "2011", img: "images/s3.jpg",  lat: 22.2093, lng: -159.4686 },
  { tokenId: 4,  name: "Skylift",                loc: "Indiana",                date: "2011", img: "images/s4.jpg",  lat: 38.7387, lng: -86.4169 },
  { tokenId: 5,  name: "Twelvemile Beach",       loc: "Michigan",               date: "2012", img: "images/s5.jpg",  lat: 46.6500, lng: -86.1500 },
  { tokenId: 6,  name: "Koloa Landing",          loc: "Koloa, Kauai, HI",        date: "2012", img: "images/s6.jpg",  lat: 21.8779, lng: -159.4736 },
  { tokenId: 7,  name: "Glass Beach",            loc: "Port Allen, Kauai, HI",   date: "2012", img: "images/s7.jpg",  lat: 21.9024, lng: -159.5904 },
  { tokenId: 8,  name: "Hanalei",                loc: "Hanalei, Kauai, HI",      date: "2012", img: "images/s8.jpg",  lat: 22.2034, lng: -159.4971 },
  { tokenId: 9,  name: "Banyan Tree",            loc: "Hawaii",                 date: "2012", img: "images/s9.jpg",  lat: 21.3069, lng: -157.8583 },
  { tokenId: 10, name: "Barking Sands Beach",    loc: "Kauai, Hawaii",          date: "2012", img: "images/s10.jpg", lat: 22.0373, lng: -159.7850 },
  { tokenId: 11, name: "Cimarron",               loc: "Cimarron, New Mexico",    date: "2013", img: "images/s11.jpg", lat: 36.5109, lng: -104.9158 },
  { tokenId: 12, name: "Lady Security Officer",  loc: "United States",          date: "2013", img: "images/s12.jpg", lat: 39.8283, lng: -98.5795 },
  { tokenId: 13, name: "Rend Lake",              loc: "Southern Illinois",       date: "2013", img: "images/s13.jpg", lat: 38.0714, lng: -88.9673 },
].map(t => ({
  subtitle: "",
  ipfsImg: "",
  supply: 0,
  holders: 0,
  listed: null,
  soldOut: false,
  price: null,
  objktUrl: OBJKT_BASE + t.tokenId,
  _isFallback: true,
  ...t,
}));
