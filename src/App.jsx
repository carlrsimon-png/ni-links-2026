import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { subscribeToState, saveState as firebaseSave, subscribeToChat, sendChatMessage, deleteChatMessage } from "./firebase";

// ─── DATA ────────────────────────────────────────────────────────────
const APP_VERSION = "1.3";
const TRIP_DATE = "2026-06-26T18:00:00-04:00";
const AUTH_KEY = "ni-links-auth";
const GROUP_PIN = "2026";
// Only these players (Brian Smith, Carl Simon) can edit Bets & Expenses — the "gatekeepers" of the books.
const BOOKKEEPER_IDS = ["p2", "p6"];

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
  { name:"Ardglass", location:"Ardglass, Co. Down", par:70, url:"https://ardglassgolfclub.com/",
    scorecard:"https://ardglassgolfclub.com/",
    note:"Founded 1896. Dramatic cliffs, 14th-century castle clubhouse.",
    pars:[4,3,4,4,3,4,3,4,5, 3,5,3,4,4,5,4,4,4],
    si:  [10,16,6,14,18,4,12,2,8, 13,3,7,1,11,15,5,9,17] },
  { name:"Royal County Down", location:"Newcastle, Co. Down", par:71, url:"https://www.royalcountydown.org/",
    scorecard:"https://www.royalcountydown.org/championship_links",
    note:"World Top 5. Old Tom Morris original. Mourne Mountains backdrop.",
    pars:[5,4,4,3,4,4,3,4,4, 3,4,5,4,3,4,4,4,5],
    si:  [8,2,4,14,10,6,16,12,18, 15,5,1,3,17,9,13,7,11] },
  { name:"Castlerock (Mussenden)", location:"Castlerock, Co. Derry", par:73, url:"https://www.castlerockgc.co.uk/",
    scorecard:"https://www.castlerockgc.co.uk/",
    note:"Est. 1901. 'Leg O'Mutton' par 3. Harry Colt design.",
    pars:[4,4,3,3,5,4,4,5,4, 4,5,4,4,3,5,4,4,4],
    si:  [6,2,14,10,4,8,12,16,18, 7,1,5,3,15,9,11,13,17] },
  { name:"Royal Portrush (Dunluce)", location:"Portrush, Co. Antrim", par:72, url:"https://www.royalportrushgolfclub.com/",
    scorecard:"https://www.royalportrushgolfclub.com/courses/the-dunluce/",
    note:"World Top 15. Host of The Open 1951, 2019 & 2025.",
    pars:[4,5,3,4,4,3,5,4,4, 4,4,5,3,4,4,3,4,5],
    si:  [6,10,16,2,8,14,4,12,18, 3,1,9,17,5,7,15,11,13] },
  { name:"Portstewart (Strand)", location:"Portstewart, Co. Derry", par:72, url:"https://www.portstewartgc.co.uk/",
    scorecard:"https://www.portstewartgc.co.uk/",
    note:"Willie Park / Des Giffin design. 'Thistly Hollow' dunes.",
    pars:[4,4,4,3,5,4,3,4,5, 4,3,5,4,4,4,4,4,4],
    si:  [8,4,2,14,6,10,16,12,18, 5,15,1,3,7,9,11,13,17] },
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

const DEFAULT_PROPS = [
  { id:"b1", name:"Low Team Net — Ardglass (WASPs vs Italians)", settled:false, winner:null, buyin:20 },
  { id:"b2", name:"Low Team Net — Royal County Down (WASPs vs Italians)", settled:false, winner:null, buyin:20 },
  { id:"b3", name:"Low Team Net — Castlerock (WASPs vs Italians)", settled:false, winner:null, buyin:20 },
  { id:"b4", name:"Low Team Net — Royal Portrush (WASPs vs Italians)", settled:false, winner:null, buyin:20 },
  { id:"b5", name:"Low Team Net — Portstewart (WASPs vs Italians)", settled:false, winner:null, buyin:20 },
  { id:"b6", name:"WASPs vs Italians — Trip Total Net Strokes", settled:false, winner:null, buyin:50 },
  { id:"b7", name:"WASPs vs Italians — Most Rounds Won", settled:false, winner:null, buyin:10 },
];

// Individual prop bets — winner takes the pot ($10/player buy-in)
const DEFAULT_INDIVIDUAL_PROPS = [
  { id:"ip8", name:"Most Stableford Points (Trip)", desc:"Highest total Stableford points across all 5 rounds", settled:false, winner:null, buyin:10 },
  { id:"ipsf0", name:"Most Stableford — Ardglass", desc:"Most Stableford points at Ardglass", settled:false, winner:null, buyin:10 },
  { id:"ipsf1", name:"Most Stableford — Royal County Down", desc:"Most Stableford points at Royal County Down", settled:false, winner:null, buyin:10 },
  { id:"ipsf2", name:"Most Stableford — Castlerock", desc:"Most Stableford points at Castlerock", settled:false, winner:null, buyin:10 },
  { id:"ipsf3", name:"Most Stableford — Royal Portrush", desc:"Most Stableford points at Royal Portrush", settled:false, winner:null, buyin:10 },
  { id:"ipsf4", name:"Most Stableford — Portstewart", desc:"Most Stableford points at Portstewart", settled:false, winner:null, buyin:10 },
  { id:"ip1", name:"Lowest Net Score (Trip)", desc:"Best net total across all 5 rounds", settled:false, winner:null, buyin:10 },
  { id:"ip3", name:"Most Triple Bogeys or Worse", desc:"Most holes at triple bogey (+3) or higher", settled:false, winner:null, buyin:10 },
  { id:"ip4", name:"Most Pars or Better (Trip)", desc:"Most holes played at par or under", settled:false, winner:null, buyin:10 },
  { id:"ip5", name:"Closest to the Pin — RCD par 3s", desc:"Best on a designated Royal County Down par 3", settled:false, winner:null, buyin:10 },
  { id:"ip7", name:"Best Single Round (Net)", desc:"Lowest net score in any one round", settled:false, winner:null, buyin:10 },
];

const DEFAULT_TEAM_MATCHES = [
  { id:"m1", course:"Ardglass", courseIdx:0, teamA:null, teamB:null, settled:false, winner:null, stake:20 },
  { id:"m2", course:"Royal County Down", courseIdx:1, teamA:null, teamB:null, settled:false, winner:null, stake:20 },
  { id:"m3", course:"Castlerock", courseIdx:2, teamA:null, teamB:null, settled:false, winner:null, stake:20 },
  { id:"m4", course:"Royal Portrush", courseIdx:3, teamA:null, teamB:null, settled:false, winner:null, stake:20 },
  { id:"m5", course:"Portstewart", courseIdx:4, teamA:null, teamB:null, settled:false, winner:null, stake:20 },
];

const DEFAULT_PLAYERS = [
  { id:"p1", name:"Jeff Andrea", handicap:10.2, emoji:"🔴" },
  { id:"p2", name:"Brian Smith", handicap:12.8, emoji:"🔵" },
  { id:"p3", name:"Daniel DiBiasio", handicap:9.2, emoji:"⚪" },
  { id:"p4", name:"Mark McGrath", handicap:7.0, emoji:"🔴" },
  { id:"p5", name:"Steve Lopiano", handicap:12.1, emoji:"🔵" },
  { id:"p6", name:"Carl Simon", handicap:6.7, emoji:"⚪" },
  { id:"p7", name:"Rory Callagy", handicap:7.2, emoji:"🔴" },
  { id:"p8", name:"Eric Ferraris", handicap:5.7, emoji:"🔵" },
];

