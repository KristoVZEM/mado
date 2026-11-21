// Las notas de una actualización salen de `latest.json`, que la firma del instalador NO cubre: son texto no fiable.
// Aquí se limpian y se parten en bloques de texto plano (títulos, viñetas, párrafos con negritas). Nada de HTML ni de
// enlaces: lo que se pinte sale siempre como texto, nunca como marcado.

/** Tope de caracteres que se enseñan; el resto se corta con unos puntos suspensivos. */
export const MAX_NOTAS = 4000;

export interface Parte {
  texto: string;
  negrita: boolean;
}

export type Bloque =
  | { tipo: 'titulo'; texto: string }
  | { tipo: 'item'; partes: Parte[] }
  | { tipo: 'parrafo'; partes: Parte[] };

/** Las notas limpias y recortadas, o `null` si no hay nada que enseñar o no son texto. */
export function notasSeguras(cuerpo: unknown): string | null {
  if (typeof cuerpo !== 'string') return null;
  let t = cuerpo
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    // Fuera los caracteres de control (menos el salto de línea) y el DEL.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
    .trim();
  if (t === '') return null;
  if (t.length > MAX_NOTAS) {
    let corte = t.slice(0, MAX_NOTAS);
    const salto = corte.lastIndexOf('\n');
    // Mejor cortar en una línea entera, salvo que eso tire la mitad del texto.
    if (salto > MAX_NOTAS / 2) corte = corte.slice(0, salto);
    t = `${corte.trimEnd()}…`;
  }
  return t;
}

/** Quita el marcado de un trozo de texto: enlaces (queda su texto), código y cursivas. La negrita se trata aparte. */
function sinMarcado(t: string): string {
  return t
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(?<![\w*])\*([^*\n]+)\*(?![\w*])/g, '$1')
    .replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '$1');
}

function partesDe(texto: string): Parte[] {
  const partes: Parte[] = [];
  const negrita = /\*\*(.+?)\*\*/g;
  let ultimo = 0;
  for (let m = negrita.exec(texto); m !== null; m = negrita.exec(texto)) {
    if (m.index > ultimo) partes.push({ texto: sinMarcado(texto.slice(ultimo, m.index)), negrita: false });
    partes.push({ texto: sinMarcado(m[1]), negrita: true });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) partes.push({ texto: sinMarcado(texto.slice(ultimo)), negrita: false });
  return partes.filter((p) => p.texto !== '');
}

const TITULO = /^#{1,6}\s+(.+?)\s*#*\s*$/;
const VINETA = /^[-*+]\s+(.*)$/;

/**
 * Parte las notas en bloques. Una viñeta o un párrafo sigue en las líneas de debajo hasta una línea en blanco, otra
 * viñeta o un título: el CHANGELOG se escribe con las líneas partidas a mano.
 */
export function bloquesDeNotas(notas: string): Bloque[] {
  const bloques: Array<{ tipo: 'titulo'; texto: string } | { tipo: 'item' | 'parrafo'; lineas: string[] }> = [];
  let actual: { tipo: 'item' | 'parrafo'; lineas: string[] } | null = null;
  for (const cruda of notas.split('\n')) {
    const linea = cruda.trim();
    if (linea === '') {
      actual = null;
      continue;
    }
    const titulo = TITULO.exec(linea);
    if (titulo) {
      bloques.push({ tipo: 'titulo', texto: partesDe(titulo[1]).map((p) => p.texto).join('') });
      actual = null;
      continue;
    }
    const vineta = VINETA.exec(linea);
    if (vineta) {
      actual = { tipo: 'item', lineas: [vineta[1]] };
      bloques.push(actual);
      continue;
    }
    if (actual) {
      actual.lineas.push(linea);
    } else {
      actual = { tipo: 'parrafo', lineas: [linea] };
      bloques.push(actual);
    }
  }
  return bloques.map((b): Bloque => (b.tipo === 'titulo' ? b : { tipo: b.tipo, partes: partesDe(b.lineas.join(' ')) }));
}
