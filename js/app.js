/**
 * app.js — Main orchestrator for Face2R
 *
 * Imports all modules, wires up event listeners, and runs the
 * face-detection loop via requestAnimationFrame.
 */

import {
  initFirebase,
  onSyncStatus,
  onPersonsChanged,
  getAllPersons,
  savePerson,
  updatePerson,
  uploadPhoto,
  updateLastSeen
} from './firebase.js';

import { ensureAuthenticated } from './auth.js';

import {
  startCamera,
  switchCamera,
  captureFrame,
  captureFaceCrop,
  captureFrameAsBlob,
  getVideoElement
} from './camera.js';

import { initHuman, detectFaces, matchFace } from './recognition.js';

import { calculateConfidence } from './confidence.js';

import {
  showLoadingScreen,
  hideLoadingScreen,
  showCameraUI,
  updateStatusBar,
  renderFaceBoxes,
  showKnownFacePanel,
  hideKnownFacePanel,
  showAddPersonModal,
  hideAddPersonModal,
  getAddPersonFormData,
  showLowLightWarning,
  triggerRiskAlert,
  showToast
} from './ui.js';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------
let personsDb = {};
let syncStatus = 'offline';
let detectionLoop = null;
let frameCounter = 0;
const FRAME_SKIP = 3;
const lastSeenTimestamps = new Map();
let processing = false;
let lowLightCounter = 0;

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

async function init() {
  try {
    initFirebase();
    await ensureAuthenticated();

    showLoadingScreen('Loading face recognition models...', 10);
    await initHuman((msg, pct) => showLoadingScreen(msg, pct));

    showLoadingScreen('Connecting to database...', 85);

    onSyncStatus((status) => {
      syncStatus = status;
      const count = personsDb ? Object.keys(personsDb).length : 0;
      updateStatusBar(count, syncStatus);
    });

    onPersonsChanged((persons) => {
      personsDb = persons;
      const count = persons ? Object.keys(persons).length : 0;
      updateStatusBar(count, syncStatus);
    });

    showLoadingScreen('Starting camera...', 95);
    await startCamera(document.getElementById('camera-video'));

    hideLoadingScreen();
    showCameraUI();

    setupEventListeners();
    startDetectionLoop();
  } catch (err) {
    showToast('Startup failed: ' + err.message);
  }
}

// ---------------------------------------------------------------------------
// Detection loop
// ---------------------------------------------------------------------------

function startDetectionLoop() {
  async function loop() {
    frameCounter++;

    if (frameCounter % FRAME_SKIP === 0 && !processing) {
      processing = true;
      try {
        const video = getVideoElement();
        if (video && video.readyState >= 2) {
          const detected = await detectFaces(video);
          const overlay = document.getElementById('face-overlay');

          const faces = detected.map((face) => {
            const match = matchFace(face.embedding, personsDb);
            return {
              box: face.box,
              match: match || null,
              embedding: face.embedding,
              onKnownTap: (m) => showKnownFacePanel(m),
              onUnknownTap: (f) => handleAddPerson(f)
            };
          });

          renderFaceBoxes(faces, video, overlay);

          // Throttled updateLastSeen and risk alerts
          const now = Date.now();
          for (const face of faces) {
            if (face.match) {
              const pid = face.match.personId;
              const lastTime = lastSeenTimestamps.get(pid) || 0;
              if (now - lastTime > 30000) {
                lastSeenTimestamps.set(pid, now);
                updateLastSeen(pid).catch(() => {});
              }

              if (face.match.person && face.match.person.risk === 'red') {
                triggerRiskAlert();
              }
            }
          }

          // Periodic low-light check (every ~15 processed frames)
          lowLightCounter++;
          if (lowLightCounter % 15 === 0) {
            checkLowLight(video);
          }
        }
      } catch (_) {
        // Detection errors are non-fatal; skip frame
      }
      processing = false;
    }

    detectionLoop = requestAnimationFrame(loop);
  }

  detectionLoop = requestAnimationFrame(loop);
}

// ---------------------------------------------------------------------------
// Low-light check
// ---------------------------------------------------------------------------

function checkLowLight(video) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, 64, 64);
  const imageData = ctx.getImageData(0, 0, 64, 64);
  const data = imageData.data;

  let total = 0;
  const pixelCount = 64 * 64;
  for (let i = 0; i < data.length; i += 4) {
    total += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  const avg = total / pixelCount;

  showLowLightWarning(avg < 50);
}

// ---------------------------------------------------------------------------
// Add person
// ---------------------------------------------------------------------------

