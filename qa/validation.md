# Validación — demo PANIC

La página funciona localmente, sin build, instalación ni audio real. Se inspeccionaron las capturas de escritorio y móvil frente a la referencia.

## Resultados

- Sintaxis: `node --check app.js` correcto.
- Funcionalidad: 29/29 comprobaciones aprobadas, incluyendo simulación, pausa, seek, anterior/siguiente, autoavance, fin del álbum, cinco vistas, diálogos e imágenes. Evidencia: `functional-results.json`.
- Responsive: las cinco vistas a 320, 390, 768, 1024 y 1440 px. Sin desbordamiento horizontal de página ni del panel del álbum en las 25 combinaciones. Evidencia: `responsive-results.json`.
- Teclado: Enter reproduce/pausa; ArrowRight mueve el slider; Enter navega al enlace enfocado; Escape cierra el diálogo y devuelve el foco al botón de ayuda.
- Apertura directa con `file:///C:/Users/DELL/Desktop/PANIC/index.html`: diez pistas e imágenes cargadas, sin recursos HTTP externos.
- Consola y errores del navegador: sin mensajes ni excepciones durante las pruebas.
- Axe 4.12.1: cero violaciones detectadas, 44 reglas aprobadas y una comprobación incompleta de contraste por fotografía, gradientes y pseudo-elementos. Se inspeccionó visualmente; no equivale a certificar cumplimiento WCAG.
- Capturas: `desktop.png`, `mobile.png` y `mobile-full.png`.

## Medios preexistentes

La implementación no escribe en `pistas` ni `portadas`. La referencia PNG y los siete JPG conservaron sus hashes SHA256 entre las dos lecturas. Los hashes de los diez .mpeg cambiaron y aparecieron siete WebP durante la sesión, de forma concurrente. No se ejecutó `_webp.py`, no se determinó la causa exacta y no se revirtieron esos cambios.

## Repetir la prueba funcional

Con la página recién cargada y agent-browser instalado:

```powershell
agent-browser --session panic-qa open http://127.0.0.1:8765/
$script = Get-Content -Raw 'C:\Users\DELL\Desktop\PANIC\qa\verify.js'
agent-browser --session panic-qa eval $script
agent-browser --session panic-qa wait --fn 'window.__panicQA !== undefined'
agent-browser --session panic-qa eval 'JSON.stringify(window.__panicQA)'
```

El script es asíncrono: el primer `null` no es un resultado de pruebas. Esperar la propiedad y leer el informe. En esta instalación de PowerShell, pasar el script como argumento funcionó; el pipeline hacia `eval --stdin` no lo ejecutó.
