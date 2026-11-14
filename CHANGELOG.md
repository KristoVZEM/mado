# Cambios

Lo que cambia en cada versión, de la más nueva a la más antigua. Cada versión es una etiqueta de git
(`v0.9.0`) y un instalador.

## Cómo se numera

`MAYOR.MENOR.PARCHE`. Mientras el primer número sea 0, la app está en desarrollo.

- **Parche** (`0.9.0` a `0.9.1`): solo arreglos; nada nuevo que aprender a usar.
- **Menor** (`0.9.1` a `0.10.0`): algo nuevo o un cambio visible. Ojo: después de `0.9` viene `0.10`,
  no `1.0`; los números no son decimales.
- **1.0.0**: cuando estén las descargas y una versión `0.x` haya aguantado un tiempo de uso diario sin
  fallos graves.

Para sacar una versión: subir el número en `app/src-tauri/tauri.conf.json`, `app/src-tauri/Cargo.toml`
y `app/package.json`, anotar aquí los cambios, mergear, crear la etiqueta `vX.Y.Z` sobre `main` y
construir el instalador desde esa etiqueta. Ajustes muestra la versión y el commit instalados.

## 0.9.1 — 2026-11-14

Arreglo que salió de probar a mano la 0.9.0, más dependencias al día.

### Arreglado

- **Reproductor**: el botón del servidor rotaba en un solo sentido, y tras pasar de HLS a MP4Upload no se
  podía volver («ningún servidor resoluble»). Ahora es un desplegable junto a SUB/DUB con los servidores
  del episodio, y se puede elegir cualquiera, también el anterior.

### Por dentro

- `plugin-http` 2.9.0, `plugin-notification` 2.8.1 y `vite` 8.3.8, con los crates de Rust a juego.
- Se quitó `lab/`: el chequeo diario se apagó porque nada leía sus resultados.

## 0.9.0 — 2026-11-13

Primera versión numerada de verdad: hasta aquí todo fue `0.1.0`. El salto a `0.9` refleja que la app
ya cubre el uso diario completo; para la `1.0` faltan las descargas.

### Nuevo

- **Reproductor**: si el vídeo falla, cambia solo al siguiente servidor desde el mismo segundo, y el
  botón del servidor permite cambiarlo a mano. Rueda de espera cuando se queda sin datos y tramo
  descargado en la barra. Atajos N y P (episodio siguiente y anterior), 0-9 (saltar a esa décima) y
  doble clic para pantalla completa.
- **Bandeja del sistema** (opcional): al cerrar, la app puede quedarse junto al reloj y seguir avisando
  de episodios nuevos. También puede abrirse al iniciar Windows.
- **Navegación**: «Volver» regresa a la ficha anterior; también con Alt+← y el botón atrás del ratón.
- **Ventana**: recuerda tamaño, posición y maximizado. Abrir la app dos veces enfoca la que ya está.
- **Registro de errores** en un archivo, con acceso desde Ajustes > Datos y red.
- **Ajustes** muestra la versión y el commit instalados.

### Arreglado

- El servidor «de la última vez» se recuerda cuando el vídeo ya abrió, no antes: un servidor roto ya
  no queda como preferido.
- La captura de MP4Upload prueba todas las direcciones candidatas en vez de rendirse si la primera no
  valía.
- Los mensajes de error ya no mandan a una consola que la app instalada no tiene.

### Por dentro

- CI en cada PR: pruebas, `svelte-check`, compilación, clippy y `cargo test`.
- El chequeo diario (`lab/`) usa el mismo `core/` que la app, vigila también Voe y distingue un fallo
  de red de un fallo de la fuente. Se borró `spike/`.
- `Ficha.svelte` partida en componentes.

## 0.1.0 — del 2026-11-05 al 2026-11-10

Todo lo construido antes de numerar versiones (PR #2 a #62), sin instaladores etiquetados:

- Buscar, ficha y reproducción con libmpv; cadena de servidores Zilla, MP4Upload y Voe.
- Datos locales en SQLite: progreso, historial, biblioteca con estados y favoritos.
- Importación de la copia de Ukiku desde una carpeta.
- AniList: datos de cada serie, agenda de emisión y sincronización de la lista en los dos sentidos.
- Avisos de episodios nuevos con notificación de Windows.
- Imágenes de TMDB, Inicio con carrusel, Catálogo con filas y búsqueda.
- Ajustes con cinco pestañas, tema claro y oscuro, copias de seguridad con restauración.
- Modo degradado si la fuente no responde, sin evadir Cloudflare.
- Instalador NSIS.
