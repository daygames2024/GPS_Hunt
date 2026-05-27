/* ── GPS Hunt — Admin / Hunt Master Logic ─────────────────────────── */

const Admin = (() => {
  let locations = []; // [{name, lat, lng, clue}]
  let gameId    = null; // generated once per session
  let joinCode  = null; // short code players need to enter in the lobby

  const el = id => document.getElementById(id);

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
	  FirebaseDB.registerGame({
		gameId,
		gameTitle,
		locationCount : locations.length,
		creatorName   : el('inp-creator-name')?.value.trim() || 'Hunt Master',
		encodedPayload: encoded,
		joinCode,
	  });
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

  /* ── Manage Games — live list with delete ─────────────────────────── */
  const AGE_ENDED_MS = 24 * 60 * 60 * 1000;

  function fmtAge(ts) {
    if (!ts) return '—';
    const ms   = Date.now() - ts;
    const mins = Math.floor(ms / 60000);
    if (mins < 1)  return 'just created';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  function renderManageList(data) {
    const list   = el('manage-game-list');
    const status = el('manage-status');
    if (!list) return;

    const games = Object.values(data).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (status) status.textContent = `${games.length} game${games.length !== 1 ? 's' : ''} in Firebase`;

    if (games.length === 0) {
      list.innerHTML = '<p style="color:var(--muted);text-align:center;font-size:.85rem">No games registered yet.</p>';
      return;
    }

    list.innerHTML = games.map(game => {
      const ended  = (Date.now() - (game.createdAt || 0)) > AGE_ENDED_MS;
      const badge  = ended
        ? '<span style="font-size:.7rem;font-weight:700;padding:.2rem .55rem;border-radius:99px;background:var(--border);color:var(--muted);text-transform:uppercase">Ended</span>'
        : '<span style="font-size:.7rem;font-weight:700;padding:.2rem .55rem;border-radius:99px;background:#1b5e20;color:#a5d6a7;text-transform:uppercase">Active</span>';

      return `
        <div style="display:flex;align-items:center;gap:.75rem;background:var(--bg);border:1px solid var(--border);border-radius:.75rem;padding:.85rem 1rem;flex-wrap:wrap">
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${escHtml(game.gameTitle || 'GPS Hunt')}
            </div>
            <div style="font-size:.75rem;color:var(--muted);margin-top:.2rem">
              by ${escHtml(game.creatorName || 'Hunt Master')}
              · 📍 ${game.locationCount || '?'} locations
              · 🔑 ${escHtml(game.joinCode || '—')}
              · ${fmtAge(game.createdAt)}
            </div>
          </div>
          ${badge}
          <button
            onclick="Admin.deleteGame('${escHtml(game.gameId)}')"
            title="Remove from lobby"
            style="background:#b71c1c;color:#fff;border:none;border-radius:.5rem;padding:.45rem .85rem;font-size:.8rem;font-weight:600;cursor:pointer;flex-shrink:0">
            🗑️ Delete
          </button>
        </div>`;
    }).join('');
  }

  function deleteGame(gId) {
    if (!confirm('Delete this game? The link will stop working and all team data will be removed.')) return;
    FirebaseDB.deleteGame(gId)
      .catch(err => alert('Could not delete: ' + err.message));
  }

  function startManageGames() {
    if (typeof FirebaseDB === 'undefined') return;
    const ready = FirebaseDB.initFromConfig();
    if (!ready) {
      const list = el('manage-game-list');
      if (list) list.innerHTML = '<p style="color:var(--muted);font-size:.85rem;text-align:center">Firebase not configured.</p>';
      return;
    }
    FirebaseDB.subscribeToGames(
      data => renderManageList(data),
      err  => {
        const list = el('manage-game-list');
        if (list) list.innerHTML = `<p style="color:#ef5350;font-size:.85rem">Error: ${escHtml(err.message)}</p>`;
      }
    );
  }

  /* ── Helpers ──────────────────────────────────────────────────────── */
  function escHtml(str) {
	return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── Init ─────────────────────────────────────────────────────────── */
  function init() {
	el('add-btn')?.addEventListener('click', addLocation);
	el('gps-btn')?.addEventListener('click', useMyLocation);
	el('generate-btn')?.addEventListener('click', generate);
	el('copy-btn')?.addEventListener('click', copyUrl);

	el('copy-lb-btn')?.addEventListener('click', () => {
	  const val = el('lb-url')?.value;
	  if (!val) return;
	  navigator.clipboard.writeText(val).then(() => {
		const btn = el('copy-lb-btn');
		btn.textContent = '✅ Copied!';
		setTimeout(() => { btn.textContent = '📋 Copy Leaderboard Link'; }, 2000);
	  });
	});

	// Allow Enter in lat/lng to advance to next field
	el('inp-lat')?.addEventListener('keydown', e => { if (e.key === 'Enter') el('inp-lng').focus(); });
	el('inp-lng')?.addEventListener('keydown', e => { if (e.key === 'Enter') el('inp-clue').focus(); });

	renderList();
	startManageGames();
  }

  return { init, move, remove, deleteGame };
})();

document.addEventListener('DOMContentLoaded', () => {}); // init called by admin.html loader
