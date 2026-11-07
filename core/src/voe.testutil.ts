// Ayudante de pruebas: aplica la ofuscación de Voe (la inversa de desofuscarVoe) para armar fixtures.
const MARCADORES = ['@$', '^^', '~@', '%?', '*~', '!!', '#&'];

function rot13(texto: string): string {
  return texto.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

export function ofuscarVoe(datos: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(datos));
  const base64 = btoa(String.fromCharCode(...bytes));
  const invertida = [...base64].reverse().join('');
  const desplazada = [...invertida].map((c) => String.fromCharCode(c.charCodeAt(0) + 3)).join('');
  const base64b = btoa(desplazada);
  // Un marcador cada 7 caracteres, rotando; nunca dos juntos.
  let salida = '';
  for (let i = 0; i < base64b.length; i++) {
    if (i % 7 === 3) salida += MARCADORES[Math.floor(i / 7) % MARCADORES.length];
    salida += base64b[i];
  }
  return rot13(salida);
}

/** Página del reproductor de Voe: un bloque JSON con la cadena ofuscada. */
export function paginaVoe(datos: unknown): string {
  return `<!DOCTYPE html><html><body><script type="application/json">${JSON.stringify([ofuscarVoe(datos)])}</script></body></html>`;
}

/** Página de `voe.sx/e/<id>`: redirige por JavaScript a un dominio que rota. */
export function paginaRedireccionVoe(destino: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Redirecting...</title>
</head>
<body>
<script>
        if (typeof localStorage !== 'undefined') {
            const permanentToken = localStorage.getItem('permanentToken');
            if (permanentToken) {
                const currentUrl = new URL(window.location.href);
                currentUrl.searchParams.set('permanentToken', permanentToken);
                window.location.href = currentUrl.toString();
            } else {
                window.location.href = '${destino}';
            }
        } else {
            window.location.href = '${destino}';
        }
</script>
</body>
</html>`;
}
