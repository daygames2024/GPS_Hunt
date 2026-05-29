/* ── GPS Hunt — Lobby Logic ───────────────────────────────────────── */

const Lobby = (() => {
  const el = id => document.getElementById(id);

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

  /* ── Join code modal ────────────────────────────────────────────── */
  function showJoinModal(encodedPayload, gameTitle, correctCode) {
	// Build modal if not already present
	let overlay = el('join-modal-overlay');
	if (!overlay) {
	  overlay = document.createElement('div');
	  overlay.id = 'join-modal-overlay';
	  overlay.style.cssText = [
		'position:fixed;inset:0;background:rgba(0,0,0,.75);',
		'display:flex;align-items:center;justify-content:center;',
		'z-index:999;padding:1rem'
	  ].join('');
	  overlay.innerHTML = `
		<div style="background:var(--surface);border:1px solid var(--border);border-radius:1.25rem;padding:2rem;max-width:360px;width:100%;display:flex;flex-direction:column;gap:1.25rem;text-align:center">
		  <div style="font-size:2.5rem">🔑</div>
		  <div>
			<div id="join-modal-title" style="font-size:1.15rem;font-weight:700;margin-bottom:.4rem"></div>
			<div style="font-size:.85rem;color:var(--muted)">Enter the join code to play</div>
		  </div>
		  <input id="join-modal-input"
			type="text" maxlength="5"
			placeholder="e.g. HX7K2"
			autocomplete="off" autocorrect="off" spellcheck="false"
			style="text-align:center;text-transform:uppercase;letter-spacing:.25em;font-size:1.5rem;font-weight:700;font-family:monospace;padding:.75rem;border-radius:.75rem;border:2px solid var(--border);background:var(--bg);color:var(--text);width:100%;outline:none" />
		  <div id="join-modal-error" style="color:#ef5350;font-size:.85rem;min-height:1.2em"></div>
		  <button id="join-modal-confirm" class="btn-primary" style="max-width:unset;width:100%">✅ Join Game</button>
		  <button id="join-modal-cancel" class="btn-secondary" style="max-width:unset;width:100%">Cancel</button>
		</div>`;
	  document.body.appendChild(overlay);
	}

	// Populate for this game
	el('join-modal-title').textContent = gameTitle;
	el('join-modal-input').value = '';
	el('join-modal-error').textContent = '';
	overlay.style.display = 'flex';

	const input   = el('join-modal-input');
	const errorEl = el('join-modal-error');

	// Force uppercase as user types
	input.oninput = () => { input.value = input.value.toUpperCase(); };
	input.focus();

	function attempt() {
	  const entered = input.value.trim().toUpperCase();
	  if (entered === correctCode.toUpperCase()) {
		overlay.style.display = 'none';
		const base = location.href.replace(/lobby\.html.*$/, '');
		location.href = `${base}index.html#${encodedPayload}`;
	  } else {
		errorEl.textContent = '❌ Incorrect code — check with your Hunt Master';
		input.select();
	  }
	}

	el('join-modal-confirm').onclick = attempt;
	input.onkeydown = e => { if (e.key === 'Enter') attempt(); };
	el('join-modal-cancel').onclick = () => { overlay.style.display = 'none'; };
	// Close on backdrop click
	overlay.onclick = e => { if (e.target === overlay) overlay.style.display = 'none'; };
  }

  /* ── Render game cards ──────────────────────────────────────────── */
  function render(data) {
	const list = el('game-list');
	if (!list) return;

	const games = Object.values(data)
	  .filter(g => g.status !== 'draft' && g.status !== 'completed')
	  .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

	if (games.length === 0) {
	  list.innerHTML = `
		<div class="lobby-empty">
		  <div style="font-size:3rem">🗺️</div>
		  <p>No active games yet.<br>Be the first to create one!</p>
		</div>`;
	  return;
	}

	list.innerHTML = games.map(game => {
	  const badge = '<span class="game-badge badge-active">Live</span>';

	  // Store game data on the button via data attributes to avoid escaping issues
	  const dataAttrs = `data-payload="${escAttr(game.encodedPayload)}" data-title="${escAttr(game.gameTitle || 'GPS Hunt')}" data-code="${escAttr(game.joinCode || '')}"`;

	  return `
		<div class="game-card">
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
		  <button class="btn-primary game-join-btn join-btn" ${dataAttrs}>
			🔑 Join Game
		  </button>
		</div>`;
	}).join('');

	// Wire join buttons after render
	list.querySelectorAll('.join-btn').forEach(btn => {
	  btn.addEventListener('click', () => {
		const payload = btn.dataset.payload;
		const title   = btn.dataset.title;
		const code    = btn.dataset.code;
		if (!payload) { alert('Game data missing.'); return; }
		if (code) {
		  showJoinModal(payload, title, code);
		} else {
		  // No code set — join directly (backwards compatible)
		  const base = location.href.replace(/lobby\.html.*$/, '');
		  location.href = `${base}index.html#${payload}`;
		}
	  });
	});
  }

  /* ── Boot ───────────────────────────────────────────────────────── */
  function init() {
	const ready = FirebaseDB.initFromConfig();

	if (!ready) {
	  el('loading-msg').style.display = 'none';
	  el('game-list').innerHTML = `
		<div class="lobby-empty">
		  <div style="font-size:2.5rem">⚠️</div>
		  <p>Firebase not configured.<br>
		  Ask your Hunt Master for a direct game link, or
		  <a href="edit.html" style="color:var(--accent)">create your own hunt</a>.</p>
		</div>`;
	  return;
	}

	const timeout = setTimeout(() => {
	  el('loading-msg').style.display = 'none';
	  el('game-list').innerHTML = `
		<div class="lobby-empty">
		  <div style="font-size:2.5rem">⚠️</div>
		  <p>Could not reach Firebase.<br>
		  Check your internet connection or
		  <a href="https://console.firebase.google.com" target="_blank" style="color:var(--accent)">
		  Firebase database rules</a>.</p>
		  <button class="btn-secondary" onclick="location.reload()" style="max-width:220px">🔄 Retry</button>
		</div>`;
	}, 8000);

	FirebaseDB.subscribeToGames(
	  data => {
		clearTimeout(timeout);
		el('loading-msg').style.display = 'none';
		render(data);
	  },
	  err => {
		clearTimeout(timeout);
		el('loading-msg').style.display = 'none';
		const msg = err && err.message ? err.message : String(err);
		const isPerms = msg.toLowerCase().includes('permission');
		el('game-list').innerHTML = `
		  <div class="lobby-empty">
			<div style="font-size:2.5rem">🔒</div>
			<p><strong>Firebase error:</strong> ${escHtml(msg)}</p>
			${isPerms ? `<p style="font-size:.85rem">Your Firebase database rules are blocking reads.<br>
			  See the <a href="https://console.firebase.google.com" target="_blank" style="color:var(--accent)">Firebase Console → Realtime Database → Rules</a>
			  and set them to allow read/write.</p>` : ''}
			<button class="btn-secondary" onclick="location.reload()" style="max-width:220px">🔄 Retry</button>
		  </div>`;
	  }
	);
  }

  /* ── Helpers ────────────────────────────────────────────────────── */
  function escHtml(str) {
	return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escAttr(str) {
	return String(str || '').replace(/"/g, '&quot;');
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', Lobby.init);
