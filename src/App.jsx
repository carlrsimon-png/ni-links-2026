import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { subscribeToState, saveState as firebaseSave, saveScorePath, saveFoursomeBack, saveFoursomeUnback, savePropUnits, saveOuUnits, subscribeToChat, sendChatMessage, deleteChatMessage } from "./firebase";

// ─── DATA ────────────────────────────────────────────────────────────
const APP_VERSION = "5.0";
// Disabled feature flag — flip to true to re-enable the (incomplete) Match Play tab.
var SHOW_MATCH_PLAY = false;
// Skins and Individual Gross Stableford were removed to simplify the bet menu.
// These flags gate BOTH the settlement math and the UI in one place — set either
// back to true to fully restore that bet (no data was deleted: skinsEligible opt-ins
// remain saved in the document, so turning skins back on brings every opt-in back).
var SHOW_SKINS = false;
var SHOW_GROSS = false;
const TRIP_DATE = "2026-06-26T18:00:00-04:00";
const AUTH_KEY = "ni-links-auth";
// Device-local: remembers which tab you were on so a reload (e.g. pull-to-refresh)
// returns you to it instead of dropping back to Home. Never synced across devices.
const TAB_KEY = "ni-links-active-tab";
const GROUP_PIN = "2026";
// Brian Smith & Carl Simon are the "gatekeepers" of the books (expenses).
const BOOKKEEPER_IDS = ["p2", "p6"];
// Only Carl can place, change, settle, or pick winners on any bet (everyone else is view-only on Bets).
const OWNER_ID = "p6";

// ── Wager amounts ──────────────────────────────────────────────────────────
// Single source of truth for every stake. Both the money math AND the on-screen
// labels read these, so a change here updates payouts and text together. (These
// were previously duplicated as local vars and bare literals across the file,
// which risked the trip-total skins pot paying a different rate than the rest.)
const STAKE_TEAM = 100;   // Team Stableford, $/man
const STAKE_GROSS = 50;   // Individual Gross Stableford bracket, $/man
const STAKE_SKIN = 20;    // Skins, $/skin — per-course AND trip-total pots
const STAKE_FOURSOME = 20;// Foursome Stableford match, $/man (open pool)
const DEFAULT_BUYIN = 25; // Individual-prop buy-in fallback

// Gross Stableford group names — two distinct Northern Ireland landmarks.
const GROSS_GROUP_A = { name:"The Mournes", emoji:"⛰️" };   // Mountains of Mourne, Co. Down (low handicaps)
const GROSS_GROUP_B = { name:"The Causeway", emoji:"🌊" };   // Giant's Causeway, Co. Antrim (high handicaps)

const ITINERARY = [
  { day:0, date:"Fri, Jun 26", title:"Depart USA", type:"travel", description:"JetBlue Flight 841 · JFK → Dublin. Evening departure.", hotel:null, events:[{time:"Evening",name:"JetBlue B6 841",detail:"JFK → DUB · Economy",icon:"✈️"}] },
  { day:1, date:"Sat, Jun 27", title:"Ardglass", type:"golf", teeTime:"2:30 PM", courseIdx:0, description:"Arrive Dublin Airport. Met by PerryGolf. ~2hr transfer south to Ardglass.", hotel:"Slieve Donard Resort & Spa", hotelLoc:"Newcastle", sightseeing:null, driveToHotel:"45 min to hotel", events:[{time:"8:45 PM",name:"The Percy French",detail:"Dinner at Slieve Donard. Downs Rd, Newcastle BT33 0AH.",icon:"🍽️"}] },
  { day:2, date:"Sun, Jun 28", title:"Royal County Down", type:"golf", teeTime:"2:21 PM", courseIdx:1, description:"Free morning. Explore Newcastle or the Mourne Mountains.", hotel:"Slieve Donard Resort & Spa", hotelLoc:"Newcastle", sightseeing:"Visit Downpatrick — Saint Patrick Centre & St. Patrick's Grave at Down Cathedral." },
  { day:3, date:"Mon, Jun 29", title:"Castlerock", type:"golf", teeTime:"1:06 PM", courseIdx:2, description:"~2hr 20min transfer north along the Antrim coast.", hotel:"Bushmills Inn", hotelLoc:"Bushmills", driveToHotel:"Check in at Bushmills Inn", events:[{time:"8:00 PM",name:"Group Dinner — Bushmills Inn",detail:"Reservation for the group. Tel: (0) 28 2073 3000.",icon:"🍽️"}] },
  { day:4, date:"Tue, Jun 30", title:"Royal Portrush", type:"golf", teeTime:"9:40 AM", courseIdx:3, description:"15 min from Bushmills to Portrush. Morning round on the Dunluce Links.", hotel:"Bushmills Inn", hotelLoc:"Bushmills", sightseeing:"Giant's Causeway, Dunluce Castle, Carrick-a-Rede Rope Bridge.", events:[{time:"3:30 PM",name:"Old Bushmills Distillery Tour",detail:"2 Distillery Rd, Bushmills BT57 8XH. Conf #8995255.",icon:"🥃"}] },
  { day:5, date:"Wed, Jul 1", title:"Portstewart", type:"golf", teeTime:"10:30 AM", courseIdx:4, description:"25 min to Portstewart. After golf, ~3.5hr transfer to Dublin.", hotel:"Conrad Dublin", hotelLoc:"Dublin", driveToHotel:"3.5 hr transfer to Dublin", events:[{time:"8:15 PM",name:"Dinner — Mister S",detail:"Dublin. Ref: BXYCDLZ2 · Party of 8. À la carte, min 2 courses pp after 4pm.",icon:"🍽️"}] },
  { day:6, date:"Thu, Jul 2", title:"Dublin → Home", type:"travel", description:"JetBlue Flight 842 · Dublin → JFK.", hotel:"Conrad Dublin", hotelLoc:"Dublin", events:[{time:"TBD",name:"JetBlue B6 842",detail:"DUB → JFK · Economy",icon:"✈️"}] },
  { day:7, date:"Fri, Jul 3", title:"Tour Ends", type:"travel", description:"Arrive home.", hotel:null },
];

const COURSES = [
  { name:"Ardglass", location:"Ardglass, Co. Down", par:71, url:"https://ardglassgolfclub.com/",
    scorecard:"https://ardglassgolfclub.com/",
    note:"Founded 1896. Dramatic cliffs, 14th-century castle clubhouse.",
    tees:[{label:"White",slope:117},{label:"Green",slope:121},{label:"Custom",slope:126}],
    pars:[4,3,4,4,3,4,3,4,5, 4,5,3,4,4,5,5,3,4],
    si:  [10,14,16,6,18,4,12,2,8, 13,3,7,1,11,15,5,9,17] },
  { name:"Royal County Down", location:"Newcastle, Co. Down", par:71, url:"https://www.royalcountydown.org/",
    scorecard:"https://www.royalcountydown.org/championship_links",
    note:"World Top 5. Old Tom Morris original. Mourne Mountains backdrop.",
    tees:[{label:"Championship",slope:142},{label:"Medal",slope:131},{label:"Yellow",slope:134}],
    pars:[5,4,4,3,4,4,3,4,4, 3,4,5,4,3,4,4,4,5],
    si:  [13,9,3,15,7,11,17,1,5, 18,8,16,2,12,4,14,10,6] },
  { name:"Castlerock (Mussenden)", location:"Castlerock, Co. Derry", par:73, url:"https://www.castlerockgc.co.uk/",
    scorecard:"https://www.castlerockgc.co.uk/mussenden_course",
    note:"Est. 1901. 'Leg O'Mutton' par 3. Ben Sayers / Hawtree design.",
    tees:[{label:"White",slope:132},{label:"Yellow",slope:128},{label:"Custom",slope:132}],
    pars:[4,4,5,3,5,4,4,4,3, 4,5,4,4,3,5,3,5,4],
    si:  [9,5,13,11,15,7,1,3,17, 4,16,2,14,8,6,18,12,10] },
  { name:"Royal Portrush (Dunluce)", location:"Portrush, Co. Antrim", par:72, url:"https://www.royalportrushgolfclub.com/",
    scorecard:"https://www.royalportrushgolfclub.com/courses/the-dunluce/",
    note:"World Top 15. Host of The Open 1951, 2019 & 2025.",
    tees:[{label:"Championship",slope:131},{label:"Visitor",slope:126},{label:"Custom",slope:136}],
    pars:[4,5,3,4,4,3,5,4,4, 4,5,5,3,4,4,3,4,4],
    si:  [11,5,17,1,15,7,3,13,9, 12,8,4,18,2,14,6,16,10] },
  { name:"Portstewart (Strand)", location:"Portstewart, Co. Derry", par:71, url:"https://www.portstewartgc.co.uk/",
    scorecard:"https://www.portstewartgc.co.uk/the-strand/",
    note:"Willie Park / Des Giffin design. 'Thistly Hollow' dunes.",
    tees:[{label:"White",slope:130},{label:"Yellow",slope:126},{label:"Custom",slope:130}],
    pars:[4,4,3,5,4,3,5,4,4, 4,4,3,5,4,3,4,4,4],
    si:  [3,9,13,7,1,15,17,5,11, 12,6,18,10,4,16,14,2,8] },
];
const COURSE_LABELS = ["ARD","RCD","CST","RPR","PST"];

const MAP_STOPS = [
  { id:"dublin", label:"Dublin", short:"DUB", lat:53.4264, lng:-6.2499, type:"airport" },
  { id:"ardglass", label:"Ardglass GC", short:"R1", lat:54.2608, lng:-5.6100, type:"course", day:"Sat" },
  { id:"slieve", label:"Slieve Donard", short:"H1", lat:54.2105, lng:-5.8885, type:"hotel" },
  { id:"rcd", label:"Royal County Down", short:"R2", lat:54.2150, lng:-5.8960, type:"course", day:"Sun" },
  { id:"castlerock", label:"Castlerock GC", short:"R3", lat:55.1647, lng:-6.7742, type:"course", day:"Mon" },
  { id:"bushmills", label:"Bushmills Inn", short:"H2", lat:55.2044, lng:-6.5222, type:"hotel" },
  { id:"portrush", label:"Royal Portrush", short:"R4", lat:55.2069, lng:-6.6561, type:"course", day:"Tue" },
  { id:"portstewart", label:"Portstewart GC", short:"R5", lat:55.1833, lng:-6.7233, type:"course", day:"Wed" },
  { id:"conrad", label:"Conrad Dublin", short:"H3", lat:53.3382, lng:-6.2591, type:"hotel" },
];
const ROUTE = ["dublin","ardglass","slieve","rcd","castlerock","bushmills","portrush","portstewart","conrad"];
const ROUTE_LEGS = [
  { from:"dublin", to:"ardglass", time:"2h" },
  { from:"ardglass", to:"slieve", time:"45m" },
  { from:"slieve", to:"rcd", time:"5m" },
  { from:"rcd", to:"castlerock", time:"2h20" },
  { from:"castlerock", to:"bushmills", time:"20m" },
  { from:"bushmills", to:"portrush", time:"15m" },
  { from:"portrush", to:"portstewart", time:"10m" },
  { from:"portstewart", to:"conrad", time:"3.5h" },
];

const HOTELS = [
  { name:"Slieve Donard Resort & Spa", loc:"Newcastle", nights:"Jun 27–29", n:2 },
  { name:"Bushmills Inn", loc:"Bushmills", nights:"Jun 29–Jul 1", n:2 },
  { name:"Conrad Dublin", loc:"Dublin", nights:"Jul 1–3", n:2 },
];

const CONTACTS = [
  { name:"PerryGolf 24/7", phone:"+1 800 344 5257", note:"Trip coordinator" },
  { name:"Slieve Donard Resort", phone:"+44 28 4372 1066", note:"Newcastle · Jun 27–29" },
  { name:"Bushmills Inn", phone:"+44 28 2073 3000", note:"Bushmills · Jun 29–Jul 1" },
  { name:"Conrad Dublin", phone:"+353 1 602 8900", note:"Dublin · Jul 1–3" },
  { name:"Emergency (NI)", phone:"999", note:"Police / Fire / Ambulance" },
  { name:"Emergency (ROI)", phone:"112", note:"Republic of Ireland" },
  { name:"US Embassy Dublin", phone:"+353 1 668 8777", note:"42 Elgin Road, Dublin 4" },
  { name:"JetBlue", phone:"+1 800 538 2583", note:"Flights B6 841 / B6 842" },
];

const QUICK_REF = [
  { label:"Currency", value:"GBP (£) in NI · EUR (€) in Dublin" },
  { label:"Time Zone", value:"BST (GMT+1) · 5hrs ahead of ET" },
  { label:"Voltage", value:"230V · Type G plug (3-prong UK)" },
  { label:"Driving", value:"Left side of the road" },
  { label:"Tipping", value:"10% at restaurants, not expected in pubs" },
];

const DEFAULT_PROPS = [];

// Individual prop bets — player-selectable eligibility, net scoring
const DEFAULT_INDIVIDUAL_PROPS = [
  { id:"ip8", name:"Most Net Stableford Points (Trip)", desc:"Highest total net Stableford across all 5 rounds", settled:false, winner:null, buyin:25, eligible:[] },
  { id:"ipsf0", name:"Most Net Stableford — Ardglass", desc:"Most net Stableford points at Ardglass", settled:false, winner:null, buyin:25, eligible:[] },
  { id:"ipsf1", name:"Most Net Stableford — Royal County Down", desc:"Most net Stableford points at Royal County Down", settled:false, winner:null, buyin:25, eligible:[] },
  { id:"ipsf2", name:"Most Net Stableford — Castlerock", desc:"Most net Stableford points at Castlerock", settled:false, winner:null, buyin:25, eligible:[] },
  { id:"ipsf3", name:"Most Net Stableford — Royal Portrush", desc:"Most net Stableford points at Royal Portrush", settled:false, winner:null, buyin:25, eligible:[] },
  { id:"ipsf4", name:"Most Net Stableford — Portstewart", desc:"Most net Stableford points at Portstewart", settled:false, winner:null, buyin:25, eligible:[] },
  { id:"ip1", name:"Lowest Net Score (Trip)", desc:"Best net total across all 5 rounds", settled:false, winner:null, buyin:25, eligible:[] },
];

// Over/Under props — two-sided side bets on a numeric line (e.g. trip eagle count
// O/U 1.5). Players take the "over" or the "under" and the losing side pays the
// winning side, split evenly (same conserving math as Head-to-Head). Settled
// manually once the real figure is known. Seeded with one example; more can be
// added in-app.
const DEFAULT_OU_PROPS = [
  { id:"ou_eagles", name:"Eagles (trip total)", line:1.5, stake:20, over:[], under:[], settled:false, result:null },
];

const DEFAULT_TEAM_MATCHES = [
  { id:"m1", course:"Ardglass", courseIdx:0, teamA:null, teamB:null, settled:false, winner:null, stake:20 },
  { id:"m2", course:"Royal County Down", courseIdx:1, teamA:null, teamB:null, settled:false, winner:null, stake:20 },
  { id:"m3", course:"Castlerock", courseIdx:2, teamA:null, teamB:null, settled:false, winner:null, stake:20 },
  { id:"m4", course:"Royal Portrush", courseIdx:3, teamA:null, teamB:null, settled:false, winner:null, stake:20 },
  { id:"m5", course:"Portstewart", courseIdx:4, teamA:null, teamB:null, settled:false, winner:null, stake:20 },
];

// Foursome Stableford matches — two 2-v-2 matches per course (the eight players
// split into two foursomes; within each, the pairs play a Stableford match).
// A pair's score is the BEST-BALL net Stableford of its two core players (on each
// hole only the pair's single best ball counts) for that round; the higher pair total
// wins. The winner is computed LIVE from scores —
// there's no manual settle. Outside players (the other four) can back either
// side ("open pool"): everyone on the losing side pays the stake, and that pot
// is split evenly across everyone on the winning side. Conserves to $0 for any
// side sizes (same math as Head-to-Head). pairA/pairB are the fixed core pairs;
// backersA/backersB are outside bettors who've joined a side. Player codes from
// the pairings: B=p2 C=p6 D=p3 E=p8 J=p1 M=p4 R=p7 S=p5.
const DEFAULT_FOURSOME_MATCHES = [
  // Ardglass — M/E v C/D ; S/R v B/J
  { id:"fm0a", course:"Ardglass", courseIdx:0, pairA:["p4","p8"], pairB:["p6","p3"], backersA:[], backersB:[], stake:STAKE_FOURSOME },
  { id:"fm0b", course:"Ardglass", courseIdx:0, pairA:["p5","p7"], pairB:["p2","p1"], backersA:[], backersB:[], stake:STAKE_FOURSOME },
  // Royal County Down — M/B v E/J ; C/R v D/S
  { id:"fm1a", course:"Royal County Down", courseIdx:1, pairA:["p4","p2"], pairB:["p8","p1"], backersA:[], backersB:[], stake:STAKE_FOURSOME },
  { id:"fm1b", course:"Royal County Down", courseIdx:1, pairA:["p6","p7"], pairB:["p3","p5"], backersA:[], backersB:[], stake:STAKE_FOURSOME },
  // Castlerock — M/D v B/R ; S/E v C/J
  { id:"fm2a", course:"Castlerock", courseIdx:2, pairA:["p4","p3"], pairB:["p2","p7"], backersA:[], backersB:[], stake:STAKE_FOURSOME },
  { id:"fm2b", course:"Castlerock", courseIdx:2, pairA:["p5","p8"], pairB:["p6","p1"], backersA:[], backersB:[], stake:STAKE_FOURSOME },
  // Royal Portrush — JA/RC v MM/SL ; CS/BS v EF/DD
  { id:"fm3a", course:"Royal Portrush", courseIdx:3, pairA:["p1","p7"], pairB:["p4","p5"], backersA:[], backersB:[], stake:STAKE_FOURSOME },
  { id:"fm3b", course:"Royal Portrush", courseIdx:3, pairA:["p6","p2"], pairB:["p8","p3"], backersA:[], backersB:[], stake:STAKE_FOURSOME },
  // Portstewart — M/R v S/C ; B/E v D/J
  { id:"fm4a", course:"Portstewart", courseIdx:4, pairA:["p4","p7"], pairB:["p5","p6"], backersA:[], backersB:[], stake:STAKE_FOURSOME },
  { id:"fm4b", course:"Portstewart", courseIdx:4, pairA:["p2","p8"], pairB:["p3","p1"], backersA:[], backersB:[], stake:STAKE_FOURSOME },
];

// Overlay the live backers (stored in the atomic `foursomeBackers` map, keyed by
// match id) onto the static pairings. Backers are deliberately NOT kept inside the
// foursomeMatches array — that array rides the clobber-prone full-document save,
// whereas the backers map is written only via atomic field-path updates that can't
// be overwritten. This is the single place that recombines them for UI + settlement.
function matchesWithBackers(backersMap) {
  var map = backersMap || {};
  return DEFAULT_FOURSOME_MATCHES.map(function(m) {
    var b = map[m.id] || {};
    return Object.assign({}, m, {
      backersA: Array.isArray(b.a) ? b.a.slice() : [],
      backersB: Array.isArray(b.b) ? b.b.slice() : [],
    });
  });
}

const DEFAULT_PLAYERS = [
  { id:"p1", name:"Jeff Andrea", handicap:10.2, emoji:"🔴" },
  { id:"p2", name:"Brian Smith", handicap:12.8, emoji:"🔵" },
  { id:"p3", name:"Daniel DiBiasio", handicap:9.2, emoji:"⚪" },
  { id:"p4", name:"Mark McGrath", handicap:6.1, emoji:"🔴" },
  { id:"p5", name:"Steve Lopiano", handicap:12.1, emoji:"🔵" },
  { id:"p6", name:"Carl Simon", handicap:6.7, emoji:"⚪" },
  { id:"p7", name:"Rory Callagy", handicap:7.2, emoji:"🔴" },
  { id:"p8", name:"Eric Ferraris", handicap:5.7, emoji:"🔵" },
];

const TEAM_MATCHUPS = [
  {
    id:"public_v_private",
    name:"Public vs Private",
    teamA: { name:"Public", emoji:"🌐", names:["Brian Smith","Mark McGrath","Carl Simon","Steve Lopiano"] },
    teamB: { name:"Private", emoji:"🔒", names:["Jeff Andrea","Daniel DiBiasio","Rory Callagy","Eric Ferraris"] },
  },
];

const GAME_TYPES = [
  { id:"skins", name:"Skins", icon:"💰" },
  { id:"nassau", name:"Nassau", icon:"🏌️" },
  { id:"wolf", name:"Wolf", icon:"🐺" },
  { id:"match", name:"Match Play", icon:"⚔️" },
];

const DRINK_TYPES = [
  { id:"pints", emoji:"🍺", label:"Pints" },
  { id:"whiskey", emoji:"🥃", label:"Whiskey" },
  { id:"wine", emoji:"🍷", label:"Wine" },
  { id:"other", emoji:"🍹", label:"Other" },
];


const EXPENSE_CATEGORIES = [
  { id:"meals", emoji:"🍽️", label:"Meals" },
  { id:"drinks", emoji:"🍺", label:"Drinks" },
  { id:"transport", emoji:"🚐", label:"Transport" },
  { id:"activities", emoji:"🎯", label:"Activities" },
  { id:"lodging", emoji:"🏨", label:"Lodging" },
  { id:"golf", emoji:"⛳", label:"Golf" },
  { id:"other", emoji:"💰", label:"Other" },
];

// ─── UTILITIES ───────────────────────────────────────────────────────
function initScores(players) {
  var s = {};
  players.forEach(function(p) {
    s[p.id] = {};
    COURSES.forEach(function(_, i) { s[p.id][i] = Array(18).fill(null); });
  });
  return s;
}

function defaultState() {
  return {
    players: DEFAULT_PLAYERS,
    scores: initScores(DEFAULT_PLAYERS),
    games: [],
    bets: DEFAULT_PROPS,
    individualProps: DEFAULT_INDIVIDUAL_PROPS,
    overUnderProps: DEFAULT_OU_PROPS.map(function(p) { return Object.assign({}, p, { overUnits: {}, underUnits: {} }); }),
    customBets: [],
    h2hBets: [],
    teamMatches: [],
    foursomeMatches: DEFAULT_FOURSOME_MATCHES.map(function(m) { return Object.assign({}, m, { backersA: m.backersA.slice(), backersB: m.backersB.slice() }); }),
    foursomeBackers: {},
    // Carl-only manual winner overrides. team: "a"|"b"|null (Publics/Brunswick); foursome:
    // { matchId: "A"|"B" }. When set, overrides the auto-computed result for settlement.
    manualWinners: { team: null, foursome: {} },
    drinks: {},
    expenses: [],
    selectedTees: [0, 0, 0, 0, 0],
    skinsEligible: { gross: [], net: [], course: [[],[],[],[],[]] },
    courseOverrides: {},
    weatherCache: null,
  };
}

function resolveTeam(teamDef, players) {
  return teamDef.names.map(function(name) {
    var found = players.find(function(p) { return p.name === name; });
    return found ? found.id : null;
  }).filter(Boolean);
}

function getRoundScore(scores, pid, ri) {
  var h = scores[pid] && scores[pid][ri];
  if (!h) return null;
  var f = h.filter(function(v) { return v !== null; });
  return f.length === 0 ? null : f.reduce(function(a, b) { return a + b; }, 0);
}

// Total GROSS strokes across all 5 rounds for a player (only counts completed rounds).
// Split players into two gross brackets by handicap index:
// Group A = lowest 4 HIs, Group B = highest 4 HIs. Returns {a:[ids], b:[ids]}.
function getGrossBrackets(players) {
  var sorted = players.slice().sort(function(a, b) { return a.handicap - b.handicap; });
  var half = Math.ceil(sorted.length / 2);
  return {
    a: sorted.slice(0, half).map(function(p) { return p.id; }),
    b: sorted.slice(half).map(function(p) { return p.id; }),
  };
}

// Active slopes — updated from state when tees are selected. Defaults to first tee option per course.
var ACTIVE_SLOPES = COURSES.map(function(c) { return c.tees[0].slope; });

// Snapshot of the built-in (default) par/SI for every course, so gatekeeper overrides
// can be applied on top and cleanly reset. The live COURSES objects are mutated in place
// (same pattern as ACTIVE_SLOPES) so every scoring function picks up overrides automatically.
var DEFAULT_COURSE_DATA = COURSES.map(function(c) {
  return { pars: c.pars.slice(), si: c.si.slice() };
});

// Apply per-course par/SI overrides onto the live COURSES objects. Idempotent: always
// rebuilds from defaults + override, so it's safe to call on every render.
// overrides shape: { [courseIdx]: { pars:[18 ints], si:[18 ints] } }
function applyCourseOverrides(overrides) {
  overrides = overrides || {};
  COURSES.forEach(function(c, i) {
    var d = DEFAULT_COURSE_DATA[i];
    var o = overrides[i];
    var pars = (o && o.pars && o.pars.length === 18) ? o.pars.slice() : d.pars.slice();
    var si = (o && o.si && o.si.length === 18) ? o.si.slice() : d.si.slice();
    c.pars = pars;
    c.si = si;
    c.par = pars.reduce(function(a, b) { return a + (b || 0); }, 0);
  });
}

// Calculate course handicap from handicap index
// Formula: HI × (Slope/113) rounded to nearest integer
function getCourseHandicap(hi, courseIdx) {
  var slope = ACTIVE_SLOPES[courseIdx] || 113;
  return Math.round(hi * (slope / 113));
}

// Net score for a round = gross - course handicap
function getNetRoundScore(scores, pid, ri, handicap) {
  var gross = getRoundScore(scores, pid, ri);
  if (gross === null) return null;
  var ch = getCourseHandicap(handicap, ri);
  return gross - ch;
}

function getTotalScore(scores, pid) {
  var t = 0;
  if (!scores[pid]) return 0;
  Object.values(scores[pid]).forEach(function(h) {
    h.forEach(function(s) { if (s !== null && s !== undefined) t += s; });
  });
  return t;
}

function getTotalNetScore(scores, pid, handicap) {
  var t = 0;
  if (!scores[pid]) return 0;
  COURSES.forEach(function(_, ri) {
    var net = getNetRoundScore(scores, pid, ri, handicap);
    if (net !== null) t += net;
  });
  return t;
}

function getLeaderboard(players, scores) {
  return players
    .map(function(p) { return Object.assign({}, p, { total: getTotalScore(scores, p.id) }); })
    .filter(function(p) { return p.total > 0; })
    .sort(function(a, b) { return a.total - b.total; });
}

// ─── STABLEFORD ──────────────────────────────────────────────────────
// Strokes received on a given hole based on course handicap and stroke index.
// e.g. course handicap 14 → one stroke on SI 1-14, two strokes on SI 1-... if >18
function strokesOnHole(courseHcp, holeSI) {
  if (courseHcp <= 0) return 0;
  var s = 0;
  if (holeSI <= courseHcp) s += 1;
  if (holeSI <= courseHcp - 18) s += 1; // second stroke for high handicaps
  return s;
}

// Stableford points for one hole: net score vs par.
// Net double-eagle+ caps at 5 (rare), eagle 4, birdie 3, par 2, bogey 1, double+ 0.
function stablefordPointsForHole(gross, par, courseHcp, holeSI) {
  if (gross === null || gross === undefined) return null;
  var net = gross - strokesOnHole(courseHcp, holeSI);
  var diff = net - par; // negative = under par
  if (diff <= -3) return 5;
  if (diff === -2) return 4;
  if (diff === -1) return 3;
  if (diff === 0) return 2;
  if (diff === 1) return 1;
  return 0;
}

// Net match-play Nassau — three bets in one: front 9, back 9, full 18.
// Each hole is won by the side with the lower NET ball (best net of its players for
// 2-v-2; the single player's net for 1-v-1). Net strokes are taken off the LOW player
// in the match (standard match-play convention) and allocated by stroke index.
// Whoever wins more holes in a segment wins that segment's value. A segment only
// settles once every one of its holes is posted for all players; a halved segment
// moves no money. Losers each pay the value, split evenly among winners — so it
// conserves to $0 for any side sizes. Returns { results:{pid:$}, segments:{front,back,total} }.
function nassauResult(g, players, scores) {
  var ri = (g.round != null ? g.round : 0);
  var course = COURSES[ri];
  var sideA = g.sideA || [], sideB = g.sideB || [];
  var all = sideA.concat(sideB);
  var empty = { results: {}, segments: { front: null, back: null, total: null }, sideA: sideA, sideB: sideB, courseIdx: ri };
  if (!course || !course.si || sideA.length === 0 || sideB.length === 0) return empty;
  var si = course.si;
  var ch = {};
  all.forEach(function(pid) { var p = players.find(function(x){ return x.id === pid; }); ch[pid] = p ? getCourseHandicap(p.handicap, ri) : 0; });
  var minCH = Math.min.apply(null, all.map(function(pid){ return ch[pid]; }));
  function netHole(pid, h) {
    var row = scores[pid] && scores[pid][ri];
    var sc = row ? row[h] : null;
    if (sc === null || sc === undefined || sc === 0) return null;
    return sc - strokesOnHole(ch[pid] - minCH, si[h]);
  }
  function sideNet(side, h) {
    var best = null;
    side.forEach(function(pid) { var n = netHole(pid, h); if (n !== null && (best === null || n < best)) best = n; });
    return best;
  }
  function segment(start, end) {
    var aWon = 0, bWon = 0, complete = true;
    for (var h = start; h < end; h++) {
      var an = sideNet(sideA, h), bn = sideNet(sideB, h);
      if (an === null || bn === null) { complete = false; continue; }
      if (an < bn) aWon++; else if (bn < an) bWon++;
    }
    return { aWon: aWon, bWon: bWon, complete: complete };
  }
  var res = {};
  all.forEach(function(pid) { res[pid] = 0; });
  function applySeg(seg, val) {
    if (!val || !seg.complete || seg.aWon === seg.bWon) { seg.winner = null; seg.val = val; return seg; }
    var winners = seg.aWon > seg.bWon ? sideA : sideB;
    var losers = seg.aWon > seg.bWon ? sideB : sideA;
    var each = (losers.length * val) / winners.length;
    losers.forEach(function(pid) { res[pid] -= val; });
    winners.forEach(function(pid) { res[pid] += each; });
    seg.winner = seg.aWon > seg.bWon ? "a" : "b";
    seg.val = val;
    seg.winEach = each;
    return seg;
  }
  var front = applySeg(segment(0, 9), g.frontVal != null ? g.frontVal : 10);
  var back = applySeg(segment(9, 18), g.backVal != null ? g.backVal : 10);
  var total = applySeg(segment(0, 18), g.totalVal != null ? g.totalVal : 20);
  return { results: res, segments: { front: front, back: back, total: total }, sideA: sideA, sideB: sideB, courseIdx: ri };
}

// Total Stableford points for a player on one round
function getRoundStableford(scores, pid, ri, handicap) {
  var h = scores[pid] && scores[pid][ri];
  if (!h) return null;
  var course = COURSES[ri];
  if (!course || !course.pars || !course.si) return null;
  var courseHcp = getCourseHandicap(handicap, ri);
  var played = false;
  var pts = 0;
  for (var i = 0; i < 18; i++) {
    if (h[i] !== null && h[i] !== undefined) {
      played = true;
      pts += stablefordPointsForHole(h[i], course.pars[i], courseHcp, course.si[i]);
    }
  }
  return played ? pts : null;
}

// Total Stableford across all rounds for a player
function getTotalStableford(scores, pid, handicap) {
  var t = 0;
  var any = false;
  COURSES.forEach(function(_, ri) {
    var p = getRoundStableford(scores, pid, ri, handicap);
    if (p !== null) { t += p; any = true; }
  });
  return any ? t : null;
}

// GROSS Stableford — same scoring but no strokes given (handicap = 0).
function getTotalGrossStableford(scores, pid) {
  return getTotalStableford(scores, pid, 0);
}

// A round is "complete" for a set of players once each has all 18 holes posted.
function roundComplete(scores, ri, ids) {
  if (!ids || ids.length === 0) return false;
  return ids.every(function(pid) {
    var h = scores[pid] && scores[pid][ri];
    if (!h) return false;
    for (var i = 0; i < 18; i++) { if (h[i] == null) return false; }
    return true;
  });
}

// Auto-resolve the winner of a score-determinable prop from the scorecard.
// Returns the winning player id, or null if it isn't resolvable yet (rounds not
// complete) OR there's a tie at the top (left for a human to break). Only the
// seeded props have metrics — custom props always return null (manual). The metric
// logic mirrors the live-leader display so the two never disagree.
function autoPropWinner(prop, players, scores) {
  if (!prop) return null;
  var eligible = prop.eligible || [];
  if (eligible.length === 0) return null;
  var rounds, higherWins, valueFn;
  if (prop.id === "ip8") {
    rounds = [0, 1, 2, 3, 4]; higherWins = true;
    valueFn = function(pid, p) { return getTotalStableford(scores, pid, p.handicap); };
  } else if (prop.id && prop.id.indexOf("ipsf") === 0) {
    var ri = parseInt(prop.id.replace("ipsf", ""), 10);
    rounds = [ri]; higherWins = true;
    valueFn = function(pid, p) { return getRoundStableford(scores, pid, ri, p.handicap); };
  } else if (prop.id === "ip1") {
    rounds = [0, 1, 2, 3, 4]; higherWins = false;
    valueFn = function(pid, p) {
      var net = 0, any = false;
      for (var r = 0; r < COURSES.length; r++) { var ns = getNetRoundScore(scores, pid, r, p.handicap); if (ns !== null) { net += ns; any = true; } }
      return any ? net : null;
    };
  } else {
    return null; // custom prop — manual only
  }
  // Every needed round must be fully posted for every eligible player.
  var ready = eligible.every(function(pid) { return rounds.every(function(r) { return roundComplete(scores, r, [pid]); }); });
  if (!ready) return null;
  var rows = eligible.map(function(pid) {
    var p = players.find(function(x) { return x.id === pid; });
    return p ? { pid: pid, v: valueFn(pid, p) } : null;
  }).filter(function(x) { return x && x.v !== null; });
  if (rows.length === 0) return null;
  rows.sort(function(a, b) { return higherWins ? b.v - a.v : a.v - b.v; });
  var top = rows[0];
  var tied = rows.filter(function(x) { return x.v === top.v; });
  if (tied.length > 1) return null; // ambiguous — needs a human
  return top.pid;
}

// Score-based money is "final" only when every round is fully posted for the
// relevant players. Until then the standings (and the dollars they imply) are live.
function tripComplete(scores, ids) {
  for (var ri = 0; ri < COURSES.length; ri++) { if (!roundComplete(scores, ri, ids)) return false; }
  return true;
}

// Compute skins for a round. Returns { results: [{hole, winner(pid), value, pushed}], totals: {pid: count} }
// useNet=true → net skins (apply handicap strokes per hole), false → gross skins
function computeSkins(scores, players, eligibleIds, ri, useNet) {
  var course = COURSES[ri];
  var results = [];
  var carry = 1; // number of skins on current hole (increases with pushes)
  var totals = {};
  eligibleIds.forEach(function(id) { totals[id] = 0; });

  for (var h = 0; h < 18; h++) {
    // Get each eligible player's score for this hole
    var holeScores = [];
    var allHaveScore = true;
    eligibleIds.forEach(function(pid) {
      var raw = scores[pid] && scores[pid][ri] && scores[pid][ri][h];
      if (raw == null) { allHaveScore = false; return; }
      var val = raw;
      if (useNet) {
        var p = players.find(function(x) { return x.id === pid; });
        if (!p) return; // stale/removed eligible id — skip rather than crash on p.handicap
        var ch = getCourseHandicap(p.handicap, ri);
        var si = course.si ? course.si[h] : 99;
        val = raw - strokesOnHole(ch, si);
      }
      holeScores.push({ pid: pid, val: val });
    });

    if (!allHaveScore || holeScores.length < 2) {
      results.push({ hole: h, winner: null, value: carry, pushed: true });
      carry++;
      continue;
    }

    // Find lowest score
    holeScores.sort(function(a, b) { return a.val - b.val; });
    var lowest = holeScores[0].val;
    var winners = holeScores.filter(function(x) { return x.val === lowest; });

    if (winners.length === 1) {
      // Sole winner — wins all carried skins
      results.push({ hole: h, winner: winners[0].pid, value: carry, pushed: false });
      totals[winners[0].pid] += carry;
      carry = 1; // reset
    } else {
      // Tie — push
      results.push({ hole: h, winner: null, value: carry, pushed: true });
      carry++;
    }
  }

  return { results: results, totals: totals, carry: carry > 1 ? carry - 1 : 0 };
}

// Get total skins across all rounds for a player
function getTotalSkins(scores, players, eligibleIds, useNet) {
  var grandTotal = {};
  eligibleIds.forEach(function(id) { grandTotal[id] = 0; });
  for (var ri = 0; ri < COURSES.length; ri++) {
    var rd = computeSkins(scores, players, eligibleIds, ri, useNet);
    eligibleIds.forEach(function(id) { grandTotal[id] += (rd.totals[id] || 0); });
  }
  return grandTotal;
}

// Best-ball Team Stableford for a round. For each of the 18 holes we count ONLY the
// team's single best (highest) net-Stableford ball — not all four added together — and
// sum those best balls across the round. A hole starts counting as soon as any one team
// member has posted it; returns null until the team has played at least one hole.
function getTeamRoundBestBall(scores, players, teamIds, ri) {
  var course = COURSES[ri];
  if (!course || !course.pars || !course.si) return null;
  var any = false;
  var total = 0;
  for (var hi = 0; hi < 18; hi++) {
    var best = null;
    teamIds.forEach(function(pid) {
      var p = players.find(function(x) { return x.id === pid; });
      if (!p) return;
      var h = scores[pid] && scores[pid][ri];
      var g = h ? h[hi] : null;
      if (g === null || g === undefined) return;
      var pts = stablefordPointsForHole(g, course.pars[hi], getCourseHandicap(p.handicap, ri), course.si[hi]);
      if (pts === null) return;
      if (best === null || pts > best) best = pts; // keep the team's best ball on this hole
    });
    if (best !== null) { total += best; any = true; }
  }
  return any ? total : null;
}

// Best-ball Team Stableford across all five rounds — the sum of each round's best-ball total.
function getTeamTotalBestBall(scores, players, teamIds) {
  var t = 0;
  var any = false;
  COURSES.forEach(function(_, ri) {
    var p = getTeamRoundBestBall(scores, players, teamIds, ri);
    if (p !== null) { t += p; any = true; }
  });
  return any ? t : 0;
}

// Foursome match format by course. Ardglass (index 0) stays best-ball net Stableford
// AGGREGATE (sum of best balls; higher total wins). RCD onward (index >= 1) are best-ball
// MATCH PLAY (each hole won/lost/halved; most holes won wins; all square pushes).
var FOURSOME_MATCHPLAY_FROM = 1;
function foursomeIsMatchPlay(ri) { return ri >= FOURSOME_MATCHPLAY_FROM; }

// Best-ball MATCH PLAY for a 2-v-2 match on one course. Each hole: a side's ball is the
// lower (better) NET score of its two players; the side with the lower net wins the hole,
// equal halves. Returns { aHoles, bHoles, halved, perHole:[{aNet,bNet,w}] } or null.
function foursomeMatchPlay(scores, players, pairA, pairB, ri) {
  var course = COURSES[ri];
  if (!course || !course.pars || !course.si) return null;
  function bestNet(ids, h) {
    var best = null;
    for (var i = 0; i < ids.length; i++) {
      var p = players.find(function(x) { return x.id === ids[i]; });
      if (!p) continue;
      var g = scores[ids[i]] && scores[ids[i]][ri] && scores[ids[i]][ri][h];
      if (g == null) continue;
      var net = g - strokesOnHole(getCourseHandicap(p.handicap, ri), course.si[h]);
      if (best === null || net < best) best = net;
    }
    return best; // null = no ball posted on this hole
  }
  var aHoles = 0, bHoles = 0, halved = 0, perHole = [];
  for (var h = 0; h < 18; h++) {
    var aNet = bestNet(pairA, h), bNet = bestNet(pairB, h), w = null;
    if (aNet !== null && bNet !== null) {
      if (aNet < bNet) { aHoles++; w = "A"; }
      else if (bNet < aNet) { bHoles++; w = "B"; }
      else { halved++; w = "H"; }
    }
    perHole.push({ aNet: aNet, bNet: bNet, w: w });
  }
  return { aHoles: aHoles, bHoles: bHoles, halved: halved, perHole: perHole };
}

function getCountdown() {
  var now = new Date();
  var trip = new Date(TRIP_DATE);
  var diff = trip - now;
  if (diff <= 0) return { d:0, h:0, m:0, s:0, past:true };
  return {
    d: Math.floor(diff / 86400000),
    h: Math.floor((diff % 86400000) / 3600000),
    m: Math.floor((diff % 3600000) / 60000),
    s: Math.floor((diff % 60000) / 1000),
    past: false,
  };
}

function weatherIcon(condition) {
  if (!condition) return "🌤️";
  var c = condition.toLowerCase();
  if (c.indexOf("thunder") >= 0) return "⛈️";
  if (c.indexOf("rain") >= 0 || c.indexOf("shower") >= 0) return "🌧️";
  if (c.indexOf("cloud") >= 0 || c.indexOf("overcast") >= 0) return "⛅";
  if (c.indexOf("fog") >= 0 || c.indexOf("mist") >= 0) return "🌫️";
  if (c.indexOf("sun") >= 0 || c.indexOf("clear") >= 0) return "☀️";
  return "🌤️";
}

var ROUND_DATES = [
  new Date("2026-06-27T00:00:00+01:00"),
  new Date("2026-06-28T00:00:00+01:00"),
  new Date("2026-06-29T00:00:00+01:00"),
  new Date("2026-06-30T00:00:00+01:00"),
  new Date("2026-07-01T00:00:00+01:00"),
];

function getCurrentRound() {
  var now = new Date();
  for (var i = ROUND_DATES.length - 1; i >= 0; i--) {
    if (now >= ROUND_DATES[i]) return i;
  }
  return 0;
}

function getTripDay() {
  var now = new Date();
  var start = new Date("2026-06-26T00:00:00+01:00");
  var end = new Date("2026-07-03T23:59:59+01:00");
  if (now < start) return { status:"pre", day:0 };
  if (now > end) return { status:"post", day:8 };
  var diff = Math.floor((now - start) / 86400000) + 1;
  return { status:"active", day:Math.min(diff, 8) };
}

// Compute each player's net money balance across every bet, game, and expense.
// Single source of truth — used by both the Settle Up transfers and Net Balances.
// Over/Under matching engine: pairs OVER units 1-for-1 against UNDER units. Only matched
// (paired) units are live; the excess on the heavier side is unmatched and void. Entry
// order decides who gets matched — earliest in is paired first, the latest excess is left
// out ("first one in locks the bet"). Returns each player's MATCHED unit count per side;
// matched-over total always equals matched-under total, so settlement conserves to $0.
function matchOu(overUnits, underUnits, overTimes, underTimes) {
  function total(u) { return Object.keys(u || {}).reduce(function(s, id) { return s + (u[id] || 0); }, 0); }
  var overTot = total(overUnits), underTot = total(underUnits);
  var M = Math.min(overTot, underTot);
  function alloc(units, times) {
    var ids = Object.keys(units || {}).filter(function(id) { return (units[id] || 0) >= 1; });
    ids.sort(function(a, b) { var ta = (times && times[a]) || 0, tb = (times && times[b]) || 0; return ta !== tb ? ta - tb : (a < b ? -1 : 1); });
    var matched = {}, remaining = M;
    ids.forEach(function(id) { var take = Math.min(units[id] || 0, remaining); if (take > 0) matched[id] = take; remaining -= take; });
    return matched;
  }
  return { overMatched: alloc(overUnits, overTimes), underMatched: alloc(underUnits, underTimes), matched: M, overTotal: overTot, underTotal: underTot };
}

// Resolve a head-to-head bet's units. New bets carry aUnits/bUnits (+ timestamps). Any
// legacy pool-style bet (sideA/sideB lists, or bettor/opponent) is read as 1 unit each so
// the same matching engine drives both the settlement and the on-screen card.
function h2hUnits(b) {
  if (b.aUnits || b.bUnits) {
    return { aU: b.aUnits || {}, bU: b.bUnits || {}, aT: b.aTimes || {}, bT: b.bTimes || {} };
  }
  var aU = {}, bU = {};
  (b.sideA || (b.bettor ? [b.bettor] : [])).forEach(function(id) { if (id) aU[id] = 1; });
  (b.sideB || (b.opponent ? [b.opponent] : [])).forEach(function(id) { if (id) bU[id] = 1; });
  return { aU: aU, bU: bU, aT: {}, bT: {} };
}

function computeBalances(players, games, bets, h2hBets, teamMatches, individualProps, expenses, scores, skinsEligible, foursomeMatches, overUnderProps, manualWinners) {
  var mWins = manualWinners || {};
  var mwTeam = mWins.team || null;            // "a" | "b" | null
  var mwFour = mWins.foursome || {};          // { matchId: "A" | "B" }
  var balances = {};
  players.forEach(function(p) { balances[p.id] = 0; });

  // Side games
  games.forEach(function(g) {
    if (g.type === "nassau") {
      // Auto-computed net match-play Nassau (front/back/total). Live from scores.
      var nr = nassauResult(g, players, scores);
      players.forEach(function(p) { balances[p.id] = (balances[p.id] || 0) + (nr.results[p.id] || 0); });
      return;
    }
    if (!g.results) return;
    players.forEach(function(p) {
      balances[p.id] = (balances[p.id] || 0) + (g.results[p.id] || 0);
    });
  });

  // Group prop bets (team wins pot — all 8 players buy in)
  if (bets) {
    var matchup0 = TEAM_MATCHUPS[0];
    bets.forEach(function(b) {
      if (!b.settled || !b.buyin) return;
      var buyin = b.buyin || 0;
      var winIds = [];
      if (b.winner === "teamA") winIds = resolveTeam(matchup0.teamA, players);
      else if (b.winner === "teamB") winIds = resolveTeam(matchup0.teamB, players);
      else { var wp = players.find(function(p) { return p.id === b.winner; }); if (wp) winIds = [wp.id]; }
      if (winIds.length === 0) return; // no valid winner — skip
      var loseIds = players.filter(function(p) { return winIds.indexOf(p.id) === -1; }).map(function(p) { return p.id; });
      // Losers each pay buyin; that money is split among winners. Conserves money.
      var loserPot = buyin * loseIds.length;
      var winEach = loserPot / winIds.length;
      loseIds.forEach(function(pid) { balances[pid] = (balances[pid] || 0) - buyin; });
      winIds.forEach(function(pid) { balances[pid] = (balances[pid] || 0) + winEach; });
    });
  }

  // Head-to-head bets — matched book (same engine as Over/Unders). Side A units pair
  // 1-for-1 against Side B units, even money at the stake; first in line matches first;
  // unmatched excess is void. h2hUnits() reads new aUnits/bUnits and legacy 1-v-1 sides
  // so one engine drives both the on-screen card and settlement.
  if (h2hBets) {
    h2hBets.forEach(function(b) {
      if (!b.settled) return;
      var u = h2hUnits(b);
      var mm = matchOu(u.aU, u.bU, u.aT, u.bT); // aU -> "over", bU -> "under"
      if (mm.matched === 0) return; // nothing paired off — whole bet voids
      var stake = b.stake || DEFAULT_BUYIN;
      var winMatched = b.winningSide === "a" ? mm.overMatched : mm.underMatched;
      var loseMatched = b.winningSide === "a" ? mm.underMatched : mm.overMatched;
      // Matched A total === matched B total by construction, so this sums to $0.
      Object.keys(winMatched).forEach(function(id) { balances[id] = (balances[id] || 0) + winMatched[id] * stake; });
      Object.keys(loseMatched).forEach(function(id) { balances[id] = (balances[id] || 0) - loseMatched[id] * stake; });
    });
  }

  // Team match play results
  if (teamMatches) {
    var matchup = TEAM_MATCHUPS[0];
    teamMatches.forEach(function(m) {
      if (!m.settled || !m.winner) return;
      var aIds = resolveTeam(matchup.teamA, players);
      var bIds = resolveTeam(matchup.teamB, players);
      var winIds = m.winner === "a" ? aIds : bIds;
      var loseIds = m.winner === "a" ? bIds : aIds;
      loseIds.forEach(function(pid) { balances[pid] = (balances[pid] || 0) - m.stake; });
      winIds.forEach(function(pid) { balances[pid] = (balances[pid] || 0) + m.stake; });
    });
  }

  // Foursome Stableford matches — two 2-v-2 matches per course. Each pair's score
  // is the COMBINED net Stableford of its two core players for that round; the
  // higher pair total wins. Outside backers ride along on a side ("open pool"):
  // every player on the losing side pays `stake`, split evenly across the winning
  // side. Conserves to $0 for any side sizes. Resolves LIVE once all four core
  // players have the full round posted and the pair totals aren't tied.
  if (foursomeMatches && scores) {
    foursomeMatches.forEach(function(m) {
      var ri = m.courseIdx;
      var pairA = m.pairA || [], pairB = m.pairB || [];
      var core = pairA.concat(pairB);
      if (core.length === 0) return;
      // Decide the winning side. A Carl-set manual winner overrides everything. Otherwise:
      // Ardglass = best-ball net Stableford AGGREGATE (higher total wins); RCD onward =
      // best-ball MATCH PLAY (more holes won wins; all square pushes). aWins true=>pairA.
      var aWins;
      var mw = mwFour[m.id];
      if (mw === "push") return; // manual push — no money moves on this match
      if (mw === "A" || mw === "B") {
        aWins = mw === "A"; // manual override — wins regardless of scores/completion
      } else if (foursomeIsMatchPlay(ri)) {
        if (!roundComplete(scores, ri, core)) return;
        var mp = foursomeMatchPlay(scores, players, pairA, pairB, ri);
        if (!mp || mp.aHoles === mp.bHoles) return; // all square / no result → push, no money
        aWins = mp.aHoles > mp.bHoles;
      } else {
        if (!roundComplete(scores, ri, core)) return;
        var aPts = getTeamRoundBestBall(scores, players, pairA, ri);
        var bPts = getTeamRoundBestBall(scores, players, pairB, ri);
        if (aPts === null || bPts === null || aPts === bPts) return; // tie/incomplete → no money
        aWins = aPts > bPts;
      }
      // Defensive: a backer must be an outsider and on only one side.
      function cleanBackers(list, otherList) {
        return (list || []).filter(function(id) {
          return core.indexOf(id) < 0 && (otherList || []).indexOf(id) < 0;
        });
      }
      var bckA = cleanBackers(m.backersA, m.backersB);
      var bckB = cleanBackers(m.backersB, m.backersA);
      var stake = m.stake || STAKE_FOURSOME;
      var winCore = aWins ? pairA : pairB;
      var loseCore = aWins ? pairB : pairA;
      // 1) The foursome match itself — the four core players only. Losers each pay
      //    `stake`, split evenly among the winners (2-v-2 → ±$stake each).
      if (winCore.length > 0 && loseCore.length > 0) {
        var coreLoseTotal = loseCore.length * stake;
        var coreWinEach = coreLoseTotal / winCore.length;
        loseCore.forEach(function(pid) { balances[pid] = (balances[pid] || 0) - stake; });
        winCore.forEach(function(pid) { balances[pid] = (balances[pid] || 0) + coreWinEach; });
      }
      // 2) Backer side bet — a SEPARATE $stake pool among the outside backers only.
      //    The match result decides the side; losing-side backers pay, winning-side
      //    backers split. One-sided (no backers opposing) = void, no money moves.
      var winBck = aWins ? bckA : bckB;
      var loseBck = aWins ? bckB : bckA;
      if (winBck.length > 0 && loseBck.length > 0) {
        var bckLoseTotal = loseBck.length * stake;
        var bckWinEach = bckLoseTotal / winBck.length;
        loseBck.forEach(function(pid) { balances[pid] = (balances[pid] || 0) - stake; });
        winBck.forEach(function(pid) { balances[pid] = (balances[pid] || 0) + bckWinEach; });
      }
    });
  }

  // Individual prop bets (single winner takes the pot; only opted-in players buy in).
  // A manually-settled winner always wins; otherwise score-determinable props
  // (Most Net Stableford / Lowest Net) auto-resolve from the card once rounds are in.
  if (individualProps) {
    individualProps.forEach(function(prop) {
      var winner = (prop.settled && prop.winner) ? prop.winner : autoPropWinner(prop, players, scores);
      if (!winner) return;
      var buyin = prop.buyin || DEFAULT_BUYIN;
      var elig = prop.eligible || [];
      // Defensive: the winner must be among the eligible. If somehow not, no money moves.
      if (elig.indexOf(winner) < 0) return;
      // One bet per player: the winner collects a single buy-in from each other eligible
      // player (winner-take-all). Every transfer is paired, so it always sums to $0.
      elig.forEach(function(pid) {
        if (pid === winner) return;
        balances[pid] = (balances[pid] || 0) - buyin;
        balances[winner] = (balances[winner] || 0) + buyin;
      });
    });
  }

  // Over/Under props — matched two-sided book. OVER units are paired 1-for-1 against UNDER
  // units; only matched pairs are live (each an even-money bet at the stake). The unmatched
  // excess on the heavier side is void. Entry order decides who's matched. Settled manually
  // once the real figure is known.
  if (overUnderProps) {
    overUnderProps.forEach(function(p) {
      if (!p.settled || !p.result) return;
      var stake = p.stake || DEFAULT_BUYIN;
      var m = matchOu(p.overUnits || {}, p.underUnits || {}, p.overTimes || {}, p.underTimes || {});
      if (m.matched === 0) return; // nothing paired off — void
      var winMatched = p.result === "over" ? m.overMatched : m.underMatched;
      var loseMatched = p.result === "over" ? m.underMatched : m.overMatched;
      // Each matched unit is even money: winner +stake, loser −stake. Matched-over total
      // equals matched-under total by construction, so this always sums to $0.
      Object.keys(winMatched).forEach(function(id) { balances[id] = (balances[id] || 0) + winMatched[id] * stake; });
      Object.keys(loseMatched).forEach(function(id) { balances[id] = (balances[id] || 0) - loseMatched[id] * stake; });
    });
  }

  // ── Score-derived bets (computed live from current scores) ────────────
  // These have no manual "settle" step — they reflect the standings as they
  // stand right now and resolve to their final values once all rounds are in.
  // Each block conserves money (the per-bet balance contributions sum to 0).

  // Team Stableford — the main event ($100/man). Winning team's players each
  // collect $100 from the losing team. A tie moves no money.
  if (scores) {
    var tsMatchup = TEAM_MATCHUPS[0];
    var tsA = resolveTeam(tsMatchup.teamA, players);
    var tsB = resolveTeam(tsMatchup.teamB, players);
    var tsTotA = getTeamTotalBestBall(scores, players, tsA);
    var tsTotB = getTeamTotalBestBall(scores, players, tsB);
    var TS_STAKE = STAKE_TEAM;
    if (mwTeam === "push") {
      // Carl-set manual push — no money moves on the team bet.
    } else if (mwTeam === "a" || mwTeam === "b") {
      // Carl-set manual winner overrides the auto best-ball result.
      var tsWinM = mwTeam === "a" ? tsA : tsB;
      var tsLoseM = mwTeam === "a" ? tsB : tsA;
      if (tsWinM.length > 0 && tsLoseM.length > 0) {
        var tsWinEachM = (TS_STAKE * tsLoseM.length) / tsWinM.length;
        tsLoseM.forEach(function(pid) { balances[pid] = (balances[pid] || 0) - TS_STAKE; });
        tsWinM.forEach(function(pid) { balances[pid] = (balances[pid] || 0) + tsWinEachM; });
      }
    } else if ((tsTotA > 0 || tsTotB > 0) && tsTotA !== tsTotB && tsA.length > 0 && tsB.length > 0) {
      var tsWinIds = tsTotA > tsTotB ? tsA : tsB;
      var tsLoseIds = tsTotA > tsTotB ? tsB : tsA;
      var tsWinEach = (TS_STAKE * tsLoseIds.length) / tsWinIds.length;
      tsLoseIds.forEach(function(pid) { balances[pid] = (balances[pid] || 0) - TS_STAKE; });
      tsWinIds.forEach(function(pid) { balances[pid] = (balances[pid] || 0) + tsWinEach; });
    }
  }

  // Individual Gross Stableford — two handicap brackets, winner-take-all
  // ($50/man). Every player in a bracket buys in; the bracket's gross-Stableford
  // leader collects the pot. A tie at the top is left unresolved (no money yet).
  if (SHOW_GROSS && scores) {
    var GS_STAKE = STAKE_GROSS;
    var gsBrackets = getGrossBrackets(players);
    [gsBrackets.a, gsBrackets.b].forEach(function(ids) {
      if (!ids || ids.length < 2) return;
      var gsRows = ids.map(function(pid) { return { id: pid, pts: getTotalGrossStableford(scores, pid) }; })
                      .filter(function(r) { return r.pts !== null; });
      if (gsRows.length < 2) return; // not enough players have scores to call it
      gsRows.sort(function(a, b) { return b.pts - a.pts; });
      var gsTop = gsRows[0].pts;
      var gsLeaders = gsRows.filter(function(r) { return r.pts === gsTop; });
      if (gsLeaders.length !== 1) return; // tie at the top → unresolved
      var gsWinnerId = gsLeaders[0].id;
      ids.forEach(function(pid) {
        if (pid === gsWinnerId) balances[pid] = (balances[pid] || 0) + (GS_STAKE * (ids.length - 1));
        else balances[pid] = (balances[pid] || 0) - GS_STAKE;
      });
    });
  }

  // Skins — five independent per-course games. Net scoring, $20/skin, opt-in per course.
  // A skin pays its winner $20 from every other eligible player in that course's game.
  if (SHOW_SKINS && scores && skinsEligible && skinsEligible.course) {
    var SK_STAKE = STAKE_SKIN;
    COURSES.forEach(function(c, ri) {
      var skElig = (skinsEligible.course[ri]) || [];
      if (skElig.length < 2) return;
      var rd = computeSkins(scores, players, skElig, ri, true); // net
      var skTotals = rd.totals || {};
      var skGrand = 0;
      skElig.forEach(function(pid) { skGrand += (skTotals[pid] || 0); });
      if (skGrand === 0) return; // no skins decided on this course yet
      skElig.forEach(function(pid) {
        var won = skTotals[pid] || 0;
        var winnings = won * SK_STAKE * (skElig.length - 1);
        var cost = (skGrand - won) * SK_STAKE;
        balances[pid] = (balances[pid] || 0) + (winnings - cost);
      });
    });
  }

  // Overall trip-total skins — gross and net, one combined pot each ($20/skin), opt-in.
  // Independent of the per-course games above; a player can be in either, both, or neither.
  if (SHOW_SKINS && scores && skinsEligible) {
    [{ type: "gross", useNet: false }, { type: "net", useNet: true }].forEach(function(cfg) {
      var elig = skinsEligible[cfg.type] || [];
      if (elig.length < 2) return;
      var totals = getTotalSkins(scores, players, elig, cfg.useNet);
      var grand = 0;
      elig.forEach(function(pid) { grand += (totals[pid] || 0); });
      if (grand === 0) return;
      elig.forEach(function(pid) {
        var won = totals[pid] || 0;
        balances[pid] = (balances[pid] || 0) + (won * STAKE_SKIN * (elig.length - 1) - (grand - won) * STAKE_SKIN);
      });
    });
  }

  // Trip expenses (split costs) — net = what you paid minus your share
  if (expenses) {
    expenses.forEach(function(exp) {
      if (!exp.payer || !exp.splitAmong || exp.splitAmong.length === 0) return;
      var perPerson = exp.amount / exp.splitAmong.length;
      // Payer is credited the full amount they paid
      balances[exp.payer] = (balances[exp.payer] || 0) + exp.amount;
      // Everyone in the split (including payer if they're in it) is debited their share
      exp.splitAmong.forEach(function(pid) {
        balances[pid] = (balances[pid] || 0) - perPerson;
      });
    });
  }

  return balances;
}

// Round every player's net balance to whole dollars WITHOUT breaking conservation.
// Naive per-player rounding can make the table sum to ±a few dollars; instead we
// round each balance, measure the total drift, then nudge the players we rounded
// most aggressively by $1 until the set sums back to exactly $0. Guarantees the
// Net Balances table and the Settle Up transfers always reconcile to the penny.
function roundBalances(balances, players) {
  var rounded = {};
  var resid = [];
  var sum = 0;
  players.forEach(function(p) {
    var v = balances[p.id] || 0;
    var r = Math.round(v);
    rounded[p.id] = r;
    sum += r;
    resid.push({ id: p.id, frac: v - r }); // how far the raw value sat from its rounded value
  });
  var drift = Math.round(sum); // integer dollars of over/under-allocation
  if (drift !== 0) {
    var dir = drift > 0 ? -1 : 1; // over-credited → subtract $1s; over-debited → add $1s
    var n = Math.abs(drift);
    // Adjust the players whose rounding error best absorbs the nudge.
    resid.sort(function(a, b) { return dir < 0 ? a.frac - b.frac : b.frac - a.frac; });
    for (var i = 0; i < n && i < resid.length; i++) rounded[resid[i].id] += dir;
  }
  return rounded;
}

// Greedy min-cash-flow: turn net balances into a short list of who-pays-whom.
function calculateSettleUp(players, games, bets, h2hBets, teamMatches, individualProps, expenses, scores, skinsEligible, foursomeMatches, overUnderProps, manualWinners) {
  var raw = computeBalances(players, games, bets, h2hBets, teamMatches, individualProps, expenses, scores, skinsEligible, foursomeMatches, overUnderProps, manualWinners);
  var balances = roundBalances(raw, players); // whole-dollar, still sums to $0
  var creditors = [];
  var debtors = [];
  players.forEach(function(p) {
    var b = balances[p.id] || 0;
    if (b > 0) creditors.push({ id:p.id, name:p.name, emoji:p.emoji, amount:b });
    else if (b < 0) debtors.push({ id:p.id, name:p.name, emoji:p.emoji, amount:-b });
  });

  creditors.sort(function(a,b) { return b.amount - a.amount; });
  debtors.sort(function(a,b) { return b.amount - a.amount; });

  var transfers = [];
  var ci = 0, di = 0;
  while (ci < creditors.length && di < debtors.length) {
    var amount = Math.min(creditors[ci].amount, debtors[di].amount);
    if (amount > 0) {
      transfers.push({ from:debtors[di], to:creditors[ci], amount:amount });
    }
    creditors[ci].amount -= amount;
    debtors[di].amount -= amount;
    if (creditors[ci].amount <= 0) ci++;
    if (debtors[di].amount <= 0) di++;
  }
  return transfers;
}

// ─── MAP PROJECTION ──────────────────────────────────────────────────
var MAP_BOUNDS = { minLat:53.0, maxLat:55.45, minLng:-7.2, maxLng:-5.1 };
function proj(lat, lng, w, h) {
  return {
    x: (lng - MAP_BOUNDS.minLng) / (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng) * w,
    y: (MAP_BOUNDS.maxLat - lat) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat) * h,
  };
}
var COAST = [[53.0,-6.0],[53.15,-6.15],[53.25,-6.22],[53.34,-6.25],[53.4,-6.15],[53.45,-6.08],[53.55,-6.0],[53.65,-5.98],[53.75,-6.0],[53.85,-5.95],[53.95,-5.85],[54.0,-5.78],[54.05,-5.7],[54.1,-5.6],[54.15,-5.52],[54.2,-5.48],[54.25,-5.44],[54.3,-5.45],[54.35,-5.5],[54.38,-5.55],[54.42,-5.58],[54.48,-5.52],[54.52,-5.48],[54.58,-5.48],[54.65,-5.52],[54.7,-5.58],[54.75,-5.65],[54.8,-5.68],[54.85,-5.72],[54.9,-5.78],[54.95,-5.82],[55.0,-5.82],[55.05,-5.78],[55.1,-5.72],[55.15,-5.68],[55.18,-5.65],[55.22,-5.62],[55.25,-5.65],[55.28,-5.72],[55.3,-5.82],[55.32,-5.92],[55.34,-6.02],[55.35,-6.15],[55.33,-6.28],[55.3,-6.38],[55.27,-6.48],[55.24,-6.55],[55.22,-6.62],[55.21,-6.72],[55.22,-6.82],[55.21,-6.92],[55.18,-7.0],[55.14,-7.08],[55.08,-7.15],[55.0,-7.18],[54.92,-7.2],[54.85,-7.18],[54.78,-7.15],[54.7,-7.12],[54.6,-7.1],[54.5,-7.08],[54.42,-7.05],[54.35,-6.98],[54.28,-6.9],[54.2,-6.82],[54.15,-6.75],[54.1,-6.65],[54.05,-6.55],[54.0,-6.45],[53.95,-6.38],[53.88,-6.32],[53.8,-6.3],[53.7,-6.28],[53.6,-6.25],[53.5,-6.22],[53.4,-6.2],[53.34,-6.25]];

// ─── STYLES ──────────────────────────────────────────────────────────
// Higher-contrast palette: brighter body text, lighter muted gray (less blue),
// and a card that lifts off the page for easier reading.
var CL = { bg:"#0a1225", card:"#16294a", border:"#2a4570", red:"#f0454a", blue:"#6facff", cream:"#f0f4ff", text:"#e6edf8", muted:"#b3c2db" };

var S = {
  app:        { background:CL.bg, minHeight:"100vh", maxWidth:480, margin:"0 auto", fontFamily:"'Georgia','Times New Roman',serif", color:CL.text, paddingBottom:80 },
  content:    { padding:"0 0 20px 0" },
  loading:    { display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100vh", background:CL.bg, color:"#fff" },
  hero:       { background:"linear-gradient(135deg,#111d35 0%,#0a1225 50%,#0e1a30 100%)", padding:"48px 24px 28px", textAlign:"center", borderBottom:"2px solid "+CL.red },
  card:       { background:CL.card, border:"1px solid "+CL.border, borderRadius:8, margin:"12px 16px", padding:16 },
  cardTitle:  { fontSize:14, fontWeight:700, color:CL.red, letterSpacing:1.5, textTransform:"uppercase", marginBottom:10, fontFamily:"system-ui" },
  pageHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"20px 16px 8px" },
  pageTitle:  { fontSize:24, fontWeight:700, color:"#fff", letterSpacing:1 },
  input:      { width:"100%", padding:"11px 12px", background:"rgba(30,58,95,0.25)", border:"1px solid "+CL.border, borderRadius:6, color:"#fff", fontSize:15, marginBottom:8, fontFamily:"system-ui", boxSizing:"border-box" },
  primaryBtn: { width:"100%", padding:13, background:CL.red, color:"#fff", border:"none", borderRadius:6, fontSize:15, fontWeight:700, cursor:"pointer", fontFamily:"system-ui" },
  secondaryBtn:{ width:"100%", padding:11, background:"none", border:"1px solid "+CL.muted, borderRadius:6, color:CL.muted, fontSize:14, cursor:"pointer", fontFamily:"system-ui" },
  addBtn:     { background:CL.red, color:"#fff", border:"none", borderRadius:6, padding:"9px 16px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"system-ui" },
  roundBtn:   { flex:1, padding:"11px 0", background:CL.card, border:"1px solid "+CL.border, borderRadius:6, color:CL.muted, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"system-ui", minWidth:44 },
  roundBtnOn: { background:CL.red, color:"#fff", borderColor:CL.red },
  holeBtn:    { background:"rgba(30,58,95,0.2)", border:"1px solid "+CL.border, borderRadius:4, padding:"4px 0", cursor:"pointer", textAlign:"center", minHeight:40 },
  holeFilled: { background:"rgba(37,99,235,0.35)", borderColor:CL.blue },
  modal:      { position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 },
  modalBox:   { background:CL.card, border:"2px solid "+CL.red, borderRadius:12, padding:24, width:"85%", maxWidth:360 },
  scoreBtn:   { padding:14, borderRadius:8, border:"1px solid "+CL.border, background:"rgba(30,58,95,0.3)", color:"#fff", fontSize:18, fontWeight:700, cursor:"pointer" },
  scoreBtnOn: { background:CL.red, color:"#fff", borderColor:CL.red },
  nav:        { position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, background:"rgba(17,29,53,0.95)", borderTop:"1px solid "+CL.border, display:"flex", justifyContent:"space-around", padding:"6px 0 env(safe-area-inset-bottom, 8px)", backdropFilter:"blur(12px)", zIndex:50 },
  navBtn:     { background:"none", border:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:2, padding:"6px 2px", minWidth:0, flex:1 },
  navLabel:   { fontSize:10, color:CL.muted, fontFamily:"system-ui", fontWeight:600 },
  // Reusable patterns
  row:        { display:"flex", alignItems:"center", gap:12, padding:"10px 0" },
  separator:  { borderBottom:"1px solid "+CL.border },
  subTab:     { flex:1, padding:"9px 0", borderRadius:6, fontSize:13.5, fontWeight:700, cursor:"pointer", fontFamily:"system-ui" },
  subTabOff:  { background:CL.card, border:"1px solid "+CL.border, color:CL.muted },
  subTabOn:   { background:"rgba(240,69,74,0.18)", border:"1px solid "+CL.red, color:CL.red },
  pillBtn:    { padding:"6px 12px", borderRadius:12, border:"1px solid "+CL.border, background:"rgba(40,69,112,0.3)", color:"#fff", fontSize:13, cursor:"pointer", fontFamily:"system-ui" },
  teamBox:    { flex:1, borderRadius:6, padding:10, border:"1px solid "+CL.border, background:"rgba(40,69,112,0.2)" },
  teamBoxWin: { border:"1px solid rgba(240,69,74,0.35)", background:"rgba(240,69,74,0.12)" },
  label:      { fontSize:13.5, color:CL.muted, fontFamily:"system-ui", fontWeight:600 },
  white:      { color:"#fff" },
  bold:       { fontWeight:700 },
  sys:        { fontFamily:"system-ui" },
  eventCard:  { marginTop:10, padding:10, background:"rgba(220,38,38,0.08)", borderRadius:6, border:"1px solid rgba(220,38,38,0.2)", display:"flex", gap:10, alignItems:"center" },
};

// ─── STORAGE (Firebase) ──────────────────────────────────────────────
// State syncs via Firestore real-time listeners (see firebase.js)
// Auth stored in localStorage (per-device, not synced)

function loadAuth() {
  try {
    var raw = localStorage.getItem(AUTH_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return null;
}

function saveAuth(data) {
  try { localStorage.setItem(AUTH_KEY, JSON.stringify(data)); } catch(e) {}
}

// ─── AUTH SCREENS ────────────────────────────────────────────────────
function PinScreen(props) {
  var ds = useState(["","","",""]); var digits = ds[0], setDigits = ds[1];
  var es = useState(null); var err = es[0], setErr = es[1];
  var focused = useState(0); var fi = focused[0], setFi = focused[1];

  function handleDigit(d) {
    if (fi >= 4) return;
    var nd = digits.slice();
    nd[fi] = d;
    setDigits(nd);
    if (fi === 3) {
      var pin = nd.join("");
      if (pin === GROUP_PIN) {
        props.onSuccess();
      } else {
        setErr("Wrong code. Try again.");
        setTimeout(function() { setDigits(["","","",""]); setFi(0); setErr(null); }, 1000);
      }
    } else {
      setFi(fi + 1);
    }
  }

  function handleDelete() {
    if (fi <= 0) return;
    var nd = digits.slice();
    nd[fi - 1] = "";
    setDigits(nd);
    setFi(fi - 1);
    setErr(null);
  }

  var keys = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

  return (
    <div style={Object.assign({}, S.loading, {padding:24})}>
      <img src="/logo.png" alt="Northern Irish Links 2026" onError={function(e){e.target.style.display="none";}} style={{width:160, height:160, marginBottom:16}} />
      <div style={{display:"flex", justifyContent:"center", gap:6, marginBottom:16}}>
        {[CL.red, "#fff", CL.blue].map(function(c,i) { return <div key={i} style={{width:20, height:3, borderRadius:2, background:c}} />; })}
      </div>

      <button onClick={props.onGuest} style={{marginBottom:20, background:"none", border:"1px solid "+CL.border, borderRadius:8, padding:"10px 20px", color:CL.muted, fontSize:13, fontFamily:"system-ui", cursor:"pointer"}}>
        👁️ View as Guest
      </button>

      <div style={{fontSize:14, color:CL.muted, fontFamily:"system-ui", marginBottom:20}}>Enter group passcode</div>

      <div style={{display:"flex", gap:24, marginBottom:16, justifyContent:"center"}}>
        {digits.map(function(d, i) {
          return (
            <div key={i} style={{width:60, height:60, borderRadius:30, border:"3px solid " + (i === fi ? CL.red : err ? CL.red : CL.border), background:CL.card, display:"flex", alignItems:"center", justifyContent:"center", fontSize:28, fontWeight:700, color:"#fff", fontFamily:"system-ui"}}>
              {d ? "•" : ""}
            </div>
          );
        })}
      </div>

      {err && <div style={{fontSize:14, color:CL.red, fontFamily:"system-ui", marginBottom:8, height:22}}>{err}</div>}
      {!err && <div style={{height:30}} />}

      <div style={{display:"grid", gridTemplateColumns:"80px 80px 80px", gap:20, justifyContent:"center"}}>
        {keys.map(function(k, i) {
          if (k === "") return <div key={i} />;
          var isDel = k === "⌫";
          return (
            <button key={i} onClick={function() { isDel ? handleDelete() : handleDigit(k); }} style={{width:80, height:80, borderRadius:40, border:"none", background:isDel ? "transparent" : "rgba(30,58,95,0.35)", color:isDel ? CL.muted : "#fff", fontSize:isDel ? 28 : 34, fontWeight:isDel ? 400 : 300, cursor:"pointer", fontFamily:"system-ui", display:"flex", alignItems:"center", justifyContent:"center"}}>
              {k}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PlayerSelectScreen(props) {
  var players = props.players;
  return (
    <div style={Object.assign({}, S.loading, {padding:24, justifyContent:"flex-start", paddingTop:60})}>
      <img src="/logo.png" alt="Northern Irish Links 2026" onError={function(e){e.target.style.display="none";}} style={{width:100, height:100, marginBottom:12}} />
      <div style={{fontSize:20, fontWeight:700, color:"#fff", marginBottom:4}}>Who are you?</div>
      <div style={{fontSize:14, color:CL.muted, fontFamily:"system-ui", marginBottom:24}}>Select your name to personalize the app</div>

      <div style={{width:"100%", maxWidth:340}}>
        {players.map(function(p) {
          return (
            <button key={p.id} onClick={function() { props.onSelect(p.id); }} style={{display:"flex", alignItems:"center", gap:12, width:"100%", padding:"14px 16px", marginBottom:8, background:CL.card, border:"1px solid " + CL.border, borderRadius:10, cursor:"pointer", textAlign:"left"}}>
              <span style={{fontSize:24}}>{p.emoji}</span>
              <div>
                <div style={{fontSize:16, fontWeight:600, color:"#fff", fontFamily:"system-ui"}}>{p.name}</div>
                <div style={{fontSize:11, color:CL.muted, fontFamily:"system-ui"}}>{"HCP " + p.handicap}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── APP SHELL ───────────────────────────────────────────────────────
export default function App() {
  var st = useState(Object.assign({}, defaultState(), { activeTab:(function(){ try { return localStorage.getItem(TAB_KEY) || "home"; } catch(e) { return "home"; } })(), selectedRound:getCurrentRound(), addingGame:false, initialized:false }));
  var state = st[0], setState = st[1];
  // Persist the active tab device-locally so a reload (pull-to-refresh, OS, etc.)
  // restores it instead of dropping back to Home.
  useEffect(function() { try { localStorage.setItem(TAB_KEY, state.activeTab); } catch (e) {} }, [state.activeTab]);
  var ld = useState(true); var loading = ld[0], setLoading = ld[1];
  var sh = useState(null); var scoringHole = sh[0], setScoringHole = sh[1];
  var sv = useState("idle"); var saveStatus = sv[0], setSaveStatus = sv[1];
  var lcs = useState(0); var latestChatTs = lcs[0], setLatestChatTs = lcs[1];
  var cms = useState([]); var chatMsgs = cms[0], setChatMsgs = cms[1];
  // In-app toast cards + optional native notifications for new chat messages.
  var tst = useState([]); var toasts = tst[0], setToasts = tst[1];
  var npm = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  var notifPerm = npm[0], setNotifPerm = npm[1];
  var chatInit = useRef(false);
  var seenChatIds = useRef({});
  var scs = useState(function() {
    try { return parseInt(localStorage.getItem("ni-links-chat-seen") || "0", 10) || 0; } catch(e) { return 0; }
  });
  var chatSeenTs = scs[0], setChatSeenTs = scs[1];
  var as = useState(function() {
    var authState = loadAuth();
    return { authed:authState ? authState.authed : false, playerId:authState ? authState.playerId : null, loaded:true };
  });
  var auth = as[0], setAuth = as[1];

  // Track connectivity so we can reassure players their entries are queued, not lost,
  // when signal drops out on the course. Firestore's persistent cache handles the
  // actual queue + sync; this is purely the visual cue.
  var onl = useState(typeof navigator !== "undefined" ? navigator.onLine !== false : true);
  var online = onl[0], setOnline = onl[1];
  useEffect(function() {
    function goOnline() { setOnline(true); }
    function goOffline() { setOnline(false); }
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return function() {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [setOnline]);

  // Real-time Firebase subscription for game state
  var hasLoadedData = useRef(false);
  useEffect(function() {
    var unsub = subscribeToState(function(data) {
      if (data) {
        hasLoadedData.current = true;
        var merged = Object.assign({}, defaultState(), data);
        if (!merged.scores || Object.keys(merged.scores).length === 0) {
          merged.scores = initScores(merged.players);
        }
        // Use latest handicaps from code to override stale Firebase values —
        // UNLESS a handicap was manually edited in the app (handicapEdited flag),
        // in which case the manual value is preserved.
        merged.players = merged.players.map(function(p) {
          if (p.handicapEdited) return p; // manual edit wins
          var latest = DEFAULT_PLAYERS.find(function(d) { return d.id === p.id; });
          return latest ? Object.assign({}, p, { handicap: latest.handicap }) : p;
        });
        // Force-sync prop bet definitions from code so removed props disappear and
        // newly added props show up. Preserve settled/winner state for any prop that
        // still exists (matched by id), and keep user-added custom props.
        function syncProps(codeList, savedList) {
          var savedById = {};
          (savedList || []).forEach(function(s) { if (s && s.id) savedById[s.id] = s; });
          var codeIds = {};
          codeList.forEach(function(d) { codeIds[d.id] = true; });
          // Start with the code list (preserving settled state + eligible selections for matching ids)
          var result = codeList.map(function(def) {
            var prev = savedById[def.id];
            if (prev) {
              var merged = Object.assign({}, def);
              if (prev.settled || prev.winner) { merged.settled = prev.settled; merged.winner = prev.winner; }
              if (prev.eligible) merged.eligible = prev.eligible; // keep who's been selected
              return merged;
            }
            return Object.assign({}, def);
          });
          // Append any user-created custom props (ids not in the code list)
          (savedList || []).forEach(function(s) {
            if (s && s.id && !codeIds[s.id] && s.isCustom) result.push(s);
          });
          return result;
        }
        merged.bets = syncProps(DEFAULT_PROPS, merged.bets);
        merged.individualProps = syncProps(DEFAULT_INDIVIDUAL_PROPS, merged.individualProps);
        // Prop entries now carry a UNIT COUNT per player. The source of truth is the
        // propUnits map ({ propId: { pid: count } }), written one field path at a time so
        // it's clobber-proof (same discipline as the foursome backers / opt-ins). We derive
        // each prop's `units` (counts) and `eligible` (anyone with >=1 unit) for settlement
        // and display. Fallback: if a prop has no propUnits yet, treat the legacy
        // propEligible / eligible membership as 1 unit each, so nothing is lost.
        (function() {
          var pu = (merged.propUnits && typeof merged.propUnits === "object" && !Array.isArray(merged.propUnits)) ? merged.propUnits : {};
          var pe = (merged.propEligible && typeof merged.propEligible === "object" && !Array.isArray(merged.propEligible)) ? merged.propEligible : {};
          merged.individualProps = merged.individualProps.map(function(p) {
            var u = {};
            if (pu[p.id] && typeof pu[p.id] === "object") {
              Object.keys(pu[p.id]).forEach(function(pid) { var n = Number(pu[p.id][pid]) || 0; if (n > 0) u[pid] = n; });
            } else {
              var legacy = Array.isArray(pe[p.id]) ? pe[p.id] : (Array.isArray(p.eligible) ? p.eligible : []);
              legacy.forEach(function(pid) { u[pid] = 1; });
            }
            var elig = Object.keys(u).filter(function(pid) { return u[pid] > 0; });
            return Object.assign({}, p, { units: u, eligible: elig });
          });
          merged.propUnits = pu;
          merged.propEligible = pe;
        })();
        // Update active slopes based on selected tees
        var st = merged.selectedTees || [0,0,0,0,0];
        COURSES.forEach(function(c, i) {
          var ti = st[i] || 0;
          if (ti >= 0 && ti < c.tees.length) ACTIVE_SLOPES[i] = c.tees[ti].slope;
        });
        // Apply any gatekeeper course-setup overrides (par/SI) onto live COURSES.
        applyCourseOverrides(merged.courseOverrides);
        // Migrate skins eligibility to the per-course shape ({ course: [ [], x5 ] }).
        if (!merged.skinsEligible || typeof merged.skinsEligible !== "object") merged.skinsEligible = {};
        if (!Array.isArray(merged.skinsEligible.gross)) merged.skinsEligible.gross = [];
        if (!Array.isArray(merged.skinsEligible.net)) merged.skinsEligible.net = [];
        if (!Array.isArray(merged.skinsEligible.course)) merged.skinsEligible.course = [];
        while (merged.skinsEligible.course.length < COURSES.length) merged.skinsEligible.course.push([]);
        // Over/Under props: definitions stay in the synced array; the per-player side,
        // unit counts, and entry timestamps live in dedicated atomic maps — ouUnits
        // ({ propId: { over:{pid:n}, under:{pid:n} } }) and ouTimes (same shape, ms epoch
        // of when each player first took that side) — written one field at a time
        // (clobber-proof). The timestamps drive the matching engine's "first one in" order.
        // Derive each prop's overUnits/underUnits + overTimes/underTimes; fall back to any
        // legacy over/under arrays (1 unit each, ordered by array position) so old data is
        // never lost.
        if (!Array.isArray(merged.overUnderProps)) merged.overUnderProps = DEFAULT_OU_PROPS.slice();
        var ouMap = (merged.ouUnits && typeof merged.ouUnits === "object" && !Array.isArray(merged.ouUnits)) ? merged.ouUnits : {};
        var ouTimes = (merged.ouTimes && typeof merged.ouTimes === "object" && !Array.isArray(merged.ouTimes)) ? merged.ouTimes : {};
        merged.overUnderProps = merged.overUnderProps.map(function(p) {
          var entry = (ouMap[p.id] && typeof ouMap[p.id] === "object") ? ouMap[p.id] : {};
          var tEntry = (ouTimes[p.id] && typeof ouTimes[p.id] === "object") ? ouTimes[p.id] : {};
          var ov = Object.assign({}, (entry.over && typeof entry.over === "object") ? entry.over : {});
          var un = Object.assign({}, (entry.under && typeof entry.under === "object") ? entry.under : {});
          var ovT = Object.assign({}, (tEntry.over && typeof tEntry.over === "object") ? tEntry.over : {});
          var unT = Object.assign({}, (tEntry.under && typeof tEntry.under === "object") ? tEntry.under : {});
          if (Object.keys(ov).length === 0 && Array.isArray(p.over)) p.over.forEach(function(id, i) { ov[id] = 1; ovT[id] = i + 1; });
          if (Object.keys(un).length === 0 && Array.isArray(p.under)) p.under.forEach(function(id, i) { un[id] = 1; unT[id] = i + 1; });
          return Object.assign({}, p, { overUnits: ov, underUnits: un, overTimes: ovT, underTimes: unT });
        });
        merged.ouUnits = ouMap;
        merged.ouTimes = ouTimes;
        // Seed/sync the foursome Stableford matches. The pairings are fixed in code.
        // Backers now live in a dedicated `foursomeBackers` map ({ matchId: {a,b} })
        // written atomically — never inside this array — so a full-document save can't
        // clobber them. We (1) carry the map forward from the saved doc, and (2) one-time
        // recover any legacy backers that older builds wrote into foursomeMatches[i].
        (function() {
          var fb = (merged.foursomeBackers && typeof merged.foursomeBackers === "object") ? merged.foursomeBackers : {};
          var savedFM = {};
          (Array.isArray(merged.foursomeMatches) ? merged.foursomeMatches : []).forEach(function(m) {
            if (m && m.id) savedFM[m.id] = m;
          });
          DEFAULT_FOURSOME_MATCHES.forEach(function(def) {
            var cur = fb[def.id] || { a: [], b: [] };
            var a = Array.isArray(cur.a) ? cur.a.slice() : [];
            var b = Array.isArray(cur.b) ? cur.b.slice() : [];
            var legacy = savedFM[def.id];
            if (legacy) { // fold in any backers stranded in the old array shape
              (Array.isArray(legacy.backersA) ? legacy.backersA : []).forEach(function(id) { if (a.indexOf(id) < 0) a.push(id); });
              (Array.isArray(legacy.backersB) ? legacy.backersB : []).forEach(function(id) { if (b.indexOf(id) < 0) b.push(id); });
            }
            fb[def.id] = { a: a, b: b };
          });
          merged.foursomeBackers = fb;
          // Keep the static pairings present (backers always empty here — the map owns them).
          merged.foursomeMatches = DEFAULT_FOURSOME_MATCHES.map(function(def) {
            return Object.assign({}, def, { backersA: [], backersB: [] });
          });
        })();
        merged.players.forEach(function(p) {
          if (!merged.scores[p.id]) {
            merged.scores[p.id] = {};
            COURSES.forEach(function(_, i) { merged.scores[p.id][i] = Array(18).fill(null); });
          }
        });
        // Device-local UI state must never come from the synced doc. An older
        // build once persisted these into Firestore; with merge:true they linger
        // and would otherwise override the local tab/round on every snapshot —
        // e.g. forcing the app onto the Chat tab after a refresh.
        delete merged.activeTab;
        delete merged.selectedRound;
        delete merged.addingGame;
        delete merged.initialized;
        setState(function(prev) {
          var nextState = Object.assign({}, prev, merged, { initialized: true });
          // Don't let an incoming snapshot (e.g. another phone entering a score) clobber
          // a field that still has an unsaved local edit in flight. Without this, an
          // in-progress skins/props/H2H selection reverts mid-edit — and because the
          // next tap then reads the reverted list and the debounced save coalesces to
          // it, rapidly-made picks get dropped ("selection won't save"). Any field
          // sitting in pendingSave keeps its local value until our own save flushes it.
          Object.keys(pendingSave.current).forEach(function(f) {
            if (Object.prototype.hasOwnProperty.call(prev, f)) nextState[f] = prev[f];
          });
          return nextState;
        });
      } else if (!hasLoadedData.current) {
        // First time only — seed Firestore with defaults.
        // Guarded so a transient offline/null callback can never wipe live data.
        var fresh = defaultState();
        firebaseSave({
          players: fresh.players,
          scores: fresh.scores,
          games: fresh.games,
          bets: fresh.bets,
          individualProps: fresh.individualProps,
          h2hBets: fresh.h2hBets,
          teamMatches: fresh.teamMatches,
          foursomeMatches: fresh.foursomeMatches,
          drinks: fresh.drinks,
          expenses: fresh.expenses,
          selectedTees: fresh.selectedTees,
          skinsEligible: fresh.skinsEligible,
          courseOverrides: fresh.courseOverrides,
        });
        setState(function(prev) { return Object.assign({}, prev, { initialized:true }); });
      }
      setLoading(false);
    });
    return function() { unsub(); };
  }, [setLoading, setState]);

  // Lightweight chat subscription at the app level — stores messages so we can
  // show an unread badge AND surface toasts/notifications for new arrivals.
  useEffect(function() {
    var unsub = subscribeToChat(function(msgs) {
      if (!msgs) return;
      // On the FIRST real delivery, mark every existing message as already seen so
      // the whole history doesn't fire toasts on load/refresh. This MUST happen here
      // (where the messages actually exist) — doing it in the notif effect below ran
      // on mount before any messages had arrived, so it seeded nothing and then the
      // entire history was treated as "new" and stacked up at the top of the screen.
      if (!chatInit.current) {
        msgs.forEach(function(m) { if (m && m.id) seenChatIds.current[m.id] = true; });
        chatInit.current = true;
      }
      setChatMsgs(msgs);
      var newest = 0;
      msgs.forEach(function(m) {
        if (m && m.ts) { var t = new Date(m.ts).getTime(); if (t > newest) newest = t; }
      });
      if (newest) setLatestChatTs(newest);
    });
    return function() { unsub(); };
  }, [setChatMsgs, setLatestChatTs]);

  // Surface a toast (and a native notification if backgrounded) for genuinely new
  // chat messages from other people. Seeds the "seen" set on first load so the
  // whole history doesn't fire at once.
  function pushNotifs(items) {
    if (!items.length) return;
    setToasts(function(cur) {
      return cur.concat(items.map(function(it) { return Object.assign({}, it, { id: Math.random().toString(36).slice(2) }); })).slice(-3);
    });
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState === "hidden") {
      items.forEach(function(it) { try { new Notification(it.title, { body: it.body }); } catch (e) {} });
    }
  }
  useEffect(function() {
    // Seeding now happens on the first subscription delivery (above). Until that
    // has run, there's nothing meaningful to compare against.
    if (!chatInit.current) return;
    var fresh = chatMsgs.filter(function(m) { return m && m.id && !seenChatIds.current[m.id]; });
    fresh.forEach(function(m) { seenChatIds.current[m.id] = true; });
    if (state.activeTab !== "chat") {
      var fromOthers = fresh.filter(function(m) { return m.playerId !== auth.playerId; });
      pushNotifs(fromOthers.map(function(m) {
        return { icon: "💬", title: ((m.emoji || "") + " " + (m.playerName || "")).trim() || "New message", body: m.text, tab: "chat" };
      }));
    }
    // auth.playerId is fixed per session and pushNotifs is recreated each render;
    // both are intentionally excluded so this only fires on new messages / tab changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMsgs, state.activeTab]);

  // Auto-dismiss toasts after a few seconds.
  useEffect(function() {
    if (!toasts.length) return;
    var timers = toasts.map(function(t) { return setTimeout(function() { setToasts(function(cur) { return cur.filter(function(x) { return x.id !== t.id; }); }); }, 4500); });
    return function() { timers.forEach(clearTimeout); };
  }, [toasts, setToasts]);

  // When the user opens the Chat tab, mark everything as seen.
  useEffect(function() {
    if (state.activeTab === "chat" && latestChatTs > 0) {
      setChatSeenTs(latestChatTs);
      try { localStorage.setItem("ni-links-chat-seen", String(latestChatTs)); } catch(e) {}
    }
  }, [state.activeTab, latestChatTs, setChatSeenTs]);

  var hasUnreadChat = latestChatTs > chatSeenTs;

  function handlePinSuccess() {
    var next = { authed:true, playerId:null, loaded:true, guest:false };
    setAuth(next);
    saveAuth(next);
  }

  function handleGuest() {
    var next = { authed:true, playerId:"guest", loaded:true, guest:true };
    setAuth(next);
    saveAuth(next);
  }

  function handlePlayerSelect(pid) {
    var next = { authed:true, playerId:pid, loaded:true, guest:false };
    setAuth(next);
    saveAuth(next);
  }

  function handleLogout() {
    var next = { authed:false, playerId:null, loaded:true, guest:false };
    setAuth(next);
    saveAuth(next);
  }

  // Track guest status in a ref so the update callback can read it without
  // re-reading localStorage on every keystroke or re-creating the callback.
  var guestRef = useRef(false);
  guestRef.current = auth.guest === true;
  // Track whether the current player may edit the books (Bets & Expenses).
  var canEditBooksRef = useRef(false);
  canEditBooksRef.current = auth.guest !== true && BOOKKEEPER_IDS.indexOf(auth.playerId) >= 0;

  // Debounced save to Firebase
  var saveTimer = useRef(null);
  // Accumulates ONLY the fields that changed since the last flush, so the debounced
  // save writes a minimal payload instead of the whole state (clobber prevention).
  var pendingSave = useRef({});
  var update = useCallback(function(changes) {
    // Master guard: guests can never write synced data to Firebase.
    var isGuestWrite = guestRef.current;
    // Book guard: any signed-in player may now create, join, and settle BETS of
    // every kind (games, team/individual/prop/H2H bets, skins eligibility, and
    // the foursome Stableford matches). Only the gatekeepers (Brian & Carl) may
    // still write expenses, the pub-drink tally, and course par/SI overrides.
    // Guests can write nothing.
    if (!canEditBooksRef.current && !isGuestWrite) {
      var bookFields = ["drinks", "expenses", "courseOverrides"];
      var stripped = false;
      bookFields.forEach(function(f) {
        if (Object.prototype.hasOwnProperty.call(changes, f)) { delete changes[f]; stripped = true; }
      });
      if (stripped && Object.keys(changes).length === 0) return; // nothing left to apply
    } else if (!canEditBooksRef.current) {
      // Guests: strip everything
      var bookFields2 = ["games", "bets", "individualProps", "overUnderProps", "h2hBets", "teamMatches", "foursomeMatches", "drinks", "expenses", "customBets", "skinsEligible", "courseOverrides"];
      var stripped2 = false;
      bookFields2.forEach(function(f) {
        if (Object.prototype.hasOwnProperty.call(changes, f)) { delete changes[f]; stripped2 = true; }
      });
      if (stripped2 && Object.keys(changes).length === 0) return;
    }
    setState(function(prev) {
      var applied = changes;
      var next = Object.assign({}, prev, applied);
      // Save to Firebase — ONLY the fields that actually changed (accumulated across
      // the debounce window), never the whole state. With merge:true, any field we
      // omit is left untouched in Firestore, so one phone's edit to bets/expenses/
      // drinks/etc. can no longer overwrite another phone's H2H Jump In, skins opt-in,
      // prop opt-in, or any other shared list it didn't touch. This is the general fix
      // for the same clobber class the foursome backers hit. (Scores go through
      // saveScorePath; foursome backers through atomic map writes — both excluded here.)
      if (!isGuestWrite) {
        var SYNCED_FIELDS = ["players", "games", "bets", "individualProps", "overUnderProps", "h2hBets", "teamMatches", "foursomeMatches", "drinks", "expenses", "selectedTees", "skinsEligible", "courseOverrides", "manualWinners"];
        var changedToSave = SYNCED_FIELDS.filter(function(f) { return Object.prototype.hasOwnProperty.call(changes, f); });
        if (changedToSave.length) {
          changedToSave.forEach(function(f) { pendingSave.current[f] = next[f]; });
          clearTimeout(saveTimer.current);
          setSaveStatus("saving");
          saveTimer.current = setTimeout(function() {
            var payload = pendingSave.current;
            pendingSave.current = {};
            firebaseSave(payload).then(function() {
              setSaveStatus("saved");
              setTimeout(function() { setSaveStatus("idle"); }, 1500);
            }).catch(function() {
              setSaveStatus("error");
              // Re-queue failed fields (unless a newer change already superseded them)
              // so a hard error retries on the next flush instead of silently vanishing.
              Object.keys(payload).forEach(function(f) {
                if (!Object.prototype.hasOwnProperty.call(pendingSave.current, f)) pendingSave.current[f] = payload[f];
              });
            });
          }, 500);
        }
      }
      return next;
    });
  }, [setSaveStatus, setState]);

  // Optimistic, LOCAL-ONLY updates to the foursome backers map for an instant UI
  // response. These never touch the full-document save — the durable write is the
  // atomic saveFoursomeBack/saveFoursomeUnback call in the component. Reading from
  // `prev` (not a render-time snapshot) keeps rapid taps from racing each other.
  var backFoursomeLocal = useCallback(function(matchId, pid, side) {
    setState(function(prev) {
      var fb = Object.assign({}, prev.foursomeBackers || {});
      var cur = fb[matchId] || { a: [], b: [] };
      var a = (Array.isArray(cur.a) ? cur.a : []).filter(function(id) { return id !== pid; });
      var b = (Array.isArray(cur.b) ? cur.b : []).filter(function(id) { return id !== pid; });
      if (side === "a") a.push(pid); else b.push(pid);
      fb[matchId] = { a: a, b: b };
      return Object.assign({}, prev, { foursomeBackers: fb });
    });
  }, [setState]);
  var unbackFoursomeLocal = useCallback(function(matchId, pid) {
    setState(function(prev) {
      var fb = Object.assign({}, prev.foursomeBackers || {});
      var cur = fb[matchId] || { a: [], b: [] };
      fb[matchId] = {
        a: (Array.isArray(cur.a) ? cur.a : []).filter(function(id) { return id !== pid; }),
        b: (Array.isArray(cur.b) ? cur.b : []).filter(function(id) { return id !== pid; }),
      };
      return Object.assign({}, prev, { foursomeBackers: fb });
    });
  }, [setState]);
  // Prop unit counts use the same clobber-proof approach as the backers: optimistic local
  // update to the propUnits map (and mirrored onto the prop's `units`/`eligible` for instant
  // display), with the durable atomic field-path write done by savePropUnits in the
  // component. Never routes through the full-document save, so a concurrent save from
  // another phone can no longer blank or change anyone's units.
  var setPropUnitsLocal = useCallback(function(propId, pid, count) {
    setState(function(prev) {
      var pu = Object.assign({}, prev.propUnits || {});
      var m = Object.assign({}, pu[propId] || {});
      if (count > 0) m[pid] = count; else delete m[pid];
      pu[propId] = m;
      var nip = (prev.individualProps || []).map(function(x) {
        if (x.id !== propId) return x;
        var u = {}; Object.keys(m).forEach(function(k) { if (m[k] > 0) u[k] = m[k]; });
        return Object.assign({}, x, { units: u, eligible: Object.keys(u) });
      });
      return Object.assign({}, prev, { propUnits: pu, individualProps: nip });
    });
  }, [setState]);
  // Over/Under: optimistic local update to the ouUnits + ouTimes maps (mirrored onto the
  // prop's overUnits/underUnits/overTimes/underTimes for instant display); the durable,
  // clobber-proof per-field write is done by saveOuUnits in the component. A player sits on
  // one side only. `ts` is the entry timestamp the component computed (preserved on +/-).
  var setOuUnitsLocal = useCallback(function(propId, pid, side, count, ts) {
    setState(function(prev) {
      var ou = Object.assign({}, prev.ouUnits || {});
      var tm = Object.assign({}, prev.ouTimes || {});
      var entry = ou[propId] || {}, tEntry = tm[propId] || {};
      var over = Object.assign({}, entry.over || {}), under = Object.assign({}, entry.under || {});
      var overT = Object.assign({}, tEntry.over || {}), underT = Object.assign({}, tEntry.under || {});
      delete over[pid]; delete under[pid]; delete overT[pid]; delete underT[pid]; // leave both, then re-add to chosen side
      if (count > 0) { (side === "over" ? over : under)[pid] = count; (side === "over" ? overT : underT)[pid] = ts; }
      ou[propId] = { over: over, under: under };
      tm[propId] = { over: overT, under: underT };
      var noup = (prev.overUnderProps || []).map(function(x) {
        return x.id === propId ? Object.assign({}, x, { overUnits: over, underUnits: under, overTimes: overT, underTimes: underT }) : x;
      });
      return Object.assign({}, prev, { ouUnits: ou, ouTimes: tm, overUnderProps: noup });
    });
  }, [setState]);

  // then writes ONLY this player's/round's hole array to Firestore (field-path
  // write) instead of the whole scores map — see saveScorePath in firebase.js.
  // Debounced per player+round so rapid hole entry doesn't hammer the network.
  var scoreSaveTimers = useRef({});
  var saveScore = useCallback(function(pid, ri, holeArr) {
    if (guestRef.current) return; // guests never write
    // 1) Local state — merge just this player's round, leaving everyone else intact.
    setState(function(prev) {
      var nextScores = Object.assign({}, prev.scores);
      nextScores[pid] = Object.assign({}, nextScores[pid]);
      nextScores[pid][ri] = holeArr;
      return Object.assign({}, prev, { scores: nextScores });
    });
    // 2) Remote write — debounced per (player, round) so concurrent scorers for
    //    different players never overwrite one another.
    var key = pid + "_" + ri;
    setSaveStatus("saving");
    clearTimeout(scoreSaveTimers.current[key]);
    scoreSaveTimers.current[key] = setTimeout(function() {
      saveScorePath(pid, ri, holeArr).then(function() {
        setSaveStatus("saved");
        setTimeout(function() { setSaveStatus("idle"); }, 1500);
      }).catch(function() {
        setSaveStatus("error");
      });
    }, 500);
  }, [setSaveStatus, setState]);

  var resetAll = function() {
    if (!confirm("Reset all scores, bets, and drinks? This cannot be undone.")) return;
    var fresh = defaultState();
    setState(function(prev) { return Object.assign({}, prev, fresh); });
    firebaseSave({
      players: fresh.players,
      scores: fresh.scores,
      games: fresh.games,
      bets: fresh.bets,
      individualProps: fresh.individualProps,
      h2hBets: fresh.h2hBets,
      teamMatches: fresh.teamMatches,
      foursomeMatches: fresh.foursomeMatches,
      drinks: fresh.drinks,
      expenses: fresh.expenses,
      selectedTees: fresh.selectedTees,
      skinsEligible: fresh.skinsEligible,
      courseOverrides: fresh.courseOverrides,
    });
  };

  // Derived values + hooks must come BEFORE any early return so hooks always
  // run in the same order on every render (React rules of hooks).
  var p = state, players = p.players, scores = p.scores, games = p.games, bets = p.bets;
  var customBets = p.customBets, drinks = p.drinks, activeTab = p.activeTab;
  var selectedRound = p.selectedRound, addingGame = p.addingGame;
  // Keep live COURSES (par/SI) in sync with any gatekeeper overrides before scoring runs.
  applyCourseOverrides(state.courseOverrides);
  // state.courseOverrides is listed on purpose: getLeaderboard reads the COURSES
  // objects that applyCourseOverrides mutates, so the leaderboard must recompute
  // when overrides change even though it isn't referenced by name.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  var lb = useMemo(function() { return getLeaderboard(players, scores); }, [players, scores, state.courseOverrides]);
  var rs = useCallback(function(pid, ri) { return getRoundScore(scores, pid, ri); }, [scores]);

  // ── Pull-to-refresh ──────────────────────────────────────────────────
  var pullRef = useRef({ startY: 0, pulling: false, dist: 0 });
  var pts = useState(0); var pullDist = pts[0], setPullDist = pts[1];
  var prs = useState(false); var refreshing = prs[0], setRefreshing = prs[1];
  var PULL_THRESHOLD = 80;

  useEffect(function() {
    function handleStart(e) {
      if (refreshing) return;
      // Only activate when scrolled to the very top of the page
      if (window.scrollY > 0 || document.documentElement.scrollTop > 0) return;
      pullRef.current.startY = e.touches[0].clientY;
      pullRef.current.pulling = true;
      pullRef.current.dist = 0;
    }
    function handleMove(e) {
      if (!pullRef.current.pulling || refreshing) return;
      if (window.scrollY > 0 || document.documentElement.scrollTop > 0) {
        pullRef.current.pulling = false; setPullDist(0); return;
      }
      var dy = Math.max(0, e.touches[0].clientY - pullRef.current.startY);
      var dampened = Math.min(dy * 0.5, 120);
      if (dampened > 5) { e.preventDefault(); }
      pullRef.current.dist = dampened;
      setPullDist(dampened);
    }
    function handleEnd() {
      if (!pullRef.current.pulling || refreshing) return;
      pullRef.current.pulling = false;
      if (pullRef.current.dist >= PULL_THRESHOLD) {
        setRefreshing(true);
        setPullDist(PULL_THRESHOLD);
        setTimeout(function() { window.location.reload(); }, 400);
      } else {
        setPullDist(0);
      }
    }
    document.addEventListener("touchstart", handleStart, { passive: true });
    document.addEventListener("touchmove", handleMove, { passive: false });
    document.addEventListener("touchend", handleEnd, { passive: true });
    return function() {
      document.removeEventListener("touchstart", handleStart);
      document.removeEventListener("touchmove", handleMove);
      document.removeEventListener("touchend", handleEnd);
    };
  });

  if (loading || !auth.loaded) return (
    <div style={S.loading}>
      <img src="/logo.png" alt="Northern Irish Links 2026" onError={function(e){e.target.style.display="none";}} style={{width:120, height:120}} />
      <div style={{color:CL.muted, fontFamily:"system-ui", marginTop:12}}>Loading...</div>
    </div>
  );

  if (!auth.authed) return (<PinScreen onSuccess={handlePinSuccess} onGuest={handleGuest} />);
  if (!auth.playerId && !auth.guest) return (<PlayerSelectScreen players={state.players} onSelect={handlePlayerSelect} />);

  var isGuest = auth.guest === true;
  var currentPlayer = isGuest ? null : state.players.find(function(p) { return p.id === auth.playerId; });
  // Only the bookkeepers (Brian, Carl) may edit Bets & Expenses. Everyone else views them read-only.
  var canEditBooks = !isGuest && BOOKKEEPER_IDS.indexOf(auth.playerId) >= 0;
  var booksReadOnly = !canEditBooks;
  // Any signed-in player can now manage bets (expenses stay gatekeeper-only).
  var canEditBets = !isGuest && auth.playerId === OWNER_ID;

  var TABS = [
    { id:"home", icon:"🏠", label:"Home" },
    { id:"itinerary", icon:"📋", label:"Trip" },
    { id:"scores", icon:"📝", label:"Scores" },
    { id:"leaderboard", icon:"🏆", label:"Board" },
    { id:"bets", icon:"💰", label:"Bets" },
    { id:"expenses", icon:"💳", label:"Spend" },
    { id:"chat", icon:"💬", label:"Chat" },
  ];

  return (
    <div style={S.app}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 16px", background:CL.card, borderBottom:"1px solid "+CL.border}}>
        <div style={{display:"flex", alignItems:"center", gap:8}}>
          <span style={{fontSize:16}}>{currentPlayer ? currentPlayer.emoji : "👁️"}</span>
          <span style={{fontSize:12, color:"#fff", fontFamily:"system-ui", fontWeight:600}}>{currentPlayer ? currentPlayer.name : "Guest"}</span>
          {isGuest && <span style={{fontSize:10, color:CL.muted, fontFamily:"system-ui", background:"rgba(111,172,255,0.15)", padding:"2px 8px", borderRadius:10}}>view only</span>}
          {!online && <span style={{fontSize:10, color:"#f59e0b", fontFamily:"system-ui", background:"rgba(245,158,11,0.15)", padding:"2px 8px", borderRadius:10}}>⚡ offline — saved locally</span>}
          {!isGuest && online && saveStatus === "saving" && <span style={{fontSize:10, color:CL.muted, fontFamily:"system-ui"}}>● saving…</span>}
          {!isGuest && online && saveStatus === "saved" && <span style={{fontSize:10, color:"#22c55e", fontFamily:"system-ui"}}>✓ saved</span>}
          {!isGuest && online && saveStatus === "error" && <span style={{fontSize:10, color:CL.red, fontFamily:"system-ui"}}>⚠ not saved</span>}
        </div>
        <div style={{display:"flex", alignItems:"center", gap:8}}>
          {!isGuest && notifPerm === "default" && (
            <button onClick={function() { if (typeof Notification !== "undefined") Notification.requestPermission().then(setNotifPerm); }} title="Turn on alerts for new chat messages" style={{fontSize:13, background:"none", border:"1px solid "+CL.border, borderRadius:4, padding:"3px 8px", cursor:"pointer"}}>🔔</button>
          )}
          <button onClick={handleLogout} style={{fontSize:10, color:CL.muted, fontFamily:"system-ui", background:"none", border:"1px solid "+CL.border, borderRadius:4, padding:"4px 8px", cursor:"pointer"}}>{isGuest ? "Sign In" : "Switch"}</button>
        </div>
      </div>

      {/* Toast stack for new chat messages */}
      {toasts.length > 0 && (
        <div style={{position:"fixed", top:54, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, zIndex:200, display:"flex", flexDirection:"column", gap:8, padding:"0 12px", boxSizing:"border-box", pointerEvents:"none"}}>
          {toasts.map(function(t) {
            return (
              <button key={t.id} onClick={function() { setState(function(prev) { return Object.assign({}, prev, { activeTab:t.tab }); }); setToasts(function(cur) { return cur.filter(function(x) { return x.id !== t.id; }); }); }} style={{pointerEvents:"auto", textAlign:"left", display:"flex", gap:10, alignItems:"center", background:CL.card, color:"#fff", border:"1px solid "+CL.border, borderLeft:"3px solid "+CL.red, borderRadius:10, padding:"10px 14px", boxShadow:"0 8px 24px rgba(0,0,0,.45)", fontFamily:"system-ui", cursor:"pointer"}}>
                <span style={{fontSize:18, flex:"none"}}>{t.icon}</span>
                <span style={{minWidth:0}}>
                  <span style={{display:"block", fontSize:12, fontWeight:800, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{t.title}</span>
                  <span style={{display:"block", fontSize:12, color:CL.muted, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{t.body}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      <div style={S.content}>
        {/* Pull-to-refresh indicator */}
        {(pullDist > 0 || refreshing) && (
          <div style={{display:"flex", justifyContent:"center", alignItems:"center", height:pullDist, overflow:"hidden", transition:pullRef.current.pulling?"none":"height 0.25s ease-out"}}>
            <div style={{fontSize:12, color:CL.muted, fontFamily:"system-ui", textAlign:"center"}}>
              {refreshing ? "↻ Refreshing…" : pullDist >= PULL_THRESHOLD ? "↑ Release to refresh" : "↓ Pull to refresh"}
            </div>
          </div>
        )}
        {activeTab === "home" && <HomeTab players={players} lb={lb} currentPlayer={currentPlayer} weatherCache={state.weatherCache} update={update} isGuest={isGuest} />}
        {activeTab === "itinerary" && <ItineraryTab weatherCache={state.weatherCache} update={update} isGuest={isGuest} />}
        {activeTab === "scores" && <ScoresTab players={players} scores={scores} sel={selectedRound} hole={scoringHole} setHole={setScoringHole} update={update} saveScore={saveScore} rs={rs} currentPlayer={currentPlayer} isGuest={isGuest} canEditBooks={canEditBooks} selectedTees={state.selectedTees || [0,0,0,0,0]} courseOverrides={state.courseOverrides || {}} />}
        {activeTab === "leaderboard" && <LeaderboardTab players={players} scores={scores} lb={lb} rs={rs} currentPlayer={currentPlayer} />}
        {activeTab === "bets" && (isGuest ? (
          <div style={{padding:"60px 24px", textAlign:"center"}}>
            <div style={{fontSize:48, marginBottom:16}}>🔒</div>
            <div style={{fontSize:18, fontWeight:700, color:"#fff", fontFamily:"system-ui", marginBottom:8}}>Players Only</div>
            <div style={{fontSize:14, color:CL.muted, fontFamily:"system-ui", marginBottom:20}}>Sign in with the group passcode to view bets and games.</div>
            <button onClick={handleLogout} style={Object.assign({}, S.primaryBtn, {width:"auto", padding:"12px 32px"})}>Sign In</button>
          </div>
        ) : <BetsTab players={players} scores={scores} games={games} bets={bets} individualProps={state.individualProps || DEFAULT_INDIVIDUAL_PROPS} overUnderProps={state.overUnderProps || DEFAULT_OU_PROPS} customBets={customBets} h2hBets={state.h2hBets} teamMatches={state.teamMatches || DEFAULT_TEAM_MATCHES} foursomeBackers={state.foursomeBackers || {}} onBack={backFoursomeLocal} onUnback={unbackFoursomeLocal} onSetPropUnits={setPropUnitsLocal} onSetOuUnits={setOuUnitsLocal} expenses={state.expenses || []} drinks={drinks} addingGame={addingGame} update={update} resetAll={resetAll} isGuest={isGuest} canEdit={canEditBets} skinsEligible={state.skinsEligible || {gross:[], net:[], course:[[],[],[],[],[]]}} manualWinners={state.manualWinners || {team:null, foursome:{}}} />)}
        {activeTab === "expenses" && (isGuest ? (
          <div style={{padding:"60px 24px", textAlign:"center"}}>
            <div style={{fontSize:48, marginBottom:16}}>🔒</div>
            <div style={{fontSize:18, fontWeight:700, color:"#fff", fontFamily:"system-ui", marginBottom:8}}>Players Only</div>
            <div style={{fontSize:14, color:CL.muted, fontFamily:"system-ui", marginBottom:20}}>Sign in with the group passcode to view and track expenses.</div>
            <button onClick={handleLogout} style={Object.assign({}, S.primaryBtn, {width:"auto", padding:"12px 32px"})}>Sign In</button>
          </div>
        ) : <ExpensesTab players={players} expenses={state.expenses || []} update={update} isGuest={booksReadOnly} canEdit={canEditBooks} />)}
        {activeTab === "chat" && <ChatTab currentPlayer={currentPlayer} players={players} isGuest={isGuest} />}
      </div>
      <nav style={S.nav}>
        {TABS.map(function(t) {
          var active = activeTab === t.id;
          var showDot = t.id === "chat" && hasUnreadChat && !active;
          return (
            <button key={t.id} onClick={function() { setState(function(prev) { return Object.assign({}, prev, { activeTab:t.id }); }); }} style={S.navBtn}>
              <span style={{fontSize:18, position:"relative"}}>
                {t.icon}
                {showDot && <span style={{position:"absolute", top:-2, right:-6, width:9, height:9, borderRadius:5, background:CL.red, border:"1.5px solid "+CL.card}} />}
              </span>
              <span style={Object.assign({}, S.navLabel, active ? {color:CL.red} : {})}>{t.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

// ─── HOME ────────────────────────────────────────────────────────────
function FxCard() {
  var rs = useState(null); var rate = rs[0], setRate = rs[1];
  var es = useState(false); var err = es[0], setErr = es[1];

  useEffect(function() {
    var cancelled = false;
    function load() {
      // Primary: Frankfurter (free, no key, CORS-enabled).
      fetch("https://api.frankfurter.app/latest?from=GBP&to=USD")
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (cancelled) return;
          if (data && data.rates && data.rates.USD) {
            setRate({ value: data.rates.USD, date: data.date });
            setErr(false);
          } else {
            throw new Error("bad data");
          }
        })
        .catch(function() {
          // Fallback: open.er-api.com (also free, no key).
          if (cancelled) return;
          fetch("https://open.er-api.com/v6/latest/GBP")
            .then(function(r) { return r.json(); })
            .then(function(data) {
              if (cancelled) return;
              if (data && data.rates && data.rates.USD) {
                var d = data.time_last_update_utc ? new Date(data.time_last_update_utc).toISOString().slice(0,10) : "";
                setRate({ value: data.rates.USD, date: d });
                setErr(false);
              } else {
                setErr(true);
              }
            })
            .catch(function() { if (!cancelled) setErr(true); });
        });
    }
    load();
    // Refresh hourly while the app is open
    var iv = setInterval(load, 3600000);
    return function() { cancelled = true; clearInterval(iv); };
  }, [setErr, setRate]);

  return (
    <div style={Object.assign({}, S.card, {display:"flex", justifyContent:"space-between", alignItems:"center"})}>
      <div style={{display:"flex", alignItems:"center", gap:8}}>
        <span style={{fontSize:20}}>💷</span>
        <div>
          <div style={{fontSize:13, fontWeight:700, color:"#fff", fontFamily:"system-ui"}}>British Pound → US Dollar</div>
          <div style={{fontSize:11, color:CL.muted, fontFamily:"system-ui"}}>{rate ? "Updated "+rate.date : err ? "Rate unavailable" : "Loading…"}</div>
        </div>
      </div>
      <div style={{textAlign:"right"}}>
        {rate ? (
          <div>
            <div style={{fontSize:20, fontWeight:700, color:"#22c55e", fontFamily:"system-ui"}}>{"$"+rate.value.toFixed(4)}</div>
            <div style={{fontSize:10, color:CL.muted, fontFamily:"system-ui"}}>per £1</div>
          </div>
        ) : (
          <div style={{fontSize:14, color:CL.muted, fontFamily:"system-ui"}}>{err ? "—" : "…"}</div>
        )}
      </div>
    </div>
  );
}

function HomeTab(props) {
  var players = props.players, lb = props.lb;
  var ts = useState(getCountdown()); var time = ts[0], setTime = ts[1];

  useEffect(function() {
    var iv = setInterval(function() { setTime(getCountdown()); }, 1000);
    return function() { clearInterval(iv); };
  }, [setTime]);

  return (
    <div>
      <div style={S.hero}>
        <img src="/logo.png" alt="Northern Irish Links 2026" onError={function(e){e.target.style.display="none";}} style={{width:140, height:140, marginBottom:12}} />
        <div style={{fontSize:11, letterSpacing:6, color:CL.red, fontFamily:"system-ui", fontWeight:600}}>THE</div>
        <div style={{fontSize:30, fontWeight:700, color:"#fff", letterSpacing:3, lineHeight:1.1}}>NORTHERN IRISH</div>
        <div style={{fontSize:30, fontWeight:700, color:"#fff", letterSpacing:3, lineHeight:1.1}}>LINKS</div>
        <div style={{display:"flex", justifyContent:"center", gap:6, marginTop:8}}>
          {[CL.red, "#fff", CL.blue].map(function(c,i) { return <div key={i} style={{width:24, height:4, borderRadius:2, background:c}} />; })}
        </div>
        <div style={{fontSize:12, letterSpacing:4, color:"#fff", fontFamily:"system-ui", fontWeight:500, marginTop:8}}>JUNE 26 – JULY 3, 2026</div>
        <div style={Object.assign({}, S.label, {marginTop:6})}>6 Nights · 5 Rounds · 8 Golfers</div>
        <div style={Object.assign({}, S.label, {marginTop:2, fontSize:10})}>PerryGolf · VIP Coach · JetBlue</div>
      </div>

      {!time.past && <FxCard />}

      <div style={S.card}>
        <div style={S.cardTitle}>{time.past ? "🏌️ Trip Underway" : "⏱ Countdown"}</div>
        {time.past ? (
          <div style={{textAlign:"center", fontSize:16, fontWeight:700, color:"#fff", fontFamily:"system-ui"}}>Game on!</div>
        ) : (
          <div style={{display:"flex", justifyContent:"center", gap:8}}>
            {[{v:time.d,l:"DAYS"},{v:time.h,l:"HRS"},{v:time.m,l:"MIN"},{v:time.s,l:"SEC"}].map(function(u) {
              return (
                <div key={u.l} style={{textAlign:"center", minWidth:56}}>
                  <div style={{fontSize:28, fontWeight:700, color:"#fff", fontFamily:"system-ui", lineHeight:1, background:"rgba(220,38,38,0.12)", borderRadius:8, padding:"10px 6px", border:"1px solid rgba(220,38,38,0.25)"}}>{u.v < 10 ? "0"+u.v : u.v}</div>
                  <div style={{fontSize:9, color:CL.muted, fontFamily:"system-ui", fontWeight:700, marginTop:4, letterSpacing:1}}>{u.l}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={S.card}>
        <div style={S.cardTitle}>The Courses</div>
        {COURSES.map(function(c, i) {
          var it = ITINERARY.find(function(d) { return d.courseIdx === i; });
          return (
            <div key={i} style={Object.assign({}, S.row, i < COURSES.length-1 ? S.separator : {})}>
              <div style={{width:50, flexShrink:0}}>
                <div style={{fontSize:11, color:CL.red, fontFamily:"system-ui", fontWeight:700}}>{"R"+(i+1)}</div>
                <div style={{fontSize:10, color:CL.muted, fontFamily:"system-ui"}}>{it ? it.date.split(", ")[0] : ""}</div>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:14, color:"#fff", fontWeight:600}}>{c.name}</div>
                <div style={S.label}>{c.location+" · Par "+c.par}</div>
                {it && it.teeTime && <div style={{fontSize:11, color:CL.red, fontFamily:"system-ui", marginTop:2}}>{"Tee: "+it.teeTime}</div>}
                <div style={{display:"flex", gap:10, marginTop:4}}>
                  {c.url && <a href={c.url} target="_blank" rel="noopener" style={{fontSize:10, color:CL.blue, fontFamily:"system-ui", textDecoration:"none"}} onClick={function(e) { e.stopPropagation(); }}>Website ›</a>}
                  {c.scorecard && c.scorecard !== c.url && <a href={c.scorecard} target="_blank" rel="noopener" style={{fontSize:10, color:CL.blue, fontFamily:"system-ui", textDecoration:"none"}} onClick={function(e) { e.stopPropagation(); }}>Scorecard ›</a>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <TodayWeatherCard />

      {lb.length > 0 && (
        <div style={S.card}>
          <div style={S.cardTitle}>Current Leader</div>
          <div style={{display:"flex", alignItems:"center", gap:12, padding:12, background:"rgba(220,38,38,0.1)", borderRadius:6, border:"1px solid rgba(220,38,38,0.3)"}}>
            <span style={{fontSize:24}}>{lb[0].emoji}</span>
            <span style={{flex:1, fontSize:18, fontWeight:700, color:"#fff"}}>{lb[0].name}</span>
            <span style={{fontSize:24, fontWeight:700, color:CL.red}}>{lb[0].total}</span>
          </div>
        </div>
      )}

      <div style={S.card}>
        <div style={S.cardTitle}>The Squad</div>
        {(function() {
          var matchup = TEAM_MATCHUPS[0];
          var teams = [matchup.teamA, matchup.teamB];
          return teams.map(function(team) {
            var teamPlayers = team.names.map(function(name) {
              return players.find(function(p) { return p.name === name; });
            }).filter(Boolean);
            var totalHcp = teamPlayers.reduce(function(t, p) { return t + (parseFloat(p.handicap) || 0); }, 0);
            return (
              <div key={team.name} style={{marginBottom:12}}>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6}}>
                  <div style={{fontSize:14, fontWeight:700, color:"#fff"}}>{team.emoji+" "+team.name}</div>
                  <div style={{fontSize:11, color:CL.red, fontFamily:"system-ui", fontWeight:600}}>{"Total HI: "+totalHcp.toFixed(1)}</div>
                </div>
                <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:6}}>
                  {teamPlayers.map(function(p) {
                    return (
                      <div key={p.id} style={{background:"rgba(30,58,95,0.3)", borderRadius:6, padding:"10px 12px", display:"flex", alignItems:"center", gap:8}}>
                        <span style={{fontSize:18}}>{p.emoji}</span>
                        <div>
                          <div style={{fontSize:16, fontWeight:600, color:"#fff"}}>{p.name}</div>
                          <div style={{fontSize:11, color:CL.blue, fontFamily:"system-ui", fontWeight:600}}>{"HI "+p.handicap}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          });
        })()}
      </div>

      <div style={S.card}>
        <div style={S.cardTitle}>Hotels</div>
        {HOTELS.map(function(h, i) {
          return (
            <div key={i} style={Object.assign({padding:"10px 0"}, i < HOTELS.length-1 ? S.separator : {})}>
              <div style={{fontSize:16, fontWeight:600, color:"#fff"}}>{h.name}</div>
              <div style={S.label}>{h.loc+" · "+h.nights+" ("+h.n+" nights)"}</div>
            </div>
          );
        })}
      </div>

      <WeatherCard weatherCache={props.weatherCache} update={props.update} />

      <div style={{textAlign:"center", padding:"16px 0 8px", fontSize:11, color:CL.muted, fontFamily:"system-ui"}}>
        Northern Irish Links · v{APP_VERSION}
      </div>
    </div>
  );
}

// ─── TRIP / ITINERARY ────────────────────────────────────────────────
function TripMap() {
  var ss = useState(null); var sel = ss[0], setSel = ss[1];
  var W = 360, H = 440, P = 20, iW = W-P*2, iH = H-P*2;

  function cp(s) { var p = proj(s.lat, s.lng, iW, iH); return { x:p.x+P, y:p.y+P }; }

  // Label offsets to prevent collisions
  var labelOffsets = { dublin:{dx:0,dy:-14}, ardglass:{dx:28,dy:4}, slieve:{dx:-32,dy:8}, rcd:{dx:-34,dy:-6}, castlerock:{dx:-36,dy:8}, bushmills:{dx:28,dy:-6}, portrush:{dx:0,dy:-14}, portstewart:{dx:-38,dy:4}, conrad:{dx:28,dy:4} };

  var coastD = COAST.map(function(c,i) { var p = proj(c[0],c[1],iW,iH); return (i===0?"M":"L")+(p.x+P)+","+(p.y+P); }).join(" ")+"Z";

  // Build smooth route path using quadratic curves
  var routeStops = ROUTE.map(function(id) { return MAP_STOPS.find(function(s) { return s.id===id; }); }).filter(Boolean);
  var routeD = "";
  routeStops.forEach(function(s, i) {
    var p = cp(s);
    if (i === 0) { routeD += "M"+p.x+","+p.y; }
    else {
      var prev = cp(routeStops[i-1]);
      var mx = (prev.x + p.x) / 2, my = (prev.y + p.y) / 2;
      routeD += " Q"+prev.x+","+my+" "+mx+","+my;
      routeD += " Q"+p.x+","+my+" "+p.x+","+p.y;
    }
  });

  var selectedStop = sel ? MAP_STOPS.find(function(s) { return s.id===sel; }) : null;
  var selectedLeg = sel ? ROUTE_LEGS.filter(function(l) { return l.from===sel || l.to===sel; }) : [];

  return (
    <div style={{margin:"12px 16px"}}>
      <div style={{borderRadius:12, overflow:"hidden", border:"1px solid "+CL.border, background:"#0a1322"}}>
        <svg width={W} height={H} viewBox={"0 0 "+W+" "+H} style={{display:"block", width:"100%", height:"auto"}}>
          <defs>
            <radialGradient id="seaRG" cx="50%" cy="35%"><stop offset="0%" stopColor="#0e1c36"/><stop offset="100%" stopColor="#070e1d"/></radialGradient>
            <linearGradient id="landLG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#16284a"/><stop offset="100%" stopColor="#101f3a"/></linearGradient>
          </defs>
          <rect width={W} height={H} fill="url(#seaRG)"/>

          {/* Subtle grid */}
          {Array.from({length:9}, function(_,i) { return <line key={"h"+i} x1={0} y1={(i+1)*H/9} x2={W} y2={(i+1)*H/9} stroke="#16284a" strokeWidth={0.3} opacity={0.25}/>; })}
          {Array.from({length:9}, function(_,i) { return <line key={"v"+i} x1={(i+1)*W/9} y1={0} x2={(i+1)*W/9} y2={H} stroke="#16284a" strokeWidth={0.3} opacity={0.25}/>; })}

          {/* Land mass */}
          <path d={coastD} fill="url(#landLG)" stroke="#2b4a78" strokeWidth={1.5}/>
          <path d={coastD} fill="none" stroke="#3a5d8a" strokeWidth={0.5} opacity={0.4}/>

          {/* Route line - smooth, gold like PerryGolf */}
          <path d={routeD} fill="none" stroke="#c9a04e" strokeWidth={3.5} opacity={0.35} strokeLinecap="round"/>
          <path d={routeD} fill="none" stroke="#e3c178" strokeWidth={1.8} strokeDasharray="2,5" opacity={0.9} strokeLinecap="round"/>

          {/* Drive time badges (shown when a stop is selected) */}
          {selectedLeg.map(function(leg, i) {
            var f = cp(MAP_STOPS.find(function(s) { return s.id===leg.from; }));
            var t = cp(MAP_STOPS.find(function(s) { return s.id===leg.to; }));
            var mx = (f.x+t.x)/2, my = (f.y+t.y)/2;
            return (
              <g key={"leg"+i}>
                <rect x={mx-20} y={my-9} width={40} height={18} rx={9} fill="#0a1322" stroke="#e3c178" strokeWidth={0.75} opacity={0.97}/>
                <text x={mx} y={my+4} textAnchor="middle" fill="#e3c178" fontSize={8} fontFamily="system-ui" fontWeight={700}>{leg.time}</text>
              </g>
            );
          })}

          {/* Stop markers */}
          {MAP_STOPS.map(function(s) {
            var p = cp(s), isSel = sel===s.id;
            var fill = s.type==="course" ? "#e3c178" : s.type==="hotel" ? CL.blue : "#fff";
            var r = s.type==="course" ? 8 : 6;
            var off = labelOffsets[s.id] || {dx:0, dy:-14};

            return (
              <g key={s.id} onClick={function() { setSel(isSel ? null : s.id); }} style={{cursor:"pointer"}}>
                {/* Selection ring */}
                {isSel && <g><circle cx={p.x} cy={p.y} r={r+8} fill={fill} opacity={0.12}/><circle cx={p.x} cy={p.y} r={r+5} fill="none" stroke={fill} strokeWidth={1} opacity={0.5}/></g>}

                {/* Marker */}
                <circle cx={p.x} cy={p.y} r={r} fill={fill} stroke="#0a1322" strokeWidth={2.5}/>

                {/* Round label inside course markers */}
                {s.type==="course" && <text x={p.x} y={p.y+3} textAnchor="middle" fill="#0a1322" fontSize={8} fontFamily="system-ui" fontWeight={800}>{s.short}</text>}

                {/* Name label with offset */}
                <text x={p.x+off.dx} y={p.y+off.dy} textAnchor={off.dx > 0 ? "start" : off.dx < 0 ? "end" : "middle"} fill={isSel ? "#fff" : "#8aa0c4"} fontSize={isSel ? 10 : 9} fontFamily="system-ui" fontWeight={isSel ? 700 : 500}>{s.label}</text>
              </g>
            );
          })}

          {/* Legend - compact top-left */}
          <g transform="translate(12,12)">
            <rect x={-4} y={-4} width={70} height={40} rx={4} fill="#0a1322" opacity={0.85} stroke={CL.border} strokeWidth={0.5}/>
            <circle cx={6} cy={6} r={3.5} fill="#e3c178"/><text x={14} y={9} fill="#8aa0c4" fontSize={7} fontFamily="system-ui">Course</text>
            <circle cx={6} cy={18} r={3} fill={CL.blue}/><text x={14} y={21} fill="#8aa0c4" fontSize={7} fontFamily="system-ui">Hotel</text>
            <circle cx={6} cy={30} r={3} fill="#fff"/><text x={14} y={33} fill="#8aa0c4" fontSize={7} fontFamily="system-ui">Airport</text>
          </g>
        </svg>
      </div>

      {/* Selected stop detail card */}
      {selectedStop && (
        <div style={{marginTop:8, padding:12, background:CL.card, borderRadius:8, border:"1px solid "+CL.border, display:"flex", alignItems:"center", gap:12}}>
          <div style={{width:36, height:36, borderRadius:18, background:selectedStop.type==="course" ? "rgba(220,38,38,0.15)" : selectedStop.type==="hotel" ? "rgba(37,99,235,0.15)" : "rgba(255,255,255,0.1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0}}>
            {selectedStop.type==="course" ? "⛳" : selectedStop.type==="hotel" ? "🏨" : "✈️"}
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:14, fontWeight:700, color:"#fff", fontFamily:"system-ui"}}>{selectedStop.label}</div>
            {selectedStop.day && <div style={{fontSize:11, color:CL.red, fontFamily:"system-ui"}}>{selectedStop.day}</div>}
            {selectedLeg.length > 0 && (
              <div style={{fontSize:11, color:CL.muted, fontFamily:"system-ui", marginTop:2}}>
                {selectedLeg.map(function(l) {
                  var other = l.from === sel ? MAP_STOPS.find(function(s) { return s.id===l.to; }) : MAP_STOPS.find(function(s) { return s.id===l.from; });
                  var dir = l.from === sel ? "→" : "←";
                  return (other ? other.label : "") + " " + dir + " " + l.time;
                }).join(" · ")}
              </div>
            )}
          </div>
          <button onClick={function() { setSel(null); }} style={{background:"none", border:"none", color:CL.muted, cursor:"pointer", fontSize:16}}>✕</button>
        </div>
      )}

      {/* Route summary pills */}
      {!selectedStop && (
        <div style={{display:"flex", flexWrap:"wrap", gap:4, marginTop:8, justifyContent:"center"}}>
          {ROUTE_LEGS.map(function(l,i) {
            var fn = MAP_STOPS.find(function(s) { return s.id===l.from; });
            var tn = MAP_STOPS.find(function(s) { return s.id===l.to; });
            return (
              <button key={i} onClick={function() { setSel(l.from); }} style={{fontSize:9, color:CL.muted, fontFamily:"system-ui", background:"rgba(30,58,95,0.2)", padding:"4px 8px", borderRadius:10, border:"1px solid "+CL.border, cursor:"pointer"}}>
                {(fn?fn.short:"")+" → "+(tn?tn.short:"")} <span style={{color:CL.red, fontWeight:700}}>{l.time}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Open-Meteo weather code → condition mapping (WMO codes)
function wmoCondition(code) {
  if (code === 0) return "Clear";
  if (code <= 2) return "Partly Cloudy";
  if (code === 3) return "Cloudy";
  if (code <= 48) return "Fog";
  if (code <= 57) return "Light Rain";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Showers";
  if (code <= 86) return "Snow";
  return "Thunderstorms";
}

// Weather locations along the trip (lat/lng + label) — one per course area
var WEATHER_LOCATIONS = [
  { key:"ardglass", label:"Ardglass", lat:54.2608, lng:-5.6100 },
  { key:"newcastle", label:"Royal County Down", lat:54.2150, lng:-5.8960 },
  { key:"castlerock", label:"Castlerock", lat:55.1647, lng:-6.7742 },
  { key:"portrush", label:"Royal Portrush", lat:55.2069, lng:-6.6561 },
  { key:"portstewart", label:"Portstewart", lat:55.1833, lng:-6.7233 },
];

// Resolve which location's weather to show "today" by referencing the trip
// schedule — today's course during the trip, a preview of the first course
// before it, Dublin after. Coordinates match the course/hotel map stops.
function getTodayWeatherTarget() {
  var ARD = { lat:54.2608, lng:-5.6100, label:"Ardglass" };
  var RCD = { lat:54.2150, lng:-5.8960, label:"Royal County Down" };
  var CST = { lat:55.1647, lng:-6.7742, label:"Castlerock" };
  var RPR = { lat:55.2069, lng:-6.6561, label:"Royal Portrush" };
  var PST = { lat:55.1833, lng:-6.7233, label:"Portstewart" };
  var DUB = { lat:53.3382, lng:-6.2591, label:"Dublin" };
  var td = getTripDay();
  if (td.status === "pre") return Object.assign({}, ARD, { sub:"Preview · first round Sat Jun 27 at Ardglass" });
  if (td.status === "post") return Object.assign({}, DUB, { sub:"Trip complete · Dublin" });
  var map = {
    1:[ARD, "Arrival day · first round tomorrow at Ardglass"],
    2:[ARD, "Round 1 · Ardglass · Tee 2:30 PM"],
    3:[RCD, "Round 2 · Royal County Down · Tee 2:21 PM"],
    4:[CST, "Round 3 · Castlerock · Tee 1:06 PM"],
    5:[RPR, "Round 4 · Royal Portrush · Tee 9:40 AM"],
    6:[PST, "Round 5 · Portstewart · Tee 10:30 AM"],
    7:[DUB, "Travel day · Dublin → home"],
    8:[DUB, "Dublin"],
  };
  var e = map[td.day] || map[2];
  return Object.assign({}, e[0], { sub:e[1] });
}

// Hourly forecast for wherever the group is today (per the schedule): temp,
// rain chance, and wind across the golf-relevant daylight window.
function TodayWeatherCard() {
  var target = getTodayWeatherTarget();
  var d = useState(null); var data = d[0], setData = d[1];
  var ld = useState(false); var loading = ld[0], setLoading = ld[1];
  var er = useState(null); var err = er[0], setErr = er[1];

  function fetchToday() {
    setLoading(true); setErr(null);
    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + target.lat + "&longitude=" + target.lng +
      "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m" +
      "&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m" +
      "&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=Europe/London&forecast_days=2";
    fetch(url)
      .then(function(r) { return r.json(); })
      .then(function(j) {
        if (!j || !j.hourly || !j.current) { setErr("Weather unavailable. Try again."); setLoading(false); return; }
        var today = (j.hourly.time[0] || "").slice(0, 10); // API's local "today"
        var hours = [];
        for (var i = 0; i < j.hourly.time.length; i++) {
          var t = j.hourly.time[i];
          if (t.slice(0, 10) !== today) continue;
          var hr = parseInt(t.slice(11, 13), 10);
          if (hr < 6 || hr > 21) continue; // daylight golf window
          var h12 = ((hr + 11) % 12) + 1;
          hours.push({
            label: h12 + (hr < 12 ? "a" : "p"),
            temp: Math.round(j.hourly.temperature_2m[i]),
            rain: j.hourly.precipitation_probability ? (j.hourly.precipitation_probability[i] || 0) : 0,
            wind: Math.round(j.hourly.wind_speed_10m[i]),
            code: j.hourly.weather_code[i],
          });
        }
        setData({
          current: { temp: Math.round(j.current.temperature_2m), feels: Math.round(j.current.apparent_temperature), wind: Math.round(j.current.wind_speed_10m), code: j.current.weather_code },
          hours: hours,
        });
        setLoading(false);
      })
      .catch(function() { setErr("Couldn't load weather — check your connection."); setLoading(false); });
  }

  // Refetch only when the target coordinates change; fetchToday is intentionally excluded.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(function() { fetchToday(); }, [target.lat, target.lng]);

  return (
    <div style={S.card}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4}}>
        <div style={S.cardTitle}>🌦️ Weather Today</div>
        <button onClick={fetchToday} disabled={loading} style={Object.assign({}, S.addBtn, {fontSize:11, opacity:loading?0.6:1})}>{loading ? "…" : "Refresh"}</button>
      </div>
      <div style={{fontSize:16, fontWeight:700, color:"#fff", fontFamily:"system-ui"}}>{target.label}</div>
      <div style={{fontSize:11, color:CL.muted, fontFamily:"system-ui", marginBottom:10}}>{target.sub}</div>

      {err && <div style={{fontSize:12, color:CL.red, fontFamily:"system-ui", padding:8}}>{err}</div>}
      {loading && !data && <div style={{textAlign:"center", padding:16, color:CL.muted, fontFamily:"system-ui", fontSize:12}}>Loading hourly forecast…</div>}

      {data && (
        <div>
          <div style={{display:"flex", alignItems:"center", gap:12, padding:12, background:"rgba(37,99,235,0.1)", borderRadius:8, marginBottom:12, border:"1px solid rgba(37,99,235,0.2)"}}>
            <div style={{fontSize:34}}>{weatherIcon(wmoCondition(data.current.code))}</div>
            <div>
              <div style={{fontSize:24, fontWeight:700, color:"#fff", fontFamily:"system-ui"}}>{data.current.temp + "°F"}</div>
              <div style={{fontSize:11, color:CL.muted, fontFamily:"system-ui"}}>{wmoCondition(data.current.code) + " · feels " + data.current.feels + "°"}</div>
            </div>
            <div style={{marginLeft:"auto", textAlign:"right", fontSize:12, color:CL.muted, fontFamily:"system-ui"}}>{"💨 " + data.current.wind + " mph"}</div>
          </div>

          {data.hours.length === 0 ? (
            <div style={{fontSize:12, color:CL.muted, fontFamily:"system-ui", textAlign:"center", padding:8}}>No hourly data for today.</div>
          ) : (
            <div style={{display:"flex", gap:8, overflowX:"auto", paddingBottom:6, WebkitOverflowScrolling:"touch"}}>
              {data.hours.map(function(h, i) {
                return (
                  <div key={i} style={{flex:"none", width:62, textAlign:"center", background:"rgba(30,58,95,0.25)", border:"1px solid "+CL.border, borderRadius:8, padding:"8px 4px"}}>
                    <div style={{fontSize:11, color:"#fff", fontWeight:700, fontFamily:"system-ui"}}>{h.label}</div>
                    <div style={{fontSize:18, margin:"3px 0"}}>{weatherIcon(wmoCondition(h.code))}</div>
                    <div style={{fontSize:14, fontWeight:700, color:"#fff", fontFamily:"system-ui"}}>{h.temp + "°"}</div>
                    <div style={{fontSize:10, color:h.rain>=40?CL.blue:CL.muted, fontFamily:"system-ui", marginTop:3}}>{"🌧 " + h.rain + "%"}</div>
                    <div style={{fontSize:10, color:h.wind>=20?"#f59e0b":CL.muted, fontFamily:"system-ui"}}>{"💨 " + h.wind}</div>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{fontSize:10, color:CL.muted, fontFamily:"system-ui", marginTop:8, textAlign:"center"}}>Hourly · 6am–9pm local · scroll for more · Open-Meteo</div>
        </div>
      )}
    </div>
  );
}

function WeatherCard(props) {
  var cache = props.weatherCache, update = props.update;
  var ld = useState(false); var loading = ld[0], setLoading = ld[1];
  var er = useState(null); var err = er[0], setErr = er[1];
  var li = useState(0); var locIdx = li[0], setLocIdx = li[1];

  var isStale = !cache || !cache.ts || (Date.now() - cache.ts > 3600000);

  var fetchWeather = function(idx) {
    var loc = WEATHER_LOCATIONS[idx];
    setLoading(true); setErr(null);
    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + loc.lat + "&longitude=" + loc.lng +
      "&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max" +
      "&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=Europe/London&forecast_days=7";
    fetch(url)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data || !data.current || !data.daily) { setErr("Weather unavailable. Try again."); setLoading(false); return; }
        var cur = data.current;
        var daily = data.daily;
        var dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
        var forecast = daily.time.map(function(dateStr, i) {
          var d = new Date(dateStr + "T12:00:00");
          return {
            day: dayNames[d.getDay()] + " " + d.getDate(),
            hi: Math.round(daily.temperature_2m_max[i]),
            lo: Math.round(daily.temperature_2m_min[i]),
            condition: wmoCondition(daily.weather_code[i]),
            rain_pct: daily.precipitation_probability_max[i] != null ? daily.precipitation_probability_max[i] : 0,
            wind_mph: Math.round(daily.wind_speed_10m_max[i]),
          };
        });
        var parsed = {
          location: WEATHER_LOCATIONS[idx].label,
          locIdx: idx,
          current: {
            temp_f: Math.round(cur.temperature_2m),
            condition: wmoCondition(cur.weather_code),
            wind_mph: Math.round(cur.wind_speed_10m),
            humidity: Math.round(cur.relative_humidity_2m),
          },
          forecast: forecast,
          ts: Date.now(),
        };
        update({ weatherCache: parsed });
        setLoading(false);
      })
      .catch(function() { setErr("Weather fetch failed. Check connection."); setLoading(false); });
  };

  // Auto-load on first mount or when stale
  useEffect(function() {
    if (isStale) fetchWeather(locIdx);
    // Mount-only on purpose: locIdx/isStale/fetchWeather are read at first run and
    // intentionally excluded to avoid refetch loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchLocation(idx) {
    setLocIdx(idx);
    fetchWeather(idx);
  }

  var w = cache;
  return (
    <div style={S.card}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10}}>
        <div style={S.cardTitle}>🌤️ Weather at Each Course</div>
        <button onClick={function() { fetchWeather(locIdx); }} disabled={loading} style={Object.assign({}, S.addBtn, {fontSize:11, opacity:loading?0.6:1})}>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {/* Location selector */}
      <div style={{display:"flex", gap:4, marginBottom:10, flexWrap:"wrap"}}>
        {WEATHER_LOCATIONS.map(function(loc, i) {
          return <button key={loc.key} onClick={function() { switchLocation(i); }} style={Object.assign({}, S.subTab, locIdx===i ? S.subTabOn : S.subTabOff, {fontSize:10, flex:"none", padding:"6px 10px"})}>{loc.label.split(" (")[0]}</button>;
        })}
      </div>

      {err && <div style={{fontSize:12, color:CL.red, fontFamily:"system-ui", padding:8}}>{err}</div>}
      {loading && !w && <div style={{textAlign:"center", padding:16}}><div style={{fontSize:24}}>🌤️</div><div style={{color:CL.muted, fontFamily:"system-ui", fontSize:12, marginTop:4}}>Loading forecast...</div></div>}

      {w && w.current && (
        <div>
          <div style={{display:"flex", alignItems:"center", gap:12, padding:12, background:"rgba(37,99,235,0.1)", borderRadius:8, marginBottom:10, border:"1px solid rgba(37,99,235,0.2)"}}>
            <div style={{fontSize:36}}>{weatherIcon(w.current.condition)}</div>
            <div><div style={{fontSize:24, fontWeight:700, color:"#fff", fontFamily:"system-ui"}}>{w.current.temp_f+"°F"}</div><div style={S.label}>{w.current.condition}</div></div>
            <div style={{marginLeft:"auto", textAlign:"right"}}><div style={S.label}>{"💨 "+w.current.wind_mph+" mph"}</div><div style={S.label}>{"💧 "+w.current.humidity+"%"}</div></div>
          </div>
          {w.forecast && w.forecast.map(function(d,i) {
            return (
              <div key={i} style={Object.assign({display:"flex", alignItems:"center", padding:"8px 0", gap:8}, i < w.forecast.length-1 ? S.separator : {})}>
                <div style={{fontSize:22, width:32, textAlign:"center"}}>{weatherIcon(d.condition)}</div>
                <div style={{flex:1}}><div style={{fontSize:14, fontWeight:700, color:"#fff", fontFamily:"system-ui"}}>{d.day}</div><div style={S.label}>{d.condition}</div></div>
                <div style={{textAlign:"right"}}><div style={{fontSize:14, fontWeight:700, color:"#fff", fontFamily:"system-ui"}}>{d.hi+"° / "+d.lo+"°"}</div><div style={{fontSize:10, color:CL.muted, fontFamily:"system-ui"}}>{"🌧 "+d.rain_pct+"% · 💨 "+d.wind_mph+"mph"}</div></div>
              </div>
            );
          })}
          <div style={{fontSize:10, color:CL.muted, fontFamily:"system-ui", marginTop:8, textAlign:"center"}}>{"Powered by Open-Meteo · "+(isStale?"Tap Refresh to update":"Updated just now")}</div>
        </div>
      )}
    </div>
  );
}

function ItineraryTab(props) {
  var es = useState(null); var exp = es[0], setExp = es[1];

  // Map each day to its inbound shuttle leg (the drive that gets you TO that day's activity)
  var legByDay = {
    1: { label:"Dublin Airport → Ardglass", time:"2h" },
    3: { label:"Royal County Down → Castlerock", time:"2h 20m" },
    4: { label:"Bushmills → Royal Portrush", time:"15m" },
    5: { label:"Castlerock area → Portstewart", time:"25m" },
  };

  return (
    <div>
      <div style={S.pageHeader}><div style={S.pageTitle}>Trip Itinerary</div></div>
      <TripMap />

      {/* Day-by-day cards */}
      {ITINERARY.map(function(day, i) {
        var isGolf = day.type==="golf";
        var course = isGolf ? COURSES[day.courseIdx] : null;
        var open = exp===i;
        var inboundLeg = legByDay[day.day];
        return (
          <div key={i} style={S.card} onClick={function() { setExp(open?null:i); }}>
            <div style={{display:"flex", alignItems:"center", gap:12}}>
              <div style={{width:42, height:42, borderRadius:21, background:isGolf?"rgba(227,193,120,0.15)":"rgba(37,99,235,0.1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0}}>
                {isGolf ? "⛳" : day.type==="free" ? "🍺" : "✈️"}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:11, color:CL.red, fontFamily:"system-ui", fontWeight:600}}>{day.date}</div>
                <div style={{fontSize:17, fontWeight:700, color:"#fff"}}>{day.title}</div>
                {isGolf && <div style={S.label}>{"Tee: "+day.teeTime+" · Par "+course.par}</div>}
              </div>
              <div style={{color:CL.muted, fontSize:16}}>{open ? "▾" : "›"}</div>
            </div>

            {/* Shuttle inline — always visible if there's an inbound transfer */}
            {inboundLeg && (
              <div style={{display:"flex", alignItems:"center", gap:8, marginTop:10, padding:"8px 10px", background:"rgba(91,155,255,0.08)", borderRadius:6, border:"1px solid rgba(91,155,255,0.2)"}}>
                <div style={{fontSize:16}}>🚐</div>
                <div style={{flex:1, fontSize:12, color:CL.text, fontFamily:"system-ui"}}>{inboundLeg.label}</div>
                <div style={{fontSize:13, fontWeight:700, color:CL.blue, fontFamily:"system-ui"}}>{inboundLeg.time}</div>
              </div>
            )}

            {/* Events — always visible */}
            {day.events && day.events.map(function(ev, ei) {
              return (
                <div key={ei} style={S.eventCard}>
                  <div style={{fontSize:20, flexShrink:0}}>{ev.icon}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:15, fontWeight:700, color:"#fff", fontFamily:"system-ui"}}>{ev.name}</div>
                    <div style={S.label}>{ev.time+(ev.detail ? " · "+ev.detail : "")}</div>
                  </div>
                </div>
              );
            })}

            {/* Expanded detail */}
            {open && (
              <div style={{marginTop:12, paddingTop:12, borderTop:"1px solid "+CL.border}}>
                <div style={{fontSize:14, color:CL.text, lineHeight:1.5, fontFamily:"system-ui"}}>{day.description}</div>
                {isGolf && course.note && <div style={{fontSize:12, color:CL.muted, fontFamily:"system-ui", marginTop:8, fontStyle:"italic"}}>{course.note}</div>}
                {isGolf && (
                  <div style={{display:"flex", gap:12, marginTop:6}}>
                    {course.url && <a href={course.url} target="_blank" rel="noopener" style={{fontSize:12, color:CL.blue, fontFamily:"system-ui", textDecoration:"none"}} onClick={function(e) { e.stopPropagation(); }}>Website ›</a>}
                    {course.scorecard && course.scorecard !== course.url && <a href={course.scorecard} target="_blank" rel="noopener" style={{fontSize:12, color:CL.blue, fontFamily:"system-ui", textDecoration:"none"}} onClick={function(e) { e.stopPropagation(); }}>Scorecard ›</a>}
                  </div>
                )}
                {day.hotel && <div style={{marginTop:10, padding:8, background:"rgba(37,99,235,0.1)", borderRadius:4}}><div style={{fontSize:11, color:CL.blue, fontFamily:"system-ui", fontWeight:600}}>🏨 HOTEL</div><div style={{fontSize:13, color:"#fff", fontFamily:"system-ui"}}>{day.hotel}</div><div style={S.label}>{day.hotelLoc}</div></div>}
                {day.driveToHotel && <div style={{display:"flex", alignItems:"center", gap:8, marginTop:8, padding:"8px 10px", background:"rgba(91,155,255,0.08)", borderRadius:6}}><div style={{fontSize:14}}>🚐</div><div style={{fontSize:12, color:CL.text, fontFamily:"system-ui"}}>{day.driveToHotel}</div></div>}
                {day.sightseeing && <div style={{marginTop:10, padding:8, background:"rgba(220,38,38,0.06)", borderRadius:4, border:"1px solid rgba(220,38,38,0.15)"}}><div style={{fontSize:11, color:CL.red, fontFamily:"system-ui", fontWeight:600}}>📸 SIGHTSEEING</div><div style={{fontSize:12, color:CL.text, fontFamily:"system-ui", lineHeight:1.4}}>{day.sightseeing}</div></div>}
              </div>
            )}
          </div>
        );
      })}

      {/* Tee Times summary */}
      <div style={S.card}>
        <div style={S.cardTitle}>⛳ Tee Times</div>
        {COURSES.map(function(c, i) {
          var golfDay = ITINERARY.find(function(d) { return d.courseIdx === i && d.type === "golf"; });
          return (
            <div key={i} style={Object.assign({display:"flex", justifyContent:"space-between", alignItems:"center", padding:"11px 0"}, i < COURSES.length-1 ? S.separator : {})}>
              <div style={{flex:1}}>
                <div style={{fontSize:16, fontWeight:600, color:"#fff", fontFamily:"system-ui"}}>{c.name}</div>
                <div style={S.label}>{(golfDay ? golfDay.date+" · " : "")+"Par "+c.par}</div>
              </div>
              <div style={{textAlign:"right", background:"rgba(227,193,120,0.12)", border:"1px solid rgba(227,193,120,0.3)", borderRadius:8, padding:"6px 12px", minWidth:80}}>
                <div style={{fontSize:15, fontWeight:700, color:"#e3c178", fontFamily:"system-ui"}}>{golfDay ? golfDay.teeTime : "—"}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Weather at each course location */}
      <WeatherCard weatherCache={props.weatherCache} update={props.update} />

      {/* Emergency contacts */}
      <div style={S.card}>
        <div style={S.cardTitle}>🚨 Emergency Contacts</div>
        {CONTACTS.map(function(c, i) {
          return (
            <div key={i} style={Object.assign({display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0"}, i < CONTACTS.length-1 ? S.separator : {})}>
              <div><div style={{fontSize:16, fontWeight:600, color:"#fff", fontFamily:"system-ui"}}>{c.name}</div><div style={S.label}>{c.note}</div></div>
              <a href={"tel:"+c.phone.replace(/\s/g,"")} style={{fontSize:13, color:CL.blue, fontFamily:"system-ui", fontWeight:600, textDecoration:"none"}} onClick={function(e) { e.stopPropagation(); }}>{c.phone}</a>
            </div>
          );
        })}
      </div>

      {/* Quick reference */}
      <div style={S.card}>
        <div style={S.cardTitle}>ℹ️ Quick Reference</div>
        {QUICK_REF.map(function(item, i) {
          return (
            <div key={i} style={Object.assign({display:"flex", justifyContent:"space-between", padding:"8px 0", gap:12}, i < QUICK_REF.length-1 ? S.separator : {})}>
              <div style={Object.assign({}, S.label, {flexShrink:0})}>{item.label}</div>
              <div style={{fontSize:12, color:"#fff", fontFamily:"system-ui", textAlign:"right"}}>{item.value}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── SCORES ──────────────────────────────────────────────────────────
function ScoresTab(props) {
  var players = props.players, scores = props.scores, sel = props.sel;
  var hole = props.hole, setHole = props.setHole, update = props.update, rs = props.rs;
  var saveScore = props.saveScore;
  var course = COURSES[sel];

  var sc = useState(false); var scanning = sc[0], setScanning = sc[1];
  var sd = useState(null); var scanData = sd[0], setScanData = sd[1];
  var sl = useState(false); var scanLoading = sl[0], setScanLoading = sl[1];
  var se = useState(null); var scanErr = se[0], setScanErr = se[1];
  // Which scanned rows have been assigned (rowIndex -> playerId). Lets a single scan of a
  // multi-player card assign every row, instead of closing after the first one.
  var asg = useState({}); var assigned = asg[0], setAssigned = asg[1];
  // Which players have the hole-by-hole gross/net/Stableford detail expanded (pid -> true).
  var bd = useState({}); var breakdownOpen = bd[0], setBreakdownOpen = bd[1];
  // Handicap editor (relocated from Bets)
  var hceOpen = useState(false); var hcEditorOpen = hceOpen[0], setHcEditorOpen = hceOpen[1];
  var hceId = useState(null); var hcEditId = hceId[0], setHcEditId = hceId[1];
  var hceVal = useState(""); var hcVal = hceVal[0], setHcVal = hceVal[1];
  // Course-setup editor (gatekeepers only) — fix par/SI live if the pro shop's card differs.
  var ceo = useState(false); var courseEditorOpen = ceo[0], setCourseEditorOpen = ceo[1];
  var courseOverrides = props.courseOverrides || {};
  var courseIsOverridden = !!courseOverrides[sel];

  // Write the current course's full par + SI arrays into courseOverrides, with one cell changed.
  function setCourseHole(field, holeIdx, value) {
    if (props.isGuest || !props.canEditBooks) return;
    var pars = course.pars.slice();
    var si = course.si.slice();
    if (field === "par") pars[holeIdx] = value; else si[holeIdx] = value;
    var ov = Object.assign({}, courseOverrides);
    ov[sel] = { pars: pars, si: si };
    update({ courseOverrides: ov });
  }
  function resetCourseSetup() {
    if (props.isGuest || !props.canEditBooks) return;
    var ov = Object.assign({}, courseOverrides);
    delete ov[sel];
    update({ courseOverrides: ov });
  }

  function saveHandicap() {
    if (props.isGuest || !hcEditId) return;
    var nv = parseFloat(hcVal);
    if (isNaN(nv)) { setHcEditId(null); setHcVal(""); return; }
    update({players:players.map(function(p) {
      if (p.id !== hcEditId) return p;
      var edited = p.handicapEdited || nv !== p.handicap;
      return Object.assign({}, p, {handicap:nv, handicapEdited:edited});
    })});
    setHcEditId(null); setHcVal("");
  }

  function setScore(pid, h, val) {
    if (props.isGuest) return;
    var cur = (scores[pid] && scores[pid][sel]) ? scores[pid][sel].slice() : Array(18).fill(null);
    cur[h] = val;
    saveScore(pid, sel, cur);
  }

  function bulkSet(pid, arr, rowIdx) {
    if (props.isGuest) return;
    var clean = arr.slice(0, 18).map(function(s) { return s > 0 ? s : null; });
    while (clean.length < 18) clean.push(null);
    saveScore(pid, sel, clean);
    // Keep the scanner open so every row on a multi-player card can be assigned in one
    // pass; mark this row done. The user closes with "Done" when finished.
    if (rowIdx !== undefined && rowIdx !== null) {
      setAssigned(function(prev) { var n = Object.assign({}, prev); n[rowIdx] = pid; return n; });
    }
  }

  function closeScan() { setScanData(null); setScanning(false); setAssigned({}); }

  function clearRound(pid) {
    if (props.isGuest) return;
    saveScore(pid, sel, Array(18).fill(null));
  }

  function handlePhoto(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    if (props.isGuest) return;
    setScanLoading(true); setScanErr(null); setScanData(null); setAssigned({});

    var names = (players || []).map(function(p) { return p.name; });

    // Downsize the image in-browser before upload: faster, cheaper, avoids
    // serverless body-size limits. Max dimension 1600px keeps text readable.
    function sendBase64(base64, mediaType) {
      fetch("/api/scan-scorecard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mediaType: mediaType, playerNames: names }),
      })
        .then(function(r) {
          return r.json().then(function(data) { return { ok: r.ok, data: data }; });
        })
        .then(function(res) {
          if (!res.ok) {
            setScanErr((res.data && res.data.error) || "Scan failed. Try a clearer photo.");
            setScanLoading(false);
            return;
          }
          if (res.data && res.data.players && res.data.players.length) {
            setScanData(res.data);
          } else {
            setScanErr("Couldn't find any scores. Try a clearer, straight-on photo.");
          }
          setScanLoading(false);
        })
        .catch(function() {
          setScanErr("Scan failed — check your connection and try again.");
          setScanLoading(false);
        });
    }

    var reader = new FileReader();
    reader.onload = function() {
      var img = new Image();
      img.onload = function() {
        try {
          var maxDim = 1600;
          var w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
            else { w = Math.round(w * maxDim / h); h = maxDim; }
          }
          var canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          var ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          var jpeg = canvas.toDataURL("image/jpeg", 0.85);
          sendBase64(jpeg.split(",")[1], "image/jpeg");
        } catch (err) {
          // Fallback: send original if canvas fails
          sendBase64(String(reader.result).split(",")[1], file.type || "image/jpeg");
        }
      };
      img.onerror = function() {
        setScanErr("Couldn't read that image. Try another photo.");
        setScanLoading(false);
      };
      img.src = reader.result;
    };
    reader.onerror = function() {
      setScanErr("Couldn't read that image file. Try another photo.");
      setScanLoading(false);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <div style={S.pageHeader}>
        <div style={S.pageTitle}>Scorecard</div>
        {!props.isGuest && <button onClick={function() { if (scanning) { closeScan(); } else { setScanning(true); setScanData(null); setScanErr(null); setAssigned({}); } }} style={Object.assign({}, S.addBtn, {fontSize:13})}>{scanning ? "✕ Close" : "📷 Scan"}</button>}
      </div>

      {scanning && (
        <div style={S.card}>
          <div style={S.cardTitle}>📷 Scan Scorecard</div>
          <div style={Object.assign({}, S.label, {marginBottom:12})}>Take a photo of the physical scorecard. AI reads the scores so you can assign them.</div>

          {!scanData && !scanLoading && (
            <label style={Object.assign({}, S.primaryBtn, {display:"block", textAlign:"center", cursor:"pointer"})}>
              {scanErr ? "Try Again" : "Take Photo or Choose Image"}
              <input type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{display:"none"}} />
            </label>
          )}
          {scanLoading && <div style={{textAlign:"center", padding:20}}><div style={{fontSize:24}}>🔍</div><div style={{color:CL.muted, fontFamily:"system-ui", fontSize:13, marginTop:4}}>Reading scorecard...</div></div>}
          {scanErr && <div style={{marginTop:8, padding:10, background:"rgba(220,38,38,0.1)", borderRadius:6}}><div style={{fontSize:12, color:CL.red, fontFamily:"system-ui"}}>{scanErr}</div></div>}

          {scanData && scanData.players && (
            <div>
              <div style={{fontSize:13, color:"#fff", fontWeight:600, fontFamily:"system-ui", marginBottom:8}}>{"Found "+scanData.players.length+" row(s):"}</div>
              {scanData.players.map(function(sp, si) {
                var total = sp.scores.reduce(function(a,b) { return a+b; }, 0);
                var assignedPid = assigned[si];
                var assignedP = assignedPid ? players.find(function(x){return x.id===assignedPid;}) : null;
                return (
                  <div key={si} style={{marginBottom:12, padding:12, background: assignedP ? "rgba(34,197,94,0.1)" : "rgba(37,99,235,0.1)", borderRadius:6, border:"1px solid "+(assignedP ? "rgba(34,197,94,0.4)" : "rgba(37,99,235,0.2)")}}>
                    <div style={{display:"flex", justifyContent:"space-between", marginBottom:6}}>
                      <div style={{fontSize:14, fontWeight:700, color:"#fff", fontFamily:"system-ui"}}>{sp.name}</div>
                      <div style={{fontSize:14, fontWeight:700, color:CL.red, fontFamily:"system-ui"}}>{total > 0 ? total : ""}</div>
                    </div>
                    <div style={{display:"grid", gridTemplateColumns:"repeat(9,1fr)", gap:2, marginBottom:8}}>
                      {sp.scores.slice(0,18).map(function(sc,hi) {
                        return <div key={hi} style={{textAlign:"center", padding:"2px 0", background:"rgba(30,58,95,0.3)", borderRadius:3}}><div style={{fontSize:8, color:CL.muted, fontFamily:"system-ui"}}>{hi+1}</div><div style={{fontSize:12, color:"#fff", fontWeight:700, fontFamily:"system-ui"}}>{sc>0?sc:"·"}</div></div>;
                      })}
                    </div>
                    <div style={Object.assign({}, S.label, {marginBottom:6})}>{assignedP ? ("\u2713 Assigned to "+assignedP.name.split(" ")[0]+" \u00b7 tap to change") : "Assign to:"}</div>
                    <div style={{display:"flex", gap:4, flexWrap:"wrap"}}>
                      {players.map(function(p) { var on = assignedPid===p.id; return <button key={p.id} onClick={function() { bulkSet(p.id, sp.scores, si); }} style={Object.assign({}, S.pillBtn, on ? {background:"rgba(34,197,94,0.25)", borderColor:"#22c55e", color:"#22c55e"} : {})}>{(on?"\u2713 ":"")+p.emoji+" "+p.name.split(" ")[0]}</button>; })}
                    </div>
                  </div>
                );
              })}
              <div style={{display:"flex", gap:8, marginTop:8}}>
                <label style={Object.assign({}, S.secondaryBtn, {flex:1, display:"block", textAlign:"center", cursor:"pointer", margin:0})}>
                  Scan Another<input type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{display:"none"}} />
                </label>
                <button onClick={closeScan} style={{flex:1, padding:14, borderRadius:8, border:"none", background:CL.red, color:"#fff", fontSize:15, fontWeight:700, fontFamily:"system-ui", cursor:"pointer"}}>{"Done"+(Object.keys(assigned).length ? " ("+Object.keys(assigned).length+")" : "")}</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{display:"flex", gap:6, padding:"0 16px", marginBottom:4, overflowX:"auto"}}>
        {COURSES.map(function(c, i) {
          return <button key={i} onClick={function() { update({selectedRound:i}); }} style={Object.assign({}, S.roundBtn, sel===i ? S.roundBtnOn : {})}>{COURSE_LABELS[i]}</button>;
        })}
      </div>

      {/* Tee selector for the current course */}
      <div style={{display:"flex", gap:4, padding:"0 16px", marginBottom:8, alignItems:"center"}}>
        <span style={{fontSize:11, color:CL.muted, fontFamily:"system-ui", fontWeight:600, marginRight:4}}>Tees:</span>
        {course.tees.map(function(tee, ti) {
          var selectedTees = props.selectedTees || [0,0,0,0,0];
          var active = (selectedTees[sel] || 0) === ti;
          return <button key={ti} onClick={function() {
            if (props.isGuest) return;
            var nt = (selectedTees).slice();
            nt[sel] = ti;
            ACTIVE_SLOPES[sel] = tee.slope;
            update({selectedTees:nt});
          }} style={Object.assign({}, S.pillBtn, {fontSize:11, padding:"4px 10px"}, active ? {background:"rgba(34,197,94,0.2)", borderColor:"#22c55e", color:"#22c55e"} : {})}>{tee.label+" ("+tee.slope+")"}</button>;
        })}
      </div>

      {/* Course-setup override (gatekeepers only) — fix par/SI live to match the day's card */}
      {props.canEditBooks && (
        <div style={{padding:"0 16px", marginBottom:8}}>
          <button onClick={function() { setCourseEditorOpen(!courseEditorOpen); }} style={{width:"100%", background:"none", border:"1px dashed "+CL.border, borderRadius:6, color:CL.muted, fontSize:11, fontFamily:"system-ui", padding:"6px 10px", cursor:"pointer", textAlign:"left"}}>
            {(courseEditorOpen?"▾":"▸")+" ⚙︎ Edit course setup (par / SI)"}{courseIsOverridden ? <span style={{color:"#22c55e"}}>{"  · edited"}</span> : null}
          </button>
          {courseEditorOpen && (function() {
            var siValid = (function() { var s = course.si.slice().sort(function(a,b){return a-b;}); for (var i=0;i<18;i++){ if (s[i]!==i+1) return false; } return true; })();
            function holeCell(h) {
              return (
                <div key={h} style={{textAlign:"center", background:"rgba(30,58,95,0.15)", borderRadius:3, padding:"4px 0"}}>
                  <div style={{fontSize:10, color:"#fff", fontFamily:"system-ui", fontWeight:700, marginBottom:2}}>{h+1}</div>
                  <button onClick={function() { setCourseHole("par", h, course.pars[h] >= 5 ? 3 : course.pars[h] + 1); }} style={{display:"block", width:"86%", margin:"0 auto 3px", background:"rgba(220,38,38,0.15)", border:"1px solid rgba(220,38,38,0.4)", borderRadius:3, color:CL.red, fontSize:11, fontWeight:700, fontFamily:"system-ui", padding:"2px 0", cursor:"pointer"}}>{course.pars[h]}</button>
                  <input type="number" inputMode="numeric" min={1} max={18} value={course.si[h]} onChange={function(e) { var v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 1 && v <= 18) setCourseHole("si", h, v); }} style={{width:"86%", textAlign:"center", background:CL.bg, border:"1px solid "+CL.border, borderRadius:3, color:"#fff", fontSize:11, fontFamily:"system-ui", padding:"2px 0"}} />
                </div>
              );
            }
            return (
              <div style={Object.assign({}, S.card, {marginTop:6})}>
                <div style={{fontSize:12, color:CL.muted, fontFamily:"system-ui", marginBottom:8}}>Tap a hole's <span style={{color:CL.red}}>par</span> to cycle 3→4→5. Type its <span style={{color:"#fff"}}>SI</span> (1–18). Saved live for everyone.</div>
                <div style={{fontSize:9, color:CL.muted, fontFamily:"system-ui", fontWeight:600, marginBottom:3}}>FRONT 9 · (par / SI)</div>
                <div style={{display:"grid", gridTemplateColumns:"repeat(9,1fr)", gap:2}}>{Array.from({length:9}, function(_,i){ return holeCell(i); })}</div>
                <div style={{fontSize:9, color:CL.muted, fontFamily:"system-ui", fontWeight:600, margin:"8px 0 3px"}}>BACK 9 · (par / SI)</div>
                <div style={{display:"grid", gridTemplateColumns:"repeat(9,1fr)", gap:2}}>{Array.from({length:9}, function(_,i){ return holeCell(i+9); })}</div>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:10}}>
                  <div style={{fontSize:12, color:"#fff", fontFamily:"system-ui", fontWeight:600}}>{"Par "+course.par}{!siValid && <span style={{color:CL.red, fontWeight:400}}>{"  ·  SI should use 1–18 once each"}</span>}</div>
                  {courseIsOverridden && <button onClick={resetCourseSetup} style={{fontSize:11, color:CL.muted, fontFamily:"system-ui", background:"none", border:"1px solid "+CL.border, borderRadius:6, padding:"5px 12px", cursor:"pointer"}}>↩ Reset to default</button>}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      <div style={S.card}>
        <div style={S.cardTitle}>{course.name}</div>
        <div style={S.label}>{"Par "+course.par+" · "+course.location}</div>

        {/* Scorecard header - Front 9 */}
        <div style={{marginTop:12, marginBottom:4}}>
          <div style={{fontSize:10, color:CL.muted, fontFamily:"system-ui", fontWeight:600, marginBottom:4}}>FRONT 9</div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(9,1fr)", gap:2}}>
            {Array.from({length:9}, function(_,h) {
              return (
                <div key={h} style={{textAlign:"center", background:"rgba(30,58,95,0.15)", borderRadius:3, padding:"3px 0"}}>
                  <div style={{fontSize:10, color:"#fff", fontFamily:"system-ui", fontWeight:700}}>{h+1}</div>
                  <div style={{fontSize:8, color:CL.red, fontFamily:"system-ui", fontWeight:600}}>{"P"+course.pars[h]}</div>
                  <div style={{fontSize:7, color:CL.muted, fontFamily:"system-ui"}}>{"SI "+course.si[h]}</div>
                </div>
              );
            })}
          </div>
        </div>
        {/* Back 9 */}
        <div style={{marginBottom:4}}>
          <div style={{fontSize:10, color:CL.muted, fontFamily:"system-ui", fontWeight:600, marginBottom:4}}>BACK 9</div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(9,1fr)", gap:2}}>
            {Array.from({length:9}, function(_,h) {
              var idx = h+9;
              return (
                <div key={idx} style={{textAlign:"center", background:"rgba(30,58,95,0.15)", borderRadius:3, padding:"3px 0"}}>
                  <div style={{fontSize:10, color:"#fff", fontFamily:"system-ui", fontWeight:700}}>{idx+1}</div>
                  <div style={{fontSize:8, color:CL.red, fontFamily:"system-ui", fontWeight:600}}>{"P"+course.pars[idx]}</div>
                  <div style={{fontSize:7, color:CL.muted, fontFamily:"system-ui"}}>{"SI "+course.si[idx]}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {players.map(function(player) {
        var gross = rs(player.id, sel);
        var ch = getCourseHandicap(player.handicap, sel);
        var net = gross !== null ? gross - ch : null;
        var frontTotal = 0, backTotal = 0, frontCount = 0, backCount = 0;
        var frontNetTotal = 0, backNetTotal = 0;
        for (var hi = 0; hi < 18; hi++) {
          var hv = scores[player.id] && scores[player.id][sel] && scores[player.id][sel][hi];
          if (hv != null) {
            var hsi = course.si ? course.si[hi] : 99;
            var netHv = hv - strokesOnHole(ch, hsi);
            if (hi < 9) { frontTotal += hv; frontNetTotal += netHv; frontCount++; }
            else { backTotal += hv; backNetTotal += netHv; backCount++; }
          }
        }
        return (
          <div key={player.id} style={S.card}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4}}>
              <div style={{display:"flex", alignItems:"center", gap:8}}>
                <span style={{fontSize:16, fontWeight:600, color:"#fff"}}>{player.emoji+" "+player.name}</span>
                {!props.isGuest && gross !== null && <button onClick={function() { if (confirm("Clear all scores for "+player.name+" on "+COURSE_LABELS[sel]+"?")) clearRound(player.id); }} style={{fontSize:10, color:CL.muted, fontFamily:"system-ui", background:"none", border:"1px solid "+CL.border, borderRadius:4, padding:"2px 8px", cursor:"pointer"}}>Clear</button>}
              </div>
              <div style={{display:"flex", gap:10, alignItems:"center"}}>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:9, color:CL.muted, fontFamily:"system-ui"}}>GROSS</div>
                  <div style={{fontSize:16, fontWeight:700, color:CL.muted, fontFamily:"system-ui"}}>{gross !== null ? gross : "—"}</div>
                </div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:9, color:CL.muted, fontFamily:"system-ui"}}>HCP</div>
                  <div style={{fontSize:16, fontWeight:700, color:CL.blue, fontFamily:"system-ui"}}>{ch}</div>
                </div>
                <div style={{textAlign:"center", background:"rgba(220,38,38,0.1)", borderRadius:6, padding:"2px 8px", border:"1px solid rgba(220,38,38,0.25)"}}>
                  <div style={{fontSize:9, color:CL.red, fontFamily:"system-ui", fontWeight:600}}>NET</div>
                  <div style={{fontSize:18, fontWeight:700, color:CL.red, fontFamily:"system-ui"}}>{net !== null ? net : "—"}</div>
                </div>
              </div>
            </div>
            {(frontCount>0 || backCount>0) && (
              <div style={{marginBottom:8, padding:"7px 10px", background:"rgba(30,58,95,0.18)", borderRadius:6}}>
                <div style={{display:"grid", gridTemplateColumns:"42px 1fr 1fr 1fr", gap:4, alignItems:"center", fontFamily:"system-ui"}}>
                  <div></div>
                  <div style={{fontSize:9, color:CL.muted, textAlign:"center", fontWeight:700}}>OUT</div>
                  <div style={{fontSize:9, color:CL.muted, textAlign:"center", fontWeight:700}}>IN</div>
                  <div style={{fontSize:9, color:CL.muted, textAlign:"center", fontWeight:700}}>TOTAL</div>
                  <div style={{fontSize:11, color:"#fff", fontWeight:700}}>Gross</div>
                  <div style={{fontSize:15, color:"#fff", textAlign:"center", fontWeight:700}}>{frontCount>0?frontTotal:"—"}</div>
                  <div style={{fontSize:15, color:"#fff", textAlign:"center", fontWeight:700}}>{backCount>0?backTotal:"—"}</div>
                  <div style={{fontSize:15, color:"#fff", textAlign:"center", fontWeight:800}}>{frontTotal+backTotal}</div>
                  <div style={{fontSize:11, color:CL.red, fontWeight:700}}>Net</div>
                  <div style={{fontSize:15, color:CL.red, textAlign:"center", fontWeight:700}}>{frontCount>0?frontNetTotal:"—"}</div>
                  <div style={{fontSize:15, color:CL.red, textAlign:"center", fontWeight:700}}>{backCount>0?backNetTotal:"—"}</div>
                  <div style={{fontSize:15, color:CL.red, textAlign:"center", fontWeight:800}}>{frontNetTotal+backNetTotal}</div>
                </div>
              </div>
            )}
            <div style={{display:"grid", gridTemplateColumns:"repeat(9,1fr)", gap:3}}>
              {Array.from({length:18}, function(_,h) {
                var val = scores[player.id] && scores[player.id][sel] && scores[player.id][sel][h];
                var hp = course.pars ? course.pars[h] : null;
                var hsi = course.si ? course.si[h] : 99;
                // Player gets a stroke on holes where SI <= course handicap
                var getsStroke = hsi <= ch;
                var filled = val != null;
                var bg = filled && hp && val<=hp-2 ? "rgba(37,99,235,0.5)" : filled && hp && val<hp ? "rgba(34,197,94,0.4)" : filled && hp && val>=hp+2 ? "rgba(220,38,38,0.35)" : filled && hp && val>hp ? "rgba(220,38,38,0.15)" : filled ? S.holeFilled.background : S.holeBtn.background;
                var bc = filled && hp && val<=hp-2 ? CL.blue : filled && hp && val<hp ? "#22c55e" : filled && hp && val>=hp+2 ? CL.red : filled ? CL.blue : CL.border;
                return (
                  <button key={h} onClick={function() { if (!props.isGuest) setHole({playerId:player.id, hole:h}); }} style={Object.assign({}, S.holeBtn, {background:bg, borderColor:bc})}>
                    <div style={{fontSize:7, color:getsStroke ? CL.blue : CL.muted, fontFamily:"system-ui", fontWeight:getsStroke ? 700 : 400}}>{getsStroke ? "●"+(h+1) : h+1}</div>
                    <div style={{fontSize:14, color:"#fff", fontWeight:700}}>{val != null ? val : "·"}</div>
                  </button>
                );
              })}
            </div>
            {/* Hole-by-hole gross / net / Stableford — collapsible, to verify the points math */}
            {gross !== null && (
              <button onClick={function() { setBreakdownOpen(function(prev) { var n = Object.assign({}, prev); if (n[player.id]) delete n[player.id]; else n[player.id] = true; return n; }); }} style={{marginTop:8, fontSize:11, color:CL.blue, fontFamily:"system-ui", background:"none", border:"1px solid "+CL.border, borderRadius:6, padding:"5px 10px", cursor:"pointer"}}>{breakdownOpen[player.id] ? "\u25be Hide hole-by-hole" : "\u25b8 Hole-by-hole gross / net / Stableford"}</button>
            )}
            {breakdownOpen[player.id] && (
              <div style={{marginTop:8, paddingTop:8, borderTop:"1px solid "+CL.border}}>
                <div style={{fontSize:9, color:CL.muted, fontFamily:"system-ui", fontWeight:700, marginBottom:6, letterSpacing:0.5}}>{"HOLE-BY-HOLE \u00b7 "+COURSE_LABELS[sel]}</div>
                {[0,1].map(function(nine) {
                  var s = nine*9;
                  var holes = [], pars = [], gs = [], ns = [], ps = [];
                  var gT=0, nT=0, pT=0, parT=0, anyG=false;
                  for (var k=0; k<9; k++) {
                    var hh = s+k;
                    var par = course.pars ? course.pars[hh] : 0;
                    var hsi = course.si ? course.si[hh] : 99;
                    var str = strokesOnHole(ch, hsi);
                    var g = scores[player.id] && scores[player.id][sel] && scores[player.id][sel][hh];
                    holes.push({ n: hh+1, stroke: str>0 });
                    pars.push(par); parT += par;
                    if (g != null) {
                      anyG = true;
                      var nv = g - str;
                      var pt = stablefordPointsForHole(g, par, ch, hsi);
                      gs.push(g); ns.push(nv); ps.push(pt);
                      gT += g; nT += nv; pT += pt;
                    } else { gs.push("\u00b7"); ns.push("\u00b7"); ps.push("\u00b7"); }
                  }
                  var col = {display:"grid", gridTemplateColumns:"32px repeat(9,1fr) 30px", gap:2, marginBottom:2, alignItems:"center"};
                  function cellSty(c, bold) { return {textAlign:"center", fontSize:11, fontFamily:"system-ui", color:c||"#fff", fontWeight:bold?800:400}; }
                  return (
                    <div key={nine} style={{marginBottom:8, overflowX:"auto"}}>
                      <div style={{minWidth:330}}>
                        <div style={col}>
                          <div style={{fontSize:8, color:CL.muted, fontFamily:"system-ui", fontWeight:700}}>HOLE</div>
                          {holes.map(function(h,i){ return <div key={i} style={{textAlign:"center", fontSize:9, color:h.stroke?CL.blue:CL.muted, fontFamily:"system-ui", fontWeight:700}}>{(h.stroke?"\u25cf":"")+h.n}</div>; })}
                          <div style={{textAlign:"center", fontSize:8, color:CL.muted, fontFamily:"system-ui", fontWeight:700}}>{nine===0?"OUT":"IN"}</div>
                        </div>
                        <div style={col}>
                          <div style={{fontSize:8, color:CL.muted, fontFamily:"system-ui"}}>Par</div>
                          {pars.map(function(p,i){ return <div key={i} style={{textAlign:"center", fontSize:10, color:CL.muted, fontFamily:"system-ui"}}>{p}</div>; })}
                          <div style={{textAlign:"center", fontSize:10, color:CL.muted, fontFamily:"system-ui", fontWeight:700}}>{parT}</div>
                        </div>
                        <div style={col}>
                          <div style={{fontSize:8, color:"#fff", fontFamily:"system-ui", fontWeight:700}}>Gross</div>
                          {gs.map(function(v,i){ return <div key={i} style={cellSty("#fff")}>{v}</div>; })}
                          <div style={cellSty("#fff", true)}>{anyG?gT:"\u2014"}</div>
                        </div>
                        <div style={col}>
                          <div style={{fontSize:8, color:CL.red, fontFamily:"system-ui", fontWeight:700}}>Net</div>
                          {ns.map(function(v,i){ return <div key={i} style={cellSty(CL.red)}>{v}</div>; })}
                          <div style={cellSty(CL.red, true)}>{anyG?nT:"\u2014"}</div>
                        </div>
                        <div style={col}>
                          <div style={{fontSize:8, color:"#22c55e", fontFamily:"system-ui", fontWeight:700}}>Pts</div>
                          {ps.map(function(v,i){ return <div key={i} style={cellSty("#22c55e")}>{v}</div>; })}
                          <div style={cellSty("#22c55e", true)}>{anyG?pT:"\u2014"}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div style={{fontSize:9, color:CL.muted, fontFamily:"system-ui", marginTop:2, lineHeight:1.4}}>{"\u25cf = handicap stroke on that hole. Net = gross \u2212 strokes. Points: net albatross+ 5, eagle 4, birdie 3, par 2, bogey 1, double+ 0."}</div>
              </div>
            )}
            {/* Stableford by round (net) — this player's points per course + trip total */}
            <div style={{marginTop:8, paddingTop:8, borderTop:"1px solid "+CL.border}}>
              <div style={{fontSize:9, color:CL.muted, fontFamily:"system-ui", fontWeight:700, marginBottom:4, letterSpacing:0.5}}>STABLEFORD BY ROUND (NET)</div>
              <div style={{display:"flex", gap:3}}>
                {COURSES.map(function(c, ri) {
                  var sf = getRoundStableford(scores, player.id, ri, player.handicap);
                  return <div key={ri} style={{flex:1, textAlign:"center", background: ri===sel ? "rgba(220,38,38,0.14)" : "rgba(30,58,95,0.25)", borderRadius:4, padding:"4px 0"}}>
                    <div style={{fontSize:8, color:CL.muted, fontFamily:"system-ui", fontWeight:600}}>{COURSE_LABELS[ri]}</div>
                    <div style={{fontSize:14, fontWeight:700, color:"#fff", fontFamily:"system-ui"}}>{sf===null?"–":sf}</div>
                  </div>;
                })}
                <div style={{flex:1, textAlign:"center", background:"rgba(34,197,94,0.14)", borderRadius:4, padding:"4px 0"}}>
                  <div style={{fontSize:8, color:CL.muted, fontFamily:"system-ui", fontWeight:600}}>TOT</div>
                  <div style={{fontSize:14, fontWeight:800, color:"#22c55e", fontFamily:"system-ui"}}>{getTotalStableford(scores, player.id, player.handicap) || "–"}</div>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Handicap editor — gatekeepers only (relocated from Bets) */}
      {props.canEditBooks && (
        <div style={S.card}>
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer"}} onClick={function() { setHcEditorOpen(!hcEditorOpen); }}>
            <div style={S.cardTitle}>✏️ Edit Handicaps</div>
            <div style={{fontSize:18, color:CL.muted}}>{hcEditorOpen ? "▾" : "▸"}</div>
          </div>
          {hcEditorOpen && (
            <div style={{marginTop:8}}>
              <div style={Object.assign({}, S.label, {marginBottom:8})}>Update a player's handicap index. Changes apply to all scoring instantly and sync to everyone.</div>
              {players.map(function(p) {
                var editing = hcEditId === p.id;
                return (
                  <div key={p.id} style={Object.assign({display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", fontSize:14}, S.separator)}>
                    <span><span style={{marginRight:8}}>{p.emoji}</span><span style={{fontWeight:600, color:"#fff"}}>{p.name}</span><span style={{color:CL.muted, fontFamily:"system-ui", fontSize:12}}>{" · HCP "+p.handicap}</span>{p.handicapEdited && <span style={{color:"#22c55e", fontFamily:"system-ui", fontSize:10, marginLeft:6}}>✎ edited</span>}</span>
                    {editing ? (
                      <div style={{display:"flex", gap:6, alignItems:"center"}}>
                        <input style={Object.assign({}, S.input, {width:70, margin:0, padding:"6px 8px"})} value={hcVal} onChange={function(e) { setHcVal(e.target.value); }} type="number" step="0.1" autoFocus/>
                        <button style={{background:CL.red, color:"#fff", border:"none", borderRadius:4, padding:"6px 12px", fontSize:12, cursor:"pointer", fontFamily:"system-ui"}} onClick={saveHandicap}>Save</button>
                        <button style={{background:"none", color:CL.muted, border:"1px solid "+CL.border, borderRadius:4, padding:"6px 10px", fontSize:12, cursor:"pointer", fontFamily:"system-ui"}} onClick={function() { setHcEditId(null); setHcVal(""); }}>✕</button>
                      </div>
                    ) : (
                      <button style={{background:"none", border:"none", cursor:"pointer", fontSize:14}} onClick={function() { setHcEditId(p.id); setHcVal(p.handicap.toString()); }}>✏️</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {hole && (function() {
        var curName = (players.find(function(p) { return p.id===hole.playerId; }) || {}).name;
        // After recording a hole (score or clear), jump straight to the next one so a
        // full round is entered without reopening the picker each time. Closes after 18.
        function advance() { if (hole.hole < 17) setHole({playerId:hole.playerId, hole:hole.hole+1}); else setHole(null); }
        function goPrev() { if (hole.hole > 0) setHole({playerId:hole.playerId, hole:hole.hole-1}); }
        function goNext() { if (hole.hole < 17) setHole({playerId:hole.playerId, hole:hole.hole+1}); }
        var filledCount = 0;
        for (var fi=0; fi<18; fi++) { var fv = scores[hole.playerId] && scores[hole.playerId][sel] && scores[hole.playerId][sel][fi]; if (fv != null) filledCount++; }
        return (
        <div style={S.modal} onClick={function() { setHole(null); }}>
          <div style={S.modalBox} onClick={function(e) { e.stopPropagation(); }}>
            {/* Header with prev / next navigation */}
            <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12}}>
              <button onClick={goPrev} style={{background:"none", border:"1px solid "+CL.border, borderRadius:8, color:hole.hole>0?"#fff":CL.border, fontSize:20, fontWeight:700, fontFamily:"system-ui", width:40, height:40, cursor:hole.hole>0?"pointer":"default", lineHeight:1}}>‹</button>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:18, fontWeight:700, color:"#fff"}}>{"Hole "+(hole.hole+1)}</div>
                <div style={{fontSize:13, color:CL.muted, fontFamily:"system-ui"}}>{curName}</div>
              </div>
              <button onClick={goNext} style={{background:"none", border:"1px solid "+CL.border, borderRadius:8, color:hole.hole<17?"#fff":CL.border, fontSize:20, fontWeight:700, fontFamily:"system-ui", width:40, height:40, cursor:hole.hole<17?"pointer":"default", lineHeight:1}}>›</button>
            </div>
            <div style={{display:"flex", justifyContent:"center", gap:16, marginBottom:14}}>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:10, color:CL.muted, fontFamily:"system-ui"}}>PAR</div>
                <div style={{fontSize:20, fontWeight:700, color:CL.red, fontFamily:"system-ui"}}>{course.pars ? course.pars[hole.hole] : "—"}</div>
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:10, color:CL.muted, fontFamily:"system-ui"}}>SI</div>
                <div style={{fontSize:20, fontWeight:700, color:CL.blue, fontFamily:"system-ui"}}>{course.si ? course.si[hole.hole] : "—"}</div>
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:10, color:CL.muted, fontFamily:"system-ui"}}>DONE</div>
                <div style={{fontSize:20, fontWeight:700, color:"#fff", fontFamily:"system-ui"}}>{filledCount+"/18"}</div>
              </div>
            </div>
            <div style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:12}}>
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(function(s) {
                var cur = scores[hole.playerId] && scores[hole.playerId][sel] && scores[hole.playerId][sel][hole.hole];
                var hp = course.pars ? course.pars[hole.hole] : null;
                var isBirdie = hp && s < hp;
                var isBogey = hp && s > hp;
                var isActive = cur === s;
                var btnBg = isActive ? CL.red : isBirdie ? "rgba(34,197,94,0.15)" : isBogey ? "rgba(220,38,38,0.1)" : "rgba(30,58,95,0.3)";
                var btnBorder = isActive ? CL.red : isBirdie ? "rgba(34,197,94,0.3)" : isBogey ? "rgba(220,38,38,0.2)" : CL.border;
                return <button key={s} style={Object.assign({}, S.scoreBtn, {background:btnBg, borderColor:btnBorder, color:"#fff"})} onClick={function() { setScore(hole.playerId, hole.hole, s); advance(); }}>{s}</button>;
              })}
            </div>
            <div style={{display:"flex", gap:8}}>
              <button style={Object.assign({}, S.secondaryBtn, {flex:1, margin:0})} onClick={function() { setScore(hole.playerId, hole.hole, null); advance(); }}>Clear &amp; Next</button>
              <button style={{flex:1, padding:14, borderRadius:8, border:"none", background:CL.red, color:"#fff", fontSize:16, fontWeight:700, fontFamily:"system-ui", cursor:"pointer"}} onClick={function() { setHole(null); }}>Done</button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

// ─── LEADERBOARD ─────────────────────────────────────────────────────
function LeaderboardTab(props) {
  var players = props.players, scores = props.scores, rs = props.rs;
  var vs = useState("individual"); var view = vs[0], setView = vs[1];
  var ns = useState("gross"); var scoreMode = ns[0], setScoreMode = ns[1];

  function getPlayerRoundScore(pid, ri) {
    var p = players.find(function(x) { return x.id === pid; });
    if (!p) return null;
    if (scoreMode === "net") return getNetRoundScore(scores, pid, ri, p.handicap);
    return rs(pid, ri);
  }

  function getPlayerTotal(pid) {
    var p = players.find(function(x) { return x.id === pid; });
    if (!p) return 0;
    if (scoreMode === "net") return getTotalNetScore(scores, pid, p.handicap);
    return getTotalScore(scores, pid);
  }

  function teamRound(ids, ri) {
    var total = 0, count = 0;
    ids.forEach(function(pid) { var r = getPlayerRoundScore(pid, ri); if (r !== null) { total += r; count++; } });
    return count > 0 ? total : null;
  }

  function teamTotal(ids) {
    var t = 0;
    ids.forEach(function(pid) { t += getPlayerTotal(pid); });
    return t;
  }

  var matchup = TEAM_MATCHUPS[0];
  var aIds = resolveTeam(matchup.teamA, players);
  var bIds = resolveTeam(matchup.teamB, players);

  var views = [{id:"individual", label:"Individual"}, {id:"teams", label:matchup.name}, {id:"stableford", label:"🏆 Stableford"}];

  return (
    <div>
      <div style={S.pageHeader}><div style={S.pageTitle}>Leaderboard</div></div>

      {/* Gross / Net toggle */}
      <div style={{display:"flex", gap:4, padding:"0 16px", marginBottom:4}}>
        {[{id:"gross",label:"Gross"},{id:"net",label:"Net"}].map(function(m) {
          return <button key={m.id} onClick={function() { setScoreMode(m.id); }} style={Object.assign({}, S.subTab, scoreMode===m.id ? S.subTabOn : S.subTabOff)}>{m.label}</button>;
        })}
      </div>

      <div style={{display:"flex", gap:4, padding:"0 16px", marginBottom:8}}>
        {views.map(function(v) { return <button key={v.id} onClick={function() { setView(v.id); }} style={Object.assign({}, S.subTab, view===v.id ? S.subTabOn : S.subTabOff)}>{v.label}</button>; })}
      </div>

      {view === "individual" && (function() {
          // ─── Masters-style scoreboard ─────────────────────────────
          var toPar = function(v) { return v === 0 ? "E" : v > 0 ? "+"+v : ""+v; };
          var parClr = function(v) { return v < 0 ? "#f0454a" : v > 0 ? "#6facff" : "#fff"; };
          // Compute each player's per-round differential and total to par
          // Use ALL players — show the shell even with no scores
          var allRows = players.map(function(p) {
            var rounds = []; var totalToPar = 0; var roundsPlayed = 0;
            COURSES.forEach(function(c, ci) {
              var r = getPlayerRoundScore(p.id, ci);
              if (r !== null) { var diff = r - c.par; rounds.push(diff); totalToPar += diff; roundsPlayed++; }
              else { rounds.push(null); }
            });
            return { p:p, rounds:rounds, totalToPar:totalToPar, roundsPlayed:roundsPlayed };
          });
          // Sort: players with scores first (by total), then players without scores
          var rows = allRows.sort(function(a, b) {
            if (a.roundsPlayed > 0 && b.roundsPlayed === 0) return -1;
            if (a.roundsPlayed === 0 && b.roundsPlayed > 0) return 1;
            if (a.roundsPlayed === 0 && b.roundsPlayed === 0) return 0;
            return a.totalToPar - b.totalToPar;
          });
          // Assign positions with ties (T1, T2, etc.) — only for players with scores
          var positions = []; var pos = 1;
          for (var ri2 = 0; ri2 < rows.length; ri2++) {
            if (rows[ri2].roundsPlayed === 0) { positions.push(null); }
            else if (ri2 > 0 && rows[ri2-1].roundsPlayed > 0 && rows[ri2].totalToPar === rows[ri2-1].totalToPar) { positions.push(positions[ri2-1]); }
            else { positions.push(pos); }
            if (rows[ri2].roundsPlayed > 0) pos = ri2 + 2;
          }
          var hasTies = {};
          positions.forEach(function(pp) { if (pp !== null) hasTies[pp] = (hasTies[pp]||0) + 1; });

          var hdrStyle = {fontSize:10, fontWeight:700, color:CL.muted, fontFamily:"system-ui", textTransform:"uppercase", letterSpacing:0.5, padding:"6px 0", textAlign:"center"};
          var cellStyle = {fontSize:14, fontWeight:700, fontFamily:"system-ui", textAlign:"center", padding:"10px 0"};
          var colW = {pos:"32px", name:"1fr", tot:"48px", rnd:"40px"};

          return (
            <div style={{margin:"0 16px"}}>
              {/* Header row */}
              <div style={{display:"grid", gridTemplateColumns:colW.pos+" "+colW.name+" "+colW.tot+" repeat(5,"+colW.rnd+")", borderBottom:"2px solid "+CL.red, marginBottom:0, padding:"0 8px"}}>
                <div style={hdrStyle}>#</div>
                <div style={Object.assign({}, hdrStyle, {textAlign:"left"})}>{scoreMode==="net"?"Player (Net)":"Player"}</div>
                <div style={hdrStyle}>TOT</div>
                {COURSE_LABELS.map(function(cl) { return <div key={cl} style={hdrStyle}>{cl}</div>; })}
              </div>
              {/* Player rows */}
              {rows.map(function(row, idx) {
                var isLeader = idx === 0 && row.roundsPlayed > 0;
                var posLabel = positions[idx] !== null ? (hasTies[positions[idx]] > 1 ? "T" : "") + positions[idx] : "·";
                return (
                  <div key={row.p.id} style={{display:"grid", gridTemplateColumns:colW.pos+" "+colW.name+" "+colW.tot+" repeat(5,"+colW.rnd+")", alignItems:"center", padding:"0 8px", borderBottom:"1px solid "+(isLeader ? "rgba(240,69,74,0.25)" : CL.border), background:isLeader ? "rgba(240,69,74,0.08)" : "transparent"}}>
                    <div style={Object.assign({}, cellStyle, {color:isLeader ? CL.red : CL.muted, fontSize:13})}>{posLabel}</div>
                    <div style={{padding:"10px 0", textAlign:"left", overflow:"hidden"}}>
                      <div style={{fontSize:14, fontWeight:700, color:"#fff", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{row.p.emoji+" "+row.p.name.split(" ")[0]}</div>
                      <div style={{fontSize:10, color:CL.muted, fontFamily:"system-ui"}}>{"HI "+row.p.handicap}</div>
                    </div>
                    <div style={Object.assign({}, cellStyle, {color:row.roundsPlayed > 0 ? parClr(row.totalToPar) : CL.muted, fontSize:16})}>{row.roundsPlayed > 0 ? toPar(row.totalToPar) : "—"}</div>
                    {row.rounds.map(function(diff, ci) {
                      return <div key={ci} style={Object.assign({}, cellStyle, {color:diff !== null ? parClr(diff) : CL.muted, fontSize:13})}>{diff !== null ? toPar(diff) : "·"}</div>;
                    })}
                  </div>
                );
              })}
              {/* Par reference row */}
              <div style={{display:"grid", gridTemplateColumns:colW.pos+" "+colW.name+" "+colW.tot+" repeat(5,"+colW.rnd+")", padding:"4px 8px", borderTop:"1px solid "+CL.border}}>
                <div></div>
                <div style={{fontSize:10, color:CL.muted, fontFamily:"system-ui", padding:"4px 0"}}>PAR</div>
                <div style={{fontSize:11, color:CL.muted, fontFamily:"system-ui", textAlign:"center", fontWeight:700}}>{COURSES.reduce(function(s,c){return s+c.par;},0)}</div>
                {COURSES.map(function(c,ci) { return <div key={ci} style={{fontSize:11, color:CL.muted, fontFamily:"system-ui", textAlign:"center"}}>{c.par}</div>; })}
              </div>
            </div>
          );
        })()
      }

      {view === "teams" && (
        <div>
          {(function() {
            var aT = teamTotal(aIds), bT = teamTotal(bIds), aW = 0, bW = 0;
            COURSES.forEach(function(_,ci) { var a = teamRound(aIds,ci), b = teamRound(bIds,ci); if (a!==null && b!==null) { if (a<b) aW++; else if (b<a) bW++; } });
            var active = aT > 0 || bT > 0;
            return (
              <div style={S.card}>
                <div style={S.cardTitle}>{"Overall Matchup · "+(scoreMode==="net"?"Net":"Gross")}</div>
                <div style={{display:"flex", gap:12, alignItems:"center", justifyContent:"center", padding:"8px 0", position:"relative"}}>
                  {[{team:matchup.teamA, total:aT, wins:aW, best:active&&aT<=bT}, {team:matchup.teamB, total:bT, wins:bW, best:active&&bT<=aT}].map(function(side, si) {
                    return (
                      <div key={si} style={{flex:1, textAlign:"center"}}>
                        <div style={{fontSize:28}}>{side.team.emoji}</div>
                        <div style={{fontSize:14, fontWeight:700, color:"#fff", fontFamily:"system-ui"}}>{side.team.name}</div>
                        <div style={{fontSize:28, fontWeight:700, color:side.best?CL.red:CL.muted, fontFamily:"system-ui", marginTop:4}}>{side.total>0?side.total:"—"}</div>
                        <div style={S.label}>{side.wins+" round"+(side.wins!==1?"s":"")+" won"}</div>
                      </div>
                    );
                  })}
                  <div style={{position:"absolute", left:"50%", transform:"translateX(-50%)", fontSize:16, color:CL.muted, fontWeight:700, fontFamily:"system-ui"}}>vs</div>
                </div>
              </div>
            );
          })()}

          {COURSES.map(function(course, ci) {
            var aS = teamRound(aIds,ci), bS = teamRound(bIds,ci);
            var hasScores = aS!==null || bS!==null;
            var aWon = hasScores && aS!==null && bS!==null && aS<bS;
            var bWon = hasScores && aS!==null && bS!==null && bS<aS;
            return (
              <div key={ci} style={S.card}>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8}}>
                  <div style={S.cardTitle}>{"R"+(ci+1)+" · "+course.name}</div>
                  {hasScores && aS!==null && bS!==null && <div style={{fontSize:11, fontWeight:700, fontFamily:"system-ui", color:CL.red}}>{aS===bS?"TIED":aWon?matchup.teamA.name+" win":matchup.teamB.name+" win"}</div>}
                </div>
                <div style={{display:"flex", gap:8}}>
                  {[{team:matchup.teamA, ids:aIds, score:aS, won:aWon}, {team:matchup.teamB, ids:bIds, score:bS, won:bWon}].map(function(side, si) {
                    return (
                      <div key={si} style={Object.assign({}, S.teamBox, side.won ? S.teamBoxWin : {})}>
                        <div style={Object.assign({}, S.label, {marginBottom:4})}>{side.team.emoji+" "+side.team.name}</div>
                        <div style={{fontSize:20, fontWeight:700, color:side.won?CL.red:"#fff", fontFamily:"system-ui", textAlign:"center"}}>{side.score!==null?side.score:"—"}</div>
                        {side.ids.map(function(pid) {
                          var p = players.find(function(x) { return x.id===pid; });
                          var r = rs(pid,ci);
                          if (!p) return null;
                          return <div key={pid} style={{display:"flex", justifyContent:"space-between", fontSize:11, color:CL.muted, fontFamily:"system-ui", padding:"2px 0"}}><span>{p.name.split(" ")[0]}</span><span style={{color:"#fff", fontWeight:600}}>{r!==null?r:"—"}</span></div>;
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "stableford" && (function() {
        var aTotal = getTeamTotalBestBall(scores, players, aIds);
        var bTotal = getTeamTotalBestBall(scores, players, bIds);
        var aLead = aTotal > bTotal, bLead = bTotal > aTotal;
        // Individual stableford leaderboard
        var indiv = players.map(function(p) {
          return { p:p, pts:getTotalStableford(scores, p.id, p.handicap) };
        }).filter(function(x) { return x.pts !== null; }).sort(function(a,b) { return b.pts - a.pts; });
        var anyScores = indiv.length > 0;
        return (
          <div>
            {/* Team Stableford matchup */}
            <div style={S.card}>
              <div style={S.cardTitle}>🏆 Team Stableford</div>
              <div style={Object.assign({}, S.label, {marginBottom:12})}>Best-ball net Stableford — more is better. Only the team's best ball on each hole counts.</div>
              <div style={{display:"flex", gap:8, alignItems:"stretch"}}>
                <div style={Object.assign({}, S.teamBox, aLead ? S.teamBoxWin : {}, {textAlign:"center"})}>
                  <div style={{fontSize:24, marginBottom:2}}>{matchup.teamA.emoji}</div>
                  <div style={{fontSize:13, fontWeight:700, color:"#fff", fontFamily:"system-ui"}}>{matchup.teamA.name}</div>
                  <div style={{fontSize:30, fontWeight:700, color:aLead?"#22c55e":"#fff", fontFamily:"system-ui", marginTop:4}}>{aTotal}</div>
                  <div style={{fontSize:11, color:CL.muted, fontFamily:"system-ui"}}>points</div>
                </div>
                <div style={{display:"flex", alignItems:"center", color:CL.muted, fontWeight:700, fontFamily:"system-ui", fontSize:14}}>vs</div>
                <div style={Object.assign({}, S.teamBox, bLead ? S.teamBoxWin : {}, {textAlign:"center"})}>
                  <div style={{fontSize:24, marginBottom:2}}>{matchup.teamB.emoji}</div>
                  <div style={{fontSize:13, fontWeight:700, color:"#fff", fontFamily:"system-ui"}}>{matchup.teamB.name}</div>
                  <div style={{fontSize:30, fontWeight:700, color:bLead?"#22c55e":"#fff", fontFamily:"system-ui", marginTop:4}}>{bTotal}</div>
                  <div style={{fontSize:11, color:CL.muted, fontFamily:"system-ui"}}>points</div>
                </div>
              </div>
              {anyScores && <div style={{textAlign:"center", marginTop:12, fontSize:14, fontWeight:600, color:aLead||bLead?"#22c55e":CL.muted, fontFamily:"system-ui"}}>
                {aTotal===bTotal ? "All square" : (aLead?matchup.teamA.name:matchup.teamB.name)+" lead by "+Math.abs(aTotal-bTotal)}
              </div>}
            </div>

            {/* Per-round team breakdown */}
            <div style={S.card}>
              <div style={S.cardTitle}>By Round</div>
              <div style={{display:"flex", padding:"6px 0", borderBottom:"1px solid "+CL.border, marginBottom:4}}>
                <div style={{flex:1, fontSize:12, color:CL.muted, fontFamily:"system-ui", fontWeight:600}}>Course</div>
                <div style={{width:60, textAlign:"center", fontSize:12, color:CL.muted, fontFamily:"system-ui", fontWeight:600}}>{matchup.teamA.emoji}</div>
                <div style={{width:60, textAlign:"center", fontSize:12, color:CL.muted, fontFamily:"system-ui", fontWeight:600}}>{matchup.teamB.emoji}</div>
              </div>
              {COURSES.map(function(c, ri) {
                var a = getTeamRoundBestBall(scores, players, aIds, ri);
                var b = getTeamRoundBestBall(scores, players, bIds, ri);
                if (a === null && b === null) return null;
                var aw = (a||0) > (b||0), bw = (b||0) > (a||0);
                return (
                  <div key={ri} style={{display:"flex", alignItems:"center", padding:"8px 0", borderBottom:ri<COURSES.length-1?"1px solid "+CL.border:"none"}}>
                    <div style={{flex:1, fontSize:13, color:"#fff", fontFamily:"system-ui"}}>{COURSE_LABELS[ri]}</div>
                    <div style={{width:60, textAlign:"center", fontSize:15, fontWeight:700, color:aw?"#22c55e":"#fff", fontFamily:"system-ui"}}>{a===null?"–":a}</div>
                    <div style={{width:60, textAlign:"center", fontSize:15, fontWeight:700, color:bw?"#22c55e":"#fff", fontFamily:"system-ui"}}>{b===null?"–":b}</div>
                  </div>
                );
              })}
            </div>

            {/* Individual Stableford leaderboard */}
            <div style={S.card}>
              <div style={S.cardTitle}>Individual Stableford</div>
              {!anyScores ? <div style={{textAlign:"center", color:CL.muted, padding:16, fontSize:14, fontFamily:"system-ui"}}>No scores yet.</div> :
                indiv.map(function(x, i) {
                  var onA = aIds.indexOf(x.p.id) >= 0;
                  return (
                    <div key={x.p.id} style={Object.assign({display:"flex", alignItems:"center", padding:"10px 0", gap:10}, i<indiv.length-1?S.separator:{}, i===0?{background:"rgba(34,197,94,0.08)", margin:"0 -8px", padding:"10px 8px", borderRadius:6}:{})}>
                      <div style={{width:24, fontSize:14, fontWeight:700, color:i===0?"#22c55e":CL.muted, fontFamily:"system-ui"}}>{i+1}</div>
                      <div style={{fontSize:16}}>{onA?matchup.teamA.emoji:matchup.teamB.emoji}</div>
                      <div style={{flex:1, fontSize:15, color:"#fff", fontFamily:"system-ui"}}>{x.p.name}</div>
                      <div style={{fontSize:17, fontWeight:700, color:"#fff", fontFamily:"system-ui"}}>{x.pts}</div>
                    </div>
                  );
                })
              }
              <div style={{fontSize:11, color:CL.muted, fontFamily:"system-ui", marginTop:8, textAlign:"center"}}>Eagle 4 · Birdie 3 · Par 2 · Bogey 1 · Double+ 0 (net of handicap)</div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── BETS & GAMES ────────────────────────────────────────────────────
// Small inline pill marking whether a score-derived figure is still live
// (updating as scores come in) or final (all relevant rounds posted).
function StatusTag(props) {
  if (props.final) return <span style={{fontSize:9, fontWeight:700, color:"#22c55e", background:"rgba(34,197,94,0.15)", border:"1px solid rgba(34,197,94,0.35)", borderRadius:8, padding:"2px 7px", fontFamily:"system-ui", marginLeft:8, letterSpacing:0.3, verticalAlign:"middle", whiteSpace:"nowrap"}}>✓ FINAL</span>;
  return <span style={{fontSize:9, fontWeight:700, color:"#f59e0b", background:"rgba(245,158,11,0.15)", border:"1px solid rgba(245,158,11,0.35)", borderRadius:8, padding:"2px 7px", fontFamily:"system-ui", marginLeft:8, letterSpacing:0.3, verticalAlign:"middle", whiteSpace:"nowrap"}}>● LIVE</span>;
}
function BetsTab(props) {
  var players = props.players, games = props.games, bets = props.bets;
  var manualWinners = useMemo(function() { return props.manualWinners || { team: null, foursome: {} }; }, [props.manualWinners]);
  var drinks = props.drinks || {};
  // Stabilize defaulted props so the netBalances memo below isn't recomputed
  // every render: a bare `props.x || []` would hand back a fresh array/object
  // each render when the prop is empty, changing identity and defeating the memo.
  var scores = useMemo(function() { return props.scores || {}; }, [props.scores]);
  var h2hBets = useMemo(function() { return props.h2hBets || []; }, [props.h2hBets]);
  var skinsEligible = useMemo(function() { return props.skinsEligible || { gross: [], net: [], course: [[],[],[],[],[]] }; }, [props.skinsEligible]);
  var expenses = useMemo(function() { return props.expenses || []; }, [props.expenses]);
  var teamMatches = props.teamMatches || DEFAULT_TEAM_MATCHES;
  // Backers come from the atomic foursomeBackers map (clobber-proof). Recombine
  // with the static pairings here for both settlement and the UI.
  var foursomeBackers = useMemo(function() { return props.foursomeBackers || {}; }, [props.foursomeBackers]);
  var foursomeMatches = useMemo(function() { return matchesWithBackers(foursomeBackers); }, [foursomeBackers]);
  var overUnderProps = useMemo(function() { return props.overUnderProps || DEFAULT_OU_PROPS; }, [props.overUnderProps]);
  var individualProps = props.individualProps || DEFAULT_INDIVIDUAL_PROPS;
  var addingGame = props.addingGame, update = props.update, resetAll = props.resetAll;
  // Carl-only manual winner overrides (write the synced manualWinners field).
  function setFoursomeWinner(matchId, val) {
    if (!props.canEdit) return;
    var mw = manualWinners || { team:null, foursome:{} };
    var fo = Object.assign({}, mw.foursome || {});
    if (val) fo[matchId] = val; else delete fo[matchId];
    update({ manualWinners: Object.assign({}, mw, { foursome: fo }) });
  }
  function setTeamWinner(val) {
    if (!props.canEdit) return;
    var mw = manualWinners || { team:null, foursome:{} };
    update({ manualWinners: Object.assign({}, mw, { team: val }) });
  }

  // Whole-trip completion: score-derived money (Team & Individual Stableford, the
  // trip-total skins) is final once every player has all 18 holes on all 5 rounds.
  var allIds = players.map(function(p) { return p.id; });
  var tripDone = tripComplete(scores, allIds);

  var ts = useState("team"); var tab = ts[0], setTab = ts[1];
  var gts = useState("skins"); var gameType = gts[0], setGameType = gts[1];
  var sks = useState("5"); var stake = sks[0], setStake = sks[1];
  var rds = useState(0); var round = rds[0], setRound = rds[1];
  var res = useState({}); var results = res[0], setResults = res[1];
  // Which foursome matches have their hole-by-hole best-ball breakdown expanded (matchId -> true).
  var mhb = useState({}); var matchDetail = mhb[0], setMatchDetail = mhb[1];
  var nsAst = useState([]); var nsA = nsAst[0], setNsA = nsAst[1];
  var nsBst = useState([]); var nsB = nsBst[0], setNsB = nsBst[1];
  var nsFst = useState("10"); var nsFront = nsFst[0], setNsFront = nsFst[1];
  var nsBkst = useState("10"); var nsBack = nsBkst[0], setNsBack = nsBkst[1];
  var nsTst = useState("20"); var nsTotal = nsTst[0], setNsTotal = nsTst[1];
  // H2H bet creation
  var h2hDesc = useState(""); var h2hText = h2hDesc[0], setH2hText = h2hDesc[1];
  var h2hStake = useState(""); var h2hAmt = h2hStake[0], setH2hAmt = h2hStake[1];
  var h2hP1 = useState(null); var bettor = h2hP1[0], setBettor = h2hP1[1];
  var h2hP2 = useState(null); var opponent = h2hP2[0], setOpponent = h2hP2[1];
  var h2hCrs = useState(""); var h2hCourse = h2hCrs[0], setH2hCourse = h2hCrs[1];
  var cpName = useState(""); var customPropName = cpName[0], setCustomPropName = cpName[1];
  var cpBuyin = useState("25"); var customPropBuyin = cpBuyin[0], setCustomPropBuyin = cpBuyin[1];
  var cpAdding = useState(false); var addingProp = cpAdding[0], setAddingProp = cpAdding[1];
  var ouNm = useState(""); var ouName = ouNm[0], setOuName = ouNm[1];
  var ouLn = useState(""); var ouLine = ouLn[0], setOuLine = ouLn[1];
  var ouSt = useState("20"); var ouStake = ouSt[0], setOuStake = ouSt[1];
  var ouAdd = useState(false); var addingOu = ouAdd[0], setAddingOu = ouAdd[1];
  // Player management
  var pns = useState(""); var pName = pns[0], setPName = pns[1];
  var phs = useState(""); var pHcp = phs[0], setPHcp = phs[1];
  var pes = useState("🔴"); var pEmoji = pes[0], setPEmoji = pes[1];
  var eis = useState(null); var editId = eis[0], setEditId = eis[1];

  // One source of truth — identical math to the Settle Up transfers, rounded to
  // whole dollars the same conserving way so both screens always agree. Memoized
  // so the full bet/skins computation runs once per data change instead of once
  // per player on every render (the Bets tab renders this for all 8 players).
  var netBalances = useMemo(function() {
    return roundBalances(
      computeBalances(players, games, bets, h2hBets, teamMatches, individualProps, expenses, scores, skinsEligible, foursomeMatches, overUnderProps, manualWinners),
      players
    );
  }, [players, games, bets, h2hBets, teamMatches, individualProps, expenses, scores, skinsEligible, foursomeMatches, overUnderProps, manualWinners]);

  // All-bets net EXCLUDING expenses — same engine as Settle Up, expenses zeroed.
  var betsAll = useMemo(function() {
    return computeBalances(players, games, bets, h2hBets, teamMatches, individualProps, [], scores, skinsEligible, foursomeMatches, overUnderProps, manualWinners);
  }, [players, games, bets, h2hBets, teamMatches, individualProps, scores, skinsEligible, foursomeMatches, overUnderProps, manualWinners]);

  // Net for ONE section = (all bets) − (all bets with that section removed). The
  // always-on score competitions cancel in the subtraction, leaving exactly that
  // section's contribution. Guarantees these summaries can never disagree with the
  // real settlement engine. `remove`: "props" | "h2h" | "games".
  function sectionNet(remove) {
    var ip = remove === "props" ? [] : individualProps;
    var ou = remove === "props" ? [] : overUnderProps;
    var hh = remove === "h2h" ? [] : h2hBets;
    var gm = remove === "games" ? [] : games;
    var without = computeBalances(players, gm, bets, hh, teamMatches, ip, [], scores, skinsEligible, foursomeMatches, ou, manualWinners);
    var out = {};
    players.forEach(function(p) { out[p.id] = (betsAll[p.id] || 0) - (without[p.id] || 0); });
    return out;
  }
  function netMoney(pid) {
    return netBalances[pid] || 0;
  }

  function totalDrinks(pid) { var d = drinks[pid]; if (!d) return 0; return (d.pints||0)+(d.whiskey||0)+(d.wine||0)+(d.other||0); }

  function addDrink(pid, type) {
    var nd = JSON.parse(JSON.stringify(drinks));
    if (!nd[pid]) nd[pid] = {pints:0, whiskey:0, wine:0, other:0};
    nd[pid][type] = (nd[pid][type]||0) + 1;
    update({drinks:nd});
  }
  function removeDrink(pid, type) {
    var nd = JSON.parse(JSON.stringify(drinks));
    if (!nd[pid] || !nd[pid][type]) return;
    nd[pid][type] = Math.max(0, nd[pid][type] - 1);
    update({drinks:nd});
  }

  function addGame() {
    if (gameType === "nassau") {
      if (nsA.length === 0 || nsB.length === 0) return;
      update({games:games.concat([{id:Date.now().toString(), type:"nassau", round:round, sideA:nsA.slice(), sideB:nsB.slice(), frontVal:parseFloat(nsFront)||0, backVal:parseFloat(nsBack)||0, totalVal:parseFloat(nsTotal)||0, ts:new Date().toISOString()}]), addingGame:false});
      setNsA([]); setNsB([]); setNsFront("10"); setNsBack("10"); setNsTotal("20");
      return;
    }
    update({games:games.concat([{id:Date.now().toString(), type:gameType, stake:parseFloat(stake)||0, round:round, results:Object.assign({},results), ts:new Date().toISOString()}]), addingGame:false});
    setResults({});
  }

  // Player add/edit lives in ScoresTab now; this BetsTab copy is unused but kept
  // (underscore-prefixed) so lint passes without orphaning the editor state above.
  function _savePlayer() {
    if (!pName.trim()) return;
    if (editId) {
      update({players:players.map(function(p) {
        if (p.id !== editId) return p;
        var newHcp = parseFloat(pHcp);
        if (isNaN(newHcp)) newHcp = p.handicap;
        // Mark as manually edited if the handicap changed, so the code force-sync
        // won't overwrite it on the next load.
        var edited = p.handicapEdited || newHcp !== p.handicap;
        return Object.assign({}, p, {name:pName, handicap:newHcp, emoji:pEmoji, handicapEdited:edited});
      })});
    } else {
      var nid = "p"+Date.now();
      var newPlayer = {id:nid, name:pName, handicap:parseFloat(pHcp)||0, emoji:pEmoji, handicapEdited:true};
      // Initialize empty score arrays for the new player
      var updatedScores = JSON.parse(JSON.stringify(props.scores || {}));
      updatedScores[nid] = {};
      COURSES.forEach(function(_, i) { updatedScores[nid][i] = Array(18).fill(null); });
      update({players:players.concat([newPlayer]), scores:updatedScores});
    }
    setPName(""); setPHcp(""); setPEmoji("🔴"); setEditId(null);
  }

  var subTabs = [{id:"team",label:"🏆 Team"},{id:"ind",label:"⛳ Ind"},{id:"skins",label:"🔪 Skins"},{id:"props",label:"🎯 Props"},{id:"h2h",label:"🤝 H2H"},{id:"games",label:"Games"},{id:"settle",label:"💸 Settle"},{id:"drinks",label:"🍺"}].filter(function(t){ return (t.id!=="skins"||SHOW_SKINS) && (t.id!=="ind"||SHOW_GROSS); });
  var rulesUI = useState(false); var rulesOpen = rulesUI[0], setRulesOpen = rulesUI[1];

  return (
    <div>
      <div style={S.pageHeader}><div style={S.pageTitle}>Bets & Games</div></div>
      {props.isGuest && <div style={{margin:"0 16px 8px", padding:"8px 12px", background:"rgba(111,172,255,0.1)", border:"1px solid "+CL.border, borderRadius:8, fontSize:12, color:CL.muted, fontFamily:"system-ui"}}>👁️ You're viewing as a guest. Only Carl can place and settle bets.</div>}
      {!props.isGuest && !props.canEdit && <div style={{margin:"0 16px 8px", padding:"8px 12px", background:"rgba(111,172,255,0.1)", border:"1px solid "+CL.border, borderRadius:8, fontSize:12, color:CL.muted, fontFamily:"system-ui"}}>👁️ Bets are view-only — only Carl can place or change bets.</div>}

      {/* Collapsible "How the Bets Work" reference card — teams & brackets pulled live
          so it stays accurate if a handicap is edited. Collapsed by default. */}
      {(function() {
        var firstName = function(id) { var p = players.find(function(x){ return x.id===id; }); return p ? p.name.split(" ")[0] : id; };
        var tm = TEAM_MATCHUPS[0];
        var pub = (tm.teamA.names || []).map(function(n){ return n.split(" ")[0]; }).join(", ");
        var priv = (tm.teamB.names || []).map(function(n){ return n.split(" ")[0]; }).join(", ");
        var br = getGrossBrackets(players);
        var mournes = (br.a || []).map(firstName).join(", ");
        var causeway = (br.b || []).map(firstName).join(", ");
        var H = function(txt) { return <div style={{fontSize:11, fontWeight:700, letterSpacing:0.5, color:CL.muted, fontFamily:"system-ui", margin:"12px 0 6px"}}>{txt}</div>; };
        var Row = function(title, stake, detail) {
          return (
            <div style={{marginBottom:9}}>
              <div style={{fontSize:13.5, color:"#fff", fontFamily:"system-ui"}}><span style={{fontWeight:700}}>{title}</span><span style={{color:CL.red, fontWeight:700}}>{stake ? "  ·  "+stake : ""}</span></div>
              <div style={{fontSize:12, color:CL.muted, fontFamily:"system-ui", marginTop:1, lineHeight:1.35}}>{detail}</div>
            </div>
          );
        };
        return (
          <div style={Object.assign({}, S.card, {marginBottom:8})}>
            <div onClick={function(){ setRulesOpen(!rulesOpen); }} style={{display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer"}}>
              <div style={S.cardTitle}>📖 How the Bets Work</div>
              <div style={{color:CL.muted, fontSize:13, fontFamily:"system-ui"}}>{rulesOpen ? "Hide ▾" : "Tap to read ▸"}</div>
            </div>
            {rulesOpen && (
              <div style={{marginTop:4}}>
                {H("🤖 AUTOMATIC — YOU'RE ALREADY IN, SCORED BY THE APP")}
                {Row("Team Stableford", "$100/man", "Public ("+pub+") vs Private ("+priv+"). Best-ball net Stableford over all 5 rounds (best ball each hole) — the winning four each collect $100.")}
                {SHOW_GROSS && Row("Gross Brackets", "$50/man, winner-take-all", "Gross Stableford for the whole trip, split by handicap.  ⛰️ The Mournes: "+mournes+".  🌊 The Causeway: "+causeway+".")}
                {Row("Foursome Matches", "$"+STAKE_FOURSOME+"/man", "Two 2-v-2 matches each course, best ball (only the best ball on each hole counts). Ardglass is total net Stableford; RCD onward is match play (win the most holes). You're auto-entered in your own match every round.")}
                {H("✋ OPT IN — TAP TO JOIN (in the tabs above)")}
                {SHOW_SKINS && Row("Skins", "$"+STAKE_SKIN+"/skin, net", "Five per-course games plus trip-long gross & net pots. Join whichever you want on the 🔪 Skins tab.")}
                {Row("Individual Props", "$"+DEFAULT_BUYIN+" each, winner-take-all", "Most Net Stableford (whole trip + each of the 5 courses) and Lowest Net Score (trip). Pick your spots on the 🎯 Props tab.")}
                {Row("Back a Foursome", "$"+STAKE_FOURSOME, "Want action on the other group's match? Tap a side on the 🏆 Team tab — anyone can.")}
                {H("💬 ANYTIME")}
                {Row("Head-to-Head", "any stake", "Make a side bet with anyone on the 🤝 H2H tab. Create it and others can jump in. Losers pay winners, split evenly.")}
                <div style={{marginTop:12, padding:"8px 10px", background:"rgba(34,197,94,0.08)", border:"1px solid "+CL.border, borderRadius:8, fontSize:12, color:CL.muted, fontFamily:"system-ui", lineHeight:1.4}}>💰 Everything settles automatically and always balances to zero. Check the 💸 Settle tab anytime to see who owes who.</div>
              </div>
            )}
          </div>
        );
      })()}

      <div style={{display:"flex", gap:4, padding:"0 16px", marginBottom:8}}>
        {subTabs.map(function(t) { return <button key={t.id} onClick={function() { setTab(t.id); }} style={Object.assign({}, S.subTab, tab===t.id ? S.subTabOn : S.subTabOff)}>{t.label}</button>; })}
      </div>

      {/* Section-scoped net summary — Props/H2H/Games show only that section; Settle
          shows all bets. Every figure comes from the same engine as Settle Up. */}
      {(tab === "props" || tab === "h2h" || tab === "games" || tab === "settle") && (function() {
        var map = tab === "settle" ? betsAll : sectionNet(tab === "props" ? "props" : tab === "h2h" ? "h2h" : "games");
        var title = tab === "props" ? "🎯 Props — Net" : tab === "h2h" ? "🤝 Head-to-Head — Net" : tab === "games" ? "🎲 Games — Net" : "💰 All Bets — Net";
        var sub = tab === "settle" ? "Across every bet (excludes shared expenses — see transfers below)" : "This section only · live from the scorecard where applicable";
        var sorted = players.map(function(p) { return { p:p, net: map[p.id] || 0 }; }).sort(function(a,b) { return b.net - a.net; });
        var anyMoney = sorted.some(function(r) { return Math.abs(r.net) > 0.005; });
        return (
          <div style={S.card}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:2}}>
              <div style={S.cardTitle}>{title}</div>
            </div>
            <div style={Object.assign({}, S.label, {marginBottom:8})}>{sub}</div>
            {!anyMoney ? (
              <div style={{fontSize:14, color:CL.muted, fontFamily:"system-ui", textAlign:"center", padding:8}}>Nothing settled here yet. Updates as results come in.</div>
            ) : sorted.map(function(row, i) {
              var p = row.p, net = row.net;
              var color = net > 0.005 ? "#22c55e" : net < -0.005 ? CL.red : CL.muted;
              return (
                <div key={p.id} style={Object.assign({display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0"}, i < sorted.length-1 ? S.separator : {})}>
                  <div style={{fontSize:15, color:"#fff", fontFamily:"system-ui"}}>{p.emoji+" "+p.name}</div>
                  <div style={{fontSize:16, fontWeight:700, color:color, fontFamily:"system-ui"}}>{net > -0.005 && net < 0.005 ? "Even" : (net >= 0 ? "+$" : "-$")+Math.abs(net).toFixed(2)}</div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {tab === "team" && (function() {
        var matchup = TEAM_MATCHUPS[0];
        var aIds = resolveTeam(matchup.teamA, players);
        var bIds = resolveTeam(matchup.teamB, players);
        var aTotal = getTeamTotalBestBall(scores, players, aIds);
        var bTotal = getTeamTotalBestBall(scores, players, bIds);
        var tOv = manualWinners.team; // "a" | "b" | null (Carl override)
        var aLead = tOv ? tOv === "a" : aTotal > bTotal, bLead = tOv ? tOv === "b" : bTotal > aTotal;
        var indiv = players.map(function(p) {
          return { p:p, pts:getTotalStableford(scores, p.id, p.handicap) };
        }).filter(function(x) { return x.pts !== null; });
        var anyScores = indiv.length > 0;
        return (
          <div>
            {/* Team Stableford matchup — the main event */}
            <div style={S.card}>
              <div style={S.cardTitle}>🏆 Team Stableford — The Main Event<StatusTag final={tripDone} /></div>
              <div style={Object.assign({}, S.label, {marginBottom:4})}>Overall team competition. Best-ball net Stableford across all 5 rounds — on each hole only the team's single best ball counts. More points wins.</div>
              <div style={{fontSize:12, color:CL.red, fontFamily:"system-ui", marginBottom:12, fontWeight:600}}>{"$"+STAKE_TEAM+"/man · Winning team's players each win $"+STAKE_TEAM}</div>
              <div style={{display:"flex", gap:8, alignItems:"stretch"}}>
                <div style={Object.assign({}, S.teamBox, aLead ? S.teamBoxWin : {}, {textAlign:"center"})}>
                  <div style={{fontSize:24, marginBottom:2}}>{matchup.teamA.emoji}</div>
                  <div style={{fontSize:13, fontWeight:700, color:"#fff", fontFamily:"system-ui"}}>{matchup.teamA.name}</div>
                  <div style={{fontSize:34, fontWeight:700, color:aLead?"#22c55e":"#fff", fontFamily:"system-ui", marginTop:4}}>{aTotal}</div>
                  <div style={{fontSize:11, color:CL.muted, fontFamily:"system-ui"}}>points</div>
                </div>
                <div style={{display:"flex", alignItems:"center", color:CL.muted, fontWeight:700, fontFamily:"system-ui", fontSize:14}}>vs</div>
                <div style={Object.assign({}, S.teamBox, bLead ? S.teamBoxWin : {}, {textAlign:"center"})}>
                  <div style={{fontSize:24, marginBottom:2}}>{matchup.teamB.emoji}</div>
                  <div style={{fontSize:13, fontWeight:700, color:"#fff", fontFamily:"system-ui"}}>{matchup.teamB.name}</div>
                  <div style={{fontSize:34, fontWeight:700, color:bLead?"#22c55e":"#fff", fontFamily:"system-ui", marginTop:4}}>{bTotal}</div>
                  <div style={{fontSize:11, color:CL.muted, fontFamily:"system-ui"}}>points</div>
                </div>
              </div>
              {anyScores && <div style={{textAlign:"center", marginTop:12, fontSize:15, fontWeight:700, color:(aLead||bLead)?"#22c55e":CL.muted, fontFamily:"system-ui"}}>
                {tOv==="push" ? "Push — no money moves" : (aTotal===bTotal ? "All square" : (aLead?matchup.teamA.name:matchup.teamB.name)+" lead by "+Math.abs(aTotal-bTotal))}
              </div>}
              {!anyScores && <div style={{textAlign:"center", marginTop:12, fontSize:13, color:CL.muted, fontFamily:"system-ui"}}>Enter scores to start the competition.</div>}
              {tOv && <div style={{textAlign:"center", marginTop:6, fontSize:10, color:"#e879c9", fontFamily:"system-ui"}}>{tOv==="push" ? "Set to a push manually" : "Winner set manually — overrides points"}</div>}
              {props.canEdit && (
                <div style={{marginTop:10, display:"flex", gap:6, alignItems:"center", flexWrap:"wrap", justifyContent:"center"}}>
                  <span style={{fontSize:10, color:CL.muted, fontFamily:"system-ui"}}>Set winner:</span>
                  <button onClick={function(){ setTeamWinner(tOv==="a"?null:"a"); }} style={Object.assign({},S.pillBtn,{fontSize:11,padding:"4px 10px"}, tOv==="a"?{borderColor:"#22c55e",color:"#22c55e"}:{})}>{matchup.teamA.name}</button>
                  <button onClick={function(){ setTeamWinner(tOv==="b"?null:"b"); }} style={Object.assign({},S.pillBtn,{fontSize:11,padding:"4px 10px"}, tOv==="b"?{borderColor:"#22c55e",color:"#22c55e"}:{})}>{matchup.teamB.name}</button>
                  <button onClick={function(){ setTeamWinner(tOv==="push"?null:"push"); }} style={Object.assign({},S.pillBtn,{fontSize:11,padding:"4px 10px"}, tOv==="push"?{borderColor:CL.muted,color:"#fff",background:"rgba(255,255,255,0.08)"}:{})}>Push</button>
                  {tOv && <button onClick={function(){ setTeamWinner(null); }} style={{fontSize:10,color:CL.muted,fontFamily:"system-ui",background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>↩ Auto</button>}
                </div>
              )}
            </div>

            {/* Per-round team breakdown */}
            <div style={S.card}>
              <div style={S.cardTitle}>By Round</div>
              <div style={{display:"flex", padding:"6px 0", borderBottom:"1px solid "+CL.border, marginBottom:4}}>
                <div style={{flex:1, fontSize:12, color:CL.muted, fontFamily:"system-ui", fontWeight:600}}>Course</div>
                <div style={{width:60, textAlign:"center", fontSize:12, color:CL.muted, fontFamily:"system-ui", fontWeight:600}}>{matchup.teamA.emoji}</div>
                <div style={{width:60, textAlign:"center", fontSize:12, color:CL.muted, fontFamily:"system-ui", fontWeight:600}}>{matchup.teamB.emoji}</div>
              </div>
              {COURSES.map(function(c, ri) {
                var a = getTeamRoundBestBall(scores, players, aIds, ri);
                var b = getTeamRoundBestBall(scores, players, bIds, ri);
                if (a === null && b === null) {
                  return (
                    <div key={ri} style={{display:"flex", alignItems:"center", padding:"8px 0", borderBottom:ri<COURSES.length-1?"1px solid "+CL.border:"none", opacity:0.5}}>
                      <div style={{flex:1, fontSize:13, color:CL.muted, fontFamily:"system-ui"}}>{COURSE_LABELS[ri]}</div>
                      <div style={{width:60, textAlign:"center", fontSize:15, color:CL.muted, fontFamily:"system-ui"}}>–</div>
                      <div style={{width:60, textAlign:"center", fontSize:15, color:CL.muted, fontFamily:"system-ui"}}>–</div>
                    </div>
                  );
                }
                var aw = (a||0) > (b||0), bw = (b||0) > (a||0);
                return (
                  <div key={ri} style={{display:"flex", alignItems:"center", padding:"8px 0", borderBottom:ri<COURSES.length-1?"1px solid "+CL.border:"none"}}>
                    <div style={{flex:1, fontSize:13, color:"#fff", fontFamily:"system-ui"}}>{COURSE_LABELS[ri]}</div>
                    <div style={{width:60, textAlign:"center", fontSize:15, fontWeight:700, color:aw?"#22c55e":"#fff", fontFamily:"system-ui"}}>{a===null?"–":a}</div>
                    <div style={{width:60, textAlign:"center", fontSize:15, fontWeight:700, color:bw?"#22c55e":"#fff", fontFamily:"system-ui"}}>{b===null?"–":b}</div>
                  </div>
                );
              })}
            </div>

            {/* Foursome Stableford matches — two 2-v-2 matches per course */}
            {(function() {
              function fName(pid) { var p = players.find(function(x){return x.id===pid;}); return p ? p.emoji+" "+p.name.split(" ")[0] : pid; }
              function pairLive(ids, ri) {
                // Best-ball net Stableford per hole — only the pair's single best ball counts
                // on each hole (the low net score, scored Stableford), not both partners added
                // together. Same engine the settlement uses, so the card matches the money.
                return getTeamRoundBestBall(scores, players, ids, ri);
              }
              // Backers are written ATOMICALLY to their own map (clobber-proof) and
              // mirrored into local state for an instant UI response. We deliberately
              // do NOT route this through the full-document save, so a concurrent save
              // from another phone can never wipe a bet. `props.onBack` performs the
              // optimistic local update; saveFoursomeBack does the durable atomic write.
              function backSide(matchId, pid, side) {
                if (!props.canEdit) return; // guests can't edit bets (defense-in-depth; also render-gated)
                var m = foursomeMatches.find(function(x){ return x.id===matchId; });
                if (m && (m.pairA.indexOf(pid)>=0 || m.pairB.indexOf(pid)>=0)) return; // core player can't back
                props.onBack(matchId, pid, side);        // optimistic local state
                saveFoursomeBack(matchId, pid, side);     // durable atomic write
              }
              function unback(matchId, pid) {
                props.onUnback(matchId, pid);
                saveFoursomeUnback(matchId, pid);
              }
              return (
                <div style={S.card}>
                  <div style={S.cardTitle}>👥 Foursome Matches</div>
                  <div style={Object.assign({}, S.label, {marginBottom:4})}>Two 2-v-2 best-ball matches per course (only the best ball on each hole counts). Ardglass is total net Stableford — higher total wins. RCD onward is match play — each hole won/lost/halved, most holes won wins (all square pushes). Resolves automatically from scores.</div>
                  <div style={{fontSize:12, color:CL.red, fontFamily:"system-ui", marginBottom:10, fontWeight:600}}>{"$"+STAKE_FOURSOME+"/man · open pool — anyone can back a side; the losing side pays the winners, split evenly"}</div>
                  {COURSES.map(function(c, ri) {
                    var ms = foursomeMatches.filter(function(m){return m.courseIdx===ri;});
                    if (ms.length === 0) return null;
                    return (
                      <div key={ri} style={{marginBottom:14}}>
                        <div style={{fontSize:12, fontWeight:700, color:CL.muted, fontFamily:"system-ui", letterSpacing:0.5, marginBottom:6}}>{COURSE_LABELS[ri]+" · "+c.name}</div>
                        {ms.map(function(m, mi) {
                          var core = m.pairA.concat(m.pairB);
                          var roundFinal = roundComplete(scores, ri, core);
                          var isMP = foursomeIsMatchPlay(ri);
                          var mpRes = isMP ? foursomeMatchPlay(scores, players, m.pairA, m.pairB, ri) : null;
                          var aPts = pairLive(m.pairA, ri), bPts = pairLive(m.pairB, ri); // Stableford points (Ardglass)
                          var aHoles = mpRes ? mpRes.aHoles : 0, bHoles = mpRes ? mpRes.bHoles : 0;
                          var fOv = (manualWinners.foursome || {})[m.id]; // "A" | "B" | "push" | undefined (Carl override)
                          var isPush = fOv === "push";
                          var started = !!fOv || (isMP ? !!(mpRes && (aHoles + bHoles + mpRes.halved) > 0) : (aPts !== null || bPts !== null));
                          var decided = fOv ? !isPush : (isMP ? (roundFinal && mpRes && aHoles !== bHoles)
                                             : (roundFinal && aPts !== null && bPts !== null && aPts !== bPts));
                          var aWin = fOv ? fOv === "A" : (decided && (isMP ? aHoles > bHoles : aPts > bPts));
                          var bWin = fOv ? fOv === "B" : (decided && (isMP ? bHoles > aHoles : bPts > aPts));
                          var bckA = (m.backersA||[]).filter(function(id){ return core.indexOf(id)<0 && (m.backersB||[]).indexOf(id)<0; });
                          var bckB = (m.backersB||[]).filter(function(id){ return core.indexOf(id)<0 && (m.backersA||[]).indexOf(id)<0; });
                          var winCore = aWin ? m.pairA : m.pairB, loseCore = aWin ? m.pairB : m.pairA;
                          var coreWinEach = decided && winCore.length>0 ? (m.stake * loseCore.length) / winCore.length : 0;
                          var winBck = aWin ? bckA : bckB, loseBck = aWin ? bckB : bckA;
                          var bckVoid = decided && (bckA.length===0 || bckB.length===0);
                          var bckWinEach = decided && winBck.length>0 && loseBck.length>0 ? (m.stake * loseBck.length) / winBck.length : 0;
                          var backed = bckA.concat(bckB);
                          var canBack = players.filter(function(p){ return core.indexOf(p.id)<0 && backed.indexOf(p.id)<0; });
                          function sideBox(pairIds, isWin) {
                            var isA = pairIds === m.pairA;
                            var hw = isA ? aHoles : bHoles;
                            var sub = isMP ? (hw + " hole" + (hw===1?"":"s") + " won") : ((pairLive(pairIds, ri)===null?"–":pairLive(pairIds, ri)) + " pts");
                            return (
                              <div style={Object.assign({}, S.teamBox, isWin ? S.teamBoxWin : {}, {flex:1})}>
                                {pairIds.map(function(pid){ return <div key={pid} style={{fontSize:13, color:"#fff", fontFamily:"system-ui"}}>{fName(pid)}</div>; })}
                                <div style={{fontSize:11, color:CL.muted, fontFamily:"system-ui", marginTop:6}}>{pairIds.length+" in · "+sub}</div>
                              </div>
                            );
                          }
                          function bckChip(pid, color, label) {
                            return (
                              <span key={pid} style={{display:"inline-flex", alignItems:"center", gap:4, fontSize:12, color:"#fff", fontFamily:"system-ui", background:"rgba(255,255,255,0.06)", borderRadius:6, padding:"3px 8px", marginRight:6, marginBottom:4}}>
                                <span style={{color:color, fontWeight:700}}>{label}</span><span>{fName(pid)}</span>
                                {!roundFinal && props.canEdit && <button onClick={function(){unback(m.id, pid);}} style={{background:"none", border:"none", color:CL.muted, cursor:"pointer", fontSize:11, padding:0}}>✕</button>}
                              </span>
                            );
                          }
                          return (
                            <div key={m.id} style={{padding:"10px 0", borderTop:mi>0?"1px solid "+CL.border:"none"}}>
                              <div style={{fontSize:11, color:CL.muted, fontFamily:"system-ui", marginBottom:6}}>{"Match "+(mi+1)}</div>
                              <div style={{display:"flex", gap:8, alignItems:"stretch"}}>
                                {sideBox(m.pairA, aWin)}
                                <div style={{display:"flex", alignItems:"center", color:CL.muted, fontWeight:700, fontFamily:"system-ui", fontSize:13}}>vs</div>
                                {sideBox(m.pairB, bWin)}
                              </div>
                              {isPush ? (
                                <div style={{textAlign:"center", marginTop:8, fontSize:13, fontWeight:700, color:CL.muted, fontFamily:"system-ui"}}>Push — no money moves</div>
                              ) : decided ? (
                                <div style={{textAlign:"center", marginTop:8, fontSize:13, fontWeight:700, color:"#22c55e", fontFamily:"system-ui"}}>{"🏆 "+fName(aWin?m.pairA[0]:m.pairB[0]).split(" ")[1]+" & "+fName(aWin?m.pairA[1]:m.pairB[1]).split(" ")[1]+" win"+(isMP ? " · "+Math.max(aHoles,bHoles)+"–"+Math.min(aHoles,bHoles)+" holes" : "")+" · each winner +$"+(Math.round(coreWinEach*100)/100)}</div>
                              ) : roundFinal ? (
                                <div style={{textAlign:"center", marginTop:8, fontSize:12, color:CL.muted, fontFamily:"system-ui"}}>All square — no money moves</div>
                              ) : started ? (
                                <div style={{textAlign:"center", marginTop:8, fontSize:12, color:CL.muted, fontFamily:"system-ui"}}>{"Live — "+(isMP
                                  ? (aHoles===bHoles ? "all square" : (aHoles>bHoles?"Side A":"Side B")+" "+Math.abs(aHoles-bHoles)+" up")
                                  : ((aPts||0)===(bPts||0)?"all square":((aPts||0)>(bPts||0)?"Side A":"Side B")+" up "+Math.abs((aPts||0)-(bPts||0))))}</div>
                              ) : (
                                <div style={{textAlign:"center", marginTop:8, fontSize:12, color:CL.muted, fontFamily:"system-ui"}}>Not started</div>
                              )}
                              {fOv && <div style={{textAlign:"center", marginTop:4, fontSize:10, color:"#e879c9", fontFamily:"system-ui"}}>{isPush ? "Set to a push manually" : "Winner set manually — overrides scores"}</div>}
                              {props.canEdit && (
                                <div style={{marginTop:8, display:"flex", gap:6, alignItems:"center", flexWrap:"wrap", justifyContent:"center"}}>
                                  <span style={{fontSize:10, color:CL.muted, fontFamily:"system-ui"}}>Set winner:</span>
                                  <button onClick={function(){ setFoursomeWinner(m.id, fOv==="A"?null:"A"); }} style={Object.assign({},S.pillBtn,{fontSize:11,padding:"4px 9px"}, fOv==="A"?{borderColor:"#22c55e",color:"#22c55e"}:{})}>{fName(m.pairA[0]).split(" ")[0]+" & "+fName(m.pairA[1]).split(" ")[0]}</button>
                                  <button onClick={function(){ setFoursomeWinner(m.id, fOv==="B"?null:"B"); }} style={Object.assign({},S.pillBtn,{fontSize:11,padding:"4px 9px"}, fOv==="B"?{borderColor:"#22c55e",color:"#22c55e"}:{})}>{fName(m.pairB[0]).split(" ")[0]+" & "+fName(m.pairB[1]).split(" ")[0]}</button>
                                  <button onClick={function(){ setFoursomeWinner(m.id, fOv==="push"?null:"push"); }} style={Object.assign({},S.pillBtn,{fontSize:11,padding:"4px 9px"}, isPush?{borderColor:CL.muted,color:"#fff",background:"rgba(255,255,255,0.08)"}:{})}>Push</button>
                                  {fOv && <button onClick={function(){ setFoursomeWinner(m.id, null); }} style={{fontSize:10,color:CL.muted,fontFamily:"system-ui",background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>↩ Auto</button>}
                                </div>
                              )}

                              {started && (
                                <button onClick={function(){ setMatchDetail(function(prev){ var n=Object.assign({},prev); if(n[m.id]) delete n[m.id]; else n[m.id]=true; return n; }); }} style={{marginTop:8, fontSize:11, color:CL.blue, fontFamily:"system-ui", background:"none", border:"1px solid "+CL.border, borderRadius:6, padding:"5px 10px", cursor:"pointer"}}>{matchDetail[m.id] ? "\u25be Hide hole-by-hole" : "\u25b8 Hole-by-hole best ball"}</button>
                              )}
                              {matchDetail[m.id] && (function() {
                                var course = COURSES[ri];
                                if (foursomeIsMatchPlay(ri)) {
                                  var mp2 = foursomeMatchPlay(scores, players, m.pairA, m.pairB, ri);
                                  var pNet = function(pid, h) { var pl=players.find(function(x){return x.id===pid;}); if(!pl) return null; var g=scores[pid]&&scores[pid][ri]&&scores[pid][ri][h]; if(g==null) return null; return g - strokesOnHole(getCourseHandicap(pl.handicap, ri), course.si[h]); };
                                  var bestNetH = function(ids, h) { var b=null; ids.forEach(function(pid){ var n=pNet(pid,h); if(n!==null&&(b===null||n<b))b=n; }); return b; };
                                  var MPNine = function(nine) {
                                    var s=nine*9;
                                    var col={display:"grid", gridTemplateColumns:"40px repeat(9,1fr)", gap:2, marginBottom:2, alignItems:"center"};
                                    var row = function(label, color, fn, bold) {
                                      return <div style={col}>
                                        <div style={{fontSize:8,color:color||CL.muted,fontFamily:"system-ui",fontWeight:700}}>{label}</div>
                                        {Array.from({length:9},function(_,k){var v=fn(s+k); return <div key={k} style={{textAlign:"center",fontSize:bold?12:11,color:color||CL.muted,fontFamily:"system-ui",fontWeight:bold?800:400}}>{v}</div>;})}
                                      </div>;
                                    };
                                    return (
                                      <div key={nine} style={{marginBottom:6, overflowX:"auto"}}>
                                        <div style={{minWidth:330}}>
                                          {row("HOLE", CL.muted, function(h){return h+1;}, false)}
                                          {m.pairA.map(function(pid){ return <div key={pid}>{row(fName(pid).split(" ")[0], CL.muted, function(h){var n=pNet(pid,h);return n===null?"\u00b7":n;}, false)}</div>; })}
                                          {row("A best", CL.red, function(h){var n=bestNetH(m.pairA,h);return n===null?"\u00b7":n;}, true)}
                                          {m.pairB.map(function(pid){ return <div key={pid}>{row(fName(pid).split(" ")[0], CL.muted, function(h){var n=pNet(pid,h);return n===null?"\u00b7":n;}, false)}</div>; })}
                                          {row("B best", CL.blue, function(h){var n=bestNetH(m.pairB,h);return n===null?"\u00b7":n;}, true)}
                                          {row("WON", "#22c55e", function(h){var w=mp2.perHole[h].w;return w==="A"?"A":w==="B"?"B":w==="H"?"\u00bd":"\u00b7";}, true)}
                                        </div>
                                      </div>
                                    );
                                  };
                                  return (
                                    <div style={{marginTop:8, padding:"8px 10px", background:"rgba(30,58,95,0.18)", borderRadius:8}}>
                                      <div style={{fontSize:9, color:CL.muted, fontFamily:"system-ui", fontWeight:700, marginBottom:6, letterSpacing:0.5}}>{"HOLE-BY-HOLE MATCH PLAY \u00b7 "+COURSE_LABELS[ri]}</div>
                                      <div style={{fontSize:9, color:CL.muted, fontFamily:"system-ui", marginBottom:4, lineHeight:1.4}}>{"A = "+fName(m.pairA[0]).split(" ")[0]+" & "+fName(m.pairA[1]).split(" ")[0]+"   B = "+fName(m.pairB[0]).split(" ")[0]+" & "+fName(m.pairB[1]).split(" ")[0]+"   (numbers = net score)"}</div>
                                      {MPNine(0)}
                                      {MPNine(1)}
                                      <div style={{fontSize:13, fontFamily:"system-ui", color:"#fff", fontWeight:700, marginTop:4, textAlign:"center"}}>{"Holes won \u2014 A "+mp2.aHoles+" \u00b7 B "+mp2.bHoles+(mp2.halved?" \u00b7 halved "+mp2.halved:"")}</div>
                                      <div style={{fontSize:9, color:CL.muted, fontFamily:"system-ui", marginTop:3, textAlign:"center", lineHeight:1.4}}>{"Each hole: the side with the lower best NET ball wins it (\u00bd = halved). Most holes won wins; all square pushes."}</div>
                                    </div>
                                  );
                                }
                                function pPts(pid, h) { var pl = players.find(function(x){return x.id===pid;}); if (!pl) return null; var g = scores[pid] && scores[pid][ri] && scores[pid][ri][h]; if (g == null) return null; return stablefordPointsForHole(g, course.pars[h], getCourseHandicap(pl.handicap, ri), course.si[h]); }
                                function PairTable(pairIds, label) {
                                  return (
                                    <div style={{marginBottom:8}}>
                                      <div style={{fontSize:10, color:"#fff", fontFamily:"system-ui", fontWeight:700, marginBottom:3}}>{label}</div>
                                      {[0,1].map(function(nine) {
                                        var s = nine*9;
                                        var col = {display:"grid", gridTemplateColumns:"36px repeat(9,1fr) 28px", gap:2, marginBottom:2, alignItems:"center"};
                                        var bestCells = [], bestSum = 0, anyB = false;
                                        for (var k=0;k<9;k++) { var hh=s+k; var best=null; pairIds.forEach(function(pid){ var pt=pPts(pid,hh); if(pt!==null && (best===null||pt>best)) best=pt; }); if(best!==null){bestSum+=best;anyB=true;} bestCells.push(best===null?"\u00b7":best); }
                                        return (
                                          <div key={nine} style={{marginBottom:4, overflowX:"auto"}}>
                                            <div style={{minWidth:320}}>
                                              <div style={col}>
                                                <div style={{fontSize:8,color:CL.muted,fontFamily:"system-ui",fontWeight:700}}>HOLE</div>
                                                {Array.from({length:9},function(_,k){return <div key={k} style={{textAlign:"center",fontSize:9,color:CL.muted,fontFamily:"system-ui",fontWeight:700}}>{s+k+1}</div>;})}
                                                <div style={{textAlign:"center",fontSize:8,color:CL.muted,fontFamily:"system-ui",fontWeight:700}}>{nine===0?"OUT":"IN"}</div>
                                              </div>
                                              {pairIds.map(function(pid){
                                                var sum=0,any=false,cells=[];
                                                for(var k=0;k<9;k++){var pt=pPts(pid,s+k); if(pt!==null){sum+=pt;any=true;} cells.push(pt===null?"\u00b7":pt);}
                                                return <div key={pid} style={col}>
                                                  <div style={{fontSize:9,color:CL.muted,fontFamily:"system-ui"}}>{fName(pid).split(" ")[0]}</div>
                                                  {cells.map(function(v,i){return <div key={i} style={{textAlign:"center",fontSize:11,color:CL.muted,fontFamily:"system-ui"}}>{v}</div>;})}
                                                  <div style={{textAlign:"center",fontSize:11,color:CL.muted,fontFamily:"system-ui",fontWeight:700}}>{any?sum:"\u2014"}</div>
                                                </div>;
                                              })}
                                              <div style={col}>
                                                <div style={{fontSize:9,color:"#22c55e",fontFamily:"system-ui",fontWeight:700}}>BEST</div>
                                                {bestCells.map(function(v,i){return <div key={i} style={{textAlign:"center",fontSize:12,color:"#22c55e",fontFamily:"system-ui",fontWeight:700}}>{v}</div>;})}
                                                <div style={{textAlign:"center",fontSize:12,color:"#22c55e",fontFamily:"system-ui",fontWeight:800}}>{anyB?bestSum:"\u2014"}</div>
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                }
                                return (
                                  <div style={{marginTop:8, padding:"8px 10px", background:"rgba(30,58,95,0.18)", borderRadius:8}}>
                                    <div style={{fontSize:9, color:CL.muted, fontFamily:"system-ui", fontWeight:700, marginBottom:6, letterSpacing:0.5}}>{"HOLE-BY-HOLE BEST BALL \u00b7 "+COURSE_LABELS[ri]}</div>
                                    {PairTable(m.pairA, "Side A \u2014 "+fName(m.pairA[0]).split(" ")[0]+" & "+fName(m.pairA[1]).split(" ")[0])}
                                    {PairTable(m.pairB, "Side B \u2014 "+fName(m.pairB[0]).split(" ")[0]+" & "+fName(m.pairB[1]).split(" ")[0])}
                                    <div style={{fontSize:13, fontFamily:"system-ui", color:"#fff", fontWeight:700, marginTop:4, textAlign:"center"}}>{"Best-ball total \u2014 A "+(pairLive(m.pairA,ri)===null?"\u2013":pairLive(m.pairA,ri))+"  \u00b7  B "+(pairLive(m.pairB,ri)===null?"\u2013":pairLive(m.pairB,ri))}</div>
                                    <div style={{fontSize:9, color:CL.muted, fontFamily:"system-ui", marginTop:3, textAlign:"center", lineHeight:1.4}}>{"BEST = the pair's best ball on that hole (higher of the two players' net Stableford points). The sum of the BEST row is the pair's match score."}</div>
                                  </div>
                                );
                              })()}

                              {/* Backer action is its OWN $stake pool, settled among the backers only —
                                  completely separate from the four-man match above. */}
                              <div style={{marginTop:10, padding:8, background:"rgba(40,69,112,0.15)", borderRadius:8}}>
                                <div style={{fontSize:11, color:CL.muted, fontFamily:"system-ui", fontWeight:600, marginBottom:6}}>{"💸 SIDE BET · back a side — $"+m.stake+" (separate from the match)"}</div>
                                {backed.length>0 && (
                                  <div style={{marginBottom:6}}>
                                    {bckA.map(function(pid){ return bckChip(pid, CL.red, "A"); })}
                                    {bckB.map(function(pid){ return bckChip(pid, CL.blue, "B"); })}
                                  </div>
                                )}
                                {decided && backed.length>0 ? (
                                  <div style={{fontSize:12, fontFamily:"system-ui", color:bckVoid?CL.muted:"#22c55e", marginBottom:6}}>{bckVoid ? "Void — only one side was backed, no money moves" : ((aWin?"A":"B")+"-side backers win · +$"+(Math.round(bckWinEach*100)/100)+" each · losing backers −$"+m.stake)}</div>
                                ) : (!roundFinal && backed.length===0 && (
                                  <div style={{fontSize:12, color:CL.muted, fontFamily:"system-ui", marginBottom:6}}>No side bets yet — backers play their own pool.</div>
                                ))}
                                {!roundFinal && props.canEdit && canBack.length > 0 && canBack.map(function(p){ return (
                                  <div key={p.id} style={{display:"flex", alignItems:"center", gap:6, marginBottom:5}}>
                                    <div style={{flex:1, fontSize:13, color:"#fff", fontFamily:"system-ui"}}>{p.emoji+" "+p.name}</div>
                                    <button onClick={function(){backSide(m.id, p.id, "a");}} style={Object.assign({}, S.pillBtn, {fontSize:11, padding:"4px 10px", borderColor:"rgba(240,69,74,0.5)", color:CL.red})}>→ A</button>
                                    <button onClick={function(){backSide(m.id, p.id, "b");}} style={Object.assign({}, S.pillBtn, {fontSize:11, padding:"4px 10px", borderColor:"rgba(111,172,255,0.5)", color:CL.blue})}>→ B</button>
                                  </div>
                                ); })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        );
      })()}

      {SHOW_GROSS && tab === "ind" && (function() {
        var brackets = getGrossBrackets(players);
        function bracketRows(ids) {
          return ids.map(function(pid) {
            return { p:players.find(function(x) { return x.id === pid; }), pts:getTotalGrossStableford(scores, pid) };
          }).sort(function(a, b) {
            if (a.pts === null) return 1;
            if (b.pts === null) return -1;
            return b.pts - a.pts; // higher gross Stableford wins
          });
        }
        function renderBracket(label, emoji, ids) {
          var rows = bracketRows(ids);
          var pot = ids.length * STAKE_GROSS;
          var played = rows.filter(function(r) { return r.pts !== null; });
          var leaderPts = played.length ? played[0].pts : null;
          return (
            <div style={{marginBottom:14}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:6}}>
                <div style={{fontSize:14, fontWeight:700, color:"#fff", fontFamily:"system-ui"}}>{emoji+" "+label}</div>
                <div style={{fontSize:12, color:CL.red, fontFamily:"system-ui", fontWeight:600}}>{"$"+STAKE_GROSS+"/man · $"+pot+" winner-take-all"}</div>
              </div>
              {rows.map(function(r, i) {
                var isLeader = r.pts !== null && r.pts === leaderPts;
                return (
                  <div key={r.p.id} style={Object.assign({display:"flex", alignItems:"center", padding:"7px 0", gap:10}, i<rows.length-1?S.separator:{}, isLeader?{background:"rgba(34,197,94,0.08)", margin:"0 -8px", padding:"7px 8px", borderRadius:6}:{})}>
                    <div style={{fontSize:15}}>{r.p.emoji}</div>
                    <div style={{flex:1, fontSize:14, color:"#fff", fontFamily:"system-ui"}}>{r.p.name}<span style={{color:CL.muted, fontSize:11}}>{" ("+r.p.handicap+")"}</span></div>
                    <div style={{fontSize:16, fontWeight:700, color:isLeader?"#22c55e":"#fff", fontFamily:"system-ui"}}>{r.pts !== null ? r.pts : "—"}</div>
                  </div>
                );
              })}
            </div>
          );
        }
        return (
          <div>
            <div style={S.card}>
              <div style={S.cardTitle}>⛳ Individual Gross Stableford<StatusTag final={tripDone} /></div>
              <div style={Object.assign({}, S.label, {marginBottom:12})}>Most GROSS Stableford points across all 5 rounds wins each group. Winner takes the whole pot.</div>
              {renderBracket(GROSS_GROUP_A.name, GROSS_GROUP_A.emoji, brackets.a)}
              {renderBracket(GROSS_GROUP_B.name, GROSS_GROUP_B.emoji, brackets.b)}
              <div style={{fontSize:11, color:CL.muted, fontFamily:"system-ui", textAlign:"center"}}>Groups split by handicap · gross Stableford (no strokes given) · Eagle 4 · Birdie 3 · Par 2 · Bogey 1</div>
            </div>
          </div>
        );
      })()}

      {SHOW_SKINS && tab === "skins" && (
        <div>
          {/* Skins opt-in and results */}
          {(function() {
            // Per-course skins: five independent bets, one per course. Net scoring, $20/skin,
            // each with its own opt-in. Sole low net score on a hole wins; ties push (carry).
            var SK_STAKE = STAKE_SKIN;
            function toggleSkinCourse(ri, pid) {
              var se = Object.assign({}, skinsEligible);
              var arr = (se.course || []).slice();
              while (arr.length < COURSES.length) arr.push([]);
              var list = (arr[ri] || []).slice();
              var idx = list.indexOf(pid);
              if (idx >= 0) list.splice(idx, 1); else list.push(pid);
              arr[ri] = list;
              se.course = arr;
              update({ skinsEligible: se });
            }
            function renderCourseSkins(ri) {
              var course = COURSES[ri];
              var eligible = ((skinsEligible.course || [])[ri]) || [];
              var rd = eligible.length >= 2 ? computeSkins(scores, players, eligible, ri, true) : null;
              var roundSkins = {};
              if (rd) eligible.forEach(function(id) { roundSkins[id] = rd.totals[id] || 0; });
              var roundTotal = rd ? eligible.reduce(function(s, id) { return s + (roundSkins[id] || 0); }, 0) : 0;
              var played = eligible.some(function(pid) {
                return scores[pid] && scores[pid][ri] && scores[pid][ri].some(function(s) { return s != null; });
              });
              var standings = eligible.map(function(pid) {
                var p = players.find(function(x) { return x.id === pid; });
                return { p: p, skins: roundSkins[pid] || 0 };
              }).sort(function(a, b) { return b.skins - a.skins; });
              var topSkins = standings.length ? standings[0].skins : 0;
              var pushedAtEnd = rd && rd.carry > 1 ? rd.carry - 1 : 0;
              return (
                <div style={S.card} key={ri}>
                  <div style={S.cardTitle}>{"\uD83D\uDD2A " + course.name}{eligible.length >= 2 && played ? <StatusTag final={roundComplete(scores, ri, eligible)} /> : null}</div>
                  <div style={Object.assign({}, S.label, {marginBottom:4})}>{"Net skins \u00B7 Par " + course.par + ". Sole low net score wins the hole; ties push."}</div>
                  <div style={{fontSize:12, color:CL.red, fontFamily:"system-ui", marginBottom:10, fontWeight:600}}>{"$"+STAKE_SKIN+"/skin \u00B7 " + eligible.length + " player" + (eligible.length !== 1 ? "s" : "") + " in"}</div>

                  <div style={{fontSize:11, color:CL.muted, fontFamily:"system-ui", marginBottom:4}}>Who's in:</div>
                  <div style={{display:"flex", gap:4, flexWrap:"wrap", marginBottom:12}}>
                    {players.map(function(p) {
                      var isIn = eligible.indexOf(p.id) >= 0;
                      return <button key={p.id} onClick={function() { toggleSkinCourse(ri, p.id); }} style={Object.assign({}, S.pillBtn, isIn ? {background:"rgba(34,197,94,0.2)", borderColor:"#22c55e", color:"#22c55e"} : {opacity:0.6})}>{(isIn ? "\u2713 " : "") + p.emoji + " " + p.name.split(" ")[0]}</button>;
                    })}
                  </div>

                  {eligible.length < 2 ? (
                    <div style={{textAlign:"center", padding:16, color:CL.muted, fontFamily:"system-ui", fontSize:13}}>Select at least 2 players to start.</div>
                  ) : !played ? (
                    <div style={{textAlign:"center", padding:16, color:CL.muted, fontFamily:"system-ui", fontSize:13}}>Not played yet.</div>
                  ) : roundTotal === 0 ? (
                    <div style={{textAlign:"center", padding:16, color:CL.muted, fontFamily:"system-ui", fontSize:13}}>{"No skins won yet" + (pushedAtEnd ? " \u00B7 " + pushedAtEnd + " pushed" : "") + "."}</div>
                  ) : (
                    <div>
                      {standings.map(function(x, i) {
                        var isLeader = x.skins > 0 && x.skins === topSkins;
                        var net = x.skins * SK_STAKE * (eligible.length - 1) - (roundTotal - x.skins) * SK_STAKE;
                        return (
                          <div key={x.p.id} style={Object.assign({display:"flex", alignItems:"center", padding:"7px 0", gap:10}, i < standings.length - 1 ? S.separator : {}, isLeader ? {background:"rgba(34,197,94,0.08)", margin:"0 -8px", padding:"7px 8px", borderRadius:6} : {})}>
                            <div style={{fontSize:15}}>{x.p.emoji}</div>
                            <div style={{flex:1, fontSize:14, color:"#fff", fontFamily:"system-ui"}}>{x.p.name.split(" ")[0]}</div>
                            <div style={{fontSize:14, fontWeight:700, color:isLeader ? "#22c55e" : "#fff", fontFamily:"system-ui", width:50, textAlign:"center"}}>{x.skins + " \uD83C\uDFC6"}</div>
                            <div style={{fontSize:12, fontWeight:600, color:net > 0 ? "#22c55e" : net < 0 ? "#ef4444" : CL.muted, fontFamily:"system-ui", width:55, textAlign:"right"}}>{net > 0 ? "+$" + net : net < 0 ? "-$" + Math.abs(net) : "Even"}</div>
                          </div>
                        );
                      })}
                      {pushedAtEnd > 0 && (
                        <div style={{fontSize:11, color:CL.muted, fontFamily:"system-ui", marginTop:8}}>{pushedAtEnd + " skin" + (pushedAtEnd !== 1 ? "s" : "") + " pushed on the final hole (no sole winner)."}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            }
            function toggleSkinType(type, pid) {
              var se = Object.assign({}, skinsEligible);
              var list = (se[type] || []).slice();
              var idx = list.indexOf(pid);
              if (idx >= 0) list.splice(idx, 1); else list.push(pid);
              se[type] = list;
              update({ skinsEligible: se });
            }
            function renderTotalSkins(type, label, emoji) {
              var useNet = type === "net";
              var eligible = skinsEligible[type] || [];
              var totals = eligible.length >= 2 ? getTotalSkins(scores, players, eligible, useNet) : {};
              var grand = 0; eligible.forEach(function(id) { grand += (totals[id] || 0); });
              var standings = eligible.map(function(pid) {
                var p = players.find(function(x) { return x.id === pid; });
                return { p: p, skins: totals[pid] || 0 };
              }).sort(function(a, b) { return b.skins - a.skins; });
              var top = standings.length ? standings[0].skins : 0;
              return (
                <div style={S.card}>
                  <div style={S.cardTitle}>{emoji + " " + label}{eligible.length >= 2 ? <StatusTag final={tripComplete(scores, eligible)} /> : null}</div>
                  <div style={Object.assign({}, S.label, {marginBottom:4})}>{(useNet ? "Net" : "Gross") + " skins across all 5 rounds \u2014 one combined pot. Sole low score on a hole wins; ties push."}</div>
                  <div style={{fontSize:12, color:CL.red, fontFamily:"system-ui", marginBottom:10, fontWeight:600}}>{"$"+STAKE_SKIN+"/skin \u00B7 whole trip \u00B7 " + eligible.length + " player" + (eligible.length !== 1 ? "s" : "") + " in"}</div>
                  <div style={{fontSize:11, color:CL.muted, fontFamily:"system-ui", marginBottom:4}}>Who's in:</div>
                  <div style={{display:"flex", gap:4, flexWrap:"wrap", marginBottom:12}}>
                    {players.map(function(p) {
                      var isIn = eligible.indexOf(p.id) >= 0;
                      return <button key={p.id} onClick={function() { toggleSkinType(type, p.id); }} style={Object.assign({}, S.pillBtn, isIn ? {background:"rgba(34,197,94,0.2)", borderColor:"#22c55e", color:"#22c55e"} : {opacity:0.6})}>{(isIn ? "\u2713 " : "") + p.emoji + " " + p.name.split(" ")[0]}</button>;
                    })}
                  </div>
                  {eligible.length < 2 ? (
                    <div style={{textAlign:"center", padding:16, color:CL.muted, fontFamily:"system-ui", fontSize:13}}>Select at least 2 players to start.</div>
                  ) : grand === 0 ? (
                    <div style={{textAlign:"center", padding:16, color:CL.muted, fontFamily:"system-ui", fontSize:13}}>No skins won yet.</div>
                  ) : (
                    <div>
                      {standings.map(function(x, i) {
                        var isLeader = x.skins > 0 && x.skins === top;
                        var net = x.skins * STAKE_SKIN * (eligible.length - 1) - (grand - x.skins) * STAKE_SKIN;
                        return (
                          <div key={x.p.id} style={Object.assign({display:"flex", alignItems:"center", padding:"7px 0", gap:10}, i < standings.length - 1 ? S.separator : {}, isLeader ? {background:"rgba(34,197,94,0.08)", margin:"0 -8px", padding:"7px 8px", borderRadius:6} : {})}>
                            <div style={{fontSize:15}}>{x.p.emoji}</div>
                            <div style={{flex:1, fontSize:14, color:"#fff", fontFamily:"system-ui"}}>{x.p.name.split(" ")[0]}</div>
                            <div style={{fontSize:14, fontWeight:700, color:isLeader ? "#22c55e" : "#fff", fontFamily:"system-ui", width:50, textAlign:"center"}}>{x.skins + " \uD83C\uDFC6"}</div>
                            <div style={{fontSize:12, fontWeight:600, color:net > 0 ? "#22c55e" : net < 0 ? "#ef4444" : CL.muted, fontFamily:"system-ui", width:55, textAlign:"right"}}>{net > 0 ? "+$" + net : net < 0 ? "-$" + Math.abs(net) : "Even"}</div>
                          </div>
                        );
                      })}
                      <div style={{fontSize:11, color:CL.muted, fontFamily:"system-ui", marginTop:10, marginBottom:2, fontWeight:600}}>By course</div>
                      {COURSES.map(function(c, ri) {
                        var rd = computeSkins(scores, players, eligible, ri, useNet);
                        var winners = eligible.filter(function(id) { return rd.totals[id]; }).map(function(id) {
                          var p = players.find(function(x) { return x.id === id; });
                          return p.name.split(" ")[0] + " " + rd.totals[id];
                        });
                        return (
                          <div key={ri} style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"3px 0"}}>
                            <span style={{fontSize:12, color:"#fff", fontFamily:"system-ui"}}>{COURSE_LABELS[ri]}</span>
                            <span style={{fontSize:11, color:CL.muted, fontFamily:"system-ui", textAlign:"right"}}>{winners.length ? winners.join("  \u00B7  ") : "\u2014"}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <div>
                <div style={{fontSize:12, fontWeight:700, color:"#fff", fontFamily:"system-ui", padding:"0 4px 6px"}}>Overall \u00B7 whole trip</div>
                {renderTotalSkins("gross", "Total Gross Skins", "\u26F3")}
                {renderTotalSkins("net", "Total Net Skins", "\uD83C\uDFAF")}
                <div style={{fontSize:12, fontWeight:700, color:"#fff", fontFamily:"system-ui", padding:"14px 4px 6px"}}>Per course \u00B7 five separate games</div>
                <div style={{fontSize:11, color:CL.muted, fontFamily:"system-ui", padding:"0 4px 8px"}}>{"One net skins game per course, $"+STAKE_SKIN+"/skin. Opt in per course; each settles on its own."}</div>
                {COURSES.map(function(c, ri) { return renderCourseSkins(ri); })}
              </div>
            );
          })()}
        </div>
      )}

      {tab === "props" && (
        <div>
          {/* Individual Prop Bets — player-selectable eligibility, net scoring */}
          <div style={S.card}>
            <div style={S.cardTitle}>🎯 Individual Props</div>
            <div style={Object.assign({}, S.label, {marginBottom:12})}>Tap players to set who's IN each bet. Only selected players are eligible. Winner = best NET among those selected.</div>
            {individualProps.map(function(prop) {
              var autoWin = autoPropWinner(prop, players, scores);
              var effWinner = (prop.settled && prop.winner) ? prop.winner : autoWin;
              var effSettled = prop.settled || !!autoWin;
              var isAuto = !!autoWin && !prop.settled;
              var winner = players.find(function(x) { return x.id === effWinner; });
              var eligible = prop.eligible || [];
              var pot = (prop.buyin || DEFAULT_BUYIN) * eligible.length; // one bet per player
              // Compute the current NET leader among eligible players.
              // Stableford-style props (ip8 / ipsf*) use net Stableford points;
              // everything else uses net total score (lower is better).
              var leader = null;
              if (!effSettled && eligible.length > 0) {
                var rows = null, higherWins = true;
                if (prop.id === "ip8") {
                  rows = eligible.map(function(pid) { var p = players.find(function(x){return x.id===pid;}); return { p:p, v:getTotalStableford(scores, pid, p.handicap) }; });
                } else if (prop.id && prop.id.indexOf("ipsf") === 0) {
                  var ri = parseInt(prop.id.replace("ipsf", ""), 10);
                  rows = eligible.map(function(pid) { var p = players.find(function(x){return x.id===pid;}); return { p:p, v:getRoundStableford(scores, pid, ri, p.handicap) }; });
                } else {
                  // Default: net total across trip (lower is better)
                  higherWins = false;
                  rows = eligible.map(function(pid) {
                    var p = players.find(function(x){return x.id===pid;});
                    var net = 0, any = false;
                    for (var r=0;r<COURSES.length;r++){ var ns = getNetRoundScore(scores, pid, r, p.handicap); if (ns!==null){ net+=ns; any=true; } }
                    return { p:p, v: any ? net : null };
                  });
                }
                rows = rows.filter(function(x){ return x.v !== null; });
                if (rows.length) {
                  rows.sort(function(a,b){ return higherWins ? b.v - a.v : a.v - b.v; });
                  var top = rows[0];
                  var tied = rows.filter(function(x){ return x.v === top.v; });
                  leader = { player: top.p, val: top.v, tied: tied.length>1, tiedPlayers: tied, higherWins: higherWins };
                }
              }
              return (
                <div key={prop.id} style={Object.assign({padding:"12px 0"}, S.separator)}>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start"}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:15, fontWeight:600, color:effSettled?CL.muted:"#fff", textDecoration:effSettled?"line-through":"none"}}>{prop.name}</div>
                      {prop.desc && <div style={{fontSize:12, color:CL.muted, fontFamily:"system-ui", marginTop:2}}>{prop.desc}</div>}
                      <div style={{fontSize:12, color:CL.red, fontFamily:"system-ui", marginTop:2}}>{"$"+(prop.buyin||DEFAULT_BUYIN)+"/player · "+eligible.length+" in · $"+pot+" pot"}</div>
                      {leader && <div style={{fontSize:12, color:CL.blue, fontFamily:"system-ui", marginTop:3}}>{leader.tied ? "Tied: "+leader.tiedPlayers.map(function(t){return t.player.name.split(" ")[0];}).join(", ")+" ("+leader.val+(leader.higherWins?" pts)":" net)") : "Leading: "+leader.player.emoji+" "+leader.player.name.split(" ")[0]+" ("+leader.val+(leader.higherWins?" pts)":" net)")}</div>}
                    </div>
                    {!effSettled && props.canEdit && <button onClick={function() { if (confirm("Delete this prop?")) update({individualProps:individualProps.filter(function(x) { return x.id!==prop.id; })}); }} style={{background:"none", border:"none", color:CL.muted, cursor:"pointer", fontSize:14, flexShrink:0}}>🗑</button>}
                  </div>
                  {effSettled ? (
                    <div style={{marginTop:6}}>
                      <div style={{fontSize:14, color:"#22c55e", fontFamily:"system-ui"}}>{"🏆 "+(winner ? winner.emoji+" "+winner.name+" wins $"+pot : "Winner")}{isAuto ? "  ·  auto from scores" : ""}</div>
                      {prop.settled && props.canEdit && <button onClick={function() { update({individualProps:individualProps.map(function(x) { return x.id===prop.id ? Object.assign({},x,{settled:false,winner:null}) : x; })}); }} style={{marginTop:6, fontSize:11, color:CL.muted, fontFamily:"system-ui", background:"none", border:"1px solid "+CL.border, borderRadius:6, padding:"5px 12px", cursor:"pointer"}}>↩ Undo</button>}
                      {isAuto && props.canEdit && (
                        <div style={{marginTop:8}}>
                          <div style={{fontSize:11, color:CL.muted, fontFamily:"system-ui", marginBottom:4}}>Override (ties / withdrawals):</div>
                          <div style={{display:"flex", gap:4, flexWrap:"wrap"}}>
                            {eligible.map(function(pid) {
                              var p = players.find(function(x){return x.id===pid;});
                              return <button key={pid} onClick={function() { update({individualProps:individualProps.map(function(x) { return x.id===prop.id ? Object.assign({},x,{settled:true,winner:pid}) : x; })}); }} style={Object.assign({}, S.pillBtn, {fontSize:11, padding:"4px 10px"}, pid===effWinner ? {borderColor:"#22c55e", color:"#22c55e"} : {})}>{p.emoji+" "+p.name.split(" ")[0]}</button>;
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{marginTop:8}}>
                      {/* Single in/out opt-in — each player is in for one buy-in (winner-take-all). One bet only. */}
                      <div style={{fontSize:11, color:CL.muted, fontFamily:"system-ui", marginBottom:4}}>Who's in — tap to opt in or out:</div>
                      <div style={{display:"flex", gap:4, flexWrap:"wrap", marginBottom:8}}>
                        {players.map(function(p) {
                          var isIn = ((prop.units && prop.units[p.id]) || 0) >= 1;
                          function toggle() {
                            if (!props.canEdit) return; // guests can't edit bets
                            var nv = isIn ? 0 : 1; // one bet per player: in (1) or out (0)
                            // Atomic, clobber-proof: optimistic local update + durable per-field write.
                            props.onSetPropUnits(prop.id, p.id, nv);
                            savePropUnits(prop.id, p.id, nv);
                          }
                          return <button key={p.id} onClick={toggle} style={Object.assign({}, S.pillBtn, isIn ? {background:"rgba(34,197,94,0.2)", borderColor:"#22c55e", color:"#22c55e"} : {opacity:0.6})}>{(isIn?"✓ ":"")+p.emoji+" "+p.name.split(" ")[0]}</button>;
                        })}
                      </div>
                      {(prop.id === "ip8" || (prop.id && prop.id.indexOf("ipsf")===0) || prop.id === "ip1") && (
                        <div style={{fontSize:11, color:CL.blue, fontFamily:"system-ui", marginBottom:8}}>⚡ Auto-settles from the scorecard once the round{(prop.id==="ip8"||prop.id==="ip1")?"s are":" is"} complete. A tie is left for you to settle by hand.</div>
                      )}
                      {props.canEdit && eligible.length > 0 && (
                        <div>
                          <div style={{fontSize:11, color:CL.muted, fontFamily:"system-ui", marginBottom:4}}>Settle by hand — tap the winner:</div>
                          <div style={{display:"flex", gap:4, flexWrap:"wrap"}}>
                            {eligible.map(function(pid) {
                              var p = players.find(function(x){return x.id===pid;});
                              return <button key={pid} onClick={function() { update({individualProps:individualProps.map(function(x) { return x.id===prop.id ? Object.assign({},x,{settled:true,winner:pid}) : x; })}); }} style={Object.assign({}, S.pillBtn, {borderColor:"rgba(220,38,38,0.4)"})}>{p.emoji+" "+p.name.split(" ")[0]}</button>;
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add custom prop bet — gatekeepers only */}
            {props.canEdit && (!addingProp ? (
              <button onClick={function() { setAddingProp(true); }} style={Object.assign({}, S.addBtn, {width:"100%", marginTop:12, fontSize:13})}>+ Add Custom Prop Bet</button>
            ) : (
              <div style={{marginTop:12, padding:12, background:"rgba(40,69,112,0.15)", borderRadius:8}}>
                <div style={{fontSize:13, fontWeight:700, color:"#fff", fontFamily:"system-ui", marginBottom:8}}>New Prop Bet</div>
                <div style={Object.assign({}, S.label, {marginBottom:4})}>What's the bet?</div>
                <input style={S.input} value={customPropName} onChange={function(e) { setCustomPropName(e.target.value); }} placeholder="e.g. Lowest net at Portrush"/>
                <div style={Object.assign({}, S.label, {marginBottom:4})}>Buy-in per player ($)</div>
                <input style={Object.assign({}, S.input, {width:120})} value={customPropBuyin} onChange={function(e) { setCustomPropBuyin(e.target.value); }} type="number" placeholder="25"/>
                <div style={{display:"flex", gap:8, marginTop:4}}>
                  <button style={Object.assign({}, S.primaryBtn, {flex:1, opacity:!customPropName.trim() ? 0.5 : 1})} onClick={function() {
                    if (!customPropName.trim()) return;
                    var newProp = { id:"ip"+Date.now(), name:customPropName.trim(), desc:"", settled:false, winner:null, buyin:parseFloat(customPropBuyin)||25, eligible:[], isCustom:true };
                    update({individualProps:individualProps.concat([newProp])});
                    setCustomPropName(""); setCustomPropBuyin("10"); setAddingProp(false);
                  }}>Create</button>
                  <button style={Object.assign({}, S.secondaryBtn, {flex:1})} onClick={function() { setAddingProp(false); setCustomPropName(""); }}>Cancel</button>
                </div>
              </div>
            ))}
          </div>

          {/* Over/Under Props — two-sided side bets on a numeric line */}
          <div style={S.card}>
            <div style={S.cardTitle}>🎲 Over / Under Props</div>
            <div style={Object.assign({}, S.label, {marginBottom:12})}>Matched book: OVER units pair 1-for-1 against UNDER units (even money at the stake). Only matched units are live — unmatched excess is void. First in line gets matched first; matched units 🔒 lock and can't be pulled.</div>
            {(function() {
              function firstName(id){ var pl=players.find(function(x){return x.id===id;}); return pl?pl.emoji+" "+pl.name.split(" ")[0]:id; }
              // Atomic, clobber-proof: optimistic local update + per-field write. A player
              // sits on exactly one side; setting a side clears the other. 0 units = off.
              function setOu(propId, pid, side, n, curTs){
                if(!props.canEdit) return;
                var nv=Math.max(0,n);
                var ts = curTs || Date.now(); // preserve place in line on +/-; brand-new entry = now
                props.onSetOuUnits(propId, pid, side, nv, ts);
                saveOuUnits(propId, pid, side, nv, ts);
              }
              function settleOU(propId, result){ update({overUnderProps: overUnderProps.map(function(p){ return p.id===propId?Object.assign({},p,{settled:true,result:result}):p; })}); }
              function unsettleOU(propId){ update({overUnderProps: overUnderProps.map(function(p){ return p.id===propId?Object.assign({},p,{settled:false,result:null}):p; })}); }
              return overUnderProps.map(function(p){
                var overU=p.overUnits||{}, underU=p.underUnits||{};
                var overT=p.overTimes||{}, underT=p.underTimes||{};
                var mm=matchOu(overU,underU,overT,underT);
                var overIds=Object.keys(overU).filter(function(id){return (overU[id]||0)>=1;}).sort(function(a,b){return (overT[a]||0)-(overT[b]||0);});
                var underIds=Object.keys(underU).filter(function(id){return (underU[id]||0)>=1 && overIds.indexOf(id)<0;}).sort(function(a,b){return (underT[a]||0)-(underT[b]||0);});
                var inAny=overIds.concat(underIds);
                var undecided=players.filter(function(pl){return inAny.indexOf(pl.id)<0;});
                var stake=p.stake||DEFAULT_BUYIN;
                var overUnmatched=mm.overTotal-mm.matched, underUnmatched=mm.underTotal-mm.matched;
                function matchedFor(id,side){ return ((side==="over"?mm.overMatched:mm.underMatched)[id])||0; }
                function chip(id, side, umap, tmap){
                  var cnt=umap[id]||0, mcnt=matchedFor(id,side); var c = side==="over"?"#22c55e":CL.red;
                  var canDec = !p.settled && props.canEdit && cnt>mcnt; // hard-lock: matched units can't be pulled
                  return <span key={id+side} style={Object.assign({},S.pillBtn,{background:side==="over"?"rgba(34,197,94,0.18)":"rgba(240,69,74,0.18)",borderColor:c,color:c,display:"inline-flex",alignItems:"center",gap:4,padding:"4px 7px",marginRight:4,marginBottom:4})}>
                    {!p.settled && <span onClick={function(){ if(canDec) setOu(p.id,id,side,cnt-1,tmap[id]); }} style={{cursor:canDec?"pointer":"not-allowed",fontWeight:700,fontSize:16,lineHeight:1,padding:"0 3px",opacity:canDec?1:0.25}}>−</span>}
                    <span style={{fontSize:12}}>{firstName(id)}</span>
                    <span style={{fontSize:12,fontWeight:800}}>{"×"+cnt}</span>
                    {mcnt>0 && <span style={{fontSize:10,opacity:0.85}} title="matched / locked">{"🔒"+mcnt}</span>}
                    {!p.settled && <span onClick={function(){ if(props.canEdit) setOu(p.id,id,side,cnt+1,tmap[id]); }} style={{cursor:"pointer",fontWeight:700,fontSize:16,lineHeight:1,padding:"0 3px",opacity:props.canEdit?1:0.4}}>+</span>}
                  </span>;
                }
                function sideBox(label, ids, side, umap, tmap, color){
                  var tot=ids.reduce(function(s,id){return s+(umap[id]||1);},0);
                  var mtot=ids.reduce(function(s,id){return s+matchedFor(id,side);},0);
                  return (
                    <div style={Object.assign({},S.teamBox,{flex:1})}>
                      <div style={{fontSize:12,fontWeight:700,color:color,fontFamily:"system-ui",marginBottom:6}}>{label+" · "+tot+"u · "+mtot+" matched"}</div>
                      {ids.length===0 && <div style={{fontSize:12,color:CL.muted,fontFamily:"system-ui"}}>—</div>}
                      <div style={{display:"flex",flexWrap:"wrap"}}>{ids.map(function(id){return chip(id,side,umap,tmap);})}</div>
                    </div>
                  );
                }
                return (
                  <div key={p.id} style={Object.assign({padding:"12px 0"},S.separator)}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:15,fontWeight:600,color:p.settled?CL.muted:"#fff",textDecoration:p.settled?"line-through":"none"}}>{p.name}</div>
                        <div style={{fontSize:13,color:CL.blue,fontFamily:"system-ui",marginTop:2}}>{"Line: O / U "+p.line+"  ·  $"+stake+"/unit"}</div>
                      </div>
                      {!p.settled && props.canEdit && <button onClick={function(){ if(confirm("Delete this over/under?")) update({overUnderProps:overUnderProps.filter(function(x){return x.id!==p.id;})}); }} style={{background:"none",border:"none",color:CL.muted,cursor:"pointer",fontSize:14,flexShrink:0}}>🗑</button>}
                    </div>
                    <div style={{display:"flex",gap:8,marginTop:8}}>
                      {sideBox("OVER "+p.line, overIds, "over", overU, overT, "#22c55e")}
                      {sideBox("UNDER "+p.line, underIds, "under", underU, underT, CL.red)}
                    </div>
                    <div style={{fontSize:11,color:(overUnmatched>0||underUnmatched>0)?CL.red:CL.muted,fontFamily:"system-ui",marginTop:6}}>{"⚖️ "+mm.matched+" unit"+(mm.matched!==1?"s":"")+" matched"+(overUnmatched>0?" · "+overUnmatched+" OVER unmatched (void unless UNDER catches up)":underUnmatched>0?" · "+underUnmatched+" UNDER unmatched (void unless OVER catches up)":"")}</div>
                    {p.settled ? (
                      <div style={{marginTop:8}}>
                        <div style={{fontSize:14,color:mm.matched===0?CL.muted:"#22c55e",fontFamily:"system-ui"}}>{mm.matched===0 ? ("Settled "+(p.result==="over"?"OVER":"UNDER")+" — no units matched, nothing moves") : ("🏆 "+(p.result==="over"?"OVER":"UNDER")+" hit — "+mm.matched+" matched unit"+(mm.matched!==1?"s":"")+" settle even money at $"+stake+" each. Unmatched units void.")}</div>
                        {props.canEdit && <button onClick={function(){unsettleOU(p.id);}} style={{marginTop:6,fontSize:11,color:CL.muted,fontFamily:"system-ui",background:"none",border:"1px solid "+CL.border,borderRadius:6,padding:"5px 12px",cursor:"pointer"}}>↩ Undo</button>}
                      </div>
                    ) : (
                      <div style={{marginTop:8}}>
                        {props.canEdit && undecided.length>0 && (
                          <div style={{marginBottom:8}}>
                            <div style={{fontSize:11,color:CL.muted,fontFamily:"system-ui",marginBottom:4}}>Take a side (then − / + for more units):</div>
                            {undecided.map(function(pl){ return (
                              <div key={pl.id} style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                                <div style={{flex:1,fontSize:13,color:"#fff",fontFamily:"system-ui"}}>{pl.emoji+" "+pl.name}</div>
                                <button onClick={function(){setOu(p.id,pl.id,"over",1);}} style={Object.assign({},S.pillBtn,{fontSize:11,padding:"4px 10px",borderColor:"rgba(34,197,94,0.5)",color:"#22c55e"})}>Over</button>
                                <button onClick={function(){setOu(p.id,pl.id,"under",1);}} style={Object.assign({},S.pillBtn,{fontSize:11,padding:"4px 10px",borderColor:"rgba(240,69,74,0.5)",color:CL.red})}>Under</button>
                              </div>
                            ); })}
                          </div>
                        )}
                        {props.canEdit && (overIds.length>0||underIds.length>0) && (
                          <div>
                            <div style={{fontSize:11,color:CL.muted,fontFamily:"system-ui",marginBottom:4}}>Settle — which way did it go?</div>
                            <div style={{display:"flex",gap:6}}>
                              <button onClick={function(){settleOU(p.id,"over");}} style={Object.assign({},S.pillBtn,{borderColor:"rgba(34,197,94,0.5)",color:"#22c55e"})}>OVER hit</button>
                              <button onClick={function(){settleOU(p.id,"under");}} style={Object.assign({},S.pillBtn,{borderColor:"rgba(240,69,74,0.5)",color:CL.red})}>UNDER hit</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
            {props.canEdit && (!addingOu ? (
              <button onClick={function(){setAddingOu(true);}} style={Object.assign({},S.addBtn,{width:"100%",marginTop:12,fontSize:13})}>+ Add Over/Under Prop</button>
            ) : (
              <div style={{marginTop:12,padding:12,background:"rgba(40,69,112,0.15)",borderRadius:8}}>
                <div style={{fontSize:13,fontWeight:700,color:"#fff",fontFamily:"system-ui",marginBottom:8}}>New Over/Under</div>
                <div style={Object.assign({},S.label,{marginBottom:4})}>What's the bet?</div>
                <input style={S.input} value={ouName} onChange={function(e){setOuName(e.target.value);}} placeholder="e.g. Eagles (trip total)"/>
                <div style={{display:"flex",gap:8}}>
                  <div style={{flex:1}}>
                    <div style={Object.assign({},S.label,{marginBottom:4})}>Line</div>
                    <input style={S.input} value={ouLine} onChange={function(e){setOuLine(e.target.value);}} type="number" placeholder="1.5"/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={Object.assign({},S.label,{marginBottom:4})}>Stake/player ($)</div>
                    <input style={S.input} value={ouStake} onChange={function(e){setOuStake(e.target.value);}} type="number" placeholder="20"/>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,marginTop:8}}>
                  <button style={Object.assign({},S.primaryBtn,{flex:1,opacity:(!ouName.trim()||ouLine==="")?0.5:1})} onClick={function(){
                    if(!ouName.trim()||ouLine==="") return;
                    var newOu={id:"ou"+Date.now(),name:ouName.trim(),line:parseFloat(ouLine),stake:parseFloat(ouStake)||20,over:[],under:[],settled:false,result:null};
                    update({overUnderProps:overUnderProps.concat([newOu])});
                    setOuName(""); setOuLine(""); setOuStake("20"); setAddingOu(false);
                  }}>Create</button>
                  <button style={Object.assign({},S.secondaryBtn,{flex:1})} onClick={function(){setAddingOu(false);setOuName("");setOuLine("");}}>Cancel</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {SHOW_MATCH_PLAY && tab === "match" && (
        <div>
          <div style={S.card}>
            <div style={S.cardTitle}>⚔️ {TEAM_MATCHUPS[0].name} — Match Play</div>
            <div style={Object.assign({}, S.label, {marginBottom:12})}>$20/player per round · Best team score wins each course</div>
            {(function() {
              var matchup = TEAM_MATCHUPS[0];
              var aWins = 0, bWins = 0, ties = 0;
              teamMatches.forEach(function(m) { if (m.settled) { if (m.winner === "a") aWins++; else if (m.winner === "b") bWins++; else ties++; } });
              var totalSettled = aWins + bWins + ties;
              return (
                <div>
                  {totalSettled > 0 && (
                    <div style={{display:"flex", gap:12, marginBottom:12, padding:12, background:"rgba(30,58,95,0.2)", borderRadius:8}}>
                      <div style={{flex:1, textAlign:"center"}}>
                        <div style={{fontSize:28}}>{matchup.teamA.emoji}</div>
                        <div style={{fontSize:14, fontWeight:700, color:"#fff", fontFamily:"system-ui"}}>{matchup.teamA.name}</div>
                        <div style={{fontSize:28, fontWeight:700, color:aWins > bWins ? CL.red : CL.muted, fontFamily:"system-ui"}}>{aWins}</div>
                        <div style={S.label}>rounds won</div>
                      </div>
                      <div style={{display:"flex", alignItems:"center", color:CL.muted, fontFamily:"system-ui", fontWeight:700}}>vs</div>
                      <div style={{flex:1, textAlign:"center"}}>
                        <div style={{fontSize:28}}>{matchup.teamB.emoji}</div>
                        <div style={{fontSize:14, fontWeight:700, color:"#fff", fontFamily:"system-ui"}}>{matchup.teamB.name}</div>
                        <div style={{fontSize:28, fontWeight:700, color:bWins > aWins ? CL.red : CL.muted, fontFamily:"system-ui"}}>{bWins}</div>
                        <div style={S.label}>rounds won</div>
                      </div>
                    </div>
                  )}
                  {teamMatches.map(function(match) {
                    return (
                      <div key={match.id} style={Object.assign({padding:"12px 0"}, S.separator)}>
                        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6}}>
                          <div style={{fontSize:14, fontWeight:700, color:"#fff"}}>{match.course}</div>
                          <div style={{fontSize:11, color:CL.red, fontFamily:"system-ui", fontWeight:600}}>${match.stake}/player</div>
                        </div>
                        {match.settled ? (
                          <div>
                            <div style={{fontSize:14, color:"#22c55e", fontFamily:"system-ui", marginBottom:4}}>
                              {"🏆 " + (match.winner === "a" ? matchup.teamA.emoji + " " + matchup.teamA.name : matchup.teamB.emoji + " " + matchup.teamB.name) + " win!"}
                            </div>
                            <button onClick={function() { update({teamMatches:teamMatches.map(function(m) { return m.id === match.id ? Object.assign({},m,{settled:false,winner:null}) : m; })}); }} style={{fontSize:10, color:CL.muted, fontFamily:"system-ui", background:"none", border:"none", cursor:"pointer", padding:0}}>Reset</button>
                          </div>
                        ) : (
                          <div style={{display:"flex", gap:8}}>
                            <button onClick={function() { update({teamMatches:teamMatches.map(function(m) { return m.id === match.id ? Object.assign({},m,{settled:true,winner:"a"}) : m; })}); }} style={Object.assign({}, S.pillBtn, {flex:1, textAlign:"center", padding:"8px 0", borderColor:"rgba(220,38,38,0.4)"})}>
                              {matchup.teamA.emoji + " " + matchup.teamA.name + " wins"}
                            </button>
                            <button onClick={function() { update({teamMatches:teamMatches.map(function(m) { return m.id === match.id ? Object.assign({},m,{settled:true,winner:"b"}) : m; })}); }} style={Object.assign({}, S.pillBtn, {flex:1, textAlign:"center", padding:"8px 0", borderColor:"rgba(37,99,235,0.4)"})}>
                              {matchup.teamB.emoji + " " + matchup.teamB.name + " wins"}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {tab === "h2h" && (
        <div>
          <div style={S.card}>
            <div style={S.cardTitle}>⚔️ Head-to-Head Bets</div>
            <div style={Object.assign({}, S.label, {marginBottom:12})}>Matched book — like a betting exchange. Side A units pair 1-for-1 against Side B at even money; whatever doesn't match is void. Only Carl can create, size (− / +), and settle.</div>

            <div style={Object.assign({}, S.label, {marginBottom:12})}>Matched book: Side A units pair 1-for-1 against Side B (even money at the stake). First in line matches first; unmatched units are void. Use − / + to size a bet; matched units 🔒 lock.</div>

            {h2hBets.map(function(bet) {
              var u = h2hUnits(bet);
              var aU = u.aU, bU = u.bU, aT = u.aT, bT = u.bT;
              var mm = matchOu(aU, bU, aT, bT); // aU -> over, bU -> under
              var aIds = Object.keys(aU).filter(function(id){ return (aU[id]||0)>=1; }).sort(function(x,y){ return (aT[x]||0)-(aT[y]||0); });
              var bIds = Object.keys(bU).filter(function(id){ return (bU[id]||0)>=1 && aIds.indexOf(id)<0; }).sort(function(x,y){ return (bT[x]||0)-(bT[y]||0); });
              var inAny = aIds.concat(bIds);
              var undecided = players.filter(function(pl){ return inAny.indexOf(pl.id)<0; });
              var stake = bet.stake || DEFAULT_BUYIN;
              var aUnmatched = mm.overTotal - mm.matched, bUnmatched = mm.underTotal - mm.matched;
              var winSide = bet.winningSide;
              function fn(id){ var pl=players.find(function(x){return x.id===id;}); return pl?pl.emoji+" "+pl.name.split(" ")[0]:id; }
              function matchedFor(id, side){ return ((side==="a"?mm.overMatched:mm.underMatched)[id])||0; }

              // Single writer (Carl), so units live on the bet object and write via update().
              // Setting a side clears the player from the other side. 0 units = removed.
              function setH2h(pid, side, n, curTs) {
                if (!props.canEdit) return;
                var nv = Math.max(0, n);
                var ts = curTs || Date.now(); // keep place in line on +/-; brand-new = now
                update({h2hBets: h2hBets.map(function(b) {
                  if (b.id !== bet.id) return b;
                  var uu = h2hUnits(b); // migrate legacy sides -> units on first edit
                  var na = Object.assign({}, uu.aU), nb2 = Object.assign({}, uu.bU);
                  var nat = Object.assign({}, uu.aT), nbt = Object.assign({}, uu.bT);
                  if (side === "a") {
                    delete nb2[pid]; delete nbt[pid];
                    if (nv <= 0) { delete na[pid]; delete nat[pid]; } else { na[pid] = nv; nat[pid] = ts; }
                  } else {
                    delete na[pid]; delete nat[pid];
                    if (nv <= 0) { delete nb2[pid]; delete nbt[pid]; } else { nb2[pid] = nv; nbt[pid] = ts; }
                  }
                  return Object.assign({}, b, {aUnits:na, bUnits:nb2, aTimes:nat, bTimes:nbt});
                })});
              }
              function settleBet(side) {
                update({h2hBets: h2hBets.map(function(b) { return b.id===bet.id ? Object.assign({}, b, {settled:true, winningSide:side, winner:side==="a"?bet.bettor:bet.opponent}) : b; })});
              }
              function unsettleBet() {
                update({h2hBets: h2hBets.map(function(b) { return b.id===bet.id ? Object.assign({}, b, {settled:false, winningSide:null, winner:null}) : b; })});
              }

              function chip(id, side, umap, tmap) {
                var cnt = umap[id]||0, mcnt = matchedFor(id, side); var c = side==="a"?CL.red:CL.blue;
                var canDec = !bet.settled && props.canEdit && cnt>mcnt; // hard-lock matched units
                return <span key={id+side} style={Object.assign({},S.pillBtn,{background:side==="a"?"rgba(240,69,74,0.18)":"rgba(111,172,255,0.18)",borderColor:c,color:c,display:"inline-flex",alignItems:"center",gap:4,padding:"4px 7px",marginRight:4,marginBottom:4})}>
                  {!bet.settled && <span onClick={function(){ if(canDec) setH2h(id,side,cnt-1,tmap[id]); }} style={{cursor:canDec?"pointer":"not-allowed",fontWeight:700,fontSize:16,lineHeight:1,padding:"0 3px",opacity:canDec?1:0.25}}>−</span>}
                  <span style={{fontSize:12}}>{fn(id)}{id===bet.bettor||id===bet.opponent?" ★":""}</span>
                  <span style={{fontSize:12,fontWeight:800}}>{"×"+cnt}</span>
                  {mcnt>0 && <span style={{fontSize:10,opacity:0.85}} title="matched / locked">{"🔒"+mcnt}</span>}
                  {!bet.settled && <span onClick={function(){ if(props.canEdit) setH2h(id,side,cnt+1,tmap[id]); }} style={{cursor:"pointer",fontWeight:700,fontSize:16,lineHeight:1,padding:"0 3px",opacity:props.canEdit?1:0.4}}>+</span>}
                </span>;
              }
              function sideBox(label, ids, side, umap, tmap, color, won) {
                var tot = ids.reduce(function(s,id){ return s+(umap[id]||0); }, 0);
                var mtot = ids.reduce(function(s,id){ return s+matchedFor(id,side); }, 0);
                return (
                  <div style={Object.assign({}, S.teamBox, bet.settled && won ? S.teamBoxWin : {}, {flex:1})}>
                    <div style={{fontSize:12,fontWeight:700,color:color,fontFamily:"system-ui",marginBottom:6}}>{label+" · "+tot+"u · "+mtot+" matched"}</div>
                    {ids.length===0 && <div style={{fontSize:12,color:CL.muted,fontFamily:"system-ui"}}>—</div>}
                    <div style={{display:"flex",flexWrap:"wrap"}}>{ids.map(function(id){ return chip(id,side,umap,tmap); })}</div>
                  </div>
                );
              }

              return (
                <div key={bet.id} style={Object.assign({padding:"12px 0"}, S.separator)}>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start"}}>
                    <div style={{flex:1}}>
                      {bet.course && <div style={{display:"inline-block", fontSize:11, fontWeight:700, color:"#22c55e", fontFamily:"system-ui", background:"rgba(34,197,94,0.12)", padding:"3px 10px", borderRadius:10, marginBottom:4}}>{bet.course}</div>}
                      <div style={{fontSize:15, fontWeight:600, color:bet.settled?CL.muted:"#fff", textDecoration:bet.settled?"line-through":"none"}}>{bet.description}</div>
                      <div style={{fontSize:13, color:CL.red, fontFamily:"system-ui"}}>{"$"+stake+"/unit · "+mm.matched+" matched ($"+(mm.matched*stake)+" at stake each side)"}</div>
                    </div>
                    {!bet.settled && props.canEdit && <button style={{background:"none", border:"none", color:CL.muted, cursor:"pointer", fontSize:14, flexShrink:0}} onClick={function() { if (confirm("Delete this bet?")) update({h2hBets:h2hBets.filter(function(b) { return b.id!==bet.id; })}); }}>🗑</button>}
                  </div>

                  <div style={{display:"flex", gap:8, marginTop:10}}>
                    {sideBox("SIDE A", aIds, "a", aU, aT, CL.red, winSide==="a")}
                    <div style={{display:"flex", alignItems:"center", color:CL.muted, fontWeight:700, fontFamily:"system-ui", fontSize:13}}>vs</div>
                    {sideBox("SIDE B", bIds, "b", bU, bT, CL.blue, winSide==="b")}
                  </div>

                  <div style={{fontSize:11,color:(aUnmatched>0||bUnmatched>0)?CL.red:CL.muted,fontFamily:"system-ui",marginTop:6}}>{"⚖️ "+mm.matched+" unit"+(mm.matched!==1?"s":"")+" matched"+(aUnmatched>0?" · "+aUnmatched+" Side A unmatched (void unless B catches up)":bUnmatched>0?" · "+bUnmatched+" Side B unmatched (void unless A catches up)":"")}</div>

                  {bet.settled ? (
                    <div style={{marginTop:8}}>
                      <div style={{fontSize:14, color:mm.matched===0?CL.muted:"#22c55e", fontFamily:"system-ui"}}>{mm.matched===0 ? ("Settled Side "+(winSide==="a"?"A":"B")+" — no units matched, nothing moves") : ("🏆 Side "+(winSide==="a"?"A":"B")+" wins — "+mm.matched+" matched unit"+(mm.matched!==1?"s":"")+" settle even money at $"+stake+" each. Unmatched units void.")}</div>
                      {props.canEdit && <button onClick={unsettleBet} style={{marginTop:6, fontSize:11, color:CL.muted, fontFamily:"system-ui", background:"none", border:"1px solid "+CL.border, borderRadius:6, padding:"5px 12px", cursor:"pointer"}}>↩ Undo — reopen bet</button>}
                    </div>
                  ) : (
                    <div style={{marginTop:8}}>
                      {props.canEdit && undecided.length>0 && (
                        <div style={{marginBottom:8}}>
                          <div style={{fontSize:11,color:CL.muted,fontFamily:"system-ui",marginBottom:4}}>Add to a side (then − / + for more units):</div>
                          {undecided.map(function(pl){ return (
                            <div key={pl.id} style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                              <div style={{flex:1,fontSize:13,color:"#fff",fontFamily:"system-ui"}}>{pl.emoji+" "+pl.name}</div>
                              <button onClick={function(){ setH2h(pl.id,"a",1); }} style={Object.assign({}, S.pillBtn, {fontSize:11,padding:"4px 10px",borderColor:"rgba(240,69,74,0.5)",color:CL.red})}>→ Side A</button>
                              <button onClick={function(){ setH2h(pl.id,"b",1); }} style={Object.assign({}, S.pillBtn, {fontSize:11,padding:"4px 10px",borderColor:"rgba(111,172,255,0.5)",color:CL.blue})}>→ Side B</button>
                            </div>
                          ); })}
                        </div>
                      )}
                      {props.canEdit ? (
                        (aIds.length>0||bIds.length>0) && (
                        <div>
                          <div style={{fontSize:11,color:CL.muted,fontFamily:"system-ui",marginBottom:4}}>Settle — which side won?</div>
                          <div style={{display:"flex", gap:6}}>
                            <button onClick={function() { settleBet("a"); }} style={Object.assign({}, S.pillBtn, {flex:1, textAlign:"center", padding:"8px 0", borderColor:"rgba(220,38,38,0.4)"})}>Side A wins</button>
                            <button onClick={function() { settleBet("b"); }} style={Object.assign({}, S.pillBtn, {flex:1, textAlign:"center", padding:"8px 0", borderColor:"rgba(37,99,235,0.4)"})}>Side B wins</button>
                          </div>
                        </div>
                        )
                      ) : (
                        <div style={{marginTop:8, fontSize:11, color:CL.muted, fontFamily:"system-ui", textAlign:"center"}}>Only Carl can settle the result</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {h2hBets.length === 0 && <div style={{textAlign:"center", padding:16, color:CL.muted, fontFamily:"system-ui", fontSize:13}}>No bets yet. Create one below.</div>}
          </div>

          {props.canEdit && (
          <div style={S.card}>
            <div style={S.cardTitle}>+ New Head-to-Head Bet</div>

            <div style={Object.assign({}, S.label, {marginBottom:6})}>Course / Round</div>
            <div style={{display:"flex", gap:4, flexWrap:"wrap", marginBottom:10}}>
              {COURSES.map(function(c, i) {
                var sel = h2hCourse === c.name;
                return <button key={i} onClick={function() { setH2hCourse(sel ? "" : c.name); }} style={Object.assign({}, S.pillBtn, sel ? {background:"rgba(34,197,94,0.2)", borderColor:"#22c55e", color:"#22c55e"} : {})}>{COURSE_LABELS[i]}</button>;
              })}
              <button onClick={function() { setH2hCourse(h2hCourse==="Whole Trip" ? "" : "Whole Trip"); }} style={Object.assign({}, S.pillBtn, h2hCourse==="Whole Trip" ? {background:"rgba(34,197,94,0.2)", borderColor:"#22c55e", color:"#22c55e"} : {})}>Trip</button>
            </div>

            <div style={Object.assign({}, S.label, {marginBottom:6})}>Player 1</div>
            <div style={{display:"flex", gap:4, flexWrap:"wrap", marginBottom:8}}>
              {players.map(function(p) {
                var sel = bettor === p.id;
                return <button key={p.id} onClick={function() { setBettor(p.id); }} style={Object.assign({}, S.pillBtn, sel ? {background:"rgba(220,38,38,0.2)", borderColor:CL.red, color:CL.red} : {})}>{p.emoji+" "+p.name.split(" ")[0]}</button>;
              })}
            </div>
            <div style={Object.assign({}, S.label, {marginBottom:6})}>vs Player 2</div>
            <div style={{display:"flex", gap:4, flexWrap:"wrap", marginBottom:10}}>
              {players.filter(function(p) { return p.id !== bettor; }).map(function(p) {
                var sel = opponent === p.id;
                return <button key={p.id} onClick={function() { setOpponent(p.id); }} style={Object.assign({}, S.pillBtn, sel ? {background:"rgba(37,99,235,0.2)", borderColor:CL.blue, color:CL.blue} : {})}>{p.emoji+" "+p.name.split(" ")[0]}</button>;
              })}
            </div>

            <div style={Object.assign({}, S.label, {marginBottom:6})}>Bet Amount ($ each)</div>
            <input style={Object.assign({}, S.input, {width:120})} value={h2hAmt} onChange={function(e) { setH2hAmt(e.target.value); }} placeholder="$ amount" type="number"/>

            <div style={Object.assign({}, S.label, {marginBottom:6, marginTop:4})}>Note (optional)</div>
            <input style={S.input} value={h2hText} onChange={function(e) { setH2hText(e.target.value); }} placeholder="e.g. net, gross, low score..."/>

            <button style={Object.assign({}, S.primaryBtn, {opacity:!h2hAmt || !bettor || !opponent ? 0.5 : 1})} onClick={function() {
              if (!h2hAmt || !bettor || !opponent) return;
              var bP = players.find(function(p) { return p.id===bettor; });
              var oP = players.find(function(p) { return p.id===opponent; });
              var courseLabel = h2hCourse || "Whole Trip";
              var autoDesc = (bP ? bP.name.split(" ")[0] : "P1") + " vs " + (oP ? oP.name.split(" ")[0] : "P2") + " · " + courseLabel + (h2hText.trim() ? " ("+h2hText.trim()+")" : "");
              var now = Date.now();
              var aU0 = {}, bU0 = {}, aT0 = {}, bT0 = {};
              aU0[bettor] = 1; bU0[opponent] = 1; aT0[bettor] = now; bT0[opponent] = now;
              update({h2hBets:h2hBets.concat([{id:"h"+now, description:autoDesc, course:courseLabel, note:h2hText.trim(), stake:parseFloat(h2hAmt), bettor:bettor, opponent:opponent, aUnits:aU0, bUnits:bU0, aTimes:aT0, bTimes:bT0, settled:false, winner:null, winningSide:null}])});
              setH2hText(""); setH2hAmt(""); setBettor(null); setOpponent(null); setH2hCourse("");
            }}>Create Bet</button>
          </div>
          )}
        </div>
      )}

      {tab === "games" && (
        <div>
          <div style={{padding:"0 16px", marginBottom:8}}><button style={Object.assign({}, S.addBtn, {width:"100%"})} onClick={function() { update({addingGame:!addingGame}); }}>{addingGame ? "Cancel" : "+ New Side Game"}</button></div>
          {addingGame && (
            <div style={S.card}>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12}}>
                {GAME_TYPES.map(function(gt) { return <button key={gt.id} onClick={function() { setGameType(gt.id); }} style={Object.assign({display:"flex", alignItems:"center", gap:8, padding:10, borderRadius:6, fontSize:13, fontFamily:"system-ui", cursor:"pointer", color:"#fff"}, gameType===gt.id ? S.subTabOn : S.subTabOff)}><span>{gt.icon}</span><span>{gt.name}</span></button>; })}
              </div>
              <select style={Object.assign({}, S.input, {width:"100%"})} value={round} onChange={function(e) { setRound(parseInt(e.target.value)); }}>{COURSES.map(function(c,i) { return <option key={i} value={i}>{"R"+(i+1)+": "+c.name}</option>; })}</select>
              {gameType === "nassau" ? (function() {
                function assign(pid, side) {
                  var inA = nsA.indexOf(pid) >= 0, inB = nsB.indexOf(pid) >= 0;
                  if (side === "a") {
                    if (inA) { setNsA(nsA.filter(function(x){return x!==pid;})); return; }
                    if (nsA.length >= 2) return;
                    if (inB) setNsB(nsB.filter(function(x){return x!==pid;}));
                    setNsA(nsA.concat([pid]));
                  } else {
                    if (inB) { setNsB(nsB.filter(function(x){return x!==pid;})); return; }
                    if (nsB.length >= 2) return;
                    if (inA) setNsA(nsA.filter(function(x){return x!==pid;}));
                    setNsB(nsB.concat([pid]));
                  }
                }
                return (
                  <div>
                    <div style={Object.assign({}, S.label, {marginTop:10, marginBottom:6})}>Net match play · 1-v-1 or 2-v-2 · pick up to 2 per side</div>
                    {players.map(function(p) {
                      var inA = nsA.indexOf(p.id) >= 0, inB = nsB.indexOf(p.id) >= 0;
                      return (
                        <div key={p.id} style={{display:"flex", alignItems:"center", gap:6, marginBottom:5}}>
                          <div style={{flex:1, fontSize:13, color:"#fff", fontFamily:"system-ui"}}>{p.emoji+" "+p.name}</div>
                          <button onClick={function(){ assign(p.id, "a"); }} style={Object.assign({}, S.pillBtn, {fontSize:12, padding:"5px 14px"}, inA ? {background:CL.blue, color:"#fff", borderColor:CL.blue} : {})}>A</button>
                          <button onClick={function(){ assign(p.id, "b"); }} style={Object.assign({}, S.pillBtn, {fontSize:12, padding:"5px 14px"}, inB ? {background:CL.red, color:"#fff", borderColor:CL.red} : {})}>B</button>
                        </div>
                      );
                    })}
                    <div style={{display:"flex", gap:8, marginTop:8}}>
                      <div style={{flex:1}}><div style={Object.assign({}, S.label, {marginBottom:4})}>Front $</div><input style={Object.assign({}, S.input, {margin:0})} type="number" value={nsFront} onChange={function(e){ setNsFront(e.target.value); }}/></div>
                      <div style={{flex:1}}><div style={Object.assign({}, S.label, {marginBottom:4})}>Back $</div><input style={Object.assign({}, S.input, {margin:0})} type="number" value={nsBack} onChange={function(e){ setNsBack(e.target.value); }}/></div>
                      <div style={{flex:1}}><div style={Object.assign({}, S.label, {marginBottom:4})}>Total $</div><input style={Object.assign({}, S.input, {margin:0})} type="number" value={nsTotal} onChange={function(e){ setNsTotal(e.target.value); }}/></div>
                    </div>
                    <div style={{fontSize:11, color:CL.muted, fontFamily:"system-ui", marginTop:6}}>Each player wins/loses these amounts per segment. Auto-scored from the round — no manual entry.</div>
                    <button style={Object.assign({}, S.primaryBtn, {opacity:(nsA.length===0||nsB.length===0)?0.5:1})} onClick={addGame}>Save Nassau</button>
                  </div>
                );
              })() : (
                <div>
                  <input style={Object.assign({}, S.input, {width:"100%", marginTop:8})} type="number" value={stake} onChange={function(e) { setStake(e.target.value); }} placeholder="Stake $"/>
                  <div style={Object.assign({}, S.cardTitle, {marginTop:8})}>Results (+ won / - lost)</div>
                  {players.map(function(p) { return <div key={p.id} style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", fontSize:14, color:"#fff"}}><span>{p.emoji+" "+p.name}</span><input style={Object.assign({}, S.input, {width:80, margin:0})} type="number" value={results[p.id]||""} onChange={function(e) { var r = Object.assign({},results); r[p.id] = parseFloat(e.target.value)||0; setResults(r); }} placeholder="$0"/></div>; })}
                  <button style={S.primaryBtn} onClick={addGame}>Save Game</button>
                </div>
              )}
            </div>
          )}
          {games.length > 0 && (
            <div style={S.card}>
              <div style={S.cardTitle}>Game Log</div>
              {games.map(function(g) { var gt = GAME_TYPES.find(function(t) { return t.id===g.type; });
                if (g.type === "nassau") {
                  var nr = nassauResult(g, players, scores);
                  var nm = function(id){ var p=players.find(function(x){return x.id===id;}); return p?p.name.split(" ")[0]:id; };
                  var aNames = (g.sideA||[]).map(nm).join(" & "), bNames = (g.sideB||[]).map(nm).join(" & ");
                  function segLine(label, seg) {
                    if (!seg) return null;
                    var txt, col;
                    if (!seg.complete) { txt = (seg.aWon===seg.bWon ? "all square" : (seg.aWon>seg.bWon?aNames:bNames)+" "+Math.abs(seg.aWon-seg.bWon)+" up")+" (in progress)"; col = CL.muted; }
                    else if (seg.winner === null) { txt = "halved — no money"; col = CL.muted; }
                    else { txt = (seg.winner==="a"?aNames:bNames)+" win · +$"+(Math.round((seg.winEach||0)*100)/100)+" each"; col = "#22c55e"; }
                    return <div key={label} style={{display:"flex", justifyContent:"space-between", fontSize:12, fontFamily:"system-ui", marginTop:2}}><span style={{color:CL.muted}}>{label+" ($"+(seg.val||0)+")"}</span><span style={{color:col}}>{txt}</span></div>;
                  }
                  return (
                    <div key={g.id} style={Object.assign({padding:"10px 0"}, S.separator)}>
                      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start"}}>
                        <div style={{flex:1}}>
                          <div style={{fontSize:14, color:"#fff", fontFamily:"system-ui"}}>{"🏌️ Nassau — "+aNames+" vs "+bNames}</div>
                          <div style={S.label}>{"R"+((g.round||0)+1)+" · "+COURSES[g.round||0].name+" · net match play"}</div>
                        </div>
                        <button style={{background:"none", border:"none", color:CL.muted, cursor:"pointer", fontSize:16, flexShrink:0}} onClick={function() { update({games:games.filter(function(x) { return x.id!==g.id; })}); }}>✕</button>
                      </div>
                      <div style={{marginTop:4}}>
                        {segLine("Front 9", nr.segments.front)}
                        {segLine("Back 9", nr.segments.back)}
                        {segLine("Total 18", nr.segments.total)}
                      </div>
                    </div>
                  );
                }
                return (
                <div key={g.id} style={Object.assign({display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0"}, S.separator)}>
                  <div><div style={{fontSize:14, color:"#fff"}}>{(gt?gt.icon:"")+" "+(gt?gt.name:"")}</div><div style={S.label}>{"R"+(g.round+1)+" · $"+g.stake}</div></div>
                  <button style={{background:"none", border:"none", color:CL.muted, cursor:"pointer", fontSize:16}} onClick={function() { update({games:games.filter(function(x) { return x.id!==g.id; })}); }}>✕</button>
                </div>); })}
            </div>
          )}
        </div>
      )}

      {tab === "settle" && (
        <div>
          <div style={S.card}>
            <div style={S.cardTitle}>💸 Settle Up</div>
            <div style={Object.assign({}, S.label, {marginBottom:12})}>Who owes who across every bet, game, and expense</div>
            {(function() {
              var transfers = calculateSettleUp(players, games, bets, h2hBets, teamMatches, individualProps, expenses, scores, skinsEligible, foursomeMatches, overUnderProps, manualWinners);
              if (transfers.length === 0) return (
                <div style={{textAlign:"center", padding:20, color:CL.muted, fontFamily:"system-ui", fontSize:14}}>
                  Everyone's even — nothing to settle yet.
                </div>
              );
              return (
                <div>
                  {transfers.map(function(t, i) {
                    return (
                      <div key={i} style={{display:"flex", alignItems:"center", padding:"12px 0", gap:8, borderBottom:i < transfers.length - 1 ? "1px solid " + CL.border : "none"}}>
                        <div style={{flex:1, textAlign:"right"}}>
                          <div style={{fontSize:16, fontWeight:600, color:"#fff", fontFamily:"system-ui"}}>{t.from.emoji + " " + t.from.name.split(" ")[0]}</div>
                        </div>
                        <div style={{display:"flex", flexDirection:"column", alignItems:"center", minWidth:80}}>
                          <div style={{fontSize:18, fontWeight:700, color:CL.red, fontFamily:"system-ui"}}>{"$" + t.amount}</div>
                          <div style={{fontSize:10, color:CL.muted, fontFamily:"system-ui"}}>→ pays →</div>
                        </div>
                        <div style={{flex:1}}>
                          <div style={{fontSize:16, fontWeight:600, color:"#fff", fontFamily:"system-ui"}}>{t.to.emoji + " " + t.to.name.split(" ")[0]}</div>
                        </div>
                      </div>
                    );
                  })}
                  <div style={{marginTop:12, padding:10, background:"rgba(37,99,235,0.1)", borderRadius:6, border:"1px solid rgba(37,99,235,0.2)"}}>
                    <div style={{fontSize:11, color:CL.blue, fontFamily:"system-ui", fontWeight:600, marginBottom:4}}>SUMMARY</div>
                    <div style={{fontSize:12, color:CL.muted, fontFamily:"system-ui"}}>
                      {transfers.length + " payment" + (transfers.length !== 1 ? "s" : "") + " to settle every bet — Team & Individual Stableford, Skins, Props, H2H, side games, and expenses."}
                    </div>
                    <div style={{fontSize:11, color:tripDone ? "#22c55e" : "#f59e0b", fontFamily:"system-ui", marginTop:6, fontStyle:"italic"}}>
                      {tripDone
                        ? "✓ All rounds posted — score-based bets are final."
                        : "● Live — Stableford & Skins update as scores come in and lock once all 5 rounds are posted. Amounts shown are provisional."}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
          <div style={S.card}>
            <div style={S.cardTitle}>Net Balances<StatusTag final={tripDone} /></div>
            {players.map(function(p) { return Object.assign({}, p, {net:netMoney(p.id)}); }).sort(function(a,b) { return b.net - a.net; }).map(function(p) {
              return (
                <div key={p.id} style={Object.assign({display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", fontSize:14, color:"#fff"}, S.separator)}>
                  <span>{p.emoji + " " + p.name}</span>
                  <span style={{fontWeight:700, fontSize:16, fontFamily:"system-ui", color:p.net > 0 ? "#22c55e" : p.net < 0 ? "#ef4444" : CL.muted}}>{(p.net > 0 ? "+" : "") + (p.net === 0 ? "Even" : "$" + p.net)}</span>
                </div>
              );
            })}
          </div>
          {!props.isGuest && (
            <div style={Object.assign({}, S.card, {borderColor:"#7f1d1d"})}>
              <button style={{width:"100%", padding:12, background:"#7f1d1d", color:"#fff", border:"none", borderRadius:6, fontSize:13, cursor:"pointer", fontFamily:"system-ui"}} onClick={resetAll}>Reset All Data</button>
            </div>
          )}
        </div>
      )}

      {tab === "drinks" && (
        <div>
          <div style={S.card}>
            <div style={S.cardTitle}>🍺 Drink Tracker</div>
            <div style={Object.assign({}, S.label, {marginBottom:12})}>Tap + to add, tap the count to remove one.</div>
            {players.slice().sort(function(a,b) { return totalDrinks(b.id)-totalDrinks(a.id); }).map(function(p) {
              var pd = drinks[p.id] || {pints:0, whiskey:0, wine:0, other:0};
              return (
                <div key={p.id} style={Object.assign({padding:"12px 0"}, S.separator)}>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8}}>
                    <div style={{fontSize:16, fontWeight:600, color:"#fff"}}>{p.emoji+" "+p.name}</div>
                    <div style={{fontSize:16, fontWeight:700, color:totalDrinks(p.id)>0?CL.red:CL.muted, fontFamily:"system-ui"}}>{totalDrinks(p.id)}</div>
                  </div>
                  <div style={{display:"flex", gap:6}}>
                    {DRINK_TYPES.map(function(dt) {
                      var count = pd[dt.id] || 0;
                      return (
                        <div key={dt.id} style={{flex:1, textAlign:"center", background:"rgba(30,58,95,0.2)", borderRadius:8, padding:"6px 2px", border:"1px solid "+CL.border}}>
                          <div style={{fontSize:16}}>{dt.emoji}</div>
                          <div style={{fontSize:14, fontWeight:700, color:"#fff", fontFamily:"system-ui", cursor:"pointer", minHeight:20}} onClick={function() { removeDrink(p.id, dt.id); }}>{count>0?count:"·"}</div>
                          <button onClick={function() { addDrink(p.id, dt.id); }} style={{background:CL.red, color:"#fff", border:"none", borderRadius:4, padding:"2px 10px", fontSize:14, fontWeight:700, cursor:"pointer", marginTop:2}}>+</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={S.card}>
            <div style={S.cardTitle}>🏆 Drink Leaderboard</div>
            {players.map(function(p) { return Object.assign({},p,{total:totalDrinks(p.id)}); }).sort(function(a,b) { return b.total-a.total; }).map(function(p,i) {
              var pd = drinks[p.id] || {};
              return (
                <div key={p.id} style={Object.assign({display:"flex", alignItems:"center", padding:"8px 0", gap:10}, S.separator)}>
                  <div style={{fontSize:16, width:24, textAlign:"center"}}>{i===0?"👑":i+1}</div>
                  <div style={{flex:1}}><div style={{fontSize:16, fontWeight:600, color:"#fff", fontFamily:"system-ui"}}>{p.emoji+" "+p.name}</div><div style={{fontSize:10, color:CL.muted, fontFamily:"system-ui"}}>{(pd.pints?pd.pints+"🍺 ":"")+(pd.whiskey?pd.whiskey+"🥃 ":"")+(pd.wine?pd.wine+"🍷 ":"")+(pd.other?pd.other+"🍹":"")}</div></div>
                  <div style={{fontSize:18, fontWeight:700, color:p.total>0?CL.red:CL.muted, fontFamily:"system-ui"}}>{p.total}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CHAT ────────────────────────────────────────────────────────────
// ─── EXPENSES TAB ────────────────────────────────────────────────────
function ExpensesTab(props) {
  var players = props.players, expenses = props.expenses || [], update = props.update;
  var expCat = useState(""); var expCategory = expCat[0], setExpCategory = expCat[1];
  var expDesc = useState(""); var expDescription = expDesc[0], setExpDescription = expDesc[1];
  var expAmt = useState(""); var expAmount = expAmt[0], setExpAmount = expAmt[1];
  var expPayer = useState(null); var payer = expPayer[0], setPayer = expPayer[1];
  var expSplit = useState(players.map(function(p) { return p.id; })); var splitAmong = expSplit[0], setSplitAmong = expSplit[1];
  var expAdding = useState(false); var adding = expAdding[0], setAdding = expAdding[1];

  var totalSpent = expenses.reduce(function(t, e) { return t + (e.amount || 0); }, 0);

  function toggleSplit(pid) {
    if (splitAmong.indexOf(pid) >= 0) setSplitAmong(splitAmong.filter(function(id) { return id !== pid; }));
    else setSplitAmong(splitAmong.concat([pid]));
  }

  function addExpense() {
    if (!payer || !expAmount || splitAmong.length === 0) return;
    var payerP = players.find(function(p) { return p.id === payer; });
    var newExp = {
      id: "exp" + Date.now(),
      description: expDescription.trim() || "Expense",
      amount: parseFloat(expAmount),
      payer: payer,
      payerName: payerP ? payerP.name : "",
      category: expCategory || "other",
      splitAmong: splitAmong.slice(),
      ts: new Date().toISOString(),
    };
    update({ expenses: expenses.concat([newExp]) });
    setExpDescription(""); setExpAmount(""); setPayer(null); setExpCategory("");
    setSplitAmong(players.map(function(p) { return p.id; }));
    setAdding(false);
  }

  var catMap = {};
  EXPENSE_CATEGORIES.forEach(function(c) { catMap[c.id] = c; });

  return (
    <div>
      <div style={S.pageHeader}>
        <div style={S.pageTitle}>Trip Expenses</div>
        {!props.isGuest && <button onClick={function() { setAdding(!adding); }} style={Object.assign({}, S.addBtn, {fontSize:14})}>{adding ? "Cancel" : "+ Add"}</button>}
      </div>
      {props.isGuest && <div style={{margin:"0 16px 8px", padding:"8px 12px", background:"rgba(111,172,255,0.1)", border:"1px solid "+CL.border, borderRadius:8, fontSize:12, color:CL.muted, fontFamily:"system-ui"}}>👁️ View only — Brian & Carl manage the books. Give them your expenses to log.</div>}

      {/* Summary card */}
      <div style={S.card}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12}}>
          <div>
            <div style={{fontSize:28, fontWeight:700, color:"#fff", fontFamily:"system-ui"}}>{"$"+totalSpent.toFixed(2)}</div>
            <div style={S.label}>{expenses.length+" expense"+(expenses.length!==1?"s":"")+" total"}</div>
          </div>
        </div>

        {/* Per-person net amount */}
        {expenses.length > 0 && (
          <div>
            <div style={{fontSize:12, color:CL.muted, fontFamily:"system-ui", fontWeight:600, marginBottom:6}}>NET BALANCE</div>
            {players.map(function(p) {
              var share = 0;
              var paid = 0;
              expenses.forEach(function(exp) {
                if (!exp.splitAmong || exp.splitAmong.length === 0) return;
                if (exp.splitAmong.indexOf(p.id) >= 0) share += exp.amount / exp.splitAmong.length;
                if (exp.payer === p.id) paid += exp.amount;
              });
              var net = paid - share;
              var color = net > 0.01 ? "#22c55e" : net < -0.01 ? CL.red : CL.muted;
              return (
                <div key={p.id} style={Object.assign({display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0"}, S.separator)}>
                  <div>
                    <div style={{fontSize:15, color:"#fff", fontFamily:"system-ui"}}>{p.emoji+" "+p.name}</div>
                    <div style={{fontSize:12, color:CL.muted, fontFamily:"system-ui"}}>{"share $"+share.toFixed(2)+(paid > 0 ? " · paid $"+paid.toFixed(2) : "")}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:16, fontWeight:700, color:color, fontFamily:"system-ui"}}>{net > 0.01 ? "+$"+net.toFixed(2) : net < -0.01 ? "-$"+Math.abs(net).toFixed(2) : "$0.00"}</div>
                    <div style={{fontSize:11, color:color, fontFamily:"system-ui"}}>{net > 0.01 ? "owed back" : net < -0.01 ? "owes" : "even"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

        {expenses.length === 0 && !adding && (
          <div style={S.card}><div style={{textAlign:"center", padding:20}}>
            <div style={{fontSize:36, marginBottom:8}}>💳</div>
            <div style={{fontSize:14, color:CL.muted, fontFamily:"system-ui"}}>No expenses yet. Tap + Add to log the first one.</div>
          </div></div>
        )}

      {/* Add expense form */}
      {adding && (
        <div style={S.card}>
          <div style={S.cardTitle}>+ New Expense</div>

          <div style={Object.assign({}, S.label, {marginBottom:6})}>What was it for?</div>
          <input style={S.input} value={expDescription} onChange={function(e) { setExpDescription(e.target.value); }} placeholder="e.g. Dinner at Bushmills Inn"/>

          <div style={Object.assign({}, S.label, {marginBottom:6})}>Category</div>
          <div style={{display:"flex", gap:4, flexWrap:"wrap", marginBottom:10}}>
            {EXPENSE_CATEGORIES.map(function(cat) {
              var sel = expCategory === cat.id;
              return <button key={cat.id} onClick={function() { setExpCategory(sel ? "" : cat.id); }} style={Object.assign({}, S.pillBtn, sel ? {background:"rgba(34,197,94,0.2)", borderColor:"#22c55e", color:"#22c55e"} : {})}>{cat.emoji+" "+cat.label}</button>;
            })}
          </div>

          <div style={Object.assign({}, S.label, {marginBottom:6})}>Amount ($)</div>
          <input style={Object.assign({}, S.input, {width:140})} value={expAmount} onChange={function(e) { setExpAmount(e.target.value); }} placeholder="$ total amount" type="number"/>

          <div style={Object.assign({}, S.label, {marginBottom:6})}>Who paid?</div>
          <div style={{display:"flex", gap:4, flexWrap:"wrap", marginBottom:10}}>
            {players.map(function(p) {
              var sel = payer === p.id;
              return <button key={p.id} onClick={function() { setPayer(p.id); }} style={Object.assign({}, S.pillBtn, sel ? {background:"rgba(240,69,74,0.2)", borderColor:CL.red, color:CL.red} : {})}>{p.emoji+" "+p.name.split(" ")[0]}</button>;
            })}
          </div>

          <div style={Object.assign({}, S.label, {marginBottom:6})}>Split among ({splitAmong.length+" of "+players.length})</div>
          <div style={{display:"flex", gap:4, flexWrap:"wrap", marginBottom:6}}>
            {players.map(function(p) {
              var included = splitAmong.indexOf(p.id) >= 0;
              return <button key={p.id} onClick={function() { toggleSplit(p.id); }} style={Object.assign({}, S.pillBtn, included ? {background:"rgba(111,172,255,0.2)", borderColor:CL.blue, color:CL.blue} : {opacity:0.5})}>{p.emoji+" "+p.name.split(" ")[0]}</button>;
            })}
          </div>
          <div style={{display:"flex", gap:8, marginBottom:10}}>
            <button onClick={function() { setSplitAmong(players.map(function(p) { return p.id; })); }} style={Object.assign({}, S.pillBtn, {fontSize:12})}>All 8</button>
            <button onClick={function() { setSplitAmong([]); }} style={Object.assign({}, S.pillBtn, {fontSize:12})}>None</button>
          </div>

          {splitAmong.length > 0 && expAmount && (
            <div style={{fontSize:14, color:CL.blue, fontFamily:"system-ui", fontWeight:600, marginBottom:12}}>{"= $"+(parseFloat(expAmount)/splitAmong.length).toFixed(2)+" per person"}</div>
          )}

          <button style={Object.assign({}, S.primaryBtn, {opacity:!payer || !expAmount || splitAmong.length === 0 ? 0.5 : 1})} onClick={addExpense}>Add Expense</button>
        </div>
      )}

      {/* Expense list */}
      {expenses.length > 0 && (
        <div style={S.card}>
          <div style={S.cardTitle}>📋 All Expenses</div>
          {expenses.slice().reverse().map(function(exp) {
            var payerP = players.find(function(p) { return p.id === exp.payer; });
            var cat = catMap[exp.category] || catMap.other;
            var perPerson = exp.splitAmong ? (exp.amount / exp.splitAmong.length) : exp.amount;
            return (
              <div key={exp.id} style={Object.assign({padding:"10px 0"}, S.separator)}>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start"}}>
                  <div style={{display:"flex", gap:10, flex:1}}>
                    <div style={{fontSize:22, flexShrink:0}}>{cat.emoji}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:15, fontWeight:600, color:"#fff", fontFamily:"system-ui"}}>{exp.description}</div>
                      <div style={S.label}>{(payerP ? payerP.emoji+" "+payerP.name.split(" ")[0]+" paid" : "Paid")+" · split "+exp.splitAmong.length+" ways · $"+perPerson.toFixed(2)+"/ea"}</div>
                      <div style={{fontSize:12, color:CL.muted, fontFamily:"system-ui", marginTop:2}}>
                        {exp.splitAmong.map(function(pid) {
                          var sp = players.find(function(x) { return x.id===pid; });
                          return sp ? sp.name.split(" ")[0] : "";
                        }).join(", ")}
                      </div>
                    </div>
                  </div>
                  <div style={{textAlign:"right", flexShrink:0}}>
                    <div style={{fontSize:17, fontWeight:700, color:"#fff", fontFamily:"system-ui"}}>{"$"+exp.amount.toFixed(2)}</div>
                    {!props.isGuest && <button onClick={function() { if (confirm("Delete this expense?")) update({expenses:expenses.filter(function(e) { return e.id!==exp.id; })}); }} style={{background:"none", border:"none", color:CL.muted, cursor:"pointer", fontSize:12, marginTop:2}}>✕ delete</button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChatTab(props) {
  var currentPlayer = props.currentPlayer;
  var ms = useState([]); var messages = ms[0], setMessages = ms[1];
  var ls = useState(true); var setChatLoading = ls[1];
  var ts = useState(""); var text = ts[0], setText = ts[1];

  // Real-time Firebase chat subscription
  useEffect(function() {
    var unsub = subscribeToChat(function(msgs) {
      setMessages(msgs);
      setChatLoading(false);
    });
    return function() { unsub(); };
  }, [setChatLoading, setMessages]);

  function handleSend() {
    if (props.isGuest || !text.trim() || !currentPlayer) return;
    sendChatMessage({
      playerId: currentPlayer.id,
      playerName: currentPlayer.name,
      emoji: currentPlayer.emoji,
      text: text.trim(),
      ts: new Date().toISOString(),
    });
    setText("");
  }

  function handleDelete(msgId) {
    if (props.isGuest) return;
    deleteChatMessage(msgId);
  }

  function formatTime(iso) {
    var d = new Date(iso);
    var now = new Date();
    var diffMs = now - d;
    var diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return diffMin + "m ago";
    var diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return diffHr + "h ago";
    var diffDay = Math.floor(diffHr / 24);
    return diffDay + "d ago";
  }

  var tripDay = getTripDay();

  return (
    <div>
      <div style={S.pageHeader}><div style={S.pageTitle}>Group Chat</div></div>

      {tripDay.status === "active" && (
        <div style={Object.assign({}, S.card, {background:"rgba(220,38,38,0.08)", borderColor:"rgba(220,38,38,0.2)"})}>
          <div style={{fontSize:14, fontWeight:700, color:"#fff", fontFamily:"system-ui"}}>{"📍 Day " + tripDay.day + " of 8"}</div>
          <div style={S.label}>{ITINERARY[tripDay.day] ? ITINERARY[tripDay.day].title : "Trip day"}</div>
        </div>
      )}

      {/* Message input */}
      {props.isGuest ? (
        <div style={{padding:"12px 16px", textAlign:"center"}}><div style={{fontSize:13, color:CL.muted, fontFamily:"system-ui"}}>👁️ Guest view — sign in to send messages</div></div>
      ) : (
        <div style={{padding:"0 16px", marginBottom:8}}>
          <div style={{display:"flex", gap:8}}>
            <input
              style={Object.assign({}, S.input, {flex:1, margin:0, borderRadius:20, paddingLeft:16})}
              value={text}
              onChange={function(e) { setText(e.target.value); }}
              onKeyDown={function(e) { if (e.key === "Enter") handleSend(); }}
              placeholder={currentPlayer ? "Message the group..." : "Select a player first"}
              disabled={!currentPlayer}
            />
            <button onClick={handleSend} disabled={!text.trim()} style={Object.assign({}, S.addBtn, {borderRadius:20, padding:"10px 16px", opacity:!text.trim() ? 0.5 : 1})}>
              Send
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div style={S.card}>
        {messages.length === 0 && (
          <div style={{textAlign:"center", padding:24, color:CL.muted, fontFamily:"system-ui", fontSize:14}}>
            No messages yet. Be the first to post!
          </div>
        )}

        {messages.slice().reverse().map(function(msg) {
          var isMe = currentPlayer && msg.playerId === currentPlayer.id;
          return (
            <div key={msg.id} style={Object.assign({padding:"10px 0"}, S.separator)}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4}}>
                <div style={{display:"flex", alignItems:"center", gap:6}}>
                  <span style={{fontSize:14}}>{msg.emoji}</span>
                  <span style={{fontSize:13, fontWeight:700, color:isMe ? CL.red : "#fff", fontFamily:"system-ui"}}>{msg.playerName}</span>
                </div>
                <div style={{display:"flex", alignItems:"center", gap:8}}>
                  <span style={{fontSize:10, color:CL.muted, fontFamily:"system-ui"}}>{formatTime(msg.ts)}</span>
                  {isMe && <button onClick={function() { handleDelete(msg.id); }} style={{background:"none", border:"none", color:CL.muted, cursor:"pointer", fontSize:12, padding:0}}>✕</button>}
                </div>
              </div>
              <div style={{fontSize:14, color:CL.text, fontFamily:"system-ui", lineHeight:1.4, paddingLeft:26}}>{msg.text}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
