import { getConfidenceColor, getRecommendation } from './confidence.js';

const RISK_LABELS = { red: 'RISK', green: 'LOW', neutral: 'NEUTRAL' };

const VIEWS = ['view-list', 'view-edit', 'view-add', 'view-pin'];

export function showView(viewId) {
  for (const id of VIEWS) {
    document.getElementById(id).style.display = id === viewId ? '' : 'none';
  }
  window.scrollTo(0, 0);
}

export function showLoading(message) {
  const el = document.getElementById('loading-screen');
  el.style.display = 'flex';
  el.querySelector('.loading-status').textContent = message;
}

export function hideLoading() {
  document.getElementById('loading-screen').style.display = 'none';
}

export function updateSyncStatus(status) {
  const dot = document.getElementById('admin-sync-dot');
  dot.classList.remove('syncing', 'offline');
  if (status === 'syncing') dot.classList.add('syncing');
  else if (status === 'offline') dot.classList.add('offline');
}

export function updatePersonCount(count) {
  document.getElementById('admin-person-count').textContent = `${count} persons`;
}

export function formatRelativeTime(timestamp) {
  if (!timestamp) return 'Never';
  const now = Date.now();
  const delta = now - timestamp;
  const seconds = Math.floor(delta / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  const d = new Date(timestamp);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function renderPersonList(persons, searchTerm, riskFilter, onRowClick) {
  const container = document.getElementById('person-list');
  while (container.firstChild) container.removeChild(container.firstChild);

  let entries = Object.entries(persons || {});

  if (searchTerm) {
    const lower = searchTerm.toLowerCase();
    entries = entries.filter(([, p]) => p.name && p.name.toLowerCase().includes(lower));
  }

  if (riskFilter && riskFilter !== 'all') {
    entries = entries.filter(([, p]) => p.risk === riskFilter);
  }

  entries.sort((a, b) => (a[1].name || '').localeCompare(b[1].name || ''));

  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-list';
    empty.textContent = searchTerm || riskFilter !== 'all' ? 'No persons match your filters' : 'No persons yet. Add one!';
    container.appendChild(empty);
    return;
  }

  for (const [personId, person] of entries) {
    const row = document.createElement('div');
    row.className = 'person-row';
    row.dataset.risk = person.risk || 'neutral';
    row.addEventListener('click', () => onRowClick(personId));

    const photos = person.photos ? Object.values(person.photos) : [];
    const firstPhoto = photos.length > 0 ? photos[0] : null;

    if (firstPhoto && firstPhoto.dataUrl) {
      const img = document.createElement('img');
      img.className = 'person-avatar';
      img.src = firstPhoto.dataUrl;
      img.alt = person.name || '';
      row.appendChild(img);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'person-avatar';
      row.appendChild(placeholder);
    }

    const info = document.createElement('div');
    info.className = 'person-info';

    const nameLine = document.createElement('div');
    nameLine.className = 'person-name-line';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'person-name';
    nameSpan.textContent = person.name || 'Unnamed';
    nameLine.appendChild(nameSpan);

    const badge = document.createElement('span');
    badge.className = `badge-${person.risk || 'neutral'}`;
    badge.textContent = RISK_LABELS[person.risk] || 'NEUTRAL';
    nameLine.appendChild(badge);

    info.appendChild(nameLine);

    const meta = document.createElement('div');
    meta.className = 'person-meta';
    const photoCount = person.photoCount || 0;
    const lastSeen = formatRelativeTime(person.lastSeen);
    meta.textContent = `${photoCount} photos · Last seen ${lastSeen}`;
    info.appendChild(meta);

    row.appendChild(info);

    const confDiv = document.createElement('div');
    confDiv.className = 'person-conf';

    const confBar = document.createElement('div');
    confBar.className = 'person-conf-bar';
    const confFill = document.createElement('div');
    confFill.className = 'person-conf-bar-fill';
    const conf = person.confidence || 0;
    confFill.style.width = `${conf}%`;
    confFill.style.background = getConfidenceColor(conf);
    confBar.appendChild(confFill);
    confDiv.appendChild(confBar);

    const confPct = document.createElement('div');
    confPct.className = 'person-conf-pct';
    confPct.textContent = `${conf}%`;
    confDiv.appendChild(confPct);

    row.appendChild(confDiv);
    container.appendChild(row);
  }
}

export function renderEditView(personId, person) {
  document.getElementById('edit-title').textContent = person.name || 'Edit Person';

  const badge = document.getElementById('edit-badge');
  badge.className = `badge-${person.risk || 'neutral'}`;
  badge.textContent = RISK_LABELS[person.risk] || 'NEUTRAL';

  document.getElementById('edit-name').value = person.name || '';
  document.getElementById('edit-notes').value = person.notes || '';

  const riskBtns = document.querySelectorAll('#view-edit .risk-btn');
  riskBtns.forEach((btn) => {
    btn.classList.remove('selected');
    if (btn.dataset.risk === (person.risk || 'neutral')) {
      btn.classList.add('selected');
    }
  });

  const conf = person.confidence || 0;
  const confColor = getConfidenceColor(conf);
  const photoCount = person.photos ? Object.keys(person.photos).length : 0;
  const rec = getRecommendation(conf, photoCount);

  document.getElementById('edit-conf-fill').style.width = `${conf}%`;
  document.getElementById('edit-conf-fill').style.background = confColor;
  document.getElementById('edit-conf-pct').textContent = `${conf}%`;
  document.getElementById('edit-conf-rec').textContent = rec.text;

  const metaEl = document.getElementById('edit-metadata');
  metaEl.textContent = '';
  const lines = [
    `Created: ${formatRelativeTime(person.createdAt)}`,
    `Updated: ${formatRelativeTime(person.updatedAt)}`,
    `Last seen: ${formatRelativeTime(person.lastSeen)}`
  ];
  metaEl.textContent = lines.join('\n');
  metaEl.style.whiteSpace = 'pre-line';
}

export function renderPhotoGrid(containerId, photos, onDelete, onAdd) {
  const container = document.getElementById(containerId);
  while (container.firstChild) container.removeChild(container.firstChild);

  const photoEntries = photos ? Object.entries(photos) : [];

  const countId = containerId === 'edit-photo-grid' ? 'edit-photo-count' : 'add-photo-count';
  document.getElementById(countId).textContent = photoEntries.length;

  for (const [photoId, photo] of photoEntries) {
    const thumb = document.createElement('div');
    thumb.className = 'photo-thumb';

    if (photo.dataUrl) {
      const img = document.createElement('img');
      img.src = photo.dataUrl;
      img.alt = 'Face photo';
      thumb.appendChild(img);
    }

    if (onDelete) {
      const delBtn = document.createElement('button');
      delBtn.className = 'photo-delete-btn';
      delBtn.type = 'button';
      delBtn.textContent = '×';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onDelete(photoId);
      });
      thumb.appendChild(delBtn);
    }

    container.appendChild(thumb);
  }

  const addBtn = document.createElement('button');
  addBtn.className = 'photo-add-btn';
  addBtn.type = 'button';
  addBtn.textContent = '+';
  addBtn.addEventListener('click', () => onAdd());
  container.appendChild(addBtn);
}

