import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import process from 'node:process';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [svelte()],
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
