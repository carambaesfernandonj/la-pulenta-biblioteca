# La Pulenta Biblioteca v1.0.1

Corrección de la v1.0: se mantiene la base estable de v0.9 y el nuevo lector PDF queda aislado de la carga/importación de la biblioteca.

Incluye lector PDF con página única, doble página, navegación, zoom, progreso y gestos táctiles. EPUB y biblioteca conservan el comportamiento estable anterior.


## v1.0.2
Importación desacoplada del enriquecimiento PDF/EPUB: un fallo de PDF.js o metadata ya no impide guardar el libro.


## v1.0.3
Importación blindada: los archivos seleccionados se guardan como Blob en IndexedDB, evitando problemas de clonación de File en algunos navegadores/tablets. El enriquecimiento de metadata y portadas usa el Blob almacenado y no puede bloquear el guardado.
