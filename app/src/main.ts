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

mount(App, { target: document.getElementById('app')! });