const TEAM_MATCHUPS = [
  {
    id:"wasps_v_italians",
    name:"WASPs vs Italians",
    teamA: { name:"WASPs", emoji:"🦅", names:["Brian Smith","Mark McGrath","Carl Simon","Rory Callagy"] },
    teamB: { name:"Italians", emoji:"🇮🇹", names:["Jeff Andrea","Daniel DiBiasio","Steve Lopiano","Eric Ferraris"] },
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

const EMOJIS = ["🔴","🔵","⚪","🟡","🟢","🟣","🟠","🟤"];

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
    customBets: [],
    h2hBets: [],
    teamMatches: [],
    drinks: {},
    expenses: [],
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

// Calculate course handicap from handicap index
// Formula: HI × (Slope/113) rounded to nearest integer
function getCourseHandicap(hi, courseIdx) {
  // Slope ratings for each course (standard values)
  var slopes = [126, 140, 132, 136, 130];
  var slope = slopes[courseIdx] || 113;
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

// Team Stableford for a round — sum of the best N scores on the team that round.
// bestN = how many scores count (e.g. 2 of 4). Default: all count.
function getTeamRoundStableford(scores, players, teamIds, ri, bestN) {
  var pts = teamIds.map(function(pid) {
    var p = players.find(function(x) { return x.id === pid; });
    if (!p) return null;
    return getRoundStableford(scores, pid, ri, p.handicap);
  }).filter(function(v) { return v !== null; });
  if (pts.length === 0) return null;
  pts.sort(function(a, b) { return b - a; }); // highest first
  var count = bestN && bestN < pts.length ? bestN : pts.length;
  var t = 0;
  for (var i = 0; i < count; i++) t += pts[i];
  return t;
}

// Team Stableford total across all rounds
function getTeamTotalStableford(scores, players, teamIds, bestN) {
  var t = 0;
  var any = false;
  COURSES.forEach(function(_, ri) {
    var p = getTeamRoundStableford(scores, players, teamIds, ri, bestN);
    if (p !== null) { t += p; any = true; }
  });
  return any ? t : 0;
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

function calculateSettleUp(players, games, bets, h2hBets, teamMatches, individualProps, expenses) {
  var balances = {};
  players.forEach(function(p) { balances[p.id] = 0; });

  // Side games
  games.forEach(function(g) {
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

  // Head-to-head bets (with sides)
  if (h2hBets) {
    h2hBets.forEach(function(b) {
      if (!b.settled) return;
      var sA = b.sideA || [b.bettor];
      var sB = b.sideB || [b.opponent];
      var winSide = b.winningSide === "a" ? sA : sB;
      var loseSide = b.winningSide === "a" ? sB : sA;
      if (winSide.length === 0) return; // no valid winning side
      var loseTotal = loseSide.length * b.stake;
      var winEach = loseTotal / winSide.length;
      loseSide.forEach(function(pid) { balances[pid] = (balances[pid] || 0) - b.stake; });
      winSide.forEach(function(pid) { balances[pid] = (balances[pid] || 0) + winEach; });
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

  // Individual prop bets (single winner takes pot, all buy in)
  if (individualProps) {
    individualProps.forEach(function(prop) {
      if (!prop.settled || !prop.winner) return;
      var buyin = prop.buyin || 10;
      players.forEach(function(p) {
        if (p.id === prop.winner) balances[p.id] = (balances[p.id] || 0) + (buyin * (players.length - 1));
        else balances[p.id] = (balances[p.id] || 0) - buyin;
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

  var creditors = [];
  var debtors = [];
  players.forEach(function(p) {
    var b = balances[p.id] || 0;
    if (b > 0.01) creditors.push({ id:p.id, name:p.name, emoji:p.emoji, amount:b });
    else if (b < -0.01) debtors.push({ id:p.id, name:p.name, emoji:p.emoji, amount:-b });
  });

  creditors.sort(function(a,b) { return b.amount - a.amount; });
  debtors.sort(function(a,b) { return b.amount - a.amount; });

  var transfers = [];
  var ci = 0, di = 0;
  while (ci < creditors.length && di < debtors.length) {
    var amount = Math.min(creditors[ci].amount, debtors[di].amount);
    if (amount > 0.01) {
      transfers.push({ from:debtors[di], to:creditors[ci], amount:Math.round(amount) });
    }
    creditors[ci].amount -= amount;
    debtors[di].amount -= amount;
    if (creditors[ci].amount <= 0.01) ci++;
    if (debtors[di].amount <= 0.01) di++;
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
  var st = useState(Object.assign({}, defaultState(), { activeTab:"home", selectedRound:getCurrentRound(), addingGame:false, initialized:false }));
  var state = st[0], setState = st[1];
  var ld = useState(true); var loading = ld[0], setLoading = ld[1];
  var sh = useState(null); var scoringHole = sh[0], setScoringHole = sh[1];
  var sv = useState("idle"); var saveStatus = sv[0], setSaveStatus = sv[1];
  var lcs = useState(0); var latestChatTs = lcs[0], setLatestChatTs = lcs[1];
  var scs = useState(function() {
    try { return parseInt(localStorage.getItem("ni-links-chat-seen") || "0", 10) || 0; } catch(e) { return 0; }
  });
  var chatSeenTs = scs[0], setChatSeenTs = scs[1];
  var as = useState(function() {
    var authState = loadAuth();
    return { authed:authState ? authState.authed : false, playerId:authState ? authState.playerId : null, loaded:true };
  });
  var auth = as[0], setAuth = as[1];

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
        // Always use latest handicaps from code — overrides stale Firebase values
        merged.players = merged.players.map(function(p) {
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
          // Start with the code list (preserving settled state for matching ids)
          var result = codeList.map(function(def) {
            var prev = savedById[def.id];
            if (prev && (prev.settled || prev.winner)) {
              return Object.assign({}, def, { settled: prev.settled, winner: prev.winner });
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
        merged.players.forEach(function(p) {
          if (!merged.scores[p.id]) {
            merged.scores[p.id] = {};
            COURSES.forEach(function(_, i) { merged.scores[p.id][i] = Array(18).fill(null); });
          }
        });
        setState(function(prev) { return Object.assign({}, prev, merged, { initialized:true }); });
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
          drinks: fresh.drinks,
          expenses: fresh.expenses,
        });
        setState(function(prev) { return Object.assign({}, prev, { initialized:true }); });
      }
      setLoading(false);
    });
    return function() { unsub(); };
  }, []);

  // Lightweight chat subscription at the app level — only tracks the newest
  // message timestamp so we can show an unread badge on the Chat tab.
  useEffect(function() {
    var unsub = subscribeToChat(function(msgs) {
      if (!msgs || !msgs.length) return;
      var newest = 0;
      msgs.forEach(function(m) {
        if (m && m.ts) { var t = new Date(m.ts).getTime(); if (t > newest) newest = t; }
      });
      setLatestChatTs(newest);
    });
    return function() { unsub(); };
  }, []);

  // When the user opens the Chat tab, mark everything as seen.
  useEffect(function() {
    if (state.activeTab === "chat" && latestChatTs > 0) {
      setChatSeenTs(latestChatTs);
      try { localStorage.setItem("ni-links-chat-seen", String(latestChatTs)); } catch(e) {}
    }
  }, [state.activeTab, latestChatTs]);

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
  var update = useCallback(function(changes) {
    // Master guard: guests can never write synced data to Firebase.
    var isGuestWrite = guestRef.current;
    // Book guard: only gatekeepers may write bet/expense data. Strip those changes
    // for everyone else (scores/players/etc. remain editable by all players).
    if (!canEditBooksRef.current) {
      var bookFields = ["games", "bets", "individualProps", "h2hBets", "teamMatches", "drinks", "expenses", "customBets"];
      var stripped = false;
      bookFields.forEach(function(f) {
        if (Object.prototype.hasOwnProperty.call(changes, f)) { delete changes[f]; stripped = true; }
      });
      if (stripped && Object.keys(changes).length === 0) return; // nothing left to apply
    }
    setState(function(prev) {
      var next = Object.assign({}, prev, changes);
      // Save to Firebase (debounced to avoid hammering Firestore) — never for guests
      if (!isGuestWrite && (changes.scores || changes.players || changes.games || changes.bets || changes.individualProps || changes.h2hBets || changes.teamMatches || changes.drinks || changes.expenses)) {
        clearTimeout(saveTimer.current);
        setSaveStatus("saving");
        saveTimer.current = setTimeout(function() {
          firebaseSave({
            players: next.players,
            scores: next.scores,
            games: next.games,
            bets: next.bets,
            individualProps: next.individualProps,
            h2hBets: next.h2hBets,
            teamMatches: next.teamMatches,
            drinks: next.drinks,
            expenses: next.expenses,
          }).then(function() {
            setSaveStatus("saved");
            setTimeout(function() { setSaveStatus("idle"); }, 1500);
          }).catch(function() {
            setSaveStatus("error");
          });
        }, 500);
      }
      return next;
    });
  }, []);

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
      drinks: fresh.drinks,
      expenses: fresh.expenses,
    });
  };

  // Derived values + hooks must come BEFORE any early return so hooks always
  // run in the same order on every render (React rules of hooks).
  var p = state, players = p.players, scores = p.scores, games = p.games, bets = p.bets;
  var customBets = p.customBets, drinks = p.drinks, activeTab = p.activeTab;
  var selectedRound = p.selectedRound, addingGame = p.addingGame;
  var lb = useMemo(function() { return getLeaderboard(players, scores); }, [players, scores]);
  var rs = useCallback(function(pid, ri) { return getRoundScore(scores, pid, ri); }, [scores]);

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
          {!isGuest && saveStatus === "saving" && <span style={{fontSize:10, color:CL.muted, fontFamily:"system-ui"}}>● saving…</span>}
          {!isGuest && saveStatus === "saved" && <span style={{fontSize:10, color:"#22c55e", fontFamily:"system-ui"}}>✓ saved</span>}
          {!isGuest && saveStatus === "error" && <span style={{fontSize:10, color:CL.red, fontFamily:"system-ui"}}>⚠ not saved</span>}
        </div>
        <button onClick={handleLogout} style={{fontSize:10, color:CL.muted, fontFamily:"system-ui", background:"none", border:"1px solid "+CL.border, borderRadius:4, padding:"4px 8px", cursor:"pointer"}}>{isGuest ? "Sign In" : "Switch"}</button>
      </div>
      <div style={S.content}>
        {activeTab === "home" && <HomeTab players={players} lb={lb} currentPlayer={currentPlayer} weatherCache={state.weatherCache} update={update} isGuest={isGuest} />}
        {activeTab === "itinerary" && <ItineraryTab weatherCache={state.weatherCache} update={update} isGuest={isGuest} />}
        {activeTab === "scores" && <ScoresTab players={players} scores={scores} sel={selectedRound} hole={scoringHole} setHole={setScoringHole} update={update} rs={rs} currentPlayer={currentPlayer} isGuest={isGuest} />}
        {activeTab === "leaderboard" && <LeaderboardTab players={players} scores={scores} lb={lb} rs={rs} currentPlayer={currentPlayer} />}
        {activeTab === "bets" && (isGuest ? (
          <div style={{padding:"60px 24px", textAlign:"center"}}>
            <div style={{fontSize:48, marginBottom:16}}>🔒</div>
            <div style={{fontSize:18, fontWeight:700, color:"#fff", fontFamily:"system-ui", marginBottom:8}}>Players Only</div>
            <div style={{fontSize:14, color:CL.muted, fontFamily:"system-ui", marginBottom:20}}>Sign in with the group passcode to view bets and games.</div>
            <button onClick={handleLogout} style={Object.assign({}, S.primaryBtn, {width:"auto", padding:"12px 32px"})}>Sign In</button>
          </div>
        ) : <BetsTab players={players} scores={scores} games={games} bets={bets} individualProps={state.individualProps || DEFAULT_INDIVIDUAL_PROPS} customBets={customBets} h2hBets={state.h2hBets} teamMatches={state.teamMatches || DEFAULT_TEAM_MATCHES} expenses={state.expenses || []} drinks={drinks} addingGame={addingGame} update={update} resetAll={resetAll} isGuest={booksReadOnly} canEdit={canEditBooks} />)}
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
  }, []);

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
  }, []);

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
  var course = COURSES[sel];

  var sc = useState(false); var scanning = sc[0], setScanning = sc[1];
  var sd = useState(null); var scanData = sd[0], setScanData = sd[1];
  var sl = useState(false); var scanLoading = sl[0], setScanLoading = sl[1];
  var se = useState(null); var scanErr = se[0], setScanErr = se[1];

  function setScore(pid, h, val) {
    if (props.isGuest) return;
    var ns = JSON.parse(JSON.stringify(scores));
    if (!ns[pid]) ns[pid] = {};
    if (!ns[pid][sel]) ns[pid][sel] = Array(18).fill(null);
    ns[pid][sel][h] = val;
    update({ scores:ns });
  }

  function bulkSet(pid, arr) {
    if (props.isGuest) return;
    var ns = JSON.parse(JSON.stringify(scores));
    if (!ns[pid]) ns[pid] = {};
    ns[pid][sel] = arr.slice(0,18).map(function(s) { return s > 0 ? s : null; });
    update({ scores:ns });
    setScanData(null); setScanning(false);
  }

  function clearRound(pid) {
    if (props.isGuest) return;
    var ns = JSON.parse(JSON.stringify(scores));
    if (!ns[pid]) ns[pid] = {};
    ns[pid][sel] = Array(18).fill(null);
    update({ scores:ns });
  }

  function handlePhoto(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    if (props.isGuest) return;
    setScanLoading(true); setScanErr(null); setScanData(null);

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
        {!props.isGuest && <button onClick={function() { setScanning(!scanning); setScanData(null); setScanErr(null); }} style={Object.assign({}, S.addBtn, {fontSize:13})}>{scanning ? "✕ Close" : "📷 Scan"}</button>}
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
                return (
                  <div key={si} style={{marginBottom:12, padding:12, background:"rgba(37,99,235,0.1)", borderRadius:6, border:"1px solid rgba(37,99,235,0.2)"}}>
                    <div style={{display:"flex", justifyContent:"space-between", marginBottom:6}}>
                      <div style={{fontSize:14, fontWeight:700, color:"#fff", fontFamily:"system-ui"}}>{sp.name}</div>
                      <div style={{fontSize:14, fontWeight:700, color:CL.red, fontFamily:"system-ui"}}>{total > 0 ? total : ""}</div>
                    </div>
                    <div style={{display:"grid", gridTemplateColumns:"repeat(9,1fr)", gap:2, marginBottom:8}}>
                      {sp.scores.slice(0,18).map(function(sc,hi) {
                        return <div key={hi} style={{textAlign:"center", padding:"2px 0", background:"rgba(30,58,95,0.3)", borderRadius:3}}><div style={{fontSize:8, color:CL.muted, fontFamily:"system-ui"}}>{hi+1}</div><div style={{fontSize:12, color:"#fff", fontWeight:700, fontFamily:"system-ui"}}>{sc>0?sc:"·"}</div></div>;
                      })}
                    </div>
                    <div style={Object.assign({}, S.label, {marginBottom:6})}>Assign to:</div>
                    <div style={{display:"flex", gap:4, flexWrap:"wrap"}}>
                      {players.map(function(p) { return <button key={p.id} onClick={function() { bulkSet(p.id, sp.scores); }} style={S.pillBtn}>{p.emoji+" "+p.name.split(" ")[0]}</button>; })}
                    </div>
                  </div>
                );
              })}
              <label style={Object.assign({}, S.secondaryBtn, {display:"block", textAlign:"center", cursor:"pointer", marginTop:8})}>
                Scan Another<input type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{display:"none"}} />
              </label>
            </div>
          )}
        </div>
      )}

      <div style={{display:"flex", gap:6, padding:"0 16px", marginBottom:4, overflowX:"auto"}}>
        {COURSES.map(function(c, i) {
          return <button key={i} onClick={function() { update({selectedRound:i}); }} style={Object.assign({}, S.roundBtn, sel===i ? S.roundBtnOn : {})}>{COURSE_LABELS[i]}</button>;
        })}
      </div>

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
        for (var hi = 0; hi < 18; hi++) {
          var hv = scores[player.id] && scores[player.id][sel] && scores[player.id][sel][hi];
          if (hv != null) {
            if (hi < 9) { frontTotal += hv; frontCount++; }
            else { backTotal += hv; backCount++; }
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
            <div style={{display:"flex", gap:12, marginBottom:6}}>
              <div style={{fontSize:10, color:CL.muted, fontFamily:"system-ui"}}>{"OUT: "+(frontCount>0?frontTotal:"—")}</div>
              <div style={{fontSize:10, color:CL.muted, fontFamily:"system-ui"}}>{"IN: "+(backCount>0?backTotal:"—")}</div>
              <div style={{fontSize:10, color:CL.muted, fontFamily:"system-ui"}}>{"CH: "+ch+" strokes"}</div>
            </div>
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
          </div>
        );
      })}

      {hole && (
        <div style={S.modal} onClick={function() { setHole(null); }}>
          <div style={S.modalBox} onClick={function(e) { e.stopPropagation(); }}>
            <div style={{textAlign:"center", marginBottom:16}}>
              <div style={{fontSize:18, fontWeight:700, color:"#fff"}}>
                {"Hole "+(hole.hole+1)}
              </div>
              <div style={{fontSize:14, color:CL.muted, fontFamily:"system-ui", marginTop:2}}>
                {(players.find(function(p) { return p.id===hole.playerId; }) || {}).name}
              </div>
              <div style={{display:"flex", justifyContent:"center", gap:16, marginTop:8}}>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:10, color:CL.muted, fontFamily:"system-ui"}}>PAR</div>
                  <div style={{fontSize:20, fontWeight:700, color:CL.red, fontFamily:"system-ui"}}>{course.pars ? course.pars[hole.hole] : "—"}</div>
                </div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:10, color:CL.muted, fontFamily:"system-ui"}}>SI</div>
                  <div style={{fontSize:20, fontWeight:700, color:CL.blue, fontFamily:"system-ui"}}>{course.si ? course.si[hole.hole] : "—"}</div>
                </div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:10, color:CL.muted, fontFamily:"system-ui"}}>HOLE</div>
                  <div style={{fontSize:20, fontWeight:700, color:"#fff", fontFamily:"system-ui"}}>{hole.hole+1}</div>
                </div>
              </div>
            </div>
            <div style={{display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8, marginBottom:12}}>
              {[1,2,3,4,5,6,7,8,9,10].map(function(s) {
                var cur = scores[hole.playerId] && scores[hole.playerId][sel] && scores[hole.playerId][sel][hole.hole];
                var hp = course.pars ? course.pars[hole.hole] : null;
                var isBirdie = hp && s < hp;
                var isBogey = hp && s > hp;
                var isActive = cur === s;
                var btnBg = isActive ? CL.red : isBirdie ? "rgba(34,197,94,0.15)" : isBogey ? "rgba(220,38,38,0.1)" : "rgba(30,58,95,0.3)";
                var btnBorder = isActive ? CL.red : isBirdie ? "rgba(34,197,94,0.3)" : isBogey ? "rgba(220,38,38,0.2)" : CL.border;
                return <button key={s} style={Object.assign({}, S.scoreBtn, {background:btnBg, borderColor:btnBorder, color:isActive ? "#fff" : "#fff"})} onClick={function() { setScore(hole.playerId, hole.hole, s); setHole(null); }}>{s}</button>;
              })}
            </div>
            <button style={S.secondaryBtn} onClick={function() { setScore(hole.playerId, hole.hole, null); setHole(null); }}>Clear</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── LEADERBOARD ─────────────────────────────────────────────────────
