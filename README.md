# ukiku-pc

Cliente de escritorio no oficial, de uso personal, para ver anime en PC con
los mismos datos que usa la app Android [Ukiku](https://github.com/jordyamc/UKIKU).

## Estado

Idea aprobada, sin implementar. Falta el spike: un script sin interfaz, en
Node, que resuelva un episodio a una URL reproducible (con mpv como
reproductor de referencia). No hay código todavía.

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
