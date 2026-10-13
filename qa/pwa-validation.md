# PWA y offline — 2026-10-13

**Resultado: 223/223 comprobaciones de navegador + 12/12 unitarias. Sin build.**

- HTML/CSS/JavaScript siguen estáticos; no se modificó `app.js` ni se generaron nuevos audios.
- Manifest válido con nombre P!ATDXLILY, scope/start URL relativos, modo standalone, iconos 192/512 y máscara segura. Chrome CDP: cero errores de instalabilidad; navegador normal ofrece el botón de instalación.
- Caché completa: interfaz, seis portadas, dos fondos, diez imágenes de karaoke, letras, diez originales y diez instrumentales. Audio: **97,894,194 bytes**; primera descarga total aproximada: 100 MB.
- Veinte rangos 206 comparados byte a byte con archivos fuente, rangos abiertos/sufijo, errores 416 y multipart ignorado mediante 200 completo.
- Offline: 100 checks del reproductor existente, 65 de Karaoke y decode/play/seek adicional de los diez instrumentales.
- Navegación con query/hash bajo `/nested/panic/`, cierre/reapertura y audio con el servidor realmente apagado.
- 404 durante preparación muestra descarga incompleta. Reintento conserva audios previos. Una copia eliminada se detecta y repara al reconectar. QuotaExceededError probado en unidad y comunicado sin falsa disponibilidad.
- Nueva versión espera mientras continúa la reproducción; aceptación recarga, reutiliza MP3 y elimina sólo su shell anterior. Cachés de otros scopes/apps permanecen intactas.
- Sin overflow en 320, 390, 768 y 1440 px. QA visual: `pwa-offline-390.png`, `pwa-offline-1440.png`.
- `file://` conserva las diez canciones y explica por qué no instala PWA.

## Reproducir

```powershell
node qa\verify-sw.cjs
# Playwright debe estar disponible, o indicar la ruta a su módulo:
$env:PLAYWRIGHT_MODULE = '<ruta-al-modulo-playwright>'
node qa\verify-pwa.cjs
```

El test usa un perfil Chrome temporal normal: un contexto privado de Playwright devuelve `in-incognito`, que no es un defecto de la aplicación. Las respuestas 404 y errores de red de los casos de fallo son deliberados. Resultados completos: `pwa-results.json` y `sw-results.json`.

## Límites

No hay publicación, commit, push ni build. El navegador puede eliminar el almacenamiento; borrar los datos o cambiar de origen/perfil elimina el acceso a esa copia. HTTPS es necesario fuera de loopback. El modo privado y la instalación en iOS/Android físicos no se certificaron. Actualizar recarga y detiene la escucha, por eso requiere una acción explícita o cerrar las pestañas anteriores.
