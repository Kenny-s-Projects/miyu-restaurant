// Serveur du site MIYU : sert la page et reçoit les réservations (POST /api/reservation).
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { gzipSync, brotliCompressSync } from "node:zlib"
import { handleReservation } from "./lib/reservation.mjs"

const PORT = Number(process.env.PORT) || 10000

// Mode démo (npm run demo) : pour tester en local sans aucune clé secrète. Les e-mails et messages WhatsApp
// ne partent pas : ils sont capturés et affichés sur /demo/. Jamais actif sur Render (DEMO n'y est pas défini).
const DEMO = process.env.DEMO === "1"
const outbox = []
const DEMO_ENV = {
  ...process.env,
  RESEND_API_KEY: "demo",
  MAIL_TO: process.env.MAIL_TO || "miyu@khospitality.net",
  MAIL_FROM: process.env.MAIL_FROM || "MIYU Réservations <reservations@miyurestaurant.com>",
  WHATSAPP_TOKEN: "demo",
  WHATSAPP_PHONE_NUMBER_ID: "demo",
  WHATSAPP_TO: process.env.WHATSAPP_TO || "242057739999",
}
async function demoFetch(url, init) {
  const payload = JSON.parse(init.body)
  outbox.unshift({ at: new Date(), kind: String(url).includes("resend.com") ? "email" : "whatsapp", payload })
  if (outbox.length > 50) outbox.length = 50
  return new Response(JSON.stringify({ id: "demo-" + outbox.length }), { status: 200, headers: { "Content-Type": "application/json" } })
}
const escHtml = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])
function demoPage() {
  const items = outbox.map((m) => {
    const time = m.at.toLocaleTimeString("fr-FR")
    if (m.kind === "email") {
      const p = m.payload
      return `<article class="mail"><p class="tag">E-mail · ${time}</p><p><b>À :</b> ${escHtml([].concat(p.to).join(", "))}` +
        `${p.reply_to ? ` · <b>Répondre à :</b> ${escHtml(p.reply_to)}` : ""}</p><p><b>Objet :</b> ${escHtml(p.subject)}</p>` +
        `<iframe sandbox="" srcdoc="${escHtml(p.html)}"></iframe></article>`
    }
    const p = m.payload
    const body = p.text ? p.text.body : `Modèle « ${p.template?.name} » : ` + (p.template?.components?.[0]?.parameters || []).map((x) => x.text).join(" / ")
    return `<article class="wa"><p class="tag">WhatsApp automatique · ${time}</p><p><b>À :</b> +${escHtml(p.to)}</p><pre>${escHtml(body)}</pre></article>`
  }).join("\n")
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Boîte de test · MIYU</title>
<style>body{margin:0;background:#022d33;color:#f4ecdd;font:15px/1.5 system-ui,sans-serif}main{max-width:900px;margin:0 auto;padding:24px 16px 60px}
h1{font-weight:500;margin:0 0 4px}.intro{color:#a9b8b6;margin:0 0 24px}a{color:#efc688}
article{background:#f4ecdd;color:#022d33;border-radius:14px;padding:16px 18px;margin:0 0 16px}article p{margin:0 0 6px}
.tag{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#8a6a3a}.wa .tag{color:#1f7a45}
iframe{width:100%;height:520px;border:1px solid #d8c9a8;border-radius:10px;background:#fff;margin-top:8px}
pre{white-space:pre-wrap;font:15px/1.5 system-ui,sans-serif;background:#dcf8c6;border-radius:10px;padding:12px 14px;margin:8px 0 0}
.empty{color:#a9b8b6;font-style:italic}</style></head><body><main>
<h1>Boîte de test</h1><p class="intro">Mode démo : rien n'est vraiment envoyé. Voici ce que le serveur aurait envoyé
(e-mail à MIYU, confirmation au client, WhatsApp automatique). La page se met à jour à chaque nouvel envoi.
· <a href="/">Retour au site</a></p>
${items || '<p class="empty">Aucun envoi pour l\'instant. Faites une réservation sur le site.</p>'}
</main><script>
// Recharge la page seulement quand un nouvel envoi arrive (pour ne pas gêner la lecture).
var n = ${outbox.length};
setInterval(function () {
  fetch("/demo/count").then(function (r) { return r.json() }).then(function (d) { if (d.count !== n) location.reload() }).catch(function () {})
}, 2000)
</script></body></html>`
}
// Pages : français (/) et anglais (/en/), compressées une fois au démarrage.
async function loadPage(file) {
  const raw = await readFile(new URL(file, import.meta.url))
  return { raw, gz: gzipSync(raw, { level: 9 }), br: brotliCompressSync(raw) }
}
const PAGES = {
  "/": await loadPage("./public/index.html"),
  "/en/": await loadPage("./public/en/index.html"),
  // Page cachée : absente du menu, non indexée (balise robots + en-tête X-Robots-Tag).
  "/galerie/": await loadPage("./public/galerie/index.html"),
}

const ASSET_TYPES = { jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", png: "image/png", svg: "image/svg+xml" }

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN",
}

// Limite simple : 5 demandes de réservation par adresse IP et par 10 minutes.
const hits = new Map()
function tooMany(ip) {
  const now = Date.now()
  const list = (hits.get(ip) || []).filter((t) => now - t < 600_000)
  list.push(now)
  hits.set(ip, list)
  if (hits.size > 5000) hits.clear()
  return list.length > 5
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...SECURITY_HEADERS })
  res.end(JSON.stringify(body))
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost")

  if (url.pathname === "/api/reservation") {
    if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Méthode non autorisée." })
    const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim()
    if (!DEMO && tooMany(ip)) return sendJson(res, 429, { ok: false, error: "Trop de demandes. Réessayez dans quelques minutes ou appelez-nous." })
    let raw = ""
    for await (const chunk of req) {
      raw += chunk
      if (raw.length > 10_000) return sendJson(res, 413, { ok: false, error: "Requête trop volumineuse." })
    }
    let body
    try { body = JSON.parse(raw) } catch { return sendJson(res, 400, { ok: false, error: "Requête invalide." }) }
    const out = DEMO ? await handleReservation(body, DEMO_ENV, demoFetch) : await handleReservation(body)
    return sendJson(res, out.status, out.body)
  }

  if (url.pathname === "/healthz") return sendJson(res, 200, { ok: true })

  if (DEMO && url.pathname === "/demo/count") return sendJson(res, 200, { count: outbox.length })
  if (DEMO && (url.pathname === "/demo" || url.pathname === "/demo/")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...SECURITY_HEADERS })
    return res.end(demoPage())
  }

  // Certains navigateurs et robots demandent /favicon.ico sans lire la page.
  if (url.pathname === "/favicon.ico") {
    res.writeHead(301, { Location: "/assets/favicon-32.png", ...SECURITY_HEADERS })
    return res.end()
  }

  // Images du site (public/assets) : noms simples uniquement, pas de sous-dossier.
  const asset = /^\/assets\/([a-z0-9][a-z0-9._-]{0,80}\.(?:jpe?g|webp|png|svg))$/i.exec(url.pathname)
  if (asset && (req.method === "GET" || req.method === "HEAD")) {
    try {
      const data = await readFile(new URL(`./public/assets/${asset[1]}`, import.meta.url))
      const ext = asset[1].split(".").pop().toLowerCase()
      res.writeHead(200, {
        "Content-Type": ASSET_TYPES[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=86400",
        ...SECURITY_HEADERS,
      })
      return res.end(req.method === "HEAD" ? undefined : data)
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
      return res.end("Introuvable")
    }
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }); return res.end()
  }
  if (url.pathname === "/en" || url.pathname === "/en/index.html") {
    res.writeHead(301, { Location: "/en/" }); return res.end()
  }
  if (url.pathname === "/galerie" || url.pathname === "/galerie/index.html") {
    res.writeHead(301, { Location: "/galerie/" }); return res.end()
  }
  const key = url.pathname === "/" || url.pathname === "/index.html" ? "/" : Object.hasOwn(PAGES, url.pathname) ? url.pathname : null
  if (!key) {
    res.writeHead(302, { Location: url.pathname.startsWith("/en/") ? "/en/" : "/" }); return res.end()
  }
  const page = PAGES[key]
  const accept = String(req.headers["accept-encoding"] || "")
  const [buf, enc] = /\bbr\b/.test(accept) ? [page.br, "br"] : /\bgzip\b/.test(accept) ? [page.gz, "gzip"] : [page.raw, null]
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Language": key === "/en/" ? "en" : "fr",
    "Cache-Control": "public, max-age=300",
    Vary: "Accept-Encoding",
    ...(enc ? { "Content-Encoding": enc } : {}),
    ...(key === "/galerie/" ? { "X-Robots-Tag": "noindex, nofollow" } : {}),
    ...SECURITY_HEADERS,
  })
  res.end(req.method === "HEAD" ? undefined : buf)
})

server.listen(PORT, () => {
  console.log(`MIYU en ligne sur le port ${PORT}`)
  if (DEMO) console.log(`MODE DÉMO : site sur http://localhost:${PORT}/ · envois capturés sur http://localhost:${PORT}/demo/`)
})
