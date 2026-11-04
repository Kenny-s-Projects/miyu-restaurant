/* MIYU — fenêtre de réservation (français / anglais).
   Injecté dans la page construite. Tout clic sur un bouton ou un lien « Réserver… » / « Book… »
   ouvre une fenêtre avec le formulaire complet, envoyé à /api/reservation. */
(function () {
  "use strict";
  var LANG = (document.documentElement.lang || "").slice(0, 2) === "en" || /^\/en(\/|$)/.test(location.pathname) ? "en" : "fr";
  var HEURES = ["12:00", "12:30", "13:00", "13:30", "14:00", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00", "22:30"];
  var PERSONNES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "12", "15", "20+"];
  var ESPACES = ["Restaurant", "Salon privé"]; // valeurs envoyées au serveur
  var PHONE = "+242 05 773 9999";
  var T = {
    fr: {
      title: "Réserver une table", kicker: "MIYU · Pointe-Noire", close: "Fermer",
      nom: "Nom", tel: "Téléphone (WhatsApp)", email: "E-mail", emailHint: "(pour la confirmation)",
      date: "Date", heure: "Heure", pers: "Personnes", espace: "Espace", espaces: ["Restaurant", "Salon privé"],
      msg: "Demande particulière", opt: "(facultatif)", msgPh: "Anniversaire, allergie, table près de la fenêtre…",
      send: "Envoyer la demande", sending: "Envoi en cours…",
      note: "Vous recevez une confirmation par e-mail. Notre équipe vous confirme la table par WhatsApp ou par téléphone.",
      thanks: "Merci !",
      done: function (d) {
        return "Votre demande pour " + (d.personnes === "1" ? "1 personne" : d.personnes + " personnes") + ", le " +
          d.date.split("-").reverse().join("/") + " à " + d.heure + " (" + d.espaceLabel + "), est bien reçue. " +
          "Une confirmation vient de vous être envoyée à " + d.email + ".";
      },
      eNom: "Merci d'indiquer votre nom.", eTel: "Merci d'indiquer un numéro de téléphone valide.",
      eEmailReq: "Merci d'indiquer votre e-mail pour recevoir la confirmation.", eEmail: "L'adresse e-mail n'est pas valide.",
      eDate: "Merci de choisir une date.", ePast: "La date choisie est déjà passée.",
      eSend: "La demande n'a pas pu être envoyée. Appelez-nous au " + PHONE + ".",
      eNet: "Connexion impossible. Réessayez ou appelez-nous au " + PHONE + ".",
      bar: "Réserver"
    },
    en: {
      title: "Book a table", kicker: "MIYU · Pointe-Noire", close: "Close",
      nom: "Name", tel: "Phone (WhatsApp)", email: "Email", emailHint: "(for your confirmation)",
      date: "Date", heure: "Time", pers: "Guests", espace: "Area", espaces: ["Restaurant", "Private lounge"],
      msg: "Special request", opt: "(optional)", msgPh: "Birthday, allergy, table by the window…",
      send: "Send request", sending: "Sending…",
      note: "You will receive a confirmation by email. Our team will confirm your table by WhatsApp or phone.",
      thanks: "Thank you!",
      done: function (d) {
        return "Your request for " + (d.personnes === "1" ? "1 guest" : d.personnes + " guests") + " on " +
          d.date.split("-").reverse().join("/") + " at " + d.heure + " (" + d.espaceLabel + ") has been received. " +
          "A confirmation has just been sent to " + d.email + ".";
      },
      eNom: "Please enter your name.", eTel: "Please enter a valid phone number.",
      eEmailReq: "Please enter your email to receive the confirmation.", eEmail: "This email address is not valid.",
      eDate: "Please choose a date.", ePast: "The selected date has already passed.",
      eSend: "Your request could not be sent. Please call us on " + PHONE + ".",
      eNet: "Connection failed. Please try again or call us on " + PHONE + ".",
      bar: "Book"
    }
  }[LANG];
  var dlg, form, lastFocus, busy = false;

  function today() { return new Date(Date.now() + 3600e3).toISOString().slice(0, 10); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function opts(values, sel, labels) {
    return values.map(function (v, i) {
      return '<option value="' + esc(v) + '"' + (v === sel ? " selected" : "") + ">" + esc(labels ? labels[i] : v) + "</option>";
    }).join("");
  }

  var CSS =
    "#miyu-resa{position:fixed;inset:0;z-index:100001;display:none;align-items:center;justify-content:center;padding:16px;" +
    "background:rgba(1,20,23,.72);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}" +
    "#miyu-resa.open{display:flex;animation:mrFade .3s ease both}" +
    "#miyu-resa.open .box{animation:mrPop .45s cubic-bezier(.2,.8,.2,1) both}" +
    "#miyu-resa.sent .done{animation:mrPop .45s cubic-bezier(.2,.8,.2,1) both}" +
    "@keyframes mrFade{from{opacity:0}to{opacity:1}}" +
    "@keyframes mrPop{from{opacity:0;transform:translateY(18px) scale(.97)}to{opacity:1;transform:none}}" +
    "@media (prefers-reduced-motion:reduce){#miyu-resa.open,#miyu-resa.open .box,#miyu-resa.sent .done{animation:none}}" +
    "#miyu-resa .box{position:relative;width:100%;max-width:620px;max-height:calc(100vh - 32px);overflow:auto;background:#f4ecdd;color:#022d33;" +
    "border-radius:22px;box-shadow:0 30px 70px rgba(0,0,0,.45);font-family:Jost,'Segoe UI',sans-serif}" +
    "#miyu-resa .head{padding:28px 30px 8px;background:#022d33;color:#f4ecdd;border-radius:22px 22px 0 0}" +
    "#miyu-resa .kicker{margin:0 0 6px;font-size:12px;font-weight:600;letter-spacing:.24em;text-transform:uppercase;color:#efc688}" +
    "#miyu-resa h2{margin:0 0 18px;font-family:'Cormorant Garamond',Georgia,serif;font-weight:500;font-size:34px;line-height:1.05}" +
    "#miyu-resa .x{position:absolute;top:14px;right:14px;width:44px;height:44px;border:0;border-radius:999px;background:transparent;color:#efc688;" +
    "font-size:28px;line-height:1;cursor:pointer}#miyu-resa .x:hover{background:rgba(239,198,136,.14)}" +
    "#miyu-resa form{padding:24px 30px 28px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 18px}" +
    "#miyu-resa .f{display:flex;flex-direction:column;gap:6px;min-width:0}#miyu-resa .full{grid-column:1/-1}" +
    "#miyu-resa label{font-size:11px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#3e5a5d}" +
    "#miyu-resa label .opt{text-transform:none;letter-spacing:0;font-weight:400;color:#6b7f80}" +
    "#miyu-resa input,#miyu-resa select,#miyu-resa textarea{min-height:48px;padding:0 14px;border:1px solid #c8b893;border-radius:12px;" +
    "background:#fffaf0;color:#022d33;font:15px Jost,'Segoe UI',sans-serif;box-sizing:border-box;width:100%}" +
    "#miyu-resa textarea{padding:12px 14px;min-height:84px;resize:vertical;line-height:1.5}" +
    "#miyu-resa input:focus,#miyu-resa select:focus,#miyu-resa textarea:focus{outline:2px solid #022d33;outline-offset:1px}" +
    "#miyu-resa .hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}" +
    "#miyu-resa .send{min-height:54px;border:0;border-radius:999px;cursor:pointer;font:600 14px Jost,sans-serif;letter-spacing:.14em;" +
    "text-transform:uppercase;color:#022d33;background:linear-gradient(100deg,#f3d39c,#efc688 45%,#c39457)}" +
    "#miyu-resa .send:disabled{opacity:.6;cursor:wait}" +
    "#miyu-resa .msg{margin:0;font-size:14px;line-height:1.5;min-height:0}" +
    "#miyu-resa .msg.err{color:#8a1c1c}" +
    "#miyu-resa .note{margin:0;font-size:12px;color:#5b6d6e;text-align:center}" +
    "#miyu-resa .done{padding:34px 30px 36px;text-align:center;display:none}" +
    "#miyu-resa .done h3{margin:0 0 10px;font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:600}" +
    "#miyu-resa .done p{margin:0 auto 22px;max-width:440px;font-size:16px;line-height:1.6;color:#3e5a5d}" +
    "#miyu-resa.sent form{display:none}#miyu-resa.sent .done{display:block}" +
    "@media (max-width:560px){#miyu-resa form{grid-template-columns:1fr;padding:20px}#miyu-resa .head{padding:24px 20px 6px}#miyu-resa h2{font-size:28px}}";

  function build() {
    if (dlg) return;
    var st = document.createElement("style");
    st.textContent = CSS;
    document.head.appendChild(st);
    dlg = document.createElement("div");
    dlg.id = "miyu-resa";
    dlg.innerHTML =
      '<div class="box" role="dialog" aria-modal="true" aria-labelledby="mr-title">' +
      '<button type="button" class="x" aria-label="' + T.close + '">&times;</button>' +
      '<div class="head"><p class="kicker">' + T.kicker + '</p><h2 id="mr-title">' + T.title + "</h2></div>" +
      "<form novalidate>" +
      '<div class="f"><label for="mr-nom">' + T.nom + '</label><input id="mr-nom" name="nom" autocomplete="name" required maxlength="60"></div>' +
      '<div class="f"><label for="mr-tel">' + T.tel + '</label><input id="mr-tel" name="tel" type="tel" autocomplete="tel" placeholder="+242 …" required maxlength="25"></div>' +
      '<div class="f full"><label for="mr-email">' + T.email + ' <span class="opt">' + T.emailHint + '</span></label><input id="mr-email" name="email" type="email" autocomplete="email" required maxlength="120"></div>' +
      '<div class="f"><label for="mr-date">' + T.date + '</label><input id="mr-date" name="date" type="date" required></div>' +
      '<div class="f"><label for="mr-heure">' + T.heure + '</label><select id="mr-heure" name="heure">' + opts(HEURES, "20:00") + "</select></div>" +
      '<div class="f"><label for="mr-pers">' + T.pers + '</label><select id="mr-pers" name="personnes">' + opts(PERSONNES, "2") + "</select></div>" +
      '<div class="f"><label for="mr-espace">' + T.espace + '</label><select id="mr-espace" name="espace">' + opts(ESPACES, "Restaurant", T.espaces) + "</select></div>" +
      '<div class="f full"><label for="mr-msg">' + T.msg + ' <span class="opt">' + T.opt + "</span></label>" +
      '<textarea id="mr-msg" name="message" maxlength="500" placeholder="' + T.msgPh + '"></textarea></div>' +
      '<div class="hp" aria-hidden="true"><label for="mr-site">Site</label><input id="mr-site" name="site" tabindex="-1" autocomplete="off"></div>' +
      '<p class="msg full" role="alert"></p>' +
      '<button type="submit" class="send full">' + T.send + "</button>" +
      '<p class="note full">' + T.note + "</p>" +
      "</form>" +
      '<div class="done" role="status"><h3>' + T.thanks + '</h3><p class="done-text"></p>' +
      '<button type="button" class="send ok" style="padding:0 34px">' + T.close + "</button></div>" +
      "</div>";
    document.body.appendChild(dlg);
    form = dlg.querySelector("form");
    dlg.querySelector(".x").addEventListener("click", close);
    dlg.querySelector(".ok").addEventListener("click", close);
    dlg.addEventListener("mousedown", function (e) { if (e.target === dlg) close(); });
    document.addEventListener("keydown", function (e) {
      if (!dlg.classList.contains("open")) return;
      if (e.key === "Escape") { e.preventDefault(); close(); }
      if (e.key === "Tab") trap(e);
    });
    form.addEventListener("submit", submit);
  }

  function trap(e) {
    var f = Array.prototype.filter.call(dlg.querySelectorAll("button,input,select,textarea"), function (el) {
      return !el.disabled && el.offsetParent !== null && el.tabIndex !== -1;
    });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function setMsg(text, err) {
    var m = dlg.querySelector(".msg");
    m.textContent = text || "";
    m.className = "msg full" + (err ? " err" : "");
  }

  function readBar(px) {
    function v(id) { var el = document.getElementById(px + "-" + id); return el ? String(el.value || "").trim() : ""; }
    return { nom: v("nom"), tel: v("tel"), date: v("date"), heure: v("heure"), personnes: v("pers"), espace: v("espace") };
  }

  function open(prefill) {
    build();
    lastFocus = document.activeElement;
    dlg.classList.remove("sent");
    setMsg("");
    var d = form.elements;
    d.date.min = today();
    prefill = prefill || {};
    if (prefill.nom) d.nom.value = prefill.nom;
    if (prefill.tel) d.tel.value = prefill.tel;
    if (prefill.date) d.date.value = prefill.date;
    if (prefill.heure && HEURES.indexOf(prefill.heure) >= 0) d.heure.value = prefill.heure;
    if (prefill.personnes) d.personnes.value = PERSONNES.indexOf(prefill.personnes) >= 0 ? prefill.personnes : (prefill.personnes === "8+" ? "8" : d.personnes.value);
    if (prefill.espace && ESPACES.indexOf(prefill.espace) >= 0) d.espace.value = prefill.espace;
    dlg.classList.add("open");
    document.documentElement.style.overflow = "hidden";
    setTimeout(function () { (d.nom.value ? (d.date.value ? d.tel : d.date) : d.nom).focus(); }, 30);
  }

  function close() {
    if (!dlg) return;
    dlg.classList.remove("open");
    document.documentElement.style.overflow = "";
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) {}
  }

  function submit(e) {
    e.preventDefault();
    if (busy) return;
    var d = form.elements;
    var data = {
      nom: d.nom.value.trim(), tel: d.tel.value.trim(), email: d.email.value.trim(), date: d.date.value,
      heure: d.heure.value, personnes: d.personnes.value, espace: d.espace.value, message: d.message.value.trim(),
      site: d.site.value, lang: LANG
    };
    var bad = null;
    if (data.nom.length < 2) bad = ["nom", T.eNom];
    else if (data.tel.replace(/\D/g, "").length < 8) bad = ["tel", T.eTel];
    else if (!data.email) bad = ["email", T.eEmailReq];
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) bad = ["email", T.eEmail];
    else if (!data.date) bad = ["date", T.eDate];
    else if (data.date < today()) bad = ["date", T.ePast];
    if (bad) { setMsg(bad[1], true); d[bad[0]].focus(); return; }

    busy = true;
    var btn = dlg.querySelector(".send");
    btn.disabled = true; btn.textContent = T.sending; setMsg("");
    fetch("/api/reservation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (res) {
        if (res && res.ok) {
          data.espaceLabel = T.espaces[ESPACES.indexOf(data.espace)] || data.espace;
          dlg.querySelector(".done-text").textContent = T.done(data);
          dlg.classList.add("sent");
          dlg.querySelector(".ok").focus();
          d.message.value = "";
        } else {
          setMsg((res && res.error) || T.eSend, true);
        }
      })
      .catch(function () { setMsg(T.eNet, true); })
      .then(function () { busy = false; btn.disabled = false; btn.textContent = T.send; });
  }

  // Ouvre la fenêtre depuis tout bouton ou lien « Réserver… » / « Book… ».
  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest ? e.target.closest("[data-resa], a, button") : null;
    if (!t || (dlg && dlg.contains(t))) return;
    var label = (t.textContent || "").replace(/\s+/g, " ").trim();
    var isBar = t.hasAttribute("data-resa") || (t.tagName === "BUTTON" && !!t.closest("#reserver, #contact-reserver"));
    if (!isBar && !/^(r[ée]server|book)\b/i.test(label)) return;
    e.preventDefault();
    e.stopPropagation();
    var px = t.getAttribute("data-resa") || (t.closest("#contact-reserver") ? "c" : "r");
    open(isBar ? readBar(px) : null);
  }, true);

  // Le bouton de la barre de réservation affiche « Réserver » / « Book ».
  function relabel() {
    ["#reserver", "#contact-reserver"].forEach(function (s) {
      var b = document.querySelector(s + " button");
      if (b && /^(v[ée]rifier|check)$/i.test(b.textContent.trim())) b.textContent = T.bar;
    });
  }
  var pending = false;
  new MutationObserver(function () {
    if (pending) return; pending = true;
    requestAnimationFrame(function () { pending = false; relabel(); });
  }).observe(document, { childList: true, subtree: true });

  window.MIYU_RESERVER = open;
})();
