<script lang="ts">
  import { onMount } from 'svelte';
  import Portada from '../lib/componentes/Portada.svelte';
  import FilaDesplazable from '../lib/componentes/FilaDesplazable.svelte';
  import TarjetaPoster from '../lib/componentes/TarjetaPoster.svelte';
  import { asegurarAjustes } from '../lib/ajustes.svelte.ts';
  import { entradasDe, textoUltimoVisto } from '../lib/biblioteca.ts';
  import { fraccionVista, idiomaGuardado, textoRestante } from '../lib/continuar.ts';
  import {
    continuarViendo,
    descartarProgreso,
    estadoDatos,
    leerAjuste,
    listarBiblioteca,
    type EntradaBiblioteca,
    type EntradaContinuar,
  } from '../lib/datos.ts';
  import { mensajeDeError, textoDeError } from '../lib/errores.ts';
  import { fuentes } from '../lib/fuentes.ts';
  import { abrir, buscarEnCatalogo, irASeccion, nav } from '../lib/navegacion.svelte.ts';

  /** Tope de tarjetas por fila; el resto se ve en Biblioteca. */
  const MAX_FILA = 20;

  let texto = $state('');
  let avisoDatos = $state('');
  let error = $state('');
  let pendientes = $state<EntradaContinuar[]>([]);
  let viendo = $state<EntradaBiblioteca[]>([]);
  let cargando = $state(true);
  let abriendo = $state<number | null>(null);

  onMount(async () => {
    await asegurarAjustes();
    try {
      avisoDatos = (await estadoDatos()) ?? '';
      if (!avisoDatos) {
        // Cada fila carga por separado: que falle una no tapa la otra.
        const [c, b] = await Promise.allSettled([continuarViendo(12), listarBiblioteca()]);
        if (c.status === 'fulfilled') pendientes = c.value;
        else error = textoDeError(c.reason);
        if (b.status === 'fulfilled') viendo = entradasDe(b.value, 'viendo');
        else error = textoDeError(b.reason);
      }
    } catch (e) {
      console.error(e);
      avisoDatos = mensajeDeError(e);
    } finally {
      cargando = false;
    }
  });

  function buscar(evento: SubmitEvent) {
    evento.preventDefault();
    const consulta = texto.trim();
    if (consulta) buscarEnCatalogo(consulta);
  }

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
      error = textoDeError(e);
    }
  }

  function verTodoSiguiendo() {
    nav.pestana = 'viendo';
    irASeccion('biblioteca');
  }

  function abrirFicha(e: EntradaBiblioteca) {
    abrir({ tipo: 'ficha', anime: { aid: e.aid, slug: e.slug, title: e.titulo } });
  }
</script>

<main class="pantalla">
  <h1>Inicio</h1>

  <form onsubmit={buscar}>
    <input bind:value={texto} placeholder="Buscar anime…" size="40" aria-label="Buscar anime" />
    <button type="submit">Buscar</button>
  </form>

  {#if avisoDatos}<p class="error" role="alert">Datos locales no disponibles: {avisoDatos}</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if cargando}<p>Cargando…</p>{/if}

  {#if pendientes.length > 0}
    <section aria-label="Continuar viendo">
      <h2>Continuar viendo</h2>
      <FilaDesplazable etiqueta="Continuar viendo">
        {#each pendientes as p (p.aid)}
          {@const fr = fraccionVista(p.posicionS, p.duracionS)}
          <li class="continuar">
            <button class="abrir" disabled={abriendo !== null} onclick={() => retomar(p)}>
              <Portada aid={p.aid} titulo={p.titulo} numero={p.numero} />
              <strong>{p.titulo}</strong>
              <span>{abriendo === p.aid ? 'Abriendo…' : textoRestante(p.numero, p.posicionS, p.duracionS)}</span>
              {#if fr !== null}<progress value={fr} max="1"></progress>{/if}
            </button>
            <button class="x" aria-label={`Descartar ${p.titulo}`} onclick={() => descartar(p)}>✕</button>
          </li>
        {/each}
      </FilaDesplazable>
    </section>
  {/if}

  {#if viendo.length > 0}
    <section aria-label="Siguiendo">
      <h2>Siguiendo</h2>
      <FilaDesplazable etiqueta="Siguiendo">
        {#each viendo.slice(0, MAX_FILA) as e (e.aid)}
          <li class="poster">
            <TarjetaPoster
              aid={e.aid}
              titulo={e.titulo}
              subtitulo={textoUltimoVisto(e.ultimoEpisodio) ?? undefined}
              alAbrir={() => abrirFicha(e)}
            />
          </li>
        {/each}
      </FilaDesplazable>
      {#if viendo.length > MAX_FILA}
        <button onclick={verTodoSiguiendo}>Ver las {viendo.length} en Biblioteca</button>
      {/if}
    </section>
  {/if}

  {#if !cargando && !avisoDatos && !error && pendientes.length === 0 && viendo.length === 0}
    <p>Aún no hay nada por aquí. Busca una serie en el Catálogo o importa tu copia de Ukiku desde Ajustes.</p>
  {/if}
</main>

<style>
  .continuar {
    position: relative;
    flex: 0 0 280px;
  }
  .poster {
    flex: 0 0 150px;
  }
  .abrir {
    width: 100%;
    display: grid;
    gap: 6px;
    padding: 0;
    border: 0;
    background: none;
    text-align: left;
  }
  .abrir:hover:not(:disabled) {
    background: none;
  }
  .abrir:hover:not(:disabled) :global(.portada),
  .abrir:focus-visible :global(.portada) {
    outline: 2px solid var(--acento);
  }
  .abrir span {
    color: var(--texto-suave);
  }
  .abrir progress {
    width: 100%;
  }
  .x {
    position: absolute;
    top: 6px;
    right: 6px;
    padding: 0 6px;
    background: rgb(0 0 0 / 0.6);
  }
</style>
