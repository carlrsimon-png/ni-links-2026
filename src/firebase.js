import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, setDoc, onSnapshot, collection, addDoc, query, orderBy, limit, deleteDoc } from "firebase/firestore";

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
  });
} catch (e) {
  console.warn("Persistent cache unavailable, falling back to memory cache:", e);
  db = initializeFirestore(app, {});
}

// ─── Trip state (scores, bets, games, drinks) ───────────
const TRIP_ID = "ni-links-2026";
const tripRef = doc(db, "trips", TRIP_ID);

export function subscribeToState(callback) {
  return onSnapshot(tripRef, function(snap) {
    if (snap.exists()) {
      callback(snap.data());
    } else {
      callback(null);
    }
  }, function(err) {
    console.error("Firestore state error:", err);
    callback(null);
  });
}

export function saveState(data) {
  return setDoc(tripRef, data, { merge: true }).catch(function(err) {
    console.error("Save failed:", err);
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
