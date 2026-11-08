<script lang="ts">
  import { onMount } from 'svelte';
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
  <h1>{ficha?.title || anime.title}</h1>

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
