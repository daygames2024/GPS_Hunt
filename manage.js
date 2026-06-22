/* ── GPS Hunt — Manage Games Logic ───────────────────────────────── */

const Manage = (() => {
  const el = id => document.getElementById(id);
  const SESSION_KEY = 'gps_hunt_manage_auth';

  /* ── Helpers ────────────────────────────────────────────────────── */
  function escHtml(str) {
	return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

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

  /* ── Password gate ──────────────────────────────────────────────── */
  function isAuthed() {
	return sessionStorage.getItem(SESSION_KEY) === 'yes';
  }

  function showLogin() {
	// login panel stays hidden until toggled — nothing to show
	el('logout-btn').style.display = 'none';
  }

  function showManage() {
	el('screen-login').style.display  = 'none';
	el('admin-toggle').style.display  = 'none';
	el('logout-btn').style.display    = 'inline-block';
  }

  function attemptLogin() {
	const pw       = el('pw-input')?.value || '';
	const correct  = (typeof GPS_HUNT_CONFIG !== 'undefined' && GPS_HUNT_CONFIG.managePassword) || '';
	const errorEl  = el('pw-error');

	if (pw === correct) {
	  sessionStorage.setItem(SESSION_KEY, 'yes');
	  errorEl.textContent = '';
	  showManage();
	  renderList(_lastData);
	} else {
	  errorEl.textContent = '❌ Incorrect password';
	  el('pw-input').value = '';
	  el('pw-input').focus();
	}
  }

  function logout() {
	sessionStorage.removeItem(SESSION_KEY);
	el('screen-login').style.display = 'none';
	el('admin-toggle').style.display = 'block';
	el('logout-btn').style.display   = 'none';
	renderList(_lastData);
  }

  let _lastData = {};

  /* ── Render game list ───────────────────────────────────────────── */
  function renderList(data) {
	_lastData = data || {};
	const list   = el('manage-game-list');
	const status = el('manage-status');
	if (!list) return;

	const admin = isAuthed();
	const games = Object.values(data).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

	// Without admin: only show drafts
	const visible = admin ? games : games.filter(g => g.status === 'draft');

	if (status) status.textContent = admin
	  ? `${games.length} game${games.length !== 1 ? 's' : ''} in Firebase`
	  : `${visible.length} draft${visible.length !== 1 ? 's' : ''} awaiting publication`;

	if (visible.length === 0) {
	  list.innerHTML = `
		<div style="text-align:center;padding:3rem 1rem;color:var(--muted)">
		  <div style="font-size:3rem;margin-bottom:.75rem">🗺️</div>
		  <p>${admin ? 'No games registered yet.' : 'No draft games found.'}</p>
		</div>`;
	  return;
	}

	list.innerHTML = visible.map(game => {
	  const isDraft     = game.status === 'draft';
	  const isCompleted = game.status === 'completed';
	  const isLive      = !isDraft && !isCompleted;

	  const badge = isDraft
		? '<span style="font-size:.7rem;font-weight:700;padding:.25rem .6rem;border-radius:99px;background:#1a237e;color:#90caf9;text-transform:uppercase;letter-spacing:.05em">Draft</span>'
		: isCompleted
		  ? '<span style="font-size:.7rem;font-weight:700;padding:.25rem .6rem;border-radius:99px;background:var(--border);color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Completed</span>'
		  : '<span style="font-size:.7rem;font-weight:700;padding:.25rem .6rem;border-radius:99px;background:#1b5e20;color:#a5d6a7;text-transform:uppercase;letter-spacing:.05em">Live</span>';

	  const borderColor = isDraft ? '#3949ab' : isCompleted ? 'var(--border)' : 'var(--accent)';
	  const opacity     = isCompleted ? '.6' : '1';

	  // Admin-only action buttons
	  const editBtn = (admin && isDraft) ? `
		<button
		  data-id="${escHtml(game.gameId)}"
		  data-payload="${escHtml(game.encodedPayload || '')}"
		  class="mgr-edit-btn"
		  style="background:#1565c0;color:#fff;border:none;border-radius:.5rem;padding:.5rem 1rem;font-size:.82rem;font-weight:600;cursor:pointer">
		  ✏️ Edit Draft (PIN)
		</button>
		<button
		  data-id="${escHtml(game.gameId)}"
		  data-payload="${escHtml(game.encodedPayload || '')}"
		  class="mgr-publish-btn"
		  style="background:#2e7d32;color:#fff;border:none;border-radius:.5rem;padding:.5rem 1rem;font-size:.82rem;font-weight:600;cursor:pointer">
		  🚀 Publish
		</button>` : '';

	  const hasPin = !!game.creatorPinHash;
	  const creatorLinkRow = (isDraft || isLive) && hasPin ? `
		<div style="padding-top:.35rem;border-top:1px solid var(--border)">
		  <button
			class="mgr-edit-link-btn"
			data-id="${escHtml(game.gameId)}"
			style="background:#1565c0;color:#fff;border:none;border-radius:.5rem;padding:.5rem 1rem;font-size:.82rem;font-weight:600;cursor:pointer">
			✏️ Edit
		  </button>
		</div>` : (isDraft && !hasPin ? `
		<p style="font-size:.78rem;color:var(--muted);margin:0;padding-top:.35rem;border-top:1px solid var(--border)">
		  ⚠️ No Creator PIN set — use the creator edit flow to add one.
		</p>` : '');

	  const completeBtn = (admin && isLive) ? `
		<button
		  data-id="${escHtml(game.gameId)}"
		  data-title="${escHtml(game.gameTitle || 'GPS Hunt')}"
		  class="mgr-complete-btn"
		  style="background:#e65100;color:#fff;border:none;border-radius:.5rem;padding:.5rem 1rem;font-size:.82rem;font-weight:600;cursor:pointer">
		  ✅ Mark Completed
		</button>` : '';

	  const deleteBtn = admin ? `
		<button
		  data-id="${escHtml(game.gameId)}"
		  data-title="${escHtml(game.gameTitle || 'GPS Hunt')}"
		  class="mgr-delete-btn"
		  style="background:#b71c1c;color:#fff;border:none;border-radius:.5rem;padding:.5rem 1rem;font-size:.82rem;font-weight:600;cursor:pointer">
		  🗑️ Delete Game
		</button>` : '';

	  const detailRow = admin ? `
		<div style="display:flex;gap:1.5rem;font-size:.82rem;color:var(--muted);flex-wrap:wrap">
		  <span>📍 ${game.locationCount || '?'} location${game.locationCount !== 1 ? 's' : ''}</span>
		  <span>🆔 <span style="font-family:monospace;font-size:.75rem">${escHtml(game.gameId || '—')}</span></span>
		</div>` : `
		<div style="display:flex;gap:1.5rem;font-size:.82rem;color:var(--muted);flex-wrap:wrap">
		  <span>📍 ${game.locationCount || '?'} location${game.locationCount !== 1 ? 's' : ''}</span>
		</div>`;

	  return `
		<div style="background:var(--bg);border:1px solid ${borderColor};border-radius:.85rem;padding:1rem 1.1rem;display:flex;flex-direction:column;gap:.75rem;opacity:${opacity}">

		  <!-- Title row -->
		  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.75rem">
			<div style="min-width:0">
			  <div style="font-weight:700;font-size:1rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
				${escHtml(game.gameTitle || 'GPS Hunt')}
			  </div>
			  <div style="font-size:.75rem;color:var(--muted);margin-top:.2rem">
				by ${escHtml(game.creatorName || 'Hunt Master')} · created ${fmtAge(game.createdAt)}
			  </div>
			</div>
			${badge}
		  </div>

		  ${detailRow}

		  <!-- Actions -->
		  <div style="display:flex;gap:.6rem;flex-wrap:wrap">
			${editBtn}
			${completeBtn}
			${deleteBtn}
		  </div>
		  ${creatorLinkRow}

		</div>`;
	}).join('');

	// Wire delete buttons
	list.querySelectorAll('.mgr-delete-btn').forEach(btn => {
	  btn.addEventListener('click', () => {
		const gId   = btn.dataset.id;
		const title = btn.dataset.title;
		if (!confirm(`Delete "${title}"?\n\nThe game link will stop working and all team data will be permanently removed.`)) return;
		btn.disabled    = true;
		btn.textContent = 'Deleting…';
		FirebaseDB.deleteGame(gId)
		  .catch(err => {
			alert('Could not delete: ' + err.message);
			btn.disabled    = false;
			btn.textContent = '🗑️ Delete Game';
		  });
	  });
	});

	// Wire Edit Draft buttons
	list.querySelectorAll('.mgr-edit-btn').forEach(btn => {
	  btn.addEventListener('click', () => {
		const enc = btn.dataset.payload;
		if (!enc) { alert('Draft data is missing. Cannot edit.'); return; }
		location.href = `admin.html?edit=${encodeURIComponent(enc)}`;
	  });
	});

	// Wire Publish buttons (promote draft to live without opening admin)
	list.querySelectorAll('.mgr-publish-btn').forEach(btn => {
	  btn.addEventListener('click', () => {
		const gId = btn.dataset.id;
		if (!confirm('Publish this draft? It will become visible to players immediately.')) return;
		btn.disabled    = true;
		btn.textContent = 'Publishing…';
		FirebaseDB.publishGame(gId)
		  .catch(err => {
			alert('Could not publish: ' + err.message);
			btn.disabled    = false;
			btn.textContent = '🚀 Publish';
		  });
	  });
	});

	// Wire Edit (creator link) buttons
	list.querySelectorAll('.mgr-edit-link-btn').forEach(btn => {
	  btn.addEventListener('click', () => {
		const gId = btn.dataset.id;
		location.href = `edit.html?game=${encodeURIComponent(gId)}`;
	  });
	});

	// Wire Mark Completed buttons
	list.querySelectorAll('.mgr-complete-btn').forEach(btn => {
	  btn.addEventListener('click', () => {
		const gId   = btn.dataset.id;
		const title = btn.dataset.title;
		if (!confirm(`Mark "${title}" as completed?\n\nIt will be removed from the player lobby but all data will be kept. You can delete it later.`)) return;
		btn.disabled    = true;
		btn.textContent = 'Saving…';
		FirebaseDB.completeGame(gId)
		  .catch(err => {
			alert('Could not update game: ' + err.message);
			btn.disabled    = false;
			btn.textContent = '✅ Mark Completed';
		  });
	  });
	});
  }

  /* ── Start Firebase subscription ────────────────────────────────── */
  function startLiveList() {
	const list = el('manage-game-list');

	const ready = FirebaseDB.initFromConfig();
	if (!ready) {
	  if (list) list.innerHTML = '<p style="color:var(--muted);text-align:center">Firebase not configured in config.js.</p>';
	  return;
	}

	FirebaseDB.subscribeToGames(
	  data => renderList(data),
	  err  => {
		if (list) list.innerHTML = `<p style="color:#ef5350;text-align:center">Firebase error: ${escHtml(err.message)}</p>`;
	  }
	);
  }

  /* ── Boot ───────────────────────────────────────────────────────── */
  function init() {
	// Login form
	el('pw-form')?.addEventListener('submit', e => { e.preventDefault(); attemptLogin(); });
	el('logout-btn')?.addEventListener('click', logout);
	el('pw-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); });

	// Admin toggle
	el('admin-toggle')?.addEventListener('click', () => {
	  const panel = el('screen-login');
	  if (!panel) return;
	  const isOpen = panel.style.display !== 'none';
	  panel.style.display = isOpen ? 'none' : 'flex';
	  if (!isOpen) setTimeout(() => el('pw-input')?.focus(), 50);
	});

	if (isAuthed()) {
	  showManage();
	} else {
	  showLogin();
	}

	// Always start Firebase — non-admins see drafts only
	startLiveList();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', Manage.init);
