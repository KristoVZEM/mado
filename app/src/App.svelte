<script lang="ts">
  import Armazon from './Armazon.svelte';
  import Ajustes from './pantallas/Ajustes.svelte';
  import Biblioteca from './pantallas/Biblioteca.svelte';
  import Catalogo from './pantallas/Catalogo.svelte';
  import Emision from './pantallas/Emision.svelte';
  import Inicio from './pantallas/Inicio.svelte';
  import Historial from './pantallas/Historial.svelte';
  import Ficha from './pantallas/Ficha.svelte';
  import Reproductor from './pantallas/Reproductor.svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { ajustes, asegurarAjustes } from './lib/ajustes.svelte.ts';
  import { onMount } from 'svelte';
  import { ejecutarAlCerrar } from './lib/cierre.ts';
  import { asegurarVinculo } from './lib/anilistServicio.ts';
  import { estadoDatos, guardarAjuste, leerAjuste, pendientesEmparejar, reintentarNingunos } from './lib/datos.ts';
  import { crearEmparejador } from './lib/emparejado.ts';
  import { reintentarSiCambiaronLasReglas } from './lib/reglasEmparejado.ts';
  import { abrir, cerrarSuperior, nav, irABusqueda } from './lib/navegacion.svelte.ts';
  import { iniciarAvisos } from './lib/avisosApp.ts';
  import { iniciarRespaldoAutomatico } from './lib/respaldoApp.ts';
  import { iniciarApariencia } from './lib/aplicarApariencia.svelte.ts';
  import { repasarVinculosAlAbrir, sincronizarAlAbrir } from './lib/sync.svelte.ts';

  const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  // Empareja las series con AniList en segundo plano, poco a poco y reanudándose en cada arranque.
  // Todo es opcional: cualquier fallo se queda en la consola y no afecta a la app.
  onMount(() => {
    iniciarApariencia(); // dura lo que la app: no hace falta detenerla
    // El icono de la bandeja solo se ve si el usuario eligió seguir ahí al cerrar.
    void asegurarAjustes()
      .then(() => invoke('bandeja_visible', { visible: ajustes.cerrarABandeja }))
      .catch((e) => console.error('icono de la bandeja:', e));
    void dormir(15_000).then(iniciarRespaldoAutomatico);
    // Cerrar con la X: se retiene el cierre, se guarda lo pendiente (progreso, volumen) y se cierra.
    // `ejecutarAlCerrar` tiene tope de tiempo, así que la ventana nunca queda colgada.
    void getCurrentWindow()
      .onCloseRequested(async (evento) => {
        evento.preventDefault();
        await ejecutarAlCerrar();
        // Cerrar desde el Reproductor a pantalla completa: se sale antes, para que el tamaño que se recuerda
        // sea el de la ventana y no el del monitor.
        await getCurrentWindow().setFullscreen(false).catch(() => {});
        await asegurarAjustes();
        if (ajustes.cerrarABandeja) {
          // La app sigue viva en la bandeja (para los avisos). El Reproductor se cierra: al salir guarda y para el vídeo.
          if (nav.superior?.tipo === 'reproducir') abrir({ tipo: 'ficha', anime: nav.superior.anime });
          try {
            await invoke('bandeja_visible', { visible: true });
            await getCurrentWindow().hide();
            return;
          } catch (e) {
            // Sin icono o sin poder esconderla, mejor cerrar de verdad que dejar una ventana inalcanzable.
            console.error('no se pudo pasar a la bandeja:', e);
          }
        }
        await getCurrentWindow().destroy();
      })
      .catch((e) => console.error('cierre de la ventana:', e));
    // La sincronización con la cuenta de AniList corre aparte del emparejador y comparte su limitador.
    void dormir(8000).then(repasarVinculosAlAbrir).then(sincronizarAlAbrir).then(iniciarAvisos);
    void (async () => {
      try {
        await dormir(5000); // no competir con el arranque
        if (await estadoDatos()) return;
        // Antes de pedir las pendientes: si las reglas cambiaron, los `ninguno` entran en esta misma pasada.
        await reintentarSiCambiaronLasReglas({
          version: async () => Number((await leerAjuste('anilist_reglas_emparejado')) ?? 0) || 0,
          guardarVersion: (n) => guardarAjuste('anilist_reglas_emparejado', String(n)),
          reintentarNingunos,
        });
        await crearEmparejador({
          pendientes: pendientesEmparejar,
          emparejar: async (p) => {
            const r = await asegurarVinculo({ aid: p.aid, slug: p.slug, titulo: p.titulo });
            return r.actual ? 'ok' : 'error';
          },
          pausa: dormir,
          activo: () => !document.hidden,
        }).correr();
      } catch (e) {
        console.error(e);
      }
    })();
  });
</script>

<!-- Ctrl+K lleva a la búsqueda del Catálogo desde cualquier pantalla menos el Reproductor (ahí manda el vídeo). -->
<svelte:window
  onkeydown={(e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k' && nav.superior?.tipo !== 'reproducir') {
      e.preventDefault();
      irABusqueda();
    }
    // Alt+←: volver, como en un navegador. En el Reproductor ya está Esc.
    if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key === 'ArrowLeft' && nav.superior?.tipo === 'ficha') {
      e.preventDefault();
      cerrarSuperior();
    }
  }}
  onmouseup={(e) => {
    // Botón «atrás» del ratón.
    if (e.button === 3 && nav.superior?.tipo === 'ficha') {
      e.preventDefault();
      cerrarSuperior();
    }
  }}
/>

{#if nav.superior?.tipo === 'reproducir'}
  {#key nav.superior.numero}
    <Reproductor
      anime={nav.superior.anime}
      numeros={nav.superior.numeros}
      numero={nav.superior.numero}
      idioma={nav.superior.idioma}
    />
  {/key}
{:else}
  <Armazon>
    {#if nav.superior?.tipo === 'ficha'}
      {#key nav.superior.anime.aid}
        <Ficha anime={nav.superior.anime} />
      {/key}
    {:else if nav.seccion === 'inicio'}
      <Inicio />
    {:else if nav.seccion === 'catalogo'}
      <Catalogo />
    {:else if nav.seccion === 'emision'}
      <Emision />
    {:else if nav.seccion === 'biblioteca'}
      <Biblioteca />
    {:else if nav.seccion === 'historial'}
      <Historial />
    {:else if nav.seccion === 'ajustes'}
      <Ajustes />
    {/if}
  </Armazon>
{/if}
