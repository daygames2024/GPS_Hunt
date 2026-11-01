/* ── GPS Hunt — Game Logic ──────────────────────────────── */

const el = id => document.getElementById(id);
let teamName, currentIdx, watchId;

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const s = el(id);
  if (s) s.classList.add('active');
}

function init() {
  const hasGame = loadFromHash();
  // Additional initialization logic...
}

function bearing(lat1, lng1, lat2, lng2) {
  const dLon = toRad(lng2 - lng1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
          Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  let brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
}

function tempTier(dist) {
  if (dist < 50) return 'burning';
  if (dist < 100) return 'hot';
  if (dist < 200) return 'warm';
  if (dist < 400) return 'cool';
  if (dist < 800) return 'cold';
  return 'freezing';
}

function fmtDist(m) {
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${Math.round(m)} m`;
}

function updateLocation(pos) {
  const { latitude, longitude } = pos.coords;
  const waypoint = GPS_HUNT_CONFIG.waypoints[currentIdx];
  if (!waypoint) {
    console.error('Waypoint not found for index:', currentIdx);
    return;
  }
  const dist = distance(latitude, longitude, waypoint.lat, waypoint.lng);
  const brng = bearing(latitude, longitude, waypoint.lat, waypoint.lng);

  el('distance').textContent = fmtDist(dist);
  el('temperature').textContent = tempTier(dist);
  el('compass-needle').style.transform = `rotate(${brng}deg)`;
}

function distance(lat1, lng1, lat2, lng2) {
  const R = 6371e3; // metres
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lng2 - lng1);

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function toRad(value) {
  return value * Math.PI / 180;
}

function toDeg(value) {
  return value * 180 / Math.PI;
}

// Additional functions and event listeners...
