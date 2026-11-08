# ukiku-pc

Cliente de escritorio no oficial, de uso personal, para ver anime en PC con
los mismos datos que usa la app Android [Ukiku](https://github.com/jordyamc/UKIKU).

## Estado

En desarrollo. El spike de resolución (`spike/`) y el de libmpv en Tauri
validaron la técnica. Hoy hay:

- `core/`: núcleo de fuentes en TypeScript (buscar, episodios y resolver
  Zilla, MP4Upload y Voe, con errores tipados).
- `app/`: aplicación de escritorio (Tauri + Svelte + libmpv) que busca,
  muestra la ficha y reproduce con controles flotantes.
- `lab/`: chequeo diario de que las fuentes siguen sirviendo (corre en un
  servidor propio).
- `spike/`: el spike original; lo usa `lab/` hasta migrar a `core/`.

Hecho: datos locales con SQLite (progreso, historial y ajustes) e
importación de la copia de Ukiku desde una carpeta (historial, siguiendo y
favoritos, mezclando o reemplazando). En curso: la biblioteca (estado y
favoritos). Pendiente: la pantalla Biblioteca, la interfaz final y las
descargas.

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
