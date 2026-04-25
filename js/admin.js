import {
  initFirebase,
  onSyncStatus,
  onPersonsChanged,
  getAllPersons,
  savePerson,
  updatePerson,
  deletePerson,
  uploadPhoto,
  deletePhoto,
  getPinHash,
  setPinHash
} from './firebase.js';

import { ensureAuthenticated } from './auth.js';
import { calculateConfidence, getConfidenceColor, getRecommendation } from './confidence.js';
import { initHuman, detectFaces, isReady } from './recognition.js';

import {
  showView,
  showLoading,
  hideLoading,
  updateSyncStatus,
  updatePersonCount,
  renderPersonList,
  renderEditView,
  renderPhotoGrid,
  renderAddView,
  showDeleteModal,
  hideDeleteModal,
  showDeletePhotoModal,
  hideDeletePhotoModal,
  showToast
} from './admin-ui.js';

let personsDb = {};
let currentView = 'view-list';
let currentPersonId = null;
let searchTerm = '';
let riskFilter = 'all';

let addPersonPhotos = {};
let pendingDeletePhotoId = null;
let pendingDeleteContext = null;

async function init() {
  try {
    initFirebase();
    await ensureAuthenticated();

    showLoading('Connecting...');

    onSyncStatus((status) => updateSyncStatus(status));

    onPersonsChanged((persons) => {
      personsDb = persons;
      const count = persons ? Object.keys(persons).length : 0;
      updatePersonCount(count);

      if (currentView === 'view-list') {
        renderPersonList(personsDb, searchTerm, riskFilter, navigateToEdit);
      }

      if (currentView === 'view-edit' && currentPersonId && personsDb[currentPersonId]) {
        renderEditView(currentPersonId, personsDb[currentPersonId]);
        renderPhotoGrid(
          'edit-photo-grid',
          personsDb[currentPersonId].photos,
          (photoId) => promptDeletePhoto(photoId, 'edit'),
          () => triggerPhotoUpload('edit')
        );
      }
    });

    hideLoading();
    showView('view-list');
    setupEventListeners();
    setupHistoryNavigation();
  } catch (err) {
    showToast('Startup failed: ' + err.message);
  }
}

function navigateToEdit(personId) {
  currentPersonId = personId;
  currentView = 'view-edit';
  const person = personsDb[personId];
  if (!person) return;

  renderEditView(personId, person);
  renderPhotoGrid(
    'edit-photo-grid',
    person.photos,
    (photoId) => promptDeletePhoto(photoId, 'edit'),
    () => triggerPhotoUpload('edit')
  );

  showView('view-edit');
  history.pushState({ view: 'view-edit', personId }, '');
}

function navigateToAdd() {
  currentView = 'view-add';
  addPersonPhotos = {};
  renderAddView();
  showView('view-add');
  history.pushState({ view: 'view-add' }, '');
}

function navigateToChangePin() {
  currentView = 'view-pin';
  document.getElementById('pin-current').value = '';
  document.getElementById('pin-new').value = '';
  document.getElementById('pin-confirm').value = '';
  document.getElementById('pin-change-error').textContent = '';
  showView('view-pin');
  history.pushState({ view: 'view-pin' }, '');
}

function navigateToList() {
  currentView = 'view-list';
  currentPersonId = null;
  renderPersonList(personsDb, searchTerm, riskFilter, navigateToEdit);
  showView('view-list');
  history.pushState({ view: 'view-list' }, '');
}

function setupHistoryNavigation() {
  history.replaceState({ view: 'view-list' }, '');
  window.addEventListener('popstate', (e) => {
    const state = e.state;
    if (!state || state.view === 'view-list') {
      currentView = 'view-list';
      currentPersonId = null;
      renderPersonList(personsDb, searchTerm, riskFilter, navigateToEdit);
      showView('view-list');
    } else if (state.view === 'view-edit' && state.personId) {
      navigateToEdit(state.personId);
    } else if (state.view === 'view-add') {
      navigateToAdd();
    } else if (state.view === 'view-pin') {
      navigateToChangePin();
    }
  });
}

async function handleSaveEdit() {
  if (!currentPersonId) return;
  const name = document.getElementById('edit-name').value.trim();
  if (!name) {
    showToast('Name is required');
    return;
  }

  const selectedRisk = document.querySelector('#view-edit .risk-btn.selected');
  const risk = selectedRisk ? selectedRisk.dataset.risk : 'neutral';
  const notes = document.getElementById('edit-notes').value.trim();

  try {
    await updatePerson(currentPersonId, { name, risk, notes });
    showToast('Saved!');
  } catch (err) {
    showToast('Error: ' + err.message);
  }
}

