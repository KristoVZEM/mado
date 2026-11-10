<script lang="ts">
  import FilaAjuste from '../lib/componentes/FilaAjuste.svelte';
  import { ajustes, guardarAjusteSilencioso } from '../lib/ajustes.svelte.ts';
  import {
    ACENTOS,
    PARTES_INICIO,
    TAMANOS_POSTER,
    TEMAS,
    conParte,
    parteOculta,
    temaDe,
    valorDeTema,
    type ParteInicio,
  } from '../lib/apariencia.ts';

  function elegirOrden(v: string) {
    ajustes.ordenDescendente = v === 'desc';
    guardarAjusteSilencioso('orden_episodios', ajustes.ordenDescendente ? '1' : '0');
  }

  function elegirTema(v: string) {
    ajustes.tema = temaDe(String(TEMAS.findIndex((t) => t.id === v)));
    guardarAjusteSilencioso('tema', valorDeTema(ajustes.tema));
  }

  function elegirAcento(i: number) {
    ajustes.acento = i;
    guardarAjusteSilencioso('acento', String(i));
  }

  function elegirTamano(v: string) {
    ajustes.tamanoPosters = Number(v);
    guardarAjusteSilencioso('tamano_posters', v);
  }

  function mostrarParte(parte: ParteInicio, visible: boolean) {
    ajustes.inicioOcultas = conParte(ajustes.inicioOcultas, parte, !visible);
    guardarAjusteSilencioso('inicio_ocultas', String(ajustes.inicioOcultas));
  }
</script>

<h2>Apariencia</h2>

<FilaAjuste id="tema" titulo="Tema" ayuda="«Como el sistema» sigue el modo claro u oscuro de Windows.">
  <select id="tema" value={ajustes.tema} onchange={(e) => elegirTema(e.currentTarget.value)}>
    {#each TEMAS as t (t.id)}<option value={t.id}>{t.nombre}</option>{/each}
  </select>
</FilaAjuste>

<FilaAjuste id="acento" titulo="Color de acento" ayuda="Botones activos, selección y avisos.">
  <div class="colores" role="radiogroup" id="acento" aria-label="Color de acento">
    {#each ACENTOS as a, i (a.nombre)}
      <button
        class="color"
        role="radio"
        aria-checked={ajustes.acento === i}
        aria-label={a.nombre}
        title={a.nombre}
        style:background={a.color}
        onclick={() => elegirAcento(i)}
      ></button>
    {/each}
  </div>
</FilaAjuste>

<FilaAjuste id="tamano" titulo="Tamaño de los pósters" ayuda="Catálogo, Biblioteca, Emisión y las filas de Inicio.">
  <select id="tamano" value={String(ajustes.tamanoPosters)} onchange={(e) => elegirTamano(e.currentTarget.value)}>
    {#each TAMANOS_POSTER as t, i (t.nombre)}<option value={String(i)}>{t.nombre}</option>{/each}
  </select>
</FilaAjuste>

<FilaAjuste id="orden" titulo="Orden de los episodios" ayuda="Cómo se listan los episodios en la ficha de cada serie.">
  <select id="orden" value={ajustes.ordenDescendente ? 'desc' : 'asc'} onchange={(e) => elegirOrden(e.currentTarget.value)}>
    <option value="asc">Del primero al último</option>
    <option value="desc">Del último al primero</option>
  </select>
</FilaAjuste>

<fieldset class="partes">
  <legend>Partes de Inicio</legend>
  <p class="ayuda">Desmarca las que no quieras ver. Siguen funcionando aunque estén ocultas.</p>
  {#each PARTES_INICIO as p (p.id)}
    <label class="parte">
      <input type="checkbox" checked={!parteOculta(ajustes.inicioOcultas, p.id)} onchange={(e) => mostrarParte(p.id, e.currentTarget.checked)} />
      {p.nombre}
    </label>
  {/each}
</fieldset>

<style>
  .colores {
    display: flex;
    gap: 10px;
  }
  /* Círculo de color; el elegido lleva un anillo del color del texto separado del círculo. */
  .color {
    width: 26px;
    height: 26px;
    min-height: 0;
    padding: 0;
    border: 2px solid transparent;
    border-radius: 50%;
    background-clip: content-box;
    box-shadow: inset 0 0 0 1px var(--borde-control);
  }
  .color[aria-checked='true'] {
    border-color: var(--texto);
    padding: 2px;
  }
  .color:hover:not(:disabled) {
    opacity: 0.85;
  }
  .partes {
    margin: 0;
    padding: 18px 0 0;
    border: 0;
    border-top: 1px solid var(--borde);
  }
  .partes legend {
    float: left;
    width: 100%;
    padding: 0;
    font-weight: 600;
  }
  .ayuda {
    clear: both;
    margin: 2px 0 12px;
    color: var(--texto-suave);
    font-size: 0.875rem;
  }
  .parte {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 0;
  }
</style>
