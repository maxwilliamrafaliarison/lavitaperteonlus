# Phase 10 — Monitoring & domaine custom

> Guide opérationnel pour surveiller l'app en production et y associer un domaine à la marque La Vita Per Te.

---

## 1. Endpoint de santé — `/api/health`

Un endpoint JSON qui vérifie d'un coup :

- présence des 5 variables d'environnement critiques
- connectivité Google Sheets (lecture réelle de l'onglet `users`)
- latence d'exécution

```bash
curl https://lavitaperteonlus.vercel.app/api/health | jq
```

### Réponse "tout va bien" (200)
```json
{
  "ok": true,
  "timestamp": "2026-04-21T...",
  "node": "v22.x.x",
  "env": {
    "sheetId": true,
    "serviceAccount": true,
    "privateKey": true,
    "authSecret": true,
    "encryptionSecret": true
  },
  "sheets": { "reachable": true, "userCount": 1 },
  "latencyMs": 420
}
```

### Réponse "config cassée" (503)
```json
{
  "ok": false,
  "env": { "privateKey": false, ... },
  "sheets": { "reachable": false, "error": "..." }
}
```

👉 **C'est l'outil n°1 pour diagnostiquer un problème de connexion Google Sheets en prod.** Une env var absente saute aux yeux.

---

## 2. Logger serveur

`src/lib/logger.ts` expose `createLogger(scope)` avec 4 niveaux :

```ts
import { createLogger } from "@/lib/logger";
const log = createLogger("transfer");

log.info("transfert créé", { materialId, from, to });
log.error("échec update", err);
```

Les lignes sont formatées `[ISO] INFO  [scope] message {ctx}` et visibles dans :

- **Terminal** (dev)
- **Vercel Dashboard → Project → Logs** (prod)

`debug` est silencieux en production.

---

## 3. Error boundary global

`src/app/error.tsx` capture tout crash client côté React (erreurs dans les server components compilés côté client inclus) et affiche une card glass avec :

- le message d'erreur
- le `digest` (identifiant corrélable dans les logs Vercel)
- un bouton "Réessayer" qui appelle `reset()`
- un retour vers le dashboard

Le fallback brut de Next.js n'apparaît plus jamais à l'utilisateur.

---

## 4. Vercel Analytics & Speed Insights

Activation en 2 clics dans le dashboard Vercel :

1. **Projet → Analytics → Enable** (vue pages, visiteurs, 30 jours inclus)
2. **Projet → Speed Insights → Enable** (Core Web Vitals)

Pas de code à ajouter — Vercel injecte tout automatiquement. Si plus tard on veut piloter via code :

```bash
npm install @vercel/analytics @vercel/speed-insights
```

puis dans `app/layout.tsx`, ajouter `<Analytics />` et `<SpeedInsights />` dans le body.

---

## 5. Monitoring uptime externe (optionnel, gratuit)

Exemples de services qui ping un endpoint toutes les 5 min :

| Service | Plan gratuit | URL à ping |
|---|---|---|
| [UptimeRobot](https://uptimerobot.com) | 50 moniteurs · 5 min | `/api/health` |
| [Better Stack](https://betterstack.com) | 10 moniteurs · 3 min | `/api/health` |
| [Cronitor](https://cronitor.io) | 5 moniteurs · 1 min | `/api/health` |

Conseils :
- Surveiller **`/api/health`** (pas `/login` — il peut rester debout même si le Sheet est cassé)
- Alerter sur les codes **HTTP ≠ 200** (`ok: false` renvoie 503)
- Configurer des alertes email + SMS (certains le font gratuit)

---

## 6. Domaine custom sur Vercel

Actuellement l'app vit à `https://lavitaperteonlus.vercel.app`. Pour la marque, mieux vaut un sous-domaine propre (`dashboard.lavitaperte.org` par ex.).

### Étapes

1. **Vercel** : Projet → Settings → **Domains** → "Add"
   - Entrer `dashboard.lavitaperte.org`
   - Vercel affiche 2 enregistrements DNS à créer (CNAME ou A)

2. **Registrar du domaine lavitaperte.org** (Gandi / OVH / Namecheap…) :
   - Aller dans la zone DNS
   - Ajouter un enregistrement **CNAME** :
     - Nom : `dashboard`
     - Cible : `cname.vercel-dns.com.`
     - TTL : 3600

3. **Attendre la propagation DNS** (5 min à 48h selon provider)

4. **Vercel vérifie automatiquement** et émet un certificat SSL (Let's Encrypt, auto-renouvelé).

### Env vars à mettre à jour

Dans Vercel → Settings → Environment Variables :

```
AUTH_URL=https://dashboard.lavitaperte.org
```

Sinon les cookies de session et les redirects Auth.js restent sur l'ancien domaine.

---

## 7. Checklist de déploiement prod

Avant chaque merge sur `main` → Vercel auto-deploy :

- [ ] `npx tsc --noEmit` passe sans erreur
- [ ] `npx next build` passe sans erreur (tester en local)
- [ ] `/api/health` retourne `ok: true` une fois déployé
- [ ] Tester login + 1 action d'écriture (créer un mouvement par ex.)
- [ ] Vérifier les logs Vercel — aucune erreur inattendue dans les 5 min qui suivent

---

## 8. Variables d'environnement Vercel (référence)

| Variable | Obligatoire | Exemple |
|---|---|---|
| `GOOGLE_SHEET_ID` | ✅ | `1YM-6kC-Gih7QqhL...` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | ✅ | `sheets-sa@project.iam.gserviceaccount.com` |
| `GOOGLE_PRIVATE_KEY` | ✅ | `-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n` |
| `AUTH_SECRET` | ✅ | Généré via `openssl rand -base64 32` |
| `ENCRYPTION_SECRET` | ✅ | ≥ 32 chars, utilisé pour AES-256-GCM des MDP |
| `AUTH_URL` | Reco | `https://lavitaperteonlus.vercel.app` (ou domaine custom) |

⚠️ **Piège classique** : `GOOGLE_PRIVATE_KEY` doit garder ses `\n` littéraux (pas de vrais retours à la ligne). Le code les convertit en `\n` au runtime via `.replace(/\\n/g, "\n")`.
