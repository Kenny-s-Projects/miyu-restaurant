// Réservations MIYU : validation, puis notification par e-mail (Resend) et/ou WhatsApp (API Cloud de Meta).
// Chaque canal est actif seulement si ses variables d'environnement sont renseignées.
//
// E-mail (Resend) :
//   RESEND_API_KEY   clé API Resend (secret)
//   MAIL_TO          adresse(s) qui reçoivent les réservations, séparées par des virgules
//   MAIL_FROM        (optionnel) expéditeur, défaut « MIYU Réservations <onboarding@resend.dev> »
// WhatsApp :
//   WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TO
//   WHATSAPP_TEMPLATE / WHATSAPP_TEMPLATE_LANG / GRAPH_API_VERSION (optionnels)

const ESPACES = ["Table restaurant", "Salon privé 1", "Salon privé 2"]
export const PHONE_FALLBACK = "+242 05 773 9999"

// Messages renvoyés au visiteur, en français ou en anglais selon la version du site.
const MSG = {
  fr: {
    invalid: "Requête invalide.",
    nom: "Merci d'indiquer votre nom.",
    tel: "Merci d'indiquer un numéro de téléphone valide.",
    email: "L'adresse e-mail n'est pas valide.",
    emailRequired: "Merci d'indiquer votre e-mail pour recevoir la confirmation.",
    date: "Merci de choisir une date.",
    past: "La date choisie est déjà passée.",
    heure: "Merci de choisir une heure.",
    personnes: "Nombre de personnes invalide.",
    espace: "Espace invalide.",
    unavailable: `Service de réservation indisponible. Appelez-nous au ${PHONE_FALLBACK}.`,
    failed: `La réservation n'a pas pu être transmise. Appelez-nous au ${PHONE_FALLBACK}.`,
  },
  en: {
    invalid: "Invalid request.",
    nom: "Please enter your name.",
    tel: "Please enter a valid phone number.",
    email: "This email address is not valid.",
    emailRequired: "Please enter your email to receive the confirmation.",
    date: "Please choose a date.",
    past: "The selected date has already passed.",
    heure: "Please choose a time.",
    personnes: "Invalid number of guests.",
    espace: "Invalid area.",
    unavailable: `Booking service unavailable. Please call us on ${PHONE_FALLBACK}.`,
    failed: `Your booking could not be sent. Please call us on ${PHONE_FALLBACK}.`,
  },
}
const langOf = (body) => (body?.lang === "en" ? "en" : "fr")

const clean = (v, max = 80) =>
  String(v ?? "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").replace(/[ \t]+/g, " ").trim().slice(0, max)
const oneLine = (v, max) => clean(v, max).replace(/\s+/g, " ")

export function isSpam(body) {
  return Boolean(oneLine(body?.site, 200))
}

