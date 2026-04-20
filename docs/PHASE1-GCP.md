# 🔐 Phase 1 — Google Cloud Platform + Google Sheet

> Objectif : connecter votre application Vercel à votre Google Sheet via l'API Sheets, en mode service account (l'app accède au Sheet sans demander de connexion Google à l'utilisateur).

⏱️ Temps estimé : **15 minutes**

---

## ✅ Étape A · Préparer la structure du Google Sheet (3 min)

1. Ouvrez votre Sheet : https://docs.google.com/spreadsheets/d/1YM-6kC-Gih7QqhLrmQxVWKeKsFPSTfy-jTxZ-DRypkM/edit
2. Menu **Extensions** → **Apps Script**
3. Dans l'éditeur, **supprimez** le code par défaut (`function myFunction() {}`)
4. Ouvrez le fichier `scripts/google-sheet-setup.gs` du repo et **copiez tout son contenu** dans l'éditeur Apps Script
5. Cliquez sur **💾 Enregistrer le projet** (icône disquette en haut)
6. En haut de l'éditeur, sélectionnez la fonction **`setupSheet`** dans la liste déroulante
7. Cliquez sur **▶ Exécuter**
8. Google demande l'autorisation : **Examiner les autorisations** → choisissez votre compte → **Autoriser**
9. Attendez ~10 secondes — une boîte de dialogue **« ✅ Setup terminé »** apparaît

✅ Votre Sheet a maintenant **10 onglets** (config, users, sites, rooms, materials, sessions, movements, trash, audit_log, network) avec en-têtes formatés et données de seed (2 sites + 15 salles + 4 entrées réseau).

---

## ✅ Étape B · Créer le projet Google Cloud (5 min)

### B.1 — Créer le projet
1. Allez sur https://console.cloud.google.com/projectcreate
2. **Project name** : `La Vita Per Te Dashboard`
3. **Location** : laissez `No organization` (sauf si vous avez une organisation Google Workspace)
4. Cliquez **Create**
5. Attendez 30 secondes que le projet se crée, puis sélectionnez-le en haut de la console

### B.2 — Activer l'API Google Sheets
1. Dans la barre de recherche en haut, tapez **`Google Sheets API`**
2. Cliquez sur le résultat **Google Sheets API** (Marketplace)
3. Cliquez sur le bouton **Enable**
4. Attendez ~10 secondes → l'API est activée ✅

### B.3 — Créer un Service Account
1. Menu (☰) → **IAM & Admin** → **Service Accounts**
   (ou directement : https://console.cloud.google.com/iam-admin/serviceaccounts)
2. Cliquez sur **+ Create Service Account** en haut
3. Renseignez :
   - **Service account name** : `lavitaperte-sheets`
   - **Service account ID** : (auto-rempli) `lavitaperte-sheets`
   - **Description** : `Accès Sheets API depuis l'app Vercel`
4. Cliquez **Create and Continue**
5. **Grant this service account access to project** : laissez vide → **Continue**
6. **Grant users access to this service account** : laissez vide → **Done**

### B.4 — Générer la clé JSON
1. Sur la liste des service accounts, cliquez sur celui que vous venez de créer (`lavitaperte-sheets@...iam.gserviceaccount.com`)
2. Onglet **Keys** (en haut)
3. Cliquez **Add Key** → **Create new key**
4. Type : **JSON** → **Create**
5. Un fichier `.json` est téléchargé automatiquement → **conservez-le précieusement** (ne le partagez pas, ne le commitez pas)
6. Ouvrez ce fichier avec un éditeur de texte. Vous y trouverez 3 valeurs cruciales :
   - `client_email` : ressemble à `lavitaperte-sheets@xxx.iam.gserviceaccount.com`
   - `private_key` : longue chaîne commençant par `-----BEGIN PRIVATE KEY-----`
   - `project_id`

---

## ✅ Étape C · Partager le Google Sheet avec le Service Account (1 min)

⚠️ **Étape critique souvent oubliée**

1. Retournez sur votre Google Sheet
2. Cliquez **Partager** (en haut à droite)
3. Dans le champ « Ajouter des personnes », **collez l'adresse `client_email`** du fichier JSON (ex: `lavitaperte-sheets@xxx.iam.gserviceaccount.com`)
4. Donnez le rôle **Éditeur**
5. ⚠️ **Décochez** « Notifier les utilisateurs » (c'est un compte de service, pas un humain)
6. Cliquez **Partager**

---

## ✅ Étape D · Configurer les variables d'environnement Vercel (3 min)

1. Allez sur votre projet Vercel : https://vercel.com/dashboard → cliquez `lavitaperteonlus`
2. Onglet **Settings** → menu de gauche **Environment Variables**
3. Ajoutez les **5 variables** suivantes (cocher `Production`, `Preview` et `Development` pour chacune) :

| Nom | Valeur |
|---|---|
| `GOOGLE_SHEET_ID` | `1YM-6kC-Gih7QqhLrmQxVWKeKsFPSTfy-jTxZ-DRypkM` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `lavitaperte-sheets@xxx.iam.gserviceaccount.com` (depuis le JSON) |
| `GOOGLE_PRIVATE_KEY` | la valeur `private_key` du JSON, copiée en entier (elle commence par `-----BEGIN PRIVATE KEY-----` et se termine par `-----END PRIVATE KEY-----\n`). **Vercel gère les sauts de ligne automatiquement** — collez tel quel. |
| `AUTH_SECRET` | Générez : exécutez en terminal `openssl rand -base64 32` et collez le résultat |
| `ENCRYPTION_SECRET` | Générez : exécutez en terminal `openssl rand -base64 48` et collez le résultat (minimum 32 caractères) |

4. Une fois les 5 variables ajoutées, cliquez sur l'onglet **Deployments**
5. Trouvez le déploiement le plus récent → menu **⋯** → **Redeploy** (sans cocher la case "use existing build cache")

🎯 **Vos env vars sont actives en ~1 minute.**

---

## ✅ Étape E · Vérifier la connexion (instant)

Une fois redéployé, l'app pourra lire/écrire dans le Sheet. Le test sera fait automatiquement dès qu'on développera la première route API en Phase 2.

---

## 🛠️ Commandes utiles pour générer les secrets

### Sur macOS / Linux
```bash
# AUTH_SECRET (32 octets)
openssl rand -base64 32

# ENCRYPTION_SECRET (48 octets, plus long pour sécurité renforcée)
openssl rand -base64 48
```

### Avec Node.js (alternative)
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

⚠️ **Ne jamais committer ces secrets** dans le repo. Ils vivent uniquement dans :
- `.env.local` (sur votre machine, ignoré par git)
- Vercel Environment Variables (production)

---

## 📋 Checklist finale Phase 1

- [ ] Apps Script `setupSheet()` exécuté → 10 onglets créés
- [ ] Projet GCP créé : `La Vita Per Te Dashboard`
- [ ] API Google Sheets activée
- [ ] Service account créé : `lavitaperte-sheets@...`
- [ ] Clé JSON téléchargée et conservée en sécurité
- [ ] Sheet partagé en **Éditeur** avec le service account
- [ ] 5 env vars ajoutées dans Vercel
- [ ] Redeploy déclenché

Quand toute la checklist est ✅, dites-moi et je démarre la **Phase 2 — Authentification + 4 rôles**.
