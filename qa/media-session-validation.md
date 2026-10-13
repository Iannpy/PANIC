# Controles multimedia y fondos por canción — 2026-10-13

**54/54 checks Media Session, 285/285 navegador total y 14/14 worker. Sin build.**

## Integración

`app.js` utiliza `navigator.mediaSession` y `MediaMetadata` para enviar título, artista, álbum/modo y el `karaokeImage` de cada canción. Usa las imágenes existentes, con URLs absolutas y MIME `image/webp`; no inventa tamaños cuadrados para las fuentes panorámicas ni edita los originales.

Acciones: play, pause, previous/next, seekto, seekforward/backward y stop. Reutilizan las funciones del reproductor con su contador de operaciones y la misma cola de posición pendiente. El slider y las acciones del sistema comparten `seekTo()`. Se actualizan metadata al cambiar de canción/modo, `playbackState` al reproducir/pausar/buffer/error y duración/posición/velocidad al progresar/buscar/cambiar velocidad.

`sw.js` pasa a shell **v3**; los MP3 mantienen media **v1**. Los fondos ya están incluidos en la caché PWA.

## Evidencia

`qa/verify-pwa.cjs` instrumenta las APIs nativas antes de cargar la página: registra los handlers y estados reportados, pero también llama a los métodos nativos. `qa/verify-media-session.js` ejecuta esos handlers con el audio nativo real y con la red offline. No añade mecanismos de debug al runtime de producción.

- Ocho acciones registradas; selección inicial sin autoplay ni carga del audio element.
- Play/pause/stop y búsqueda absoluta/relativa sincronizan UI, audio y plataforma.
- Pista anterior/siguiente conserva la intención de reproducción y el modo instrumental.
- Posición pendiente antes de metadata respeta la última solicitud.
- Diez fondos propios decodifican offline; títulos/artistas y URLs coinciden con el catálogo.
- Cambiar voz/instrumental conserva canción/fondo/posición y actualiza el modo.
- Autoavance nativo refresca la metadata; bloqueos de play informan pausa y permiten reintento.
- API ausente, acciones no soportadas y setters fallidos no impiden reproducción normal.
- Las 100 pruebas originales de audio y 65 de Karaoke siguen aprobadas; Chrome informa cero errores de instalabilidad.

Resultados: `media-session-results.json` (54) y `pwa-results.json` (285). Reproducir con `node qa\verify-pwa.cjs` y Playwright/Chrome disponibles (o `PLAYWRIGHT_MODULE`).

## Alcance y límites

**Publicado en `b79b589`, con shell v3 y despliegue Cloudflare completado.** Las instalaciones anteriores necesitan recibir esa actualización para enviar estos datos.

Se repitieron las **54 pruebas** contra `https://panic.iannpoolperez.workers.dev/` usando un navegador de QA independiente, APIs nativas instrumentadas y red offline: todas aprobadas. Se verificó la metadata final de Crosses y su imagen `02-crosses.webp`. El primer intento detectó una espera incompleta del test al cambiar a instrumental: `loadedmetadata` puede llegar antes de que finalice el seek. Se ajustó la espera a fuente correcta, metadata y posición sin seek en curso; el reproductor no necesitó cambios. Cada ejecución usa un documento fresco, no una navegación sólo de hash que conserve estado anterior.

La API ofrece metadata y acciones; Android/navegador decide qué botones muestra y cómo presenta o recorta la imagen. No permite diseñar toda la tarjeta ni imponer el fondo completo de la pantalla de bloqueo. No se controló ni verificó la tarjeta del Android físico de la captura: la evidencia corresponde a metadata/API/handlers y audio nativo en Chrome de escritorio.

Referencias: [Chrome Media Session](https://developer.chrome.com/blog/media-session), [especificación W3C](https://www.w3.org/TR/mediasession/).
