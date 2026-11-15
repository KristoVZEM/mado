# Contribuir

Mado es un proyecto personal. Las contribuciones son bienvenidas, pero no hay plazos ni garantía de que un cambio
se acepte.

## Antes de empezar

- Para un fallo o una idea, abre antes una incidencia: así se evita trabajo que luego no encaja.
- Un cambio en la fuente de vídeo (por ejemplo, un formato que cambió) cuenta como arreglo. Añadir una fuente nueva
  se habla primero en una incidencia.
- Mado solo se prueba en Windows 11.

## Cómo preparar el entorno

Los requisitos y los comandos están en el [README](README.md#compilar-y-probar).

## Cómo proponer un cambio

1. Crea una rama con prefijo `feat/`, `fix/`, `chore/` o `docs/` y una descripción corta.
2. Escribe los mensajes de commit como [Conventional Commits](https://www.conventionalcommits.org/es/)
   (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
3. Añade pruebas para lo que cambies. Antes de abrir el PR, que pasen:
   - `npm test` en la raíz (core, lógica y componentes);
   - `npm run check` en `app/` (tipos de TypeScript y Svelte);
   - `cargo test` y `cargo clippy` en `app/src-tauri/`.
4. Abre el PR contra `main` y explica qué cambia y cómo lo probaste.

## Estilo del código

- Los identificadores, comentarios y mensajes de la interfaz están en español, y se mantiene así por decisión del
  proyecto. Los tipos y términos propios de las API externas (`Playable`, `episodes`) conservan su nombre.
- Los secretos (tokens, claves) nunca entran en el repositorio: viven en el Administrador de credenciales de Windows.

## Releases de dependencias

Las releases con etiqueta `deps-*` (por ejemplo `deps-libmpv-2026-11-08`) no son versiones de Mado: guardan binarios
de terceros, como las DLL de libmpv, fijados por hash. Se publican siempre como prerelease, para que nunca figuren
como la última versión ni interfieran con el actualizador, y con la frase «no es una versión de Mado» en el título.