async function handleSaveAdd() {
  const name = document.getElementById('add-name').value.trim();
  if (!name) {
    showToast('Name is required');
    return;
  }

  const photoEntries = Object.values(addPersonPhotos);
  if (photoEntries.length === 0) {
    showToast('At least one photo is required');
    return;
  }

  const selectedRisk = document.querySelector('#add-risk-selector .risk-btn.selected');
  const risk = selectedRisk ? selectedRisk.dataset.risk : 'neutral';
  const notes = document.getElementById('add-notes').value.trim();

  try {
    const personId = await savePerson({ name, notes, risk });

    for (const photo of photoEntries) {
      await uploadPhoto(personId, photo.blob, photo.embedding);
    }

    const person = getAllPersons()[personId];
    const allPhotos = person && person.photos ? person.photos : {};
    const conf = calculateConfidence(allPhotos);
    await updatePerson(personId, { confidence: conf });

    showToast('Person added!');
    addPersonPhotos = {};
    navigateToList();
  } catch (err) {
    showToast('Error: ' + err.message);
  }
}

async function handleDeletePerson() {
  if (!currentPersonId) return;
  try {
    await deletePerson(currentPersonId);
    hideDeleteModal();
    showToast('Person deleted');
    navigateToList();
  } catch (err) {
    showToast('Error: ' + err.message);
  }
}

function promptDeletePhoto(photoId, context) {
  pendingDeletePhotoId = photoId;
  pendingDeleteContext = context;
  showDeletePhotoModal();
}

async function handleDeletePhoto() {
  const photoId = pendingDeletePhotoId;
  const context = pendingDeleteContext;
  hideDeletePhotoModal();

  if (!photoId) return;

  if (context === 'edit' && currentPersonId) {
    try {
      await deletePhoto(currentPersonId, photoId);

      const person = getAllPersons()[currentPersonId];
      const allPhotos = person && person.photos ? person.photos : {};
      const conf = calculateConfidence(allPhotos);
      await updatePerson(currentPersonId, { confidence: conf });

      showToast('Photo deleted');
    } catch (err) {
      showToast('Error: ' + err.message);
    }
  } else if (context === 'add') {
    delete addPersonPhotos[photoId];
    refreshAddPhotos();
    showToast('Photo removed');
  }

  pendingDeletePhotoId = null;
  pendingDeleteContext = null;
}

function triggerPhotoUpload(context) {
  const input = document.getElementById('photo-file-input');
  input.dataset.context = context;
  input.value = '';
  input.click();
}

async function handlePhotoFile(file, context) {
  try {
    showToast('Processing face...');

    if (!isReady()) {
      showToast('Loading face models...');
      await initHuman((msg, pct) => showToast(`${msg} (${pct}%)`));
    }

    const img = await loadImageFromFile(file);
    const detected = await detectFaces(img);

    if (!detected || detected.length === 0) {
      showToast('No face detected in this image');
      return;
    }

    const face = detected[0];
    const canvas = cropFaceToCanvas(img, face.box, 300, 300);
    const blob = await canvasToBlob(canvas);

    if (context === 'edit' && currentPersonId) {
      await uploadPhoto(currentPersonId, blob, face.embedding);

      const person = getAllPersons()[currentPersonId];
      const allPhotos = person && person.photos ? person.photos : {};
      const conf = calculateConfidence(allPhotos);
      await updatePerson(currentPersonId, { confidence: conf });

      showToast('Photo added!');
    } else if (context === 'add') {
      const tempId = 'temp-' + Date.now();
      const dataUrl = await blobToDataUrl(blob);
      addPersonPhotos[tempId] = {
        blob,
        embedding: face.embedding,
        dataUrl
      };
      refreshAddPhotos();
      showToast('Photo added!');
    }
  } catch (err) {
    showToast('Error: ' + err.message);
  }
}

