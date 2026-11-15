<script lang="ts">
  import { avisoDeVersion } from '../actualizacion.ts';
  import { actualizacion, aplazarActualizacion, instalarActualizacion } from '../actualizacion.svelte.ts';
</script>

<!-- Aviso global de versión nueva. Vive en el armazón, que el Reproductor no usa: nunca aparece durante un episodio. -->
{#if actualizacion.estado === 'disponible' && !actualizacion.descartado}
  <div class="aviso-actualizacion" role="status">
    <span>{avisoDeVersion(actualizacion.version)}</span>
    <button class="principal" onclick={() => instalarActualizacion()}>Actualizar</button>
    <button onclick={aplazarActualizacion}>Más tarde</button>
  </div>
{:else if actualizacion.estado === 'descargando'}
  <div class="aviso-actualizacion" role="status">
    <span>Descargando la actualización{actualizacion.porcentaje === null ? '…' : `: ${actualizacion.porcentaje} %`}</span>
  </div>
{:else if actualizacion.estado === 'descargada'}
  <div class="aviso-actualizacion" role="status">
    <span>La actualización está descargada y lista para instalar.</span>
    <button class="principal" onclick={() => instalarActualizacion()}>Instalar y reiniciar</button>
  </div>
{:else if actualizacion.estado === 'fallo'}
  <div class="aviso-actualizacion" role="alert">
    <span>{actualizacion.mensaje}</span>
    <button class="principal" onclick={() => instalarActualizacion()}>Reintentar</button>
    <button onclick={aplazarActualizacion}>Cerrar</button>
  </div>
{/if}

<style>
  .aviso-actualizacion {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 72px var(--margen) 0;
    padding: 10px 14px;
    background: var(--superficie);
    border: 1px solid var(--borde);
    border-left: 3px solid var(--acento);
    border-radius: var(--radio);
  }
  .aviso-actualizacion span {
    flex: 1;
  }
  /* Con el aviso puesto, él ya deja el hueco de la cabecera. */
  .aviso-actualizacion + :global(.pantalla) {
    padding-top: 24px;
  }
  /* Con los dos avisos a la vez, el segundo no repite el hueco de la cabecera. */
  .aviso-actualizacion + :global(.aviso-fuente) {
    margin-top: 8px;
  }
</style>