function handleAddPerson(face) {
  const canvas = captureFaceCrop(face.box);
  showAddPersonModal(canvas, face.embedding);
}

async function handleSavePerson() {
  try {
    const { name, notes, risk, embedding } = getAddPersonFormData();

    if (!name) {
      showToast('Name is required');
      return;
    }

    const canvas = document.getElementById('captured-face');
    const blob = await captureFrameAsBlob(canvas);

    const personId = await savePerson({ name, notes, risk });
    const photoId = await uploadPhoto(personId, blob, embedding);

    const conf = calculateConfidence({ [photoId]: { embedding } });
    await updatePerson(personId, { confidence: conf });

    showToast('Saved!');
    hideAddPersonModal();
  } catch (err) {
    showToast('Error: ' + err.message);
  }
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

function setupEventListeners() {
  // Switch camera
  document.getElementById('btn-switch-camera').addEventListener('click', () => {
    switchCamera();
  });

  // Capture button — find first unknown face box and click it
  document.getElementById('btn-capture').addEventListener('click', () => {
    const unknownBox = document.querySelector('#face-overlay .face-box.unknown');
    if (unknownBox) {
      unknownBox.click();
    } else {
      showToast('No unknown face detected');
    }
  });

  // Admin
  document.getElementById('btn-admin').addEventListener('click', () => {
    window.location.href = 'admin.html';
  });

  // Save person
  document.getElementById('btn-save-person').addEventListener('click', () => {
    handleSavePerson();
  });

  // Enable/disable save button based on name input
  document.getElementById('input-person-name').addEventListener('input', (e) => {
    document.getElementById('btn-save-person').disabled = e.target.value.trim().length === 0;
  });

  // Risk buttons
  document.querySelectorAll('.risk-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.risk-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  // Modal overlay dismiss (click on overlay itself, not the sheet)
  const modalOverlay = document.querySelector('.modal-overlay');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        hideAddPersonModal();
      }
    });
  }

  // Modal close button
  const modalClose = document.querySelector('.modal-close');
  if (modalClose) {
    modalClose.addEventListener('click', () => {
      hideAddPersonModal();
    });
  }

  // Known-face panel close
  document.getElementById('qp-close').addEventListener('click', () => {
    hideKnownFacePanel();
  });

  // Add photo to existing person
  document.getElementById('qp-add-photo').addEventListener('click', async () => {
    try {
      const panel = document.getElementById('known-face-panel');
      const personId = panel.dataset.personId;
      if (!personId) return;

      const frameCanvas = captureFrame();
      const detected = await detectFaces(frameCanvas);
      if (!detected || detected.length === 0) {
        showToast('No face detected in frame');
        return;
      }

      const face = detected[0];
      const cropCanvas = captureFaceCrop(face.box);
      const blob = await captureFrameAsBlob(cropCanvas);
      await uploadPhoto(personId, blob, face.embedding);

      // Recalculate confidence with all photos from personsDb
      const person = personsDb[personId];
      const allPhotos = person && person.photos ? person.photos : {};
      const conf = calculateConfidence(allPhotos);
      await updatePerson(personId, { confidence: conf });

      showToast('Photo added!');

      // Refresh the known face panel with updated data
      const updatedPerson = personsDb[personId];
      if (updatedPerson) {
        showKnownFacePanel({
          personId: personId,
          person: updatedPerson,
          matchPercent: parseInt(document.getElementById('qp-match').textContent, 10) || 0
        });
      }
    } catch (err) {
      showToast('Error: ' + err.message);
    }
  });

  // Edit risk — cycle green → neutral → red → green
  document.getElementById('qp-edit-risk').addEventListener('click', async () => {
    try {
      const panel = document.getElementById('known-face-panel');
      const personId = panel.dataset.personId;
      if (!personId) return;

      const person = personsDb[personId];
      if (!person) return;

      const cycle = { green: 'neutral', neutral: 'red', red: 'green' };
      const newRisk = cycle[person.risk] || 'neutral';
      await updatePerson(personId, { risk: newRisk });

      // Update badge display
      const RISK_LABELS = { red: 'RISK', green: 'LOW', neutral: 'NEUTRAL' };
      const badge = document.getElementById('qp-badge');
      badge.className = 'badge-' + newRisk;
      badge.textContent = RISK_LABELS[newRisk] || 'NEUTRAL';
    } catch (err) {
      showToast('Error: ' + err.message);
    }
  });
}

// ---------------------------------------------------------------------------
// Service Worker registration
// ---------------------------------------------------------------------------

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

init();
