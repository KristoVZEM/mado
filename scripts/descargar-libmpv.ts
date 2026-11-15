// Descarga las DLL de libmpv fijadas en deps/libmpv.json y comprueba su SHA-256.
// Uso (desde la raíz del repo): node scripts/descargar-libmpv.ts [carpeta-de-destino]
// El destino por defecto es app/src-tauri/lib. Sin dependencias: Node 24 ejecuta .ts directamente.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

export interface Archivo {
  /** Nombre del archivo ya descomprimido, p. ej. `libmpv-2.dll`. */
  nombre: string;
  /** SHA-256 en hexadecimal del archivo descomprimido. */
  sha256: string;
  /** Dirección del `.gz` en la release de dependencias. */
  url: string;
}

export function sha256(datos: Uint8Array): string {
  return createHash('sha256').update(datos).digest('hex');
}

/**
 * Deja `nombre` en `carpeta` con el contenido que coincide con `sha256`. Si ya está así no descarga nada. Un hash
 * distinto, un gzip roto o un error del servidor lanzan sin tocar el archivo que hubiera: se escribe a un temporal y
 * solo se renombra tras verificar.
 */
export async function descargar(
  archivo: Archivo,
  carpeta: string,
  pedir: typeof fetch = fetch,
): Promise<'omitido' | 'descargado'> {
  const destino = join(carpeta, archivo.nombre);
  if (existsSync(destino) && sha256(readFileSync(destino)) === archivo.sha256) return 'omitido';

  const respuesta = await pedir(archivo.url);
  if (!respuesta.ok) throw new Error(`${archivo.nombre}: el servidor respondió ${respuesta.status}`);

  let datos: Buffer;
  try {
    datos = gunzipSync(Buffer.from(await respuesta.arrayBuffer()));
  } catch {
    throw new Error(`${archivo.nombre}: lo descargado no es un gzip válido`);
  }

  const obtenido = sha256(datos);
  if (obtenido !== archivo.sha256) {
    throw new Error(`${archivo.nombre}: el SHA-256 no coincide (esperado ${archivo.sha256}, obtenido ${obtenido})`);
  }

  mkdirSync(carpeta, { recursive: true });
  const temporal = `${destino}.tmp`;
  try {
    writeFileSync(temporal, datos);
    renameSync(temporal, destino);
  } catch (e) {
    rmSync(temporal, { force: true });
    throw e;
  }
  return 'descargado';
}

async function principal(): Promise<void> {
  const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const manifiesto = JSON.parse(readFileSync(join(raiz, 'deps', 'libmpv.json'), 'utf8')) as { archivos: Archivo[] };
  const carpeta = resolve(process.argv[2] ?? join(raiz, 'app', 'src-tauri', 'lib'));
  for (const archivo of manifiesto.archivos) {
    const resultado = await descargar(archivo, carpeta);
    console.log(`${archivo.nombre}: ${resultado === 'omitido' ? 'ya estaba, hash correcto' : 'descargado y verificado'}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
