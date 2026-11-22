# Seguridad

## Qué datos toca Mado

- Todo lo personal queda en tu equipo: historial, progreso y ajustes en una base SQLite dentro de la carpeta de datos
  locales de la app.
- El token de AniList y la clave de TMDB se guardan solo en el Administrador de credenciales de Windows. No van a la
  base de datos, ni a archivos, ni a los registros, y los mensajes de error nunca los incluyen.
- No hay telemetría ni cuentas propias. Las únicas conexiones son a las fuentes de vídeo, a AniList, a TMDB y a
  GitHub para comprobar si hay una versión nueva (se puede apagar en Ajustes).

## Actualizaciones y firma

- Los instaladores los construye el flujo de publicación de GitHub Actions a partir de una etiqueta que debe estar sobre
  `main`, y los firma con una clave minisign. La app lleva incorporada la clave pública y solo instala una actualización
  cuya firma coincide.
- La clave privada está cifrada con una contraseña y vive como secreto de un Environment de GitHub (`release`) que
  exige la aprobación del mantenedor cada vez que el flujo la usa. La cuenta del mantenedor tiene verificación en dos
  pasos.
- Cada release se crea como borrador y la publica una persona después de revisarla. El instalador incluye una atestación
  de procedencia que se puede comprobar con `gh attestation verify`, y un `SHA256SUMS`.
- El instalador no está firmado con un certificado de Windows (de pago), así que SmartScreen puede avisar al ejecutarlo.
- Si sospechas que la clave de firma se ha comprometido, usa el aviso privado de más abajo.

## Cómo avisar de un fallo

Si encuentras un problema de seguridad, **no abras una incidencia pública**. Usa el aviso privado de GitHub
(pestaña Security del repositorio, «Report a vulnerability»). Es un proyecto personal sin plazos garantizados, pero
se lee y se responde.

## Alcance

Entra en el alcance lo que afecte a quien usa la app: fugas del token o de la clave, escritura fuera de las carpetas de la app,
ejecución de código por contenido remoto o rutas de archivo mal validadas al importar o restaurar copias.
También entra la firma de las actualizaciones: que la app instale algo que no esté firmado con la clave correcta.
Quedan fuera los bloqueos de Cloudflare y los cambios en las fuentes de vídeo: no son fallos de seguridad.
