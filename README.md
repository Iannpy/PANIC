# PANIC — colección local con audio real

La página conserva la composición original y reproduce las diez pistas preparadas. Cada selección muestra su portada cuadrada completa, título, artista, álbum y año. Es un archivo personal **no oficial**: los metadatos provienen de tus archivos, no de una discografía verificada.

## Abrir

Abre `C:\Users\DELL\Desktop\PANIC\index.html` en Chrome o utiliza la vista previa local:

```powershell
Set-Location 'C:\Users\DELL\Desktop\PANIC'
python scripts\serve-local.py --port 8766
```

Visita `http://127.0.0.1:8766/#musica` o `#karaoke`. No requiere instalación ni build. El servidor sólo escucha en tu computador y admite rangos HTTP para conservar la búsqueda de posición en los MP3; `python -m http.server` no ofrece esa capacidad en esta instalación.

## Rendimiento de carga

Las imágenes activas del sitio se sirven como WebP en `assets/optimized`; las PNG originales se conservan sin cambios. La conversión de las diez imágenes de Karaoke y los dos fondos pasó de 33,804,661 a 2,588,482 bytes (**92.34 % menos**), con las dimensiones originales y calidad WebP 86. El fondo principal se precarga; la vista previa de imagen usa carga diferida. En pantallas pequeñas el fondo deja de ser fijo para evitar repintados costosos al desplazarse.

El reproductor mantiene `preload="none"` y no inicia reproducción automática. Por HTTPS o localhost, la capa PWA descarga en segundo plano la colección completa para el uso sin conexión; esto es independiente de la carga del reproductor. Por `file://`, el audio sólo se carga cuando se reproduce, se busca una posición o se activa el modo instrumental.

## Sin conexión e instalación como PWA

El stack sigue siendo HTML, CSS y JavaScript estáticos: no requiere framework, paquetes adicionales ni build. `manifest.webmanifest` define la aplicación y sus iconos; `pwa.js` registra `sw.js` y muestra el progreso sin modificar el reproductor.

1. Abre la página por **HTTPS** (publicada) o `http://127.0.0.1:8766/` (prueba local). Abrir `index.html` con doble clic conserva el sitio normal, pero **no activa la PWA**.
2. En la primera visita, mantén la página abierta hasta ver **“Lista para usar sin conexión”**. Se guardan interfaz, seis portadas, fondos, diez imágenes de karaoke, letras, diez canciones y diez instrumentales: aproximadamente **100 MB**. La instalación no significa que la descarga ya terminó.
3. Después puedes cerrar y volver a abrir la página o aplicación **en ese mismo navegador y origen** sin conexión, incluso sin el servidor local encendido. Las descargas interrumpidas conservan lo guardado y se completan al reconectar o pulsar **Reintentar descarga**.
4. Chrome/Edge muestran **Instalar P!ATDXLILY** cuando ofrecen el evento de instalación; también puedes usar el menú del navegador. En iPhone/iPad utiliza **Compartir → Añadir a pantalla de inicio**. El botón no se muestra en navegadores que no ofrecen ese flujo ni si ya está en modo aplicación.

Los MP3 se almacenan completos (200) y el service worker genera rangos de bytes (206) desde la copia local para conservar reproducción y búsqueda de posición. No guarda archivos fuente, carpetas de QA, conceptos visuales ni recursos externos. No se ha publicado el sitio ni enviado contenido a un servicio externo.

La copia está ligada al navegador, perfil, protocolo, dominio y puerto. Borrar datos del sitio, usar modo privado o la eliminación de almacenamiento por el navegador puede quitarla. Si falta espacio se avisa, sin afirmar que está disponible offline. Las canciones siguen siendo un archivo personal; esta configuración técnica no concede derechos de distribución.

### Actualizar la PWA

Incrementa `SHELL_VERSION` en `sw.js` cuando cambies HTML, CSS, JavaScript, catálogo, letras, imágenes o iconos. Incrementa también `MEDIA_VERSION` si sustituyes los MP3 conservando las mismas rutas. Publica todos los archivos de la web y medios necesarios juntos. Los audios sin cambios se reutilizan entre versiones de interfaz.

La nueva versión espera hasta pulsar **Actualizar página** (esto recarga y pausa la escucha) o hasta que se cierren todas las pestañas de la versión anterior. Nunca fuerza una recarga en plena reproducción. Sólo elimina sus propias cachés, aisladas por la ruta de instalación. El servidor debe servir `sw.js` como JavaScript, el manifest como JSON/manifest y permitir comprobar versiones nuevas (recomendado `Cache-Control: no-cache` para `sw.js`).

Para regenerar los PNG de instalación desde la identidad P! existente, sin cambiar el favicon ni hacer build:

```powershell
python scripts\prepare-pwa-icons.py
```

Para regenerar las imágenes WebP desde las fuentes (requiere Pillow con soporte WebP):

```powershell
python scripts\optimize-images.py
```

El script conserva las fuentes y actualiza `qa/image-optimization.json`. Ejecútalo antes de `scripts\prepare-media.py` si vas a regenerar el catálogo.

## Reproductor

- La quinta pista está seleccionada al abrir, sin autoplay.
- Pulsar otra canción reinicia el tiempo y conserva reproducción/pausa; pulsar la seleccionada alterna ambos estados.
- Anterior/siguiente recorren la lista circularmente. Al terminar una canción avanza automáticamente; al terminar la última se detiene.
- El slider busca en el audio real. Carga, errores y bloqueos del navegador tienen estados explícitos y reintento, nunca una simulación.

## Karaoke

