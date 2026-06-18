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
