# Seguridad

## Qué datos toca Mado

- Todo lo personal queda en tu equipo: historial, progreso y ajustes en una base SQLite dentro de la carpeta de datos
  locales de la app.
- El token de AniList y la clave de TMDB se guardan solo en el Administrador de credenciales de Windows. No van a la
  base de datos, ni a archivos, ni a los registros, y los mensajes de error nunca los incluyen.
- No hay telemetría ni cuentas propias. Las únicas conexiones son a las fuentes de vídeo, a AniList y a TMDB.

## Cómo avisar de un fallo

Si encuentras un problema de seguridad, **no abras una incidencia pública**. Usa el aviso privado de GitHub
(pestaña Security del repositorio, «Report a vulnerability»). Es un proyecto personal sin plazos garantizados, pero
se lee y se responde.

## Alcance

Entra en el alcance lo que afecte a quien usa la app: fugas del token o de la clave, escritura fuera de las carpetas de la app,
ejecución de código por contenido remoto o rutas de archivo mal validadas al importar o restaurar copias.
Quedan fuera los bloqueos de Cloudflare y los cambios en las fuentes de vídeo: no son fallos de seguridad.
