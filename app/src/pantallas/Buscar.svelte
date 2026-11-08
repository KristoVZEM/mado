<script lang="ts">
  import { fuentes } from '../lib/fuentes.ts';
  import { mensajeDeError } from '../lib/errores.ts';
  import { irA } from '../lib/navegacion.svelte.ts';
  import { onMount } from 'svelte';
  import Ajustes from './Ajustes.svelte';
  import { continuarViendo, descartarProgreso, estadoDatos, leerAjuste, type EntradaContinuar } from '../lib/datos.ts';
  import { fraccionVista, idiomaGuardado, textoTarjeta } from '../lib/continuar.ts';
  import { asegurarAjustes } from '../lib/ajustes.svelte.ts';
  import type { ResultadoBusqueda } from '../../../core/src/index.ts';

  let texto = $state('');
  let resultados = $state<ResultadoBusqueda[]>([]);
  let cargando = $state(false);
  let error = $state('');
  let buscado = $state(false);

  let avisoDatos = $state('');
  let pendientes = $state<EntradaContinuar[]>([]);
  let abriendo = $state<number | null>(null);
  let verAjustes = $state(false);

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
      irA({
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

  async function buscar(evento: SubmitEvent) {
    evento.preventDefault();
    const consulta = texto.trim();
    if (!consulta || cargando) return;
    cargando = true;
    error = '';
    try {
      resultados = await fuentes.buscar(consulta);
      buscado = true;
    } catch (e) {
      console.error(e);
      error = mensajeDeError(e);
      resultados = [];
    } finally {
      cargando = false;
    }
  }
</script>

<main class="pantalla">
  <header class="cabecera">
    <h1>ukiku-pc</h1>
    <button onclick={() => irA({ tipo: 'biblioteca' })}>Biblioteca</button>
    <button onclick={() => (verAjustes = !verAjustes)} aria-label="Ajustes" aria-expanded={verAjustes}>⚙</button>
  </header>
  {#if avisoDatos}<p class="error" role="alert">Datos locales no disponibles: {avisoDatos}</p>{/if}
  {#if verAjustes}<Ajustes cerrar={() => (verAjustes = false)} datosOk={!avisoDatos} alImportar={cargarPendientes} />{/if}

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
    <input bind:value={texto} placeholder="Buscar anime…" size="40" />
    <button type="submit" disabled={cargando}>Buscar</button>
  </form>

  {#if cargando}<p>Buscando…</p>{/if}
  {#if error}<p class="error">{error}</p>{/if}
  {#if buscado && !cargando && !error && resultados.length === 0}<p>Sin resultados.</p>{/if}

  <ul class="resultados">
    {#each resultados as r (r.aid)}
      <li><button onclick={() => irA({ tipo: 'ficha', anime: r })}>{r.title}</button></li>
    {/each}
  </ul>
</main>

<style>
  .cabecera {
    display: flex;
    align-items: center;
    gap: 12px;
  }
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
  .resultados {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 6px;
    max-width: 640px;
  }
  .resultados button {
    width: 100%;
    text-align: left;
  }
</style>
