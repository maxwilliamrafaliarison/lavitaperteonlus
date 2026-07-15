# Sous-traitants et hébergement

**Mise à jour** : 15 juillet 2026

L'article 28.3 du RGPD impose un **contrat écrit** avec chaque sous-traitant
qui traite des données pour le compte du responsable. Ces contrats existent
en libre-service chez les trois prestataires : il suffit de les activer.

---

## Où vivent réellement les données

| Donnée | Prestataire | Lieu | Vérifié |
|---|---|---|---|
| 139 928 dossiers de dépistage | Supabase | **eu-west-1** (Irlande) 🇮🇪 | ✅ |
| Pharmacie (65 produits, ventes) | Supabase | eu-west-1 🇮🇪 | ✅ |
| Parc informatique + comptes | Google Sheets | **inconnu** ⚠️ | ❌ |
| Exécution de l'application | Vercel | **cdg1** (Paris) 🇫🇷 | ✅ depuis le 15/07/2026 |

### ⚠️ Le transfert qui a existé jusqu'au 15/07/2026

Mesuré sur la production ce jour-là : l'en-tête `x-vercel-id` renvoyait
`cdg1::iad1::…`. Le second code est la région d'**exécution** : `iad1` =
**Washington, États-Unis**.

Les dossiers étaient donc stockés en Irlande, mais **chaque consultation les
faisait transiter et traiter aux États-Unis** — un transfert au sens des
articles 44 à 49, sur des données de l'article 9, sans encadrement
spécifique. Vercel s'exécute en `iad1` par défaut ; aucune région n'avait
été déclarée.

**Corrigé** : `"regions": ["cdg1"]` dans `vercel.json`. Contrôle permanent
sur https://lavitaperteonlus.vercel.app/api/health → `region.dansUE` doit
valoir `true`.

**À décider par la direction** : ce transfert passé doit-il être documenté
comme un incident ? Il a concerné des données de santé pendant une période à
déterminer (depuis la mise en production de l'app Patients). Il n'y a **aucun
indice d'accès non autorisé** — Vercel est un sous-traitant contractuel, pas
un tiers hostile — mais la base légale du transfert n'était pas établie.

---

## Les trois contrats à activer

Environ 30 minutes en tout, gratuits, en libre-service :

### 1. Supabase — le plus important
Dashboard → **Settings** → **Legal** (ou *Organization → Legal Documents*) →
accepter le **Data Processing Addendum**. Archiver le PDF.
*Traite : les 139 928 dossiers de santé.*

### 2. Vercel
Dashboard → **Settings** → **Legal** → signer le **DPA**.
Disponible sur les plans payants — le projet est en Pro.
*Traite : tout ce qui transite par l'application.*

### 3. Google (Cloud / Workspace)
Les *Google Cloud Data Processing Terms* s'appliquent au compte de service.
Vérifier l'acceptation dans la console. **Et vérifier la région du classeur
Google Sheets** — il contient les comptes utilisateurs, dont les empreintes
de mots de passe.

> Une fois signés, archiver les trois PDF **hors du dépôt de code** (Drive de
> l'ONG, dossier « Juridique »), et noter la date ici :

| Prestataire | DPA signé le | Par | Archivé où |
|---|---|---|---|
| Supabase | — | — | — |
| Vercel | — | — | — |
| Google | — | — | — |

---

## Le point unique de compromission

La clé `SUPABASE_SERVICE_KEY` **contourne toute la sécurité de la base**
(RLS comprise). Quiconque la détient peut lire les 139 928 dossiers.

- Elle ne doit exister que sur Vercel et dans le `.env.local` de Max.
- Jamais dans un dépôt, un message, une capture d'écran.
- En cas de doute sur une fuite : Supabase → Settings → API → **Reset**,
  puis remettre la nouvelle valeur sur Vercel et redéployer. L'ancienne
  cesse immédiatement de fonctionner.
- Une fuite de cette clé serait une **violation de données à notifier sous
  72 h** (art. 33).

Cette réalité doit figurer dans l'AIPD comme risque principal.
