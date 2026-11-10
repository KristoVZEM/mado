<script lang="ts">
  import { onMount } from 'svelte';
  import FilaAjuste from '../lib/componentes/FilaAjuste.svelte';
  import { guardarAjuste, leerAjuste } from '../lib/datos.ts';
  import {
    cancelarVistaPrevia,
    cargarCuenta,
    conectar,
    confirmarVistaPrevia,
    desconectar,
    sincronizarAhora,
    sync,
    urlDeAutorizacion,
  } from '../lib/sync.svelte.ts';

  let clientId = $state('');
  let token = $state('');
  let copiado = $state(false);

  const clientIdOk = $derived(/^[1-9]\d{0,9}$/.test(clientId.trim()) && Number(clientId) <= 2_000_000_000);
  const ocupado = $derived(sync.fase === 'trabajando');

  onMount(async () => {
    await cargarCuenta();
    clientId = (await leerAjuste('anilist_client_id').catch(() => null)) ?? '';
  });

  async function copiarEnlace() {
    if (!clientIdOk) return;
    await guardarAjuste('anilist_client_id', clientId.trim()).catch(console.error);
    try {
      await navigator.clipboard.writeText(urlDeAutorizacion(Number(clientId)));
      copiado = true;
    } catch {
      copiado = false;
    }
  }

  async function pulsarConectar() {
    const t = token;
    token = ''; // el token no se queda en el campo
    await conectar(t);
  }

  const fecha = (ms: number) => new Date(ms).toLocaleString('es');
</script>

<h3 class="grupo">AniList</h3>

{#if sync.cuenta}
  <FilaAjuste
    id="anilist-sync"
    titulo="Conectada como {sync.cuenta.nombre}"
    ayuda={sync.cuenta.ultimaSync !== null ? `Última sincronización: ${fecha(sync.cuenta.ultimaSync)}.` : 'Aún no sincronizaste.'}
  >
    {#if sync.fase !== 'vista-previa'}
      <button id="anilist-sync" onclick={sincronizarAhora} disabled={ocupado}>Sincronizar ahora</button>
      <button onclick={desconectar} disabled={ocupado}>Desconectar</button>
    {/if}
  </FilaAjuste>
  {#if sync.fase === 'vista-previa' && sync.plan}
    <div class="confirmar" role="group" aria-label="Vista previa de la primera sincronización">
      <p>Esto es lo que va a pasar. Lo que se suba a AniList no se puede deshacer.</p>
      <ul>
        <li>Se subirán <strong>{sync.plan.subir.length}</strong> series a AniList.</li>
        <li>Se bajarán <strong>{sync.plan.bajar.length}</strong> cambios a esta app.</li>
        <li>
          Estados distintos en ambos lados: <strong>{sync.plan.conflictos}</strong> (gana el cambio más reciente; si no
          hay fecha local, gana AniList).
        </li>
      </ul>
      <div class="acciones-confirmar">
        <button class="principal" onclick={confirmarVistaPrevia} disabled={ocupado}>Sincronizar</button>
        <button onclick={cancelarVistaPrevia} disabled={ocupado}>Cancelar</button>
      </div>
    </div>
  {/if}
{:else}
  <FilaAjuste id="anilist-estado" titulo="Cuenta sin conectar" ayuda="Conecta tu cuenta para sincronizar tu lista con la de AniList.">
    <details class="como">
      <summary>Cómo conectarla</summary>
      <ol>
        <li>
          Registra una app en AniList (Settings → Developer) con la URL de redirección
          <code>https://anilist.co/api/v2/oauth/pin</code> y escribe aquí su Client ID.
        </li>
        <li>Copia el enlace, ábrelo en tu navegador y autoriza. AniList te mostrará un token.</li>
        <li>Pega el token y pulsa Conectar. Se guarda en el almacén de credenciales de Windows.</li>
      </ol>
    </details>
  </FilaAjuste>
  <FilaAjuste id="anilist-client" titulo="Client ID" ayuda="El número de tu app registrada en AniList.">
    <input id="anilist-client" class="campo" bind:value={clientId} inputmode="numeric" aria-invalid={clientId !== '' && !clientIdOk} />
  </FilaAjuste>
  <FilaAjuste id="anilist-enlace" titulo="Enlace de autorización" ayuda="Ábrelo en el navegador y autoriza la app.">
    {#if copiado}<span role="status" class="copiado">Enlace copiado.</span>{/if}
    <button id="anilist-enlace" onclick={copiarEnlace} disabled={!clientIdOk}>Copiar enlace</button>
  </FilaAjuste>
  <FilaAjuste id="anilist-token" titulo="Token" ayuda="El que te muestra AniList tras autorizar.">
    <input id="anilist-token" class="campo" bind:value={token} type="password" autocomplete="off" spellcheck="false" />
    <button class="principal" onclick={pulsarConectar} disabled={ocupado || token.trim() === ''}>Conectar</button>
  </FilaAjuste>
{/if}

{#if sync.mensaje}
  <p class="mensaje" role={sync.fase === 'error' ? 'alert' : 'status'} class:error={sync.fase === 'error'}>{sync.mensaje}</p>
{/if}

<style>
  .campo {
    width: 200px;
  }
  .copiado {
    color: var(--texto-suave);
    font-size: 0.875rem;
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
  .confirmar ul {
    margin: 0 0 12px;
    padding-left: 20px;
  }
  .acciones-confirmar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .mensaje {
    margin: 12px 0 0;
  }
</style>
