// Humo contra la cuenta real: node scripts/smoke-sync.ts   (con ANILIST_TOKEN en el entorno)
// Solo LEE. Comprueba (1) que un token malo da NoAutorizado, (2) el usuario, (3) la forma de la lista.
import { crearClienteAnilist, crearLimitador, listaUsuario, NoAutorizado, obtenerUsuario } from '../src/index.ts';

const limitador = crearLimitador(20);
const token = process.env.ANILIST_TOKEN;
if (!token) throw new Error('Define ANILIST_TOKEN en el entorno (no en un archivo).');

const malo = crearClienteAnilist({ limitador, token: () => 'token.invalido.x' });
try {
  await obtenerUsuario(malo);
  console.log('FALLO: un token inválido NO dio NoAutorizado');
  process.exitCode = 1;
} catch (e) {
  console.log(
    e instanceof NoAutorizado
      ? 'OK  token inválido -> NoAutorizado'
      : `FALLO: dio ${(e as Error).name}: ${(e as Error).message}`,
  );
  if (!(e instanceof NoAutorizado)) process.exitCode = 1;
}

const bueno = crearClienteAnilist({ limitador, token: () => token });
const usuario = await obtenerUsuario(bueno);
console.log(`OK  usuario ${usuario.nombre} (id ${usuario.id})`);
const lista = await listaUsuario(bueno, usuario.id);
const porEstado = new Map<number, number>();
for (const r of lista) porEstado.set(r.estado, (porEstado.get(r.estado) ?? 0) + 1);
console.log(`OK  ${lista.length} entradas;`, Object.fromEntries(porEstado));
console.log('ej.:', lista.slice(0, 3));
