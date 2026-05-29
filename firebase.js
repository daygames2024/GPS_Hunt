/* ── GPS Hunt — Firebase Realtime Database wrapper ────────────────── */
/* Uses the Firebase JS SDK v9 compat CDN build                        */

const FirebaseDB = (() => {
  let db      = null;
  let gameId  = null;
  let teamKey = null; // sanitised team name used as DB key

  /* ── Initialise ─────────────────────────────────────────────────── */
  function init(firebaseConfig, gId) {
	if (!firebaseConfig || !firebaseConfig.apiKey) return false;
	try {
	  if (!firebase.apps.length) {
		firebase.initializeApp(firebaseConfig);
	  }
	  db     = firebase.database();
	  gameId = gId;
	  return true;
	} catch (e) {
	  console.warn('Firebase init failed', e);
	  return false;
	}
  }

  /* ── Sanitise a team name into a safe DB key ────────────────────── */
  function sanitise(name) {
	return name.replace(/[.#$\[\]/]/g, '_').trim().slice(0, 40) || 'team';
  }

  /* ── Register team — called once at game start ──────────────────── */
  function registerTeam(name) {
	if (!db) return;
	teamKey = sanitise(name);
	const ref = db.ref(`hunts/${gameId}/teams/${teamKey}`);
	ref.set({
	  name,
	  locationIndex : 0,
	  locationsTotal: 0,
	  distanceToNext: null,
	  status        : 'playing',
	  lastSeen      : firebase.database.ServerValue.TIMESTAMP,
	});
	// Remove entry when team disconnects
	ref.onDisconnect().update({ status: 'offline', lastSeen: firebase.database.ServerValue.TIMESTAMP });
  }

  /* ── Push a GPS tick update ─────────────────────────────────────── */
  function pushUpdate(locationIndex, locationsTotal, distanceToNext, status) {
	if (!db || !teamKey) return;
	db.ref(`hunts/${gameId}/teams/${teamKey}`).update({
	  locationIndex,
	  locationsTotal,
	  distanceToNext: Math.round(distanceToNext),
	  status,
	  lastSeen: firebase.database.ServerValue.TIMESTAMP,
	});
  }

  /* ── Subscribe to all teams (leaderboard) ───────────────────────── */
  function subscribeToTeams(gId, callback) {
	if (!db) return;
	db.ref(`hunts/${gId}/teams`).on('value', snapshot => {
	  const data = snapshot.val() || {};
	  callback(data);
	});
  }

  /* ── Subscribe using a separate config (leaderboard page) ──────── */
  function initAndSubscribe(firebaseConfig, gId, callback) {
	if (!init(firebaseConfig, gId)) { callback({}); return; }
	subscribeToTeams(gId, callback);
  }

  /* ── Register a game in the global lobby ────────────────────────── */
  function registerGame(gameInfo) {
	// gameInfo: { gameId, gameTitle, locationCount, creatorName, encodedPayload, status? }
	if (!db) return;
	db.ref(`games/${gameInfo.gameId}`).set({
	  gameId        : gameInfo.gameId,
	  gameTitle     : gameInfo.gameTitle     || 'GPS Hunt',
	  locationCount : gameInfo.locationCount || 0,
	  creatorName   : gameInfo.creatorName   || 'Hunt Master',
	  encodedPayload: gameInfo.encodedPayload,
	  createdAt     : firebase.database.ServerValue.TIMESTAMP,
	  status        : gameInfo.status        || 'live',
	  active        : gameInfo.status !== 'draft',
	});
  }

  /* ── Save / overwrite a draft game ──────────────────────────────── */
  function saveGameDraft(gameInfo) {
	// Same shape as registerGame but preserves createdAt if already set
	if (!db) return Promise.resolve();
	const ref = db.ref(`games/${gameInfo.gameId}`);
	return ref.once('value').then(snap => {
	  const existing = snap.val() || {};
	  return ref.set({
		gameId        : gameInfo.gameId,
		gameTitle     : gameInfo.gameTitle     || 'GPS Hunt',
		locationCount : gameInfo.locationCount || 0,
		creatorName   : gameInfo.creatorName   || 'Hunt Master',
		encodedPayload: gameInfo.encodedPayload,
		createdAt     : existing.createdAt     || firebase.database.ServerValue.TIMESTAMP,
		status        : 'draft',
		active        : false,
	  });
	});
  }

  /* ── Publish a draft game (flip to live) ─────────────────────────── */
  function publishGame(gId, encodedPayload, locationCount) {
	if (!db) return Promise.resolve();
	const updates = { status: 'live', active: true };
	if (encodedPayload !== undefined) updates.encodedPayload = encodedPayload;
	if (locationCount  !== undefined) updates.locationCount  = locationCount;
	return db.ref(`games/${gId}`).update(updates);
  }

  /* ── Update mutable fields of an existing game ───────────────────── */
  function updateGame(gameInfo) {
	if (!db) return Promise.resolve();
	const updates = {};
	if (gameInfo.gameTitle     !== undefined) updates.gameTitle      = gameInfo.gameTitle;
	if (gameInfo.locationCount !== undefined) updates.locationCount  = gameInfo.locationCount;
	if (gameInfo.creatorName   !== undefined) updates.creatorName    = gameInfo.creatorName;
	if (gameInfo.encodedPayload!== undefined) updates.encodedPayload = gameInfo.encodedPayload;
	if (gameInfo.status        !== undefined) {
	  updates.status = gameInfo.status;
	  updates.active = gameInfo.status !== 'draft';
	}
	return db.ref(`games/${gameInfo.gameId}`).update(updates);
  }

  /* ── Delete a game fully (lobby entry + all hunt data) ────────────── */
  function deleteGame(gId) {
    if (!db) return Promise.reject(new Error('DB not initialised'));
    return Promise.all([
      db.ref(`games/${gId}`).remove(),
      db.ref(`hunts/${gId}`).remove(),
    ]);
  }

  /* ── Check a game still exists in the lobby ─────────────────────── */
  function gameExists(gId, callback) {
    if (!db) { callback(false); return; }
    db.ref(`games/${gId}`).once('value', snap => callback(snap.exists()));
  }

  /* ── Subscribe to all lobby games ───────────────────────────────── */
  function subscribeToGames(callback, errorCallback) {
	if (!db) { if (errorCallback) errorCallback(new Error('DB not initialised')); return; }
	db.ref('games').orderByChild('createdAt').on(
	  'value',
	  snapshot => { callback(snapshot.val() || {}); },
	  err     => { if (errorCallback) errorCallback(err); }
	);
  }

  /* ── Initialise from config.js for lobby page ───────────────────── */
  function initFromConfig() {
	if (typeof GPS_HUNT_CONFIG === 'undefined') return false;
	return init(GPS_HUNT_CONFIG.firebase, 'lobby');
  }

  return { init, registerTeam, pushUpdate, initAndSubscribe, sanitise, registerGame, saveGameDraft, publishGame, updateGame, deleteGame, gameExists, subscribeToGames, initFromConfig };
})();
