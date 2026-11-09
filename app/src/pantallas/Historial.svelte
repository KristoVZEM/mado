<script lang="ts">
  import { onMount } from 'svelte';
  import Esqueleto from '../lib/componentes/Esqueleto.svelte';
  import Miniatura from '../lib/componentes/Miniatura.svelte';
  import Vacio from '../lib/componentes/Vacio.svelte';
  import { estadoDatos, listarHistorial, type EntradaHistorial } from '../lib/datos.ts';
  import { textoDeError } from '../lib/errores.ts';
  import { agruparPorDia } from '../lib/historial.ts';
  import { abrir, irASeccion } from '../lib/navegacion.svelte.ts';

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

  /** Hora local a la que se vio, «21:35». */
  function horaDe(ms: number): string {
    return new Date(ms).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  }

  function abrirFicha(e: EntradaHistorial) {
    abrir({ tipo: 'ficha', anime: { aid: e.aid, slug: e.slug, title: e.titulo } });
  }
</script>

<main class="pantalla">
  <h1>Historial</h1>

  {#if avisoDatos}<p class="error" role="alert">Datos locales no disponibles: {avisoDatos}</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if cargando && entradas.length === 0}<Esqueleto variante="fila" cantidad={6} />{/if}

  {#each grupos as g (g.etiqueta + g.entradas[0]?.vistoEn)}
    <section aria-label={g.etiqueta}>
      <h2 class="dia">{g.etiqueta}</h2>
      <ul class="lista">
        {#each g.entradas as e (`${e.aid}-${e.numero}`)}
          <li>
            <button class="fila" onclick={() => abrirFicha(e)}>
              <Miniatura aid={e.aid} titulo={e.titulo} numero={e.numero} />
              <span class="texto">
                <strong>{e.titulo}</strong>
                <span>Ep. {e.numero} · {horaDe(e.vistoEn)}</span>
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
    <Vacio titulo="Todavía no has visto nada" texto="Lo que veas aparecerá aquí, agrupado por el día en que lo viste.">
      <button class="principal" onclick={() => irASeccion('catalogo')}>Ir al Catálogo</button>
    </Vacio>
  {/if}
</main>

<style>
  section + section {
    margin-top: 32px;
  }
  .dia {
    margin: 0 0 16px;
    font-size: 1.5rem;
  }
  .lista {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 20px 16px;
  }
  .fila {
    display: grid;
    gap: 8px;
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    text-align: left;
  }
  .fila:hover:not(:disabled) {
    background: none;
  }
  .texto {
    display: grid;
    gap: 2px;
  }
  .texto strong {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 1rem;
    font-weight: 500;
  }
  .texto span {
    color: var(--texto-suave);
    font-size: 0.875rem;
  }
</style>
