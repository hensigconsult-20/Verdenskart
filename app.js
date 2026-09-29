/* Verdenskart – et barnevennlig verdenskart
   Satellittbilder og veinavn fra MapTiler, landegrenser fra Natural Earth (world-atlas),
   flagg fra flag-icons. Ingen butikker, reklame eller lenker ut. */
(() => {
  "use strict";

  const KEY = (window.MAPTILER_KEY || "").trim();
  const FLAG_URL = "https://cdn.jsdelivr.net/npm/flag-icons@7/flags/4x3/";
  const BORDERS_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json";
  const RTL_URL = "https://cdn.jsdelivr.net/npm/@mapbox/mapbox-gl-rtl-text@0.3.0/dist/mapbox-gl-rtl-text.js";
  const START = { center: [12, 40], zoom: 1.7, pitch: 0, bearing: 0 };

  const $ = (id) => document.getElementById(id);
  const showMessage = (html) => { const m = $("message"); m.innerHTML = html; m.hidden = false; $("loading").classList.add("done"); };

  if (!KEY || KEY.startsWith("LIM_INN")) {
    showMessage("🗺️<br><b>Nesten klart!</b><br>Åpne filen <code>config.js</code> og lim inn MapTiler-nøkkelen din.");
    return;
  }
  if (!window.maplibregl) { showMessage("Kunne ikke laste kartet. Sjekk internett og prøv igjen."); return; }

  try { maplibregl.setRTLTextPlugin(RTL_URL, true); } catch (e) { /* ikke kritisk */ }

  // ---------- Kartet ----------
  const map = new maplibregl.Map({
    container: "map",
    style: `https://api.maptiler.com/maps/hybrid/style.json?key=${encodeURIComponent(KEY)}`,
    center: START.center, zoom: START.zoom,
    maxPitch: 75,
    attributionControl: { compact: true },
    localIdeographFontFamily: "'Hiragino Sans','PingFang SC','Apple SD Gothic Neo','Noto Sans CJK',sans-serif",
    fadeDuration: 150,
  });

  map.on("error", (e) => {
    const status = e && e.error && e.error.status;
    if (status === 401 || status === 403) {
      showMessage("🔑 MapTiler-nøkkelen ble ikke godtatt.<br>Sjekk nøkkelen i <code>config.js</code> og at nettadressen er tillatt i MapTiler.");
    }
    console.warn("Kartfeil:", e && e.error ? e.error.message || e.error : e);
  });

  let firstSymbolId;
  map.on("style.load", () => {
    try { map.setProjection({ type: "globe" }); } catch (e) { console.warn(e); }
    try {
      map.setSky({
        "sky-color": "#0b1a3a", "horizon-color": "#7fb2ff", "fog-color": "#ffffff",
        "sky-horizon-blend": 0.5, "horizon-fog-blend": 0.5, "fog-ground-blend": 0.5,
        "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0],
      });
    } catch (e) { /* eldre versjon */ }
    cleanStyle();
    addNight();
    loadCountries();
  });
  map.once("idle", () => $("loading").classList.add("done"));
  setTimeout(() => $("loading").classList.add("done"), 12000);

  // Fjern butikker/steder, bruk norske navn, skjul innebygde landnavn (vi lager egne)
  function cleanStyle() {
    const norsk = ["coalesce", ["get", "name:nb"], ["get", "name:no"], ["get", "name"]];
    for (const layer of map.getStyle().layers) {
      if (layer.type === "symbol" && !firstSymbolId) firstSymbolId = layer.id;
      const sl = layer["source-layer"];
      if (["poi", "aerodrome_label", "housenumber"].includes(sl)) {
        map.setLayoutProperty(layer.id, "visibility", "none");
        continue;
      }
      if (sl === "place" && JSON.stringify(layer.filter || "").includes("country")) {
        map.setLayoutProperty(layer.id, "visibility", "none");
        continue;
      }
      if (layer.type === "symbol" && (sl === "place" || sl === "water_name") && layer.layout && layer.layout["text-field"]) {
        map.setLayoutProperty(layer.id, "text-field", norsk);
      }
    }
  }

  // ---------- Dag og natt ----------
  const NIGHT_STEPS = [2, 0, -2, -4, -6, -9, -12, -18]; // solhøyde i grader → mykt skumringsbelte
  const rad = Math.PI / 180, deg = 180 / Math.PI;

  function sunPosition(date) {
    const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
    const g = (357.529 + 0.98560028 * d) * rad;
    const q = 280.459 + 0.98564736 * d;
    const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad;
    const e = (23.439 - 0.00000036 * d) * rad;
    const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) * deg; // grader
    const dec = Math.asin(Math.sin(e) * Math.sin(L)) * deg;
    const gmst = (18.697374558 + 24.06570982441908 * d) * 15; // grader
    let lon = ra - gmst;
    lon = ((lon + 540) % 360) - 180;
    return { lat: dec, lon };
  }

  // Området der sola står lavere enn h grader: en sirkel rundt punktet midt på natta
  function nightCap(sun, h) {
    const cLat = -sun.lat * rad, cLon = sun.lon + 180;
    const r = (90 + h) * rad;
    const ring = [];
    let prev = null, offset = 0;
    for (let i = 0; i <= 360; i += 2) {
      const b = i * rad;
      const lat = Math.asin(Math.sin(cLat) * Math.cos(r) + Math.cos(cLat) * Math.sin(r) * Math.cos(b));
      let lon = cLon + Math.atan2(Math.sin(b) * Math.sin(r) * Math.cos(cLat), Math.cos(r) - Math.sin(cLat) * Math.sin(lat)) * deg;
      if (prev !== null) {
        while (lon + offset - prev > 180) offset -= 360;
        while (lon + offset - prev < -180) offset += 360;
      }
      lon += offset;
      prev = lon;
      ring.push([lon, lat * deg]);
    }
    // Skift slik at ringen starter nær kartets midte
    const shift = Math.round(ring[0][0] / 360) * 360;
    for (const p of ring) p[0] -= shift;
    const span = ring[ring.length - 1][0] - ring[0][0];
    if (Math.abs(span) > 180) {
      // Sirkelen omslutter en pol – lukk polygonet via polen
      const poleLat = cLat > 0 ? 90 : -90;
      ring.push([ring[ring.length - 1][0], poleLat], [ring[0][0], poleLat], ring[0].slice());
    } else {
      ring[ring.length - 1] = ring[0].slice();
    }
    return ring;
  }

  function nightData() {
    const sun = sunPosition(new Date());
    return {
      type: "FeatureCollection",
      features: NIGHT_STEPS.map((h) => ({ type: "Feature", properties: { h }, geometry: { type: "Polygon", coordinates: [nightCap(sun, h)] } })),
    };
  }

  let nightOn = true;
  function addNight() {
    if (map.getSource("night")) return;
    map.addSource("night", { type: "geojson", data: nightData(), tolerance: 0.6 });
    NIGHT_STEPS.forEach((h, i) => {
      map.addLayer({
        id: "night-" + i, type: "fill", source: "night",
        filter: ["==", ["get", "h"], h],
        layout: { visibility: nightOn ? "visible" : "none" },
        paint: { "fill-color": "#000820", "fill-opacity": 0.085, "fill-antialias": false },
      }, firstSymbolId);
    });
  }
  setInterval(() => { const s = map.getSource("night"); if (s) s.setData(nightData()); }, 20000);

  $("btn-night").addEventListener("click", () => {
    nightOn = !nightOn;
    NIGHT_STEPS.forEach((_, i) => map.getLayer("night-" + i) && map.setLayoutProperty("night-" + i, "visibility", nightOn ? "visible" : "none"));
    $("btn-night").classList.toggle("on", nightOn);
    $("btn-night").setAttribute("aria-pressed", nightOn);
  });

  $("btn-home").addEventListener("click", () => {
    map.flyTo({ ...START, center: [map.getCenter().lng, 25], speed: 1.2 });
  });

  // ---------- Land: grenser, navn og flagg ----------
  const mercX = (lon) => (lon + 180) / 360;
  const mercY = (lat) => {
    const l = Math.max(-85.0511, Math.min(85.0511, lat)) * rad;
    return (1 - Math.log(Math.tan(Math.PI / 4 + l / 2)) / Math.PI) / 2;
  };
  const unMercLon = (x) => x * 360 - 180;
  const unMercLat = (y) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * deg;

  let countries = []; // { code, groups: [{ polys, bbox, flag:{x,y,w,h} }] }

  async function loadCountries() {
    if (countries.length) { addCountryLayers(); return; }
    let topo;
    try { topo = await (await fetch(BORDERS_URL)).json(); }
    catch (e) { console.warn("Fikk ikke hentet landegrenser", e); return; }
    const fc = topojson.feature(topo, topo.objects.countries);
    const labels = [];
    for (const f of fc.features) {
      const info = window.COUNTRY_NAMES[f.id] || window.COUNTRY_NAMES[f.properties && f.properties.name];
      if (!info || !f.geometry) continue;
      const [code, nb, local] = info;
      if (code === "AQ") continue;
      const polysLL = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      const polys = polysLL.map((poly) => {
        const rings = poly.map((ring) => {
          const a = new Float64Array(ring.length * 2);
          ring.forEach(([lon, lat], i) => { a[i * 2] = mercX(lon); a[i * 2 + 1] = mercY(lat); });
          return a;
        });
        const bbox = ringBBox(rings[0]);
        // Ekte areal: Mercator-areal korrigert for breddegrad (ellers blir Svalbard "større" enn fastlandet)
        const k = Math.cos(unMercLat((bbox[1] + bbox[3]) / 2) * rad);
        return { rings, bbox, area: Math.abs(ringArea(rings[0])) * k * k };
      });
      const groups = groupPolygons(polys);
      countries.push({ code, groups });
      const biggest = polys.reduce((a, b) => (b.area > a.area ? b : a));
      const [px, py] = polylabel(biggest.rings);
      const totalArea = polys.reduce((s, p) => s + p.area, 0);
      labels.push({
        type: "Feature",
        properties: { code, nb, local, rank: -totalArea, img: "lbl-" + code },
        geometry: { type: "Point", coordinates: [unMercLon(px), unMercLat(py)] },
      });
    }
    countryLabels = { type: "FeatureCollection", features: labels };
    addCountryLayers();
  }

  let countryLabels = null;
  const capitalsData = {
    type: "FeatureCollection",
    features: Object.entries(window.CAPITALS).map(([code, [name, lat, lon]]) => ({
      type: "Feature", properties: { code, name, img: "cap-" + code }, geometry: { type: "Point", coordinates: [lon, lat] },
    })),
  };

  function addCountryLayers() {
    if (!countryLabels || map.getSource("country-labels")) return;
    map.addSource("country-labels", { type: "geojson", data: countryLabels });
    map.addLayer({
      id: "country-labels", type: "symbol", source: "country-labels", maxzoom: 9,
      layout: {
        "icon-image": ["get", "img"],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 1, 0.55, 3, 0.8, 5, 1, 8, 1.15],
        "symbol-sort-key": ["get", "rank"],
        "icon-padding": 4,
      },
    });
    map.addSource("capitals", { type: "geojson", data: capitalsData });
    map.addLayer({
      id: "capital-glow", type: "circle", source: "capitals", maxzoom: 11,
      layout: { visibility: flagsOn ? "visible" : "none" },
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 7, 5, 14, 10, 20],
        "circle-color": "#ffd23f", "circle-blur": 0.9, "circle-opacity": 0.9,
      },
    });
    map.addLayer({
      id: "capital-dot", type: "circle", source: "capitals", maxzoom: 11,
      layout: { visibility: flagsOn ? "visible" : "none" },
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 2.5, 5, 5, 10, 7],
        "circle-color": "#ffd23f", "circle-stroke-color": "#7a2b00", "circle-stroke-width": 1.5,
      },
    });
    map.addLayer({
      id: "capital-labels", type: "symbol", source: "capitals", minzoom: 2.5, maxzoom: 11,
      layout: {
        visibility: flagsOn ? "visible" : "none",
        "icon-image": ["get", "img"], "icon-anchor": "left", "icon-offset": [14, 0],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 2.5, 0.7, 6, 1],
        "icon-padding": 2,
      },
    });
  }

  // Tegn navneskilt som bilder, slik at alle skriftsystemer (日本, ไทย, भारत …) vises riktig
  map.on("styleimagemissing", (e) => {
    const id = e.id;
    if (id.startsWith("lbl-")) {
      const f = countryLabels && countryLabels.features.find((x) => x.properties.img === id);
      if (f) addTextImage(id, f.properties.nb, f.properties.local, "#ffffff");
    } else if (id.startsWith("cap-")) {
      const c = window.CAPITALS[id.slice(4)];
      if (c) addTextImage(id, "⭐ " + c[0], "", "#ffe27a");
    }
  });

  function addTextImage(id, line1, line2, color) {
    const R = 2; // skarpt på iPad-skjerm
    const f1 = `800 ${22 * R}px -apple-system, "Helvetica Neue", "Segoe UI", sans-serif`;
    const f2 = `600 ${16 * R}px -apple-system, "Helvetica Neue", "Segoe UI", "Noto Sans", sans-serif`;
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    ctx.font = f1; const w1 = ctx.measureText(line1).width;
    ctx.font = f2; const w2 = line2 ? ctx.measureText(line2).width : 0;
    const pad = 6 * R;
    c.width = Math.ceil(Math.max(w1, w2) + pad * 2);
    c.height = Math.ceil((line2 ? 48 : 30) * R + pad);
    ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.lineJoin = "round";
    const draw = (text, font, y, fill) => {
      ctx.font = font;
      ctx.lineWidth = 5 * R; ctx.strokeStyle = "rgba(0,0,0,0.75)";
      ctx.strokeText(text, c.width / 2, y);
      ctx.fillStyle = fill; ctx.fillText(text, c.width / 2, y);
    };
    draw(line1, f1, pad / 2 + 2 * R, color);
    if (line2) draw(line2, f2, pad / 2 + 28 * R, "#d9ecff");
    map.addImage(id, ctx.getImageData(0, 0, c.width, c.height), { pixelRatio: R });
  }

  // ---------- Flaggmodus ----------
  let flagsOn = false;
  $("btn-flags").addEventListener("click", () => {
    flagsOn = !flagsOn;
    $("btn-flags").classList.toggle("on", flagsOn);
    $("btn-flags").setAttribute("aria-pressed", flagsOn);
    if (flagsOn && !map.getSource("flags")) {
      map.addSource("flags", { type: "raster", tiles: ["flags://{z}/{x}/{y}"], tileSize: 256, maxzoom: 14 });
      map.addLayer({
        id: "flags", type: "raster", source: "flags",
        paint: { "raster-opacity": 0.88, "raster-fade-duration": 200 },
      }, map.getLayer("night-0") ? "night-0" : firstSymbolId);
    }
    const vis = flagsOn ? "visible" : "none";
    for (const id of ["flags", "capital-glow", "capital-dot", "capital-labels"]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
    }
  });

  // Flaggbilder: hentes ved behov, tegnes som vektor slik at de er skarpe på alle zoomnivåer
  const flagCache = new Map();
  function getFlag(code) {
    const key = code.toLowerCase();
    if (!flagCache.has(key)) {
      flagCache.set(key, (async () => {
        const res = await fetch(FLAG_URL + key + ".svg");
        if (!res.ok) throw new Error("flagg mangler: " + key);
        const text = await res.text();
        const tag = text.match(/<svg\b[^>]*>/)[0];
        const vb = (tag.match(/viewBox="([^"]+)"/) || [, "0 0 640 480"])[1].trim().split(/[\s,]+/).map(Number);
        const cleanTag = tag.replace(/\s(width|height|viewBox|preserveAspectRatio)="[^"]*"/g, "");
        const flag = { text, tag, cleanTag, vb, small: null };
        flag.small = await svgToImage(flag, vb, 320, 240);
        return flag;
      })());
    }
    return flagCache.get(key);
  }

  function svgToImage(flag, [vx, vy, vw, vh], w, h) {
    const tag = flag.cleanTag.replace(/>$/, ` width="${w}" height="${h}" viewBox="${vx} ${vy} ${vw} ${vh}" preserveAspectRatio="none">`);
    const svg = flag.text.replace(flag.tag, tag);
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const img = new Image();
    img.width = w; img.height = h;
    return new Promise((resolve, reject) => {
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }

  const TILE = 512;
  let emptyTile = null;
  const canvasToBuffer = (c) => new Promise((resolve) => c.toBlob((b) => b.arrayBuffer().then(resolve), "image/png"));

  maplibregl.addProtocol("flags", async (params) => {
    const [z, x, y] = params.url.replace("flags://", "").split("/").map(Number);
    const n = 2 ** z, scale = n * TILE, ox = x / n, oy = y / n, size = 1 / n;
    const hits = [];
    for (const c of countries) {
      for (const g of c.groups) {
        const b = g.bbox;
        if (b[2] < ox || b[0] > ox + size || b[3] < oy || b[1] > oy + size) continue;
        hits.push({ code: c.code, g });
      }
    }
    if (!hits.length) {
      if (!emptyTile) { const c = document.createElement("canvas"); c.width = c.height = 1; emptyTile = await canvasToBuffer(c); }
      return { data: emptyTile.slice(0) };
    }
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = TILE;
    const ctx = canvas.getContext("2d");
    const flags = await Promise.all(hits.map((h) => getFlag(h.code).catch(() => null)));
    const tx = (mx) => (mx - ox) * scale, ty = (my) => (my - oy) * scale;

    for (let i = 0; i < hits.length; i++) {
      const { g } = hits[i], flag = flags[i];
      const path = new Path2D();
      for (const p of g.polys) for (const r of p.rings) addRing(path, r, tx, ty);
      const fx = tx(g.flag.x), fy = ty(g.flag.y), fw = g.flag.w * scale, fh = g.flag.h * scale;
      ctx.save();
      ctx.clip(path, "evenodd");
      if (!flag) {
        ctx.fillStyle = "#e8e8e8"; ctx.fillRect(0, 0, TILE, TILE);
      } else if (fw <= 480) {
        ctx.drawImage(flag.small, fx, fy, fw, fh);
      } else {
        // Zoomet inn: tegn akkurat den biten av flagget som vises, i full skarphet
        const ix0 = Math.max(0, fx), iy0 = Math.max(0, fy);
        const ix1 = Math.min(TILE, fx + fw), iy1 = Math.min(TILE, fy + fh);
        if (ix1 > ix0 && iy1 > iy0) {
          const [vx, vy, vw, vh] = flag.vb;
          const box = [vx + (ix0 - fx) / fw * vw, vy + (iy0 - fy) / fh * vh, (ix1 - ix0) / fw * vw, (iy1 - iy0) / fh * vh];
          try {
            const img = await svgToImage(flag, box, Math.ceil(ix1 - ix0), Math.ceil(iy1 - iy0));
            ctx.drawImage(img, ix0, iy0, ix1 - ix0, iy1 - iy0);
          } catch (e) { ctx.drawImage(flag.small, fx, fy, fw, fh); }
        }
      }
      ctx.restore();
      ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineJoin = "round";
      ctx.stroke(path);
    }
    return { data: await canvasToBuffer(canvas) };
  });

  function addRing(path, r, tx, ty) {
    let lx = tx(r[0]), ly = ty(r[1]);
    path.moveTo(lx, ly);
    const last = r.length - 2;
    for (let i = 2; i < r.length; i += 2) {
      const X = tx(r[i]), Y = ty(r[i + 1]);
      if (i !== last && Math.abs(X - lx) < 0.7 && Math.abs(Y - ly) < 0.7) continue;
      path.lineTo(X, Y); lx = X; ly = Y;
    }
    path.closePath();
  }

  // ---------- Geometri-hjelpere ----------
  function ringBBox(r) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < r.length; i += 2) {
      if (r[i] < x0) x0 = r[i]; if (r[i] > x1) x1 = r[i];
      if (r[i + 1] < y0) y0 = r[i + 1]; if (r[i + 1] > y1) y1 = r[i + 1];
    }
    return [x0, y0, x1, y1];
  }
  function ringArea(r) {
    let s = 0;
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) s += (r[j] - r[i]) * (r[i + 1] + r[j + 1]);
    return s / 2;
  }

  // Øyer nær hverandre deler ett flagg; fjerne deler (f.eks. Svalbard, Alaska) får sitt eget
  function groupPolygons(polys) {
    let groups = polys.map((p) => ({ polys: [p], bbox: p.bbox.slice() }));
    const grow = (b) => {
      const m = Math.max(b[2] - b[0], b[3] - b[1]) * 0.15 + 0.001;
      return [b[0] - m, b[1] - m, b[2] + m, b[3] + m];
    };
    let merged = true;
    while (merged) {
      merged = false;
      outer: for (let i = 0; i < groups.length; i++) {
        for (let j = i + 1; j < groups.length; j++) {
          const a = grow(groups[i].bbox), b = grow(groups[j].bbox);
          if (a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]) {
            const A = groups[i], B = groups[j];
            A.polys.push(...B.polys);
            A.bbox = [Math.min(A.bbox[0], B.bbox[0]), Math.min(A.bbox[1], B.bbox[1]), Math.max(A.bbox[2], B.bbox[2]), Math.max(A.bbox[3], B.bbox[3])];
            groups.splice(j, 1);
            merged = true;
            break outer;
          }
        }
      }
    }
    for (const g of groups) {
      const [x0, y0, x1, y1] = g.bbox, w = x1 - x0, h = y1 - y0;
      // Flagget dekker hele området (4:3), sentrert
      const fw = Math.max(w, h * 4 / 3), fh = fw * 3 / 4;
      g.flag = { x: x0 + (w - fw) / 2, y: y0 + (h - fh) / 2, w: fw, h: fh };
    }
    return groups;
  }

  // Finn et godt punkt inni et land til navnet (forenklet "polylabel")
  function polylabel(rings) {
    const outer = rings[0];
    const [x0, y0, x1, y1] = ringBBox(outer);
    const cell = Math.min(x1 - x0, y1 - y0);
    if (cell === 0) return [x0, y0];
    const dist = (x, y) => {
      let inside = false, minD = Infinity;
      for (const r of rings) {
        for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
          const ax = r[i], ay = r[i + 1], bx = r[j], by = r[j + 1];
          if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
          let dx = bx - ax, dy = by - ay, t = 0;
          if (dx || dy) t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
          const ex = ax + t * dx - x, ey = ay + t * dy - y;
          minD = Math.min(minD, ex * ex + ey * ey);
        }
      }
      return (inside ? 1 : -1) * Math.sqrt(minD);
    };
    let best = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
    best.d = dist(best.x, best.y);
    let h = cell / 2;
    let cells = [];
    for (let x = x0; x < x1; x += cell) for (let y = y0; y < y1; y += cell) cells.push({ x: x + h, y: y + h, h });
    const precision = Math.max(x1 - x0, y1 - y0) / 200;
    let iter = 0;
    while (cells.length && iter++ < 2000) {
      const next = [];
      for (const c of cells) {
        c.d = dist(c.x, c.y);
        if (c.d > best.d) best = c;
        if (c.d + c.h * Math.SQRT2 - best.d <= precision) continue;
        const hh = c.h / 2;
        next.push({ x: c.x - hh, y: c.y - hh, h: hh }, { x: c.x + hh, y: c.y - hh, h: hh }, { x: c.x - hh, y: c.y + hh, h: hh }, { x: c.x + hh, y: c.y + hh, h: hh });
      }
      next.sort((a, b) => b.h - a.h);
      cells = next.slice(0, 400);
    }
    return [best.x, best.y];
  }

  // Ingen høyreklikk-/langtrykksmenyer
  document.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("gesturestart", (e) => e.preventDefault());
})();
