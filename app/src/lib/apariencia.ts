import { numeroDeAjuste } from './ajustes.ts';

/** `tema`: lo que elige el usuario. `sistema` sigue al de Windows. */
export type TemaElegido = 'sistema' | 'claro' | 'oscuro';
export type TemaAplicado = 'claro' | 'oscuro';

export const TEMAS: readonly { id: TemaElegido; nombre: string }[] = [
  { id: 'sistema', nombre: 'Como el sistema' },
  { id: 'claro', nombre: 'Claro' },
  { id: 'oscuro', nombre: 'Oscuro' },
];

/** Valores guardados de cada opción: coinciden con el orden de las listas de arriba. */
export const LIMITES_APARIENCIA = {
  tema: [0, 2],
  acento: [0, 5],
  tamanoPosters: [0, 2],
  inicioOcultas: [0, 31],
} as const;

/** Sin ajuste guardado la app sigue oscura, como siempre; el claro y el del sistema se eligen. */
export function temaDe(valor: string | null | undefined): TemaElegido {
  return TEMAS[numeroDeAjuste(valor, TEMAS.findIndex((t) => t.id === 'oscuro'), ...LIMITES_APARIENCIA.tema)].id;
}

export function valorDeTema(tema: TemaElegido): string {
  return String(TEMAS.findIndex((t) => t.id === tema));
}

/** El tema que se pinta de verdad: con `sistema`, el que diga Windows. */
export function temaAplicado(elegido: TemaElegido, sistemaClaro: boolean): TemaAplicado {
  if (elegido === 'sistema') return sistemaClaro ? 'claro' : 'oscuro';
  return elegido;
}

/**
 * Acentos a elegir. El texto que va encima es siempre oscuro, así que todos son claros: así cumplen 4,5:1
 * (lo comprueba un test). No hay selector libre porque un color cualquiera rompería ese contraste.
 */
export const ACENTOS: readonly { nombre: string; color: string; hover: string }[] = [
  { nombre: 'Rosa', color: '#ff4d6d', hover: '#ff6a85' },
  { nombre: 'Violeta', color: '#b794ff', hover: '#c5aaff' },
  { nombre: 'Azul', color: '#5aa9ff', hover: '#78b9ff' },
  { nombre: 'Turquesa', color: '#2dd4bf', hover: '#4fe0cd' },
  { nombre: 'Verde', color: '#7bd94f', hover: '#92e46c' },
  { nombre: 'Naranja', color: '#ff9f43', hover: '#ffb066' },
];

export function acentoDe(valor: string | null | undefined): number {
  return numeroDeAjuste(valor, 0, ...LIMITES_APARIENCIA.acento);
}

/** Ancho del póster en px por tamaño; el normal es el de siempre. */
export const TAMANOS_POSTER: readonly { nombre: string; ancho: number }[] = [
  { nombre: 'Pequeño', ancho: 156 },
  { nombre: 'Normal', ancho: 188 },
  { nombre: 'Grande', ancho: 224 },
];

export function tamanoPostersDe(valor: string | null | undefined): number {
  return numeroDeAjuste(valor, 1, ...LIMITES_APARIENCIA.tamanoPosters);
}

/** Partes de Inicio que se pueden ocultar; el bit de cada una es `1 << posición`. */
export const PARTES_INICIO = [
  { id: 'destacados', nombre: 'Carrusel de destacados' },
  { id: 'continuar', nombre: 'Continuar viendo' },
  { id: 'nuevos', nombre: 'Nuevos episodios' },
  { id: 'siguiendo', nombre: 'Siguiendo' },
  { id: 'pendientes', nombre: 'Pendientes' },
] as const;

export type ParteInicio = (typeof PARTES_INICIO)[number]['id'];

export function inicioOcultasDe(valor: string | null | undefined): number {
  return numeroDeAjuste(valor, 0, ...LIMITES_APARIENCIA.inicioOcultas);
}

function bit(parte: ParteInicio): number {
  return 1 << PARTES_INICIO.findIndex((p) => p.id === parte);
}

export function parteOculta(mascara: number, parte: ParteInicio): boolean {
  return (mascara & bit(parte)) !== 0;
}

export function conParte(mascara: number, parte: ParteInicio, oculta: boolean): number {
  return oculta ? mascara | bit(parte) : mascara & ~bit(parte);
}

/** Luminancia relativa de un color `#rrggbb` (WCAG). */
function luminancia(hex: string): number {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(0) + 0.7152 * canal(1) + 0.0722 * canal(2);
}

/** Relación de contraste WCAG entre dos colores `#rrggbb`, de 1 a 21. */
export function contraste(a: string, b: string): number {
  const [la, lb] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (la + 0.05) / (lb + 0.05);
}
