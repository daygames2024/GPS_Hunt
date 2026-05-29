/* GPS Hunt - Creator Edit Logic */
/* Loaded only from edit.html - no admin or manage access */

const Edit = (() => {
  const el  = id => document.getElementById(id);
  const PIN_SESSION_PREFIX = 'gps_hunt_edit_';

  let locations  = [];
  let gameRecord = null;
  let gameId     = null;
  let isNewGame  = false;

  /* Helpers */
  function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function pinSessionKey() { return PIN_SESSION_PREFIX + gameId; }
  function isAuthed()      { return sessionStorage.getItem(pinSessionKey()) === 'yes'; }

  function randId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function randJoinCode() {
    return Array.from({ length: 5 }, () =>
      'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]
    ).join('');
  }

  /* Screen helpers */
  function showOnly(id) {
    ['screen-setup', 'screen-pin', 'screen-edit'].forEach(s => {
      const e = document.getElementById(s);
      if (e) e.style.display = (s === id) ? (s === 'screen-edit' ? 'block' : 'flex') : 'none';
    });
  }

  /* NEW GAME FLOW - no ?game= param */
  function startSetupScreen() {
    isNewGame = true;
    showOnly('screen-setup');
    setTimeout(() => el('setup-game-title')?.focus(), 100);
  }

  function handleSetup() {
    const errorEl   = el('setup-error');
    const title     = el('setup-game-title')?.value.trim();
    const creator   = el('setup-creator-name')?.value.trim();
    const pin       = el('setup-pin')?.value.trim();
    const pinRepeat = el('setup-pin-confirm')?.value.trim();

    if (!title)            { errorEl.textContent = 'Please enter a Hunt Name.'; return; }
    if (!creator)          { errorEl.textContent = 'Please enter your name.'; return; }
    if (!pin)              { errorEl.textContent = 'Please choose a PIN.'; return; }
    if (pin.length < 4)    { errorEl.textContent = 'PIN must be at least 4 digits.'; return; }
    if (pin !== pinRepeat) { errorEl.textContent = 'PINs do not match - please re-enter.'; return; }
    errorEl.textContent = '';

    const btn = el('setup-start-btn');
    btn.disabled    = true;
    btn.textContent = 'Setting up...';

    const ready = FirebaseDB.initFromConfig();
    if (!ready) {
      errorEl.textContent = 'Firebase not configured. Cannot save game. Contact your Hunt Master.';
      btn.disabled = false; btn.textContent = 'Next: Add Locations';
      return;
    }

    gameId = randId();
    const joinCode = randJoinCode();

    FirebaseDB.sha256(pin).then(pinHash => {
      const firebaseConfig = typeof GPS_HUNT_CONFIG !== 'undefined' ? GPS_HUNT_CONFIG.firebase : null;
      const payload = { locations: [], gameId, gameTitle: title, joinCode, ...(firebaseConfig ? { firebase: firebaseConfig } : {}) };
      const encoded = btoa(JSON.stringify(payload));

      gameRecord = {
        gameId,
        gameTitle    : title,
        creatorName  : creator,
        joinCode,
        locationCount: 0,
        encodedPayload: encoded,
        status       : 'draft',
        creatorPinHash: pinHash,
      };

      return FirebaseDB.saveGameDraft({
        gameId,
        gameTitle    : title,
        locationCount: 0,
        creatorName  : creator,
        encodedPayload: encoded,
        joinCode,
        creatorPinHash: pinHash,
      });
    }).then(() => {
      sessionStorage.setItem(pinSessionKey(), 'yes');
      populateEditor();
      showOnly('screen-edit');
    }).catch(err => {
      errorEl.textContent = 'Could not create game: ' + err.message;
      btn.disabled = false; btn.textContent = 'Next: Add Locations';
    });
  }

  /* EXISTING GAME FLOW - ?game=ID in URL */
  function loadGame() {
    const params = new URLSearchParams(location.search);
    gameId = params.get('game');

    if (!gameId) { startSetupScreen(); return; }

    // Always require PIN on fresh page load - clear any leftover session key
    sessionStorage.removeItem(pinSessionKey());

    const pinErrorEl = el('pin-error');
    const ready = FirebaseDB.initFromConfig();
    if (!ready) {
      pinErrorEl.textContent = 'Firebase not configured. Contact your Hunt Master.';
      showOnly('screen-pin'); return;
    }

    FirebaseDB.getGame(gameId).then(record => {
      if (!record) {
        pinErrorEl.textContent = 'Game not found. The link may be incorrect.';
        showOnly('screen-pin'); return;
      }
      gameRecord = record;

      const titleEl = el('pin-game-title');
      if (titleEl) titleEl.textContent = record.gameTitle || 'GPS Hunt';

      if (!record.creatorPinHash) {
        pinErrorEl.textContent = 'This game has no Creator PIN set. Ask your Hunt Master to set one via the admin page.';
        showOnly('screen-pin'); return;
      }

      showOnly('screen-pin');
      setTimeout(() => el('pin-input')?.focus(), 100);
    }).catch(err => {
      el('pin-error').textContent = 'Could not load game: ' + err.message;
      showOnly('screen-pin');
    });
  }

  /* Verify PIN (existing game) */
  function attemptPin() {
    const pin     = el('pin-input')?.value.trim();
    const errorEl = el('pin-error');
    if (!pin) { errorEl.textContent = 'Please enter your PIN.'; return; }

    FirebaseDB.sha256(pin).then(hash => {
      if (hash === gameRecord.creatorPinHash) {
        sessionStorage.setItem(pinSessionKey(), 'yes');
        errorEl.textContent = '';
        populateEditor();
        showOnly('screen-edit');
      } else {
        errorEl.textContent = 'Incorrect PIN - try again';
        el('pin-input').value = '';
        el('pin-input').focus();
      }
    });
  }

  function logout() {
    sessionStorage.removeItem(pinSessionKey());
    if (isNewGame) {
      location.href = 'lobby.html';
    } else {
      el('pin-input').value = '';
      el('pin-error').textContent = '';
      showOnly('screen-pin');
      setTimeout(() => el('pin-input')?.focus(), 100);
    }
  }

  /* Populate editor from game record */
  function populateEditor() {
    try {
      const payload = JSON.parse(atob(gameRecord.encodedPayload));
      locations = Array.isArray(payload.locations) ? payload.locations : [];
    } catch (e) {
      locations = [];
    }
    const titleDisplay = el('edit-game-title-display');
    if (titleDisplay) titleDisplay.textContent = gameRecord.gameTitle || 'Game';

    const titleInput   = el('edit-game-title');
    const creatorInput = el('edit-creator-name');
    if (titleInput)   titleInput.value   = gameRecord.gameTitle   || '';
    if (creatorInput) creatorInput.value = gameRecord.creatorName || '';

    renderList();
  }

  /* Render location list */
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
          <button class="btn-secondary" onclick="Edit.move(${i}, -1)" ${i === 0 ? 'disabled' : ''}>&uarr;</button>
          <button class="btn-secondary" onclick="Edit.move(${i},  1)" ${i === locations.length - 1 ? 'disabled' : ''}>&darr;</button>
          <button class="btn-danger"    onclick="Edit.remove(${i})">&times;</button>
        </div>
      </div>
    `).join('');
  }

  /* Add location */
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
    ['edit-inp-name','edit-inp-lat','edit-inp-lng','edit-inp-clue'].forEach(id => { el(id).value = ''; });
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

  /* GPS */
  function useMyLocation() {
    if (!navigator.geolocation) { alert('Geolocation not available.'); return; }
    el('edit-gps-btn').textContent = 'Getting location...';
    navigator.geolocation.getCurrentPosition(pos => {
      el('edit-inp-lat').value = pos.coords.latitude.toFixed(7);
      el('edit-inp-lng').value = pos.coords.longitude.toFixed(7);
      el('edit-gps-btn').textContent = 'Use My GPS';
    }, err => {
      el('edit-gps-btn').textContent = 'Use My GPS';
      alert('Could not get location: ' + err.message);
    }, { enableHighAccuracy: true, timeout: 10000 });
  }

  /* Import CSV / JSON */
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
        if (valid.length === 0) { alert('No valid locations found.\n\nCSV: name, lat, lng, clue\nJSON: [{name, lat, lng, clue}, ...]'); return; }
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

  /* Read current title/creator from editor fields */
  function currentMeta() {
    return {
      gameTitle  : el('edit-game-title')?.value.trim()   || gameRecord.gameTitle   || 'GPS Hunt',
      creatorName: el('edit-creator-name')?.value.trim() || gameRecord.creatorName || 'Hunt Master',
    };
  }

  /* Build updated encoded payload */
  function buildPayload(meta) {
    const existing = JSON.parse(atob(gameRecord.encodedPayload));
    return btoa(JSON.stringify({ ...existing, locations, gameTitle: meta.gameTitle }));
  }

  /* Save as draft */
  function saveDraft() {
    if (locations.length === 0 && !confirm('No locations added yet - save anyway?')) return;
    const meta    = currentMeta();
    const encoded = buildPayload(meta);
    const btn     = el('edit-draft-btn');
    btn.disabled    = true;
    btn.textContent = 'Saving...';
    FirebaseDB.saveGameDraft({
      gameId,
      gameTitle     : meta.gameTitle,
      locationCount : locations.length,
      creatorName   : meta.creatorName,
      encodedPayload: encoded,
      joinCode      : gameRecord.joinCode,
    }).then(() => {
      gameRecord = { ...gameRecord, ...meta, encodedPayload: encoded, locationCount: locations.length };
      const titleDisplay = el('edit-game-title-display');
      if (titleDisplay) titleDisplay.textContent = meta.gameTitle;
      btn.disabled    = false;
      btn.textContent = 'Saved!';
      setTimeout(() => { btn.textContent = 'Save Changes'; }, 2500);
    }).catch(err => {
      btn.disabled    = false;
      btn.textContent = 'Save Changes';
      alert('Could not save: ' + err.message);
    });
  }

  /* Save & Publish */
  function saveAndPublish() {
    if (locations.length === 0) { alert('Add at least one location before publishing.'); return; }
    const meta    = currentMeta();
    const encoded = buildPayload(meta);
    const btn     = el('edit-publish-btn');
    btn.disabled    = true;
    btn.textContent = 'Publishing...';
    FirebaseDB.publishGame(gameId, encoded, locations.length).then(() => {
      return FirebaseDB.updateGame({ gameId, gameTitle: meta.gameTitle, locationCount: locations.length, creatorName: meta.creatorName, encodedPayload: encoded });
    }).then(() => {
      gameRecord = { ...gameRecord, ...meta, encodedPayload: encoded, locationCount: locations.length, status: 'live' };
      const titleDisplay = el('edit-game-title-display');
      if (titleDisplay) titleDisplay.textContent = meta.gameTitle;
      btn.disabled    = false;
      btn.textContent = 'Published!';
      setTimeout(() => { btn.textContent = 'Save & Publish'; }, 2500);
    }).catch(err => {
      btn.disabled    = false;
      btn.textContent = 'Save & Publish';
      alert('Could not publish: ' + err.message);
    });
  }

  /* Boot */
  function init() {
    el('setup-start-btn')?.addEventListener('click', handleSetup);
    el('setup-pin-confirm')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleSetup(); });

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
