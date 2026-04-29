// Kill-switch service worker.
//
// The previous service worker precached `/` and `/index.html` and intercepted
// navigation requests. After a new deploy, returning users were served the
// stale cached HTML which referenced JS chunks that no longer existed on
// Cloudflare Pages — the result was an indefinite white screen with the
// splash spinner.
//
// To rescue users that already have an old SW installed, this file:
//   1. Skips waiting + claims clients immediately.
//   2. Deletes every cache it can find.
//   3. Unregisters itself.
//   4. Reloads any controlled tab so it loads fresh assets directly from
//      the network.
//
// Once everyone has been migrated off the old worker, we can decide whether
// to reintroduce a (much smaller, hash-aware) service worker. For now the
// app simply does not use one.

self.addEventListener('install', event => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
    event.waitUntil(
        (async () => {
            try {
                const cacheNames = await caches.keys();
                await Promise.all(cacheNames.map(name => caches.delete(name)));
            } catch (err) {
                console.error('[SW kill-switch] Failed to clear caches:', err);
            }

            try {
                await self.registration.unregister();
            } catch (err) {
                console.error('[SW kill-switch] Failed to unregister:', err);
            }

            try {
                const clients = await self.clients.matchAll({ type: 'window' });
                clients.forEach(client => {
                    try {
                        client.navigate(client.url);
                    } catch (err) {
                        // Older browsers may not allow navigate(); ignore.
                    }
                });
            } catch (err) {
                console.error('[SW kill-switch] Failed to reload clients:', err);
            }
        })()
    );
});

// Intentionally do not handle fetch — let the browser go to the network.
