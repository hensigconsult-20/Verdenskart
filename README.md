# Verdenskart 🌍

A child-friendly world map: a spinning 3D globe with satellite photos, road names and country names in Norwegian + each country's own language. No shops, ads or links out.

- **Flagg** button: every country is filled with its flag (sharp at any zoom), capitals get a gold star.
- **Dag og natt** button: live day/night shadow, updated every 20 seconds.
- **Hele jorda** button: flies back out to the whole globe.

## Setup (once)

1. **Key:** open `config.js` and paste your MapTiler key (https://cloud.maptiler.com/account/keys/).
2. **GitHub:** create a public repository named `verdenskart`, then *Add file → Upload files* and drag in everything from this folder (keep the `data` and `icons` folders).
3. **Pages:** in the repo, *Settings → Pages → Source: Deploy from a branch → main / (root) → Save*. After a minute the map is at `https://YOURNAME.github.io/verdenskart/`.
4. **Lock the key:** in MapTiler, open the key and under *Allowed HTTP origins* add `YOURNAME.github.io`. Then nobody else can use it.
5. **iPad:** open the link in Safari → Share → *Add to Home Screen*.

Tip: *Settings → Accessibility → Guided Access* keeps her inside the app.

## Credits
Map © MapTiler © OpenStreetMap contributors · Borders: Natural Earth · Flags: flag-icons (MIT) · Map engine: MapLibre GL JS.
