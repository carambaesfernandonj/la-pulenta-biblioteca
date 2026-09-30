# La Pulenta Biblioteca v1.3 — Fuentes automáticas

Basada en la versión estable v0.9.3. Esta versión añade un lector PDF propio con PDF.js sin cambiar el motor EPUB.

## PDF Reader
- navegación por página
- swipe horizontal en tablet
- modo 1 página / 2 páginas
- zoom + / -
- ajustar a pantalla
- pantalla completa
- progreso y página actual persistentes
- teclado en PC mediante los botones existentes y atajos globales

La biblioteca, colecciones, tags, metadata, favoritos y backup se mantienen.


## PDF Reader: portada como primera página
En modo doble página puedes activar **Portada sola** para mostrar la página 1 por separado y comenzar los pares en 2–3, 4–5, etc. La preferencia se guarda por libro.

## v1.1.1 — El Pulento Player

Nueva sección de reproducción TTS para EPUB. El audio se genera en tiempo real con SpeechSynthesis del navegador/dispositivo; no se crean ni guardan MP3 u otros archivos de audio.

- Reproducción por bloques de texto.
- Play/pausa/detener.
- Capítulos y navegación anterior/siguiente.
- Voz y velocidad seleccionables.
- Progreso de escucha independiente del progreso de lectura.
- Continuación desde el último capítulo/bloque escuchado.
- PDF TTS queda reservado para una siguiente etapa.


## v1.1.3
- Selector de capítulo en El Pulento Player.
- Línea de tiempo interactiva para saltar por bloques de texto.
- Progreso de escucha persistente y sincronizado con la posición seleccionada.
- La línea de tiempo representa bloques de texto, no segundos exactos, porque SpeechSynthesis no expone una posición temporal fiable del audio.

## v1.2 — respaldo liviano por ubicaciones
- Se mantiene el respaldo completo anterior, que incluye los archivos PDF/EPUB.
- Nuevo respaldo liviano: guarda biblioteca, metadatos, tags, colecciones, favoritos y progreso, junto con la `relativePath` de cada libro, pero no copia los PDF/EPUB.
- Restauración liviana: selecciona el respaldo y luego la carpeta raíz donde están los libros. La Pulenta recorre subcarpetas y vincula primero por ruta relativa y, si la ruta cambió, por nombre de archivo cuando el nombre es único.
- Los libros que no se encuentren no se eliminan: quedan registrados para poder volver a vincularlos posteriormente.
- En navegadores sin `showDirectoryPicker`, se usa el selector de carpeta basado en `webkitdirectory` como alternativa.


## v1.3 — Fuentes automáticas
- Nueva sección **Fuentes de libros** dentro de Ajustes.
- Permite registrar carpetas del equipo que contienen PDF y EPUB.
- Al registrar una fuente, La Pulenta la revisa inmediatamente.
- Al abrir la aplicación, revisa automáticamente las fuentes cuyo permiso siga disponible.
- Mientras La Pulenta está abierta, vuelve a revisarlas cada 5 minutos sin volver a pedir permiso.
- Los libros nuevos se agregan automáticamente con metadata, portada y tags derivados de las subcarpetas.
- Los libros ya existentes se reconocen por fuente + ruta relativa para evitar duplicados.
- Las importaciones anteriores por carpeta también pueden quedar vinculadas a una fuente por su ruta relativa.
- Se puede revisar una fuente manualmente o quitarla de la lista sin borrar ningún libro ni archivo.
- Si el navegador requiere renovar el permiso, la revisión manual permite solicitarlo mediante interacción del usuario.
- La fuente se guarda como `FileSystemDirectoryHandle` en IndexedDB; el acceso sigue dependiendo del permiso concedido por el usuario.


## v1.4 — Pulenta Comic Reader
- Añadido soporte para CBR y CBZ.
- Las fuentes automáticas detectan CBR/CBZ.
- Portada automática desde la primera imagen del cómic.
- Lector de cómics con navegación, swipe, una/doble página, modo manga RTL y pantalla completa.
- Progreso de cómic persistente.
- Backup completo conserva la extensión CBR/CBZ.
- PDF, EPUB, backup liviano y El Pulento Player quedan intactos.
- CBR usa libarchive-wasm en el navegador; los archivos del usuario no se suben a un servidor.

## v1.4.1 — CBR + zoom táctil
- Fixed CBR archive module loading in browser using jsDelivr ESM delivery.
- Added mouse-wheel zoom and pinch zoom to PDF and comic readers.
- EPUB reader also accepts pinch/wheel zoom where the EPUB iframe exposes pointer/wheel events.
- Existing PDF/EPUB/comic navigation and storage remain unchanged.

## v1.4.2 — Zoom navegable
- Zoom por rueda y pinch mantenido.
- Arrastre con un dedo o mouse para mover la página cuando está ampliada.
- El gesto de arrastre no cambia de página mientras hay zoom.
- Aplicado a PDF, EPUB y CBZ/CBR cuando el lector logra abrirlos.
- Al volver al zoom normal se restablece la posición.
- CBR queda pendiente de una solución de carga WASM más robusta.
