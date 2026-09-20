# La Pulenta Biblioteca v0.9

## Metadata automática
- Lee metadatos disponibles de EPUB (título, autor, idioma, editorial y descripción).
- Extrae la portada declarada por el EPUB cuando existe.
- Lee metadatos básicos de PDF mediante PDF.js y mantiene la portada de la primera página.
- Los metadatos se pueden editar desde la ficha del libro.
- Los libros existentes se enriquecen al abrir su ficha por primera vez.
- Mantiene lector EPUB/PDF, progreso, lecturas actuales, colecciones, tags y favoritos.

## Instalación
Reemplaza los archivos de la versión anterior en GitHub Pages. Los libros y datos están en IndexedDB/localStorage del navegador.


## v0.9.1
- Modo oscuro para la biblioteca (el lector conserva su propio aspecto).
- Eliminación de libros desde la ficha sin borrar el archivo original del dispositivo.
- Gestión por lotes: seleccionar varios libros desde Colecciones y añadir/quitar de una colección.
- Se mantiene IndexedDB y la estructura de la v0.9.