export function validate(body, now = Date.now()) {
  const m = MSG[langOf(body)]
  const resa = {
    lang: langOf(body),
    nom: oneLine(body?.nom, 60),
    tel: oneLine(body?.tel, 25),
    email: oneLine(body?.email, 120).toLowerCase(),
    date: oneLine(body?.date, 10),
    heure: oneLine(body?.heure, 5),
    personnes: oneLine(body?.personnes, 3),
    espace: oneLine(body?.espace, 20),
    message: clean(body?.message, 500).replace(/\n{3,}/g, "\n\n"),
  }
  if (resa.nom.length < 2) return { error: m.nom }
  if (resa.tel.replace(/\D/g, "").length < 8) return { error: m.tel }
  if (!resa.email) return { error: m.emailRequired }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(resa.email)) return { error: m.email }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(resa.date)) return { error: m.date }
  const today = new Date(now + 3600_000).toISOString().slice(0, 10) // heure de Pointe-Noire (UTC+1)
  if (resa.date < today) return { error: m.past }
  if (!/^\d{2}:\d{2}$/.test(resa.heure)) return { error: m.heure }
  if (!/^\d{1,2}\+?$/.test(resa.personnes)) return { error: m.personnes }
  if (!ESPACES.includes(resa.espace)) return { error: m.espace }
  return { resa }
}

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"]
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
export const frDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number)
  return `${d.toString().padStart(2, "0")}/${m.toString().padStart(2, "0")}/${y}`
}
export const frDateLong = (iso) => {
  const [y, m, d] = iso.split("-").map(Number)
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${JOURS[day]} ${d} ${MOIS[m - 1]} ${y}`
}
const personnesLabel = (p) => (p === "1" ? "1 personne" : `${p} personnes`)
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])
const list = (v) => String(v ?? "").split(",").map((x) => x.trim()).filter(Boolean)

// ---------- E-mail ----------
export function buildEmail(r, { from, to }) {
  const subject = `Nouvelle réservation — ${r.nom}, ${frDate(r.date)} à ${r.heure} (${personnesLabel(r.personnes)})`
  const rows = [
    ["Nom", r.nom],
    ["Téléphone", r.tel],
    ["E-mail", r.email || "—"],
    ["Date", `${frDateLong(r.date)} à ${r.heure}`],
    ["Personnes", personnesLabel(r.personnes)],
    ["Espace", r.espace],
  ]
  if (r.message) rows.push(["Demande particulière", r.message])
  if (r.lang === "en") rows.push(["Langue", "Anglais (réservation faite sur la version anglaise du site)"])
  const waLink = `https://wa.me/${r.tel.replace(/\D/g, "")}`
  const text =
    `Nouvelle demande de réservation reçue sur le site MIYU.\n\n` +
    rows.map(([k, v]) => `${k} : ${v}`).join("\n") +
    `\n\nRépondre au client sur WhatsApp : ${waLink}` +
    (r.email ? `\nOu répondez directement à cet e-mail.` : "")
  const html = `<!doctype html><html lang="fr"><body style="margin:0;padding:24px;background:#f4ecdd;font-family:Arial,Helvetica,sans-serif;color:#022d33">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:#022d33;padding:22px 28px;color:#efc688;font-size:20px;letter-spacing:6px">MÌYǓ</td></tr>
<tr><td style="padding:26px 28px 6px"><p style="margin:0 0 4px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#9a6f3c">Nouvelle réservation</p>
<h1 style="margin:0;font-size:22px;font-weight:bold;color:#022d33">${esc(r.nom)} · ${esc(frDate(r.date))} à ${esc(r.heure)}</h1></td></tr>
<tr><td style="padding:14px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px">
${rows.map(([k, v]) => `<tr><td style="padding:9px 0;border-bottom:1px solid #eee3cf;color:#6b5a3a;width:40%;vertical-align:top">${esc(k)}</td><td style="padding:9px 0;border-bottom:1px solid #eee3cf;font-weight:bold;white-space:pre-line">${esc(v)}</td></tr>`).join("\n")}
</table></td></tr>
<tr><td style="padding:10px 28px 28px"><a href="${esc(waLink)}" style="display:inline-block;background:#022d33;color:#efc688;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:999px">Répondre sur WhatsApp</a>
${r.email ? `<p style="margin:14px 0 0;font-size:13px;color:#6b5a3a">Vous pouvez aussi répondre directement à cet e-mail : la réponse ira au client.</p>` : ""}</td></tr>
</table>
<p style="text-align:center;font-size:12px;color:#6b5a3a">Envoyé automatiquement par le site MIYU · Pointe-Noire</p>
</body></html>`
  return { from, to, subject, html, text, ...(r.email ? { reply_to: r.email } : {}) }
}

async function sendEmail(r, env, fetchImpl) {
  const key = env.RESEND_API_KEY
  const to = list(env.MAIL_TO)
  if (!key || to.length === 0) return null // canal non configuré
  const from = env.MAIL_FROM || "MIYU Réservations <onboarding@resend.dev>"
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildEmail(r, { from, to })),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) console.error("Erreur e-mail (Resend)", res.status, JSON.stringify(data))
    return res.ok
  } catch (e) {
    console.error("Erreur réseau e-mail", String(e))
    return false
  }
}

// ---------- Confirmation envoyée au client ----------
const ESPACE_EN = { "Table restaurant": "Restaurant table", "Salon privé 1": "Private lounge 1", "Salon privé 2": "Private lounge 2" }
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const DAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const enDateLong = (iso) => {
  const [y, m, d] = iso.split("-").map(Number)
  return `${DAYS_EN[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS_EN[m - 1]} ${y}`
}

