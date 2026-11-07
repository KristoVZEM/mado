// Prueba manual de Voe contra el sitio real (necesita red sin bloqueo; el 2026-11-07 hizo falta VPN).
// Uso: cd core && npm run smoke:voe -- one-piece 1 SUB
// La URL del stream lleva un token firmado y atado a la IP: no se imprime.
import { createHttp } from '../src/http.ts';
import { episodio } from '../src/episodio.ts';
import { crearResolverVoe } from '../src/resolver-voe.ts';

const [slug = 'one-piece', ep = '1', idioma = 'SUB'] = process.argv.slice(2);
const http = createHttp();

try {
  const detalle = await episodio(http, slug, Number(ep));
  const embed = (detalle.embeds[idioma] ?? []).find((e) => e.server === 'Voe');
  if (!embed) throw new Error(`el episodio no trae Voe en ${idioma}`);
  const p = await crearResolverVoe(http)(embed, http.userAgent);
  if (!p) throw new Error('el embed de Voe no se reconoció');
  const u = new URL(p.url);
  console.log(`voe: ok; host ${u.hostname}; ruta ${u.pathname}; calidad ${p.calidad ?? 'desconocida'}`);
} catch (e) {
  console.error(`${(e as Error).name}:`, (e as Error).message);
  process.exitCode = 1;
}
