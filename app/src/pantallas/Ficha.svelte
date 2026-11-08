<script lang="ts">
  import { onMount } from 'svelte';
  import Portada from '../lib/componentes/Portada.svelte';
  import { fuentes } from '../lib/fuentes.ts';
  import { mensajeDeError, textoDeError } from '../lib/errores.ts';
  import { abrir, cerrarSuperior } from '../lib/navegacion.svelte.ts';
  import { alternarFavorito, episodiosVistos, esFavorito, estadoSerie, fijarEstado, leerAjuste } from '../lib/datos.ts';
  import { idiomaGuardado } from '../lib/continuar.ts';
  import { ESTADOS } from '../lib/biblioteca.ts';
  import type { Ficha, Idioma, ResultadoBusqueda } from '../../../core/src/index.ts';

  let { anime }: { anime: ResultadoBusqueda } = $props();

  let ficha = $state<Ficha | null>(null);
  let cargando = $state(true);
  let error = $state('');
  let idioma = $state<Idioma>('SUB');
  let vistos = $state(new Set<number>());

  // Biblioteca: solo se ofrece si se pudo leer al abrir. `estado` 0 = Ninguno.
  let bibliotecaOk = $state(false);
  let estado = $state(0);
  let favorito = $state(false);
  let guardando = $state(false);
  let avisoBiblioteca = $state('');

  let sinopsisAbierta = $state(false);
  /** Estado de emisión y géneros, en una sola línea. */
  const meta = $derived(ficha ? [ficha.status, ...ficha.genres].filter(Boolean) : []);
  const larga = $derived((ficha?.synopsis.length ?? 0) > 280);

  const numeros = $derived(ficha ? ficha.episodes.map((e) => e.number).sort((a, b) => a - b) : []);
  const serie = $derived({ aid: anime.aid, slug: anime.slug, titulo: ficha?.title || anime.title });

  onMount(async () => {
    // Los datos locales son accesorios: si fallan, la ficha funciona igual, sin ✓, en SUB y sin
    // estado ni favorito.
    const datos = Promise.all([
      episodiosVistos(anime.aid).catch(() => [] as number[]),
      leerAjuste(`idioma:${anime.aid}`).catch(() => null),
    ]).then(([v, i]) => {
      vistos = new Set(v);
      idioma = idiomaGuardado(i);
    });
    const biblioteca = Promise.all([estadoSerie(anime.aid), esFavorito(anime.aid)])
      .then(([e, f]) => {
        estado = e ?? 0;
        favorito = f;
        bibliotecaOk = true;
      })
      .catch((e) => console.error(e));
    try {
      ficha = await fuentes.episodios(anime.slug);
    } catch (e) {
      console.error(e);
      error = mensajeDeError(e);
    } finally {
      cargando = false;
    }
    await Promise.all([datos, biblioteca]);
  });

  function reproducir(numero: number) {
    abrir({ tipo: 'reproducir', anime, numeros, numero, idioma });
  }

  /** Muestra el estado nuevo mientras se guarda; si falla, vuelve al anterior y avisa. */
  async function cambiarEstado(evento: Event & { currentTarget: HTMLSelectElement }) {
    const anterior = estado;
    const nuevo = Number(evento.currentTarget.value);
    estado = nuevo;
    guardando = true;
    avisoBiblioteca = '';
    try {
      await fijarEstado(serie, nuevo);
    } catch (e) {
      console.error(e);
      estado = anterior;
      avisoBiblioteca = `No se pudo guardar el estado: ${textoDeError(e)}`;
    } finally {
      guardando = false;
    }
  }

  async function alternar() {
    guardando = true;
    avisoBiblioteca = '';
    try {
      favorito = await alternarFavorito(serie);
    } catch (e) {
      console.error(e);
      avisoBiblioteca = `No se pudo cambiar el favorito: ${textoDeError(e)}`;
    } finally {
      guardando = false;
    }
  }
</script>

<main class="pantalla">
  <button onclick={cerrarSuperior}>← Volver</button>
  <div class="cabecera">
    <div class="portada-ficha"><Portada aid={anime.aid} titulo={ficha?.title || anime.title} /></div>
    <div class="datos">
      <h1>{ficha?.title || anime.title}</h1>
      {#if meta.length > 0}<p class="meta">{meta.join(' · ')}</p>{/if}
      {#if ficha?.synopsis}
        <p class="sinopsis" class:recortada={larga && !sinopsisAbierta}>{ficha.synopsis}</p>
        {#if larga}
          <button class="enlace" aria-expanded={sinopsisAbierta} onclick={() => (sinopsisAbierta = !sinopsisAbierta)}>
            {sinopsisAbierta ? 'Ver menos' : 'Ver más'}
          </button>
        {/if}
      {/if}
      {#if bibliotecaOk}
        <p class="biblioteca">
          <label>
            Estado:
            <select value={estado} onchange={cambiarEstado} disabled={guardando}>
              <option value={0}>Ninguno</option>
              {#each ESTADOS as e (e.valor)}<option value={e.valor}>{e.nombre}</option>{/each}
            </select>
          </label>
          <button
            onclick={alternar}
            disabled={guardando}
            aria-pressed={favorito}
            aria-label={favorito ? 'Quitar de favoritos' : 'Marcar como favorito'}>{favorito ? '★' : '☆'}</button
          >
        </p>
        {#if avisoBiblioteca}<p class="error" role="alert">{avisoBiblioteca}</p>{/if}
      {/if}
    </div>
  </div>

  {#if cargando}<p>Cargando episodios…</p>{/if}
  {#if error}<p class="error">{error}</p>{/if}

  {#if ficha}
    <p>
      Idioma:
      <button disabled={idioma === 'SUB'} onclick={() => (idioma = 'SUB')}>SUB</button>
      <button disabled={idioma === 'DUB'} onclick={() => (idioma = 'DUB')}>DUB</button>
      · {numeros.length} episodios
    </p>
    <div class="episodios">
      {#each numeros as n (n)}
        <button class:visto={vistos.has(n)} onclick={() => reproducir(n)}>
          {n}{#if vistos.has(n)}<span class="marca" aria-label="visto"> ✓</span>{/if}
        </button>
      {/each}
    </div>
  {/if}
</main>

<style>
  .cabecera {
    display: grid;
    grid-template-columns: 170px 1fr;
    gap: 24px;
    align-items: start;
    margin: 16px 0 24px;
  }
  .datos h1 {
    margin: 0 0 4px;
  }
  .meta {
    margin: 0 0 12px;
    color: var(--texto-suave);
  }
  .sinopsis {
    margin: 0 0 4px;
    max-width: 70ch;
    line-height: 1.55;
  }
  .sinopsis.recortada {
    display: -webkit-box;
    -webkit-line-clamp: 6;
    line-clamp: 6;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .enlace {
    padding: 0;
    border: 0;
    background: none;
    color: var(--acento);
    margin-bottom: 12px;
  }
  .biblioteca {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .episodios {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .episodios button {
    min-width: 52px;
  }
  .episodios button.visto {
    opacity: 0.65;
  }
  .marca {
    color: #4caf50;
  }
</style>
