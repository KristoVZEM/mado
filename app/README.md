# app — cliente de escritorio de ukiku-pc

Tauri 2 + Svelte 5 + TypeScript. El núcleo de fuentes es `../core` (se importa por ruta
relativa, sin build). La reproducción usa libmpv.

## Requisitos

- Node 24, Rust (MSVC) y las herramientas de compilación de C++ de Visual Studio.
- `libmpv-2.dll` y `libmpv-wrapper.dll` en `src-tauri/lib/` (no se versionan). Si faltan:
  `npx tauri-plugin-libmpv-api setup-lib` desde esta carpeta.
- Si tu proveedor bloquea las IPs de Cloudflare, activa una VPN para buscar y reproducir.

## Comandos

- `npm install`, luego `npm run tauri dev` para ejecutar la aplicación.
- `npm test`: pruebas de las utilidades puras (cabeceras de mpv, saltos y errores).
- `npm run check`: tipos de TypeScript y Svelte. `npm run build`: construye el frontend.
- `cd src-tauri && cargo test`: pruebas de `resolver.rs` (reglas de confianza del WebView).

## Controles del reproductor

Espacio: pausa. ← →: −10 s / +10 s. S: +85 s (saltar el opening). F: pantalla completa.
Esc: volver a la ficha. Los controles se ocultan a los 3 s sin mover el ratón.

## Seguridad

La URL de stream que captura el WebView oculto la escribe una página de terceros: se valida
en Rust (`resolver.rs`) antes de dársela a mpv. `plugin-http` solo permite `https`.
