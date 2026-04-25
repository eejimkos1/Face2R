/**
 * auth.js — PIN authentication with Firebase Anonymous Auth for Face2R
 *
 * Handles PIN verification flow:
 * 1. Check for existing Firebase session
 * 2. Show PIN screen if no session
 * 3. Authenticate anonymously, then verify/set PIN hash
 */

import { signIn, getPinHash, setPinHash, getAuthInstance } from './firebase.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Hashes a PIN string using the Web Crypto API (SHA-256).
 * @param {string} pin
 * @returns {Promise<string>} hex-encoded hash
 */
async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(buffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// PIN screen UI
// ---------------------------------------------------------------------------

/** @type {(() => void) | null} */
let resolveAuth = null;

/**
 * Shows the PIN screen and focuses the input.
 * Attaches listeners for Enter key and submit button.
 */
function showPinScreen() {
  const screen = document.getElementById('pin-screen');
  const input = screen.querySelector('.pin-input');
  const submitBtn = screen.querySelector('.pin-submit');
  const errorEl = screen.querySelector('.pin-error');

  screen.style.display = '';
  errorEl.textContent = '';
  input.value = '';
  input.focus();

  // Remove any previous listeners to avoid duplicates
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  const newSubmitBtn = submitBtn.cloneNode(true);
  submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);

  newInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handlePinSubmit();
    }
  });

  newSubmitBtn.addEventListener('click', () => {
    handlePinSubmit();
  });

  newInput.focus();
}

/**
 * Hides the PIN screen.
 */
function hidePinScreen() {
  const screen = document.getElementById('pin-screen');
  screen.style.display = 'none';
}

// ---------------------------------------------------------------------------
// PIN submit logic
// ---------------------------------------------------------------------------

/**
 * Handles PIN submission:
 * 1. Signs in anonymously via Firebase
 * 2. Checks if a PIN hash exists in the database
 * 3. First-time setup: stores the hash
 * 4. Subsequent uses: compares hashes
 */
async function handlePinSubmit() {
  const screen = document.getElementById('pin-screen');
  const input = screen.querySelector('.pin-input');
  const errorEl = screen.querySelector('.pin-error');

  const pin = input.value;
  if (!pin) {
    return;
  }

  try {
    // Step 1: Anonymous sign-in (creates or resumes session)
    await signIn();

    // Step 2: Hash the entered PIN
    const enteredHash = await hashPin(pin);

    // Step 3: Check for existing PIN hash in the database
    const storedHash = await getPinHash();

    if (!storedHash) {
      // First-time setup — store the PIN hash
      await setPinHash(enteredHash);
      hidePinScreen();
      if (resolveAuth) {
        resolveAuth();
        resolveAuth = null;
      }
    } else if (storedHash === enteredHash) {
      // PIN matches
      hidePinScreen();
      if (resolveAuth) {
        resolveAuth();
        resolveAuth = null;
      }
    } else {
      // PIN mismatch
      errorEl.textContent = 'Incorrect PIN';
      input.value = '';
      input.focus();
    }
  } catch (err) {
    errorEl.textContent = 'Authentication failed. Please try again.';
    input.value = '';
    input.focus();
  }
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Returns true if the user is currently authenticated (Firebase session exists).
 * @returns {boolean}
 */
export function isAuthenticated() {
  const authInstance = getAuthInstance();
  return !!(authInstance && authInstance.currentUser);
}

/**
 * Ensures the user is authenticated. If a Firebase session already exists,
 * resolves immediately. Otherwise shows the PIN screen and waits for
 * successful PIN entry.
 *
 * @returns {Promise<void>}
 */
export function ensureAuthenticated() {
  return new Promise((resolve) => {
    if (isAuthenticated()) {
      resolve();
      return;
    }

    resolveAuth = resolve;
    showPinScreen();
  });
}
