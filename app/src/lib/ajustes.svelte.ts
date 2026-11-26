import { idiomaDefectoDe, LIMITES, numeroDeAjuste, ordenDescendenteDe, volumenInicial } from './ajustes.ts';
import { actualizarAlAbrirDe } from './actualizacion.ts';
import { acentoDe, difuminarMiniaturasDe, inicioOcultasDe, tamanoPostersDe, temaDe, type TemaElegido } from './apariencia.ts';
import { cerrarABandejaDe } from './avisosAjustes.ts';
import { esperaDe } from './datosAjustes.ts';
import { guardarAjuste, leerAjuste } from './datos.ts';
import { ordenDe, type Orden } from './bibliotecaVista.ts';
import { aniskipActivoDe } from './intro.ts';
import { hwdecDe, recordarServidorDe, redimensionDe, siguienteAutoDe } from './reproduccion.ts';
import { SALTO_CORTO_S, SALTO_LARGO_S } from './saltos.ts';

/** Ajustes en memoria, con los valores por defecto hasta que `asegurarAjustes` los lee de la base. */
export const ajustes = $state({
  idiomaDefecto: 'SUB' as 'SUB' | 'DUB',
  ordenDescendente: false,
  volumen: 100,
  saltoCorto: SALTO_CORTO_S,
  saltoLargo: SALTO_LARGO_S,
  velocidad: 1,
  tema: 'oscuro' as TemaElegido,
  acento: 0,
  tamanoPosters: 1,
  inicioOcultas: 0,
  /** Difuminar la captura de los episodios sin ver en la Ficha, para no destripar. */
  difuminarMiniaturas: true,
  redimension: 0,
  hwdec: 0,
  siguienteAuto: true,
  recordarServidor: false,
  /** Servidor con el que sonó el último episodio; solo se usa con `recordarServidor`. */
  servidorUltimo: '',
  /** Posición en `ESPERAS_CONEXION` de lo que se espera a la fuente (1 = 15 s). */
  espera: 1,
  /** Al cerrar la ventana la app sigue en la bandeja del sistema. */
  cerrarABandeja: false,
  /** Comprobar si hay una versión nueva al abrir la app (una vez al día como mucho). */
  actualizarAlAbrir: true,
  /** Pedir a AniSkip el tramo del opening para el botón «Saltar intro». Apagado: consultar revela qué se ve. */
  aniskipActivo: false,
  /** Orden de la Biblioteca (ajuste `biblioteca_orden`). */
  ordenBiblioteca: 'ultimo' as Orden,
});

/** Guarda un ajuste sin esperar ni propagar fallos: los datos nunca bloquean la reproducción. */
/** Nombre para mostrar de un ajuste: las claves por serie (`idioma:<aid>`) se quedan en `idioma`, sin su identificador interno. */
function nombreAjuste(clave: string): string {
  return clave.split(':')[0];
}

export function guardarAjusteSilencioso(clave: string, valor: string): void {
  guardarAjuste(clave, valor).catch((e) => console.error(`no se pudo guardar el ajuste «${nombreAjuste(clave)}»`, e));
}

/** localStorage puede faltar o lanzar (ventana privada, datos bloqueados): se trata como ausente. */
function leerLocal(clave: string): string | null {
  try {
    return globalThis.localStorage?.getItem(clave) ?? null;
  } catch {
    return null;
  }
}

function quitarLocal(clave: string): void {
  try {
    globalThis.localStorage?.removeItem(clave);
  } catch {
    // Sin almacén no hay nada que limpiar.
  }
}

async function leerSeguro(clave: string): Promise<string | null> {
  try {
    return await leerAjuste(clave);
  } catch (e) {
    console.error(`no se pudo leer el ajuste ${clave}`, e);
    return null;
  }
}

async function cargar(): Promise<void> {
  const [volumen, corto, largo, velocidad, idiomaDefecto, ordenEpisodios, tema, acento, tamanoPosters, inicioOcultas, redimension, hwdec, siguienteAuto, recordarServidor, servidorUltimo, espera, cerrarABandeja, actualizarAlAbrir, difuminarMiniaturas, aniskipActivo, bibliotecaOrden] = await Promise.all([
    leerSeguro('volumen'),
    leerSeguro('salto_corto'),
    leerSeguro('salto_largo'),
    leerSeguro('velocidad'),
    leerSeguro('idioma_defecto'),
    leerSeguro('orden_episodios'),
    leerSeguro('tema'),
    leerSeguro('acento'),
    leerSeguro('tamano_posters'),
    leerSeguro('inicio_ocultas'),
    leerSeguro('redimension'),
    leerSeguro('hwdec'),
    leerSeguro('siguiente_auto'),
    leerSeguro('recordar_servidor'),
    leerSeguro('servidor_ultimo'),
    leerSeguro('espera_conexion'),
    leerSeguro('cerrar_a_bandeja'),
    leerSeguro('actualizar_al_abrir'),
    leerSeguro('difuminar_miniaturas'),
    leerSeguro('aniskip_activo'),
    leerSeguro('biblioteca_orden'),
  ]);
  ajustes.idiomaDefecto = idiomaDefectoDe(idiomaDefecto);
  ajustes.ordenDescendente = ordenDescendenteDe(ordenEpisodios);
  // Migración única del volumen: de localStorage (antes de existir la base) a la base.
  const inicial = volumenInicial(volumen, leerLocal('ukiku.volumen'));
  ajustes.volumen = inicial.valor;
  if (inicial.migrar) {
    guardarAjuste('volumen', String(inicial.valor)).then(
      () => quitarLocal('ukiku.volumen'),
      (e) => console.error('no se pudo migrar el volumen', e),
    );
  }
  ajustes.saltoCorto = numeroDeAjuste(corto, SALTO_CORTO_S, ...LIMITES.saltoCorto);
  ajustes.saltoLargo = numeroDeAjuste(largo, SALTO_LARGO_S, ...LIMITES.saltoLargo);
  ajustes.velocidad = numeroDeAjuste(velocidad, 1, ...LIMITES.velocidad);
  ajustes.tema = temaDe(tema);
  ajustes.acento = acentoDe(acento);
  ajustes.tamanoPosters = tamanoPostersDe(tamanoPosters);
  ajustes.inicioOcultas = inicioOcultasDe(inicioOcultas);
  ajustes.redimension = redimensionDe(redimension);
  ajustes.hwdec = hwdecDe(hwdec);
  ajustes.siguienteAuto = siguienteAutoDe(siguienteAuto);
  ajustes.recordarServidor = recordarServidorDe(recordarServidor);
  ajustes.servidorUltimo = servidorUltimo?.trim() ?? '';
  ajustes.espera = esperaDe(espera);
  ajustes.cerrarABandeja = cerrarABandejaDe(cerrarABandeja);
  ajustes.actualizarAlAbrir = actualizarAlAbrirDe(actualizarAlAbrir);
  ajustes.difuminarMiniaturas = difuminarMiniaturasDe(difuminarMiniaturas);
  ajustes.aniskipActivo = aniskipActivoDe(aniskipActivo);
  ajustes.ordenBiblioteca = ordenDe(bibliotecaOrden);
}

let cargado: Promise<void> | null = null;

/** Lee los ajustes de la base una sola vez (memoizada); nunca rechaza. */
export function asegurarAjustes(): Promise<void> {
  cargado ??= cargar().catch((e) => console.error('no se pudieron cargar los ajustes', e));
  return cargado;
}
