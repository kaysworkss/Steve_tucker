// ─── CONTRACT ─────────────────────────────────────────────────────────────────
const CONTRACT   = "KT1V35dHCUUpXT9ZUbCY58KbWJzkgEpeE5E9";
const OBJKT_BASE = "https://objkt.com/tokens/" + CONTRACT + "/";
const TZKT_API   = "https://api.tzkt.io/v1";

// ─── KNOWN TOKENS ─────────────────────────────────────────────────────────────
// Keyed by tokenId (integer). Built from the live chain data on 2026-06-18.
// - localImg: path to optimised local JPEG (fast, no IPFS needed)
// - loc / date: extracted from on-chain description field
// - For NEW tokens Tucker mints after this date, this map won't have an entry —
//   chain.js falls back to the IPFS displayUri automatically.

const KNOWN = {
   0: { localImg: null,              loc: "Philmont Scout Ranch, NM",       date: "" },
   1: { localImg: null,              loc: "Philmont Scout Ranch, NM",       date: "" },
   2: { localImg: null,              loc: "Philmont Scout Ranch, NM",       date: "" },
   3: { localImg: null,              loc: "Upper Peninsula, Michigan",       date: "" },
   4: { localImg: null,              loc: "Cimarron, NM",                   date: "Jun 7, 2009" },
   5: { localImg: null,              loc: "Red River Gorge, KY",            date: "Jun 7, 2014" },
   6: { localImg: "images/s0.jpg",   loc: "Taos Pueblo, NM",                date: "Jul 3, 2009" },
   7: { localImg: "images/s13.jpg",  loc: "Southern Illinois",               date: "" },
   8: { localImg: "images/s12.jpg",  loc: "Taos Indian Casino, NM",          date: "Jul 3, 2009" },
   9: { localImg: "images/s11.jpg",  loc: "Cimarron, NM",                   date: "May 28, 2009" },
  10: { localImg: "images/s10.jpg",  loc: "Polihale State Park, Kauai, HI", date: "Aug 7, 2011" },
  11: { localImg: null,              loc: "Polihale State Park, Kauai, HI", date: "Aug 7, 2011" },
  12: { localImg: "images/s9.jpg",   loc: "Old Koloa Town, Kauai, HI",      date: "Aug 5, 2011" },
  13: { localImg: "images/s8.jpg",   loc: "Hanalei, Kauai, HI",             date: "Jul 31, 2011" },
  14: { localImg: "images/s7.jpg",   loc: "Port Allen, Kauai, HI",          date: "Jul 30, 2011" },
  15: { localImg: "images/s6.jpg",   loc: "Koloa, Kauai, HI",               date: "Jul 30, 2011" },
  16: { localImg: "images/s5.jpg",   loc: "Pictured Rocks N.L., MI",        date: "Aug 9, 2012" },
  17: { localImg: "images/s4.jpg",   loc: "Slade, KY",                      date: "Jun 7, 2014" },
  18: { localImg: "images/s3.jpg",   loc: "North Shore, Kauai, HI",         date: "Aug 4, 2011" },
  19: { localImg: "images/s2.jpg",   loc: "Southern Illinois",               date: "Oct 19, 2019" },
  20: { localImg: "images/s1.jpg",   loc: "Kealia Beach, Kauai, HI",        date: "Aug 4, 2011" },
  21: { localImg: "images/s0.jpg",   loc: "Taos Pueblo, NM",                date: "Jul 3, 2009" },
  // ── Add new entries here when Tucker mints ─────────────────────────────────
  // Format: tokenId: { localImg: "images/sXX.jpg", loc: "Place, State", date: "Mon DD, YYYY" }
  // If you don't add an entry, the site still works — it just loads from IPFS.
};

// Runtime — filled by chain.js
let TOKENS = [];
