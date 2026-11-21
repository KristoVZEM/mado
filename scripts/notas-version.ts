// Saca del CHANGELOG.md las notas de la versión de una etiqueta, para que el flujo de publicación las ponga en el
// borrador de la release y en las `notes` de `latest.json` (que la app enseña al ofrecer la actualización).
//
// Uso (desde la raíz): node scripts/notas-version.ts vX.Y.Z[-sufijo]
// En Actions escribe la salida `cuerpo` en $GITHUB_OUTPUT. Falla si esa versión no tiene entrada: no se publica sin
// changelog.

import { randomBytes } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** `v0.14.0` y `v0.14.0-prueba` piden la versión 0.14.0, igual que la comprobación de tauri.conf.json del flujo. */
export function versionDeEtiqueta(etiqueta: string): string {
  return etiqueta.replace(/^v/, '').replace(/-.*$/, '');
}

/**
 * El texto de la sección `## X.Y.Z — fecha`, sin su título y hasta la siguiente `## `. `null` si no hay sección o está
 * vacía. Los títulos `### Nuevo` de dentro de la sección se conservan.
 */
export function notasDeVersion(changelog: string, version: string): string | null {
  const lineas = changelog.split(/\r?\n/);
  const titulo = /^## (\d+\.\d+\.\d+)(?:\s+—.*)?\s*$/;
  const inicio = lineas.findIndex((l) => titulo.exec(l)?.[1] === version);
  if (inicio === -1) return null;
  let fin = lineas.length;
  for (let i = inicio + 1; i < lineas.length; i++) {
    if (lineas[i].startsWith('## ')) {
      fin = i;
      break;
    }
  }
  const texto = lineas.slice(inicio + 1, fin).join('\n').trim();
  return texto === '' ? null : texto;
}

/**
 * Añade `nombre=valor` (con valor de varias líneas) al archivo de salidas de un paso de Actions. El delimitador es
 * aleatorio y se vuelve a sortear si apareciera en el texto: así el contenido nunca puede cerrar el bloque antes de tiempo.
 */
export function escribirSalida(archivo: string, nombre: string, valor: string): void {
  let delimitador = randomBytes(16).toString('hex');
  while (valor.includes(delimitador)) delimitador = randomBytes(16).toString('hex');
  appendFileSync(archivo, `${nombre}<<${delimitador}\n${valor}\n${delimitador}\n`);
}

function principal(): void {
  const etiqueta = process.argv[2];
  if (!etiqueta) {
    console.error('Falta la etiqueta: node scripts/notas-version.ts vX.Y.Z');
    process.exit(2);
  }
  const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const version = versionDeEtiqueta(etiqueta);
  const notas = notasDeVersion(readFileSync(join(raiz, 'CHANGELOG.md'), 'utf8'), version);
  if (notas === null) {
    console.error(`::error::CHANGELOG.md no tiene una entrada con texto para la versión ${version}: no se publica sin changelog.`);
    process.exit(1);
  }
  const salida = process.env.GITHUB_OUTPUT;
  if (salida) escribirSalida(salida, 'cuerpo', notas);
  else console.log(notas);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();
