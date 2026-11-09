<script lang="ts">
  import { onMount } from 'svelte';
  import { agendaSemana, confianza, UMBRAL_AUTO, type ResultadoBusqueda } from '../../../core/src/index.ts';
  import { clienteAnilist } from '../lib/anilistCliente.ts';
  import {
    emisionEntre,
    estadoDatos,
    guardarAjuste,
    guardarEmision,
    leerAjuste,
    type EntradaEmision,
  } from '../lib/datos.ts';
  import {
    agruparAgenda,
    debeRefrescarAgenda,
    diasDeSemana,
    filtrarSigues,
    horaLocal,
    inicioDeSemana,
    titulosParaBuscar,
  } from '../lib/emision.ts';
  import Esqueleto from '../lib/componentes/Esqueleto.svelte';
  import Vacio from '../lib/componentes/Vacio.svelte';
  import { textoDeError } from '../lib/errores.ts';
  import { fuentes } from '../lib/fuentes.ts';
  import { inicialDe } from '../lib/imagenes.ts';
  import { abrir, buscarEnCatalogo } from '../lib/navegacion.svelte.ts';

  /** Páginas de 50 que se piden como máximo a AniList para una semana (600 emisiones). */
  const MAX_PAGINAS = 12;
  const CLAVE_CARGA = 'anilist_agenda_cargada';

  const inicioS = inicioDeSemana(Date.now());
  const dias = diasDeSemana(inicioS);
  const finS = dias[6]!.hastaS;
  const ahoraS = Date.now() / 1000;

  let entradas = $state<EntradaEmision[]>([]);
  let cargando = $state(true);
  let actualizando = $state(false);
  let avisoDatos = $state('');
  let avisoRed = $state('');
  let error = $state('');
  let soloSigues = $state(false);
  let diaSel = $state(Math.max(0, dias.findIndex((d) => ahoraS >= d.desdeS && ahoraS < d.hastaS)));
  let buscando = $state<number | null>(null);

  const porDia = $derived(agruparAgenda(entradas, inicioS));
  const lista = $derived(filtrarSigues(porDia[diaSel] ?? [], soloSigues));

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

  <div class="barra">
    <div class="dias">
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
            <button class="fila" disabled={buscando !== null} onclick={() => abrirEntrada(e)}>
              <span class="hora">{horaLocal(e.emiteEn)}</span>
              <span class="mini">
                <span class="inicial" aria-hidden="true">{inicialDe(titulo(e))}</span>
                {#if e.portada}
                  <img
                    src={e.portada}
                    alt=""
                    loading="lazy"
                    onerror={(ev) => ((ev.currentTarget as HTMLImageElement).style.display = 'none')}
                  />
                {/if}
              </span>
              <span class="texto">
                <strong>{titulo(e)}</strong>
                <span
                  >Ep. {e.episodio}{e.formato && e.formato !== 'TV' ? ` · ${e.formato}` : ''}{buscando === e.anilistId
                    ? ' · Abriendo…'
                    : ''}</span
                >
              </span>
              {#if e.estado === 1}<span class="sigues">Sigues</span>{/if}
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
    margin: 8px 0 16px;
  }
  .dias {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .dias button[aria-pressed='true'] {
    background: var(--acento);
    border-color: var(--acento);
    color: var(--sobre-acento);
    font-weight: 700;
  }
  .interruptor {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .aviso {
    color: var(--texto-suave);
  }
  .agenda {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 8px;
  }
  .fila {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
    padding: 8px 12px;
    text-align: left;
  }
  .hora {
    flex: none;
    width: 52px;
    font-variant-numeric: tabular-nums;
    color: var(--texto-suave);
  }
  .mini {
    position: relative;
    flex: none;
    display: grid;
    place-items: center;
    width: 44px;
    height: 64px;
    border-radius: 4px;
    background: var(--superficie-2);
    overflow: hidden;
  }
  .mini img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .inicial {
    color: var(--texto-suave);
    font-size: 1.4rem;
  }
  .texto {
    display: grid;
    flex: 1;
    min-width: 0;
  }
  .texto span {
    color: var(--texto-suave);
  }
  .sigues {
    flex: none;
    padding: 2px 10px;
    border-radius: 999px;
    background: var(--acento);
    color: var(--sobre-acento);
    font-size: 0.8rem;
    font-weight: 600;
  }
</style>