export function buildConfirmation(r, { from, replyTo }) {
  const en = r.lang === "en"
  const first = r.nom.split(" ")[0]
  const t = en
    ? {
        subject: `MIYU — we have received your booking request for ${enDateLong(r.date)}`,
        kicker: "Booking request received",
        hello: `Hello ${first},`,
        intro: "Thank you for choosing MIYU. We have received your booking request:",
        labels: ["Date", "Time", "Guests", "Area", "Special request"],
        date: enDateLong(r.date),
        guests: r.personnes === "1" ? "1 guest" : `${r.personnes} guests`,
        espace: ESPACE_EN[r.espace] || r.espace,
        next: `Our team will confirm your table shortly by WhatsApp or phone on ${r.tel}.`,
        change: `To change or cancel, simply reply to this email or call us on ${PHONE_FALLBACK}.`,
        bye: "See you soon at MIYU,",
        team: "The MIYU team",
        address: "K Galerie, Avenue François Charles, Centre-ville · Pointe-Noire",
      }
    : {
        subject: `MIYU — nous avons bien reçu votre demande de réservation du ${frDateLong(r.date)}`,
        kicker: "Demande de réservation reçue",
        hello: `Bonjour ${first},`,
        intro: "Merci d'avoir choisi MIYU. Nous avons bien reçu votre demande de réservation :",
        labels: ["Date", "Heure", "Personnes", "Espace", "Demande particulière"],
        date: frDateLong(r.date),
        guests: personnesLabel(r.personnes),
        espace: r.espace,
        next: `Notre équipe vous confirme la table très vite par WhatsApp ou par téléphone au ${r.tel}.`,
        change: `Pour modifier ou annuler, répondez simplement à cet e-mail ou appelez-nous au ${PHONE_FALLBACK}.`,
        bye: "À très bientôt chez MIYU,",
        team: "L'équipe MIYU",
        address: "K Galerie, Avenue François Charles, Centre-ville · Pointe-Noire",
      }
  const rows = [[t.labels[0], t.date], [t.labels[1], r.heure], [t.labels[2], t.guests], [t.labels[3], t.espace]]
  if (r.message) rows.push([t.labels[4], r.message])
  const text =
    `${t.hello}\n\n${t.intro}\n\n` + rows.map(([k, v]) => `${k} : ${v}`).join("\n") +
    `\n\n${t.next}\n${t.change}\n\n${t.bye}\n${t.team}\n${t.address}`
  const html = `<!doctype html><html lang="${en ? "en" : "fr"}"><body style="margin:0;padding:24px;background:#f4ecdd;font-family:Arial,Helvetica,sans-serif;color:#022d33">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:#022d33;padding:22px 28px;color:#efc688;font-size:20px;letter-spacing:6px">MÌYǓ</td></tr>
<tr><td style="padding:26px 28px 4px"><p style="margin:0 0 4px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#9a6f3c">${esc(t.kicker)}</p>
<p style="margin:14px 0 6px;font-size:16px">${esc(t.hello)}</p><p style="margin:0;font-size:15px;line-height:1.6">${esc(t.intro)}</p></td></tr>
<tr><td style="padding:14px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px">
${rows.map(([k, v]) => `<tr><td style="padding:9px 0;border-bottom:1px solid #eee3cf;color:#6b5a3a;width:40%;vertical-align:top">${esc(k)}</td><td style="padding:9px 0;border-bottom:1px solid #eee3cf;font-weight:bold;white-space:pre-line">${esc(v)}</td></tr>`).join("\n")}
</table></td></tr>
<tr><td style="padding:8px 28px 28px;font-size:15px;line-height:1.6"><p style="margin:0 0 10px">${esc(t.next)}</p><p style="margin:0 0 18px;color:#3e5a5d">${esc(t.change)}</p>
<p style="margin:0">${esc(t.bye)}<br><strong>${esc(t.team)}</strong></p></td></tr>
</table>
<p style="text-align:center;font-size:12px;color:#6b5a3a">MIYU Restaurant &amp; Lounge Bar · ${esc(t.address)} · ${esc(PHONE_FALLBACK)}</p>
</body></html>`
  return { from, to: [r.email], subject: t.subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) }
}

