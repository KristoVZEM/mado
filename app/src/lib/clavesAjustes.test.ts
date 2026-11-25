import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Guarda: cada clave que la app lee o guarda con `leerAjuste`/`guardarAjuste` tiene que estar en la lista fija de
// `ajustes.rs`. Rust rechaza las demás y la app se traga el error: así estuvo `inicio_populares` sin guardarse nunca
// (la caché de las populares de Inicio no funcionaba). Se mira el código fuente porque los módulos importan Tauri.

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const AJUSTES_RS = fileURLToPath(new URL('../../src-tauri/src/datos/ajustes.rs', import.meta.url));

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n);
    if (statSync(ruta).isDirectory()) return n === 'pruebas' ? [] : archivos(ruta);
    return /\.(ts|svelte)$/.test(n) && !/\.(test|spec)\.ts$/.test(n) ? [ruta] : [];
  });
}

/** Lo que Rust admite: las claves numéricas, las `CLAVE_*` de texto y el prefijo `idioma:`. */
function permitidas() {
  const rs = readFileSync(AJUSTES_RS, 'utf8');
  const numericos = rs.slice(rs.indexOf('const NUMERICOS'), rs.indexOf('];', rs.indexOf('const NUMERICOS')));
  const claves = new Set([...numericos.matchAll(/\("([a-z_]+)",/g)].map((m) => m[1]));
  for (const m of rs.matchAll(/const CLAVE_[A-Z_]+: &str = "([a-z_]+)";/g)) claves.add(m[1]);
  const prefijos = [...rs.matchAll(/const PREFIJO_[A-Z_]+: &str = "([a-z_]+:)";/g)].map((m) => m[1]);
  return { claves, prefijos };
}

/** Las claves que usa la app: literales en la llamada, o constantes `CLAVE…` del archivo que se pasan a ella. */
function usadas() {
  const fuera: Array<{ clave: string; archivo: string }> = [];
  const llamada = /\b(?:leerAjuste|guardarAjuste|guardarAjusteSilencioso)\(\s*(?:'([^']+)'|`([^`]+)`|([A-Z_][A-Z0-9_]*))/g;
  for (const f of archivos(RAIZ)) {
    const texto = readFileSync(f, 'utf8');
    const archivo = relative(RAIZ, f).split(sep).join('/');
    for (const m of texto.matchAll(llamada)) {
      let clave = m[1] ?? m[2];
      if (m[3]) {
        const def = texto.match(new RegExp(`const ${m[3]}\\s*=\\s*'([^']+)'`));
        assert.ok(def, `${archivo}: no encuentro el valor de ${m[3]}`);
        clave = def[1];
      }
      // Plantillas como `idioma:${aid}`: cuenta el prefijo.
      fuera.push({ clave: clave!.replace(/\$\{[^}]+\}.*/, ''), archivo });
    }
  }
  return fuera;
}

test('cada clave de ajuste que usa la app la admite Rust', () => {
  const { claves, prefijos } = permitidas();
  const lista = usadas();
  assert.ok(lista.length > 20, 'la búsqueda de claves no encontró casi nada: revisa la expresión');
  const rechazadas = lista.filter(({ clave }) => !claves.has(clave) && !prefijos.some((p) => clave === p));
  assert.deepEqual(rechazadas, []);
});

test('la guarda ve las claves que se pasan con una constante', () => {
  assert.ok(usadas().some((u) => u.clave === 'inicio_populares' && u.archivo === 'lib/popularesInicio.ts'));
  assert.ok(usadas().some((u) => u.clave === 'anilist_agenda_cargada'));
});
