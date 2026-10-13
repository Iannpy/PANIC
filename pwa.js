(() => {
  'use strict';
  const status = document.getElementById('offline-status');
  const retry = document.getElementById('offline-retry');
  const install = document.getElementById('pwa-install');
  const update = document.getElementById('pwa-update');
  let registration;
  let installPrompt;
  let offlineReady = false;
  let reloadForUpdate = false;
  let lastProgress = -1;
  const supported = location.protocol !== 'file:' && window.isSecureContext && 'serviceWorker' in navigator;

  if (!supported) {
    status.textContent = 'Para guardar sin conexión e instalar, abre la página por HTTPS o localhost; no como archivo.';
    return;
  }

  const tellWorker = type => navigator.serviceWorker.controller?.postMessage({ type });
  const prepare = () => {
    retry.hidden = true;
    lastProgress = -1;
    status.textContent = 'Guardando canciones e instrumentales (~100 MB). Mantén esta página abierta…';
    tellWorker('PREPARE_OFFLINE');
  };

  const renderReady = () => {
    status.textContent = navigator.onLine
      ? 'Lista para usar sin conexión: canciones, karaoke e imágenes guardados.'
      : 'Sin conexión: canciones y karaoke disponibles.';
  };

  navigator.serviceWorker.addEventListener('message', event => {
    const data = event.data;
    if (data?.type !== 'OFFLINE_STATUS') return;
    offlineReady = data.state === 'ready';
    if (offlineReady) {
      retry.hidden = true;
      renderReady();
    } else if (data.state === 'error') {
      retry.hidden = false;
      status.textContent = data.reason === 'quota'
        ? 'No hay espacio suficiente. Libera espacio del navegador y reintenta; la descarga está incompleta.'
        : 'Descarga incompleta. Conéctate y reintenta para guardar lo que falta.';
    } else if (data.state === 'partial') {
      if (navigator.onLine) prepare();
      else {
        retry.hidden = false;
        status.textContent = 'Sin conexión y descarga incompleta. Algunas canciones no están guardadas.';
      }
    } else {
      // Announce progress in 10% increments, not once per file to screen readers.
      const progress = Math.floor(data.completed / data.total * 10) * 10;
      if (progress !== lastProgress) {
        lastProgress = progress;
        status.textContent = `Guardando para usar sin conexión: ${data.completed}/${data.total} archivos (~100 MB). Mantén esta página abierta.`;
      }
    }
  });

  retry.addEventListener('click', prepare);
  window.addEventListener('offline', () => {
    if (offlineReady) renderReady();
    else status.textContent = 'Se perdió la conexión. La descarga aún no está completa.';
  });
  window.addEventListener('online', () => tellWorker('GET_OFFLINE_STATUS'));

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    if (!matchMedia('(display-mode: standalone)').matches && !navigator.standalone) install.hidden = false;
  });
  install.addEventListener('click', async () => {
    if (!installPrompt) return;
    const prompt = installPrompt;
    installPrompt = null;
    install.hidden = true;
    try { await prompt.prompt(); } catch { /* The browser's menu remains available. */ }
    // A dismissed install prompt is consumed; don't offer a broken retry button.
  });
  window.addEventListener('appinstalled', () => { install.hidden = true; installPrompt = null; });

  const offerUpdate = () => { if (registration.waiting) update.hidden = false; };
  update.addEventListener('click', () => {
    if (!registration?.waiting) return;
    reloadForUpdate = true;
    update.disabled = true;
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadForUpdate) location.reload();
    else tellWorker('GET_OFFLINE_STATUS');
  });

  async function register() {
    try {
      // Reopening offline must reuse the active registration, not fetch sw.js.
      const existing = await navigator.serviceWorker.getRegistration('./');
      registration = existing?.active ? existing : await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
      offerUpdate();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => { if (worker.state === 'installed') offerUpdate(); });
      });
      if (existing?.active && navigator.onLine) registration.update().catch(() => {});
      await navigator.serviceWorker.ready;
      if (navigator.serviceWorker.controller) tellWorker('GET_OFFLINE_STATUS');
      // Claim on first install triggers controllerchange; no page reload or autoplay.
    } catch {
      status.textContent = 'No se pudo activar el modo sin conexión. Revisa la conexión y vuelve a cargar la página.';
    }
  }
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
})();
