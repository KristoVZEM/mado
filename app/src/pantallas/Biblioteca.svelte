<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { abrir, irASeccion, nav } from '../lib/navegacion.svelte.ts';
  import { alternarFavorito, estadoDatos, fijarEstado, listarBiblioteca, resumenesVinculados, type ResumenSerie } from '../lib/datos.ts';
  import { etiquetaNuevo } from '../lib/destacado.ts';
  import { mensajeDeError, textoDeError } from '../lib/errores.ts';
  import { avisarFalloDeFuente } from '../lib/fuente.svelte.ts';
  import { avisarCambio } from '../lib/sync.svelte.ts';
  import { ajustes, asegurarAjustes, guardarAjusteSilencioso } from '../lib/ajustes.svelte.ts';
  import { nombreEstado, PESTANAS, pestanaVecina, type Pestana } from '../lib/biblioteca.ts';
  import {
    aplicarFiltros,
    dePestana,
    fraccion,
    generosOfrecidos,
    hayFiltros,
    ORDENES,
    ordenar,
    recuentosVista,
    SIN_FILTROS,
    unir,
    valorDeOrden,
    type EntradaVista,
    type Orden,
  } from '../lib/bibliotecaVista.ts';
  import { estadoVacioVista, lineaFiltros, subtituloTarjeta, textoNuevos, textoResumen } from '../lib/bibliotecaTextos.ts';
  import { prepararReproduccion, principalDeSerie } from '../lib/reanudar.ts';
  import { depsReanudar } from '../lib/reanudarApp.ts';
  import Esqueleto from '../lib/componentes/Esqueleto.svelte';
  import MenuSerie from '../lib/componentes/MenuSerie.svelte';
  import TarjetaPoster from '../lib/componentes/TarjetaPoster.svelte';
  import Vacio from '../lib/componentes/Vacio.svelte';

  let entradas = $state<EntradaVista[] | null>(null);
  let resumenes = $state<ResumenSerie[]>([]);
  /** Los datos de AniList para «Nuevo» llegan aparte; hasta entonces «Con nuevos» no se puede usar. */
  let nuevosListos = $state(false);
  let cargando = $state(true);
  let avisoDatos = $state('');
  let error = $state('');
  /** Fallo de una acción del menú (visible). */
  let aviso = $state('');
  /** Lo que se anuncia a los lectores de pantalla tras una acción. */
  let anuncio = $state('');
  let menuAbierto = $state<number | null>(null);
  /** El episodio que se está preparando (la fuente puede tardar hasta ~15 s). */
  let abriendo = $state<{ aid: number; titulo: string; numero: number } | null>(null);
  /** Series con una acción de guardado en curso: otra sobre la misma se ignora hasta que termine. */
  let enCurso = $state(new Set<number>());
  let campo = $state<HTMLInputElement | null>(null);
  let panel = $state<HTMLElement | null>(null);
  const ahora = Date.now();

  const vista = nav.biblioteca;
  const porAid = $derived(new Map(resumenes.map((r) => [r.aid, r])));
  const nuevoDe = (e: EntradaVista) => etiquetaNuevo(porAid.get(e.aid), e.ultimoEpisodio);
  const cuentas = $derived(entradas ? recuentosVista(entradas) : null);
  const enPestana = $derived(entradas ? dePestana(entradas, vista.pestana) : []);
  const generos = $derived(generosOfrecidos(enPestana));
  // Un «Con nuevos» recordado de otra visita no filtra hasta que llegan los datos de AniList: sin ellos vaciaría la lista.
  const filtros = $derived({ ...vista.filtros, soloNuevos: vista.filtros.soloNuevos && nuevosListos });
  const lista = $derived(ordenar(aplicarFiltros(enPestana, filtros, (e) => nuevoDe(e) !== undefined), ajustes.ordenBiblioteca));
  const nuevos = $derived(entradas && nuevosListos ? entradas.filter((e) => nuevoDe(e) !== undefined).length : 0);
  const filtrando = $derived(hayFiltros(filtros));

  // Un género que la pestaña nueva no tiene dejaría la cuadrícula vacía sin motivo visible: se quita.
  $effect(() => {
    if (entradas && vista.filtros.genero !== null && !generos.some((g) => g.valor === vista.filtros.genero)) {
      vista.filtros.genero = null;
    }
  });

  onMount(async () => {
    void asegurarAjustes();
    try {
      avisoDatos = (await estadoDatos()) ?? '';
      if (!avisoDatos) {
        entradas = unir(await listarBiblioteca());
        cargando = false;
        // Extra opcional: si falla, simplemente no hay marcas «Nuevo».
        resumenes = await resumenesVinculados().catch((e) => {
          console.error(e);
          return [];
        });
        nuevosListos = true;
      }
    } catch (e) {
      console.error(e);
      error = textoDeError(e);
    } finally {
      cargando = false;
    }
  });

  const serieDe = (e: EntradaVista) => ({ aid: e.aid, slug: e.slug, titulo: e.titulo });

  function abrirFicha(e: EntradaVista) {
    abrir({ tipo: 'ficha', anime: { aid: e.aid, slug: e.slug, title: e.titulo } });
  }

  function elegirPestana(p: Pestana) {
    vista.pestana = p;
    menuAbierto = null;
  }

  async function teclaPestana(ev: KeyboardEvent) {
    const destino = pestanaVecina(vista.pestana, ev.key);
    if (destino === null) return;
    ev.preventDefault();
    elegirPestana(destino);
    await tick();
    document.getElementById(`pestana-${destino}`)?.focus();
  }

  /** El recuento de nuevos es de toda la biblioteca: se muestra en «Todas». */
  function mostrarNuevos() {
    elegirPestana('todos');
    // Solo «con nuevos»: un texto o género previos harían que se vieran menos de los K anunciados.
    vista.filtros = { ...SIN_FILTROS, soloNuevos: true };
  }

  function cambiarOrden(o: Orden) {
    ajustes.ordenBiblioteca = o;
    guardarAjusteSilencioso('biblioteca_orden', valorDeOrden(o));
  }

  function quitarFiltros() {
    vista.filtros = { ...SIN_FILTROS };
  }

  function teclaVentana(ev: KeyboardEvent) {
    if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && !ev.shiftKey && ev.key.toLowerCase() === 'f' && nav.superior === null) {
      ev.preventDefault();
      campo?.focus();
    }
  }

  function teclaCampo(ev: KeyboardEvent) {
    if (ev.key === 'Escape' && vista.filtros.texto !== '') {
      ev.preventDefault();
      ev.stopPropagation();
      vista.filtros.texto = '';
    }
  }

  /** Cambia (o quita, con `null`) una serie de la lista en memoria. */
  function reemplazar(aid: number, cambio: Partial<EntradaVista> | null) {
    if (!entradas) return;
    entradas = cambio === null ? entradas.filter((x) => x.aid !== aid) : entradas.map((x) => (x.aid === aid ? { ...x, ...cambio } : x));
  }

  /** Deshace solo el estado de una serie tras un fallo: lo demás (p. ej. un favorito cambiado mientras tanto) se respeta. */
  function restaurar(e: EntradaVista) {
    if (!entradas) return;
    entradas = entradas.some((x) => x.aid === e.aid)
      ? entradas.map((x) => (x.aid === e.aid ? { ...x, estado: e.estado } : x))
      : [...entradas, e];
  }

  /** El foco vuelve al «⋯» de la serie o, si salió de la cuadrícula, a la tarjeta que ocupa su sitio. */
  async function devolverFoco(aid: number, indice: number) {
    await tick();
    const propio = panel?.querySelector<HTMLElement>(`li[data-aid="${aid}"] .mas`);
    if (propio) return propio.focus();
    const tarjetas = panel?.querySelectorAll<HTMLElement>('.tarjeta') ?? [];
    const destino = tarjetas[Math.min(indice, tarjetas.length - 1)] ?? document.getElementById(`pestana-${vista.pestana}`);
    destino?.focus();
  }

  function marcarEnCurso(aid: number, activo: boolean) {
    const copia = new Set(enCurso);
    if (activo) copia.add(aid);
    else copia.delete(aid);
    enCurso = copia;
  }

  async function cambiarEstado(e: EntradaVista, nuevo: number) {
    menuAbierto = null;
    if (enCurso.has(e.aid) || (e.estado ?? 0) === nuevo) return;
    const indice = lista.findIndex((x) => x.aid === e.aid);
    aviso = '';
    marcarEnCurso(e.aid, true);
    // Quitar de la biblioteca: un favorito se queda (sin estado); lo demás desaparece.
    reemplazar(e.aid, nuevo !== 0 ? { estado: nuevo } : e.favorito ? { estado: null } : null);
    // El foco no se queda en <body> mientras el comando está pendiente.
    void devolverFoco(e.aid, indice);
    try {
      await fijarEstado(serieDe(e), nuevo);
      avisarCambio(e.aid);
      anuncio = nuevo === 0 ? `${e.titulo} se quitó de la biblioteca` : `${e.titulo} pasó a ${nombreEstado(nuevo)}`;
    } catch (err) {
      console.error(err);
      restaurar(e);
      aviso = `No se pudo guardar el estado: ${textoDeError(err)}`;
    } finally {
      marcarEnCurso(e.aid, false);
    }
    await devolverFoco(e.aid, indice);
  }

  async function alternar(e: EntradaVista) {
    menuAbierto = null;
    if (enCurso.has(e.aid)) return;
    const indice = lista.findIndex((x) => x.aid === e.aid);
    aviso = '';
    marcarEnCurso(e.aid, true);
    try {
      const favorito = await alternarFavorito(serieDe(e));
      reemplazar(e.aid, !favorito && e.estado === null ? null : { favorito });
      anuncio = favorito ? `${e.titulo} se añadió a favoritos` : `${e.titulo} se quitó de favoritos`;
    } catch (err) {
      console.error(err);
      aviso = `No se pudo cambiar el favorito: ${textoDeError(err)}`;
    } finally {
      marcarEnCurso(e.aid, false);
    }
    await devolverFoco(e.aid, indice);
  }

  async function reproducir(e: EntradaVista, numero: number) {
    menuAbierto = null;
    if (abriendo !== null) return;
    abriendo = { aid: e.aid, titulo: e.titulo, numero };
    aviso = '';
    const { seccion, superior } = nav;
    try {
      const r = await prepararReproduccion(depsReanudar, e, numero);
      // Si el usuario se fue a otra parte mientras tanto, abrir el reproductor ahora sería un salto inesperado.
      if (nav.seccion !== seccion || nav.superior !== superior) return;
      abrir({ tipo: 'reproducir', anime: { aid: e.aid, slug: e.slug, title: e.titulo }, ...r });
    } catch (err) {
      console.error(err);
      aviso = mensajeDeError(err);
      avisarFalloDeFuente(err);
    } finally {
      abriendo = null;
    }
  }
