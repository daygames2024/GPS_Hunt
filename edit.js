/* ── GPS Hunt — Creator Edit Logic ────────────────────────────────── */
/* Loaded only from edit.html — no admin or manage access              */

const Edit = (() => {
  const el  = id => document.getElementById(id);
  const PIN_SESSION_PREFIX = 'gps_hunt_edit_'; // + gameId

  let locations = [];
  let gameRecord = null; // full Firebase game object
  let gameId     = null;

  /* ── Helpers ────────────────────────────────────────────────────── */
  function escHtml(str) {
	return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function pinSessionKey() { return PIN_SESSION_PREFIX + gameId; }

  function isAuthed() {
	return sessionStorage.getItem(pinSessionKey()) === 'yes';
  }

  /* ── Screens ─────────────────────────────────────────────────────── */
  function showPin() {
	el('screen-pin').style.display = 'flex';
	el('screen-edit').style.display = 'none';
  }

  function showEdit() {
	el('screen-pin').style.display = 'none';
	el('screen-edit').style.display = 'block';
  }

  /* ── Load game from Firebase then branch on auth ─────────────────── */
  function loadGame() {
	const params = new URLSearchParams(location.search);
	gameId = params.get('game');

	if (!gameId) {
	  el('pin-error').textContent = 'No game ID in the URL. Please use the link you were given.';
	  return;
	}

	const ready = FirebaseDB.initFromConfig();
	if (!ready) {
	  el('pin-error').textContent = 'Firebase not configured. Contact your Hunt Master.';
	  return;
	}

	FirebaseDB.getGame(gameId).then(record => {
	  if (!record) {
		el('pin-error').textContent = 'Game not found. The link may be incorrect.';
		return;
	  }
	  gameRecord = record;

	  // Show game title on the PIN screen
	  const titleEl = el('pin-game-title');
	  if (titleEl) titleEl.textContent = record.gameTitle || 'GPS Hunt';

	  if (!record.creatorPinHash) {
		el('pin-error').textContent = 'This game has no Creator PIN set. Ask your Hunt Master to set one via the admin page.';
		return;
	  }

	  if (isAuthed()) {
		populateEditor();
		showEdit();
	  } else {
		showPin();
		setTimeout(() => el('pin-input')?.focus(), 100);
	  }
	}).catch(err => {
	  el('pin-error').textContent = 'Could not load game: ' + err.message;
	});
  }

  /* ── Verify PIN ──────────────────────────────────────────────────── */
  function attemptPin() {
	const pin     = el('pin-input')?.value.trim();
	const errorEl = el('pin-error');
	if (!pin) { errorEl.textContent = 'Please enter your PIN.'; return; }

	FirebaseDB.sha256(pin).then(hash => {
	  if (hash === gameRecord.creatorPinHash) {
		sessionStorage.setItem(pinSessionKey(), 'yes');
		errorEl.textContent = '';
		populateEditor();
		showEdit();
	  } else {
		errorEl.textContent = '❌ Incorrect PIN — try again';
		el('pin-input').value = '';
		el('pin-input').focus();
	  }
	});
  }

  function logout() {
	sessionStorage.removeItem(pinSessionKey());
	el('pin-input').value = '';
	el('pin-error').textContent = '';
	showPin();
	setTimeout(() => el('pin-input')?.focus(), 100);
  }

  /* ── Populate editor from game record ────────────────────────────── */
  function populateEditor() {
	try {
	  const payload = JSON.parse(atob(gameRecord.encodedPayload));
	  locations = Array.isArray(payload.locations) ? payload.locations : [];
	} catch (e) {
	  locations = [];
	}
	const titleEl = el('edit-game-title-display');
	if (titleEl) titleEl.textContent = gameRecord.gameTitle || 'Game';
	renderList();
  }

  /* ── Render location list ─────────────────────────────────────────── */
  function renderList() {
	const list = el('edit-location-list');
	if (!list) return;
	if (locations.length === 0) {
	  list.innerHTML = '<p style="color:var(--muted);text-align:center">No locations yet. Add one below.</p>';
	  return;
	}
	list.innerHTML = locations.map((loc, i) => `
	  <div class="loc-item">
		<div class="loc-item-info">
		  <strong>${i + 1}. ${escHtml(loc.name || 'Unnamed')}</strong>
		  <small>${loc.lat}, ${loc.lng}</small><br>
		  <small style="font-style:italic">${escHtml(loc.clue || 'No clue')}</small>
		</div>
		<div class="loc-item-actions">
		  <button class="btn-secondary" onclick="Edit.move(${i}, -1)" ${i === 0 ? 'disabled' : ''}>↑</button>
		  <button class="btn-secondary" onclick="Edit.move(${i},  1)" ${i === locations.length - 1 ? 'disabled' : ''}>↓</button>
		  <button class="btn-danger"    onclick="Edit.remove(${i})">✕</button>
		</div>
	  </div>
	`).join('');
  }

  /* ── Add location ────────────────────────────────────────────────── */
  function addLocation() {
	const name = el('edit-inp-name').value.trim();
	const lat  = parseFloat(el('edit-inp-lat').value);
	const lng  = parseFloat(el('edit-inp-lng').value);
	const clue = el('edit-inp-clue').value.trim();

	if (!name)                    { alert('Please enter a location name.'); return; }
	if (isNaN(lat) || isNaN(lng)) { alert('Please enter valid coordinates.'); return; }
	if (lat < -90  || lat > 90)   { alert('Latitude must be between -90 and 90.'); return; }
	if (lng < -180 || lng > 180)  { alert('Longitude must be between -180 and 180.'); return; }

	locations.push({ name, lat, lng, clue });
	renderList();
	['edit-inp-name', 'edit-inp-lat', 'edit-inp-lng', 'edit-inp-clue'].forEach(id => { el(id).value = ''; });
	el('edit-inp-name').focus();
  }

  function move(i, dir) {
	const j = i + dir;
	if (j < 0 || j >= locations.length) return;
	[locations[i], locations[j]] = [locations[j], locations[i]];
	renderList();
  }

  function remove(i) {
	if (!confirm(`Remove "${locations[i].name}"?`)) return;
	locations.splice(i, 1);
	renderList();
  }

  /* ── GPS ─────────────────────────────────────────────────────────── */
  function useMyLocation() {
	if (!navigator.geolocation) { alert('Geolocation not available.'); return; }
	el('edit-gps-btn').textContent = '📡 Getting…';
	navigator.geolocation.getCurrentPosition(pos => {
	  el('edit-inp-lat').value = pos.coords.latitude.toFixed(7);
	  el('edit-inp-lng').value = pos.coords.longitude.toFixed(7);
	  el('edit-gps-btn').textContent = '📡 Use My GPS';
	}, err => {
	  el('edit-gps-btn').textContent = '📡 Use My GPS';
	  alert('Could not get location: ' + err.message);
	}, { enableHighAccuracy: true, timeout: 10000 });
  }

  /* ── Import CSV / JSON ───────────────────────────────────────────── */
  function importFile(file) {
	if (!file) return;
	const reader = new FileReader();
	reader.onload = e => {
	  const text = e.target.result.trim();
	  let imported = [];
	  try {
		if (file.name.toLowerCase().endsWith('.json') || text.startsWith('[') || text.startsWith('{')) {
		  const parsed = JSON.parse(text);
		  imported = (Array.isArray(parsed) ? parsed : [parsed]).map(row => ({
			name: String(row.name || row.Name || row.title || '').trim(),
			lat : parseFloat(row.lat  || row.Lat  || row.latitude  || 0),
			lng : parseFloat(row.lng  || row.Lng  || row.longitude || row.lon || 0),
			clue: String(row.clue || row.Clue || row.hint || '').trim(),
		  }));
		} else {
		  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
		  const firstLow = lines[0].toLowerCase();
		  const hasHeader = firstLow.includes('name') || firstLow.includes('lat') || firstLow.includes('lng');
		  const dataLines = hasHeader ? lines.slice(1) : lines;
		  imported = dataLines.map(line => {
			const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
			return { name: cols[0] || '', lat: parseFloat(cols[1]), lng: parseFloat(cols[2]), clue: cols[3] || '' };
		  });
		}
		const valid = imported.filter(r =>
		  r.name && !isNaN(r.lat) && !isNaN(r.lng) &&
		  r.lat >= -90 && r.lat <= 90 && r.lng >= -180 && r.lng <= 180
		);
		if (valid.length === 0) { alert('No valid locations found.\n\nCSV: name, lat, lng, clue\nJSON: [{name, lat, lng, clue}, …]'); return; }
		const skipped = imported.length - valid.length;
		if (!confirm(`Import ${valid.length} location${valid.length !== 1 ? 's' : ''}${skipped ? ` (${skipped} skipped)` : ''}?`)) return;
		locations = [...locations, ...valid];
		renderList();
	  } catch (err) {
		alert('Could not parse file: ' + err.message);
	  }
	};
	reader.readAsText(file);
  }

  /* ── Build updated encoded payload ──────────────────────────────── */
  function buildPayload() {
	const existing = JSON.parse(atob(gameRecord.encodedPayload));
	return btoa(JSON.stringify({ ...existing, locations }));
  }

  /* ── Save as draft ───────────────────────────────────────────────── */
  function saveDraft() {
	if (locations.length === 0 && !confirm('No locations added yet — save anyway?')) return;
	const encoded = buildPayload();
	const btn     = el('edit-draft-btn');
	btn.disabled  = true;
	btn.textContent = 'Saving…';
	FirebaseDB.saveGameDraft({
	  gameId,
	  gameTitle     : gameRecord.gameTitle,
	  locationCount : locations.length,
	  creatorName   : gameRecord.creatorName,
	  encodedPayload: encoded,
	  joinCode      : gameRecord.joinCode,
	  // creatorPinHash preserved automatically in saveGameDraft via existing record
	}).then(() => {
	  gameRecord = { ...gameRecord, encodedPayload: encoded, locationCount: locations.length };
	  btn.disabled    = false;
	  btn.textContent = '✅ Saved!';
	  setTimeout(() => { btn.textContent = '💾 Save Changes'; }, 2500);
	}).catch(err => {
	  btn.disabled    = false;
	  btn.textContent = '💾 Save Changes';
	  alert('Could not save: ' + err.message);
	});
  }

  /* ── Save & Publish ──────────────────────────────────────────────── */
  function saveAndPublish() {
	if (locations.length === 0) { alert('Add at least one location before publishing.'); return; }
	const encoded = buildPayload();
	const btn     = el('edit-publish-btn');
	btn.disabled  = true;
	btn.textContent = 'Publishing…';
	FirebaseDB.publishGame(gameId, encoded, locations.length).then(() => {
	  gameRecord = { ...gameRecord, encodedPayload: encoded, locationCount: locations.length, status: 'live' };
	  btn.disabled    = false;
	  btn.textContent = '✅ Published!';
	  setTimeout(() => { btn.textContent = '🚀 Save & Publish'; }, 2500);
	}).catch(err => {
	  btn.disabled    = false;
	  btn.textContent = '🚀 Save & Publish';
	  alert('Could not publish: ' + err.message);
	});
  }

  /* ── Boot ────────────────────────────────────────────────────────── */
  function init() {
	el('pin-form')?.addEventListener('submit', e => { e.preventDefault(); attemptPin(); });
	el('pin-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') attemptPin(); });
	el('edit-logout-btn')?.addEventListener('click', logout);
	el('edit-add-btn')?.addEventListener('click', addLocation);
	el('edit-gps-btn')?.addEventListener('click', useMyLocation);
	el('edit-draft-btn')?.addEventListener('click', saveDraft);
	el('edit-publish-btn')?.addEventListener('click', saveAndPublish);

	const importInput = el('edit-import-input');
	if (importInput) importInput.addEventListener('change', e => { importFile(e.target.files[0]); importInput.value = ''; });
	el('edit-import-btn')?.addEventListener('click', () => el('edit-import-input')?.click());

	el('edit-inp-lat')?.addEventListener('keydown', e => { if (e.key === 'Enter') el('edit-inp-lng').focus(); });
	el('edit-inp-lng')?.addEventListener('keydown', e => { if (e.key === 'Enter') el('edit-inp-clue').focus(); });

	loadGame();
  }

  return { init, move, remove };
})();

document.addEventListener('DOMContentLoaded', Edit.init);
