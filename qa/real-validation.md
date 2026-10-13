# Validación — pistas y portadas reales

Se verificó reproducción nativa en Chrome, sin build. Las pruebas del navegador se ejecutaron silenciadas: el audio se decodificó y su reloj avanzó realmente.

## Funcionalidad y medios

- 85/85 comprobaciones por HTTP local y 85/85 abriendo el HTML directamente con `file://`.
- Las diez pistas reproducen, pausan y cargan la portada, título, artista, álbum y año correspondientes. Las duraciones nativas coinciden con el catálogo preparado, incluyendo Mercenary (2:46).
- Buscar en el slider actualiza `audio.currentTime`; selección conserva pausa/reproducción y reinicia el tiempo. Se comprobó autoavance mediante el evento `ended` real, parada al terminar la última, reinicio y navegación circular manual.
- Cambios rápidos de canción y reproducir/pausar no provocaron estados obsoletos ni rechazos de promesas sin manejar.
- Se inyectó un rechazo NotAllowedError en `play()` para verificar mensaje y recuperación; el método nativo se restauró antes de reintentar.
- Se abortó una petición de audio con agent-browser para verificar error de red: el reloj permaneció en cero, sin falsa reproducción, el slider quedó deshabilitado y se recuperó al eliminar el fallo y reintentar.
- Diez MP3 derivados, con stream-copy y hashes SHA256 idénticos del PCM decodificado frente a sus fuentes. Las seis portadas WebP se asociaron por igualdad de hash con el APIC original y se copiaron sin alteración.
- 25 originales comprobados por SHA256, sin cambios. Evidencia: `media-integrity.json`.
- Sin recursos HTTP externos al abrir por `file://`, sin backend ni publicación.

## Diseño y accesibilidad

- Las diez selecciones y las cinco vistas se comprobaron a 320, 390, 768, 1024 y 1440 px: 75 combinaciones sin desbordamiento horizontal de página, panel principal o ficha del álbum.
- Portadas cuadradas completas con `object-fit: contain`, sin giro. Títulos largos se ajustan en la ficha; la lista usa elipsis y conserva el título completo en su nombre accesible y tooltip.
- Teclado: ArrowRight busca un segundo real; Enter reproduce/pausa y navega; Escape cierra el diálogo y devuelve el foco. Se mantiene el enlace para saltar al contenido y movimiento reducido.
- Axe 4.12.1 en móvil: cero violaciones detectadas, 46 comprobaciones aprobadas y una comprobación incompleta de contraste por fotografía/gradientes/pseudo-elementos. No es una certificación WCAG.
- Consola y errores JavaScript: sin mensajes inesperados ni excepciones durante las pruebas.
- Capturas inspeccionadas: `real-desktop.png`, `real-mobile.png`, `real-mobile-long.png`. Pruebas responsive de navegador, no de dispositivos físicos iOS/Android.

## Repetir

Con la página recién cargada y el servidor local disponible:

```powershell
agent-browser --session panic-qa open http://127.0.0.1:8765/
agent-browser --session panic-qa click '#help-button'
agent-browser --session panic-qa press Escape
$script = Get-Content -Raw 'C:\Users\DELL\Desktop\PANIC\qa\verify-real.js'
agent-browser --session panic-qa eval $script
agent-browser --session panic-qa wait --fn 'window.__panicRealQA !== undefined'
agent-browser --session panic-qa eval 'JSON.stringify(window.__panicRealQA)'
```

El clic en ayuda proporciona una interacción real antes de probar reproducción. El primer `null` de eval es la respuesta inmediata de una prueba asíncrona, no un resultado: esperar la propiedad y leer el informe.
