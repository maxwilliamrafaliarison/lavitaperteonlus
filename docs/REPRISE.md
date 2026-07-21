# Reprise et continuité — Portail du Centre REX

**À qui s'adresse ce document.** À la personne qui doit faire tourner ou
réparer le portail sans son auteur : successeur technique, prestataire
appelé en urgence, ou la direction qui doit décider quoi faire.

Il ne suppose aucune connaissance du projet. Il tient en une page utile.

> **Le problème que ce document existe pour résoudre :** aujourd'hui, une
> seule personne (Max) sait où sont les données, comment redéployer et
> comment restaurer. S'il est indisponible — maladie, accident, panne de
> connexion prolongée — le centre est bloqué. Tant que la section
> « Deuxième propriétaire » n'est pas cochée, ce risque est entier.

---

## 1. En cas de panne — les 3 minutes qui comptent

**Premier réflexe, avant tout diagnostic :**

👉 **https://lavitaperteonlus.vercel.app/api/health**

Cette page est **publique et sans mot de passe** : elle répond même quand
l'authentification est cassée, et se consulte depuis un téléphone. Elle dit
quelle brique est tombée.

```json
{
  "ok": true,
  "sheets":     { "reachable": true, "backend": "supabase" },  // magasin des comptes (routé)
  "patients":   { "reachable": true },                         // Supabase / dossiers
  "pharmacie":  { "backend": "supabase", "reachable": true },
  "logistique": { "tabsSupabase": ["config","users","sites","rooms","materials",
                  "sessions","movements","trash","audit_log","network"],
                  "reachable": true }
}
```

Depuis le **21/07/2026**, les DIX onglets logistique (y compris `users`, qui
porte les comptes de toutes les apps) sont servis par Supabase — parité
champ par champ vérifiée (853 lignes) le jour de la bascule. Le Google Sheet
est GELÉ à cette date : il n'est plus qu'un filet de secours, ne plus y
saisir de données à la main.

| Ce que vous voyez | Ce que ça veut dire | Quoi faire |
|---|---|---|
| `ok: false` | Une variable d'environnement manque | Vercel → Environment Variables (§4) |
| `reachable: false` quelque part | Le service est tombé ou la clé est invalide | Voir §2 |
| La page ne répond pas du tout | Vercel est tombé | https://vercel-status.com — attendre |

**Règle d'or : on revient en arrière d'abord, on comprend ensuite.** Dès que
plus d'une personne est bloquée, faites le retour arrière (§2). La cause
sera exactement aussi lisible dix minutes plus tard, à froid. Chaque minute
passée à comprendre est une minute où le centre ne travaille pas.

---

## 2. Retour arrière

### Annuler un déploiement (le plus courant)

Vercel → projet `lavitaperteonlus` → **Deployments** → choisir le dernier
déploiement qui fonctionnait → **⋯** → **Promote to Production**.
Effet immédiat, aucun risque : le code précédent revient tel quel.

### Revenir sur Google Sheets

Chaque app peut retomber sur Google Sheets, qui reste **intact et à jour**
tant qu'on n'a pas basculé. Vercel → Environment Variables :

| App | Variable | Retour arrière |
|---|---|---|
| Pharmacie | `PHARMACIE_BACKEND` | Mettre `sheets` (ou supprimer la variable) |
| Logistique | `LOGISTIQUE_SUPABASE_TABS` | Vider la variable |

Puis **Redeploy**. ⚠️ Les données saisies depuis la bascule ne sont que dans
Supabase : un retour arrière les rend invisibles (elles ne sont pas perdues,
elles dorment dans Supabase). Prévenir avant, resynchroniser après.

### Personne ne peut se connecter

Rare : les sessions sont des **jetons autonomes**, jamais revérifiés contre
la base. Une panne de base ne déconnecte donc personne — seules les
*nouvelles* connexions échouent. Si c'est le cas :

1. Retour arrière du déploiement (ci-dessus)
2. Vérifier que `AUTH_SECRET` n'a pas changé sur Vercel — **le changer
   déconnecte tout le monde d'un coup**
3. `/api/health` → `sheets.reachable` et `logistique.reachable`

---

## 3. Les comptes — qui possède quoi

⚠️ **À COMPLÉTER PAR MAX, puis à imprimer et remettre à la direction.**

| Service | À quoi ça sert | Propriétaire | 2ᵉ propriétaire |
|---|---|---|---|
| **Vercel** | Héberge le site | Max | ❌ **à ajouter** |
| **Supabase** | Base de données (patients, pharmacie, logistique) | Max (compte perso) | ❌ **à ajouter** |
| **Google Cloud** | Compte de service Sheets | Max | ❌ **à ajouter** |
| **GitHub** | Code source | Max (compte perso) | ❌ **à ajouter** |
| **Gmail applicatif** | Envoi du rapport quotidien | — | — |

**Deux anomalies de gouvernance à corriger :** Supabase et GitHub sont sur
des **comptes personnels de Max**, alors qu'ils hébergent les données de
l'association — dont 139 928 dossiers de santé. À transférer vers des
comptes au nom de l'ONG, ou à défaut ajouter la direction en propriétaire.

---

## 4. Les secrets — où ils vivent, lesquels sont irrécupérables

