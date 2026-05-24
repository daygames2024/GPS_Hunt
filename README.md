# 🗺️ GPS Hunt

A fully client-side GPS scavenger hunt game hosted on **GitHub Pages**. No server, no database — everything runs in the browser.

---

## How It Works

| Role | Page |
|------|------|
| **Hunt Master** | `admin.html` — build the route, generate a shareable link/QR |
| **Teams** | `index.html#<data>` — follow Hot/Cold to each location, claim it first |

Game data (coordinates + clues) is base64-encoded into the URL `#hash`. Each team gets the same link; there is no persistent server state — teams screenshot their claim screens as proof of being first.

---

## Deploy to GitHub Pages

1. Fork or push this repo to GitHub.
2. Go to **Settings → Pages → Source → Deploy from branch** → select `main` / `root`.
3. Wait ~1 min; your site is live at `https://<your-username>.github.io/<repo-name>/`.
4. Open `admin.html` on your phone or PC to build a hunt.

---

## Hunt Master Setup (`admin.html`)

1. **Add Locations** — enter a name, lat/lng coordinates, and an optional cryptic clue.
   - Tap **📡 Use My GPS** to fill coordinates from your current position (great for setting up locations on-site).
2. **Reorder** with ↑ / ↓ arrows; **remove** with ✕.
3. Tap **🔗 Generate Team Link & QR Code**.
4. Share the link or QR with all teams — they all start at the same time.

> **Tip:** Use Google Maps → long-press a point → copy coordinates.

---

## Playing (`index.html`)

1. Open the team link (or scan QR).
2. Enter your **Team Name** and tap **🚀 Start Hunt!**
3. Grant GPS permission when prompted.
4. The **Hot/Cold ring** shows proximity:

| Ring colour | Distance |
|-------------|----------|
| 🥶 FREEZING (blue) | > 500 m |
| ❄️ COLD (light blue) | 200 – 500 m |
| 🌬️ COOL (cyan) | 100 – 200 m |
| 🌡️ WARM (amber) | 40 – 100 m |
| 🔥 HOT (red) | 15 – 40 m |
| 🔥🔥 BURNING!! (pulsing) | < 15 m |

5. The **arrow** points toward the target (compass-aware on supported devices).
6. When **BURNING!!** the **📍 CLAIM THIS LOCATION!** button appears — tap it to claim!
7. Screenshot the claim screen — that's your timestamp proof.
8. Continue to the next location until the hunt is complete.

---

## Scoring

- First team to claim each location wins that location.
- Hunt Master reconciles screenshots at the end.
- All teams see a **Results** screen when they complete the route.

---

## Browser Requirements

- Modern mobile browser (Chrome / Safari iOS 16+)
- GPS / Location permission granted
- Screen kept on (prevent auto-lock in device settings)

---

## File Structure

```
index.html   — Player game UI
admin.html   — Hunt Master setup
style.css    — Shared dark theme + temperature animations
game.js      — GPS, Hot/Cold engine, compass, claim logic
admin.js     — Location builder, URL encoder, QR generator
README.md    — This file
```

---

## Privacy

No data leaves the browser. Coordinates live only in the URL. No tracking, no analytics, no backend.
