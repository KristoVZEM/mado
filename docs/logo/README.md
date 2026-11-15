# Logo

Una ventana shoji (de papel) con ojos que miran desde detrás, inspirada en el yokai *mokumokuren*. «Mado» significa
ventana en japonés.

| Archivo | Uso |
|---|---|
| `mado.svg` | Logo completo, con rejilla de 3×3 y cinco ojos. Para tamaños de 64 px o más. |
| `mado-pequeno.svg` | Versión simplificada, con rejilla de 2×2 y cuatro ojos grandes. Para tamaños de 48 px o menos, donde la completa se emborrona. |

## Colores

| Color | Valor |
|---|---|
| Amarillo (fondo) | `#ffe107` |
| Negro sumi | `#161616` |
| Papel | `#f5eedc` |
| Bermellón | `#e8412a` |

## Regenerar los iconos

Desde `app/`, con las herramientas de Tauri ya instaladas:

```
npx tauri icon ../docs/logo/mado.svg
```

genera el conjunto completo en `app/src-tauri/icons/`. Los iconos pequeños salen de la versión simplificada: `32x32.png`,
`Square30x30Logo.png`, `Square44x44Logo.png`, `StoreLogo.png` y los marcos de 16, 24, 32 y 48 px de `icon.ico`.
Se generan igual, con `mado-pequeno.svg`, y se sustituyen en esos archivos.

## Imagen de vista previa

`docs/social-preview.png` (1280 × 640) es la imagen que GitHub enseña al compartir el repositorio. Se sube a mano en
Settings → General → Social preview.
