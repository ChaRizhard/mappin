  /* =========================================================
     OPTIONAL OFFICIAL GOOGLE MAP (Google Maps Platform, Map Tiles API)
     ========================================================= */
  /* ---------- Optional: official Google map tiles (Google Maps Platform, Map Tiles API) ----------
     Add googleMapsKey to config.js to switch to the licensed map. Without a key nothing changes. */
  const GMP = { key: ((window.MAPPIN_CONFIG || {}).googleMapsKey || '').trim(), loading: {} };
  function gmpSessKey(type) { return `mappin_gmp_${type === 'sat' ? 'sat' : 'road'}_${LANG}_${TILE_SCALE}`; }
  function gmpTileUrl(type) {
    if (!GMP.key) return null;
    let s = null;
    try { s = JSON.parse(loadPref(gmpSessKey(type), 'null')); } catch (e) {}
    if (s && s.session && Number(s.expiry) * 1000 > Date.now() + 3600e3) {
      return `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${encodeURIComponent(s.session)}&key=${encodeURIComponent(GMP.key)}`;
    }
    gmpCreateSession(type);
    return null;
  }
  async function gmpCreateSession(type) {
    const k = gmpSessKey(type);
    if (GMP.loading[k] || !navigator.onLine) return;
    GMP.loading[k] = true;
    try {
      const sat = type === 'sat';
      const body = { mapType: sat ? 'satellite' : 'roadmap', language: LANG, region: 'US',
        scale: TILE_SCALE >= 4 ? 'scaleFactor4x' : TILE_SCALE >= 2 ? 'scaleFactor2x' : 'scaleFactor1x', highDpi: TILE_SCALE >= 2 };
      if (sat) body.layerTypes = ['layerRoadmap'];
      const r = await fetch(`https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(GMP.key)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      if (j.session) {
        savePref(k, JSON.stringify({ session: j.session, expiry: j.expiry }));
        if (map) switchTileLayer(currentTileType);
      }
    } catch (e) { /* keep the standard map */ }
    GMP.loading[k] = false;
  }
