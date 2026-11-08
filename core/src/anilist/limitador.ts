export interface Reloj {
  now(): number;
  sleep(ms: number): Promise<void>;
}

const RELOJ_REAL: Reloj = { now: Date.now, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

/** Ventana deslizante de un minuto: como mucho `porMinuto` peticiones; las demás esperan su turno. */
export function crearLimitador(porMinuto: number, reloj: Reloj = RELOJ_REAL) {
  const marcas: number[] = [];
  let cola: Promise<void> = Promise.resolve();

  function esperar(): Promise<void> {
    const mio = cola.then(async () => {
      for (;;) {
        const t = reloj.now();
        while (marcas.length > 0 && marcas[0]! <= t - 60_000) marcas.shift();
        if (marcas.length < porMinuto) {
          marcas.push(t);
          return;
        }
        await reloj.sleep(marcas[0]! + 60_000 - t);
      }
    });
    cola = mio.catch(() => {});
    return mio;
  }

  return { esperar };
}
