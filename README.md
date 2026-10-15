# La Pulenta Biblioteca v1.5.4 — Encontrar portadas optimizado

Basada en la versión funcional con fuentes y referencias directas a archivos.

## Corrección de memoria en «Encontrar portadas»
- PDF: renderiza la portada directamente a un máximo de 360×520 px, calidad JPEG reducida y libera página/documento PDF.js después de cada libro.
- EPUB: reduce la imagen de portada al extraerla, evitando convertir la imagen original completa a una cadena base64 gigante.
- CBZ: descomprime únicamente la primera imagen para crear la portada, en lugar de extraer todas las páginas del cómic.
- CBR: la generación automática de portada queda pendiente, ya que el motor CBR tiene limitaciones conocidas.
- Procesamiento secuencial con pausas entre libros; cada portada se guarda en la base de datos inmediatamente.

## Instalación
Reemplaza los archivos de `pulenta_v1_1` en el repositorio de GitHub Pages. No elimines ni vuelvas a importar tu biblioteca. Después abre La Pulenta y pulsa «Encontrar portadas» para continuar con las que todavía faltan.
