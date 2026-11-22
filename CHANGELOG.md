# Cambios

Lo que cambia en cada versión, de la más nueva a la más antigua. Cada versión es una etiqueta de git (`v0.10.0`).

## Cómo se numera

`MAYOR.MENOR.PARCHE`. Mientras el primer número sea 0, la app está en desarrollo.

- **Parche** (`0.9.0` a `0.9.1`): solo arreglos.
- **Menor** (`0.9.1` a `0.10.0`): algo nuevo o un cambio visible. Después de `0.9` viene `0.10`, no `1.0`: los
  números no son decimales.

## 0.14.1 — 2026-11-22

Abrir una serie ya no hace esperar.

### Cambia

- **La Ficha sale al instante en las series que ya has visto.** Mado guarda la última lista de episodios de cada serie
  (hasta 500) y la muestra de inmediato mientras pide la actualizada en segundo plano. Si no consigue actualizarla, se queda
  con la guardada y te lo dice.
- **Lo que abres tú pasa antes que lo que Mado hace por su cuenta.** Hasta ahora las tareas de fondo, como buscar las series
  populares de Inicio o los avisos de episodios nuevos, hacían cola delante de lo que abrías y una serie podía tardar varios
  segundos en cargar. Ahora esas tareas esperan su turno detrás. En una prueba, el peor caso bajó de 9 a 1,6 segundos.
- **Inicio se prepara antes y se actualiza solo.** Descarga por adelantado las imágenes de lo primero que se ve, aunque la
  app arranque oculta con Windows, y vuelve a pedir sus datos al mostrar la ventana si pasaron más de 10 minutos o si la carga
  anterior falló.
- La base de datos pasa a la versión 10, con la caché de episodios. La migración es automática y guarda una copia antes.

## 0.14.0 — 2026-11-22

Mado puede saltar el opening, maneja mejor las series largas y te cuenta qué cambia al actualizar.

### Nuevo

- **Botón «Saltar intro».** Mientras suena el opening de un episodio aparece un botón que salta hasta su final. Es opcional
  y viene apagado: se activa en Ajustes → Reproducción. Con él activado, Mado pide a AniSkip, un servicio comunitario de
  tiempos, el tramo del opening y le envía el id de la serie, el episodio, la duración del vídeo y tu dirección IP; apagado,
  no envía nada. Los tiempos los aporta la comunidad y a veces fallan, sobre todo en algunos primeros episodios: si el botón no
  aparece, el salto de +85 s sigue donde estaba.
- **Series largas en la Ficha.** Los episodios se muestran de 24 en 24, con flechas y un desplegable de rangos para saltar a
  cualquier tramo. Un campo «Ir al episodio» lleva directo al número que pidas, y el botón «Hasta aquí» de cada episodio marca
  como vistos ese y todos los anteriores (pide confirmación).
- **Miniaturas difuminadas.** Las capturas de los episodios sin ver se difuminan para no revelar la trama; se aclaran al
  pasar el ratón. El siguiente por ver y los que ya empezaste se ven con nitidez. Se apaga en Ajustes → Apariencia.
- **Novedades al actualizar.** El aviso de versión nueva tiene un botón «Novedades» que despliega lo que cambia. Lo verás a
  partir de la actualización que siga a esta.

### Cambia

- La base de datos pasa a la versión 9, con una caché de los tiempos de intro. La migración es automática y guarda una copia
  antes.
- AniSkip, opcional, es el quinto servidor con el que Mado puede hablar; ya está recogido en el README y en `NOTICE.md`.

## 0.13.0 — 2026-11-16

Mado tiene logo propio.

### Cambia

- **Nuevo logo e iconos.** Sustituye al icono por defecto de Tauri: una ventana shoji de papel con ojos que miran desde
  detrás, inspirada en el yokai *mokumokuren* («mado» significa ventana). Se ve en el instalador, la barra de tareas, la
  bandeja y el README. A 48 px o menos se usa una versión simplificada, de cuatro ojos grandes, que se sigue leyendo a
  16 px. Los archivos del logo y cómo regenerar los iconos están en `docs/logo/`.
- Las capturas del README ya no llevan la barra de desplazamiento, y el repositorio tiene imagen de vista previa propia.

## 0.12.1 — 2026-11-15

Sin cambios de funciones: se publica para comprobar la actualización automática de la 0.12.0 a una versión
posterior, de punta a punta.

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
