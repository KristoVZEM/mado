<script lang="ts">
  import { onMount } from 'svelte';
  import { agendaSemana, confianza, UMBRAL_AUTO, type ResultadoBusqueda } from '../../../core/src/index.ts';
  import { clienteAnilist } from '../lib/anilistCliente.ts';
  import {
    emisionEntre,
    estadoDatos,
    fijarVinculo,
    guardarAjuste,
    guardarEmision,
    leerAjuste,
    listarBiblioteca,
    type EntradaEmision,
  } from '../lib/datos.ts';
  import {
    agruparAgenda,
    debeRefrescarAgenda,
    etiquetaSalida,
    proximoEnSalir,
    proximoQueSigues,
    diasDeSemana,
    conVinculo,
    filtrarSigues,
    horaLocal,
    inicioDeSemana,
    sinVer,
    textoSale,
    titulosParaBuscar,
  } from '../lib/emision.ts';
  import { entradasDe } from '../lib/biblioteca.ts';
  import Esqueleto from '../lib/componentes/Esqueleto.svelte';
  import Vacio from '../lib/componentes/Vacio.svelte';
  import { textoDeError } from '../lib/errores.ts';
  import { fuentes } from '../lib/fuentes.ts';
  import { inicialDe, portadaGrande } from '../lib/imagenes.ts';
  import { abrir, buscarEnCatalogo } from '../lib/navegacion.svelte.ts';

  /** Páginas de 50 que se piden como máximo a AniList para una semana (600 emisiones). */
  const MAX_PAGINAS = 12;
  const CLAVE_CARGA = 'anilist_agenda_cargada';

  const inicioS = inicioDeSemana(Date.now());
  const dias = diasDeSemana(inicioS);
  const finS = dias[6]!.hastaS;
  const ahoraInicialS = Date.now() / 1000;
  /** Se refresca cada minuto para que «Sale en 25 min» y las marcas de «sin ver» no se queden viejos. */
  let ahoraS = $state(ahoraInicialS);
  $effect(() => {
    const t = setInterval(() => (ahoraS = Date.now() / 1000), 60_000);
    return () => clearInterval(t);
  });

  let entradas = $state<EntradaEmision[]>([]);
  let cargando = $state(true);
  let actualizando = $state(false);
  let avisoDatos = $state('');
  let avisoRed = $state('');
  let error = $state('');
  let soloSigues = $state(false);
  const indiceHoy = Math.max(0, dias.findIndex((d) => ahoraInicialS >= d.desdeS && ahoraInicialS < d.hastaS));
  let diaSel = $state(indiceHoy);
  /** Último episodio visto de cada serie de tu biblioteca, para marcar lo que ya salió y no has visto. */
  let ultimos = $state(new Map<number, number | null>());
  let buscando = $state<number | null>(null);
  /** Pósteres que no cargaron: solo entonces se ve la letra de respaldo (si no, se transparentaría al pasar el ratón). */
  let fallidas = $state<number[]>([]);

  const porDia = $derived(agruparAgenda(entradas, inicioS));
  const lista = $derived(filtrarSigues(porDia[diaSel] ?? [], soloSigues));
  /** Lo próximo de lo que sigues en la semana o, si no sigues nada que se emita, lo próximo en salir. */
  const proximo = $derived(proximoQueSigues(entradas, ahoraS) ?? proximoEnSalir(entradas, ahoraS));

  onMount(async () => {
    try {
      avisoDatos = (await estadoDatos()) ?? '';
    } catch (e) {
      avisoDatos = textoDeError(e);
    }
    if (avisoDatos) {
      cargando = false;
      return;
    }
    void listarBiblioteca()
      .then((b) => (ultimos = new Map(entradasDe(b, 'todos').map((x) => [x.aid, x.ultimoEpisodio]))))
      .catch((e) => console.error(e));
    // Primero lo que ya hay guardado, para no esperar a la red.
    entradas = await emisionEntre(inicioS, finS).catch((e) => {
      console.error(e);
      return [];
    });
    cargando = false;

    const ultima = Number(await leerAjuste(CLAVE_CARGA).catch(() => null));
    if (!debeRefrescarAgenda(Number.isFinite(ultima) && ultima > 0 ? ultima : null, Date.now())) return;
    actualizando = true;
    try {
      const { medias, items } = await agendaSemana(clienteAnilist, inicioS, finS, MAX_PAGINAS);
      await guardarEmision(inicioS, finS, medias, items);
      // Primero se muestra lo guardado; anotar la hora de la carga es secundario y no debe dejar la lista vacía.
      entradas = await emisionEntre(inicioS, finS);
      await guardarAjuste(CLAVE_CARGA, String(Date.now())).catch((e) => console.error(e));
    } catch (e) {
      console.error(e);
      avisoRed = 'No se pudo actualizar la agenda; se muestra la última guardada.';
    } finally {
      actualizando = false;
    }
  });

  function titulo(e: EntradaEmision): string {
    return e.tituloIngles ?? e.tituloRomaji;
  }

  /** Abre la serie: directo si ya está vinculada; si no, la busca en animeav1 y, si no hay coincidencia firme, va a Catálogo. */
  async function abrirEntrada(e: EntradaEmision) {
    if (e.aid !== null && e.slug !== null) {
      abrir({ tipo: 'ficha', anime: { aid: e.aid, slug: e.slug, title: e.tituloSerie ?? e.tituloRomaji } });
      return;
    }
    if (buscando !== null) return;
    buscando = e.anilistId;
    error = '';
    /** Primer texto que dio algún resultado en animeav1: es el mejor para dejar escrito en Catálogo. */
    let conResultados: string | undefined;
    try {
      const candidato = {
        anilistId: e.anilistId,
        tituloRomaji: e.tituloRomaji,
        tituloIngles: e.tituloIngles,
        tituloNativo: null,
        sinonimos: e.sinonimos,
        anio: null,
        episodios: null,
      };
      // Se busca con los títulos y alias y se abre el MEJOR resultado, no el primero que pase el umbral:
      // las temporadas hermanas se parecen mucho y el orden de la búsqueda no manda.
      let mejor: { res: ResultadoBusqueda; c: number } | null = null;
      for (const t of titulosParaBuscar(e)) {
        const resultados = await fuentes.buscar(t);
        if (resultados.length > 0) conResultados ??= t;
        for (const res of resultados) {
          const c = confianza({ titulo: res.title }, candidato);
          if (!mejor || c > mejor.c) mejor = { res, c };
        }
        if (mejor && mejor.c >= 0.99) break; // coincidencia exacta: no hace falta seguir
      }
      if (mejor && mejor.c >= UMBRAL_AUTO) {
        // Se guarda el emparejado para que el próximo clic abra directo sin repetir la búsqueda. Si falla,
        // la ficha se abre igual: guardarlo es una comodidad, no una condición.
        const serie = { aid: mejor.res.aid, slug: mejor.res.slug, titulo: mejor.res.title };
        void fijarVinculo(serie, e.anilistId, mejor.c, 'auto')
          .then(() => (entradas = conVinculo(entradas, e.anilistId, mejor.res)))
          .catch((err) => console.error(err));
        abrir({ tipo: 'ficha', anime: mejor.res });
        return;
      }
    } catch (err) {
      console.error(err);
      error = textoDeError(err);
      return;
    } finally {
      buscando = null;
    }
    // Sin coincidencia firme: Catálogo con el primer texto que dio resultados o, si ninguno, el romaji
    // (animeav1 nombra casi siempre las series en romaji).
    buscarEnCatalogo(conResultados ?? e.tituloRomaji);
  }
