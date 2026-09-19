# La Pulenta Biblioteca v0.4.2

Corrección del lector EPUB.

- Carga EPUB mediante Blob URL, más compatible con archivos guardados en IndexedDB.
- Fallback automático a ArrayBuffer si el navegador rechaza la primera vía.
- Dimensiones numéricas reales del visor para mejorar el renderizado en PC y tablet.
- Conserva CFI/progreso y el resto de funciones de v0.4.

Tus libros existentes no necesitan ser importados de nuevo.


## v0.4.3
- Lector EPUB reparado: carga explícita del archivo como binario con JSZip.
- Añadidos controles Anterior/Siguiente y teclas de página para EPUB.
