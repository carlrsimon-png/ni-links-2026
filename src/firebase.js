import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, setDoc, updateDoc, onSnapshot, collection, addDoc, query, orderBy, limit, deleteDoc } from "firebase/firestore";

// ╔══════════════════════════════════════════════════════╗
// ║  REPLACE THESE WITH YOUR FIREBASE PROJECT VALUES    ║
// ║  (see README.md Step 1 for instructions)            ║
// ╚══════════════════════════════════════════════════════╝
const firebaseConfig = {
  apiKey: "AIzaSyBZnDkXOX6mF2iU-TTKgDYHw18ruoHTPC0",
  authDomain: "ni-links-2026.firebaseapp.com",
  projectId: "ni-links-2026",
  storageBucket: "ni-links-2026.firebasestorage.app",
  messagingSenderId: "246957309293",
  appId: "1:246957309293:web:3abb3b25208ac7c7cdae64"
};

const app = initializeApp(firebaseConfig);
// Persistent local cache: serves reads from IndexedDB when offline and queues
// writes durably (survives reloads / tab eviction), syncing automatically when
// the connection returns. Multi-tab manager keeps the cache consistent if the
// app is open in more than one tab. Falls back gracefully if IndexedDB is
// unavailable (e.g. private browsing) — the app still works online.
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    // Firestore throws on undefined field values (same failure class as nested
    // arrays). Skipping them instead means one stray undefined can't silently
    // kill an entire save.
    ignoreUndefinedProperties: true,
  });
} catch (e) {
  console.warn("Persistent cache unavailable, falling back to memory cache:", e);
  db = initializeFirestore(app, { ignoreUndefinedProperties: true });
}

// ─── Trip state (scores, bets, games, drinks) ───────────
const TRIP_ID = "ni-links-2026";
const tripRef = doc(db, "trips", TRIP_ID);

// Firestore forbids an array directly inside another array, but the app stores
// skinsEligible.course as an array-of-arrays. We transparently wrap any nested
// array as { __arr: [...] } on the way out and unwrap it on the way in, so the
// in-app data shape never has to change. Without this, every full-document save
// throws "Nested arrays are not supported" and silently persists nothing.
function encodeNested(val) {
  if (Array.isArray(val)) {
    return val.map(function(item) {
      return Array.isArray(item) ? { __arr: encodeNested(item) } : encodeNested(item);
    });
  }
  if (val && typeof val === "object") {
    var out = {};
    Object.keys(val).forEach(function(k) { out[k] = encodeNested(val[k]); });
    return out;
  }
  return val;
}
function decodeNested(val) {
  if (Array.isArray(val)) {
    return val.map(function(item) { return decodeNested(item); });
  }
  if (val && typeof val === "object") {
    if (Object.keys(val).length === 1 && Array.isArray(val.__arr)) {
      return decodeNested(val.__arr);
    }
    var out = {};
    Object.keys(val).forEach(function(k) { out[k] = decodeNested(val[k]); });
    return out;
  }
  return val;
}

export function subscribeToState(callback) {
  return onSnapshot(tripRef, function(snap) {
    if (snap.exists()) {
      callback(decodeNested(snap.data()));
    } else {
      callback(null);
    }
  }, function(err) {
    console.error("Firestore state error:", err);
    callback(null);
  });
}

export function saveState(data) {
  return setDoc(tripRef, encodeNested(data), { merge: true }).catch(function(err) {
    console.error("Save failed:", err);
    throw err; // surface real failures so the UI shows "error" instead of a false "saved"
  });
}

// Targeted write for a single player's single round of scores. Writes ONLY the
// field path scores.<pid>.<ri> instead of the whole scores map, so two phones
// entering scores for DIFFERENT players (or rounds) at the same time can no
// longer overwrite each other. (Two phones editing the exact same player+round
// at once is still last-write-wins, but that's a much narrower window.)
export function saveScorePath(pid, ri, holeArr) {
  var field = "scores." + pid + "." + ri;
  var payload = {};
  payload[field] = holeArr;
  return updateDoc(tripRef, encodeNested(payload)).catch(function(err) {
    console.error("Score save failed:", err);
    throw err; // let the caller surface a "not saved" indicator
  });
}

// ─── Chat messages (real-time collection) ────────────────
const chatRef = collection(db, "trips", TRIP_ID, "chat");

export function subscribeToChat(callback) {
  var q = query(chatRef, orderBy("ts", "desc"), limit(200));
  return onSnapshot(q, function(snap) {
    var messages = [];
    snap.forEach(function(doc) {
      messages.push(Object.assign({ id: doc.id }, doc.data()));
    });
    callback(messages);
  }, function(err) {
    console.error("Firestore chat error:", err);
    callback([]);
  });
}

export function sendChatMessage(msg) {
  return addDoc(chatRef, msg).catch(function(err) {
    console.error("Chat send failed:", err);
  });
}

export function deleteChatMessage(msgId) {
  return deleteDoc(doc(db, "trips", TRIP_ID, "chat", msgId)).catch(function(err) {
    console.error("Chat delete failed:", err);
  });
}
