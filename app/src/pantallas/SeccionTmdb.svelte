<script lang="ts">
  import { onMount } from 'svelte';
  import FilaAjuste from '../lib/componentes/FilaAjuste.svelte';
  import { NoAutorizado } from '../../../core/src/index.ts';
  import { borrarClaveTmdb, guardarClaveTmdb } from '../lib/datos.ts';
  import { textoDeError } from '../lib/errores.ts';
  import { clienteTmdb, hayClaveTmdb, olvidarClaveTmdb } from '../lib/tmdbCliente.ts';

  let hayClave = $state(false);
  /** Con la clave ya puesta, `true` mientras se escribe una nueva. */
  let cambiando = $state(false);
  let clave = $state('');
  let ocupado = $state(false);
  let mensaje = $state('');
  let fallo = $state(false);

  onMount(async () => {
    try {
      hayClave = await hayClaveTmdb();
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
    }
  });

  async function guardar() {
    const c = clave;
    clave = ''; // la clave no se queda en el campo
    ocupado = true;
    mensaje = '';
    try {
      await guardarClaveTmdb(c);
      olvidarClaveTmdb();
      await clienteTmdb.probar();
      hayClave = true;
      cambiando = false;
      fallo = false;
      mensaje = 'Clave guardada y comprobada. Las imágenes aparecerán al abrir cada serie.';
    } catch (e) {
      fallo = true;
      if (e instanceof NoAutorizado) {
        // Una clave rechazada no se conserva.
        await borrarClaveTmdb().catch(() => {});
        olvidarClaveTmdb();
        hayClave = false;
        mensaje = 'TMDB no aceptó esa clave. Revisa que sea la clave de API o el token de lectura.';
      } else {
        // Se guardó, pero no se pudo comprobar (sin red, por ejemplo): se deja puesta.
        hayClave = await hayClaveTmdb().catch(() => false);
        mensaje = `No se pudo comprobar la clave: ${textoDeError(e)}`;
      }
    } finally {
      ocupado = false;
    }
  }

  async function quitar() {
    ocupado = true;
    try {
      await borrarClaveTmdb();
      olvidarClaveTmdb();
      hayClave = false;
      cambiando = false;
      fallo = false;
      mensaje = 'Clave borrada. Las series vuelven a usar solo las imágenes de AniList.';
    } catch (e) {
      fallo = true;
      mensaje = `No se pudo borrar la clave: ${textoDeError(e)}`;
    } finally {
      ocupado = false;
    }
  }
</script>

<h3 class="grupo">TMDB</h3>

{#if hayClave && !cambiando}
  <!-- Ya hay clave: solo el estado y las dos acciones, sin las instrucciones. -->
  <FilaAjuste id="tmdb-cambiar" titulo="Conectado" ayuda="Las series muestran su logo y un fondo de más calidad.">
    <button id="tmdb-cambiar" onclick={() => (cambiando = true)} disabled={ocupado}>Cambiar clave</button>
    <button onclick={quitar} disabled={ocupado}>Quitar clave</button>
  </FilaAjuste>
{:else}
  {#if !hayClave}
    <FilaAjuste id="tmdb-estado" titulo="Sin clave" ayuda="Con una clave gratuita las series muestran su logo y un fondo de más calidad. Sin ella todo funciona con las imágenes de AniList.">
      <details class="como">
        <summary>Cómo conseguirla</summary>
        <ol>
          <li>Crea una cuenta en themoviedb.org y, en Ajustes → API, solicita una clave de uso personal.</li>
          <li>Pega aquí la clave de API o el token de lectura y pulsa Guardar. Se guarda en el almacén de credenciales de Windows.</li>
        </ol>
      </details>
    </FilaAjuste>
  {/if}
  <FilaAjuste id="tmdb-clave" titulo={hayClave ? 'Clave nueva' : 'Clave'} ayuda="La clave de API o el token de lectura de TMDB.">
    <input id="tmdb-clave" class="campo" bind:value={clave} type="password" autocomplete="off" spellcheck="false" />
    <button class="principal" onclick={guardar} disabled={ocupado || clave.trim() === ''}>Guardar</button>
    {#if cambiando}<button onclick={() => ((cambiando = false), (clave = ''))} disabled={ocupado}>Cancelar</button>{/if}
  </FilaAjuste>
{/if}
{#if mensaje}
  <p class="mensaje" role={fallo ? 'alert' : 'status'} class:error={fallo}>{mensaje}</p>
{/if}
<p class="atribucion">Este producto usa la API de TMDB pero no está avalado ni certificado por TMDB.</p>

<style>
  .campo {
    width: 200px;
  }
  .como {
    color: var(--texto-suave);
    font-size: 0.875rem;
  }
  .como summary {
    cursor: pointer;
  }
  .como ol {
    max-width: 52ch;
    margin: 8px 0 0;
    padding-left: 20px;
  }
  .mensaje {
    margin: 12px 0 0;
  }
  .atribucion {
    margin: 16px 0 0;
    color: var(--texto-suave);
    font-size: 0.85rem;
  }
</style>
