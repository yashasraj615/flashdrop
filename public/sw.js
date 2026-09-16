const SHELL = [
  "/",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/icons/favicon-16.png",
  "/icons/favicon-32.png",
  "/icons/favicon-48.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
]
const CACHE = "flashdrop-shell-v3"

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  const url = new URL(request.url)

  if (request.method !== "GET") return
  if (url.pathname.startsWith("/api/")) return
  if (url.hostname.includes("neon.tech") || url.hostname.includes("amazonaws.com")) return
  if (url.hash) return

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/").then((cached) => cached || Response.error()))
    )
    return
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && request.destination !== "document") {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined)
        }
        return response
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error()))
  )
})
