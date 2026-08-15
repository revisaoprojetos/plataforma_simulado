/* Service Worker — cache de ASSETS ESTÁTICOS + fallback offline.
 *
 * IMPORTANTE (arquitetura deste app): os dados do Supabase são buscados NO SERVIDOR (Next.js RSC +
 * rotas /api). O navegador NÃO chama supabase.co diretamente. Por isso este SW NÃO cacheia dados:
 *  - /api/*  (dados por sessão/multitenant)      → sempre rede (nunca serve dado autenticado velho)
 *  - payloads RSC (?_rsc=...) e navegação HTML     → sempre rede (personalizados) + fallback offline
 *  - só ASSETS do build (imutáveis, com hash)       → cache-first (carregam na hora em revisitas)
 *
 * Versionar STATIC_CACHE (bump em cada deploy que muda a estratégia) → `activate` limpa os antigos.
 */
const VERSION = 'v1'
const STATIC_CACHE = `static-${VERSION}`

self.addEventListener('install', () => {
  // Ativa a nova versão sem esperar (junto com clients.claim no activate).
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    // Remove QUALQUER cache que não seja a versão atual (limpa "cache sujo" de deploys antigos).
    await Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

const ESTATICO_RE = /\.(?:js|mjs|css|woff2?|ttf|otf|eot|png|jpe?g|gif|svg|webp|avif|ico)$/i

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return // escrita (POST/PUT/PATCH/DELETE) → rede

  let url
  try { url = new URL(req.url) } catch { return }
  if (url.origin !== self.location.origin) return // Supabase / Google Fonts / externos → rede

  // Dados e autenticação NUNCA entram no cache do navegador.
  if (url.pathname.startsWith('/api/')) return
  if (url.searchParams.has('_rsc')) return // RSC (personalizado) → rede

  // Assets estáticos do build (imutáveis, com hash no nome) → cache-first.
  if (url.pathname.startsWith('/_next/static/') || ESTATICO_RE.test(url.pathname)) {
    event.respondWith(cacheFirst(req))
    return
  }

  // Navegação (documento) → network-first; offline mostra um fallback (NÃO serve HTML autenticado).
  if (req.mode === 'navigate') {
    event.respondWith(networkFirstNav(req))
  }
})

async function cacheFirst(req) {
  const cache = await caches.open(STATIC_CACHE)
  const hit = await cache.match(req)
  if (hit) return hit
  try {
    const res = await fetch(req)
    if (res && res.ok && res.status === 200) cache.put(req, res.clone())
    return res
  } catch {
    return hit || Response.error()
  }
}

async function networkFirstNav(req) {
  try {
    return await fetch(req)
  } catch {
    return new Response(OFFLINE_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }
}

const OFFLINE_HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sem conexão</title><style>*{box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#0f0e16;color:#e8e8ee;text-align:center;padding:2rem}.c{max-width:22rem}h1{font-size:1.2rem;margin:0 0 .5rem}p{color:#9c98b0;line-height:1.5;margin:0 0 1.25rem}button{background:#7f77dd;color:#fff;border:0;border-radius:.6rem;padding:.65rem 1.2rem;font-weight:600;font-size:.95rem;cursor:pointer}</style></head><body><div class="c"><h1>Você está offline</h1><p>Sem conexão no momento. Verifique sua internet e tente novamente.</p><button onclick="location.reload()">Tentar de novo</button></div></body></html>`