export function renderAddView() {
  document.getElementById('add-name').value = '';
  document.getElementById('add-notes').value = '';
  document.getElementById('btn-save-add').disabled = true;

  const riskBtns = document.querySelectorAll('#add-risk-selector .risk-btn');
  riskBtns.forEach((btn) => {
    btn.classList.remove('selected');
    if (btn.dataset.risk === 'neutral') btn.classList.add('selected');
  });

  document.getElementById('add-conf-fill').style.width = '0%';
  document.getElementById('add-conf-pct').textContent = '0%';
  document.getElementById('add-conf-rec').textContent = 'Upload a photo to start';

  renderPhotoGrid('add-photo-grid', {}, null, () => {
    document.getElementById('photo-file-input').click();
  });
}

export function showDeleteModal(personName) {
  document.getElementById('delete-modal-title').textContent = `Delete ${personName}?`;
  document.getElementById('delete-modal').classList.add('active');
}

export function hideDeleteModal() {
  document.getElementById('delete-modal').classList.remove('active');
}

export function showDeletePhotoModal() {
  document.getElementById('delete-photo-modal').classList.add('active');
}

export function hideDeletePhotoModal() {
  document.getElementById('delete-photo-modal').classList.remove('active');
}

export function showToast(message, duration = 3000) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), duration);
}
