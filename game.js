/* GPS Hunt - Game Logic */

const Game = (() => {
  let locations     = [];
  let teamName      = '';
  let currentIdx    = 0;
  let watchId       = null;
  let lastPos       = null;
  let heading       = null;
  let firebaseReady = false;

  const el = id => document.getElementById(id);

  /* Haversine distance (metres) */
  function haversine(lat1, lng1, lat2, lng2) {
    const R  = 6371000;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lng2 - lng1) * Math.PI / 180;
    const a  = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  /* Bearing to target (degrees 0-360) */
  function bearing(lat1, lng1, lat2, lng2) {
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dl = (lng2 - lng1) * Math.PI / 180;
    const y  = Math.sin(dl) * Math.cos(p2);
    const x  = Math.cos(p1)*Math.sin(p2) - Math.sin(p1)*Math.cos(p2)*Math.cos(dl);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  /* Temperature tier */
  function tempTier(dist) {
    if (dist > 500) return { cls: 'temp-freezing', label: 'FREEZING' };
    if (dist > 200) return { cls: 'temp-cold',     label: 'COLD'     };
    if (dist > 100) return { cls: 'temp-cool',     label: 'COOL'     };
    if (dist > 40)  return { cls: 'temp-warm',     label: 'WARM'     };
    if (dist > 15)  return { cls: 'temp-hot',      label: 'HOT'      };
    return              { cls: 'temp-burning',  label: 'BURNING!!'};
  }

  function fmtDist(m) {
    return m >= 1000 ? `${(m/1000).toFixed(2)} km` : `${Math.round(m)} m`;
  }

  /* Screen management */
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const s = el(id);
    if (s) s.classList.add('active');
  }

  /* Parse game data from URL hash */
  function loadFromHash() {
    try {
      const raw = location.hash.slice(1);
      if (!raw) return false;
      const json = JSON.parse(decodeURIComponent(escape(atob(raw))));
      const isNew = !Array.isArray(json);
      const locs  = isNew ? json.locations : json;

      locations = locs.map(loc => ({
        ...loc,
        claimed: false, claimedBy: null, claimedAt: null,
      }));

      if (isNew && json.gameTitle) {
        const t = el('game-title-display');
        if (t) t.textContent = json.gameTitle;
      }

      if (isNew && json.firebase && json.gameId && typeof FirebaseDB !== 'undefined') {
        firebaseReady = FirebaseDB.init(json.firebase, json.gameId);
        if (firebaseReady && typeof Leaderboard !== 'undefined') {
          Leaderboard.startInline(json.firebase, json.gameId);
        }
      }

      return locations.length > 0;
    } catch(e) {
      console.error('loadFromHash failed:', e);
      return false;
    }
  }

  /* Progress dots */
  function renderDots() {
    const wrap = el('progress-dots');
    if (!wrap) return;
    wrap.innerHTML = locations.map((loc, i) => {
      const cls = loc.claimed ? 'dot done' : i === currentIdx ? 'dot current' : 'dot';
      return `<div class="${cls}" title="${loc.name || 'Location '+(i+1)}"></div>`;
    }).join('');
  }

  /* Update play screen */
  function updatePlayScreen() {
    const loc = locations[currentIdx];
    if (!loc) return;

    el('location-name').textContent = loc.name || `Location ${currentIdx + 1}`;

    const remaining = locations.filter(l => !l.claimed).length;
    el('location-counter').textContent = `${remaining} left / ${locations.length}`;

    el('clue-box').textContent = loc.clue || 'No clue provided.';
    el('winner-banner').textContent = loc.claimed
      ? `Claimed by: ${loc.claimedBy} at ${loc.claimedAt}`
      : '';
    renderDots();
    renderWaypointList();
  }

  /* Update Hot/Cold ring and compass */
  function updateIndicators(dist, bear) {
    const ring     = el('temp-ring');
    const lbl      = el('temp-label');
    const dlbl     = el('distance-label');
    const arrow    = el('compass-arrow');
    const claimBtn = el('claim-btn');

    if (!ring) return;

    ring.className = '';
    lbl.className  = '';

    const tier = tempTier(dist);
    ring.classList.add(tier.cls);
    lbl.classList.add(tier.cls);
    lbl.textContent  = tier.label;
    dlbl.textContent = fmtDist(dist);

    if (arrow) {
      const rotation = heading !== null ? (bear - heading + 360) % 360 : bear;
      arrow.style.transform = `rotate(${rotation}deg)`;
    }

    if (claimBtn) {
      claimBtn.classList.toggle('hidden', dist > 15);
    }
  }

  /* Waypoint picker panel */
  function renderWaypointList() {
    const list = el('waypoint-list');
    if (!list) return;

    list.innerHTML = locations.map((loc, i) => {
      const dist      = lastPos ? haversine(lastPos.latitude, lastPos.longitude, loc.lat, loc.lng) : null;
      const distStr   = dist !== null ? fmtDist(dist) : '--';
      const isCurrent = i === currentIdx;
      const isClaimed = loc.claimed;

      const rowStyle  = isClaimed ? 'opacity:.45;'
        : isCurrent   ? 'background:var(--accent);color:#fff;border-radius:.5rem;'
        : '';

      const nameStyle = isClaimed ? 'text-decoration:line-through;' : 'font-weight:600;';

      const goBtn = !isClaimed && !isCurrent
        ? `<button onclick="Game.goTo(${i})"
            style="background:var(--surface);color:var(--text);border:1px solid var(--border);
                   border-radius:.4rem;padding:.25rem .6rem;font-size:.75rem;cursor:pointer;white-space:nowrap">
            Go &rarr;
           </button>`
        : isCurrent && !isClaimed
          ? `<span style="font-size:.72rem;font-weight:700;padding:.25rem .5rem;
                          background:rgba(255,255,255,.2);border-radius:.4rem">Active</span>`
          : `<span style="font-size:.72rem">&#10003;</span>`;

      return `
        <div style="display:flex;align-items:center;gap:.6rem;padding:.45rem .5rem;${rowStyle}">
          <div style="flex:1;min-width:0">
            <div style="font-size:.88rem;${nameStyle}overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              ${i+1}. ${loc.name || 'Location '+(i+1)}
            </div>
            <div style="font-size:.75rem;${isCurrent ? 'color:rgba(255,255,255,.8)' : 'color:var(--muted)'}">
              ${distStr}${isClaimed ? ' - claimed by ' + loc.claimedBy : ''}
            </div>
          </div>
          ${goBtn}
        </div>`;
    }).join('');
  }

  /* Switch active target */
  function goTo(i) {
    if (locations[i]?.claimed) return;
    currentIdx = i;
    updatePlayScreen();
    const panel = el('waypoint-panel');
    if (panel) panel.style.display = 'none';
    if (lastPos) {
      const loc  = locations[currentIdx];
      const dist = haversine(lastPos.latitude, lastPos.longitude, loc.lat, loc.lng);
      const bear = bearing(lastPos.latitude, lastPos.longitude, loc.lat, loc.lng);
      updateIndicators(dist, bear);
      if (firebaseReady) FirebaseDB.pushUpdate(currentIdx, locations.length, dist, 'playing');
    }
  }

  /* GPS position handler */
  function onPosition(pos) {
    lastPos = pos.coords;
    const status = el('gps-status');
    if (status) {
      status.textContent = `GPS +/-${Math.round(pos.coords.accuracy)}m`;
      status.className = 'ok';
    }

    if (currentIdx >= locations.length) return;
    const target = locations[currentIdx];
    if (target.claimed) return;

    const dist = haversine(lastPos.latitude, lastPos.longitude, target.lat, target.lng);
    const bear = bearing(lastPos.latitude, lastPos.longitude, target.lat, target.lng);
    updateIndicators(dist, bear);

    const panel = el('waypoint-panel');
    if (panel && panel.style.display !== 'none') renderWaypointList();

    if (firebaseReady) FirebaseDB.pushUpdate(currentIdx, locations.length, dist, 'playing');
  }

  function onGpsError(err) {
    const status = el('gps-status');
    if (status) { status.textContent = 'GPS unavailable'; status.className = 'err'; }
    console.warn('GPS error', err);
  }

  /* Device compass */
  function startCompass() {
    const handler = e => { heading = e.webkitCompassHeading ?? e.alpha ?? null; };
    if ('ondeviceorientationabsolute' in window) {
      window.addEventListener('deviceorientationabsolute', handler, true);
    } else {
      window.addEventListener('deviceorientation', handler, true);
    }
  }

  /* Claim current location */
  function claimLocation() {
    const loc = locations[currentIdx];
    if (!loc || loc.claimed) return;

    const now = new Date().toLocaleString();
    loc.claimed   = true;
    loc.claimedBy = teamName;
    loc.claimedAt = now;

    el('winner-banner').textContent = `Claimed by: ${teamName} at ${now}`;
    el('claim-btn').classList.add('hidden');
    renderDots();

    if (firebaseReady) FirebaseDB.pushUpdate(currentIdx, locations.length, 0, 'claimed');

    el('claimed-team').textContent = teamName;
    el('claimed-loc').textContent  = loc.name || `Location ${currentIdx + 1}`;
    el('claimed-time').textContent = now;
    showScreen('screen-claimed');

    setTimeout(() => {
      if (locations.every(l => l.claimed)) { endGame(); return; }

      if (lastPos) {
        let nearestIdx = -1, nearestDist = Infinity;
        locations.forEach((l, i) => {
          if (!l.claimed) {
            const d = haversine(lastPos.latitude, lastPos.longitude, l.lat, l.lng);
            if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
          }
        });
        if (nearestIdx >= 0) currentIdx = nearestIdx;
      } else {
        currentIdx = locations.findIndex(l => !l.claimed);
      }

      updatePlayScreen();
      showScreen('screen-play');
      if (firebaseReady) FirebaseDB.pushUpdate(currentIdx, locations.length, Infinity, 'playing');
    }, 3500);
  }

  /* End game */
  function endGame() {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    if (firebaseReady) FirebaseDB.pushUpdate(locations.length, locations.length, 0, 'finished');
    showScreen('screen-complete');
    el('final-team').textContent = teamName;

    const ul = el('final-summary');
    ul.innerHTML = locations.map((loc, i) =>
      `<li>${i+1}. <strong>${loc.name || 'Location '+(i+1)}</strong> - ${
        loc.claimed ? 'Claimed by ' + loc.claimedBy + ' @ ' + loc.claimedAt : 'Not claimed'
      }</li>`
    ).join('');
  }

  /* Start playing */
  function startGame() {
    teamName = (el('team-name-input')?.value || '').trim();
    if (!teamName) { alert('Please enter your team name.'); return; }

    if (firebaseReady) FirebaseDB.registerTeam(teamName);

    currentIdx = 0;
    updatePlayScreen();
    showScreen('screen-play');
    startCompass();

    if (!navigator.geolocation) { onGpsError({ message: 'not supported' }); return; }

    watchId = navigator.geolocation.watchPosition(onPosition, onGpsError, {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 10000,
    });
  }

  /* Boot */
  function init() {
    const hasGame = loadFromHash();

    el('start-btn')?.addEventListener('click', startGame);
    el('claim-btn')?.addEventListener('click', claimLocation);

    el('waypoints-btn')?.addEventListener('click', () => {
      const panel = el('waypoint-panel');
      if (!panel) return;
      const isOpen = panel.style.display !== 'none';
      panel.style.display = isOpen ? 'none' : 'block';
      if (!isOpen) renderWaypointList();
    });
    el('waypoint-panel-close')?.addEventListener('click', () => {
      const panel = el('waypoint-panel');
      if (panel) panel.style.display = 'none';
    });

    if (!hasGame) { showScreen('screen-no-game'); return; }

    showScreen('screen-setup');
    el('location-count').textContent = locations.length;
    wireInvite();

    if (firebaseReady && typeof FirebaseDB !== 'undefined') {
      const gId = (() => {
        try { return JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(1))))).gameId; }
        catch { return null; }
      })();
      if (gId) {
        FirebaseDB.gameExists(gId, exists => {
          if (!exists) {
            const noGame = el('screen-no-game');
            if (noGame) {
              const msg = noGame.querySelector('p');
              if (msg) msg.textContent = 'This game has been ended by the Hunt Master.';
            }
            showScreen('screen-no-game');
          }
        });
      }
    }
  }

  /* Invite button wiring */
  function wireInvite() {
    const inviteBtn   = el('invite-btn');
    const inviteModal = el('invite-modal');
    const inviteUrl   = el('invite-url');
    const inviteCopy  = el('invite-copy');
    const inviteShare = el('invite-share');
    const inviteClose = el('invite-close');

    if (!inviteBtn || !inviteModal) return;

    inviteBtn.addEventListener('click', () => {
      inviteUrl.value = location.href;
      inviteModal.style.display = 'flex';
      setTimeout(() => inviteUrl.select(), 100);
    });
    inviteClose.addEventListener('click', () => { inviteModal.style.display = 'none'; });
    inviteModal.addEventListener('click', e => { if (e.target === inviteModal) inviteModal.style.display = 'none'; });
    inviteCopy.addEventListener('click', () => {
      navigator.clipboard.writeText(inviteUrl.value).then(() => {
        inviteCopy.textContent = 'Copied!';
        setTimeout(() => { inviteCopy.textContent = 'Copy Link'; }, 2000);
      });
    });
    inviteShare.addEventListener('click', () => {
      if (navigator.share) {
        navigator.share({ title: 'Join my GPS Hunt!', url: inviteUrl.value }).catch(() => {});
      } else {
        navigator.clipboard.writeText(inviteUrl.value).then(() => {
          inviteShare.textContent = 'Copied!';
          setTimeout(() => { inviteShare.textContent = 'Share'; }, 2000);
        });
      }
    });
  }

  return { init, goTo };
})();

document.addEventListener('DOMContentLoaded', Game.init);
