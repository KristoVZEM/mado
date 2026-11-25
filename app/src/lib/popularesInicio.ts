import { popularesEnEmision } from '../../../core/src/index.ts';
import { clienteAnilist } from './anilistCliente.ts';
import { leerAjuste, guardarAjuste } from './datos.ts';
import { fuentesFondo } from './fuentes.ts';
import { crearPopulares } from './popularesServicio.ts';

const CLAVE = 'inicio_populares';

/**
 * Las series que se emiten ahora, de más a menos populares, ya localizadas en animeav1 (las que la fuente no tiene se
 * saltan). Devuelve al instante la lista guardada y la renueva en segundo plano si venció; la lógica, en
 * `popularesServicio.ts`.
 */
export const popularesDeInicio = crearPopulares({
  leer: () => leerAjuste(CLAVE),
  guardar: (datos) => guardarAjuste(CLAVE, datos),
  populares: (n) => popularesEnEmision(clienteAnilist, n),
  buscar: (titulo) => fuentesFondo.buscar(titulo),
});
