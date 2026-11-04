# MIYU — Restaurant & Lounge Bar (Pointe-Noire)

Site vitrine de MIYU. Le bouton « Réserver » ouvre une fenêtre de réservation ; chaque demande
est envoyée par e-mail à MIYU (Resend) et, si configuré, sur WhatsApp au gérant.

## Fonctionnement

- `design/Main.dc.html` : source de la page (français), copiée depuis le canevas de design (Claude).
- `design/i18n/en.json` : traductions anglaises. Le build crée la version anglaise (`/en/`) et `design/Main.en.dc.html`.
  S'il manque une traduction, le build s'arrête et liste les textes à ajouter.
- `design/assets/` : les images du site ; `index.json` relie chaque identifiant d'image du canevas à son fichier.
- `tools/build.py` : assemble `public/index.html` (moteur de rendu + polices venant de `tools/export-cache.html`,
  contenu venant de `design/`) et copie les images dans `public/assets/`.
- `tools/reservation-client.js` : la fenêtre de réservation, ajoutée à la page par le build.
- `server.mjs` : petit serveur Node sans dépendance. Sert la page, les images et `POST /api/reservation`.
- `lib/reservation.mjs` : vérifie la demande et l'envoie par e-mail (Resend) et/ou WhatsApp (API Cloud de Meta).

## Variables d'environnement (Render › Environment)

| Clé | Rôle |
|---|---|
| `RESEND_API_KEY` | Clé API Resend (secret) |
| `MAIL_TO` | Adresse(s) e-mail qui reçoivent les réservations |
| `MAIL_FROM` | (optionnel) expéditeur ; défaut `MIYU Réservations <onboarding@resend.dev>`. Avec le domaine vérifié dans Resend : `MIYU Réservations <reservations@domaine>` |
| `WHATSAPP_TOKEN` | Token d'accès Meta (secret, jamais dans le code) |
| `WHATSAPP_PHONE_NUMBER_ID` | Identifiant du numéro expéditeur (Meta › WhatsApp › API Setup) |
| `WHATSAPP_TO` | Numéro(s) qui reçoivent les réservations, séparés par des virgules |
| `WHATSAPP_TEMPLATE` | (production) nom du modèle approuvé, ex. `nouvelle_reservation` |
| `WHATSAPP_TEMPLATE_LANG` | (optionnel) langue du modèle, défaut `fr` |

Chaque canal n'est actif que si ses variables sont renseignées. Le client reçoit aussi un e-mail de confirmation
(dans sa langue), avec MIYU en adresse de réponse.

WhatsApp : sans modèle, le message part en texte libre : cela ne fonctionne que si le destinataire
a écrit au numéro WhatsApp Business dans les 24 dernières heures (pratique pour les tests).

## Mettre à jour le design

1. Copier la nouvelle version du canevas dans `design/Main.dc.html` (et les nouvelles images dans `design/assets/`,
   avec leur identifiant dans `index.json`).
2. `python3 -I tools/build.py`
3. Commit + push sur `main` : Render redéploie automatiquement.

## Commandes

```bash
npm start     # lance le site sur http://localhost:10000
npm test      # tests de la logique de réservation
```
