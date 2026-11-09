<script lang="ts">
  import { onMount } from 'svelte';
  import { NoAutorizado } from '../../../core/src/index.ts';
  import { borrarClaveTmdb, guardarClaveTmdb } from '../lib/datos.ts';
  import { textoDeError } from '../lib/errores.ts';
  import { clienteTmdb, hayClaveTmdb, olvidarClaveTmdb } from '../lib/tmdbCliente.ts';

  let hayClave = $state(false);
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

<h3>Imágenes de TMDB</h3>
<p>
  Con una clave gratuita de TMDB, las series muestran su logo y un fondo de más calidad. Sin clave todo sigue
  funcionando con las imágenes de AniList.
</p>
<ol>
  <li>Crea una cuenta en themoviedb.org y, en Ajustes → API, solicita una clave de uso personal.</li>
  <li>Pega aquí la clave de API o el token de lectura y pulsa Guardar. Se guarda en el almacén de credenciales de Windows.</li>
</ol>
<p>Estado: <strong>{hayClave ? 'clave guardada' : 'sin clave'}</strong></p>
<label>
  Clave
  <input bind:value={clave} type="password" autocomplete="off" spellcheck="false" />
</label>
<div class="acciones">
  <button class="principal" onclick={guardar} disabled={ocupado || clave.trim() === ''}>Guardar</button>
  {#if hayClave}<button onclick={quitar} disabled={ocupado}>Quitar clave</button>{/if}
</div>
{#if mensaje}
  <p role={fallo ? 'alert' : 'status'} class:error={fallo}>{mensaje}</p>
{/if}
<p class="atribucion">Este producto usa la API de TMDB pero no está avalado ni certificado por TMDB.</p>

<style>
  .atribucion {
    color: var(--texto-suave);
    font-size: 0.85rem;
  }
</style>
