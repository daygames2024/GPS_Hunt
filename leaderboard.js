/* ── GPS Hunt — Leaderboard Renderer ──────────────────────────────── */

const Leaderboard = (() => {
  const el = id => document.getElementById(id);

  /* ── Format distance ─────────────────────────────────────────────── */
  function fmtDist(m) {
	if (m === null || m === undefined) return '—';
	return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m} m`;
  }

  /* ── Format last-seen timestamp ──────────────────────────────────── */
  function fmtAge(ts) {
	if (!ts) return '';
	const secs = Math.round((Date.now() - ts) / 1000);
	if (secs < 5)  return 'just now';
	if (secs < 60) return `${secs}s ago`;
	return `${Math.round(secs / 60)}m ago`;
  }

  /* ── Temperature colour for distance ─────────────────────────────── */
  function distColour(dist) {
	if (dist === null || dist === undefined) return '#888';
	if (dist > 500)  return 'var(--freezing)';
	if (dist > 200)  return 'var(--cold)';
	if (dist > 100)  return 'var(--cool)';
	if (dist > 40)   return 'var(--warm)';
	if (dist > 15)   return 'var(--hot)';
	return 'var(--burning)';
  }

  /* ── Rank teams: finished first, then by (locationIndex DESC, distanceToNext ASC) */
  function rankTeams(data) {
	return Object.values(data).sort((a, b) => {
	  const aFinished = a.status === 'finished';
	  const bFinished = b.status === 'finished';
	  if (aFinished !== bFinished) return aFinished ? -1 : 1;
	  if (b.locationIndex !== a.locationIndex) return b.locationIndex - a.locationIndex;
	  const da = a.distanceToNext ?? Infinity;
	  const db2 = b.distanceToNext ?? Infinity;
	  return da - db2;
	});
  }

  /* ── Medals ─────────────────────────────────────────────────────── */
  const medals = ['🥇', '🥈', '🥉'];

  /* ── Render ─────────────────────────────────────────────────────── */
  function render(data) {
	const board = el('leaderboard-body');
	if (!board) return;

	const teams = rankTeams(data);

	if (teams.length === 0) {
	  board.innerHTML = `
		<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:1rem;font-size:.8rem">
		  Waiting for teams to join…
		</td></tr>`;
	  return;
	}

	board.innerHTML = teams.map((team, i) => {
	  const finished  = team.status === 'finished';
	  const offline   = team.status === 'offline';
	  const medal     = medals[i] || `${i + 1}`;
	  const locLabel  = finished
		? '✅'
		: `${team.locationIndex + 1}/${team.locationsTotal || '?'}`;
	  const distLabel = finished ? '—' : fmtDist(team.distanceToNext);
	  const colour    = finished ? '#43a047' : offline ? 'var(--muted)' : distColour(team.distanceToNext);
	  const rowStyle  = offline ? 'opacity:.5' : '';

	  return `
		<tr style="${rowStyle};border-bottom:1px solid var(--border)">
		  <td style="padding:.55rem .75rem;text-align:center;font-size:1.1rem">${medal}</td>
		  <td style="padding:.55rem .75rem;font-weight:700;font-size:.85rem">${escHtml(team.name || 'Unknown')}</td>
		  <td style="padding:.55rem .75rem;color:var(--muted);font-size:.78rem">${locLabel}</td>
		  <td style="padding:.55rem .75rem;color:${colour};font-weight:700;font-size:.85rem">${distLabel}</td>
		</tr>`;
	}).join('');

	// Update inline timestamp
	const upd = el('lb-updated');
	if (upd) upd.textContent = new Date().toLocaleTimeString();

	// Also update standalone leaderboard page timestamp if present
	const upd2 = el('last-updated');
	if (upd2) upd2.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  }

  /* ── Parse config from URL hash (standalone leaderboard page uses ?game=<b64>) */
  function loadConfig() {
	const params = new URLSearchParams(location.search);
	const raw    = params.get('game');
	if (!raw) return null;
	try {
	  return JSON.parse(atob(raw));
	} catch {
	  return null;
	}
  }

  /* ── Start inline leaderboard (called by game.js after Firebase is ready) */
  function startInline(firebaseConfig, gameId) {
	if (!firebaseConfig || !gameId) return;
	FirebaseDB.initAndSubscribe(firebaseConfig, gameId, data => {
	  lastSnapshot = data;
	  render(data);
	});
	setInterval(() => { if (lastSnapshot) render(lastSnapshot); }, 10_000);
  }

  /* ── Boot for standalone leaderboard.html ────────────────────────── */
  function init() {
	const config = loadConfig();
	if (!config || !config.firebase) {
	  const b = el('leaderboard-body');
	  if (b) b.innerHTML = `
		<tr><td colspan="4" style="text-align:center;color:var(--hot);padding:2rem">
		  ⚠️ No game config found in URL. Use the Hunt Master link.
		</td></tr>`;
	  return;
	}

	const title = el('game-title');
	if (title) title.textContent = config.gameTitle || 'GPS Hunt';

	FirebaseDB.initAndSubscribe(config.firebase, config.gameId, data => {
	  lastSnapshot = data;
	  render(data);
	});
	setInterval(() => { if (lastSnapshot) render(lastSnapshot); }, 10_000);
  }

  let lastSnapshot = null;

  function escHtml(str) {
	return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { init, startInline };
})();

// Only auto-init on the standalone leaderboard page
if (document.getElementById('game-title')) {
  document.addEventListener('DOMContentLoaded', Leaderboard.init);
}
