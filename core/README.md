# core — núcleo de fuentes de ukiku-pc

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

## Pruebas

- `npm test`: unitarias, sin red.
- `npm run smoke -- "<título>" <episodio> [SUB|DUB]`: contra el sitio real. Si el ISP bloquea
  Cloudflare, activar una VPN.

Requiere Node 24 (ejecuta `.ts` directamente: sin `enum`, `namespace` ni parámetros-propiedad).
