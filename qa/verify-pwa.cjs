/* Real-browser integration tests. No build, deployment or external requests. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push({ name, passed: true }); };
let version = 'v1';
let missing = 'assets/audio/04-hooked-on-a-feeling.mp3';
const transfers = new Map();
const prefix = '/nested/panic/';
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };

// Serve the real sources under a subdirectory, inject one 404 and an in-memory SW
// version change. Sources/media on disk are never modified by these test cases.
const server = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (!pathname.startsWith(prefix)) { res.writeHead(404).end(); return; }
  const relative = pathname.slice(prefix.length) || 'index.html';
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) || relative === missing || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end(); return;
  }
  let body = fs.readFileSync(file);
  if (relative === 'sw.js') body = Buffer.from(body.toString().replace("SHELL_VERSION = 'v1'", `SHELL_VERSION = '${version}'`));
  transfers.set(relative, (transfers.get(relative) || 0) + 1);
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Content-Length': body.length });
  res.end(body);
});

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}${prefix}`;
  const tempRoot = path.resolve(os.tmpdir());
  const profile = fs.mkdtempSync(path.join(tempRoot, 'panic-pwa-qa-'));
  // Installability cannot be tested in Playwright's incognito newContext().
  const context = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  try {
    await page.goto(base);
    check('First visit does not autoplay or load the audio element', await page.evaluate(() => document.querySelector('#audio-player').paused && document.querySelector('#audio-player').readyState === 0));
    await page.getByText('Descarga incompleta. Conéctate y reintenta para guardar lo que falta.', { exact: true }).waitFor({ timeout: 90000 });
    check('Interrupted preparation reports failure, not offline readiness', await page.locator('#offline-retry').isVisible());
    const firstAudioTransfers = transfers.get('assets/audio/01-night-birds.mp3');
    missing = null;
    await page.locator('#offline-retry').click();
    await page.getByText('Lista para usar sin conexión: canciones, karaoke e imágenes guardados.', { exact: true }).waitFor({ timeout: 90000 });
    check('Retry reuses already downloaded songs', firstAudioTransfers === 1 && transfers.get('assets/audio/01-night-birds.mp3') === 1);
    const catalog = await page.evaluate(() => window.PANIC_TRACKS);
    const expectedMedia = catalog.flatMap(track => [track.src, track.instrumentalSrc]);
    const stored = await page.evaluate(async () => {
      const names = await caches.keys();
      const mediaName = names.find(name => name.endsWith('media-v1'));
      const cache = await caches.open(mediaName);
      const media = [];
      for (const request of await cache.keys()) {
        const response = await cache.match(request);
        media.push({ url: request.url, status: response.status, bytes: (await response.blob()).size });
      }
      return { names, media, scope: (await navigator.serviceWorker.ready).scope };
    });
    check('Subdirectory scope is correct and cache names are scope-isolated', stored.scope === base && stored.names.every(name => name.includes(encodeURIComponent(prefix))));
    check('All 20 MP3 files have complete 200 responses', stored.media.length === 20 && stored.media.every(item => item.status === 200 && item.bytes === fs.statSync(path.join(root, new URL(item.url).pathname.slice(prefix.length))).size));
    check('Cache contains no originals or QA artifacts', stored.names.length === 2 && stored.media.every(item => expectedMedia.includes(new URL(item.url).pathname.slice(prefix.length))));
    const cdp = await context.newCDPSession(page);
    const manifest = await cdp.send('Page.getAppManifest');
    const installability = await cdp.send('Page.getInstallabilityErrors');
    if (installability.installabilityErrors.length) console.log(JSON.stringify(installability));
    const parsed = JSON.parse(manifest.data);
    check('Browser parses manifest without errors', manifest.errors.length === 0 && parsed.name.includes('P!ATDXLILY') && parsed.display === 'standalone');
    check('Browser reports zero PWA installability errors', installability.installabilityErrors.length === 0);
    check('Manifest includes 192/512 icons and separate maskable icon', parsed.icons.some(icon => icon.sizes === '192x192') && parsed.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'));

    await context.setOffline(true);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await page.goto(`${base}index.html?offline=1#musica`);
    await page.getByText('Sin conexión: canciones y karaoke disponibles.', { exact: true }).waitFor();
    check('Offline navigation with query/hash loads all ten songs', await page.locator('.track').count() === 10);

    for (const relative of expectedMedia) {
      const range = await page.evaluate(async url => {
        const response = await fetch(url, { headers: { Range: 'bytes=100-199' } });
        return { status: response.status, range: response.headers.get('Content-Range'), bytes: Array.from(new Uint8Array(await response.arrayBuffer())) };
      }, relative);
      const source = fs.readFileSync(path.join(root, relative));
      check(`Offline byte range integrity: ${relative}`, range.status === 206 && range.range === `bytes 100-199/${source.length}` && Buffer.from(range.bytes).equals(source.subarray(100, 200)));
    }
    const edgeRanges = await page.evaluate(async relative => {
      const results = [];
      for (const range of ['bytes=100-', 'bytes=-128', 'bytes=999999999-', 'bytes=200-100', 'bytes=-0', 'bytes=0-1,4-5']) {
        const response = await fetch(relative, { headers: { Range: range } });
        results.push({ range, status: response.status, length: (await response.arrayBuffer()).byteLength });
      }
      return results;
    }, catalog[0].src);
    const firstSize = fs.statSync(path.join(root, catalog[0].src)).size;
    check('Open and suffix ranges are served accurately', edgeRanges[0].status === 206 && edgeRanges[0].length === firstSize - 100 && edgeRanges[1].status === 206 && edgeRanges[1].length === 128);
    check('Unsatisfiable, reversed and empty suffix ranges return 416', edgeRanges.slice(2, 5).every(result => result.status === 416));
    check('Unsupported multipart range safely returns full 200', edgeRanges[5].status === 200 && edgeRanges[5].length === firstSize);

    for (const [script, resultName] of [['verify-real.js', '__panicRealQA'], ['verify-karaoke.js', '__panicKaraokeQA']]) {
      // A unique query forces a fresh document; hash-only goto preserves player state.
      await page.goto(`${base}?suite=${script}#musica`);
      await page.evaluate(fs.readFileSync(path.join(__dirname, script), 'utf8'));
      const result = await page.evaluate(name => window[name], resultName);
      console.log(script, JSON.stringify({ passed: result?.passed, error: result?.error }));
      check(`Existing ${script} regression suite passes offline`, result && !result.error && result.passed > 0);
      checks.push(...result.checks.map(item => ({ ...item, suite: script })));
    }

    // Decode and advance every instrumental, not only its cached bytes/metadata.
    await page.goto(`${base}?suite=all-instrumentals#karaoke`);
    await page.evaluate(() => { document.querySelector('#audio-player').muted = true; });
    await page.locator('#karaoke-toggle').click();
    for (let i = 0; i < catalog.length; i++) {
      await page.locator('#karaoke-song').selectOption(String(i));
      await page.locator('#play-toggle').click();
      await page.waitForFunction(src => {
        const audio = document.querySelector('#audio-player');
        return audio.currentSrc.endsWith(src) && !audio.paused && audio.currentTime > 0.1;
      }, catalog[i].instrumentalSrc);
      await page.locator('#seek').evaluate(el => { el.value = 60; el.dispatchEvent(new Event('input', { bubbles: true })); });
      await page.waitForFunction(() => { const audio = document.querySelector('#audio-player'); return !audio.seeking && audio.currentTime >= 60 && audio.currentTime < 63; });
      check(`Instrumental ${i + 1}: native decode, playback and seek offline`, true);
      await page.locator('#play-toggle').click();
    }

    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      check(`PWA controls do not overflow at ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
      if (width === 390 || width === 1440) await page.screenshot({ path: path.join(__dirname, `pwa-offline-${width}.png`), fullPage: true });
    }

    // Missing cache entries after first visit are detected and repaired on reconnect.
    await page.evaluate(async relative => {
      const name = (await caches.keys()).find(name => name.endsWith('media-v1'));
      await (await caches.open(name)).delete(new URL(relative, document.baseURI).href);
    }, catalog[9].src);
    await page.reload();
    await page.getByText('Sin conexión y descarga incompleta. Algunas canciones no están guardadas.', { exact: true }).waitFor();
    check('Cache eviction is not reported as fully offline-ready', await page.locator('#offline-retry').isVisible());
    await context.setOffline(false);
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await page.getByText('Lista para usar sin conexión: canciones, karaoke e imágenes guardados.', { exact: true }).waitFor({ timeout: 60000 });
    check('Reconnect repairs just the missing song', transfers.get('assets/audio/10-mercenary.mp3') === 2 && transfers.get('assets/audio/01-night-birds.mp3') === 1);

    await page.evaluate(async () => { await caches.open('unrelated-test-cache'); document.querySelector('#audio-player').muted = true; });
    await page.locator('#play-toggle').click();
    await page.waitForFunction(() => !document.querySelector('#audio-player').paused);
    version = 'v2';
    await page.evaluate(async () => (await navigator.serviceWorker.ready).update());
    await page.locator('#pwa-update').waitFor({ state: 'visible', timeout: 60000 });
    check('New service worker waits without interrupting playback', await page.evaluate(async () => Boolean((await navigator.serviceWorker.ready).waiting) && !document.querySelector('#audio-player').paused));
    await page.locator('#pwa-update').click();
    await page.waitForFunction(() => document.querySelector('#pwa-update').hidden && document.querySelector('#audio-player').paused);
    await page.getByText('Lista para usar sin conexión: canciones, karaoke e imágenes guardados.', { exact: true }).waitFor();
    const cacheNames = await page.evaluate(() => caches.keys());
    check('Accepted update activates v2 and removes only old owned shell', cacheNames.some(name => name.endsWith('shell-v2')) && !cacheNames.some(name => name.endsWith('shell-v1')) && cacheNames.includes('unrelated-test-cache'));
    check('UI update reuses unchanged media cache', transfers.get('assets/audio/01-night-birds.mp3') === 1);

    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await page.close();
    const reopened = await context.newPage();
    await reopened.goto(`${base}#karaoke`);
    await reopened.getByText('Lista para usar sin conexión: canciones, karaoke e imágenes guardados.', { exact: true }).waitFor();
    check('Reopened page works with actual server stopped', await reopened.locator('.track').count() === 10);
    await reopened.evaluate(() => { document.querySelector('#audio-player').muted = true; });
    await reopened.locator('#play-toggle').click();
    await reopened.waitForFunction(() => document.querySelector('#audio-player').currentTime > 0.2);
    check('Audio still plays with actual server stopped', true);
    await reopened.close();

    const filePage = await context.newPage();
    await filePage.goto(pathToFileURL(path.join(root, 'index.html')).href);
    await filePage.getByText('Para guardar sin conexión e instalar, abre la página por HTTPS o localhost; no como archivo.', { exact: true }).waitFor();
    check('file:// remains usable without trying PWA registration', await filePage.locator('.track').count() === 10 && await filePage.locator('#pwa-install').isHidden());
    check('No unexpected application JavaScript errors', pageErrors.length === 0);
    const report = { passed: checks.length, date: new Date().toISOString(), bytesCached: stored.media.reduce((sum, item) => sum + item.bytes, 0), installability: installability.installabilityErrors, checks };
    fs.writeFileSync(path.join(__dirname, 'pwa-results.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ passed: report.passed, bytesCached: report.bytesCached, installabilityErrors: report.installability.length }));
  } catch (error) {
    console.log('Failure URL:', page.url());
    console.log('SW:', await page.evaluate(async () => ({ status: document.querySelector('#offline-status')?.textContent, controlled: Boolean(navigator.serviceWorker?.controller), caches: await caches.keys() })).catch(() => 'unavailable'));
    fs.writeFileSync(path.join(__dirname, 'pwa-results.json'), JSON.stringify({ error: error.message, checks }, null, 2) + '\n');
    await page.screenshot({ path: path.join(__dirname, 'pwa-failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await context.close();
    server.closeAllConnections();
    server.close();
    // Check the resolved temporary target before recursively removing our profile.
    if (path.dirname(path.resolve(profile)) === tempRoot && path.basename(profile).startsWith('panic-pwa-qa-')) {
      fs.rmSync(profile, { recursive: true, force: true });
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
