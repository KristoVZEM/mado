import { getCurrentWindow } from '@tauri-apps/api/window';
import { ACENTOS, TAMANOS_POSTER, temaAplicado, type TemaAplicado } from './apariencia.ts';
import { ajustes, asegurarAjustes } from './ajustes.svelte.ts';

const CLAVE_TEMA = 'mado.tema';
/** Clave de antes del cambio de nombre: se sigue leyendo para no perder el tema elegido. */
const CLAVE_TEMA_ANTIGUA = 'ukiku.tema';

function leerTemaGuardado(): TemaAplicado | null {
  try {
    const v = globalThis.localStorage?.getItem(CLAVE_TEMA) ?? globalThis.localStorage?.getItem(CLAVE_TEMA_ANTIGUA);
    return v === 'claro' || v === 'oscuro' ? v : null;
  } catch {
    return null;
  }
}

function guardarTema(t: TemaAplicado): void {
  try {
    globalThis.localStorage?.setItem(CLAVE_TEMA, t);
  } catch {
    // Sin almacén, el próximo arranque pinta el tema por defecto un instante.
  }
}

/** Pinta el último tema usado antes de montar la app, para no ver un fogonazo oscuro al abrir en claro. */
export function aplicarTemaGuardado(): void {
  document.documentElement.dataset.tema = leerTemaGuardado() ?? 'oscuro';
}

/** Aplica tema, acento y tamaño de pósters al documento y los mantiene al día. Devuelve cómo detenerlo. */
export function iniciarApariencia(): () => void {
  const claro = globalThis.matchMedia?.('(prefers-color-scheme: light)');
  let sistemaClaro = $state(claro?.matches ?? false);
  const alCambiarSistema = (e: MediaQueryListEvent) => (sistemaClaro = e.matches);
  claro?.addEventListener('change', alCambiarSistema);

  void asegurarAjustes();

  const parar = $effect.root(() => {
    $effect(() => {
      const tema = temaAplicado(ajustes.tema, sistemaClaro);
      document.documentElement.dataset.tema = tema;
      guardarTema(tema);
      // La barra de título de Windows sigue al tema de la app; si no se puede, se queda como estaba.
      void getCurrentWindow()
        .setTheme(tema === 'claro' ? 'light' : 'dark')
        .catch(() => {});
    });
    $effect(() => {
      const a = ACENTOS[ajustes.acento] ?? ACENTOS[0];
      const raiz = document.documentElement.style;
      raiz.setProperty('--acento', a.color);
      raiz.setProperty('--acento-hover', a.hover);
    });
    $effect(() => {
      const t = TAMANOS_POSTER[ajustes.tamanoPosters] ?? TAMANOS_POSTER[1];
      document.documentElement.style.setProperty('--ancho-poster', `${t.ancho}px`);
    });
  });

  return () => {
    parar();
    claro?.removeEventListener('change', alCambiarSistema);
  };
}
