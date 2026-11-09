<script lang="ts">
  import { onMount } from 'svelte';
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

<h3>Cuenta de AniList</h3>

{#if sync.cuenta}
  <p>
    Conectada como <strong>{sync.cuenta.nombre}</strong>.
    {#if sync.cuenta.ultimaSync !== null}Última sincronización: {fecha(sync.cuenta.ultimaSync)}.{:else}Aún no sincronizaste.{/if}
  </p>
  {#if sync.fase === 'vista-previa' && sync.plan}
    <div class="vista-previa" role="group" aria-label="Vista previa de la primera sincronización">
      <p>Esto es lo que va a pasar. Lo que se suba a AniList no se puede deshacer.</p>
      <ul>
        <li>Se subirán <strong>{sync.plan.subir.length}</strong> series a AniList.</li>
        <li>Se bajarán <strong>{sync.plan.bajar.length}</strong> cambios a esta app.</li>
        <li>
          Estados distintos en ambos lados: <strong>{sync.plan.conflictos}</strong> (gana el cambio más reciente; si no
          hay fecha local, gana AniList).
        </li>
      </ul>
      <div class="acciones">
        <button onclick={confirmarVistaPrevia} disabled={ocupado}>Sincronizar</button>
        <button onclick={cancelarVistaPrevia} disabled={ocupado}>Cancelar</button>
      </div>
    </div>
  {:else}
    <div class="acciones">
      <button onclick={sincronizarAhora} disabled={ocupado}>Sincronizar ahora</button>
      <button onclick={desconectar} disabled={ocupado}>Desconectar</button>
    </div>
  {/if}
{:else}
  <ol>
    <li>
      Registra una app en AniList (Settings → Developer) con la URL de redirección
      <code>https://anilist.co/api/v2/oauth/pin</code> y escribe aquí su Client ID.
    </li>
    <li>Copia el enlace, ábrelo en tu navegador y autoriza. AniList te mostrará un token.</li>
    <li>Pega el token y pulsa Conectar. Se guarda en el almacén de credenciales de Windows.</li>
  </ol>
  <label>
    Client ID
    <input bind:value={clientId} inputmode="numeric" aria-invalid={clientId !== '' && !clientIdOk} />
  </label>
  <div class="acciones">
    <button onclick={copiarEnlace} disabled={!clientIdOk}>Copiar enlace de autorización</button>
    {#if copiado}<span role="status">Enlace copiado.</span>{/if}
  </div>
  <label>
    Token
    <input bind:value={token} type="password" autocomplete="off" spellcheck="false" />
  </label>
  <div class="acciones">
    <button onclick={pulsarConectar} disabled={ocupado || token.trim() === ''}>Conectar</button>
  </div>
{/if}

{#if sync.mensaje}
  <p role={sync.fase === 'error' ? 'alert' : 'status'} class:error={sync.fase === 'error'}>{sync.mensaje}</p>
{/if}
