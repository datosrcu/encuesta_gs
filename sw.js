// Service Worker - Encuesta Gabinete Social (Río Cuarto)
// Permite que la app cargue sin conexión cacheando el "shell" (HTML, iconos)
// y los recursos externos (Tailwind / fuentes). NUNCA cachea los envíos al
// Apps Script: esos siguen su propio flujo de cola en la app.

const CACHE = 'gs-lmetb-v2';
const ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './Favicon.png',
    './Datos.png',
    './SGyPC.png',
    'https://cdn.tailwindcss.com',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE)
            .then((cache) => cache.addAll(ASSETS).catch(() => { /* tolera fallos de recursos externos */ }))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;

    // Solo GET. Los POST (envíos a Apps Script) jamás se interceptan ni cachean.
    if (req.method !== 'GET') return;

    // El documento HTML (navegación o index.html) usa NETWORK-FIRST: así los
    // encuestadores siempre reciben la última versión del formulario cuando hay
    // conexión, y caen a la caché solo si están offline.
    const isDocument = req.mode === 'navigate' ||
        url.pathname === '/' || url.pathname.endsWith('/index.html');

    if (isDocument) {
        event.respondWith(
            fetch(req).then((res) => {
                if (res && res.status === 200) {
                    const copy = res.clone();
                    caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
                }
                return res;
            }).catch(() => caches.match(req).then((c) => c || caches.match('./index.html')))
        );
        return;
    }

    // Resto de recursos (iconos, Tailwind, fuentes): CACHE-FIRST con respaldo de red.
    event.respondWith(
        caches.match(req).then((cached) => {
            if (cached) return cached;
            return fetch(req).then((res) => {
                if (res && res.status === 200 && (url.protocol === 'http:' || url.protocol === 'https:')) {
                    const copy = res.clone();
                    caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
                }
                return res;
            }).catch(() => cached);
        })
    );
});
