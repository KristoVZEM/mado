<script lang="ts">
  import { fuentes } from '../lib/fuentes.ts';
  import { mensajeDeError } from '../lib/errores.ts';
  import { abrir, nav } from '../lib/navegacion.svelte.ts';
  import { onMount } from 'svelte';
  import TarjetaPoster from '../lib/componentes/TarjetaPoster.svelte';
  import { continuarViendo, descartarProgreso, estadoDatos, leerAjuste, type EntradaContinuar } from '../lib/datos.ts';
  import { fraccionVista, idiomaGuardado, textoTarjeta } from '../lib/continuar.ts';
  import { asegurarAjustes } from '../lib/ajustes.svelte.ts';

  let cargando = $state(false);
  let error = $state('');

  let avisoDatos = $state('');
  let pendientes = $state<EntradaContinuar[]>([]);
  let abriendo = $state<number | null>(null);

  async function cargarPendientes() {
    try {
      avisoDatos = (await estadoDatos()) ?? '';
      pendientes = avisoDatos ? [] : await continuarViendo(12);
    } catch (e) {
      console.error(e);
      avisoDatos = mensajeDeError(e);
    }
  }

  onMount(async () => {
    await asegurarAjustes();
    await cargarPendientes();
    if (nav.catalogo.pendiente) {
      nav.catalogo.pendiente = false;
      await ejecutarBusqueda();
    }
  });

  async function retomar(p: EntradaContinuar) {
    if (abriendo !== null) return;
    abriendo = p.aid;
    error = '';
    try {
      const [ficha, idioma] = await Promise.all([
        fuentes.episodios(p.slug),
        leerAjuste(`idioma:${p.aid}`).catch(() => null),
      ]);
      const numeros = ficha.episodes.map((e) => e.number).sort((a, b) => a - b);
      if (!numeros.includes(p.numero)) throw new Error(`El episodio ${p.numero} ya no está en la lista.`);
      abrir({
        tipo: 'reproducir',
        anime: { aid: p.aid, slug: p.slug, title: p.titulo },
        numeros,
        numero: p.numero,
        idioma: idiomaGuardado(idioma),
      });
    } catch (e) {
      console.error(e);
      error = mensajeDeError(e);
    } finally {
      abriendo = null;
    }
  }

  async function descartar(p: EntradaContinuar) {
    try {
      await descartarProgreso(p.aid);
      pendientes = pendientes.filter((x) => x.aid !== p.aid);
    } catch (e) {
      console.error(e);
      error = mensajeDeError(e);
    }
  }

  async function ejecutarBusqueda() {
    const consulta = nav.catalogo.texto.trim();
    if (!consulta || cargando) return;
    cargando = true;
    error = '';
    try {
      nav.catalogo.resultados = await fuentes.buscar(consulta);
      nav.catalogo.buscado = true;
    } catch (e) {
      console.error(e);
      error = mensajeDeError(e);
      nav.catalogo.resultados = [];
    } finally {
      cargando = false;
    }
  }

  function buscar(evento: SubmitEvent) {
    evento.preventDefault();
    void ejecutarBusqueda();
  }
</script>

<main class="pantalla">
  <h1>Catálogo</h1>
  {#if avisoDatos}<p class="error" role="alert">Datos locales no disponibles: {avisoDatos}</p>{/if}

  {#if pendientes.length > 0}
    <section aria-label="Continuar viendo">
      <h2>Continuar viendo</h2>
      <ul class="pendientes">
        {#each pendientes as p (p.aid)}
          {@const fr = fraccionVista(p.posicionS, p.duracionS)}
          <li class="tarjeta">
            <button class="abrir" disabled={abriendo !== null} onclick={() => retomar(p)}>
              <strong>{p.titulo}</strong>
              <span>{abriendo === p.aid ? 'Abriendo…' : textoTarjeta(p.numero, p.posicionS, p.duracionS)}</span>
              {#if fr !== null}<progress value={fr} max="1"></progress>{/if}
            </button>
            <button class="x" aria-label={`Descartar ${p.titulo}`} onclick={() => descartar(p)}>✕</button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <form onsubmit={buscar}>
    <input bind:value={nav.catalogo.texto} placeholder="Buscar anime…" size="40" />
    <button type="submit" disabled={cargando}>Buscar</button>
  </form>

  {#if cargando}<p>Buscando…</p>{/if}
  {#if error}<p class="error">{error}</p>{/if}
  {#if nav.catalogo.buscado && !cargando && !error && nav.catalogo.resultados.length === 0}<p>Sin resultados.</p>{/if}

  <ul class="cuadricula">
    {#each nav.catalogo.resultados as r (r.aid)}
      <li><TarjetaPoster aid={r.aid} titulo={r.title} alAbrir={() => abrir({ tipo: 'ficha', anime: r })} /></li>
    {/each}
  </ul>
</main>

<style>
  .pendientes {
    list-style: none;
    padding: 0;
    display: flex;
    gap: 10px;
    overflow-x: auto;
  }
  .tarjeta {
    position: relative;
    flex: 0 0 220px;
  }
  .abrir {
    width: 100%;
    display: grid;
    gap: 4px;
    text-align: left;
    padding-right: 28px;
  }
  .abrir progress {
    width: 100%;
  }
  .x {
    position: absolute;
    top: 2px;
    right: 2px;
    padding: 0 6px;
  }
</style>
