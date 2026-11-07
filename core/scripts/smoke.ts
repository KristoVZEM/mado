// Prueba manual contra animeav1 (necesita red sin bloqueo; el 2026-11-07 hizo falta VPN).
// Uso: cd core && npm run smoke -- "one piece" 1 SUB
import { crearFuentes, SinRed, Desafio } from '../src/index.ts';

const [query = 'one piece', ep = '1', idioma = 'SUB'] = process.argv.slice(2);
const fuentes = crearFuentes();

try {
  const hits = await fuentes.buscar(query);
  console.log(`búsqueda "${query}": ${hits.length} resultados; primero: ${hits[0]?.title} (${hits[0]?.slug})`);
  const ficha = await fuentes.episodios(hits[0].slug);
  console.log(`ficha: ${ficha.title}, ${ficha.episodes.length} episodios`);
  const playable = await fuentes.resolver(hits[0].slug, Number(ep), idioma as 'SUB' | 'DUB');
  console.log('playable:', JSON.stringify(playable));
} catch (e) {
  if (e instanceof SinRed) console.error('SIN RED (¿bloqueo de Cloudflare? probar con VPN):', e.message);
  else if (e instanceof Desafio) console.error('DESAFÍO de Cloudflare:', e.message);
  else console.error(`${(e as Error).name}:`, (e as Error).message);
  process.exitCode = 1;
}
