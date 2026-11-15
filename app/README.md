# app — cliente de escritorio de Mado

Tauri 2 + Svelte 5 + TypeScript. El núcleo de fuentes es `../core` (se importa por ruta
relativa, sin build). La reproducción usa libmpv.

## Requisitos

- Node 24, Rust (MSVC) y las herramientas de compilación de C++ de Visual Studio.
- `libmpv-2.dll` y `libmpv-wrapper.dll` en `src-tauri/lib/` (no se versionan). Si faltan:
  `npx tauri-plugin-libmpv-api setup-lib` desde esta carpeta.

## Comandos

- `npm install`, luego `npm run tauri dev` para ejecutar la aplicación.
- `npm test`: pruebas de la lógica pura de `src/lib` (sin ventana ni red).
- `npm run check`: tipos de TypeScript y Svelte. `npm run build`: construye el frontend.
- `cd src-tauri && cargo test`: pruebas de la capa de datos (SQLite, migraciones, importación y copias) y de `resolver.rs` (reglas de confianza del WebView). `cargo clippy` debe quedar limpio.
- `npm run tauri build`: genera el instalador NSIS en `src-tauri/target/release/bundle/nsis/`.

## Controles del reproductor

Espacio o clic en la imagen: pausa. ← →: −10 s / +10 s. S: +85 s (saltar el opening).
↑ ↓: volumen. M: silencio. 0-9: saltar a esa décima del episodio (5 = la mitad).
N / P: episodio siguiente / anterior. F o doble clic: pantalla completa.
Esc: volver a la ficha. Los controles se ocultan a los 3 s sin mover el ratón.

## Seguridad

La URL de stream que captura el WebView oculto la escribe una página de terceros: se valida
en Rust (`resolver.rs`) antes de dársela a mpv. `plugin-http` solo puede llamar a los hosts
listados en `src-tauri/capabilities/default.json` (la fuente, Zilla, AniList y TMDB). El token
de AniList y la clave de TMDB se guardan en el almacén de credenciales de Windows, no en la base.
