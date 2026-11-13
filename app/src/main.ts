import { mount } from 'svelte';
import App from './App.svelte';
import '@fontsource/zen-kaku-gothic-new/latin-400.css';
import '@fontsource/zen-kaku-gothic-new/latin-500.css';
import '@fontsource/zen-kaku-gothic-new/latin-700.css';
// Los macrones del romaji (Ō, ū…) viven en el subconjunto extendido.
import '@fontsource/zen-kaku-gothic-new/latin-ext-400.css';
import '@fontsource/zen-kaku-gothic-new/latin-ext-500.css';
import '@fontsource/zen-kaku-gothic-new/latin-ext-700.css';
// Kana y kanji de los títulos; sin esto caen a la fuente del sistema.
import '@fontsource/zen-kaku-gothic-new/japanese-400.css';
import '@fontsource/zen-kaku-gothic-new/japanese-500.css';
import '@fontsource/zen-kaku-gothic-new/japanese-700.css';
import './app.css';
import { aplicarTemaGuardado } from './lib/aplicarApariencia.svelte.ts';
import { iniciarRegistro } from './lib/registroApp.ts';

iniciarRegistro();
aplicarTemaGuardado();

// Sin el menú del navegador (Recargar, Inspeccionar…): no es una página web. En los campos de texto se queda,
// para copiar y pegar.
document.addEventListener('contextmenu', (e) => {
  if (e.target instanceof Element && e.target.closest('input, textarea, [contenteditable="true"]')) return;
  e.preventDefault();
});

mount(App, { target: document.getElementById('app')! });
