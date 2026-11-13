// Réplica de Unpacker.listenResources de Ukiku: vigilar las peticiones de la página y avisar a Rust de cada
// URL que parezca un stream. Se comunica por document.title. Quien decide es Rust (`resolver.rs`): aquí no
// se descarta nada por ser «la segunda», porque la primera coincidencia puede ser una que Rust rechace.
(() => {
  if (window.__captureInstalled) return;
  window.__captureInstalled = true;
  const PREFIJO = '__CAPTURE__';
  const TOPE = 20;
  const re = /master\.m3u8|video\.mp4|^https:\/\/\d+\.\d+\.\d+\.\d+.*mp4/;
  const candidatas = [];
  let turno = 0;
  const hit = (u) => {
    if (typeof u !== 'string' || !re.test(u) || candidatas.includes(u) || candidatas.length >= TOPE) return;
    candidatas.push(u);
    document.title = PREFIJO + u;
  };

  const of = window.fetch;
  window.fetch = function (a, ...r) {
    hit(typeof a === 'string' ? a : a && a.url);
    return of.call(this, a, ...r);
  };
  const ox = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u, ...r) {
    hit(String(u));
    return ox.call(this, m, u, ...r);
  };
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => hit(e.name))).observe({
      type: 'resource',
      buffered: true,
    });
  } catch (_) {}

  setInterval(() => {
    document.querySelectorAll('video,source').forEach((v) => hit(v.currentSrc || v.src));
    // La página puede pisar el título: se repiten las candidatas por turnos hasta que Rust acepte una.
    if (candidatas.length > 0) document.title = PREFIJO + candidatas[turno++ % candidatas.length];
  }, 200);
})();
