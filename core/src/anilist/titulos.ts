const SOBRAN = new Set(['temporada', 'season', 'tv', 'the']);

/** Parecido mínimo cuando todas las palabras del texto más corto aparecen en el más largo. */
export const PISO_CONTENIDO = 0.7;

/** Minúsculas, sin tildes ni signos, sin palabras de relleno («temporada», «season»). Conserva los números. */
export function normalizar(titulo: string): string {
  return titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t !== '' && !SOBRAN.has(t))
    .join(' ');
}

function bigramas(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const t = s.replace(/\s+/g, ' ');
  for (let i = 0; i < t.length - 1; i++) {
    const b = t.slice(i, i + 2);
    m.set(b, (m.get(b) ?? 0) + 1);
  }
  return m;
}

function contenido(a: string, b: string): boolean {
  const [corto, largo] = a.length <= b.length ? [a, b] : [b, a];
  if (corto.length < 5) return false;
  const palabras = new Set(largo.split(' '));
  return corto.split(' ').every((p) => palabras.has(p));
}

/** Coeficiente de Dice sobre bigramas de caracteres, de 0 a 1. Los textos ya van normalizados. */
export function parecido(a: string, b: string): number {
  if (a === '' || b === '') return 0;
  if (a === b) return 1;
  const piso = contenido(a, b) ? PISO_CONTENIDO : 0;
  const A = bigramas(a);
  const B = bigramas(b);
  let comunes = 0;
  for (const [k, n] of A) comunes += Math.min(n, B.get(k) ?? 0);
  const total = [...A.values()].reduce((x, y) => x + y, 0) + [...B.values()].reduce((x, y) => x + y, 0);
  return Math.max(piso, total === 0 ? 0 : (2 * comunes) / total);
}

/** Numerales romanos que valen como temporada. Sin `i`, `v` ni `x`: una sola letra se confunde con otras cosas. */
const ROMANOS: Record<string, number> = { ii: 2, iii: 3, iv: 4, vi: 6, vii: 7, viii: 8, ix: 9 };

/**
 * Número de temporada que lleva al final un título ya normalizado («… 2», «… 3rd», «… iii»), o `null` si no
 * lleva. Las cifras son 1 o 2 y siempre con texto delante: «Mob Psycho 100» o «86» no son temporadas.
 */
export function temporadaDe(normalizado: string): number | null {
  const m = /^.+ (?:(\d{1,2})(?:st|nd|rd|th)?|(ii|iii|iv|vi|vii|viii|ix))$/.exec(normalizado);
  if (!m) return null;
  return m[1] !== undefined ? Number(m[1]) : ROMANOS[m[2]];
}
