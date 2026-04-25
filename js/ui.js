/**
 * ui.js — All DOM manipulation for Face2R camera app.
 * ES module. Uses safe DOM methods (createElement + textContent) — NEVER innerHTML with dynamic data.
 */

import { getConfidenceColor, getRecommendation } from './confidence.js';

/* ── Risk label map ── */
const RISK_LABELS = { red: 'RISK', green: 'LOW', neutral: 'NEUTRAL' };

/* ── Module-level cooldown for risk alert ── */
let lastAlertTime = 0;

/* ─────────────────── 1. showLoadingScreen ─────────────────── */
export function showLoadingScreen(message, progress) {
  const screen = document.getElementById('loading-screen');
  screen.style.display = 'flex';

  const status = screen.querySelector('.loading-status');
  status.textContent = message;

  const fill = screen.querySelector('.loading-bar-fill');
  fill.style.width = `${progress}%`;
}

/* ─────────────────── 2. hideLoadingScreen ─────────────────── */
export function hideLoadingScreen() {
  document.getElementById('loading-screen').style.display = 'none';
}

/* ─────────────────── 3. showCameraUI ─────────────────── */
export function showCameraUI() {
  document.getElementById('camera-container').style.display = '';
  document.getElementById('face-overlay').style.display = '';
  document.getElementById('status-bar').style.display = 'flex';
  document.getElementById('toolbar').style.display = 'flex';
}

/* ─────────────────── 4. updateStatusBar ─────────────────── */
export function updateStatusBar(personCount, syncStatus) {
  document.getElementById('person-count').textContent = `${personCount} persons`;

  const dot = document.querySelector('.sync-dot');
  dot.classList.remove('syncing', 'offline');

  if (syncStatus === 'syncing') {
    dot.classList.add('syncing');
  } else if (syncStatus === 'offline') {
    dot.classList.add('offline');
  }
  // 'synced' — no extra class needed (default state)

  document.getElementById('sync-status').textContent = syncStatus;
}

/* ─────────────────── 5. renderFaceBoxes ─────────────────── */
export function renderFaceBoxes(faces, videoElement, overlayEl) {
  // Clear all existing children
  while (overlayEl.firstChild) {
    overlayEl.removeChild(overlayEl.firstChild);
  }

  const scaleX = overlayEl.clientWidth / videoElement.videoWidth;
  const scaleY = overlayEl.clientHeight / videoElement.videoHeight;

  for (const face of faces) {
    const box = document.createElement('div');
    box.className = 'face-box';
    box.style.position = 'absolute';
    box.style.left = `${face.box.x * scaleX}px`;
    box.style.top = `${face.box.y * scaleY}px`;
    box.style.width = `${face.box.width * scaleX}px`;
    box.style.height = `${face.box.height * scaleY}px`;

    const label = document.createElement('div');
    label.className = 'face-label';

    if (face.match) {
      // Known face
      const person = face.match.person;
      if (person.risk === 'red') {
        box.classList.add('risk');
      } else {
        box.classList.add('known');
      }

      const nameSpan = document.createElement('span');
      nameSpan.textContent = person.name;
      label.appendChild(nameSpan);

      const badgeSpan = document.createElement('span');
      badgeSpan.className = `badge-${person.risk}`;
      badgeSpan.textContent = RISK_LABELS[person.risk] || 'NEUTRAL';
      label.appendChild(badgeSpan);

      const matchSpan = document.createElement('span');
      matchSpan.textContent = face.match.matchPercent + '%';
      label.appendChild(matchSpan);

      box.addEventListener('click', () => {
        face.onKnownTap(face.match);
      });
    } else {
      // Unknown face
      box.classList.add('unknown');
      label.textContent = 'Unknown — Tap to add';

      box.addEventListener('click', () => {
        face.onUnknownTap(face);
      });
    }

    box.appendChild(label);
    overlayEl.appendChild(box);
  }
}