</script>

<main class="pantalla">
  <h1>Emisión</h1>

  {#if avisoDatos}<p class="error" role="alert">Datos locales no disponibles: {avisoDatos}</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if avisoRed}<p class="aviso">{avisoRed}</p>{/if}

  {#if proximo}
    <section class="hoy" aria-label={proximo.estado === 1 ? 'Lo próximo de lo que sigues' : 'Lo próximo en salir'}>
      {#if proximo.banner}<img class="fondo-hoy" src={proximo.banner} alt="" />{/if}
      <div class="velo-hoy"></div>
      <div class="contenido-hoy">
        <p class="etiqueta-hoy">{etiquetaSalida(proximo.emiteEn, ahoraS)} · {horaLocal(proximo.emiteEn)}</p>
        <h2>{titulo(proximo)}</h2>
        <p class="linea-hoy">Ep. {proximo.episodio}{proximo.emiteEn - ahoraS < 86_400 ? ` · ${textoSale(proximo.emiteEn, ahoraS)}` : ''}</p>
        <button class="principal grande" disabled={buscando !== null} onclick={() => abrirEntrada(proximo)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>
          Ver serie
        </button>
      </div>
    </section>
  {/if}

  <div class="barra">
    <div class="filtros dias" role="group" aria-label="Día">
      {#each dias as d, i (d.desdeS)}
        <button aria-pressed={diaSel === i} onclick={() => (diaSel = i)}>{d.etiqueta}</button>
      {/each}
    </div>
    <label class="interruptor">
      <input type="checkbox" bind:checked={soloSigues} /> Solo lo que sigo
    </label>
  </div>

  {#if cargando}<Esqueleto variante="fila" cantidad={6} />{/if}
  {#if actualizando}<p class="aviso">Actualizando la agenda…</p>{/if}

  {#if !cargando && !avisoDatos}
    {#if lista.length === 0}
      {#if soloSigues}
        <Vacio titulo="Nada de lo que sigues sale este día" texto="Prueba otro día o mira toda la agenda.">
          <button onclick={() => (soloSigues = false)}>Ver toda la agenda</button>
        </Vacio>
      {:else}
        <Vacio titulo="Sin emisiones guardadas este día" texto="La agenda se actualiza al abrir esta sección con conexión." />
      {/if}
    {:else}
      <ul class="agenda">
        {#each lista as e (`${e.anilistId}-${e.episodio}`)}
          <li>
            <button class="tarjeta" disabled={buscando !== null} onclick={() => abrirEntrada(e)}>
              <span class="marco">
                {#if !e.portada || fallidas.includes(e.anilistId)}
                  <span class="inicial" aria-hidden="true">{inicialDe(titulo(e))}</span>
                {/if}
                {#if e.portada && !fallidas.includes(e.anilistId)}
                  <img
                    src={portadaGrande(e.portada)}
                    alt=""
                    loading="lazy"
                    onerror={() => (fallidas = [...fallidas, e.anilistId])}
                  />
                {/if}
                <span class="hora">{horaLocal(e.emiteEn)}</span>
                {#if e.estado === 1}<span class="sigues">Sigues</span>{/if}
                {#if e.aid !== null && sinVer(e, ahoraS, ultimos.get(e.aid))}<span class="sin-ver">Sin ver</span>{/if}
                <span class="contorno"></span>
              </span>
              <span class="texto">
                <strong>{titulo(e)}</strong>
                <span
                  >Ep. {e.episodio}{e.formato && e.formato !== 'TV' ? ` · ${e.formato}` : ''}{buscando === e.anilistId
                    ? ' · Abriendo…'
                    : ''}</span
                >
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</main>

<style>
  .barra {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 0 0 24px;
  }
  .dias {
    margin: 0;
  }
  .interruptor {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--texto-suave);
    cursor: pointer;
  }
  .aviso {
    color: var(--texto-suave);
  }
  /* Cabecera: la próxima emisión de lo que sigues, con su banner. */
  .hoy {
    position: relative;
    display: flex;
    align-items: flex-end;
    /* Un banner de AniList es muy ancho (3,5:1): con esta altura se ve casi entero. */
    height: clamp(280px, 22vw, 420px);
    margin: 0 0 28px;
    overflow: hidden;
    border: 1px solid var(--borde);
    border-radius: var(--radio-grande);
    background: var(--superficie);
  }
  .fondo-hoy {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
  }
  .velo-hoy {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(to right, rgb(10 10 10 / 0.85), rgb(10 10 10 / 0.4) 40%, transparent 65%),
      linear-gradient(to top, rgb(10 10 10 / 0.55), transparent 45%);
  }
  .contenido-hoy {
    position: relative;
    display: grid;
    gap: 10px;
    justify-items: start;
    max-width: 640px;
    padding: 28px 32px;
  }
  .contenido-hoy h2 {
    margin: 0;
    font-size: 1.75rem;
    line-height: 1.15;
    text-shadow: 0 2px 10px rgb(0 0 0 / 0.6);
  }
  .etiqueta-hoy,
  .linea-hoy {
    margin: 0;
    color: #eceef2;
    font-size: 0.9rem;
    font-weight: 500;
    text-shadow: 0 1px 3px rgb(0 0 0 / 0.9);
  }
  .grande {
    min-height: 40px;
    padding: 6px 24px;
  }
  /* Pósteres grandes de lo que se emite: la imagen manda y el título va debajo. */
  .agenda {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 24px 16px;
  }
  .tarjeta {
    display: grid;
    gap: 8px;
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    text-align: left;
  }
  .tarjeta:hover:not(:disabled) {
    background: none;
  }
  .marco {
    position: relative;
    display: grid;
    place-items: center;
    aspect-ratio: 2 / 3;
    overflow: hidden;
    border-radius: var(--radio);
    background: var(--superficie-2);
  }
  .marco img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition:
      opacity 300ms ease-out,
      transform 300ms ease-out;
  }
  .tarjeta:hover:not(:disabled) .marco img,
  .tarjeta:focus-visible .marco img {
    opacity: 0.75;
    transform: scale(1.05);
  }
  .contorno {
    position: absolute;
    inset: 0;
    border: 1px solid var(--borde);
    border-radius: var(--radio);
    pointer-events: none;
    transition: box-shadow 250ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .tarjeta:hover:not(:disabled) .contorno,
  .tarjeta:focus-visible .contorno {
    box-shadow: inset 0 0 0 1px rgb(250 250 250 / 0.15);
  }
  .inicial {
    color: var(--texto-suave);
    font-size: 2rem;
  }
  /* La hora sale sobre la imagen, abajo a la izquierda, como la duración de un episodio. */
  .hora {
    position: absolute;
    left: 8px;
    bottom: 8px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgb(0 0 0 / 0.7);
    font-size: 0.8rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  /* «Sigues»: una etiqueta de estado, no un botón de acento. */
  .sigues {
    position: absolute;
    top: 8px;
    right: 8px;
    padding: 2px 10px;
    border-radius: 999px;
    background: rgb(0 0 0 / 0.7);
    font-size: 0.75rem;
    font-weight: 500;
  }
  /* «Sin ver»: ya salió y te falta; mismo color que «Nuevo» en el resto de la app. */
  .sin-ver {
    position: absolute;
    top: 8px;
    left: 8px;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--acento);
    color: var(--sobre-acento);
    font-size: 0.75rem;
    font-weight: 600;
  }
  .texto {
    display: grid;
    min-width: 0;
  }
  .texto strong {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 1rem;
    font-weight: 500;
  }
  .texto span {
    color: var(--texto-suave);
    font-size: 0.875rem;
  }
  @media (prefers-reduced-motion: reduce) {
    .marco img,
    .contorno {
      transition: none;
    }
    .tarjeta:hover:not(:disabled) .marco img,
    .tarjeta:focus-visible .marco img {
      transform: none;
    }
  }
</style>