Tous sur **Vercel → Environment Variables**, et sur le poste de Max dans
`.env.local`. **Nulle part ailleurs.** C'est le point faible.

| Secret | Si on le perd | Régénérable ? |
|---|---|---|
| `ENCRYPTION_SECRET` | Les mots de passe des **23 machines** deviennent illisibles pour toujours | ❌ **NON** |
| `AUTH_SECRET` | Tout le monde est déconnecté (sans gravité, on se reconnecte) | ✅ oui |
| `SUPABASE_SERVICE_KEY` | Rien n'est perdu | ✅ Supabase → Settings → API |
| `GOOGLE_PRIVATE_KEY` | Rien n'est perdu | ✅ Google Cloud → nouvelle clé |

**À faire d'urgence :** copier `ENCRYPTION_SECRET` et `AUTH_SECRET` dans un
gestionnaire de mots de passe partagé avec la direction (Bitwarden, 1Password),
ou à défaut sur papier, dans une enveloppe scellée au coffre. Aujourd'hui,
la perte du poste de Max = perte définitive des mots de passe machines.

La liste complète et commentée des variables est dans **`.env.example`**.

---

## 5. Les données — où elles sont

| Donnée | Où | Volume |
|---|---|---|
| Dossiers de dépistage | Supabase, schéma `patients`, **eu-west-1** | 139 928 |
| Pharmacie | Supabase, schéma `pharmacie` (+ Google Sheets en secours) | 65 produits |
| Parc informatique + **utilisateurs** | Google Sheets (Supabase prêt, pas branché) | 260 matériels, 6 comptes |

**Pourquoi l'Europe :** les dossiers de dépistage sont des **données de santé**
(RGPD art. 9). L'hébergement doit rester dans l'UE. Ne jamais déplacer le
projet Supabase hors d'eu-west-1.

### Sauvegardes

⚠️ **Aujourd'hui, le projet ne possède aucune sauvegarde.** On dépend
entièrement des sauvegardes automatiques du plan Supabase Pro, dont
**personne n'a jamais testé la restauration**. Un backup jamais restauré est
une croyance, pas une mesure (RGPD art. 32.1.d : tester l'efficacité des
mesures).

C'est le point n°3 du backlog. En attendant, en cas de perte de données :
Supabase → Database → Backups → Restore. **Procédure jamais exercée.**

---

## 6. Si le portail est inutilisable — la procédure papier

Le centre doit pouvoir travailler sans l'application.

**Pharmacie :** noter chaque vente sur le carnet (date, produit, quantité,
montant, client). Ne pas inventer de stock : à la reprise, saisir les ventes
puis faire un inventaire (fiche produit → « Ajuster le stock »).

**Ne jamais saisir une vente si `/api/health` signale une panne** : elle
pourrait ne pas être enregistrée alors que le ticket est imprimé.

**Patients :** les dossiers sont **en consultation seule**. Aucune perte
possible, l'application n'écrit rien.

---

## 7. Faire tourner le projet

```bash
git clone https://github.com/maxwilliamrafaliarison/lavitaperteonlus.git
cd lavitaperteonlus
npm ci
cp .env.example .env.local     # puis remplir (valeurs sur Vercel)
npm run dev                    # http://localhost:3000
```

⚠️ **Ne jamais placer ce dépôt dans `~/Documents` ou `~/Desktop`** sur un Mac :
ces dossiers sont gérés par iCloud, qui vide le contenu des fichiers quand le
disque se remplit. Git, TypeScript et les builds se figent alors sur des
délais réseau, sans message compréhensible. Utiliser `~/dev/`.

Vérifications avant de pousser :

```bash
npx tsc --noEmit    # types — vérifier le CODE DE SORTIE, pas l'affichage
npx vitest run      # tests
```

Le déploiement est automatique à chaque `git push` sur `main`. Vercel refuse
un build qui ne compile pas : c'est le dernier garde-fou.

---

## 8. Ce qu'il faut savoir avant de toucher au code

Trois règles qui ont chacune coûté un incident réel :

1. **Le stock de la pharmacie n'est stocké nulle part.** Il est la somme des
   mouvements signés. Ne jamais écrire une colonne « stock » : ajouter un
   mouvement. Toute lecture paginée doit avoir un `ORDER BY` explicite, sinon
   la somme dérive silencieusement.

2. **Une colonne texte vide s'écrit `""`, jamais `null`.** Les colonnes sont
   `NOT NULL` en base et Zod rejette `null` : un `null` a déjà fait
   disparaître 18 produits sur 65 de toute l'application, sans une erreur.

3. **Un prix ou une quantité ne se croit jamais sur parole.** Ce que le
   navigateur envoie est indicatif ; le serveur relit le catalogue. Sinon une
   page laissée ouverte facture l'ancien tarif.

---

## 9. Contacts

| Rôle | Nom | Contact |
|---|---|---|
| Développeur | Max Rafaliarison | max.fianar@gmail.com |
| Direction | — | direction.lavitaperte@gmail.com |
| Informatique | — | informatique.lavitaperte@gmail.com |
| Pharmacie | Eugenio | eugepol96@gmail.com |

---

*Dernière mise à jour : 15 juillet 2026. À relire à chaque changement de
compte, de secret ou d'hébergement.*