En `#karaoke`, el selector permite ver las diez letras. Cada canción muestra su imagen local de `assets/karaoke-concepts` dentro del recuadro de letras, como en la referencia aprobada; la cabecera y el reproductor conservan el diseño actual. Durante la reproducción se resalta y desplaza la línea correspondiente; si desplazas la letra manualmente, «Volver a la línea actual» reactiva el seguimiento. El botón «Activar solo instrumental» cambia a un MP3 local separado de la voz sin iniciar autoplay ni perder la posición o el estado de reproducción. El modo se mantiene al cambiar de canción dentro de Karaoke y vuelve a la grabación original al salir de la sección. Si falta un instrumental, **no** reproduce en secreto la pista con voz.

Las letras visibles proceden de `letras/*.txt`, que se conservan intactos. Son transcripciones parcialmente inciertas: `[?]` se muestra tal cual, y los tiempos por línea de `lyrics-data.js` son **aproximados**, estimados a partir de marcas escasas y a veces desordenadas y de una alineación automática sobre la voz separada. No hubo revisión auditiva línea por línea: no se deben presentar como subtítulos verificados al segundo. La separación instrumental con Demucs también puede dejar voz residual o afectar algunos instrumentos.

## Archivos y originales

`tracks-data.js` contiene el catálogo preparado, las rutas instrumentales y las imágenes WebP de Karaoke; `lyrics-data.js` contiene las líneas temporizadas; `app.js` usa un único HTMLAudioElement. `assets/audio` contiene diez MP3 originales preparados y `assets/audio/instrumental` diez derivados separados localmente. `assets/covers` contiene las seis portadas asociadas, compartidas por varias canciones. La portada Vices & Virtues permanece en las fuentes, sin forzar una asociación inexistente.

No se modifican `pistas`, `portadas`, la referencia ni las letras fuente. No hay backend ni publicación; la reproducción no necesita red ni envía audio a servicios externos. Solo la instalación y descarga inicial del modelo de separación requieren conexión.

Los originales son MPEG con audio MP3. Se remuxearon con `-c:a copy`, sin recodificar. El encabezado Xing/Info permite duración y búsqueda correctas; se retiró únicamente el identificador gapless añadido del frame auxiliar generado para evitar un recorte nuevo de muestras. Se comprobó que el audio decodificado de cada copia es idéntico al original. La lógica de ese indicador está en [el demuxer MP3 de FFmpeg](https://github.com/FFmpeg/FFmpeg/blob/master/libavformat/mp3dec.c).

Para regenerar los derivados con los originales preparados y las herramientas ya instaladas:

```powershell
python 'C:\Users\DELL\Desktop\PANIC\scripts\prepare-media.py'
```

El script requiere FFmpeg/ffprobe y mutagen, verifica la portada por hash del APIC incrustado y comprueba los hashes de los originales antes/después. No modifica fuentes ni es un build del sitio.

Para regenerar el archivo estático de letras desde los TXT (tampoco es un build del sitio):

```powershell
python scripts\prepare-karaoke-lyrics.py
python scripts\prepare-karaoke-lyrics.py --check
```

Para reproducir la separación local de los diez instrumentales en un entorno aislado con Python 3.11:

```powershell
$venv = Join-Path $env:LOCALAPPDATA 'panic-karaoke-demucs'
uv venv --python 3.11 $venv
$py = Join-Path $venv 'Scripts\python.exe'
uv pip install --python $py torch torchaudio --index-url https://download.pytorch.org/whl/cpu
uv pip install --python $py demucs==4.0.1
python scripts\prepare-karaoke-audio.py --demucs-python $py
```

El script utiliza Demucs `htdemucs` en modo dos pistas (`vocals`/`no_vocals`), verifica formato y duración y comprueba que los MP3 de origen no cambiaron. Solo el instrumental va a la web; la voz separada no se copia al sitio.

`scripts/align-karaoke-lyrics.py` puede recalcular `lyrics-timings.json` desde las voces separadas y el modelo local MMS_FA de torchaudio. Ese modelo fue entrenado para habla, no canto: su resultado es una ayuda de alineación, no una escucha ni una certificación de tiempos. Para preparar los diez MP3, `prepare-karaoke-audio.py` también los decodifica completos; la evaluación de voz residual requiere escucha humana.

## Validación

PWA: `node qa\verify-sw.cjs` ejecuta 12 pruebas unitarias sin dependencias. `node qa\verify-pwa.cjs` requiere Playwright (puede indicarse su módulo mediante `PLAYWRIGHT_MODULE`) y Chrome local; levanta un servidor de prueba sólo en loopback, usa un perfil temporal independiente y no modifica los medios. La última ejecución pasó **223 comprobaciones** de navegador, incluyendo las 100 de audio original y 65 de Karaoke, y reportó **cero errores de instalabilidad**. Resultados: `qa/pwa-results.json`, `qa/sw-results.json`; evidencia visual: `qa/pwa-offline-390.png` y `qa/pwa-offline-1440.png`. Se probó navegación bajo subcarpeta, rangos de los veinte MP3, caché incompleta, reconexión, actualización durante reproducción, página reabierta con servidor apagado y apertura normal por `file://`. No se ejecutó build. La instalación y ejecución en dispositivos iOS/Android físicos no se han probado.

Pruebas funcionales: `qa/verify-real.js` y `qa/verify-karaoke.js`; responsive: `qa/responsive-real.js`; integridad: `qa/media-integrity.json`, `qa/karaoke-media-integrity.json` y `qa/image-optimization.json`. Los resultados están en `qa/real-final-results.json`, `qa/karaoke-browser-results.json` y `qa/responsive-final-results.json`. La única respuesta 404 de la prueba Karaoke es deliberada: simula un instrumental ausente. `qa/real-validation.md` documenta la validación anterior; los archivos de validación sin prefijo `real-` y `qa/verify.js` corresponden a la demo previa.
