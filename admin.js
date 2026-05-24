/* ── GPS Hunt — Admin / Hunt Master Logic ─────────────────────────── */

const Admin = (() => {
  let locations = []; // [{name, lat, lng, clue}]
  let gameId    = null; // generated once per session

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

	const firebaseConfig = getFirebaseConfig();
	const gameTitle      = el('inp-game-title')?.value.trim() || 'GPS Hunt';
	const base           = location.href.replace(/admin\.html.*$/, '');

	// ── Team (player) URL ──────────────────────────────────────────
	const payload = { locations, gameId, gameTitle, ...(firebaseConfig ? { firebase: firebaseConfig } : {}) };
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

  /* ── Helpers ──────────────────────────────────────────────────────── */
  function escHtml(str) {
	return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── Auto-fill form from config.js if values present ─────────────── */
  function prefillFromConfig() {
    const cfg = typeof GPS_HUNT_CONFIG !== 'undefined' ? GPS_HUNT_CONFIG : null;
    if (!cfg) return;
    if (cfg.firebase?.apiKey && cfg.firebase.apiKey !== 'YOUR_API_KEY') {
      el('fb-api-key')?.setAttribute('value', cfg.firebase.apiKey);
      el('fb-api-key').value = cfg.firebase.apiKey;
    }
    if (cfg.firebase?.authDomain)  { el('fb-auth-domain').value = cfg.firebase.authDomain; }
    if (cfg.firebase?.databaseURL) { el('fb-db-url').value      = cfg.firebase.databaseURL; }
    if (cfg.firebase?.projectId)   { el('fb-project-id').value  = cfg.firebase.projectId; }
    if (cfg.defaultGameTitle)      { el('inp-game-title').placeholder = cfg.defaultGameTitle; }
  }

  /* ── Init ─────────────────────────────────────────────────────────── */
  function init() {
    prefillFromConfig();
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
  }

  return { init, move, remove };
})();

document.addEventListener('DOMContentLoaded', Admin.init);