function LeaderboardTab(props) {
  var players = props.players, scores = props.scores, lb = props.lb, rs = props.rs;
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

  var sortedPlayers = players
    .map(function(p) { return Object.assign({}, p, { displayTotal: getPlayerTotal(p.id) }); })
    .filter(function(p) { return p.displayTotal > 0; })
    .sort(function(a, b) { return a.displayTotal - b.displayTotal; });

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

      {view === "individual" && (
        sortedPlayers.length === 0 ? <div style={S.card}><div style={{textAlign:"center", color:CL.muted, padding:24, fontSize:14, fontFamily:"system-ui"}}>No scores yet.</div></div> : (
          <div style={S.card}>
            {sortedPlayers.map(function(p, i) {
              return (
                <div key={p.id} style={Object.assign({display:"flex", alignItems:"center", padding:"12px 0", gap:12}, S.separator, i===0 ? {background:"rgba(220,38,38,0.08)", margin:"-4px -8px 0", padding:"14px 8px", borderRadius:6} : {})}>
                  <div style={{fontSize:20, width:32, textAlign:"center"}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:16, fontWeight:600, color:"#fff"}}>{p.emoji+" "+p.name}</div>
                    <div style={{fontSize:11, color:CL.muted, fontFamily:"system-ui"}}>{"HI: "+p.handicap}</div>
                    <div style={{display:"flex", gap:8, marginTop:2, flexWrap:"wrap"}}>
                      {COURSES.map(function(_,ci) {
                        var r = getPlayerRoundScore(p.id, ci);
                        return r!==null ? <span key={ci} style={S.label}>{"R"+(ci+1)+": "+r}</span> : null;
                      })}
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:22, fontWeight:700, color:CL.red}}>{p.displayTotal}</div>
                    <div style={{fontSize:10, color:CL.muted, fontFamily:"system-ui"}}>{scoreMode === "net" ? "net" : "gross"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

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
        var aTotal = getTeamTotalStableford(scores, players, aIds, null);
        var bTotal = getTeamTotalStableford(scores, players, bIds, null);
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
              <div style={Object.assign({}, S.label, {marginBottom:12})}>Net Stableford points — more is better. All 4 scores count each round.</div>
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
                var a = getTeamRoundStableford(scores, players, aIds, ri, null);
                var b = getTeamRoundStableford(scores, players, bIds, ri, null);
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
function BetsTab(props) {
  var players = props.players, games = props.games, bets = props.bets;
  var scores = props.scores || {};
  var customBets = props.customBets, h2hBets = props.h2hBets || [], drinks = props.drinks || {};
  var teamMatches = props.teamMatches || DEFAULT_TEAM_MATCHES;
  var individualProps = props.individualProps || DEFAULT_INDIVIDUAL_PROPS;
  var expenses = props.expenses || [];
  var addingGame = props.addingGame, update = props.update, resetAll = props.resetAll;

  var ts = useState("stableford"); var tab = ts[0], setTab = ts[1];
  var gts = useState("skins"); var gameType = gts[0], setGameType = gts[1];
  var sks = useState("5"); var stake = sks[0], setStake = sks[1];
  var rds = useState(0); var round = rds[0], setRound = rds[1];
  var res = useState({}); var results = res[0], setResults = res[1];
  // H2H bet creation
  var h2hDesc = useState(""); var h2hText = h2hDesc[0], setH2hText = h2hDesc[1];
  var h2hStake = useState(""); var h2hAmt = h2hStake[0], setH2hAmt = h2hStake[1];
  var h2hP1 = useState(null); var bettor = h2hP1[0], setBettor = h2hP1[1];
  var h2hP2 = useState(null); var opponent = h2hP2[0], setOpponent = h2hP2[1];
  var h2hCrs = useState(""); var h2hCourse = h2hCrs[0], setH2hCourse = h2hCrs[1];
  var cpName = useState(""); var customPropName = cpName[0], setCustomPropName = cpName[1];
  var cpBuyin = useState("10"); var customPropBuyin = cpBuyin[0], setCustomPropBuyin = cpBuyin[1];
  var cpAdding = useState(false); var addingProp = cpAdding[0], setAddingProp = cpAdding[1];
  // Player management
  var pns = useState(""); var pName = pns[0], setPName = pns[1];
  var phs = useState(""); var pHcp = phs[0], setPHcp = phs[1];
  var pes = useState("🔴"); var pEmoji = pes[0], setPEmoji = pes[1];
  var eis = useState(null); var editId = eis[0], setEditId = eis[1];

  function netMoney(pid) {
    var total = games.reduce(function(t,g) { return t+((g.results && g.results[pid])||0); }, 0);
    // Add prop bet winnings (team or individual winner)
    var matchupP = TEAM_MATCHUPS[0];
    bets.forEach(function(b) {
      if (!b.settled || !b.winner || !b.buyin) return;
      var winIds = [];
      if (b.winner === "teamA") winIds = resolveTeam(matchupP.teamA, players);
      else if (b.winner === "teamB") winIds = resolveTeam(matchupP.teamB, players);
      else winIds = [b.winner];
      if (winIds.length === 0) return;
      var loseCount = players.length - winIds.length;
      if (winIds.indexOf(pid) >= 0) total += (b.buyin * loseCount) / winIds.length;
      else total -= b.buyin;
    });
    // Add individual prop bet winnings
    individualProps.forEach(function(prop) {
      if (!prop.settled || !prop.winner) return;
      var buyin = prop.buyin || 10;
      if (pid === prop.winner) total += buyin * (players.length - 1);
      else total -= buyin;
    });
    // Add h2h bet winnings (with sides)
    h2hBets.forEach(function(b) {
      if (!b.settled) return;
      var sA = b.sideA || [b.bettor];
      var sB = b.sideB || [b.opponent];
      var winSide = b.winningSide === "a" ? sA : sB;
      var loseSide = b.winningSide === "a" ? sB : sA;
      if (winSide.length === 0) return;
      var loseTotal = loseSide.length * b.stake;
      var winEach = loseTotal / winSide.length;
      if (loseSide.indexOf(pid) >= 0) total -= b.stake;
      if (winSide.indexOf(pid) >= 0) total += winEach;
    });
    // Add team match play results
    var matchup0 = TEAM_MATCHUPS[0];
    var myTeamIds = resolveTeam(matchup0.teamA, players);
    var isTeamA = myTeamIds.indexOf(pid) >= 0;
    teamMatches.forEach(function(m) {
      if (!m.settled || !m.winner) return;
      var won = (m.winner === "a" && isTeamA) || (m.winner === "b" && !isTeamA);
      total += won ? m.stake : -m.stake;
    });
    // Add expense balances — net = what you paid minus your share
    expenses.forEach(function(exp) {
      if (!exp.payer || !exp.splitAmong || exp.splitAmong.length === 0) return;
      var perPerson = exp.amount / exp.splitAmong.length;
      if (pid === exp.payer) total += exp.amount;
      if (exp.splitAmong.indexOf(pid) >= 0) total -= perPerson;
    });
    return total;
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
    update({games:games.concat([{id:Date.now().toString(), type:gameType, stake:parseFloat(stake), round:round, results:Object.assign({},results), ts:new Date().toISOString()}]), addingGame:false});
    setResults({});
  }

  function savePlayer() {
    if (!pName.trim()) return;
    if (editId) {
      update({players:players.map(function(p) { return p.id===editId ? Object.assign({},p,{name:pName, handicap:parseFloat(pHcp)||0, emoji:pEmoji}) : p; })});
    } else {
      var nid = "p"+Date.now();
      var newPlayer = {id:nid, name:pName, handicap:parseFloat(pHcp)||0, emoji:pEmoji};
      // Initialize empty score arrays for the new player
      var updatedScores = JSON.parse(JSON.stringify(props.scores || {}));
      updatedScores[nid] = {};
      COURSES.forEach(function(_, i) { updatedScores[nid][i] = Array(18).fill(null); });
      update({players:players.concat([newPlayer]), scores:updatedScores});
    }
    setPName(""); setPHcp(""); setPEmoji("🔴"); setEditId(null);
  }

  var subTabs = [{id:"stableford",label:"🏆 Stableford"},{id:"props",label:"🎯 Props"},{id:"match",label:"⚔️ Teams"},{id:"h2h",label:"🤝 H2H"},{id:"games",label:"Games"},{id:"settle",label:"💸 Settle"},{id:"drinks",label:"🍺"},{id:"players",label:"👥"}];

  return (
    <div>
      <div style={S.pageHeader}><div style={S.pageTitle}>Bets & Games</div></div>
      {props.isGuest && <div style={{margin:"0 16px 8px", padding:"8px 12px", background:"rgba(111,172,255,0.1)", border:"1px solid "+CL.border, borderRadius:8, fontSize:12, color:CL.muted, fontFamily:"system-ui"}}>👁️ View only — Brian & Carl manage the books. Talk to them to record a bet.</div>}
      <div style={{display:"flex", gap:4, padding:"0 16px", marginBottom:8}}>
        {subTabs.map(function(t) { return <button key={t.id} onClick={function() { setTab(t.id); }} style={Object.assign({}, S.subTab, tab===t.id ? S.subTabOn : S.subTabOff)}>{t.label}</button>; })}
      </div>

      {/* Betting summary — net position per player (excludes expenses). Hidden on Stableford tab. */}
      {tab !== "stableford" && (
      <div style={S.card}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8}}>
          <div style={S.cardTitle}>💰 Betting Summary</div>
        </div>
        {(function() {
          // Calculate net betting position per player (NO expenses — those are on Spend tab)
          function betNet(pid) {
            var total = games.reduce(function(t,g) { return t+((g.results && g.results[pid])||0); }, 0);
            var matchupP = TEAM_MATCHUPS[0];
            bets.forEach(function(b) {
              if (!b.settled || !b.winner || !b.buyin) return;
              var winIds = [];
              if (b.winner === "teamA") winIds = resolveTeam(matchupP.teamA, players);
              else if (b.winner === "teamB") winIds = resolveTeam(matchupP.teamB, players);
              else winIds = [b.winner];
              if (winIds.length === 0) return;
              var loseCount = players.length - winIds.length;
              if (winIds.indexOf(pid) >= 0) total += (b.buyin * loseCount) / winIds.length;
              else total -= b.buyin;
            });
            individualProps.forEach(function(prop) {
              if (!prop.settled || !prop.winner) return;
              var buyin = prop.buyin || 10;
              if (pid === prop.winner) total += buyin * (players.length - 1);
              else total -= buyin;
            });
            h2hBets.forEach(function(b) {
              if (!b.settled) return;
              var sA = b.sideA || [b.bettor];
              var sB = b.sideB || [b.opponent];
              var winSide = b.winningSide === "a" ? sA : sB;
              var loseSide = b.winningSide === "a" ? sB : sA;
              if (winSide.length === 0) return;
              var loseTotal = loseSide.length * b.stake;
              var winEach = loseTotal / winSide.length;
              if (loseSide.indexOf(pid) >= 0) total -= b.stake;
              if (winSide.indexOf(pid) >= 0) total += winEach;
            });
            var myTeamIds = resolveTeam(TEAM_MATCHUPS[0].teamA, players);
            var isTeamA = myTeamIds.indexOf(pid) >= 0;
            teamMatches.forEach(function(m) {
              if (!m.settled || !m.winner) return;
              var won = (m.winner === "a" && isTeamA) || (m.winner === "b" && !isTeamA);
              total += won ? m.stake : -m.stake;
            });
            return total;
          }
          var anySettled = bets.some(function(b){return b.settled;}) || individualProps.some(function(p){return p.settled;}) || h2hBets.some(function(b){return b.settled;}) || teamMatches.some(function(m){return m.settled;}) || games.length > 0;
          if (!anySettled) return <div style={{fontSize:14, color:CL.muted, fontFamily:"system-ui", textAlign:"center", padding:8}}>No settled bets yet. Positions update as bets are settled.</div>;
          // Compute each player's net once, then sort — avoids recomputing betNet in the sort comparator.
          var sorted = players.map(function(p) { return { p:p, net:betNet(p.id) }; }).sort(function(a,b) { return b.net - a.net; });
          return sorted.map(function(row, i) {
            var p = row.p, net = row.net;
            var color = net > 0.01 ? "#22c55e" : net < -0.01 ? CL.red : CL.muted;
            return (
              <div key={p.id} style={Object.assign({display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0"}, i < sorted.length-1 ? S.separator : {})}>
                <div style={{fontSize:15, color:"#fff", fontFamily:"system-ui"}}>{p.emoji+" "+p.name}</div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:16, fontWeight:700, color:color, fontFamily:"system-ui"}}>{(net >= 0 ? "+$" : "-$")+Math.abs(net).toFixed(2)}</div>
                </div>
              </div>
            );
          });
        })()}
      </div>
      )}

      {tab === "stableford" && (function() {
        var matchup = TEAM_MATCHUPS[0];
        var aIds = resolveTeam(matchup.teamA, players);
        var bIds = resolveTeam(matchup.teamB, players);
        var aTotal = getTeamTotalStableford(scores, players, aIds, null);
        var bTotal = getTeamTotalStableford(scores, players, bIds, null);
        var aLead = aTotal > bTotal, bLead = bTotal > aTotal;
        var indiv = players.map(function(p) {
          return { p:p, pts:getTotalStableford(scores, p.id, p.handicap) };
        }).filter(function(x) { return x.pts !== null; }).sort(function(a,b) { return b.pts - a.pts; });
        var anyScores = indiv.length > 0;
        return (
          <div>
            {/* Team Stableford matchup — the main event */}
            <div style={S.card}>
              <div style={S.cardTitle}>🏆 Team Stableford — The Main Event</div>
              <div style={Object.assign({}, S.label, {marginBottom:12})}>Net Stableford points across all 5 rounds. All 4 scores count each round. More points wins.</div>
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
              {anyScores && <div style={{textAlign:"center", marginTop:12, fontSize:15, fontWeight:700, color:aLead||bLead?"#22c55e":CL.muted, fontFamily:"system-ui"}}>
                {aTotal===bTotal ? "All square" : (aLead?matchup.teamA.name:matchup.teamB.name)+" lead by "+Math.abs(aTotal-bTotal)}
              </div>}
              {!anyScores && <div style={{textAlign:"center", marginTop:12, fontSize:13, color:CL.muted, fontFamily:"system-ui"}}>Enter scores to start the competition.</div>}
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
                var a = getTeamRoundStableford(scores, players, aIds, ri, null);
                var b = getTeamRoundStableford(scores, players, bIds, ri, null);
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

      {tab === "props" && (
        <div>
          <div style={S.card}>
            <div style={S.cardTitle}>🎯 Prop Bets</div>
            <div style={Object.assign({}, S.label, {marginBottom:12})}>$20/player per round · Low team net wins the pot. Tap winning team to settle.</div>
            {bets.map(function(bet) {
              var matchup = TEAM_MATCHUPS[0];
              var isTeamBet = bet.name.indexOf("WASPs vs Italians") >= 0;
              var pot = (bet.buyin || 0) * players.length;
              var winnerLabel = "";
              if (bet.settled) {
                if (bet.winner === "teamA") winnerLabel = matchup.teamA.emoji + " " + matchup.teamA.name;
                else if (bet.winner === "teamB") winnerLabel = matchup.teamB.emoji + " " + matchup.teamB.name;
                else { var wp = players.find(function(p) { return p.id===bet.winner; }); if (wp) winnerLabel = wp.emoji + " " + wp.name; }
              }
              return (
                <div key={bet.id} style={Object.assign({padding:"10px 0"}, S.separator)}>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                    <div>
                      <div style={{fontSize:15, color:bet.settled?CL.muted:"#fff", fontWeight:600, textDecoration:bet.settled?"line-through":"none"}}>{bet.name}</div>
                      <div style={{fontSize:11, color:CL.red, fontFamily:"system-ui"}}>{"$"+bet.buyin+"/player · $"+pot+" pot"}</div>
                    </div>
                    {bet.settled && <button style={{background:"none", border:"none", color:CL.muted, cursor:"pointer", fontSize:10, fontFamily:"system-ui"}} onClick={function() { update({bets:bets.map(function(b) { return b.id===bet.id ? Object.assign({},b,{settled:false,winner:null}) : b; })}); }}>Reset</button>}
                  </div>
                  {bet.settled ? (
                    <div style={{fontSize:12, color:"#22c55e", fontFamily:"system-ui", marginTop:4}}>{"🏆 "+winnerLabel+" wins $"+(pot - bet.buyin)}</div>
                  ) : (
                    <div style={{display:"flex", gap:6, marginTop:6}}>
                      <button onClick={function() { update({bets:bets.map(function(b) { return b.id===bet.id ? Object.assign({},b,{settled:true,winner:"teamA"}) : b; })}); }} style={Object.assign({}, S.pillBtn, {flex:1, textAlign:"center", padding:"8px 0", borderColor:"rgba(220,38,38,0.4)"})}>
                        {matchup.teamA.emoji + " " + matchup.teamA.name}
                      </button>
                      <button onClick={function() { update({bets:bets.map(function(b) { return b.id===bet.id ? Object.assign({},b,{settled:true,winner:"teamB"}) : b; })}); }} style={Object.assign({}, S.pillBtn, {flex:1, textAlign:"center", padding:"8px 0", borderColor:"rgba(37,99,235,0.4)"})}>
                        {matchup.teamB.emoji + " " + matchup.teamB.name}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Individual Prop Bets */}
          <div style={S.card}>
            <div style={S.cardTitle}>🏆 Individual Props</div>
            <div style={Object.assign({}, S.label, {marginBottom:12})}>$10/player buy-in · Winner takes the pot. Tap the winner to settle.</div>
            {individualProps.map(function(prop) {
              var winner = players.find(function(x) { return x.id === prop.winner; });
              var pot = (prop.buyin || 10) * players.length;
              // For Stableford props, compute the current leader to make settling easy.
              var sfLeader = null;
              if (!prop.settled) {
                var sfScores = null;
                if (prop.id === "ip8") {
                  // Most Stableford overall
                  sfScores = players.map(function(p) { return { p:p, v:getTotalStableford(scores, p.id, p.handicap) }; });
                } else if (prop.id && prop.id.indexOf("ipsf") === 0) {
                  // Per-round Stableford: ipsf0..ipsf4 → round index
                  var ri = parseInt(prop.id.replace("ipsf", ""), 10);
                  sfScores = players.map(function(p) { return { p:p, v:getRoundStableford(scores, p.id, ri, p.handicap) }; });
                }
                if (sfScores) {
                  sfScores = sfScores.filter(function(x) { return x.v !== null; });
                  if (sfScores.length) {
                    sfScores.sort(function(a,b) { return b.v - a.v; });
                    var top = sfScores[0];
                    var tied = sfScores.filter(function(x) { return x.v === top.v; });
                    sfLeader = { player: top.p, points: top.v, tied: tied.length > 1, tiedPlayers: tied };
                  }
                }
              }
              return (
                <div key={prop.id} style={Object.assign({padding:"12px 0"}, S.separator)}>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start"}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:15, fontWeight:600, color:prop.settled?CL.muted:"#fff", textDecoration:prop.settled?"line-through":"none"}}>{prop.name}</div>
                      {prop.desc && <div style={{fontSize:12, color:CL.muted, fontFamily:"system-ui", marginTop:2}}>{prop.desc}</div>}
                      <div style={{fontSize:12, color:CL.red, fontFamily:"system-ui", marginTop:2}}>{"$"+(prop.buyin||10)+"/player · $"+pot+" pot"}</div>
                      {sfLeader && <div style={{fontSize:12, color:CL.blue, fontFamily:"system-ui", marginTop:3}}>{sfLeader.tied ? "Tied at "+sfLeader.points+" pts: "+sfLeader.tiedPlayers.map(function(t){return t.player.name.split(" ")[0];}).join(", ") : "Leading: "+sfLeader.player.emoji+" "+sfLeader.player.name.split(" ")[0]+" ("+sfLeader.points+" pts)"}</div>}
                    </div>
                    {!prop.settled && <button onClick={function() { if (confirm("Delete this prop?")) update({individualProps:individualProps.filter(function(x) { return x.id!==prop.id; })}); }} style={{background:"none", border:"none", color:CL.muted, cursor:"pointer", fontSize:14, flexShrink:0}}>🗑</button>}
                  </div>
                  {prop.settled ? (
                    <div style={{marginTop:6}}>
                      <div style={{fontSize:14, color:"#22c55e", fontFamily:"system-ui"}}>{"🏆 "+(winner ? winner.emoji+" "+winner.name+" wins $"+(pot-(prop.buyin||10)) : "Winner")}</div>
                      <button onClick={function() { update({individualProps:individualProps.map(function(x) { return x.id===prop.id ? Object.assign({},x,{settled:false,winner:null}) : x; })}); }} style={{marginTop:6, fontSize:11, color:CL.muted, fontFamily:"system-ui", background:"none", border:"1px solid "+CL.border, borderRadius:6, padding:"5px 12px", cursor:"pointer"}}>↩ Undo</button>
                    </div>
                  ) : (
                    <div style={{display:"flex", gap:4, marginTop:8, flexWrap:"wrap"}}>
                      {players.map(function(p) {
                        return <button key={p.id} onClick={function() { update({individualProps:individualProps.map(function(x) { return x.id===prop.id ? Object.assign({},x,{settled:true,winner:p.id}) : x; })}); }} style={S.pillBtn}>{p.emoji+" "+p.name.split(" ")[0]}</button>;
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add custom prop bet */}
            {!addingProp ? (
              <button onClick={function() { setAddingProp(true); }} style={Object.assign({}, S.addBtn, {width:"100%", marginTop:12, fontSize:13})}>+ Add Custom Prop Bet</button>
            ) : (
              <div style={{marginTop:12, padding:12, background:"rgba(40,69,112,0.15)", borderRadius:8}}>
                <div style={{fontSize:13, fontWeight:700, color:"#fff", fontFamily:"system-ui", marginBottom:8}}>New Prop Bet</div>
                <div style={Object.assign({}, S.label, {marginBottom:4})}>What's the bet?</div>
                <input style={S.input} value={customPropName} onChange={function(e) { setCustomPropName(e.target.value); }} placeholder="e.g. First birdie of the trip"/>
                <div style={Object.assign({}, S.label, {marginBottom:4})}>Buy-in per player ($)</div>
                <input style={Object.assign({}, S.input, {width:120})} value={customPropBuyin} onChange={function(e) { setCustomPropBuyin(e.target.value); }} type="number" placeholder="10"/>
                <div style={{display:"flex", gap:8, marginTop:4}}>
                  <button style={Object.assign({}, S.primaryBtn, {flex:1, opacity:!customPropName.trim() ? 0.5 : 1})} onClick={function() {
                    if (!customPropName.trim()) return;
                    var newProp = { id:"ip"+Date.now(), name:customPropName.trim(), desc:"", settled:false, winner:null, buyin:parseFloat(customPropBuyin)||10, isCustom:true };
                    update({individualProps:individualProps.concat([newProp])});
                    setCustomPropName(""); setCustomPropBuyin("10"); setAddingProp(false);
                  }}>Create</button>
                  <button style={Object.assign({}, S.secondaryBtn, {flex:1})} onClick={function() { setAddingProp(false); setCustomPropName(""); }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "match" && (
        <div>
          <div style={S.card}>
            <div style={S.cardTitle}>⚔️ WASPs vs Italians — Match Play</div>
            <div style={Object.assign({}, S.label, {marginBottom:12})}>$20/player per round · Best team score wins each course</div>
            {(function() {
              var matchup = TEAM_MATCHUPS[0];
              var aIds = resolveTeam(matchup.teamA, players);
              var bIds = resolveTeam(matchup.teamB, players);
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
            <div style={Object.assign({}, S.label, {marginBottom:12})}>Pick sides. Anyone can Jump In on either side — 2, 4, or more players. Losers pay winners, split evenly.</div>

            {h2hBets.map(function(bet) {
              var sideA = bet.sideA || [bet.bettor];
              var sideB = bet.sideB || [bet.opponent];
              var allIn = sideA.concat(sideB);
              var canJoin = players.filter(function(p) { return allIn.indexOf(p.id) === -1; });
              var totalPot = bet.stake * allIn.length;
              var winSide = bet.winningSide;

              function joinSide(pid, side) {
                var updated = h2hBets.map(function(b) {
                  if (b.id !== bet.id) return b;
                  var nb = Object.assign({}, b);
                  nb.sideA = (nb.sideA || [nb.bettor]).slice();
                  nb.sideB = (nb.sideB || [nb.opponent]).slice();
                  // Guard: never add a player who's already on either side
                  if (nb.sideA.indexOf(pid) >= 0 || nb.sideB.indexOf(pid) >= 0) return nb;
                  if (side === "a") nb.sideA.push(pid);
                  else nb.sideB.push(pid);
                  return nb;
                });
                update({h2hBets:updated});
              }

              function removeSide(pid, side) {
                var updated = h2hBets.map(function(b) {
                  if (b.id !== bet.id) return b;
                  var nb = Object.assign({}, b);
                  nb.sideA = (nb.sideA || [nb.bettor]).slice();
                  nb.sideB = (nb.sideB || [nb.opponent]).slice();
                  if (side === "a") nb.sideA = nb.sideA.filter(function(id) { return id !== pid; });
                  else nb.sideB = nb.sideB.filter(function(id) { return id !== pid; });
                  return nb;
                });
                update({h2hBets:updated});
              }

              function settleBet(winningSide) {
                update({h2hBets:h2hBets.map(function(b) {
                  return b.id === bet.id ? Object.assign({}, b, {settled:true, winningSide:winningSide, winner:winningSide === "a" ? bet.bettor : bet.opponent}) : b;
                })});
              }

              var bettorP = players.find(function(p) { return p.id===bet.bettor; });
              var opponentP = players.find(function(p) { return p.id===bet.opponent; });

              // Render a player row with label and optional remove button
              function playerRow(pid, isCreator, side, sideColor) {
                var p = players.find(function(x) { return x.id===pid; });
                if (!p) return null;
                return (
                  <div key={pid} style={{display:"flex", alignItems:"center", justifyContent:"space-between", padding:"3px 0"}}>
                    <div style={{fontSize:14, color:"#fff", fontFamily:"system-ui"}}>
                      {p.emoji+" "+p.name}
                      {isCreator && <span style={{fontSize:10, color:sideColor, marginLeft:6}}>★</span>}
                      {!isCreator && <span style={{fontSize:10, color:CL.muted, marginLeft:6}}>(joined)</span>}
                    </div>
                    {!isCreator && !bet.settled && (
                      <button onClick={function(e) { e.stopPropagation(); removeSide(pid, side); }} style={{background:"none", border:"none", color:CL.muted, cursor:"pointer", fontSize:12, padding:"2px 6px"}}>✕</button>
                    )}
                  </div>
                );
              }

              return (
                <div key={bet.id} style={Object.assign({padding:"12px 0"}, S.separator)}>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start"}}>
                    <div style={{flex:1}}>
                      {bet.course && <div style={{display:"inline-block", fontSize:11, fontWeight:700, color:"#22c55e", fontFamily:"system-ui", background:"rgba(34,197,94,0.12)", padding:"3px 10px", borderRadius:10, marginBottom:4}}>{bet.course}</div>}
                      <div style={{fontSize:15, fontWeight:600, color:bet.settled?CL.muted:"#fff", textDecoration:bet.settled?"line-through":"none"}}>{bet.description}</div>
                      <div style={{fontSize:13, color:CL.red, fontFamily:"system-ui"}}>{"$"+bet.stake+"/person · $"+totalPot+" pot"}</div>
                    </div>
                    {!bet.settled && <button style={{background:"none", border:"none", color:CL.muted, cursor:"pointer", fontSize:14, flexShrink:0}} onClick={function() { if (confirm("Delete this bet?")) update({h2hBets:h2hBets.filter(function(b) { return b.id!==bet.id; })}); }}>🗑</button>}
                  </div>

                  {/* Sides display with named players */}
                  <div style={{display:"flex", gap:8, marginTop:10}}>
                    <div style={Object.assign({}, S.teamBox, bet.settled && winSide==="a" ? S.teamBoxWin : {})}>
                      <div style={{fontSize:11, color:CL.red, fontFamily:"system-ui", fontWeight:700, marginBottom:6}}>SIDE A</div>
                      {sideA.map(function(pid) { return playerRow(pid, pid === bet.bettor, "a", CL.red); })}
                      <div style={{fontSize:11, color:CL.muted, fontFamily:"system-ui", marginTop:4}}>{sideA.length + " player" + (sideA.length!==1?"s":"") + " · $" + (sideA.length * bet.stake)}</div>
                    </div>
                    <div style={{display:"flex", alignItems:"center", color:CL.muted, fontWeight:700, fontFamily:"system-ui", fontSize:13}}>vs</div>
                    <div style={Object.assign({}, S.teamBox, bet.settled && winSide==="b" ? S.teamBoxWin : {})}>
                      <div style={{fontSize:11, color:CL.blue, fontFamily:"system-ui", fontWeight:700, marginBottom:6}}>SIDE B</div>
                      {sideB.map(function(pid) { return playerRow(pid, pid === bet.opponent, "b", CL.blue); })}
                      <div style={{fontSize:11, color:CL.muted, fontFamily:"system-ui", marginTop:4}}>{sideB.length + " player" + (sideB.length!==1?"s":"") + " · $" + (sideB.length * bet.stake)}</div>
                    </div>
                  </div>

                  {/* Jump In — clear per-player buttons */}
                  {!bet.settled && canJoin.length > 0 && (
                    <div style={{marginTop:10, padding:10, background:"rgba(40,69,112,0.15)", borderRadius:8}}>
                      <div style={{fontSize:12, color:CL.muted, fontFamily:"system-ui", fontWeight:600, marginBottom:8}}>{"ADD PLAYER — $"+bet.stake+" to join"}</div>
                      {canJoin.map(function(p) {
                        return (
                          <div key={p.id} style={{display:"flex", alignItems:"center", gap:6, marginBottom:6}}>
                            <div style={{flex:1, fontSize:14, color:"#fff", fontFamily:"system-ui"}}>{p.emoji+" "+p.name}</div>
                            <button onClick={function() { joinSide(p.id, "a"); }} style={Object.assign({}, S.pillBtn, {fontSize:12, padding:"5px 12px", borderColor:"rgba(240,69,74,0.5)", color:CL.red})}>→ Side A</button>
                            <button onClick={function() { joinSide(p.id, "b"); }} style={Object.assign({}, S.pillBtn, {fontSize:12, padding:"5px 12px", borderColor:"rgba(111,172,255,0.5)", color:CL.blue})}>→ Side B</button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Settle buttons */}
                  {bet.settled ? (
                    <div style={{marginTop:6}}>
                      <div style={{fontSize:14, color:"#22c55e", fontFamily:"system-ui"}}>
                        {"🏆 Side "+(winSide==="a"?"A":"B")+" wins! Each winner gets $"+Math.round(bet.stake * (winSide==="a"?sideB:sideA).length / (winSide==="a"?sideA:sideB).length)}
                      </div>
                      <button onClick={function() { update({h2hBets:h2hBets.map(function(b) { return b.id===bet.id ? Object.assign({}, b, {settled:false, winningSide:null, winner:null}) : b; })}); }} style={{marginTop:6, fontSize:11, color:CL.muted, fontFamily:"system-ui", background:"none", border:"1px solid "+CL.border, borderRadius:6, padding:"5px 12px", cursor:"pointer"}}>↩ Undo — reopen bet</button>
                    </div>
                  ) : (
                    <div style={{display:"flex", gap:6, marginTop:8}}>
                      <button onClick={function() { settleBet("a"); }} style={Object.assign({}, S.pillBtn, {flex:1, textAlign:"center", padding:"8px 0", borderColor:"rgba(220,38,38,0.4)"})}>Side A wins</button>
                      <button onClick={function() { settleBet("b"); }} style={Object.assign({}, S.pillBtn, {flex:1, textAlign:"center", padding:"8px 0", borderColor:"rgba(37,99,235,0.4)"})}>Side B wins</button>
                    </div>
                  )}
                </div>
              );
            })}

            {h2hBets.length === 0 && <div style={{textAlign:"center", padding:16, color:CL.muted, fontFamily:"system-ui", fontSize:13}}>No bets yet. Create one below.</div>}
          </div>

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
              update({h2hBets:h2hBets.concat([{id:"h"+Date.now(), description:autoDesc, course:courseLabel, note:h2hText.trim(), stake:parseFloat(h2hAmt), bettor:bettor, opponent:opponent, sideA:[bettor], sideB:[opponent], settled:false, winner:null, winningSide:null}])});
              setH2hText(""); setH2hAmt(""); setBettor(null); setOpponent(null); setH2hCourse("");
            }}>Create Bet</button>
          </div>
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
              <div style={{display:"flex", gap:8}}>
                <select style={Object.assign({}, S.input, {flex:1})} value={round} onChange={function(e) { setRound(parseInt(e.target.value)); }}>{COURSES.map(function(c,i) { return <option key={i} value={i}>{"R"+(i+1)+": "+c.name}</option>; })}</select>
                <input style={Object.assign({}, S.input, {width:80})} type="number" value={stake} onChange={function(e) { setStake(e.target.value); }} placeholder="$"/>
              </div>
              <div style={Object.assign({}, S.cardTitle, {marginTop:8})}>Results (+ won / - lost)</div>
              {players.map(function(p) { return <div key={p.id} style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", fontSize:14, color:"#fff"}}><span>{p.emoji+" "+p.name}</span><input style={Object.assign({}, S.input, {width:80, margin:0})} type="number" value={results[p.id]||""} onChange={function(e) { var r = Object.assign({},results); r[p.id] = parseFloat(e.target.value)||0; setResults(r); }} placeholder="$0"/></div>; })}
              <button style={S.primaryBtn} onClick={addGame}>Save Game</button>
            </div>
          )}
          <div style={S.card}>
            <div style={S.cardTitle}>💸 Money List</div>
            {players.map(function(p) { return Object.assign({},p,{net:netMoney(p.id)}); }).sort(function(a,b) { return b.net-a.net; }).map(function(p) {
              return <div key={p.id} style={Object.assign({display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", fontSize:15, color:"#fff"}, S.separator)}><span>{p.emoji+" "+p.name}</span><span style={{fontWeight:700, fontSize:16, fontFamily:"system-ui", color:p.net>0?"#22c55e":p.net<0?"#ef4444":"#888"}}>{(p.net>0?"+":"")+(p.net===0?"Even":"$"+p.net)}</span></div>;
            })}
          </div>
          {games.length > 0 && (
            <div style={S.card}>
              <div style={S.cardTitle}>Game Log</div>
              {games.map(function(g) { var gt = GAME_TYPES.find(function(t) { return t.id===g.type; }); return (
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
            <div style={Object.assign({}, S.label, {marginBottom:12})}>Who owes who based on all side games</div>
            {(function() {
              var transfers = calculateSettleUp(players, games, bets, h2hBets, teamMatches, individualProps, expenses);
              if (transfers.length === 0) return (
                <div style={{textAlign:"center", padding:20, color:CL.muted, fontFamily:"system-ui", fontSize:14}}>
                  {games.length === 0 && h2hBets.filter(function(b){return b.settled;}).length === 0 && bets.filter(function(b){return b.settled;}).length === 0 ? "No bets or games settled yet." : "Everyone is settled up!"}
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
                      {transfers.length + " payment" + (transfers.length !== 1 ? "s" : "") + " to settle " + games.length + " side game" + (games.length !== 1 ? "s" : "") + ", " + bets.filter(function(b){return b.settled;}).length + " props, " + h2hBets.filter(function(b){return b.settled;}).length + " H2H bets"}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
          <div style={S.card}>
            <div style={S.cardTitle}>Net Balances</div>
            {players.map(function(p) { return Object.assign({}, p, {net:netMoney(p.id)}); }).sort(function(a,b) { return b.net - a.net; }).map(function(p) {
              return (
                <div key={p.id} style={Object.assign({display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", fontSize:14, color:"#fff"}, S.separator)}>
                  <span>{p.emoji + " " + p.name}</span>
                  <span style={{fontWeight:700, fontSize:16, fontFamily:"system-ui", color:p.net > 0 ? "#22c55e" : p.net < 0 ? "#ef4444" : CL.muted}}>{(p.net > 0 ? "+" : "") + (p.net === 0 ? "Even" : "$" + p.net)}</span>
                </div>
              );
            })}
          </div>
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

      {tab === "players" && (
        <div>
          <div style={S.card}>
            <div style={S.cardTitle}>Roster</div>
            {players.map(function(p) {
              return (
                <div key={p.id} style={Object.assign({display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", fontSize:14}, S.separator)}>
                  <span><span style={{marginRight:8}}>{p.emoji}</span><span style={{fontWeight:600, color:"#fff"}}>{p.name}</span><span style={{color:CL.muted, fontFamily:"system-ui", fontSize:12}}>{" · HCP "+p.handicap}</span></span>
                  <div style={{display:"flex", gap:8}}>
                    <button style={{background:"none", border:"none", cursor:"pointer", fontSize:14}} onClick={function() { setEditId(p.id); setPName(p.name); setPHcp(p.handicap.toString()); setPEmoji(p.emoji); }}>✏️</button>
                    <button style={{background:"none", border:"none", cursor:"pointer", fontSize:14}} onClick={function() { if (players.length<=2) return; update({players:players.filter(function(x) { return x.id!==p.id; })}); }}>🗑</button>
                  </div>
                </div>
              );
            })}
            <div style={{marginTop:12, paddingTop:12, borderTop:"1px solid "+CL.border}}>
              <input style={S.input} value={pName} onChange={function(e) { setPName(e.target.value); }} placeholder="Name"/>
              <input style={S.input} value={pHcp} onChange={function(e) { setPHcp(e.target.value); }} placeholder="Handicap" type="number"/>
              <div style={{display:"flex", gap:6, marginBottom:12}}>
                {EMOJIS.map(function(e) { return <button key={e} onClick={function() { setPEmoji(e); }} style={{fontSize:20, padding:6, background:"none", border:"2px solid "+(pEmoji===e?CL.red:"transparent"), borderRadius:6, cursor:"pointer"}}>{e}</button>; })}
              </div>
              <button style={S.primaryBtn} onClick={savePlayer}>{editId ? "Update" : "Add Player"}</button>
            </div>
          </div>
          <div style={Object.assign({}, S.card, {borderColor:"#7f1d1d"})}>
            <button style={{width:"100%", padding:12, background:"#7f1d1d", color:"#fff", border:"none", borderRadius:6, fontSize:13, cursor:"pointer", fontFamily:"system-ui"}} onClick={resetAll}>Reset All Data</button>
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

  function getExpenseBalances() {
    var bal = {};
    players.forEach(function(p) { bal[p.id] = 0; });
    expenses.forEach(function(exp) {
      if (!exp.payer || !exp.splitAmong || exp.splitAmong.length === 0) return;
      var perPerson = exp.amount / exp.splitAmong.length;
      // Payer credited full amount paid
      bal[exp.payer] = (bal[exp.payer] || 0) + exp.amount;
      // Everyone in the split debited their share
      exp.splitAmong.forEach(function(pid) {
        bal[pid] = (bal[pid] || 0) - perPerson;
      });
    });
    return bal;
  }

  var balances = getExpenseBalances();
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
  var players = props.players;
  var ms = useState([]); var messages = ms[0], setMessages = ms[1];
  var ls = useState(true); var chatLoading = ls[0], setChatLoading = ls[1];
  var ts = useState(""); var text = ts[0], setText = ts[1];

  // Real-time Firebase chat subscription
  useEffect(function() {
    var unsub = subscribeToChat(function(msgs) {
      setMessages(msgs);
      setChatLoading(false);
    });
    return function() { unsub(); };
  }, []);

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
