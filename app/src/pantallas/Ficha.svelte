<script lang="ts">
  import { onMount } from 'svelte';
  import Portada from '../lib/componentes/Portada.svelte';
  import { fuentes } from '../lib/fuentes.ts';
  import { mensajeDeError, textoDeError } from '../lib/errores.ts';
  import { abrir, buscarEnCatalogo, cerrarSuperior } from '../lib/navegacion.svelte.ts';
  import {
    alternarFavorito,
    desmarcarVisto,
    episodiosVistos,
    esFavorito,
    estadoSerie,
    fijarEstado,
    leerAjuste,
    vinculoConMedia,
    type RelacionAnilist,
    type VinculoConMedia,
  } from '../lib/datos.ts';
  import { asegurarVinculo, elegirVinculo, refrescarSiHaceFalta } from '../lib/anilistServicio.ts';
  import { esDudoso, textoProximo } from '../lib/anilist.ts';
  import EscogerObra from '../lib/componentes/EscogerObra.svelte';
  import { ajustes, asegurarAjustes } from '../lib/ajustes.svelte.ts';
  import { ordenarEpisodios } from '../lib/ajustes.ts';
  import { idiomaGuardado } from '../lib/continuar.ts';
  import { avisarCambio } from '../lib/sync.svelte.ts';
  import { ESTADOS } from '../lib/biblioteca.ts';
  import {
    confianza,
    UMBRAL_AUTO,
    type Ficha,
    type Idioma,
    type MediaAnilist,
    type ResultadoBusqueda,
  } from '../../../core/src/index.ts';

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

  // AniList: todo opcional. Si falla o no hay red, la Ficha funciona igual sin estos datos.
  let vinculo = $state<VinculoConMedia | null>(null);
  let candidatos = $state<MediaAnilist[]>([]);
  let preguntaDescartada = $state(false);
  const media = $derived(vinculo?.media ?? null);
  const dudoso = $derived(vinculo ? esDudoso(vinculo.vinculo) : false);
  const opcionesObra = $derived([...(media ? [media] : []), ...candidatos]);
  const proximo = $derived(media ? textoProximo(media.siguienteEp, media.siguienteEn, Date.now() / 1000) : null);
  /** Puntuación, estudio, formato y próximo episodio, en una sola línea. */
  const extra = $derived(
    media
      ? [
          media.puntuacion !== null ? `★ ${(media.puntuacion / 10).toFixed(1)}` : null,
          media.estudio,
          media.formato,
          proximo ? `Próximo: ${proximo}` : null,
        ].filter(Boolean)
      : [],
  );

  const textoPlano = (t: string) => t.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  async function cargarAniList() {
    try {
      const estadoV = await asegurarVinculo(serie, { anio: ficha?.anio ?? null, episodios: numeros.length || null });
      vinculo = await refrescarSiHaceFalta(estadoV.actual, serie.titulo);
      candidatos = estadoV.candidatos;
    } catch (e) {
      console.error(e);
    }
  }

  async function elegir(m: MediaAnilist) {
    try {
      await elegirVinculo(serie, m);
      vinculo = await vinculoConMedia(anime.aid);
      candidatos = [];
    } catch (e) {
      console.error(e);
    }
  }

  /** Abre una serie relacionada: la busca en animeav1 y, si hay una coincidencia firme, abre su Ficha. */
  async function abrirRelacionada(r: RelacionAnilist) {
    try {
      const candidato = {
        anilistId: r.anilistId,
        tituloRomaji: r.titulo,
        tituloIngles: null,
        tituloNativo: null,
        sinonimos: [],
        anio: null,
        episodios: null,
      };
      // Se abre el mejor resultado, no el primero que pase el umbral (las temporadas hermanas se parecen).
      let mejor: { res: ResultadoBusqueda; c: number } | null = null;
      for (const res of await fuentes.buscar(r.titulo)) {
        const c = confianza({ titulo: res.title }, candidato);
        if (!mejor || c > mejor.c) mejor = { res, c };
      }
      if (mejor && mejor.c >= UMBRAL_AUTO) {
        abrir({ tipo: 'ficha', anime: mejor.res });
        return;
      }
    } catch (e) {
      console.error(e);
    }
    buscarEnCatalogo(r.titulo);
  }

  let sinopsisAbierta = $state(false);
  /** Estado de emisión y géneros, en una sola línea. */
  const meta = $derived(ficha ? [ficha.status, ...ficha.genres].filter(Boolean) : []);
  const larga = $derived((ficha?.synopsis.length ?? 0) > 280);

  const numeros = $derived(ficha ? ficha.episodes.map((e) => e.number).sort((a, b) => a - b) : []);
  /** Orden de la lista en pantalla; `numeros` se queda ascendente porque el reproductor calcula el siguiente con él. */
  const mostrados = $derived(ordenarEpisodios(numeros, ajustes.ordenDescendente));
  let avisoDesmarcar = $state('');
  const serie = $derived({ aid: anime.aid, slug: anime.slug, titulo: ficha?.title || anime.title });

  onMount(async () => {
    // Los datos locales son accesorios: si fallan, la ficha funciona igual, sin ✓, en SUB y sin
    // estado ni favorito.
    const datos = Promise.all([
      episodiosVistos(anime.aid).catch(() => [] as number[]),
      leerAjuste(`idioma:${anime.aid}`).catch(() => null),
      asegurarAjustes(),
    ]).then(([v, i]) => {
      vistos = new Set(v);
      idioma = idiomaGuardado(i, ajustes.idiomaDefecto);
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
    if (ficha) void cargarAniList();
    await Promise.all([datos, biblioteca]);
  });

  /** Quita un episodio de los vistos; si falla, vuelve a ponerlo y avisa. */
  async function desmarcar(n: number) {
    const antes = vistos;
    vistos = new Set([...vistos].filter((x) => x !== n));
    avisoDesmarcar = '';
    try {
      await desmarcarVisto(anime.aid, n);
    } catch (e) {
      console.error(e);
      vistos = antes;
      avisoDesmarcar = `No se pudo quitar el episodio ${n} de los vistos: ${textoDeError(e)}`;
    }
  }

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
      avisarCambio(serie.aid);
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
  {#if media?.banner}
    <div class="banner" style:background-image={`url(${media.banner})`} role="img" aria-label="Banner de la serie"></div>
  {/if}
  <div class="cabecera">
    <div class="portada-ficha"><Portada aid={anime.aid} titulo={ficha?.title || anime.title} /></div>
    <div class="datos">
      <h1>{ficha?.title || anime.title}</h1>
      {#if meta.length > 0}<p class="meta">{meta.join(' · ')}</p>{/if}
      {#if extra.length > 0}<p class="meta">{extra.join(' · ')}</p>{/if}
      {#if ficha?.synopsis}
        <p class="sinopsis" class:recortada={larga && !sinopsisAbierta}>{ficha.synopsis}</p>
        {#if larga}
          <button class="enlace" aria-expanded={sinopsisAbierta} onclick={() => (sinopsisAbierta = !sinopsisAbierta)}>
            {sinopsisAbierta ? 'Ver menos' : 'Ver más'}
          </button>
        {/if}
      {/if}
      {#if !ficha?.synopsis && media?.sinopsis}
        <p class="sinopsis">{textoPlano(media.sinopsis)}</p>
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

  {#if dudoso && !preguntaDescartada && opcionesObra.length > 0}
    <EscogerObra candidatos={opcionesObra} alElegir={elegir} alDescartar={() => (preguntaDescartada = true)} />
  {/if}

  {#if media && media.relaciones.length > 0}
    <section class="relacionadas" aria-label="Relacionadas">
      <h2>Relacionadas</h2>
      <p>
        {#each media.relaciones as r (r.anilistId)}
          <button onclick={() => abrirRelacionada(r)}>{r.titulo} ({r.tipo})</button>
        {/each}
      </p>
    </section>
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
      {#each mostrados as n (n)}
        <span class="episodio">
          <button class:visto={vistos.has(n)} onclick={() => reproducir(n)}>
            {n}{#if vistos.has(n)}<span class="marca" aria-label="visto"> ✓</span>{/if}
          </button>
          {#if vistos.has(n)}
            <button
              class="quitar"
              onclick={() => desmarcar(n)}
              aria-label={`Marcar el episodio ${n} como no visto`}
              title="Marcar como no visto. Si la serie está sincronizada con AniList, el progreso de AniList puede volver a marcarlo."
              >×</button
            >
          {/if}
        </span>
      {/each}
    </div>
    {#if avisoDesmarcar}<p class="error" role="alert">{avisoDesmarcar}</p>{/if}
  {/if}
</main>

<style>
  .banner {
    height: 180px;
    margin-top: 12px;
    border-radius: var(--radio);
    background-size: cover;
    background-position: center;
    box-shadow: inset 0 -80px 60px -40px var(--fondo);
  }
  .relacionadas p {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
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
  .episodio {
    display: inline-flex;
    gap: 2px;
  }
  .episodios button {
    min-width: 52px;
  }
  .episodios .quitar {
    min-width: 0;
    padding-inline: 6px;
  }
  .episodios button.visto {
    opacity: 0.65;
  }
  .marca {
    color: #4caf50;
  }
</style>
