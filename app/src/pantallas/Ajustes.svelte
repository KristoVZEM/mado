<script lang="ts">
  import { ajustes, asegurarAjustes, guardarAjusteSilencioso } from '../lib/ajustes.svelte.ts';
  import { LIMITES } from '../lib/ajustes.ts';
  import { validarSalto } from '../lib/continuar.ts';
  import { SALTO_CORTO_S, SALTO_LARGO_S } from '../lib/saltos.ts';

  import { onMount } from 'svelte';
  import { estadoDatos } from '../lib/datos.ts';
  import { cancelar, confirmar, elegirCarpeta, importacion, importar } from '../lib/importacion.svelte.ts';
  import { lineasResumen, textoAviso } from '../lib/importar.ts';
  import SeccionAnilist from './SeccionAnilist.svelte';
  import SeccionAvisos from './SeccionAvisos.svelte';
  import SeccionTmdb from './SeccionTmdb.svelte';

  let datosOk = $state(false);

  function elegirIdiomaDefecto(v: string) {
    ajustes.idiomaDefecto = v === 'DUB' ? 'DUB' : 'SUB';
    guardarAjusteSilencioso('idioma_defecto', ajustes.idiomaDefecto === 'DUB' ? '1' : '0');
  }

  function elegirOrden(v: string) {
    ajustes.ordenDescendente = v === 'desc';
    guardarAjusteSilencioso('orden_episodios', ajustes.ordenDescendente ? '1' : '0');
  }

  onMount(async () => {
    void asegurarAjustes();
    datosOk = (await estadoDatos().catch(() => 'error')) === null;
  });

  // El estado de la importación vive en su propio módulo: sobrevive a cerrar y reabrir Ajustes.
  const fase = $derived(importacion.fase);

  let guardado = $state(false);
  let corto = $state(String(ajustes.saltoCorto));
  let largo = $state(String(ajustes.saltoLargo));

  const cortoOk = $derived(validarSalto(corto, ...LIMITES.saltoCorto));
  const largoOk = $derived(validarSalto(largo, ...LIMITES.saltoLargo));

  function guardar() {
    if (cortoOk === null || largoOk === null) return;
    ajustes.saltoCorto = cortoOk;
    ajustes.saltoLargo = largoOk;
    guardarAjusteSilencioso('salto_corto', String(cortoOk));
    guardarAjusteSilencioso('salto_largo', String(largoOk));
    guardado = true;
  }

  function restablecer() {
    corto = String(SALTO_CORTO_S);
    largo = String(SALTO_LARGO_S);
    guardado = false;
  }

  function descartar() {
    corto = String(ajustes.saltoCorto);
    largo = String(ajustes.saltoLargo);
    guardado = false;
  }
</script>

<main class="pantalla">
<h1>Ajustes</h1>
<div class="ajustes">
  <section class="bloque" aria-label="Reproductor">
    <h2>Reproductor</h2>
    <div class="campos">
      <label>
        Salto corto (s, {LIMITES.saltoCorto[0]}–{LIMITES.saltoCorto[1]})
        <input bind:value={corto} oninput={() => (guardado = false)} inputmode="numeric" aria-invalid={cortoOk === null} />
      </label>
      <label>
        Salto largo (s, {LIMITES.saltoLargo[0]}–{LIMITES.saltoLargo[1]})
        <input bind:value={largo} oninput={() => (guardado = false)} inputmode="numeric" aria-invalid={largoOk === null} />
      </label>
    </div>
    <div class="acciones">
      <button class="principal" onclick={guardar} disabled={cortoOk === null || largoOk === null}>Guardar</button>
      <button onclick={restablecer}>Restablecer</button>
      <button onclick={descartar}>Descartar cambios</button>
    </div>
    {#if guardado}<p role="status">Guardado.</p>{/if}
  </section>

  <section class="bloque" aria-label="Episodios">
    <h2>Episodios</h2>
    <div class="campos">
      <label>
        Idioma por defecto
        <select value={ajustes.idiomaDefecto} onchange={(e) => elegirIdiomaDefecto(e.currentTarget.value)}>
          <option value="SUB">SUB</option>
          <option value="DUB">DUB</option>
        </select>
      </label>
      <label>
        Orden de los episodios
        <select value={ajustes.ordenDescendente ? 'desc' : 'asc'} onchange={(e) => elegirOrden(e.currentTarget.value)}>
          <option value="asc">Del primero al último</option>
          <option value="desc">Del último al primero</option>
        </select>
      </label>
    </div>
    <p class="nota">El idioma es solo para las series en las que todavía no elegiste uno; lo que elegiste por serie manda.</p>
  </section>

  <section class="bloque" aria-label="Importar copia de Ukiku">
    <h2>Importar copia de Ukiku</h2>
    {#if !datosOk}
      <p class="error">Los datos locales no están disponibles; no se puede importar.</p>
    {:else if fase.tipo === 'inicio' || fase.tipo === 'error' || fase.tipo === 'listo'}
      <p>
        Elige la carpeta de tu copia de seguridad de Ukiku (local o de Dropbox). Solo se leen los archivos
        <code>history</code>, <code>following</code> y <code>favs</code>.
      </p>
      <button onclick={elegirCarpeta}>Elegir carpeta…</button>
      {#if fase.tipo === 'error'}<p class="error" role="alert">{fase.texto}</p>{/if}
      {#if fase.tipo === 'listo'}<p role="status">{fase.texto}</p>{/if}
    {:else if fase.tipo === 'vista'}
      <ul class="resumen">
        {#each lineasResumen(fase.resumen) as linea}<li>{linea}</li>{/each}
      </ul>
      {#if fase.confirmando}
        <p class="error" role="alert">{textoAviso('reemplazar', fase.resumen)}</p>
        <div class="acciones">
          <button onclick={() => importar('reemplazar')}>Sí, reemplazar</button>
          <button onclick={() => confirmar(false)}>Cancelar</button>
        </div>
      {:else}
        <p>{textoAviso('mezclar', fase.resumen)}</p>
        <div class="acciones">
          <button onclick={() => importar('mezclar')}>Mezclar</button>
          <button onclick={() => confirmar(true)}>Reemplazar…</button>
          <button onclick={cancelar}>Cancelar</button>
        </div>
      {/if}
    {:else}
      <p>Importando…</p>
    {/if}

  </section>

  <section class="bloque" aria-label="Cuenta de AniList"><SeccionAnilist /></section>

  <section class="bloque" aria-label="Avisos"><SeccionAvisos /></section>

  <section class="bloque" aria-label="Imágenes de TMDB"><SeccionTmdb /></section>
</div>
</main>

<style>
  .ajustes {
    display: grid;
    gap: 16px;
    max-width: 760px;
  }
  .campos {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
    margin-bottom: 16px;
  }
  label {
    display: grid;
    gap: 6px;
    color: var(--texto-suave);
    font-size: 0.875rem;
  }
  label input,
  label select {
    color: var(--texto);
    font-size: 1rem;
  }
  input[aria-invalid='true'] {
    outline: 2px solid #e53935;
  }
  .acciones {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .nota {
    margin: 0;
    color: var(--texto-suave);
    font-size: 0.875rem;
  }
  .resumen {
    margin: 0;
    padding-left: 18px;
  }
  .ajustes :global(h3) {
    margin: 0 0 12px;
    font-size: 1.15rem;
  }
</style>
