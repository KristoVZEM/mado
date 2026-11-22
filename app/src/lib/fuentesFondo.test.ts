import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Guarda de la cola con prioridad: lo de fondo usa `fuentesFondo` (prioridad baja) y TODO lo demás `fuentes` (alta).
// Si una tarea de fondo usara `fuentes`, volvería a hacer esperar a lo que el usuario abre; si algo del usuario usara
// `fuentesFondo`, esperaría detrás de todo. Se mira el código fuente porque los módulos importan Tauri y no cargan en Node.

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const DE_FONDO = ['lib/popularesInicio.ts', 'lib/avisosApp.ts'];

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n);
    if (statSync(ruta).isDirectory()) return n === 'pruebas' ? [] : archivos(ruta);
    return /\.(ts|svelte)$/.test(n) && !/\.(test|spec)\.ts$|\.componente\.spec\.ts$/.test(n) ? [ruta] : [];
  });
}

test('solo las tareas de fondo importan fuentesFondo, y no usan la fachada principal', () => {
  const usan = archivos(RAIZ)
    .filter((f) => !f.endsWith(join('lib', 'fuentes.ts')))
    .filter((f) => /\bfuentesFondo\b/.test(readFileSync(f, 'utf8')))
    .map((f) => relative(RAIZ, f).split(sep).join('/'))
    .sort();
  assert.deepEqual(usan, [...DE_FONDO].sort());
  for (const f of DE_FONDO) {
    const texto = readFileSync(join(RAIZ, f), 'utf8');
    assert.ok(
      !/\bfuentes\.(buscar|catalogo|episodios|servidores|resolver)\b/.test(texto),
      `${f} usa la fachada principal (prioridad alta)`,
    );
    assert.ok(!/import \{[^}]*\bfuentes\b[^}]*\} from/.test(texto), `${f} importa la fachada principal`);
  }
});
