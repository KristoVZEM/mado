<script lang="ts">
  import { untrack } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import type { MediaAnilist } from '../../../../core/src/index.ts';
  import type { Destacado, ItemDestacado } from '../destacado.ts';
  import type { FilaTmdb } from '../datos.ts';
  import { urlFondoTmdb, urlLogoTmdb } from '../tmdb.ts';
  import { imagenesTmdb } from '../tmdbServicio.ts';
  import Menu from './Menu.svelte';
  import { ESTADOS, nombreEstado } from '../biblioteca.ts';
  import { alternarFavorito, esFavorito, estadoSerie, fijarEstado } from '../datos.ts';
  import { textoDeError } from '../errores.ts';
  import { fuentes } from '../fuentes.ts';
  import { avisarCambio } from '../sync.svelte.ts';

  let {
    items,
    abriendo = false,
    alContinuar,
    alAbrirFicha,
  }: {
    items: ItemDestacado[];
    abriendo?: boolean;
    alContinuar: (d: Destacado) => void;
    alAbrirFicha: (d: Destacado) => void;
  } = $props();

  let indice = $state(0);
  /** Fondos y logos de TMDB ya consultados, por `aid`. */
  let tmdb = $state<Record<number, FilaTmdb | null>>({});
  /** Capas de fondo que ya se pintaron: se conservan para que el fundido entre series sea limpio. */
  let pintadas = $state<Record<number, boolean>>({});
  let logosFallidos = $state<number[]>([]);
  /** Sinopsis y géneros en español, de animeav1; `'fallo'` si no se pudieron pedir (entonces vale lo de AniList). */
  const pedidos = new Set<number>();
  let datosEs = $state<Record<number, { sinopsis: string | null; generos: string[] } | 'fallo'>>({});
  /** Favorito y estado de biblioteca de cada serie, para los botones. */
  let biblio = $state<Record<number, { favorito: boolean; estado: number }>>({});
  let menuAbierto = $state(false);
  let avisoBiblio = $state('');

  const reducido = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MS_FUNDIDO = reducido ? 0 : 700;
  const MS_TEXTO = reducido ? 0 : 300;

  /**
   * Si la lista cambia (llega la renovada, o las populares sustituyen a las de la biblioteca), sigue en la misma serie
   * si está en la nueva; si no, se queda en la misma posición, sin pasarse del final.
   */
  let anteriores: ItemDestacado[] | null = null;
  $effect.pre(() => {
    const nuevos = items;
    if (anteriores === null || nuevos === anteriores) {
      anteriores = nuevos;
      return;
    }
    const previos = anteriores;
    untrack(() => {
      const aid = previos[indice]?.destacado.aid;
      const donde = nuevos.findIndex((it) => it.destacado.aid === aid);
      indice = donde >= 0 ? donde : Math.min(indice, Math.max(0, nuevos.length - 1));
    });
    anteriores = nuevos;
  });

  const actual = $derived(items[indice] ?? null);
  const textoPlano = (t: string) => t.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  /** La serie activa y sus vecinas se preparan: así el siguiente fondo ya está cuando se pulsa la flecha. */
  $effect(() => {
    const n = items.length;
    if (n === 0) return;
    for (const i of [indice, (indice + 1) % n, (indice - 1 + n) % n]) {
      const it = items[i];
      if (!it) continue;
      const aid = it.destacado.aid;
      pintadas[aid] = true;
      if (it.media && !(aid in tmdb)) {
        tmdb[aid] = null;
        void imagenesTmdb(it.media).then((f) => {
          tmdb[aid] = f;
        });
      }
      if (!pedidos.has(aid)) {
        pedidos.add(aid); // hasta que llega la respuesta no se enseña ni sinopsis ni géneros, para que no cambien de idioma
        void fuentes
          .episodios(it.destacado.slug)
          .then((f) => {
            datosEs[aid] = { sinopsis: f.synopsis || null, generos: f.genres };
          })
          .catch(() => {
            datosEs[aid] = 'fallo';
          });
        void Promise.all([esFavorito(aid), estadoSerie(aid)])
          .then(([favorito, estado]) => {
            biblio[aid] = { favorito, estado: estado ?? 0 };
          })
          .catch((e) => console.error(e));
      }
    }
  });

  /** Pasa sola a la siguiente cada 8 s y, tras la última, vuelve a la primera. Se detiene con el cursor encima, con el foco dentro, con el menú abierto o si el sistema pide menos movimiento. */
  const SEGUNDOS_AUTO = 8;
  let encima = $state(false);
  let foco = $state(false);
  $effect(() => {
    // Leer `indice` aquí reinicia la cuenta cada vez que se cambia de serie, sea a mano o sola.
    void indice;
    if (reducido || items.length < 2 || encima || foco || menuAbierto) return;
    const t = setTimeout(() => ir(1), SEGUNDOS_AUTO * 1000);
    return () => clearTimeout(t);
  });

  function ir(delta: number) {
    const n = items.length;
    if (n > 0) indice = (indice + delta + n) % n;
    menuAbierto = false;
    avisoBiblio = '';
  }

  const serieDe = (d: Destacado) => ({ aid: d.aid, slug: d.slug, titulo: d.titulo });

  async function alternarFav(d: Destacado) {
    avisoBiblio = '';
    try {
      const favorito = await alternarFavorito(serieDe(d));
      biblio[d.aid] = { favorito, estado: biblio[d.aid]?.estado ?? 0 };
    } catch (e) {
      console.error(e);
      avisoBiblio = `No se pudo cambiar el favorito: ${textoDeError(e)}`;
    }
  }

  async function cambiarEstado(d: Destacado, nuevo: number) {
    menuAbierto = false;
    avisoBiblio = '';
    const anterior = biblio[d.aid]?.estado ?? 0;
    if (nuevo === anterior) return;
    biblio[d.aid] = { favorito: biblio[d.aid]?.favorito ?? false, estado: nuevo };
    try {
      await fijarEstado(serieDe(d), nuevo);
      avisarCambio(d.aid);
    } catch (e) {
      console.error(e);
      biblio[d.aid] = { favorito: biblio[d.aid]?.favorito ?? false, estado: anterior };
      avisoBiblio = `No se pudo guardar el estado: ${textoDeError(e)}`;
    }
  }

  function tecla(e: KeyboardEvent) {
    if (items.length < 2) return;
    if (e.key === 'ArrowLeft') ir(-1);
    else if (e.key === 'ArrowRight') ir(1);
  }

  /** Fondo de una serie: el de TMDB (16:9) si lo hay; si no, el banner de AniList. */
  function fondoDe(it: ItemDestacado): { url: string; panoramico: boolean } {
    const f = tmdb[it.destacado.aid]?.fondo;
    return f ? { url: urlFondoTmdb(f), panoramico: true } : { url: it.destacado.banner, panoramico: false };
  }

  function logoDe(it: ItemDestacado): string | null {
    const l = tmdb[it.destacado.aid]?.logo;
    return l && !logosFallidos.includes(it.destacado.aid) ? urlLogoTmdb(l) : null;
  }

  /** Año, formato, episodios y nota en una línea. */
  function lineaDe(m: MediaAnilist | null): string {
    if (!m) return '';
    return [
      m.anio ? String(m.anio) : null,
      m.formato,
      m.episodios ? `${m.episodios} episodios` : null,
      m.puntuacion != null ? `★ ${(m.puntuacion / 10).toFixed(1)}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }
</script>

{#if actual}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <section class="destacados zona-oscura" aria-roledescription="carrusel" aria-label="Destacados" onkeydown={tecla} onmouseenter={() => (encima = true)} onmouseleave={() => (encima = false)} onfocusin={() => (foco = true)} onfocusout={() => (foco = false)}>
    <div class="fondos" aria-hidden="true">
      {#each items as it, i (it.destacado.aid)}
        {#if pintadas[it.destacado.aid]}
          {@const f = fondoDe(it)}
          {#if f.url}
            <img class="fondo" class:activo={i === indice} class:panoramico={f.panoramico} src={f.url} alt="" style:transition-duration={`${MS_FUNDIDO}ms`} />
          {/if}
        {/if}
      {/each}
      <div class="velo velo-lateral"></div>
      <div class="velo velo-inferior"></div>
      <div class="velo velo-superior"></div>
    </div>

    {#if items.length > 1}
      <!-- Las flechas son los dos laterales de la cabecera: invisibles hasta que el cursor pasa por encima. -->
      <button class="flecha izquierda" aria-label="Serie anterior" onclick={() => ir(-1)}><span aria-hidden="true">‹</span></button>
      <button class="flecha derecha" aria-label="Serie siguiente" onclick={() => ir(1)}><span aria-hidden="true">›</span></button>
    {/if}

    {#key indice}
      {@const it = actual}
      {@const logo = logoDe(it)}
      {@const m = it.media}
      {@const es = datosEs[it.destacado.aid]}
      {@const b = biblio[it.destacado.aid]}
      {@const generos = es && es !== 'fallo' && es.generos.length > 0 ? es.generos : (m?.generos ?? [])}
      {@const sinopsis = es && es !== 'fallo' ? es.sinopsis : null}
      <div class="contenido" in:fly={{ x: 40, duration: MS_TEXTO }} out:fade={{ duration: 0 }}>
        {#if logo}
          <h2 class="titulo-logo">
            <img src={logo} alt={it.destacado.titulo} onerror={() => (logosFallidos = [...logosFallidos, it.destacado.aid])} />
          </h2>
          <!-- El logo suele estar en el idioma original: el título en letras latinas dice qué serie es. -->
          <p class="subtitulo-logo" aria-hidden="true">{it.destacado.titulo}</p>
        {:else}
          <h2>{it.destacado.titulo}</h2>
        {/if}
        {#if es && generos.length > 0}
          <ul class="chips" aria-label="Géneros">
            {#each generos.slice(0, 4) as g (g)}<li>{g}</li>{/each}
          </ul>
        {/if}
        {#if lineaDe(m)}<p class="linea">{lineaDe(m)}</p>{/if}
        {#if es}
          {@const texto = sinopsis ?? (m?.sinopsis ? textoPlano(m.sinopsis) : '')}
          {#if texto}<p class="sinopsis">{texto}</p>{/if}
        {/if}
        <div class="botones">
          <button class="principal grande" disabled={abriendo} onclick={() => alContinuar(it.destacado)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>
            {it.destacado.numero !== null ? `Continuar Ep. ${it.destacado.numero}` : 'Ver serie'}
          </button>
          <button
            class="icono"
            aria-pressed={b?.favorito ?? false}
            title={b?.favorito ? 'Quitar de favoritos' : 'Marcar como favorito'}
            aria-label={b?.favorito ? 'Quitar de favoritos' : 'Marcar como favorito'}
            onclick={() => alternarFav(it.destacado)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" class:relleno={b?.favorito}>
              <path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z" />
            </svg>
          </button>
          <div class="ancla">
            <button
              class="icono"
              class:activo={(b?.estado ?? 0) !== 0}
              aria-haspopup="menu"
              aria-expanded={menuAbierto}
              title={b && b.estado !== 0 ? `En tu biblioteca: ${nombreEstado(b.estado)}` : 'Guardar en tu biblioteca'}
              aria-label={b && b.estado !== 0 ? `En tu biblioteca: ${nombreEstado(b.estado)}. Cambiar` : 'Guardar en tu biblioteca'}
              onclick={() => (menuAbierto = !menuAbierto)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" class:relleno={(b?.estado ?? 0) !== 0}>
                <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
              </svg>
            </button>
            <Menu abierto={menuAbierto} arriba etiqueta="Estado en tu biblioteca" alCerrar={() => (menuAbierto = false)}>
              {#each [{ valor: 0, nombre: 'Sin estado' }, ...ESTADOS] as e (e.valor)}
                <button role="menuitemradio" aria-checked={(b?.estado ?? 0) === e.valor} onclick={() => cambiarEstado(it.destacado, e.valor)}>
                  <svg class="marca-menu" viewBox="0 0 24 24" aria-hidden="true">
                    {#if (b?.estado ?? 0) === e.valor}<path d="M5 12.5l4.5 4.5L19 7.5" />{/if}
                  </svg>
                  {e.nombre}
                </button>
              {/each}
            </Menu>
          </div>
          <button class="icono" title="Ver la ficha de la serie" aria-label="Ver la ficha de la serie" onclick={() => alAbrirFicha(it.destacado)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5.5M12 7.6h.01" />
            </svg>
          </button>
        </div>
        {#if avisoBiblio}<p class="aviso" role="alert">{avisoBiblio}</p>{/if}
      </div>
    {/key}
  </section>
{/if}

<style>
  .destacados {
    position: relative;
    display: flex;
    align-items: flex-end;
    min-height: 70vh;
    padding: 0 48px 40px;
  }
  /* El fondo baja 160 px por debajo de la cabecera: la primera fila queda sobre el final de la imagen. */
  .fondos {
    position: absolute;
    inset: 0 0 -160px 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
  }
  .fondo {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    /* Un banner de AniList mide unos 1900×550: ocupa su proporción para no verse borroso. */
    height: min(100%, max(420px, 40vw));
    object-fit: cover;
    object-position: center 20%;
    opacity: 0;
    filter: brightness(0.7) saturate(0.8);
    transition-property: opacity;
    transition-timing-function: ease-out;
  }
  .fondo.panoramico {
    height: 100%;
    filter: none;
  }
  /* La imagen de TMDB va a todo color; el banner de AniList, apagado por su filtro, un poco menos. */
  .fondo.activo {
    opacity: 0.85;
  }
  .fondo.panoramico.activo {
    opacity: 1;
  }
  .velo {
    position: absolute;
    inset: 0;
  }
  .velo-lateral {
    max-width: 1024px;
    background: linear-gradient(to right, rgb(0 0 0 / 0.7), rgb(0 0 0 / 0.7) 50%, transparent);
  }
  .velo-inferior {
    top: 33%;
    background: linear-gradient(to top, rgb(var(--fondo-rgb)) 8%, transparent);
  }
  .velo-superior {
    bottom: 75%;
    background: linear-gradient(to bottom, rgb(10 10 10 / 0.7), transparent);
  }
  .contenido {
    position: relative;
    z-index: 3;
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
    max-width: 672px;
  }
  .contenido h2 {
    margin: 0;
    font-size: clamp(1.75rem, 1.2rem + 1.6vw, 2.25rem);
    line-height: 1.1;
    font-weight: 700;
    text-shadow: 0 2px 10px rgb(0 0 0 / 0.6);
  }
  .subtitulo-logo {
    margin: -8px 0 0;
    color: #d1d5dc;
    font-size: 1rem;
    text-shadow: 0 1px 3px rgb(0 0 0 / 0.85);
  }
  .titulo-logo img {
    display: block;
    max-width: min(100%, 420px);
    max-height: 120px;
    object-fit: contain;
    object-position: left;
    filter: drop-shadow(0 2px 8px rgb(0 0 0 / 0.6));
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .chips li {
    padding: 2px 8px;
    border: 1px solid rgb(255 255 255 / 0.25);
    border-radius: 999px;
    background: rgb(10 10 10 / 0.35);
    font-size: 0.75rem;
    font-weight: 500;
  }
  .linea {
    margin: 0;
    color: #eceef2;
    font-size: 0.9rem;
    font-weight: 500;
    text-shadow: 0 1px 3px rgb(0 0 0 / 0.9);
  }
  /* Sinopsis: más grande, más blanca y con una sombra que la separa de cualquier imagen. */
  .sinopsis {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin: 0;
    color: #f5f5f7;
    font-size: 1rem;
    font-weight: 500;
    line-height: 1.55;
    text-shadow: 0 1px 2px rgb(0 0 0 / 0.95), 0 0 14px rgb(0 0 0 / 0.75);
  }
  .aviso {
    margin: 0;
    color: #ff8a8a;
    font-size: 0.875rem;
  }
  .ancla {
    position: relative;
  }
  .icono {
    display: grid;
    place-items: center;
    width: 40px;
    min-height: 40px;
    padding: 0;
    background: rgb(10 10 10 / 0.6);
    backdrop-filter: blur(8px);
    border-color: rgb(255 255 255 / 0.25);
  }
  .icono svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .icono svg.relleno {
    fill: currentColor;
  }
  .ancla > .icono.activo,
  .ancla > .icono.activo:hover:not(:disabled) {
    background: var(--boton-claro);
    border-color: var(--boton-claro);
    color: var(--boton-claro-texto);
  }
  .botones {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 4px;
  }
  .grande {
    min-height: 40px;
    padding: 6px 24px;
    background: rgb(10 10 10 / 0.6);
    backdrop-filter: blur(8px);
    border-color: rgb(255 255 255 / 0.25);
  }
  .principal.grande {
    background: var(--boton-claro);
    border-color: var(--boton-claro);
    backdrop-filter: none;
  }
  /* Franja a cada lado, de arriba abajo: sin nada a la vista; al pasar el cursor se difumina el fondo y sale la flecha. */
  .flecha {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 2;
    display: grid;
    width: 112px;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: #fff;
    font-size: 2rem;
    line-height: 1;
    align-items: center;
    opacity: 0;
    transition: opacity 200ms ease-out;
  }
  .flecha:hover:not(:disabled),
  .flecha:focus-visible {
    background: transparent;
    opacity: 1;
  }
  /* El difuminado va en un pseudo-elemento para poder desvanecerlo hacia el centro con una máscara. */
  .flecha::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    background: rgb(10 10 10 / 0.35);
    backdrop-filter: blur(6px);
  }
  .izquierda {
    left: 0;
    justify-items: start;
    padding-left: 20px;
  }
  .izquierda::before {
    mask-image: linear-gradient(to right, #000 30%, transparent);
  }
  .derecha {
    right: 0;
    justify-items: end;
    padding-right: 20px;
  }
  .derecha::before {
    mask-image: linear-gradient(to left, #000 30%, transparent);
  }
  .flecha span {
    text-shadow: 0 1px 6px rgb(0 0 0 / 0.8);
  }
  @media (prefers-reduced-motion: reduce) {
    .flecha {
      transition: none;
    }
  }
  /* Las flechas estorban en ventanas estrechas. */
  @media (max-width: 640px) {
    .flecha {
      display: none;
    }
    .destacados {
      padding-inline: 24px;
    }
  }
</style>
