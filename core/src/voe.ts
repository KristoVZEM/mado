import { FuenteCambio } from './errors.ts';

// Marcadores que Voe intercala en la cadena ofuscada (observados el 2026-11-05 y el 2026-11-07).
const MARCADORES = ['@$', '^^', '~@', '%?', '*~', '!!', '#&'];

function rot13(texto: string): string {
  return texto.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

/**
 * Deshace la ofuscación de Voe: ROT13, quitar marcadores, base64, restar 3 al código de cada
 * carácter, invertir, base64 y JSON. Voe cambia esta receta cada tanto: si falla, la fuente cambió.
 */
export function desofuscarVoe(texto: string): unknown {
  try {
    let s = rot13(texto);
    for (const marcador of MARCADORES) s = s.split(marcador).join('');
    const intermedio = [...atob(s)]
      .map((c) => String.fromCharCode(c.charCodeAt(0) - 3))
      .reverse()
      .join('');
    const bytes = Uint8Array.from(atob(intermedio), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (e) {
    throw new FuenteCambio('voe: la receta de desofuscación ya no sirve', { cause: e });
  }
}

/** La cadena ofuscada vive en `<script type="application/json">["…"]</script>`. */
export function extraerOfuscado(html: string): string {
  const m = html.match(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new FuenteCambio('voe: la página no trae el bloque JSON');
  let datos: unknown;
  try {
    datos = JSON.parse(m[1]);
  } catch {
    throw new FuenteCambio('voe: el bloque JSON no es JSON válido');
  }
  if (!Array.isArray(datos) || typeof datos[0] !== 'string') {
    throw new FuenteCambio('voe: el bloque JSON no es una lista con la cadena ofuscada');
  }
  return datos[0];
}

/** `voe.sx/e/<id>` redirige por JavaScript a un dominio que rota; solo se acepta https. */
export function extraerRedireccion(html: string): string {
  const m = html.match(/window\.location\.href\s*=\s*'(https:\/\/[^']+)'/);
  if (!m) throw new FuenteCambio('voe: la página de redirección no trae un destino https');
  return m[1];
}
