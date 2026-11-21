<script lang="ts">
  import { avisoDeVersion } from '../actualizacion.ts';
  import { actualizacion, aplazarActualizacion, instalarActualizacion } from '../actualizacion.svelte.ts';
  import { agruparListas, bloquesDeNotas } from '../notasActualizacion.ts';

  // Las novedades van plegadas: el aviso es discreto y quien quiera las abre con «Novedades».
  let verNotas = $state(false);
  const elementos = $derived(actualizacion.notas ? agruparListas(bloquesDeNotas(actualizacion.notas)) : []);
</script>

<!-- Aviso global de versión nueva. Vive en el armazón, que el Reproductor no usa: nunca aparece durante un episodio. -->
{#if actualizacion.estado === 'disponible' && !actualizacion.descartado}
  <div class="aviso-actualizacion" role="status">
    <span>{avisoDeVersion(actualizacion.version)}</span>
    {#if elementos.length > 0}
      <button aria-expanded={verNotas} aria-controls="novedades-version" onclick={() => (verNotas = !verNotas)}>Novedades</button>
    {/if}
    <button class="principal" onclick={() => instalarActualizacion()}>Actualizar</button>
    <button onclick={aplazarActualizacion}>Más tarde</button>
    {#if verNotas && elementos.length > 0}
      <!-- Texto plano: las notas vienen de un archivo remoto sin firmar y nunca se pintan como marcado. Sin `aria-live`
           propio para que abrirlas no las lea en voz alta de golpe. -->
      <div class="novedades" id="novedades-version" aria-live="off">
        {#each elementos as e, i (i)}
          {#if e.tipo === 'titulo'}
            <h3>{e.texto}</h3>
          {:else if e.tipo === 'parrafo'}
            <p>{#each e.partes as p, j (j)}{#if p.negrita}<strong>{p.texto}</strong>{:else}{p.texto}{/if}{/each}</p>
          {:else}
            <ul>
              {#each e.items as item, k (k)}
                <li>{#each item as p, j (j)}{#if p.negrita}<strong>{p.texto}</strong>{:else}{p.texto}{/if}{/each}</li>
              {/each}
            </ul>
          {/if}
        {/each}
      </div>
    {/if}
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
    flex-wrap: wrap;
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
  /* Las novedades ocupan su propia fila, con tope de alto para no empujar toda la pantalla. */
  .novedades {
    flex: 1 0 100%;
    max-height: 240px;
    overflow-y: auto;
    padding: 10px 2px 2px;
    border-top: 1px solid var(--borde);
    font-size: 0.875rem;
  }
  .novedades h3 {
    margin: 10px 0 4px;
    font-size: 0.875rem;
    font-weight: 700;
  }
  .novedades h3:first-child {
    margin-top: 0;
  }
  .novedades p {
    margin: 0 0 6px;
  }
  .novedades ul {
    margin: 0 0 6px;
    padding-left: 20px;
  }
  .novedades li {
    margin: 2px 0;
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
