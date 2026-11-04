// Serveur du site MIYU : sert la page et reçoit les réservations (POST /api/reservation).
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { gzipSync, brotliCompressSync } from "node:zlib"
import { handleReservation } from "./lib/reservation.mjs"

const PORT = Number(process.env.PORT) || 10000
const page = await readFile(new URL("./public/index.html", import.meta.url))
const pageGz = gzipSync(page, { level: 9 })
const pageBr = brotliCompressSync(page)

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
    if (tooMany(ip)) return sendJson(res, 429, { ok: false, error: "Trop de demandes. Réessayez dans quelques minutes ou appelez-nous." })
    let raw = ""
    for await (const chunk of req) {
      raw += chunk
      if (raw.length > 10_000) return sendJson(res, 413, { ok: false, error: "Requête trop volumineuse." })
    }
    let body
    try { body = JSON.parse(raw) } catch { return sendJson(res, 400, { ok: false, error: "Requête invalide." }) }
    const out = await handleReservation(body)
    return sendJson(res, out.status, out.body)
  }

  if (url.pathname === "/healthz") return sendJson(res, 200, { ok: true })

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
  if (url.pathname !== "/" && url.pathname !== "/index.html") {
    res.writeHead(302, { Location: "/" }); return res.end()
  }
  const accept = String(req.headers["accept-encoding"] || "")
  const [buf, enc] = /\bbr\b/.test(accept) ? [pageBr, "br"] : /\bgzip\b/.test(accept) ? [pageGz, "gzip"] : [page, null]
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "public, max-age=300",
    Vary: "Accept-Encoding",
    ...(enc ? { "Content-Encoding": enc } : {}),
    ...SECURITY_HEADERS,
  })
  res.end(req.method === "HEAD" ? undefined : buf)
})

server.listen(PORT, () => console.log(`MIYU en ligne sur le port ${PORT}`))
