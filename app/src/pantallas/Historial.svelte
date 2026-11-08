<script lang="ts">
  import { onMount } from 'svelte';
  import Portada from '../lib/componentes/Portada.svelte';
  import { estadoDatos, listarHistorial, type EntradaHistorial } from '../lib/datos.ts';
  import { textoDeError } from '../lib/errores.ts';
  import { agruparPorDia } from '../lib/historial.ts';
  import { abrir } from '../lib/navegacion.svelte.ts';

  const PAGINA = 50;

  let entradas = $state<EntradaHistorial[]>([]);
  let cargando = $state(true);
  let hayMas = $state(false);
  let error = $state('');
  let avisoDatos = $state('');

  const grupos = $derived(agruparPorDia(entradas, Date.now()));

  async function cargarMas() {
    if (cargando && entradas.length > 0) return;
    cargando = true;
    error = '';
    try {
      const nuevas = await listarHistorial(PAGINA, entradas.length);
      entradas = [...entradas, ...nuevas];
      hayMas = nuevas.length === PAGINA;
    } catch (e) {
      console.error(e);
      error = textoDeError(e);
    } finally {
      cargando = false;
    }
  }

  onMount(async () => {
    try {
      avisoDatos = (await estadoDatos()) ?? '';
    } catch (e) {
      console.error(e);
      avisoDatos = textoDeError(e);
    }
    if (avisoDatos) {
      cargando = false;
      return;
    }
    await cargarMas();
  });

  function abrirFicha(e: EntradaHistorial) {
    abrir({ tipo: 'ficha', anime: { aid: e.aid, slug: e.slug, title: e.titulo } });
  }
</script>

<main class="pantalla">
  <h1>Historial</h1>

  {#if avisoDatos}<p class="error" role="alert">Datos locales no disponibles: {avisoDatos}</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if cargando && entradas.length === 0}<p>Cargando…</p>{/if}

  {#each grupos as g (g.etiqueta + g.entradas[0]?.vistoEn)}
    <section aria-label={g.etiqueta}>
      <h2>{g.etiqueta}</h2>
      <ul class="lista">
        {#each g.entradas as e (`${e.aid}-${e.numero}`)}
          <li>
            <button class="fila" onclick={() => abrirFicha(e)}>
              <span class="captura"><Portada aid={e.aid} titulo={e.titulo} numero={e.numero} /></span>
              <span class="texto">
                <strong>{e.titulo}</strong>
                <span>Ep. {e.numero}</span>
              </span>
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/each}

  {#if hayMas}
    <p><button onclick={cargarMas} disabled={cargando}>{cargando ? 'Cargando…' : 'Cargar más'}</button></p>
  {/if}

  {#if !cargando && !avisoDatos && !error && entradas.length === 0}
    <p>Todavía no has visto nada.</p>
  {/if}
</main>

<style>
  .lista {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 10px;
  }
  .fila {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    text-align: left;
  }
  .fila:hover:not(:disabled) {
    background: none;
  }
  .fila:hover :global(.portada),
  .fila:focus-visible :global(.portada) {
    outline: 2px solid var(--acento);
  }
  .captura {
    flex: 0 0 160px;
  }
  .texto {
    display: grid;
    gap: 2px;
  }
  .texto span {
    color: var(--texto-suave);
  }
</style>
