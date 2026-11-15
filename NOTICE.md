# Avisos y créditos

El código de Mado se publica con la licencia MIT (ver [LICENSE](LICENSE)). Este archivo recoge de dónde viene
la inspiración, qué software de terceros usa y qué no se distribuye con el repositorio.

## Sin relación con terceros

Mado es un proyecto personal y no oficial. No tiene relación, aval ni afiliación con Ukiku, AniList, TMDB, mpv ni
con ningún sitio de streaming. Todos los nombres y marcas pertenecen a sus dueños.

## Inspiración: Ukiku

Mado nació como un cliente de escritorio para trabajar con los datos de [Ukiku](https://github.com/jordyamc/UKIKU),
la app Android de Jordy Mendoza (licencia MIT, © 2018 Jordy Alexis Mendoza Caballero). No es un fork: Ukiku está
escrito en Kotlin para Android y Mado en TypeScript, Rust y Svelte, y no se copió código de Ukiku. Lo que Mado toma
de Ukiku son ideas y compatibilidad:

- Importa la copia de seguridad de Ukiku (los archivos JSON `history`, `following` y `favs`) para traer el
  historial, las series seguidas y los favoritos.
- Usa los mismos números de estado de seguimiento que guarda esa copia, y el mismo salto largo de 85 segundos.
- `app/src-tauri/src/capture.js` replica en JavaScript la técnica de Ukiku de vigilar las peticiones de una página
  para encontrar la URL del vídeo.

## Software de terceros

Mado usa, entre otros, estos proyectos, cada uno con su licencia:

| Proyecto | Para qué | Licencia |
|---|---|---|
| [Tauri](https://tauri.app) y sus plugins | Contenedor de escritorio | MIT o Apache-2.0 |
| [Svelte](https://svelte.dev) y [Vite](https://vite.dev) | Interfaz | MIT |
| [SQLite](https://sqlite.org) (vía `rusqlite`) | Datos locales | Dominio público (SQLite) y MIT (`rusqlite`) |
| [mpv](https://mpv.io) (libmpv) | Reproducción | LGPL-2.1 o posterior (compilación con `-Dgpl=false`), con FFmpeg enlazado bajo LGPL 3 |
| [libmpv-wrapper](https://github.com/nini22P/libmpv-wrapper) | Capa de enlace de libmpv | LGPL-2.1 |
| [tauri-plugin-libmpv](https://github.com/nini22P/tauri-plugin-libmpv) | Enlace entre Tauri y libmpv | MPL-2.0 |
| [Zen Kaku Gothic New](https://fonts.google.com/specimen/Zen+Kaku+Gothic+New) (vía `@fontsource`) | Tipografía | SIL OFL 1.1 |
| [AniList](https://anilist.co) | Datos de series y sincronización de la lista | API con sus propios términos de uso |
| [TMDB](https://www.themoviedb.org) | Imágenes de fondo y logos | API con sus propios términos de uso |

La lista completa está en `app/src-tauri/Cargo.lock` y `app/package-lock.json`. En el árbol de dependencias de
Rust no hay licencias GPL ni AGPL; las únicas de copyleft de archivo son MPL-2.0, y Mado no modifica esos archivos.

Este producto usa la API de TMDB pero no está avalado ni certificado por TMDB.

## Qué lleva el instalador

Los instaladores de las releases incluyen dos DLL en la carpeta `lib` de la instalación: `libmpv-2.dll` y
`libmpv-wrapper.dll`. Son bibliotecas LGPL que Mado usa como archivos aparte, así que el usuario puede
sustituirlas por otra versión compatible reemplazando el archivo. Los textos de las licencias (LGPL 2.1, LGPL 3 y GPL 3,
en la que se apoya la LGPL 3) van en la carpeta `licencias` de la instalación, junto a un `LEEME.txt`.

La compilación de libmpv viene de la variante `lgpl` de [zhongfly/mpv-winbuild](https://github.com/zhongfly/mpv-winbuild),
con las opciones de mpv `-Dgpl=false` y sin `x264`, `x265`, `fdk` ni `rubberband`. Que se compilara así se puede
comprobar en la propia DLL, que lleva incrustadas sus opciones de compilación. Las versiones incluidas en cada
release son:

| Componente | Versión | Código fuente |
|---|---|---|
| mpv | `v0.41.0-1446-g858e0e508` | <https://github.com/mpv-player/mpv> |
| FFmpeg | `N-128416-g5048d707a` | <https://git.ffmpeg.org/ffmpeg.git> |
| libmpv-wrapper | `v0.1.1` | <https://github.com/nini22P/libmpv-wrapper> |
| Recetas de compilación | variante `lgpl` | <https://github.com/zhongfly/mpv-winbuild> |

El proveedor de la compilación solo conserva sus binarios 30 días. Si alguno de estos enlaces deja de funcionar, abre
una incidencia en este repositorio y se facilitará el código fuente de las versiones indicadas. El propio proveedor
avisa de que no garantiza haber desactivado todos los paquetes incompatibles con LGPL.

Con el código fuente (sin instalador) se obtienen las mismas DLL en local con `npx tauri-plugin-libmpv-api setup-lib`.
