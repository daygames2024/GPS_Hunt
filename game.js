/* â”€â”€ GPS Hunt â€” Game Logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const Game = (() => {
  /* â”€â”€ State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  let locations    = [];   // [{lat, lng, clue, name, claimed, claimedBy, claimedAt}]
  let teamName     = '';
  let currentIdx   = 0;
  let watchId      = null;
  let lastPos      = null;
  let heading      = null;
  let firebaseReady = false;

  /* â”€â”€ DOM refs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const screens    = {};
  const el         = id => document.getElementById(id);

  /* â”€â”€ Haversine distance (metres) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  function haversine(lat1, lng1, lat2, lng2) {
    const R  = 6_371_000;
    const Ï†1 = lat1 * Math.PI / 180;
    const Ï†2 = lat2 * Math.PI / 180;
    const Î”Ï† = (lat2 - lat1) * Math.PI / 180;
    const Î”Î» = (lng2 - lng1) * Math.PI / 180;
    const a  = Math.sin(Î”Ï†/2)**2 + Math.cos(Ï†1)*Math.cos(Ï†2)*Math.sin(Î”Î»/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  /* â”€â”€ Bearing from current pos to target (degrees 0-360) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  function bearing(lat1, lng1, lat2, lng2) {
    const Ï†1 = lat1 * Math.PI / 180;
    const Ï†2 = lat2 * Math.PI / 180;
    const Î”Î» = (lng2 - lng1) * Math.PI / 180;
    const y  = Math.sin(Î”Î») * Math.cos(Ï†2);
    const x  = Math.cos(Ï†1)*Math.sin(Ï†2) - Math.sin(Ï†1)*Math.cos(Ï†2)*Math.cos(Î”Î»);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  /* â”€â”€ Temperature tier â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  function tempTier(dist) {
    if (dist > 500)  return { cls: 'temp-freezing', label: 'ðŸ¥¶ FREEZING' };
    if (dist > 200)  return { cls: 'temp-cold',     label: 'â„ï¸ COLD'     };
    if (dist > 100)  return { cls: 'temp-cool',     label: 'ðŸŒ¬ï¸ COOL'     };
    if (dist > 40)   return { cls: 'temp-warm',     label: 'ðŸŒ¡ï¸ WARM'     };
    if (dist > 15)   return { cls: 'temp-hot',      label: 'ðŸ”¥ HOT'      };
    return               { cls: 'temp-burning',  label: 'ðŸ”¥ðŸ”¥ BURNING!!' };
  }

  /* â”€â”€ Format distance nicely â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  function fmtDist(m) {
    return m >= 1000 ? `${(m/1000).toFixed(2)} km` : `${Math.round(m)} m`;
  }

  /* â”€â”€ Screen management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const s = el(id);
    if (s) s.classList.add('active');
  }

  /* â”€â”€ Parse game data from URL hash â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  function loadFromHash() {
    try {
      const raw = location.hash.slice(1);
      if (!raw) return false;
      const json = JSON.parse(atob(raw));
      const isNew = !Array.isArray(json);
      const locs  = isNew ? json.locations : json;

      locations = locs.map(loc => ({
        ...loc,
        claimed: false,
        claimedBy: null,
        claimedAt: null,
      }));

      if (isNew && json.gameTitle) {
        const titleEl = el('game-title-display');
        if (titleEl) titleEl.textContent = json.gameTitle;
      }

      if (isNew && json.firebase && json.gameId && typeof FirebaseDB !== 'undefined') {
        firebaseReady = FirebaseDB.init(json.firebase, json.gameId);
        if (firebaseReady && typeof Leaderboard !== 'undefined') {
          Leaderboard.startInline(json.firebase, json.gameId);
        }
      }

      return locations.length > 0;
    } catch {
      return false;
    }
  }

  /* â”€â”€ Progress dots (still used as a compact claimed tracker) â”€â”€â”€â”€â”€â”€â”€ */
  function renderDots() {
    const wrap = el('progress-dots');
    if (!wrap) return;
    wrap.innerHTML = locations.map((loc, i) => {
      const cls = loc.claimed ? 'dot done' : i === currentIdx ? 'dot current' : 'dot';
      return `<div class="${cls}" title="${loc.name || 'Location '+(i+1)}"></div>`;
    }).join('');
  }

  /* â”€â”€ Update the playing screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  function updatePlayScreen() {
    const loc = locations[currentIdx];
    if (!loc) return;

    el('location-name').textContent = loc.name || `Location ${currentIdx + 1}`;

    // counter: remaining / total
    const remaining = locations.filter(l => !l.claimed).length;
    el('location-counter').textContent = `${remaining} left / ${locations.length}`;

    el('clue-box').textContent = loc.clue || 'No clue provided.';
    el('winner-banner').textContent = loc.claimed
      ? `ðŸ† First claimed by: ${loc.claimedBy} at ${loc.claimedAt}`
      : '';
    renderDots();
    renderWaypointList();
  }

  /* â”€â”€ Update Hot/Cold ring & compass arrow â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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

  /* â”€â”€ Waypoint picker panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  function renderWaypointList() {
    const list = el('waypoint-list');
    if (!list) return;

    list.innerHTML = locations.map((loc, i) => {
      const dist = lastPos
        ? haversine(lastPos.latitude, lastPos.longitude, loc.lat, loc.lng)
        : null;
      const distStr = dist !== null ? fmtDist(dist) : 'â€”';
      const isCurrent = i === currentIdx;
      const isClaimed = loc.claimed;

      const rowStyle = isClaimed
        ? 'opacity:.45;'
        : isCurrent
          ? 'background:var(--accent);color:#fff;border-radius:.5rem;'
          : '';

      const nameStyle = isClaimed ? 'text-decoration:line-through;' : 'font-weight:600;';

      const goBtn = !isClaimed && !isCurrent
        ? `<button
            onclick="Game.goTo(${i})"
            style="background:var(--surface);color:var(--text);border:1px solid var(--border);
                   border-radius:.4rem;padding:.25rem .6rem;font-size:.75rem;cursor:pointer;white-space:nowrap">
            Go &rarr;
           </button>`
        : isCurrent && !isClaimed
          ? `<span style="font-size:.72rem;font-weight:700;padding:.25rem .5rem;
                           background:rgba(255,255,255,.2);border-radius:.4rem">
             Active
           </span>`
          : `<span style="font-size:.72rem">âœ”</span>`;

      return `
        <div style="display:flex;align-items:center;gap:.6rem;padding:.45rem .5rem;${rowStyle}">
          <div style="flex:1;min-width:0;">
            <div style="font-size:.88rem;${nameStyle}overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              ${i+1}. ${loc.name || 'Location '+(i+1)}
            </div>
            <div style="font-size:.75rem;${isCurrent ? 'color:rgba(255,255,255,.8)' : 'color:var(--muted)'}">
              ${distStr}${isClaimed ? ' Â· claimed by '+loc.claimedBy : ''}
            </div>
          </div>
          ${goBtn}
        </div>`;
    }).join('');
  }

  /* â”€â”€ Switch active target â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  function goTo(i) {
    if (locations[i]?.claimed) return;
    currentIdx = i;
    updatePlayScreen();
    // close the panel
    const panel = el('waypoint-panel');
    if (panel) panel.style.display = 'none';
    // update firebase immediately with new target
    if (firebaseReady && lastPos) {
      const loc  = locations[currentIdx];
      const dist = haversine(lastPos.latitude, lastPos.longitude, loc.lat, loc.lng);
      FirebaseDB.pushUpdate(currentIdx, locations.length, dist, 'playing');
    }
    // refresh indicators if we have a position
    if (lastPos) {
      const loc  = locations[currentIdx];
      const dist = haversine(lastPos.latitude, lastPos.longitude, loc.lat, loc.lng);
      const bear = bearing(lastPos.latitude, lastPos.longitude, loc.lat, loc.lng);
      updateIndicators(dist, bear);
    }
  }

  /* â”€â”€ GPS position handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  function onPosition(pos) {
    lastPos = pos.coords;
    const status = el('gps-status');
    if (status) { status.textContent = `GPS Â±${Math.round(pos.coords.accuracy)}m`; status.className = 'ok'; }

    if (currentIdx >= locations.length) return;
    const target = locations[currentIdx];
    if (target.claimed) return;

    const dist = haversine(lastPos.latitude, lastPos.longitude, target.lat, target.lng);
    const bear = bearing(lastPos.latitude, lastPos.longitude, target.lat, target.lng);
    updateIndicators(dist, bear);

    // live-update distances in waypoint panel if open
    const panel = el('waypoint-panel');
    if (panel && panel.style.display !== 'none') renderWaypointList();

    if (firebaseReady) {
      FirebaseDB.pushUpdate(currentIdx, locations.length, dist, 'playing');
    }
  }

  function onGpsError(err) {
    const status = el('gps-status');
    if (status) { status.textContent = 'GPS unavailable'; status.className = 'err'; }
    console.warn('GPS error', err);
  }

  /* â”€â”€ Device orientation (compass) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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

  /* â”€â”€ Claim current location â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  function claimLocation() {
    const loc = locations[currentIdx];
    if (!loc || loc.claimed) return;

    const now = new Date().toLocaleString();
    loc.claimed   = true;
    loc.claimedBy = teamName;
    loc.claimedAt = now;

    el('winner-banner').textContent = `ðŸ† First claimed by: ${teamName} at ${now}`;
    el('claim-btn').classList.add('hidden');
    renderDots();

    if (firebaseReady) {
      FirebaseDB.pushUpdate(currentIdx, locations.length, 0, 'claimed');
    }

    el('claimed-team').textContent = teamName;
    el('claimed-loc').textContent  = loc.name || `Location ${currentIdx + 1}`;
    el('claimed-time').textContent = now;
    showScreen('screen-claimed');

    setTimeout(() => {
      // Check if all claimed
      const allDone = locations.every(l => l.claimed);
      if (allDone) {
        endGame();
        return;
      }

      // Auto-switch to nearest unclaimed
      if (lastPos) {
        let nearestIdx  = -1;
        let nearestDist = Infinity;
        locations.forEach((l, i) => {
          if (!l.claimed) {
            const d = haversine(lastPos.latitude, lastPos.longitude, l.lat, l.lng);
            if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
          }
        });
        if (nearestIdx >= 0) currentIdx = nearestIdx;
      } else {
        // No GPS yet â€” pick first unclaimed
        currentIdx = locations.findIndex(l => !l.claimed);
      }

      updatePlayScreen();
      showScreen('screen-play');
      if (firebaseReady) {
        FirebaseDB.pushUpdate(currentIdx, locations.length, Infinity, 'playing');
      }
    }, 3500);
  }

  /* â”€â”€ End game â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  function endGame() {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    if (firebaseReady) FirebaseDB.pushUpdate(locations.length, locations.length, 0, 'finished');
    showScreen('screen-complete');
    el('final-team').textContent = teamName;

    const ul = el('final-summary');
    ul.innerHTML = locations.map((loc, i) =>
      `<li>${i+1}. <strong>${loc.name || 'Location '+(i+1)}</strong> â€” ${loc.claimed ? 'ðŸ† '+loc.claimedBy+' @ '+loc.claimedAt : 'âŒ not claimed'}</li>`
    ).join('');
  }

  /* â”€â”€ Start playing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  function startGame() {
    teamName = (el('team-name-input')?.value || '').trim();
    if (!teamName) { alert('Please enter your team name.'); return; }

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

  /* â”€â”€ Boot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  function init() {
    const hasGame = loadFromHash();

    el('start-btn')?.addEventListener('click', startGame);
    el('claim-btn')?.addEventListener('click', claimLocation);

    // Waypoint panel toggle
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

    if (!hasGame) {
      showScreen('screen-no-game');
      return;
    }

    // Show setup screen immediately — async Firebase check may override it
    showScreen('screen-setup');
    el('location-count').textContent = locations.length;
    wireInvite();

    if (firebaseReady && typeof FirebaseDB !== 'undefined') {
      const gId = (() => { try { return JSON.parse(atob(location.hash.slice(1))).gameId; } catch { return null; } })();
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
          // if exists — setup screen is already showing, nothing to do
        });
      }
    }
  }

  /* â”€â”€ Invite button wiring â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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
        setTimeout(() => { inviteCopy.textContent = 'ðŸ“‹ Copy Link'; }, 2000);
      });
    });
    inviteShare.addEventListener('click', () => {
      if (navigator.share) {
        navigator.share({ title: 'Join my GPS Hunt!', url: inviteUrl.value }).catch(() => {});
      } else {
        navigator.clipboard.writeText(inviteUrl.value).then(() => {
          inviteShare.textContent = 'Copied!';
          setTimeout(() => { inviteShare.textContent = 'ðŸ”— Share'; }, 2000);
        });
      }
    });
  }

  return { init, goTo };
})();

document.addEventListener('DOMContentLoaded', Game.init);
