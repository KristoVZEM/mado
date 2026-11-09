<script lang="ts">
  /** Marcador de carga quieto (sin animación): `poster` es una fila, `cuadricula` una cuadrícula y `fila` una lista con miniatura. */
  let { variante, cantidad = 6 }: { variante: 'poster' | 'cuadricula' | 'fila'; cantidad?: number } = $props();
</script>

<div class="esqueleto {variante}" role="status" aria-label="Cargando">
  {#each Array(cantidad) as _, i (i)}<span aria-hidden="true"></span>{/each}
</div>

<style>
  span {
    display: block;
    border-radius: var(--radio);
    background: var(--superficie-2);
  }
  .poster {
    display: flex;
    gap: var(--espacio);
    overflow: hidden;
    padding-bottom: 8px;
  }
  .poster span {
    flex: 0 0 var(--ancho-poster);
    aspect-ratio: 2 / 3;
  }
  .cuadricula {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: var(--espacio);
  }
  .cuadricula span {
    aspect-ratio: 2 / 3;
  }
  .fila {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
    gap: 6px 16px;
  }
  /* Miniatura y dos líneas de texto, dibujadas con degradados planos. */
  .fila span {
    height: 96px;
    background:
      linear-gradient(var(--superficie-2) 0 0) 6px 6px / 150px 84px no-repeat,
      linear-gradient(var(--superficie-2) 0 0) 168px 24px / 55% 14px no-repeat,
      linear-gradient(var(--superficie-2) 0 0) 168px 50px / 30% 12px no-repeat;
  }
</style>
