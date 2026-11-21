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

## Cómo sacar una release

Solo para quien mantiene el repositorio. Las releases salen del flujo `Publicar release`, que compila, firma y deja un
borrador.

1. Sube la versión en `app/src-tauri/tauri.conf.json`, `app/package.json` y `app/src-tauri/Cargo.toml` (con sus
   `Cargo.lock` y `package-lock.json`) y añade la entrada del `CHANGELOG.md`. Abre el PR y fusiónalo. Esa entrada es
   obligatoria (el flujo falla sin ella) y es lo que verán los usuarios: se publica como cuerpo de la release y la app la
   enseña como «Novedades» al ofrecer la actualización. Escríbela para ellos, con el formato de las anteriores
   (`## X.Y.Z — fecha`, una frase de resumen y listas bajo `### Nuevo` o `### Cambia`); la app solo pinta títulos,
   viñetas y negritas, y recorta lo que pase de 4000 caracteres.
2. Crea la etiqueta sobre `main` y súbela: `git tag vX.Y.Z && git push origin vX.Y.Z`. El flujo falla si la etiqueta no
   está sobre `main` o si su versión no es la de `tauri.conf.json`.
3. Aprueba el Environment `release` en la ejecución de Actions: sin esa aprobación no se usa la clave de firma.
4. Revisa el borrador: instalador, `.sig`, `latest.json` y `SHA256SUMS`, y comprueba la atestación con
   `gh attestation verify`. Pruébalo en un Windows limpio.
5. Publica el borrador. Una etiqueta con sufijo (`vX.Y.Z-prueba`) sale como prerelease en borrador, para ensayar el flujo;
   bórrala junto con su borrador al terminar.

### Si se pierde la clave de firma

Sin la clave privada o su contraseña no se pueden firmar más actualizaciones para las apps ya instaladas. Hay que
generar un par nuevo (`npm run tauri signer generate` en `app/`), poner la clave pública nueva en `tauri.conf.json`,
cambiar los dos secretos del Environment `release` y publicar una versión nueva. Quien tenga la versión anterior debe
instalarla a mano una vez. Por eso la clave y su contraseña se guardan copiadas fuera del repositorio y de GitHub.
