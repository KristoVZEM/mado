// Réplica de Unpacker.listenResources de Ukiku: vigilar las peticiones de la página
// y quedarse con la primera URL de stream. Se comunica con Rust por document.title.
(() => {
  if (window.__captureInstalled) return;
  window.__captureInstalled = true;
  const re = /master\.m3u8|video\.mp4|^https:\/\/\d+\.\d+\.\d+\.\d+.*mp4/;
  let found = null;
  const hit = (u) => {
    if (found || typeof u !== 'string' || !re.test(u)) return;
    found = u;
    document.title = '__CAPTURE__' + u;
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
    // UPNShare: Ukiku pulsa el botón de descarga (con &dl=1) para provocar la petición.
    if (location.hostname.endsWith('uns.bio')) {
      const b = document.getElementsByClassName('downloader-button')[0];
      if (b) b.click();
    }
    if (found) document.title = '__CAPTURE__' + found;
  }, 200);
})();
