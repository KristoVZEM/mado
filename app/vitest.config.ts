import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';

// Aparte de vite.config.ts: la app no debe cargar nada de pruebas, y aquí no hace falta el servidor de Tauri.
export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.componente.spec.ts'],
    setupFiles: ['src/pruebas/preparar.ts'],
  },
});
