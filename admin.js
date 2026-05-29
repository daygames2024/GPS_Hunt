/* ── GPS Hunt — Admin / Hunt Master Logic ─────────────────────────── */

const Admin = (() => {
  let locations  = []; // [{name, lat, lng, clue}]
  let gameId     = null; // generated once per session
  let joinCode   = null; // short code players need to enter in the lobby
  let isDraft    = false; // true when editing an existing draft
  let draftTitle = null;  // pre-filled title when resuming a draft

  const el = id => document.getElementById(id);
  const SESSION_KEY = 'gps_hunt_manage_auth'; // shared with manage.js

  /* ── Password gate ──────────────────────────────────────────────── */
  function isAuthed() {
    return sessionStorage.getItem(SESSION_KEY) === 'yes';
  }

  function showLogin() {
    el('screen-login').style.display = 'flex';
    el('screen-admin').style.display = 'none';
  }

  function showAdmin() {
    el('screen-login').style.display = 'none';
    el('screen-admin').style.display = 'block';
  }

  function attemptLogin() {
    const pw      = el('admin-pw-input')?.value || '';
    const correct = (typeof GPS_HUNT_CONFIG !== 'undefined' && GPS_HUNT_CONFIG.managePassword) || '';
    const errorEl = el('admin-pw-error');
    if (pw === correct) {
      sessionStorage.setItem(SESSION_KEY, 'yes');
      errorEl.textContent = '';
      showAdmin();
      wireAdminListeners();
      loadDraftFromUrl();
      renderList();
    } else {
      errorEl.textContent = '❌ Incorrect password';
      el('admin-pw-input').value = '';
      el('admin-pw-input').focus();
    }
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    showLogin();
  }

  /* ── Render location list ─────────────────────────────────────────── */
  function renderList() {
	const list = el('location-list');
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
		  <button class="btn-secondary" onclick="Admin.move(${i}, -1)" ${i===0?'disabled':''}>↑</button>
		  <button class="btn-secondary" onclick="Admin.move(${i},  1)" ${i===locations.length-1?'disabled':''}>↓</button>
		  <button class="btn-danger"    onclick="Admin.remove(${i})">✕</button>
		</div>
	  </div>
	`).join('');
  }

  /* ── Add location from form ───────────────────────────────────────── */
  function addLocation() {
	const name = el('inp-name').value.trim();
	const lat  = parseFloat(el('inp-lat').value);
	const lng  = parseFloat(el('inp-lng').value);
	const clue = el('inp-clue').value.trim();

	if (!name)                    { alert('Please enter a location name.'); return; }
	if (isNaN(lat) || isNaN(lng)) { alert('Please enter valid coordinates.'); return; }
	if (lat < -90  || lat > 90)   { alert('Latitude must be between -90 and 90.'); return; }
	if (lng < -180 || lng > 180)  { alert('Longitude must be between -180 and 180.'); return; }

	locations.push({ name, lat, lng, clue });
	renderList();
	clearForm();
	hideOutput();
  }

  function clearForm() {
	['inp-name', 'inp-lat', 'inp-lng', 'inp-clue'].forEach(id => { el(id).value = ''; });
	el('inp-name').focus();
  }

  /* ── Move / remove ────────────────────────────────────────────────── */
  function move(i, dir) {
	const j = i + dir;
	if (j < 0 || j >= locations.length) return;
	[locations[i], locations[j]] = [locations[j], locations[i]];
	renderList();
	hideOutput();
  }

  function remove(i) {
	if (!confirm(`Remove "${locations[i].name}"?`)) return;
	locations.splice(i, 1);
	renderList();
	hideOutput();
  }

  /* ── Use device GPS for coordinates ──────────────────────────────── */
  function useMyLocation() {
	if (!navigator.geolocation) { alert('Geolocation not available.'); return; }
	el('gps-btn').textContent = '📡 Getting…';
	navigator.geolocation.getCurrentPosition(pos => {
	  el('inp-lat').value = pos.coords.latitude.toFixed(7);
	  el('inp-lng').value = pos.coords.longitude.toFixed(7);
	  el('gps-btn').textContent = '📡 Use My GPS';
	}, err => {
	  el('gps-btn').textContent = '📡 Use My GPS';
	  alert('Could not get location: ' + err.message);
	}, { enableHighAccuracy: true, timeout: 10000 });
  }

  /* ── Read Firebase config from form (falls back to config.js) ───── */
  function getFirebaseConfig() {
	const apiKey      = el('fb-api-key')?.value.trim()      || GPS_HUNT_CONFIG?.firebase?.apiKey;
	const authDomain  = el('fb-auth-domain')?.value.trim()  || GPS_HUNT_CONFIG?.firebase?.authDomain;
	const databaseURL = el('fb-db-url')?.value.trim()       || GPS_HUNT_CONFIG?.firebase?.databaseURL;
	const projectId   = el('fb-project-id')?.value.trim()   || GPS_HUNT_CONFIG?.firebase?.projectId;
	if (!apiKey || !databaseURL || apiKey === 'YOUR_API_KEY') return null;
	return { apiKey, authDomain, databaseURL, projectId };
  }

  /* ── Generate game URL + QR ───────────────────────────────────────── */
  function generate() {
	if (locations.length === 0) { alert('Add at least one location first.'); return; }

	// One stable gameId per admin session
	if (!gameId) gameId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

	// One stable join code per admin session
	if (!joinCode) joinCode = Array.from({ length: 5 }, () =>
	  'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]
	).join('');

	const firebaseConfig = getFirebaseConfig();
	const gameTitle      = el('inp-game-title')?.value.trim() || 'GPS Hunt';
	const base           = location.href.replace(/admin\.html.*$/, '');

	// ── Team (player) URL ──────────────────────────────────────────
	const payload = { locations, gameId, gameTitle, joinCode, ...(firebaseConfig ? { firebase: firebaseConfig } : {}) };
	const encoded = btoa(JSON.stringify(payload));
	const gameUrl = `${base}index.html#${encoded}`;

	el('game-url').value = gameUrl;
	el('qr-img').src     = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(gameUrl)}`;
	el('qr-img').alt     = 'QR code for team game link';

	// ── Leaderboard URL (only if Firebase configured) ──────────────
	const lbSection = el('lb-section');
	if (lbSection) {
	  if (firebaseConfig) {
		const lbPayload = btoa(JSON.stringify({ firebase: firebaseConfig, gameId, gameTitle }));
		const lbUrl     = `${base}leaderboard.html?game=${lbPayload}`;
		el('lb-url').value  = lbUrl;
		el('lb-qr-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(lbUrl)}`;
		lbSection.classList.remove('hidden');
	  } else {
		lbSection.classList.add('hidden');
	  }
	}

	el('output-box').classList.add('visible');
	el('output-box').scrollIntoView({ behavior: 'smooth' });

	// ── Register game in Firebase lobby ────────────────────────────
	if (firebaseConfig && typeof FirebaseDB !== 'undefined') {
	  FirebaseDB.init(firebaseConfig, gameId);
	  const pin          = el('inp-creator-pin')?.value.trim();
	  const creatorName  = el('inp-creator-name')?.value.trim() || 'Hunt Master';
	  const doRegister   = (pinHash) => {
		if (isDraft) {
		  FirebaseDB.publishGame(gameId, encoded, locations.length, pinHash || undefined).then(() => {
			FirebaseDB.updateGame({ gameId, gameTitle, locationCount: locations.length, creatorName, encodedPayload: encoded });
			isDraft = false;
		  });
		} else {
		  FirebaseDB.registerGame({ gameId, gameTitle, locationCount: locations.length, creatorName, encodedPayload: encoded, joinCode, status: 'live', creatorPinHash: pinHash || null });
		}
		if (pinHash) showCreatorLink(base, gameId);
	  };
	  if (pin) { FirebaseDB.sha256(pin).then(doRegister); } else { doRegister(null); }
	}

	// ── Show join code in output ────────────────────────────────────
	const codeEl = el('join-code-display');
	if (codeEl) codeEl.textContent = joinCode;
	const codeBox = el('join-code-box');
	if (codeBox) codeBox.style.display = 'flex';
  }

  /* ── Copy helpers ─────────────────────────────────────────────────── */
  function copyUrl() {
	const val = el('game-url').value;
	if (!val) return;
	navigator.clipboard.writeText(val).then(() => {
	  const btn = el('copy-btn');
	  btn.textContent = '✅ Copied!';
	  setTimeout(() => { btn.textContent = '📋 Copy Link'; }, 2000);
	});
  }

  function hideOutput() {
	el('output-box').classList.remove('visible');
  }

  /* ── Show the creator-only edit link in the output box ───────────── */
  function showCreatorLink(base, gId) {
	const editUrl  = `${base}edit.html?game=${encodeURIComponent(gId)}`;
	const urlInput = el('creator-edit-url');
	const linkBox  = el('creator-link-box');
	if (urlInput) urlInput.value = editUrl;
	if (linkBox)  linkBox.style.display = 'flex';
  }

  /* ── Helpers ──────────────────────────────────────────────────────── */
  function escHtml(str) {
	return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── Import locations from CSV or JSON file ──────────────────────── */
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
          // CSV — first row may be a header
          const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
          const firstLow = lines[0].toLowerCase();
          const hasHeader = firstLow.includes('name') || firstLow.includes('lat') || firstLow.includes('lng');
          const dataLines = hasHeader ? lines.slice(1) : lines;
          imported = dataLines.map(line => {
            const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
            return {
              name: cols[0] || '',
              lat : parseFloat(cols[1]),
              lng : parseFloat(cols[2]),
              clue: cols[3] || '',
            };
          });
        }
        const valid = imported.filter(r =>
          r.name && !isNaN(r.lat) && !isNaN(r.lng) &&
          r.lat >= -90 && r.lat <= 90 && r.lng >= -180 && r.lng <= 180
        );
        if (valid.length === 0) { alert('No valid locations found in the file.\n\nCSV format: name, lat, lng, clue\nJSON format: [{name, lat, lng, clue}, …]'); return; }
        const skipped = imported.length - valid.length;
        const msg = `Import ${valid.length} location${valid.length !== 1 ? 's' : ''}${skipped ? ` (${skipped} skipped — invalid coords)` : ''}?`;
        if (!confirm(msg)) return;
        locations = [...locations, ...valid];
        renderList();
        hideOutput();
      } catch (err) {
        alert('Could not parse file: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  /* ── Save current state as a draft in Firebase ───────────────────── */
  function saveAsDraft() {
    const firebaseConfig = getFirebaseConfig();
    if (!firebaseConfig) {
      alert('Firebase is not configured in config.js.\nCannot save draft without a Firebase connection.');
      return;
    }
    if (!gameId) gameId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    if (!joinCode) joinCode = Array.from({ length: 5 }, () =>
      'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]
    ).join('');

    const gameTitle   = el('inp-game-title')?.value.trim() || 'GPS Hunt';
    const creatorName = el('inp-creator-name')?.value.trim() || 'Hunt Master';
    const pin         = el('inp-creator-pin')?.value.trim();
    const base        = location.href.replace(/admin\.html.*$/, '');
    const payload     = { locations, gameId, gameTitle, joinCode, firebase: firebaseConfig };
    const encoded     = btoa(JSON.stringify(payload));

    FirebaseDB.init(firebaseConfig, gameId);

    const doSave = (pinHash) => {
      FirebaseDB.saveGameDraft({
        gameId,
        gameTitle,
        locationCount : locations.length,
        creatorName,
        encodedPayload: encoded,
        joinCode,
        creatorPinHash: pinHash,
      }).then(() => {
        isDraft = true;
        const btn = el('draft-btn');
        if (btn) { btn.textContent = '✅ Draft Saved!'; setTimeout(() => { btn.textContent = '💾 Save as Draft'; }, 2500); }
        if (pinHash) showCreatorLink(base, gameId);
      }).catch(err => alert('Could not save draft: ' + err.message));
    };

    if (pin) {
      FirebaseDB.sha256(pin).then(doSave);
    } else {
      doSave(null);
    }
  }

  /* ── Load a draft for editing (called from manage.html link) ─────── */
  function loadDraftFromUrl() {
    const params = new URLSearchParams(location.search);
    const enc    = params.get('edit');
    if (!enc) return;
    try {
      const data = JSON.parse(atob(enc));
      if (Array.isArray(data.locations)) locations = data.locations;
      if (data.gameId)   gameId   = data.gameId;
      if (data.joinCode) joinCode = data.joinCode;
      isDraft    = true;
      draftTitle = data.gameTitle || null;
      if (draftTitle && el('inp-game-title')) el('inp-game-title').value = draftTitle;
      if (data.creatorName && el('inp-creator-name')) el('inp-creator-name').value = data.creatorName;
      renderList();
      const banner = el('draft-edit-banner');
      if (banner) banner.style.display = 'flex';
    } catch (e) {
      console.warn('Could not load draft from URL', e);
    }
  }

  /* ── Init ─────────────────────────────────────────────────────────── */
  function init() {
	// Password gate
	el('admin-pw-form')?.addEventListener('submit', e => { e.preventDefault(); attemptLogin(); });
	el('admin-pw-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); });
	el('admin-logout-btn')?.addEventListener('click', logout);

	if (!isAuthed()) {
	  showLogin();
	  setTimeout(() => el('admin-pw-input')?.focus(), 100);
	  return;
	}
	showAdmin();
	wireAdminListeners();

	renderList();
	loadDraftFromUrl();
  }

  /* ── Wire all admin content listeners (called after auth) ─────────── */
  function wireAdminListeners() {
	el('add-btn')?.addEventListener('click', addLocation);
	el('gps-btn')?.addEventListener('click', useMyLocation);
	el('generate-btn')?.addEventListener('click', generate);
	el('copy-btn')?.addEventListener('click', copyUrl);
	el('draft-btn')?.addEventListener('click', saveAsDraft);

	// Import file input (hidden)
	const importInput = el('import-file-input');
	if (importInput) {
	  importInput.addEventListener('change', e => { importFile(e.target.files[0]); importInput.value = ''; });
	}
	el('import-btn')?.addEventListener('click', () => el('import-file-input')?.click());

	el('copy-lb-btn')?.addEventListener('click', () => {
	  const val = el('lb-url')?.value;
	  if (!val) return;
	  navigator.clipboard.writeText(val).then(() => {
		const btn = el('copy-lb-btn');
		btn.textContent = '✅ Copied!';
		setTimeout(() => { btn.textContent = '📋 Copy Leaderboard Link'; }, 2000);
	  });
	});

	el('copy-creator-btn')?.addEventListener('click', () => {
	  const val = el('creator-edit-url')?.value;
	  if (!val) return;
	  navigator.clipboard.writeText(val).then(() => {
		const btn = el('copy-creator-btn');
		btn.textContent = '✅ Copied!';
		setTimeout(() => { btn.textContent = '📋 Copy Creator Edit Link'; }, 2000);
	  });
	});

	// Allow Enter in lat/lng to advance to next field
	el('inp-lat')?.addEventListener('keydown', e => { if (e.key === 'Enter') el('inp-lng').focus(); });
	el('inp-lng')?.addEventListener('keydown', e => { if (e.key === 'Enter') el('inp-clue').focus(); });
  }

  return { init, move, remove };
})();

document.addEventListener('DOMContentLoaded', () => {}); // init called by admin.html loader
