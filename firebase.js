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
	// gameInfo: { gameId, gameTitle, locationCount, creatorName, encodedPayload }
	if (!db) return;
	db.ref(`games/${gameInfo.gameId}`).set({
	  gameId        : gameInfo.gameId,
	  gameTitle     : gameInfo.gameTitle     || 'GPS Hunt',
	  locationCount : gameInfo.locationCount || 0,
	  creatorName   : gameInfo.creatorName   || 'Hunt Master',
	  encodedPayload: gameInfo.encodedPayload,
	  createdAt     : firebase.database.ServerValue.TIMESTAMP,
	  active        : true,
	});
  }

  /* ── Subscribe to all lobby games ───────────────────────────────── */
  function subscribeToGames(callback) {
	if (!db) return;
	db.ref('games').orderByChild('createdAt').on('value', snapshot => {
	  const data = snapshot.val() || {};
	  callback(data);
	});
  }

  /* ── Initialise from config.js for lobby page ───────────────────── */
  function initFromConfig() {
	if (typeof GPS_HUNT_CONFIG === 'undefined') return false;
	return init(GPS_HUNT_CONFIG.firebase, 'lobby');
  }

  return { init, registerTeam, pushUpdate, initAndSubscribe, sanitise, registerGame, subscribeToGames, initFromConfig };
})();
