/* Increment SHELL_VERSION for UI/catalog changes, MEDIA_VERSION for MP3 changes. */
'use strict';
importScripts('./tracks-data.js');

const SHELL_VERSION = 'v1';
const MEDIA_VERSION = 'v1';
const PREFIX = `piatdxlily-${encodeURIComponent(new URL(self.registration.scope).pathname)}-`;
const SHELL_CACHE = `${PREFIX}shell-${SHELL_VERSION}`;
const MEDIA_CACHE = `${PREFIX}media-${MEDIA_VERSION}`;
const absolute = path => new URL(path, self.registration.scope).href;
const SHELL_URLS = [...new Set([
  './', './index.html', './styles.css', './app.js', './pwa.js',
  './tracks-data.js', './lyrics-data.js', './manifest.webmanifest',
  './assets/favicon.svg', './assets/optimized/canyon.webp', './assets/optimized/silk.webp',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png', './assets/icons/apple-touch-icon.png',
  ...self.PANIC_TRACKS.flatMap(track => [track.cover, track.karaokeImage])
].map(absolute))];
const MEDIA_URLS = [...new Set(self.PANIC_TRACKS.flatMap(track => [track.src, track.instrumentalSrc]).filter(Boolean).map(absolute))];
const SHELL_SET = new Set(SHELL_URLS);
const MEDIA_SET = new Set(MEDIA_URLS);
let preparation = null;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache =>
    cache.addAll(SHELL_URLS.map(url => new Request(url, { cache: 'reload' })))
  ));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(PREFIX) &&
      name !== SHELL_CACHE && name !== MEDIA_CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function offlineStatus() {
  const [shell, media] = await Promise.all([caches.open(SHELL_CACHE), caches.open(MEDIA_CACHE)]);
  const shellKeys = new Set((await shell.keys()).map(request => request.url));
  const mediaKeys = new Set((await media.keys()).map(request => request.url));
  const completed = SHELL_URLS.filter(url => shellKeys.has(url)).length + MEDIA_URLS.filter(url => mediaKeys.has(url)).length;
  const total = SHELL_URLS.length + MEDIA_URLS.length;
  return { type: 'OFFLINE_STATUS', state: completed === total ? 'ready' : preparation ? 'saving' : 'partial', completed, total };
}

async function broadcast(message) {
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(client => client.postMessage(message));
}

async function storeFullResponse(cache, url) {
  // Never put an audio element's partial (206) response into Cache Storage.
  const response = await fetch(new Request(url, { cache: 'reload' }));
  if (response.status !== 200 || response.type === 'opaque') throw new Error('download');
  await cache.put(url, response);
}

function prepareOffline() {
  if (preparation) return preparation;
  preparation = (async () => {
    try {
      const shell = await caches.open(SHELL_CACHE);
      const media = await caches.open(MEDIA_CACHE);
      // Sequential downloads avoid 20 simultaneous MP3 transfers on mobile.
      for (const [urls, cache] of [[SHELL_URLS, shell], [MEDIA_URLS, media]]) {
        for (const url of urls) {
          if (!await cache.match(url)) await storeFullResponse(cache, url);
          await broadcast(await offlineStatus());
        }
      }
    } catch (error) {
      const status = await offlineStatus();
      await broadcast({ ...status, state: 'error', reason: error.name === 'QuotaExceededError' ? 'quota' : 'download' });
      return;
    } finally {
      preparation = null;
    }
    await broadcast(await offlineStatus());
  })();
  return preparation;
}

self.addEventListener('message', event => {
  if (event.data?.type === 'PREPARE_OFFLINE') event.waitUntil(prepareOffline());
  if (event.data?.type === 'GET_OFFLINE_STATUS') {
    event.waitUntil(offlineStatus().then(status => event.source?.postMessage(status)));
  }
  // Update only when the user explicitly presses the update button.
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});

async function rangeResponse(request, response) {
  const range = request.headers.get('Range');
  if (!range) return response;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  // Multipart/malformed Range can be ignored with a complete 200 response.
  if (!match || (!match[1] && !match[2])) return response;
  const blob = await response.blob();
  const size = blob.size;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  const headers = new Headers(response.headers);
  headers.delete('Content-Encoding');
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Type', response.headers.get('Content-Type') || 'audio/mpeg');
  return new Response(blob.slice(start, end + 1), { status: 206, statusText: 'Partial Content', headers });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  // Only known app resources: never cache originals, QA, downloads or external URLs.
  url.search = '';
  url.hash = '';
  if (request.mode === 'navigate' && (url.href === absolute('./') || url.href === absolute('./index.html'))) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      return await cache.match(absolute('./index.html')) || fetch(request);
    })());
  } else if (SHELL_SET.has(url.href) || MEDIA_SET.has(url.href)) {
    event.respondWith((async () => {
      const cache = await caches.open(MEDIA_SET.has(url.href) ? MEDIA_CACHE : SHELL_CACHE);
      const cached = await cache.match(url.href);
      if (cached) return rangeResponse(request, cached);
      // An interrupted first download stays usable online; retry fills missing files.
      return fetch(request);
    })());
  }
});