async function sendConfirmation(r, env, fetchImpl) {
  const key = env.RESEND_API_KEY
  if (!key || !r.email) return null
  const from = env.MAIL_FROM || "MIYU Réservations <onboarding@resend.dev>"
  const replyTo = list(env.MAIL_TO)[0]
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildConfirmation(r, { from, replyTo })),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) console.error("Erreur e-mail de confirmation (Resend)", res.status, JSON.stringify(data))
    return res.ok
  } catch (e) {
    console.error("Erreur réseau e-mail de confirmation", String(e))
    return false
  }
}

// ---------- WhatsApp ----------
export function buildPayload(to, r, template, lang) {
  if (template) {
    const params = [r.nom, r.tel, frDate(r.date), r.heure, r.personnes, r.espace]
    return {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: template,
        language: { code: lang },
        components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }],
      },
    }
  }
  const body =
    `*Nouvelle réservation MIYU*\n\n` +
    `Nom : ${r.nom}\n` +
    `Téléphone : ${r.tel}\n` +
    (r.email ? `E-mail : ${r.email}\n` : "") +
    `Date : ${frDate(r.date)} à ${r.heure}\n` +
    `Personnes : ${r.personnes}\n` +
    `Espace : ${r.espace}` +
    (r.message ? `\nDemande : ${r.message}` : "") +
    (r.lang === "en" ? `\nLangue : anglais` : "")
  return { messaging_product: "whatsapp", to, type: "text", text: { preview_url: false, body } }
}

async function sendWhatsApp(r, env, fetchImpl) {
  const token = env.WHATSAPP_TOKEN
  const phoneId = env.WHATSAPP_PHONE_NUMBER_ID
  const recipients = list(env.WHATSAPP_TO).map((n) => n.replace(/\D/g, "")).filter(Boolean)
  if (!token || !phoneId || recipients.length === 0) return null // canal non configuré
  const template = env.WHATSAPP_TEMPLATE || undefined
  const lang = env.WHATSAPP_TEMPLATE_LANG || "fr"
  const version = env.GRAPH_API_VERSION || "v23.0"
  const results = await Promise.all(
    recipients.map(async (to) => {
      try {
        const res = await fetchImpl(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload(to, r, template, lang)),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) console.error("Erreur WhatsApp", to.slice(0, 5) + "…", res.status, JSON.stringify(data?.error ?? data))
        return res.ok
      } catch (e) {
        console.error("Erreur réseau WhatsApp", String(e))
        return false
      }
    })
  )
  return results.some(Boolean)
}

// Traite une demande. Renvoie { status, body } prêt à être envoyé en JSON.
export async function handleReservation(body, env = process.env, fetchImpl = fetch) {
  if (!body || typeof body !== "object") return { status: 400, body: { ok: false, error: MSG.fr.invalid } }
  const m = MSG[langOf(body)]
  if (isSpam(body)) return { status: 200, body: { ok: true } }

  const { resa, error } = validate(body)
  if (!resa) return { status: 422, body: { ok: false, error } }

  const [email, whatsapp] = await Promise.all([sendEmail(resa, env, fetchImpl), sendWhatsApp(resa, env, fetchImpl)])
  const configured = [email, whatsapp].filter((x) => x !== null)
  if (configured.length === 0) {
    console.error("Aucun canal de notification configuré (RESEND_API_KEY + MAIL_TO, ou WhatsApp)")
    return { status: 503, body: { ok: false, error: m.unavailable } }
  }
  if (!configured.some(Boolean)) {
    return { status: 502, body: { ok: false, error: m.failed } }
  }
  // La confirmation au client ne part que si MIYU a bien été prévenu.
  const confirmation = await sendConfirmation(resa, env, fetchImpl)
  console.log("Réservation transmise", { date: resa.date, heure: resa.heure, personnes: resa.personnes, espace: resa.espace, lang: resa.lang, email, whatsapp, confirmation })
  return { status: 200, body: { ok: true } }
}
