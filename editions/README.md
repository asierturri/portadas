# Añadir una editorial

1. Crea una carpeta en `editions/` con el nombre corto de la editorial.
2. Guarda dentro sus PNG planos (portada, contraportada y lomo) y un `edition.json`.
3. Añade una entrada a `editions/manifest.json` con su `id`, `name`, `kind: "template"` y la ruta del JSON.
4. Valida la plantilla ejecutando `node tools/validate-editions.mjs`.

La imagen frontal define la proporción. `heightMm` en el JSON define la altura física; el ancho se calcula a partir de la proporción del PNG frontal. La pila de páginas determina el grosor del lomo mediante `pages.mmPerPage` y `pages.minSpineMm`.

## Capas compatibles

- `assets.front`: overlay PNG con transparencia. La foto personalizada se coloca debajo.
- `assets.back`: diseño fijo de contraportada.
- `assets.spine`: diseño base del lomo. `spine.slices.leftEnd` y `rightStart` delimitan la zona central que conserva su escala; solo se estiran los laterales al cambiar el grosor.
- `front.composition: "author-title-bands"`: barras blancas/negras con autor, marca y título. El JSON define los controles y tipografía. El ancho de la banda del autor es fijo y su altura se puede ajustar con un rango definido por el JSON. La del título calcula su altura según las líneas necesarias.
- `back.bands`: posición horizontal y anchura de las dos bandas de contraportada. Sus alturas y posiciones verticales se sincronizan con las bandas del frontal, y muestran el recorte correspondiente de la foto de portada.
- `back.copy`: disposición y tipografía de la sinopsis editable. `back.authorPhoto` activa el selector de retrato; la misma foto se convierte a blanco y negro en la contraportada y en el lomo.
- `spine.authorPhoto`: coloca el retrato cuadrado arriba del lomo. El nombre del autor puede usar `afterPortrait` para quedar inmediatamente debajo de la imagen.

Las medidas de bandas y posiciones son proporciones del lienzo (0 a 1). Los tamaños de fuente, márgenes, altura del libro y grosor por página son píxeles o milímetros según el nombre de la propiedad.