/* ─────────────────── 6. showKnownFacePanel ─────────────────── */
export function showKnownFacePanel(match) {
  const panel = document.getElementById('known-face-panel');
  const person = match.person;

  document.getElementById('qp-name').textContent = person.name;

  const badge = document.getElementById('qp-badge');
  badge.className = `badge-${person.risk}`;
  badge.textContent = RISK_LABELS[person.risk] || 'NEUTRAL';

  document.getElementById('qp-match').textContent = `${match.matchPercent}% match`;
  document.getElementById('qp-notes').textContent = person.notes || 'No notes';

  // Confidence bar
  const confidence = person.confidence;
  const confColor = getConfidenceColor(confidence);
  const photoCount = person.photos ? Object.keys(person.photos).length : 0;
  const recommendation = getRecommendation(confidence, photoCount);

  const confFill = document.getElementById('qp-confidence-fill');
  confFill.style.width = `${confidence}%`;
  confFill.style.background = confColor;

  document.getElementById('qp-confidence-pct').textContent = `${confidence}%`;
  document.getElementById('qp-confidence-rec').textContent = recommendation.text;

  // Store personId
  panel.dataset.personId = match.personId;

  panel.classList.add('active');
}

/* ─────────────────── 7. hideKnownFacePanel ─────────────────── */
export function hideKnownFacePanel() {
  document.getElementById('known-face-panel').classList.remove('active');
}

/* ─────────────────── 8. showAddPersonModal ─────────────────── */
export function showAddPersonModal(faceCanvas, embedding) {
  const modal = document.getElementById('add-person-modal');

  // Draw captured face onto the 80x80 canvas
  const canvas = document.getElementById('captured-face');
  const ctx = canvas.getContext('2d');
  ctx.drawImage(faceCanvas, 0, 0, 80, 80);

  // Reset form
  document.getElementById('input-person-name').value = '';
  document.getElementById('input-person-notes').value = '';

  // Reset risk buttons — select neutral
  const riskBtns = modal.querySelectorAll('.risk-btn');
  riskBtns.forEach((btn) => {
    btn.classList.remove('selected');
    if (btn.dataset.risk === 'neutral') {
      btn.classList.add('selected');
    }
  });

  // Store embedding
  modal.dataset.embedding = JSON.stringify(embedding);

  // Disable save button
  document.getElementById('btn-save-person').disabled = true;

  // Show modal
  modal.classList.add('active');
}

/* ─────────────────── 9. hideAddPersonModal ─────────────────── */
export function hideAddPersonModal() {
  document.getElementById('add-person-modal').classList.remove('active');
}

/* ─────────────────── 10. getAddPersonFormData ─────────────────── */
export function getAddPersonFormData() {
  const modal = document.getElementById('add-person-modal');

  const name = document.getElementById('input-person-name').value.trim();
  const notes = document.getElementById('input-person-notes').value.trim();

  const selectedBtn = modal.querySelector('.risk-btn.selected');
  const risk = selectedBtn ? selectedBtn.dataset.risk : 'neutral';

  const embedding = JSON.parse(modal.dataset.embedding);

  return { name, notes, risk, embedding };
}

/* ─────────────────── 11. showLowLightWarning ─────────────────── */
export function showLowLightWarning(show) {
  document.getElementById('low-light-warning').style.display = show ? '' : 'none';
}

/* ─────────────────── 12. triggerRiskAlert ─────────────────── */
export function triggerRiskAlert() {
  const now = Date.now();
  if (now - lastAlertTime < 5000) return;

  // Vibration
  if (navigator.vibrate) {
    navigator.vibrate([200, 100, 200, 100, 200]);
  }

  // Sound — square wave at 880 Hz for 500ms
  try {
    const audioCtx = new AudioContext();
    const osc = audioCtx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 880;
    osc.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
  } catch (_) {
    // AudioContext may not be available in all environments
  }

  lastAlertTime = now;
}

/* ─────────────────── 13. showToast ─────────────────── */
export function showToast(message, duration = 3000) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('visible');

  setTimeout(() => {
    toast.classList.remove('visible');
  }, duration);
}
