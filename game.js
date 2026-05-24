/* ── GPS Hunt — Game Logic ─────────────────────────────────────────── */

const Game = (() => {
  /* ── State ──────────────────────────────────────────────────────── */
  let locations    = [];   // [{lat, lng, clue, name, claimed, claimedBy, claimedAt}]
  let teamName     = '';
  let currentIdx   = 0;
  let watchId      = null;
  let lastPos      = null;
  let heading      = null; // degrees from north (device compass)
  let firebaseReady = false; // true once Firebase is initialised

  /* ── DOM refs ───────────────────────────────────────────────────── */
  const screens    = {};
  const el         = id => document.getElementById(id);

  /* ── Haversine distance (metres) ────────────────────────────────── */
  function haversine(lat1, lng1, lat2, lng2) {
	const R  = 6_371_000;
	const φ1 = lat1 * Math.PI / 180;
	const φ2 = lat2 * Math.PI / 180;
	const Δφ = (lat2 - lat1) * Math.PI / 180;
	const Δλ = (lng2 - lng1) * Math.PI / 180;
	const a  = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
	return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  /* ── Bearing from current pos to target (degrees 0-360) ─────────── */
  function bearing(lat1, lng1, lat2, lng2) {
	const φ1 = lat1 * Math.PI / 180;
	const φ2 = lat2 * Math.PI / 180;
	const Δλ = (lng2 - lng1) * Math.PI / 180;
	const y  = Math.sin(Δλ) * Math.cos(φ2);
	const x  = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
	return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  /* ── Temperature tier ───────────────────────────────────────────── */
  function tempTier(dist) {
	if (dist > 500)  return { cls: 'temp-freezing', label: '🥶 FREEZING' };
	if (dist > 200)  return { cls: 'temp-cold',     label: '❄️ COLD'     };
	if (dist > 100)  return { cls: 'temp-cool',     label: '🌬️ COOL'     };
	if (dist > 40)   return { cls: 'temp-warm',     label: '🌡️ WARM'     };
	if (dist > 15)   return { cls: 'temp-hot',      label: '🔥 HOT'      };
	return               { cls: 'temp-burning',  label: '🔥🔥 BURNING!!' };
  }

  /* ── Format distance nicely ─────────────────────────────────────── */
  function fmtDist(m) {
	return m >= 1000 ? `${(m/1000).toFixed(2)} km` : `${Math.round(m)} m`;
  }

  /* ── Screen management ──────────────────────────────────────────── */
  function showScreen(id) {
	document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
	const s = el(id);
	if (s) s.classList.add('active');
  }

  /* ── Parse game data from URL hash ─────────────────────────────── */
  function loadFromHash() {
	try {
	  const raw = location.hash.slice(1);
	  if (!raw) return false;
	  const json = JSON.parse(atob(raw));

	  // New format: {locations, firebase, gameId, gameTitle}
	  // Old format (array): backwards-compatible
	  const isNew = !Array.isArray(json);
	  const locs  = isNew ? json.locations : json;

	  locations = locs.map(loc => ({
		...loc,
		claimed: false,
		claimedBy: null,
		claimedAt: null,
	  }));

	  // Initialise Firebase if config present
	  if (isNew && json.firebase && json.gameId && typeof FirebaseDB !== 'undefined') {
		firebaseReady = FirebaseDB.init(json.firebase, json.gameId);
	  }

	  return locations.length > 0;
	} catch {
	  return false;
	}
  }

  /* ── Build progress dots ────────────────────────────────────────── */
  function renderDots() {
	const wrap = el('progress-dots');
	if (!wrap) return;
	wrap.innerHTML = locations.map((_, i) => {
	  const cls = i < currentIdx ? 'dot done' : i === currentIdx ? 'dot current' : 'dot';
	  return `<div class="${cls}"></div>`;
	}).join('');
  }

  /* ── Update the playing screen ──────────────────────────────────── */
  function updatePlayScreen() {
	const loc = locations[currentIdx];
	if (!loc) return;

	el('location-name').textContent = loc.name || `Location ${currentIdx + 1}`;
	el('location-counter').textContent = `${currentIdx + 1} / ${locations.length}`;
	el('clue-box').textContent = loc.clue || 'No clue provided.';
	el('winner-banner').textContent = loc.claimed
	  ? `🏆 First claimed by: ${loc.claimedBy} at ${loc.claimedAt}`
	  : '';
	renderDots();
  }

  /* ── Update Hot/Cold ring & compass arrow ───────────────────────── */
  function updateIndicators(dist, bear) {
	const ring   = el('temp-ring');
	const lbl    = el('temp-label');
	const dlbl   = el('distance-label');
	const arrow  = el('compass-arrow');
	const claimBtn = el('claim-btn');

	if (!ring) return;

	// clear old temp classes
	ring.className = '';
	lbl.className  = '';

	const tier = tempTier(dist);
	ring.classList.add(tier.cls);
	lbl.classList.add(tier.cls);
	lbl.textContent  = tier.label;
	dlbl.textContent = fmtDist(dist);

	// compass arrow — rotate toward target relative to device heading
	if (arrow) {
	  const rotation = heading !== null ? (bear - heading + 360) % 360 : bear;
	  arrow.style.transform = `rotate(${rotation}deg)`;
	}

	// show claim button when within 15 m
	if (claimBtn) {
	  claimBtn.classList.toggle('hidden', dist > 15);
	}
  }

  /* ── GPS position handler ───────────────────────────────────────── */
  function onPosition(pos) {
	lastPos = pos.coords;
	const status = el('gps-status');
	if (status) { status.textContent = `GPS ±${Math.round(pos.coords.accuracy)}m`; status.className = 'ok'; }

	if (currentIdx >= locations.length) return;
	const target = locations[currentIdx];
	const dist   = haversine(lastPos.latitude, lastPos.longitude, target.lat, target.lng);
	const bear   = bearing(lastPos.latitude, lastPos.longitude, target.lat, target.lng);
	updateIndicators(dist, bear);

	// Push to leaderboard
	if (firebaseReady) {
	  FirebaseDB.pushUpdate(currentIdx, locations.length, dist, 'playing');
	}
  }

  function onGpsError(err) {
	const status = el('gps-status');
	if (status) { status.textContent = 'GPS unavailable'; status.className = 'err'; }
	console.warn('GPS error', err);
  }

  /* ── Device orientation (compass) ──────────────────────────────── */
  function startCompass() {
	const handler = e => {
	  heading = e.webkitCompassHeading ?? e.alpha ?? null;
	};
	if ('ondeviceorientationabsolute' in window) {
	  window.addEventListener('deviceorientationabsolute', handler, true);
	} else {
	  window.addEventListener('deviceorientation', handler, true);
	}
  }

  /* ── Claim current location ─────────────────────────────────────── */
  function claimLocation() {
	const loc = locations[currentIdx];
	if (!loc || loc.claimed) return;

	const now = new Date().toLocaleString();
	loc.claimed   = true;
	loc.claimedBy = teamName;
	loc.claimedAt = now;

	el('winner-banner').textContent = `🏆 First claimed by: ${teamName} at ${now}`;
	el('claim-btn').classList.add('hidden');
	renderDots();

	// Push claimed state
	if (firebaseReady) {
	  FirebaseDB.pushUpdate(currentIdx, locations.length, 0, 'claimed');
	}

	// Show claimed screen briefly
	el('claimed-team').textContent  = teamName;
	el('claimed-loc').textContent   = loc.name || `Location ${currentIdx + 1}`;
	el('claimed-time').textContent  = now;
	showScreen('screen-claimed');

	setTimeout(() => {
	  currentIdx++;
	  if (currentIdx >= locations.length) {
		endGame();
	  } else {
		updatePlayScreen();
		showScreen('screen-play');
		if (firebaseReady) {
		  FirebaseDB.pushUpdate(currentIdx, locations.length, Infinity, 'playing');
		}
	  }
	}, 3500);
  }

  /* ── End game ───────────────────────────────────────────────────── */
  function endGame() {
	if (watchId !== null) navigator.geolocation.clearWatch(watchId);
	if (firebaseReady) FirebaseDB.pushUpdate(locations.length, locations.length, 0, 'finished');
	showScreen('screen-complete');
	el('final-team').textContent = teamName;

	// Build summary
	const ul = el('final-summary');
	ul.innerHTML = locations.map((loc, i) =>
	  `<li>${i+1}. <strong>${loc.name || 'Location '+(i+1)}</strong> — ${loc.claimed ? '🏆 '+loc.claimedBy+' @ '+loc.claimedAt : '⏭️ skipped'}</li>`
	).join('');
  }

  /* ── Start playing ──────────────────────────────────────────────── */
  function startGame() {
	teamName = (el('team-name-input')?.value || '').trim();
	if (!teamName) { alert('Please enter your team name.'); return; }

	// Register team in Firebase
	if (firebaseReady) FirebaseDB.registerTeam(teamName);

	currentIdx = 0;
	updatePlayScreen();
	showScreen('screen-play');

	startCompass();

	if (!navigator.geolocation) {
	  onGpsError({ message: 'not supported' });
	  return;
	}

	watchId = navigator.geolocation.watchPosition(onPosition, onGpsError, {
	  enableHighAccuracy: true,
	  maximumAge: 2000,
	  timeout: 10000,
	});
  }

  /* ── Boot ───────────────────────────────────────────────────────── */
  function init() {
	const hasGame = loadFromHash();

	if (hasGame) {
	  showScreen('screen-setup');
	  el('location-count').textContent = locations.length;
	} else {
	  showScreen('screen-no-game');
	}

	// Wire buttons
	el('start-btn')?.addEventListener('click', startGame);
	el('claim-btn')?.addEventListener('click', claimLocation);
	el('next-btn')?.addEventListener('click', () => {
	  currentIdx++;
	  if (currentIdx >= locations.length) { endGame(); return; }
	  updatePlayScreen();
	  showScreen('screen-play');
	  if (firebaseReady) FirebaseDB.pushUpdate(currentIdx, locations.length, Infinity, 'playing');
	});
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', Game.init);
