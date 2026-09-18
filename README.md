# Biblioteca / Lector — v0.2

Esta es la primera versión del proyecto.

## Qué hace

- Permite añadir PDF y EPUB.
- Mantiene una biblioteca visual.
- Guarda los archivos y metadatos en el navegador usando IndexedDB.
- Permite buscar libros por título o nombre de archivo.
- Tiene un botón "Continuar leyendo".
- Los EPUB usan EPUB.js y guardan la posición (CFI/progreso).
- Los PDF se abren en el visor PDF integrado del navegador.

## Importante

Esta v0.1 es local al navegador. Todavía NO tiene:
- Google Drive
- cuentas de usuario
- sincronización entre dispositivos
- tags editables
- colecciones
- lector PDF avanzado

Eso será parte de las siguientes versiones.

## Cómo probarla

La forma más sencilla es abrirla con un servidor local (por ejemplo, VS Code + Live Server).

No recomiendo abrir `index.html` haciendo doble clic si el navegador bloquea alguna característica.

## Próximas versiones previstas

v0.2 — Tags + colecciones
v0.3 — Mejoras del lector PDF/EPUB + marcadores
v0.4 — PWA + modo offline
v0.5 — Supabase: cuentas y biblioteca multiusuario
v0.6 — Google Drive
v0.7 — Sincronización entre dispositivos


## v0.2

- Añadir varios PDF/EPUB.
- Añadir una carpeta completa desde navegadores compatibles.
- Indicador visual de carga con progreso, contador y archivo actual.
- Los nombres de carpetas de una importación pueden convertirse en tags sugeridos.
- Filtro básico por tags.
- El sistema sigue usando IndexedDB para conservar los archivos en el navegador.
