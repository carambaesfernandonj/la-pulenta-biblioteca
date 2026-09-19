# Biblioteca / Lector — v0.3.1

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


## v0.2.1

- Importación de varios PDF/EPUB a la vez.
- Importación de carpetas completas en navegadores compatibles.
- Panel de progreso visible durante toda la importación.
- Contador, porcentaje y nombre del archivo actual.
- Confirmación visual al terminar.
- Mensaje de compatibilidad si el navegador no permite seleccionar carpetas.
- Tags sugeridos a partir de las carpetas al importar una carpeta.
- Filtro básico por tags.


## v0.3

- Ficha de detalles para cada libro antes de abrir el lector.
- Edición de título y autor.
- Tags editables desde la ficha.
- Filtros por tags.
- Portada generada desde la primera página de PDFs cuando PDF.js está disponible.
- Los datos de biblioteca siguen en IndexedDB.
- Se mantiene el progreso de lectura.


## v0.3.1 — corrección

- Corregida la ficha de detalles que no se abría desde los libros.
- Corregida la edición y creación de tags.
- Corregido el botón "Continuar leyendo" desde la ficha.
- PDF.js cambiado a una carga más compatible con navegadores móviles/tablet.
- Las portadas PDF se generan al importar y también se intentan generar al abrir un libro antiguo sin portada.
