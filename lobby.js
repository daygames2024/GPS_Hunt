/* ── GPS Hunt — Lobby Logic ───────────────────────────────────────── */

const Lobby = (() => {
  const el = id => document.getElementById(id);

  const AGE_ENDED_MS = 24 * 60 * 60 * 1000; // 24 hours

  /* ── Format age of game ─────────────────────────────────────────── */
  function fmtAge(ts) {
	if (!ts) return '';
	const ms = Date.now() - ts;
	const mins = Math.floor(ms / 60000);
	if (mins < 1)  return 'just created';
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24)  return `${hrs}h ago`;
	return `${Math.floor(hrs / 24)}d ago`;
  }

  /* ── Render game cards ──────────────────────────────────────────── */
  function render(data) {
	const list = el('game-list');
	if (!list) return;

	const games = Object.values(data).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

	if (games.length === 0) {
	  list.innerHTML = `
		<div class="lobby-empty">
		  <div style="font-size:3rem">🗺️</div>
		  <p>No active games yet.<br>Be the first to create one!</p>
		</div>`;
	  return;
	}

	list.innerHTML = games.map(game => {
	  const age     = Date.now() - (game.createdAt || 0);
	  const ended   = age > AGE_ENDED_MS;
	  const badge   = ended
		? '<span class="game-badge badge-ended">Ended</span>'
		: '<span class="game-badge badge-active">Active</span>';

	  return `
		<div class="game-card ${ended ? 'game-card-ended' : ''}">
		  <div class="game-card-header">
			<div>
			  <div class="game-card-title">${escHtml(game.gameTitle || 'GPS Hunt')}</div>
			  <div class="game-card-meta">
				by ${escHtml(game.creatorName || 'Hunt Master')} · ${fmtAge(game.createdAt)}
			  </div>
			</div>
			${badge}
		  </div>
		  <div class="game-card-info">
			📍 ${game.locationCount || '?'} location${game.locationCount !== 1 ? 's' : ''}
		  </div>
		  <button class="btn-primary game-join-btn" onclick="Lobby.join('${escAttr(game.encodedPayload)}', '${escAttr(game.gameTitle || 'GPS Hunt')}')">
			🚀 Join Game
		  </button>
		</div>`;
	}).join('');
  }

  /* ── Join a game — navigate to index.html with the encoded payload ─ */
  function join(encodedPayload, title) {
	if (!encodedPayload) { alert('Game data missing.'); return; }
	const base = location.href.replace(/lobby\.html.*$/, '');
	location.href = `${base}index.html#${encodedPayload}`;
  }

  /* ── Boot ───────────────────────────────────────────────────────── */
  function init() {
	// Attempt Firebase connection using hardcoded config.js
	const ready = FirebaseDB.initFromConfig();

	if (!ready) {
	  el('game-list').innerHTML = `
		<div class="lobby-empty">
		  <div style="font-size:2.5rem">⚠️</div>
		  <p>Firebase not configured.<br>
		  Ask your Hunt Master for a direct game link,<br>or
		  <a href="admin.html" style="color:var(--accent)">create your own hunt</a>.</p>
		</div>`;
	  return;
	}

	el('loading-msg')?.classList.remove('hidden');

	FirebaseDB.subscribeToGames(data => {
	  el('loading-msg')?.classList.add('hidden');
	  render(data);
	});
  }

  /* ── Helpers ────────────────────────────────────────────────────── */
  function escHtml(str) {
	return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escAttr(str) {
	return String(str || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
  }

  return { init, join };
})();

document.addEventListener('DOMContentLoaded', Lobby.init);
