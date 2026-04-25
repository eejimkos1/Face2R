/**
 * firebase.js — Firebase data layer for Face2R
 *
 * Initializes Firebase (v9 modular SDK from CDN) and exposes all
 * CRUD, auth, and real-time sync functions used by the app.
 *
 * Photos are stored as Base64 data URLs directly in the Realtime
 * Database (no Firebase Storage needed — stays on free Spark plan).
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';
import {
  getDatabase,
  ref,
  set,
  get,
  push,
  update,
  remove,
  onValue
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js';

// ---------------------------------------------------------------------------
// Firebase config — placeholder values, filled in Task 10
// ---------------------------------------------------------------------------
const firebaseConfig = {
  apiKey: 'AIzaSyDxPj45xVDLOQ0GwRC54nUJwDJBuSVQme8',
  authDomain: 'face2r.firebaseapp.com',
  databaseURL: 'https://face2r-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'face2r',
  storageBucket: 'face2r.firebasestorage.app',
  messagingSenderId: '689398566120',
  appId: '1:689398566120:web:c947d8d4d36efee4cfcd5d'
};

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------
let app = null;
let auth = null;
let db = null;

let personsCache = {};
let syncStatusCallback = null;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns a stable device identifier, creating one on first call.
 * Stored in localStorage so it survives page reloads.
 */
function getDeviceId() {
  const KEY = 'face2r-device-id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = `device-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}

/**
 * Converts a Blob to a Base64 data URL string.
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Notifies the registered sync-status callback (if any).
 * @param {'synced' | 'syncing' | 'offline'} status
 */
function notifySyncStatus(status) {
  if (typeof syncStatusCallback === 'function') {
    syncStatusCallback(status);
  }
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Initializes the Firebase app and all service instances.
 * Must be called once before any other function in this module.
 */
export function initFirebase() {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);
}

/**
 * Returns the Firebase Auth instance.
 */
export function getAuthInstance() {
  return auth;
}

/**
 * Registers a callback that receives the current sync status.
 * Uses the special `.info/connected` path in Realtime Database
 * to detect online / offline transitions.
 *
 * @param {(status: 'synced' | 'syncing' | 'offline') => void} callback
 */
export function onSyncStatus(callback) {
  syncStatusCallback = callback;

  const connectedRef = ref(db, '.info/connected');
  onValue(connectedRef, (snapshot) => {
    if (snapshot.val() === true) {
      notifySyncStatus('synced');
    } else {
      notifySyncStatus('offline');
    }
  });
}

/**
 * Signs in the current user anonymously.
 * @returns {Promise} resolves with the UserCredential
 */
export function signIn() {
  return signInAnonymously(auth);
}

/**
 * Wraps Firebase onAuthStateChanged so callers don't need the auth reference.
 * @param {(user: object | null) => void} callback
 */
export function onAuthChanged(callback) {
  onAuthStateChanged(auth, callback);
}

// ---------------------------------------------------------------------------
// PIN helpers
// ---------------------------------------------------------------------------

/**
 * Reads the hashed PIN stored at /app/pin.
 * @returns {Promise<string | null>}
 */
export async function getPinHash() {
  const snapshot = await get(ref(db, 'app/pin'));
  return snapshot.exists() ? snapshot.val() : null;
}

/**
 * Writes a hashed PIN string to /app/pin.
 * @param {string} hash
 * @returns {Promise<void>}
 */
export function setPinHash(hash) {
  return set(ref(db, 'app/pin'), hash);
}

// ---------------------------------------------------------------------------
// Persons — real-time sync & cache
// ---------------------------------------------------------------------------

/**
 * Attaches a real-time listener to /persons. On every change the snapshot
 * is converted to a plain object, cached locally, and forwarded to the
 * supplied callback.
 *
 * @param {(persons: object) => void} callback
 */
export function onPersonsChanged(callback) {
  const personsRef = ref(db, 'persons');
  onValue(personsRef, (snapshot) => {
    personsCache = snapshot.exists() ? snapshot.val() : {};
    callback(personsCache);
    notifySyncStatus('synced');
  });
}

/**
 * Returns the last-known persons data (or an empty object if the
 * real-time listener has not yet fired).
 * @returns {object}
 */
export function getAllPersons() {
  return personsCache || {};
}

// ---------------------------------------------------------------------------
// Persons — CRUD
// ---------------------------------------------------------------------------

/**
 * Creates a new person record under /persons.
 *
 * @param {{ name: string, notes: string, risk: string }} personData
 * @returns {Promise<string>} the generated person ID
 */
export async function savePerson(personData) {
  const newRef = push(ref(db, 'persons'));
  const now = Date.now();
  await set(newRef, {
    name: personData.name,
    notes: personData.notes,
    risk: personData.risk,
    confidence: 0,
    photos: {},
    photoCount: 0,
    lastSeen: now,
    createdAt: now,
    updatedAt: now
  });
  return newRef.key;
}

/**
 * Partially updates a person record. Automatically sets updatedAt.
 *
 * @param {string} personId
 * @param {object} updates
 * @returns {Promise<void>}
 */
export function updatePerson(personId, updates) {
  return update(ref(db, `persons/${personId}`), {
    ...updates,
    updatedAt: Date.now()
  });
}

/**
 * Deletes a person and all their data from the database.
 *
 * @param {string} personId
 * @returns {Promise<void>}
 */
export function deletePerson(personId) {
  return remove(ref(db, `persons/${personId}`));
}

// ---------------------------------------------------------------------------
// Photos — stored as Base64 in Realtime Database
// ---------------------------------------------------------------------------

/**
 * Stores a photo as Base64 in the Realtime Database under the person's
 * photos node, along with the embedding and metadata. Increments photoCount.
 *
 * @param {string} personId
 * @param {Blob}   imageBlob  — JPEG blob from canvas
 * @param {Float32Array | number[]} embedding
 * @returns {Promise<string>} the generated photo ID
 */
export async function uploadPhoto(personId, imageBlob, embedding) {
  const photoRef = push(ref(db, `persons/${personId}/photos`));
  const photoId = photoRef.key;

  const dataUrl = await blobToBase64(imageBlob);

  await set(ref(db, `persons/${personId}/photos/${photoId}`), {
    dataUrl: dataUrl,
    embedding: Array.from(embedding),
    capturedAt: Date.now(),
    capturedBy: getDeviceId()
  });

  const person = personsCache[personId];
  const currentCount = (person && person.photoCount) || 0;
  await update(ref(db, `persons/${personId}`), {
    photoCount: currentCount + 1,
    updatedAt: Date.now()
  });

  return photoId;
}

/**
 * Deletes a single photo record from the database and decrements photoCount.
 *
 * @param {string} personId
 * @param {string} photoId
 * @returns {Promise<void>}
 */
export async function deletePhoto(personId, photoId) {
  await remove(ref(db, `persons/${personId}/photos/${photoId}`));

  const person = personsCache[personId];
  const currentCount = (person && person.photoCount) || 0;
  await update(ref(db, `persons/${personId}`), {
    photoCount: Math.max(0, currentCount - 1),
    updatedAt: Date.now()
  });
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/**
 * Convenience function to update a person's lastSeen timestamp.
 *
 * @param {string} personId
 * @returns {Promise<void>}
 */
export function updateLastSeen(personId) {
  return update(ref(db, `persons/${personId}`), {
    lastSeen: Date.now()
  });
}
