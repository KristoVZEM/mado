# core — núcleo de fuentes de Mado

Paquete TypeScript sin dependencias que habla con animeav1: busca anime, lista episodios y
resuelve un episodio a un `Playable` (URL + cabeceras + user-agent) listo para mpv.

```ts
import { crearFuentes } from './src/index.ts';

const fuentes = crearFuentes();                       // en la app: { httpOptions: { fetch: tauriFetch } }
const [hit] = await fuentes.buscar('one piece');
const { episodes } = await fuentes.episodios(hit.slug);
const playable = await fuentes.resolver(hit.slug, 1, 'SUB');
```

## Errores

| Clase | Significa |
|---|---|
| `SinRed` | timeout, conexión rechazada o 5xx: fallo de red, no de la fuente |
| `Desafio` | Cloudflare pide un desafío; no se evade |
| `FuenteCambio` | la respuesta ya no tiene la forma esperada |
| `SinServidor` | ningún servidor resoluble para ese episodio (`causas` explica por qué) |

## Servidores

`resolver()` prueba los servidores en este orden y devuelve el primer `Playable` válido, con el
campo `servidor` del que ganó:

1. **Zilla** (HLS 1080p AV1): sale del propio JSON de la fuente, sin red extra.
2. **MP4Upload** (1080p por WebView oculto): solo entra si se pasa `capturarStream`, una función
   que carga el embed en un WebView y devuelve la URL del stream (en la app, el comando
   `resolve_webview`).
3. **Voe** (720p, último recurso): dos páginas más y una cadena ofuscada que Voe cambia cada tanto.
   El `Playable` trae `calidad` leída del `master.m3u8`. Su token dura unas 4 horas y va atado a la
   IP: no hay que guardarlo.

Si un servidor falla (`FuenteCambio`, `SinRed` o `Desafio` de un espejo), la cadena sigue con el
siguiente; si ninguno sirve, `SinServidor.causas` explica por qué falló cada uno. Cualquier otro
error se considera un bug y sube tal cual.

## Pruebas

- `npm test`: unitarias, sin red.
- `npm run smoke -- "<título>" <episodio> [SUB|DUB]`: contra el sitio real. Si el ISP bloquea
  Cloudflare, activar una VPN.
- `npm run smoke:voe -- <slug> <episodio> [SUB|DUB]`: comprueba Voe contra el sitio real (no imprime el token).

Requiere Node 24 (ejecuta `.ts` directamente: sin `enum`, `namespace` ni parámetros-propiedad).
