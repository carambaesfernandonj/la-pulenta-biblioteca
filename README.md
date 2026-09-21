# La Pulenta Biblioteca v1.0 — Lector PDF

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
