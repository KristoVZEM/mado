// Texto que se escribe en el archivo de registro a partir de lo que recibió `console.error` o `console.warn`.
// De un error se anota nombre, mensaje y pila, nunca `cause` (puede llevar la URL completa de un stream), y a
// toda URL se le quita el query y el fragmento, que es donde viajan los tokens.

const TOPE = 4000;

function sinQuery(texto: string): string {
  return texto.replace(/(https?:\/\/[^\s?#"'<>)]+)[?#][^\s"'<>)]*/g, '$1');
}

function unaParte(valor: unknown): string {
  if (valor instanceof Error) {
    const cabecera = `${valor.name}: ${valor.message}`;
    // En WebView2 la pila ya empieza por la cabecera; se evita repetirla.
    if (!valor.stack) return cabecera;
    return valor.stack.startsWith(cabecera) ? valor.stack : `${cabecera}\n${valor.stack}`;
  }
  if (typeof valor === 'string') return valor;
  try {
    return JSON.stringify(valor) ?? String(valor);
  } catch {
    return String(valor);
  }
}

export function textoParaRegistro(partes: unknown[]): string {
  const texto = sinQuery(partes.map(unaParte).join(' '));
  return texto.length > TOPE ? `${texto.slice(0, TOPE)}… (recortado)` : texto;
}