function refreshAddPhotos() {
  const displayPhotos = {};
  for (const [id, p] of Object.entries(addPersonPhotos)) {
    displayPhotos[id] = { dataUrl: p.dataUrl, embedding: p.embedding };
  }

  renderPhotoGrid(
    'add-photo-grid',
    displayPhotos,
    (photoId) => promptDeletePhoto(photoId, 'add'),
    () => triggerPhotoUpload('add')
  );

  const conf = calculateConfidence(displayPhotos);
  const confColor = getConfidenceColor(conf);
  const photoCount = Object.keys(addPersonPhotos).length;
  const rec = getRecommendation(conf, photoCount);

  document.getElementById('add-conf-fill').style.width = `${conf}%`;
  document.getElementById('add-conf-fill').style.background = confColor;
  document.getElementById('add-conf-pct').textContent = `${conf}%`;
  document.getElementById('add-conf-rec').textContent = rec.text;

  const nameVal = document.getElementById('add-name').value.trim();
  document.getElementById('btn-save-add').disabled = photoCount === 0 || !nameVal;
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

function cropFaceToCanvas(img, box, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const padding = 0.3;
  const padX = box.width * padding;
  const padY = box.height * padding;
  const sx = Math.max(0, box.x - padX);
  const sy = Math.max(0, box.y - padY);
  const sw = Math.min(img.naturalWidth - sx, box.width + padX * 2);
  const sh = Math.min(img.naturalHeight - sy, box.height + padY * 2);

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
  return canvas;
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(buffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function handleChangePin() {
  const errorEl = document.getElementById('pin-change-error');
  errorEl.textContent = '';

  const current = document.getElementById('pin-current').value;
  const newPin = document.getElementById('pin-new').value;
  const confirm = document.getElementById('pin-confirm').value;

  if (!current || !newPin || !confirm) {
    errorEl.textContent = 'All fields are required';
    return;
  }

  if (newPin.length < 4) {
    errorEl.textContent = 'PIN must be 4 digits';
    return;
  }

  if (newPin !== confirm) {
    errorEl.textContent = 'New PINs do not match';
    return;
  }

  try {
    const currentHash = await hashPin(current);
    const storedHash = await getPinHash();

    if (currentHash !== storedHash) {
      errorEl.textContent = 'Current PIN is incorrect';
      return;
    }

    const newHash = await hashPin(newPin);
    await setPinHash(newHash);

    showToast('PIN changed successfully!');
    navigateToList();
  } catch (err) {
    errorEl.textContent = 'Error: ' + err.message;
  }
}

function setupEventListeners() {
  document.getElementById('search-input').addEventListener('input', (e) => {
    searchTerm = e.target.value.trim();
    renderPersonList(personsDb, searchTerm, riskFilter, navigateToEdit);
  });

  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      riskFilter = btn.dataset.filter;
      renderPersonList(personsDb, searchTerm, riskFilter, navigateToEdit);
    });
  });

  document.getElementById('btn-add-person').addEventListener('click', () => navigateToAdd());
  document.getElementById('btn-change-pin').addEventListener('click', () => navigateToChangePin());

  document.getElementById('btn-edit-back').addEventListener('click', () => navigateToList());
  document.getElementById('btn-save-edit').addEventListener('click', () => handleSaveEdit());
  document.getElementById('btn-delete-person').addEventListener('click', () => {
    const person = personsDb[currentPersonId];
    showDeleteModal(person ? person.name : 'this person');
  });

  document.getElementById('btn-delete-confirm').addEventListener('click', () => handleDeletePerson());
  document.getElementById('btn-delete-cancel').addEventListener('click', () => hideDeleteModal());

  document.getElementById('btn-photo-delete-confirm').addEventListener('click', () => handleDeletePhoto());
  document.getElementById('btn-photo-delete-cancel').addEventListener('click', () => hideDeletePhotoModal());

  document.getElementById('btn-add-back').addEventListener('click', () => navigateToList());
  document.getElementById('btn-save-add').addEventListener('click', () => handleSaveAdd());

  document.getElementById('add-name').addEventListener('input', () => {
    const nameVal = document.getElementById('add-name').value.trim();
    const photoCount = Object.keys(addPersonPhotos).length;
    document.getElementById('btn-save-add').disabled = photoCount === 0 || !nameVal;
  });

  document.getElementById('btn-pin-back').addEventListener('click', () => navigateToList());
  document.getElementById('btn-change-pin-submit').addEventListener('click', () => handleChangePin());

  document.getElementById('photo-file-input').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    const context = e.target.dataset.context || 'edit';
    showToast(`Processing ${files.length} photo(s)...`);
    for (let i = 0; i < files.length; i++) {
      showToast(`Processing photo ${i + 1} of ${files.length}...`);
      await handlePhotoFile(files[i], context);
    }
    showToast(`Done — ${files.length} photo(s) processed`);
  });

  document.querySelectorAll('#view-edit .risk-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#view-edit .risk-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  document.querySelectorAll('#add-risk-selector .risk-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#add-risk-selector .risk-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  const deleteModal = document.getElementById('delete-modal');
  deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) hideDeleteModal();
  });

  const photoModal = document.getElementById('delete-photo-modal');
  photoModal.addEventListener('click', (e) => {
    if (e.target === photoModal) hideDeletePhotoModal();
  });
}

init();
