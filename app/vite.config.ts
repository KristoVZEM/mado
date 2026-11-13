import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { execSync } from 'node:child_process';
import process from 'node:process';

const host = process.env.TAURI_DEV_HOST;

// Commit del que sale esta compilación, para saber qué hay instalado (Ajustes lo muestra junto a la versión).
// Sin git (o fuera de un repositorio) queda vacío y Ajustes enseña solo la versión.
function commitActual(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

export default defineConfig({
  plugins: [svelte()],
  define: { __COMMIT__: JSON.stringify(commitActual()) },
  // Para que Vite no oculte los errores de Rust.
  clearScreen: false,
  server: {
    // Tauri espera un puerto fijo.
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
    // core/ vive fuera de app/ y se importa por ruta relativa.
    fs: { allow: ['..'] },
  },
});
