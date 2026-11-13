# ukiku-pc

Cliente de escritorio no oficial, de uso personal, para ver anime en PC con
los mismos datos que usa la app Android [Ukiku](https://github.com/jordyamc/UKIKU).

## Estado

En desarrollo. Un spike de resolución y otro de libmpv en Tauri validaron la
técnica (el código del primero está en el historial de git). Hoy hay:

- `core/`: núcleo de fuentes en TypeScript (buscar, episodios y resolver
  Zilla, MP4Upload y Voe, con errores tipados).
- `app/`: aplicación de escritorio (Tauri + Svelte + libmpv) con un carril de
  iconos (Inicio, Catálogo, Emisión, Biblioteca, Historial y Ajustes), ficha
  con sinopsis y reproductor con controles flotantes.
- `lab/`: chequeo diario de que los tres servidores siguen sirviendo, con el
  mismo `core/` que usa la app (corre en un servidor propio).

Hecho:

- Datos locales con SQLite: progreso, historial, ajustes y biblioteca con
  estado y favoritos.
- Importación de la copia de Ukiku desde una carpeta (historial, siguiendo y
  favoritos, mezclando o reemplazando).
- Datos de [AniList](https://anilist.co): banner, puntuación, próximo
  episodio, agenda semanal de emisión y emparejado automático de las series.
  La lista (estado y episodios vistos) se sincroniza con una cuenta de
  AniList en los dos sentidos, con vista previa la primera vez.
- Avisos de episodios nuevos con notificación de Windows, mientras la app
  está abierta.
- Imágenes de [TMDB](https://www.themoviedb.org) (fondo y logo) con la clave
  del usuario, guardada en el almacén de credenciales de Windows.
- Ajustes de reproducción, apariencia (tema claro u oscuro y color de
  acento), avisos, datos y cuentas.
- Copia de seguridad: exportar, restaurar y copia automática.
- Modo degradado si la fuente no responde: lo local sigue funcionando.
- Instalador NSIS con `npm run tauri build` desde `app/`.

Pendiente: las descargas.

## Versiones

La versión actual y lo que cambió en cada una están en [CHANGELOG.md](CHANGELOG.md), junto
con la regla para numerarlas.

## Plan general

- Stack objetivo: TypeScript y Tauri.
- Fases: spike, lector de archivos `.backup` de Ukiku, cliente para buscar y
  reproducir, y después favoritos, historial, progreso y descargas con datos
  locales.
- La compatibilidad con la app del móvil y la tablet empieza como
  importación y exportación del archivo `.backup`.

## Aviso

Proyecto no oficial, sin relación con el autor de Ukiku. Es de uso personal y
no está pensado para distribuirse.

## Créditos

Inspirado en [Ukiku](https://github.com/jordyamc/UKIKU), de Jordy Mendoza
(licencia MIT).

## Licencia

Sin licencia por ahora (repositorio privado).