</script>

<svelte:window onkeydown={teclaVentana} />

<main class="pantalla">
  <header class="cabecera">
    <h1>Biblioteca</h1>
    {#if entradas && cuentas && entradas.length > 0}
      <p class="resumen">
        {textoResumen(entradas.length, cuentas.viendo)}
        {#if nuevos > 0}
          · <button class="enlace" onclick={mostrarNuevos}>{textoNuevos(nuevos)}</button>
        {/if}
      </p>
    {/if}
  </header>

  {#if avisoDatos}
    <p class="error" role="alert">Datos locales no disponibles: {avisoDatos}</p>
  {:else if cargando}
    <Esqueleto variante="cuadricula" cantidad={12} />
  {:else if error}
    <p class="error" role="alert">{error}</p>
  {:else if entradas && cuentas}
    {#if entradas.length > 0}
      <div class="pestanas" role="tablist" aria-label="Estado">
        {#each PESTANAS as p (p.id)}
          <button
            role="tab"
            id={`pestana-${p.id}`}
            aria-selected={vista.pestana === p.id}
            aria-controls="panel-biblioteca"
            tabindex={vista.pestana === p.id ? 0 : -1}
            onclick={() => elegirPestana(p.id)}
            onkeydown={teclaPestana}
          >
            {p.nombre} <span class="cuenta">({cuentas[p.id]})</span>
          </button>
        {/each}
      </div>

      <div class="herramientas">
        <input
          type="search"
          bind:this={campo}
          bind:value={vista.filtros.texto}
          onkeydown={teclaCampo}
          placeholder="Buscar en la biblioteca"
          aria-label="Buscar en la biblioteca"
        />
        <button class="chip" aria-pressed={vista.filtros.soloFavoritos} onclick={() => (vista.filtros.soloFavoritos = !vista.filtros.soloFavoritos)}>
          ★ Favoritos
        </button>
        <button
          class="chip"
          aria-pressed={vista.filtros.soloNuevos}
          disabled={!nuevosListos}
          onclick={() => (vista.filtros.soloNuevos = !vista.filtros.soloNuevos)}
        >
          Con nuevos
        </button>
        <label class="control">
          Género
          <select
            aria-label="Género"
            value={vista.filtros.genero ?? ''}
            disabled={generos.length === 0}
            title={generos.length === 0 ? 'Ninguna serie de esta pestaña está vinculada con AniList' : undefined}
            onchange={(ev) => (vista.filtros.genero = ev.currentTarget.value || null)}
          >
            <option value="">Todos</option>
            {#each generos as g (g.valor)}<option value={g.valor}>{g.nombre}</option>{/each}
          </select>
        </label>
        <label class="control">
          Ordenar
          <select aria-label="Ordenar por" value={ajustes.ordenBiblioteca} onchange={(ev) => cambiarOrden(ev.currentTarget.value as Orden)}>
            {#each ORDENES as o (o.id)}<option value={o.id}>{o.nombre}</option>{/each}
          </select>
        </label>
      </div>

      {#if filtrando && lista.length > 0}
        <p class="linea-filtros">
          {lineaFiltros(lista.length, enPestana.length)} · <button class="enlace" onclick={quitarFiltros}>Quitar filtros</button>
        </p>
      {/if}
    {/if}

    {#if abriendo}<p class="estado-apertura" role="status">Abriendo {abriendo.titulo}, Ep. {abriendo.numero}…</p>{/if}
    {#if aviso}<p class="error" role="alert">{aviso}</p>{/if}
    <p class="solo-lectores" aria-live="polite">{anuncio}</p>

    <div role={entradas.length > 0 ? 'tabpanel' : undefined} id="panel-biblioteca" aria-labelledby={entradas.length > 0 ? `pestana-${vista.pestana}` : undefined} bind:this={panel}>
      {#if lista.length === 0}
        {@const vacio = estadoVacioVista(vista.pestana, filtros, entradas.length, enPestana.length)}
        <Vacio titulo={vacio.titulo} texto={vacio.texto}>
          {#each vacio.acciones as accion (accion)}
            {#if accion === 'catalogo'}
              <button class="principal" onclick={() => irASeccion('catalogo')}>Ir al Catálogo</button>
            {:else if accion === 'ajustes'}
              <button onclick={() => irASeccion('ajustes')}>Importar copia de Ukiku</button>
            {:else}
              <button class="principal" onclick={quitarFiltros}>Quitar filtros</button>
            {/if}
          {/each}
        </Vacio>
      {:else}
        <ul class="cuadricula">
          {#each lista as e (e.aid)}
            <li data-aid={e.aid}>
              <TarjetaPoster
                aid={e.aid}
                titulo={e.titulo}
                subtitulo={subtituloTarjeta(e, vista.pestana === 'todos', ahora)}
                etiqueta={nuevoDe(e)}
                progreso={fraccion(e)}
                favorito={e.favorito}
                alAbrir={() => abrirFicha(e)}
                alMenuContextual={() => (menuAbierto = e.aid)}
              >
                {#snippet acciones()}
                  <MenuSerie
                    titulo={e.titulo}
                    estado={e.estado}
                    favorito={e.favorito}
                    abierto={menuAbierto === e.aid}
                    alAbrir={() => (menuAbierto = e.aid)}
                    alCerrar={() => (menuAbierto = null)}
                    cargarPrincipal={() => principalDeSerie(depsReanudar, e)}
                    alReproducir={(n) => reproducir(e, n)}
                    alCambiarEstado={(n) => cambiarEstado(e, n)}
                    alAlternarFavorito={() => alternar(e)}
                    alQuitar={() => cambiarEstado(e, 0)}
                    ocupado={abriendo?.aid === e.aid || enCurso.has(e.aid)}
                  />
                {/snippet}
              </TarjetaPoster>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</main>

<style>
  .cabecera h1 {
    margin: 0;
  }
  .resumen {
    margin: 4px 0 0;
    color: var(--texto-suave);
  }
  .pestanas {
    display: flex;
    gap: 2px;
    overflow: auto hidden;
    margin: var(--espacio) 0 12px;
    /* Separador por sombra interior: con un borde y margin-bottom: -1px en los botones la fila desbordaba 1 px y salía una barra vertical. */
    box-shadow: inset 0 -1px 0 var(--borde);
  }
  .pestanas button {
    padding: 8px 12px;
    border: 0;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    background: none;
    color: var(--texto-suave);
    font-weight: 400;
    white-space: nowrap;
  }
  .pestanas button:hover:not(:disabled) {
    background: none;
    color: var(--texto);
  }
  .pestanas button[aria-selected='true'] {
    border-bottom-color: var(--acento);
    color: var(--texto);
  }
  .pestanas button:focus-visible {
    outline-offset: -2px;
  }
  .cuenta {
    margin-left: 6px;
    color: var(--texto-suave);
    font-size: 0.85em;
  }
  .herramientas {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }
  .herramientas input[type='search'] {
    flex: 1 1 220px;
  }
  .chip {
    border-radius: 999px;
  }
  .chip[aria-pressed='true'],
  .chip[aria-pressed='true']:hover:not(:disabled) {
    border-color: var(--acento);
    background: var(--acento);
    color: var(--sobre-acento);
  }
  .control {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--texto-suave);
  }
  .estado-apertura {
    margin: 0 0 12px;
    color: var(--texto-suave);
  }
  .linea-filtros {
    margin: 0 0 12px;
    color: var(--texto-suave);
  }
</style>
