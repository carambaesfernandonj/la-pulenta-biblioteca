# La Pulenta Biblioteca v1.5.4 — Offline First

Basada en la versión funcional v1.5.4 con Inicio Grid, fuentes mediante referencias directas y generación optimizada de portadas.

## Qué añade
- Service Worker para guardar la interfaz, CSS, JavaScript y manifiesto.
- Caché de las librerías externas usadas por los lectores PDF y EPUB, además de JSZip, durante la primera conexión.
- Indicador de estado que informa si las dependencias necesarias están guardadas.
- Respaldo offline de la interfaz para poder abrir la app sin conexión después de completar la preparación inicial.
- No sube ni duplica los libros personales: conserva el almacenamiento y las referencias a fuentes que ya utiliza la biblioteca.

## Instalación y preparación (importante)
1. Descomprime el ZIP y reemplaza los archivos de la carpeta `pulenta_v1_1` en el mismo directorio de GitHub Pages donde está publicada La Pulenta. Incluye `sw.js`.
2. Abre la aplicación con internet y déjala abierta un rato para que el Service Worker instale y guarde las librerías.
3. Cierra por completo la app y vuelve a abrirla **todavía con internet**. Espera a que el indicador inferior diga `📚 Offline preparado · PDF y EPUB`.
4. Abre al menos un PDF y un EPUB online para comprobar que los lectores funcionan. La caché guarda las librerías, no los libros enteros.
5. Activa modo avión y vuelve a abrir La Pulenta desde el icono de la pantalla de inicio. Prueba la biblioteca y los libros vinculados a una fuente local.

## Limitaciones
- La preparación inicial requiere internet y HTTPS (GitHub Pages lo proporciona).
- Si la fuente local pierde su permiso en el navegador, puede ser necesario volver a autorizar la carpeta.
- Los libros almacenados solo como referencias siguen dependiendo de que el archivo original esté disponible en el dispositivo.
- CBR continúa siendo una función pendiente y no se garantiza offline.
- Si el indicador no llega a `Offline preparado`, no asumas que todos los lectores funcionarán en modo avión: vuelve a abrir con internet y comprueba que los cuatro recursos aparecen en caché.
