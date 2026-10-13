/* Service worker unit tests with browser APIs and an isolated in-memory cache. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const reports = [];
const check = (name, value) => { assert.ok(value, name); reports.push({ name, passed: true }); };
let quota = false;
let network = true;
const cacheMap = new Map();
const handlers = new Map();
const messages = [];
class MemoryCache {
  constructor(name) { this.name = name; this.items = new Map(); }
  async keys() { return [...this.items.keys()].map(url => new Request(url)); }
  async match(key) { return this.items.get(typeof key === 'string' ? key : key.url)?.clone(); }
  async put(key, response) {
    if (quota && this.name.includes('media-')) throw new DOMException('QA quota', 'QuotaExceededError');
    this.items.set(typeof key === 'string' ? key : key.url, response.clone());
  }
  async addAll(requests) { for (const request of requests) await this.put(request.url, await sandbox.fetch(request)); }
}
const sandbox = {
  URL, Request, Response, Headers, Blob, DOMException, Set, Promise,
  registration: { scope: 'https://panic.test/nested/' },
  location: { origin: 'https://panic.test' },
  clients: { matchAll: async () => [{ postMessage: data => messages.push(data) }], claim: async () => {} },
  caches: {
    open: async name => { if (!cacheMap.has(name)) cacheMap.set(name, new MemoryCache(name)); return cacheMap.get(name); },
    keys: async () => [...cacheMap.keys()],
    delete: async name => cacheMap.delete(name)
  },
  fetch: async () => { if (!network) throw new TypeError('offline'); return new Response('complete-file', { headers: { 'Content-Type': 'audio/mpeg' } }); },
  addEventListener: (name, handler) => handlers.set(name, handler),
  skipWaiting: async () => { sandbox.didSkip = true; }
};
sandbox.self = sandbox;
const context = vm.createContext(sandbox);
sandbox.importScripts = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), context);
async function event(name, data = {}) {
  let promise;
  let response;
  handlers.get(name)({ ...data, waitUntil: value => { promise = value; }, respondWith: value => { response = value; } });
  if (promise) await promise;
  return response ? await response : undefined;
}

async function main() {
  await event('install');
  check('Shell installation does not force updates to activate', !sandbox.didSkip);
  quota = true;
  await event('message', { data: { type: 'PREPARE_OFFLINE' } });
  check('Storage quota error is explicitly reported', messages.at(-1).state === 'error' && messages.at(-1).reason === 'quota');
  check('Partial downloads are not reported as ready', !messages.some(message => message.state === 'ready'));
  quota = false;
  await event('message', { data: { type: 'PREPARE_OFFLINE' } });
  check('Retry after quota failure completes every required resource', messages.at(-1).state === 'ready' && messages.at(-1).completed === messages.at(-1).total);
  network = false;
  const navigation = await event('fetch', { request: { method: 'GET', mode: 'navigate', url: 'https://panic.test/nested/index.html?qa=1#karaoke' } });
  check('Query/hash navigation resolves cached document without network', navigation.status === 200);
  const response = await event('fetch', { request: new Request('https://panic.test/nested/assets/audio/01-night-birds.mp3', { headers: { Range: 'bytes=2-5' } }) });
  check('Cached range body is byte-exact', response.status === 206 && await response.text() === 'mple');
  check('External requests are left untouched', await event('fetch', { request: new Request('https://other.test/file') }) === undefined);
  check('QA files are never intercepted', await event('fetch', { request: new Request('https://panic.test/nested/qa/pwa-results.json') }) === undefined);
  check('Original source media is never intercepted', await event('fetch', { request: new Request('https://panic.test/nested/pistas/original.mp3') }) === undefined);
  check('POST requests are never intercepted', await event('fetch', { request: new Request('https://panic.test/nested/index.html', { method: 'POST' }) }) === undefined);
  const ownedPrefix = 'piatdxlily-%2Fnested%2F-';
  await sandbox.caches.open(ownedPrefix + 'shell-old');
  await sandbox.caches.open('another-app-cache');
  await sandbox.caches.open('piatdxlily-%2Fother%2F-shell-v1');
  await event('activate');
  check('Activation only clears outdated caches in its own scope', !cacheMap.has(ownedPrefix + 'shell-old') && cacheMap.has('another-app-cache') && cacheMap.has('piatdxlily-%2Fother%2F-shell-v1'));
  await event('message', { data: { type: 'SKIP_WAITING' } });
  check('Explicit update message can activate the waiting worker', sandbox.didSkip);
  const report = { passed: reports.length, checks: reports };
  fs.writeFileSync(path.join(__dirname, 'sw-results.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
