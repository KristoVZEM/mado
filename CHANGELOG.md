# Cambios

Lo que cambia en cada versión, de la más nueva a la más antigua. Cada versión es una etiqueta de git (`v0.10.0`).

## Cómo se numera

`MAYOR.MENOR.PARCHE`. Mientras el primer número sea 0, la app está en desarrollo.

- **Parche** (`0.9.0` a `0.9.1`): solo arreglos.
- **Menor** (`0.9.1` a `0.10.0`): algo nuevo o un cambio visible. Después de `0.9` viene `0.10`, no `1.0`: los
  números no son decimales.

## 0.12.0 — 2026-11-15

Mado se actualiza sola.

### Nuevo

- **Actualizaciones.** Al abrir (una vez al día como mucho) la app comprueba en GitHub si hay una versión nueva y, si la
  hay, avisa con «Actualizar» y «Más tarde». La descarga muestra su avance y la firma se verifica antes de instalar.
  Nunca se instala sola ni durante un episodio: si empieza uno mientras se descarga, la instalación espera.
- En Ajustes, «Datos y red»: la versión instalada con «Buscar ahora», y el interruptor «Comprobar al abrir»
  (activado por defecto).
- Es la única conexión nueva de la app: `github.com`, para leer el archivo de versiones y bajar el instalador.

La primera versión con actualizador se instala a mano; las siguientes se actualizan desde la propia app.

## 0.11.0 — 2026-11-15

El proyecto pasa a llamarse Mado.

### Cambia

- **La app pasa a llamarse Mado** (antes ukiku-pc). Es un cambio de nombre, no de funciones: el proyecto no es un
  fork de Ukiku y solo conserva el crédito y la importación de su copia de seguridad.
- Al primer arranque, la app mueve sola los datos de la versión anterior (base, copias, ajustes de la ventana y tema)
  y pasa el token de AniList y la clave de TMDB al nombre nuevo. Hay que cerrar antes la app antigua. El instalador
  nuevo se instala aparte: la anterior se desinstala a mano, y «Iniciar con Windows» se vuelve a activar en Ajustes.
- La base se llama `mado.db` y los respaldos automáticos `mado-AAAA-MM-DD.db`; los `ukiku-*` que ya había se siguen
  podando.
- Los avisos de la fuente sugieren cambiar de red, y los textos de la interfaz hablan de «la fuente» y no de un sitio
  concreto.
- Se retira un resolutor de servidor que la app no usaba, con sus pruebas.

## 0.10.0 — 2026-11-15

Dos mejoras de uso diario y una base de pruebas que antes no existía.

### Nuevo

- **Volver recuerda dónde estabas**: al volver a una ficha o a una sección (Alt+←, el botón atrás del ratón o
  «Volver») la página queda en el mismo punto en que la dejaste, y lo mismo al cerrar el Reproductor y volver a la
  ficha. Con series muy largas ya no hay que bajar de nuevo.
- **Nuevos episodios** de Inicio incluye también las series en Considerando (las de «Pendientes»), después de las que
  estás viendo.

### Arreglado

- Abrir una serie relacionada desde una ficha muy larga bajada del todo ya no la deja abierta abajo: empieza arriba.

### Por dentro

- Pruebas de componentes Svelte (vitest) que montan cada pantalla con una base vacía y con datos de ejemplo, y fallan
  si escriben errores en la consola. Corren en el CI junto al resto de pruebas.
- El selector de servidor del Reproductor es un componente propio, con pruebas.

## 0.9.1 — 2026-11-14

### Arreglado

- **Reproductor**: el botón del servidor rotaba en un solo sentido, y tras pasar de HLS a MP4Upload no se podía
  volver («ningún servidor resoluble»). Ahora es un desplegable junto a SUB/DUB con los servidores del episodio, y se
  puede elegir cualquiera, también el anterior.

### Por dentro

- `plugin-http` 2.9.0, `plugin-notification` 2.8.1 y `vite` 8.3.8, con los crates de Rust a juego.

## 0.9.0 — 2026-11-13

Primera versión numerada: hasta aquí todo fue `0.1.0`.

### Nuevo

- **Reproductor**: si el vídeo falla, cambia solo al siguiente servidor desde el mismo segundo, y el botón del
  servidor permite cambiarlo a mano. Rueda de espera cuando se queda sin datos y tramo descargado en la barra. Atajos
  N y P (episodio siguiente y anterior), 0-9 (saltar a esa décima) y doble clic para pantalla completa.
- **Bandeja del sistema** (opcional): al cerrar, la app puede quedarse junto al reloj y seguir avisando de episodios
  nuevos. También puede abrirse al iniciar Windows.
- **Navegación**: «Volver» regresa a la ficha anterior; también con Alt+← y el botón atrás del ratón.
- **Ventana**: recuerda tamaño, posición y maximizado. Abrir la app dos veces enfoca la que ya está.
- **Registro de errores** en un archivo, con acceso desde Ajustes > Datos y red.
- **Ajustes** muestra la versión y el commit instalados.

### Arreglado

- El servidor «de la última vez» se recuerda cuando el vídeo ya abrió, no antes: un servidor roto ya no queda como
  preferido.
- La captura de MP4Upload prueba todas las direcciones candidatas en vez de rendirse si la primera no valía.
- Los mensajes de error ya no mandan a una consola que la app instalada no tiene.

### Por dentro

- CI en cada PR: pruebas, `svelte-check`, compilación, clippy y `cargo test`.
- `Ficha.svelte` partida en componentes.

## 0.1.0 — del 2026-11-05 al 2026-11-10

Todo lo construido antes de numerar versiones:

- Buscar, ficha y reproducción con libmpv, con una cadena de servidores de reproducción.
- Datos locales en SQLite: progreso, historial, biblioteca con estados y favoritos.
- Importación de la copia de Ukiku desde una carpeta.
- AniList: datos de cada serie, agenda de emisión y sincronización de la lista en los dos sentidos.
- Avisos de episodios nuevos con notificación de Windows.
- Imágenes de TMDB, Inicio con carrusel, Catálogo con filas y búsqueda.
- Ajustes con cinco pestañas, tema claro y oscuro, copias de seguridad con restauración.
- Sin conexión con la fuente, lo local sigue funcionando, y no se intenta evadir Cloudflare.
- Instalador NSIS.
