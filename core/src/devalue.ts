import { FuenteCambio } from './errors.ts';

interface SvelteNode {
  type: string;
  data?: unknown[];
}

export function unflatten(table: unknown[]): unknown {
  const memo = new Map<number, unknown>();

  const hydrate = (i: number): unknown => {
    if (i === -1) return undefined;
    // Numeración de devalue 5.x (src/constants.js): -2 HOLE, -3 NaN, -4 +Inf, -5 -Inf, -6 -0.
    if (i === -2) return undefined;
    if (i === -3) return NaN;
    if (i === -4) return Infinity;
    if (i === -5) return -Infinity;
    if (i === -6) return -0;
    if (memo.has(i)) return memo.get(i);

    const v = table[i];
    if (v === null || typeof v !== 'object') {
      memo.set(i, v);
      return v;
    }
    if (Array.isArray(v)) {
      if (typeof v[0] === 'string') {
        throw new FuenteCambio(`devalue: tipo no soportado "${v[0]}"`);
      }
      const out: unknown[] = [];
      memo.set(i, out);
      for (const ref of v) out.push(hydrate(ref as number));
      return out;
    }
    const out: Record<string, unknown> = {};
    memo.set(i, out);
    for (const [k, ref] of Object.entries(v)) {
      // defineProperty evita que una clave remota "__proto__" cambie el prototipo del resultado.
      Object.defineProperty(out, k, {
        value: hydrate(ref as number),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return out;
  };

  return hydrate(0);
}

export function decodePage(payload: { nodes: Array<SvelteNode | null> }): Record<string, any> {
  if (!payload || !Array.isArray(payload.nodes)) {
    throw new FuenteCambio('devalue: la respuesta no trae "nodes"');
  }
  const dataNodes = payload.nodes.filter(
    (n): n is SvelteNode => n?.type === 'data' && Array.isArray(n.data),
  );
  const last = dataNodes.at(-1);
  if (!last) throw new FuenteCambio('devalue: la respuesta no trae nodo de datos');
  const page = unflatten(last.data as unknown[]);
  if (page === null || typeof page !== 'object' || Array.isArray(page)) {
    throw new FuenteCambio('devalue: la página decodificada no es un objeto');
  }
  return page as Record<string, any>;
}
