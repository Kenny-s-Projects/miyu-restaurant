# MIYU — site vitrine et réservations (note de reprise)

Site de **MIYU Restaurant & Lounge Bar**, Pointe-Noire (République du Congo).
En ligne : **https://miyurestaurant.com** (français) et **https://miyurestaurant.com/en/** (anglais).

Le webmaster (web designer, graphiste, community manager) travaille en **français** ; répondre en français
sauf s'il écrit en anglais. Les textes du site, les commentaires du code et les messages de commit sont en français.

## Où se trouve quoi

| Élément | Emplacement |
|---|---|
| Code | GitHub `Kenny-s-Projects/miyu-restaurant`, branche `main` |
| Hébergement | **Hostinger** (depuis le 21/11/2026), offre Cloud Economy, compte `u856264758`, site `miyurestaurant.com` en application **Node.js** (Node 22, point d'entrée `server.mjs`, script de build `test`). Ancien hébergeur : Render (service `srv-dbirbk0u01pc73docrf0`, suspendu le 20/11 pour quota mensuel du plan gratuit dépassé) |
| Domaine | `miyurestaurant.com` (+ `www`), DNS chez Hostinger : `@` ALIAS → `miyurestaurant.com.cdn.hstgr.net`, `www` CNAME → `www.miyurestaurant.com.cdn.hstgr.net` (avant : `miyu-restaurant-zhmv.onrender.com`). Enregistrements Resend (`resend._domainkey`, `send`, `rsend`, `_dmarc`) à garder |
| E-mails | Resend, domaine `miyurestaurant.com` vérifié ; expéditeur `reservations@miyurestaurant.com` (pas de boîte réelle derrière) |
| WhatsApp | Meta, app « MIYU Réservations », compte WhatsApp Business « Miyu Restaurant & Lounge Bar Pointe-Noire », numéro expéditeur +1 555-491-5589 (Phone Number ID `1431382996729568`) |
| Menus PDF | Google Drive (liens publics dans la source du design) |
| Ancien aperçu | `miyu-site-vitrine-cd-9583b654a7.netlify.app` (Netlify) : ne sert plus qu'à fournir la coque d'export, voir plus bas |

## Architecture

- `design/Main.dc.html` — **source unique de la page, en français**. Format « Design Component » (canevas Claude Design) :
  balises `<x-dc>`, `<helmet>`, `<sc-if>`, `<sc-for>`, `{{ variables }}`, logique dans `class Component extends DCLogic`.
  Une seule page avec quatre vues (accueil, la carte, lounge & rooftop, contact) commutées par `state.view`.
- `design/i18n/en.json` — traductions **texte français exact → texte anglais**.
- `design/assets/` + `index.json` — images ; `index.json` relie chaque `/_blob/<id>` du canevas à son fichier.
- `design/Main.en.dc.html` — **généré** par le build (ne pas modifier à la main).
- `tools/build.py` — construit `public/index.html` (FR), `public/en/index.html` (EN) et `public/assets/`.
  Il reprend la coque de `tools/export-cache.html` (chargeur, moteur de rendu, polices intégrées) et y injecte
  le contenu de `design/`, puis ajoute `tools/reservation-client.js`.
- `tools/i18n.py` — extraction et remplacement des textes (balises, attributs alt/aria-label/placeholder/title,
  chaînes JavaScript de la logique).
- `tools/reservation-client.js` — fenêtre de réservation (FR/EN), ouverte par tout lien ou bouton dont le texte
  commence par « Réserver » ou « Book ».
- `server.mjs` — serveur Node sans dépendance : `/`, `/en/`, `/assets/*`, `POST /api/reservation`, `/healthz`.
  Limite de 5 réservations par IP et par 10 minutes.
- `lib/reservation.mjs` — validation, e-mail à MIYU (Resend), WhatsApp au gérant (API Cloud de Meta),
  e-mail de confirmation au client dans sa langue (uniquement si MIYU a bien été prévenu).

## Commandes

```bash
python3 -I tools/build.py   # reconstruit public/ (FR + EN) — à lancer après toute modification de design/ ou du client
npm test                    # tests de lib/reservation.mjs (lancés aussi par Hostinger au build)
npm start                   # http://localhost:10000
npm run demo                # test en local sans clé : rien n'est envoyé, les e-mails et WhatsApp s'affichent sur /demo/
```

## Mot-clé « liboke »

Quand le webmaster écrit **« liboke »**, cela veut dire « merge et déploie » (ou « commit, push et déploie ») :
1. committer les modifications en cours et les pousser sur la branche de travail ;
2. fusionner la branche dans `main` et pousser `main` ;
3. déployer sur Hostinger (voir « Déployer » dans Points d'attention), puis vérifier
   `https://miyurestaurant.com/healthz` et la page d'accueil (FR et EN).

## Modifier le site

1. Modifier `design/Main.dc.html` (et le canevas si l'utilisateur s'en sert ; garder les deux identiques).
2. Nouveaux textes : `python3 -I tools/build.py` **s'arrête et liste les textes sans traduction** ; les ajouter
   dans `design/i18n/en.json` puis relancer. Un texte modifié en français = une nouvelle clé.
3. Nouvelle image : la copier dans `design/assets/`, l'ajouter à `index.json` (id du canevas → fichier),
   et la référencer dans la source par `/_blob/<id>`.
4. Vérifier dans un navigateur (Playwright + Chromium préinstallé) : FR, EN, fenêtre de réservation.
5. Commit + push sur `main`, puis **déployer sur Hostinger** (voir « Points d'attention »).

Règles du format de la source : attributs toujours entre guillemets, balises toujours fermées, pas de HTML
construit en JavaScript, icônes en SVG en ligne, animations dans le `<style>` du `<helmet>`
(classes `lr-up`, `lr-d1…4`, `pg-in`, `rv`, `lift`, `zoom`…), `prefers-reduced-motion` respecté.

## Variables d'environnement (Hostinger : hPanel › Sites web › miyurestaurant.com › Node.js › Variables d'environnement)

`RESEND_API_KEY` (secret), `MAIL_TO=miyu@khospitality.net`, `MAIL_FROM=MIYU Réservations <reservations@miyurestaurant.com>`,
`WHATSAPP_TOKEN` (secret, token permanent d'un utilisateur système Meta), `WHATSAPP_PHONE_NUMBER_ID=1431382996729568`,
`WHATSAPP_TO=242057739999` (gérant, comme le bouton du site `WA_NOTIF`), `GRAPH_API_VERSION=v25.0`.
Optionnels : `WHATSAPP_TEMPLATE`, `WHATSAPP_TEMPLATE_LANG` (défaut `fr`).
Ne jamais écrire de secret dans le code ni dans la conversation : l'utilisateur colle lui-même `RESEND_API_KEY` et `WHATSAPP_TOKEN`
dans hPanel. **Attention** : l'API Hostinger « replace environment variables » remplace **toute** la liste ; ne jamais
l'appeler une fois les secrets ajoutés (elle les effacerait) : faire les changements dans hPanel.

## Reste à faire

- **WhatsApp en production** : faire approuver le modèle `nouvelle_reservation` (catégorie Utility, français) dans
  WhatsApp Manager, puis mettre `WHATSAPP_TEMPLATE=nouvelle_reservation` et le **numéro du gérant** dans `WHATSAPP_TO`.
  Sans modèle, Meta ne livre un message libre que si le destinataire a écrit au numéro dans les 24 h.
  Texte du modèle (les variables ne doivent ni commencer ni terminer le texte) :
  `Nouvelle réservation MIYU / Nom : {{1}} / Téléphone : {{2}} / Date : {{3}} à {{4}} / Personnes : {{5}} / Espace : {{6}} / Merci de confirmer la table au client.`
  (le code envoie les paramètres dans cet ordre).
- **Vérification d'entreprise Meta** si Meta la demande pour lever les limites d'envoi.
- **Secrets Hostinger** : ajouter `RESEND_API_KEY` et `WHATSAPP_TOKEN` dans hPanel (sans eux, le site répond
  « Service de réservation indisponible » aux réservations).
- **Déploiement automatique** : connecter GitHub dans hPanel (Sites web › Gérer › Avancé › Git) pour que Hostinger
  redéploie `main` à chaque push ; ensuite l'outil `hosting_deploy` (type nodejs) fonctionne.
- Contenus à confirmer par MIYU : conditions de la **Ladies Night** (`[JOUR & CONDITIONS]`), mention « DJ sets »
  sur la page Lounge & Rooftop, écarts de prix entre les PDF (ex. Don Julio Reposado).
- Page **Lounge & Rooftop** : **masquée** à la demande du client (lien « Lounge » du menu et bouton « Découvrir le lounge »
  de l'accueil retirés, code de la vue conservé) ; pour la réactiver, remettre le lien laissé en commentaire dans la `<nav>`.
- Barre de réservation sous le héros de l'accueil : **masquée** (`display: none` sur `#reserver`) à la demande
  du client ; à réactiver en retirant ce style.

## Points d'attention

- **Déployer (Hostinger)** : tant que GitHub n'est pas connecté dans hPanel, déployer par archive :
  `git archive --format=zip -o miyu.zip origin/main`, envoi via `hosting_files_generate-upload-url` (TUS),
  puis `hosting_nodejs_start-build` (source `archive`, node 22, app_type `other`, entry `server.mjs`,
  build_script `test`, root/output `.`) et suivi avec `hosting_get-deployment`. Vérifier ensuite
  `https://miyurestaurant.com/healthz`.
- Les images référencées seulement dans la logique JavaScript (couvertures de menus, bouteilles) passent aussi
  par `/assets/` grâce au build ; ne pas réintroduire d'URL `/_blob/` dans `public/`.
- `tools/export-cache.html` ne doit être remplacé (`--refresh-shell`) que pour mettre à jour le moteur de rendu ;
  le contenu, lui, vient toujours de `design/`.
- Réservations de test : nom « Test Site Web » et demande « à ignorer », sans jamais mentionner Claude.
- Les PDF de menus sont lourds (le menu restaurant fait ~190 Mo) : une version compressée sur Drive serait mieux.
