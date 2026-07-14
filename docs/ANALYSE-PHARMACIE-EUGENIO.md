# Analyse comparative — Application Pharmacie d'Eugenio vs `/pharmacie` du portail

> **Source analysée** : `Documents/LabBook/Application Pharmarcie Eugénio/Applicazione farmacia/`
> Electron + React 18 + TypeScript + Ant Design + sql.js (SQLite WASM) — 40 fichiers, 12 797 lignes.
> Lecture seule intégrale par 5 analyses parallèles (schéma DB, 56 handlers IPC, email/backup,
> pages métier, UI/admin). Inventaire détaillé : [analyse-eugenio-inventaire.json](analyse-eugenio-inventaire.json) (112 fiches).
>
> **Constat clé** : l'app d'Eugenio est écrite pour **cette pharmacie précisément** — en-tête
> « PHARMACIE DU CENTRE REX / Fianarantsoa · La Vita per Te », entités de prise en charge
> Ilena et Centre Miaraka, destinataire par défaut eugepol96@gmail.com. Ses règles métier
> sont donc les besoins réels du comptoir, validés sur le terrain — pas des hypothèses.

---

## 1. Inventaire fonctionnel de l'app d'Eugenio (synthèse)

### 1.1 Modèle de stock (le cœur, l'idée la plus forte)

- **Multi-lots avec FEFO strict** (First Expired First Out) : chaque produit a N lots
  (`lots` : lot, date_expiration, qte_gros, qte_detail, prix_achat du lot, achat_id).
  Toute déduction consomme les lots par péremption croissante ; les lots **sans** date
  passent en dernier. Tolérance flottante 1e-9/1e-6 pour les quantités fractionnaires.
- **Deux compartiments par lot** : `qte_gros` (réserve, boîtes fermées) et `qte_detail`
  (rayon, unités sorties de boîte). La vente déduit le rayon d'abord, puis la réserve.
  Les **transferts** GROS↔VENTE déplacent des boîtes entières *dans le même lot*, FEFO
  (on ouvre en priorité les boîtes qui périment le plus tôt).
- **Fractionnement** : vente à la boîte OU à l'unité (comprimé, ml, dose).
  `peut_fractionner` + `facteur_conversion` (unités/boîte) + `prix_vente_detail`.
  Stock stocké en **unités de base** pour les fractionnables ; `stock_min` reste en
  **boîtes** (seuil lisible par l'utilisateur). Chaque ligne de vente découple
  `quantite` (facturée, dans l'unité du mode) et `qte_stock_deduire` (unités de base).
- **Classification automatique** du fractionnement au seed : parsing de
  FORME + CONDITIONNEMENT avec 3 regex (`3 PLAQUETTE DE 28` → 84, `BT 3/ 21` → 63,
  `BOITE DE 30` → 30), tolérance aux typos du fichier Excel (BOTE, GELLULE), formes
  continues (sirop, crème) exclues, cas spécial REVITALOSE documenté (10 doses/boîte).
  Prix unitaire suggéré = `round(prix_vente / facteur)`.
- **Journal `mouvement_lots`** (lot_id, type_operation, operation_id, champ, delta) :
  l'annulation d'une vente restaure le stock **dans les lots et compartiments exacts
  d'origine** (contre-passation lot par lot), pas dans un lot arbitraire.

### 1.2 Ventes

- Caisse : autocomplete ≥ 2 caractères (debounce 250 ms), panier multi-lignes, sélecteur
  Boîte/Unité par ligne (si fractionnable) avec prix affichés dans le bouton, contrôle de
  stock à l'ajout, Enter pour valider.
- **Encaissement** : montant reçu (min = total, pas 500 Ar), **monnaie à rendre** calculée,
  **double devise Ariary/FMG** (×5) au footer — les clients comptent encore en FMG.
- **Prise en charge (PEC)** : vente gratuite payée par une entité tierce (Ilena,
  Centre Miaraka) — total et sous-totaux forcés à 0, stock déduit normalement, champs
  service / médecin prescripteur / n° lit / n° attestation, ticket spécial avec valeur
  réelle des médicaments et ligne de signature patient/tuteur.
- **Reso vs Annulation** : le *reso* (retour client) est ouvert à **tout opérateur mais
  uniquement le jour même** ; l'*annulation* rétroactive (correction) est réservée admin.
  Motif + opérateur obligatoires, journal `annulations`, stock restauré lot par lot.
- Ticket 80 mm HTML/Courier imprimé via iframe cachée : variante cash (espèces/rendu) et
  variante PEC, **copie client** sur le même ticket après ligne de coupe, mention fixe
  « Les retours s'effectuent le jour même uniquement ». Référence `YY/MM/PHA/NNNNN`.

### 1.3 Achats fournisseurs (module complet, absent de chez nous)

- Facture multi-lignes : fournisseur (création **à la volée** dans le dropdown), date et
  n° de facture, type `normal`/`dons`, TVA par ligne (0/5/10/20 %), lot + péremption par
  ligne → **chaque ligne d'achat crée un lot**.
- **Snapshot de marge** : `prix_vente_snap` et `marge_valeur` photographiés au moment de
  l'achat → analyse de rentabilité historique fiable même si les prix changent.
- Politique dernier prix : `produits.prix_achat` = dernier prix d'achat saisi.
- **Annulation tout-ou-rien** : cible le lot créé par l'achat (`lots.achat_id`) et refuse
  si le lot a été entamé (vendu ou transféré) — intégrité garantie.
- Historique filtrable (période, fournisseur) avec détail des lignes, marge par ligne,
  bon d'entrée imprimable.

### 1.4 Alertes (actionnables, pas seulement informatives)

- 3 familles calculées : stock (`rupture` / `bas`, seuils en **boîtes équivalentes**),
  péremption (4 paliers : expiré / ≤30 j / ≤60 j / ≤90 j), **réassort détail** (`bas` si
  le rayon a < 30 % d'une boîte alors que la réserve peut réapprovisionner).
- **Liste de commande groupée par fournisseur** : à commander = `ceil(stock_min − stock)`,
  panneaux par fournisseur → transforme les alertes en bons de commande préparés.
- **Transfert rapide GROS→VENTE en un clic** depuis l'alerte réassort (modal, FEFO backend).

### 1.5 Consultation & analytique

- **Kardex produit** : historique unifié par UNION de 7 sources (achats, ventes,
  transferts, ajustements, retours, achats annulés, modifications de fiche) avec solde
  cumulé et flag `annule` (opérations barrées mais visibles).
- **Stock historique à une date** : reconstruction rétroactive
  `stock_à_D = stock_actuel + ventes_après_D − achats_après_D`, avec colonne Évolution
  (delta) dans la vue stock. *Bug connu : n'exclut pas les opérations annulées.*
- Situation stock : 3 jeux de colonnes (standard / fractionné / historique), filtres,
  valorisation, détail des lots par produit (badge « À vendre en priorité » FEFO),
  **export Excel** de la vue filtrée.
- Dashboard : 5 KPIs sur période (presets aujourd'hui/semaine/mois/30 j), marge brute
  estimée, histogramme ventes/achats en **SVG maison** (zéro dépendance), top 10 vendus /
  achetés, ventilation par forme galénique, **rapport imprimable configurable** (sections
  cochables, préférences en localStorage).
- Journal de caisse filtrable (période/opérateur/type) avec totaux espèces / PEC / global.

### 1.6 Audit et traçabilité (rien n'est jamais supprimé)

- `modifications_produit` : édition de fiche tracée **champ par champ**
  (valeur avant → après, opérateur).
- `ajustements_stock` : ajustement d'inventaire au niveau du **lot**, motif obligatoire
  parmi 6 valeurs fermées (Inventaire physique, Perte/Casse, Périmé retiré, Don reçu,
  Correction de saisie, Autre + précision), delta affiché en direct.
- `annulations` : journal polymorphe (vente/reso/achat) avec motif + opérateur.
- Snapshots dénormalisés partout (désignation, lot, prix, état avant transfert) →
  l'historique survit aux modifications du catalogue.

### 1.7 Divers

- **Stock externe « chirurgie pédiatrique »** : inventaire consultatif non vendable,
  import Excel avec auto-détection de la ligne d'en-tête (10 premières lignes, alias
  FR/IT : rubrique/Disponibili/Scadenza), quantité en texte libre, **rapprochement flou**
  vers le catalogue (premier mot normalisé NFD ≥ 3 car.), dates `MM/AAAA` interprétées
  comme fin de mois (choix conservateur).
- **Guide utilisateur intégré** bilingue FR/IT (7 sections, source de vérité métier).
- Rapports email planifiés (node-cron, config en base) : 4 sections — à commander,
  péremptions ≤ 90 j, ventes 30 j, achats 30 j — avec badges de sévérité.
- Backup triple : local quotidien (vérification d'intégrité réelle + rotation 10 +
  quarantaine `.CORRUPT`), Google Drive quotidien (OAuth desktop fait main, scope minimal
  `drive.file`, idempotence par date, retry au boot), base gzippée par email chaque lundi 06:30.
- Auth PBKDF2-SHA256 (10 000 itérations, timingSafeEqual), 2 rôles admin/opérateur,
  i18n maison FR/IT ~250 clés.

### 1.8 Dette relevée chez Eugenio (à NE PAS reproduire)

1. **Sécurité de confiance** : `qte_stock_deduire`, sous-totaux, TVA et marges calculés
   côté renderer et stockés tels quels ; rôles vérifiés uniquement côté UI ; pas de session.
2. **Dates** : date en UTC mais heure locale → la règle « reso jour même » peut basculer
   autour de minuit.
3. Références `ACH-`/`TRF-` avec suffixe aléatoire 1000-9999 sans garantie d'unicité.
4. `stock:historique` n'exclut pas les ventes/achats annulés, ignore les ajustements.
5. Dashboard : achats annulés comptés dans le total ; valorisation du seul compartiment GROS.
6. Secrets en clair dans la base (mot de passe SMTP, client_secret et refresh_token
   Google) — base qui circule ensuite par email chaque semaine.
7. Compte `admin/admin` affiché sur l'écran de login ; mots de passe min 4 caractères.
8. Pas d'échappement HTML dans tickets/rapports (injection possible via une désignation).
9. Mono-poste par construction (verrou mono-instance, base en mémoire réécrite à chaque
   écriture) ; rapports/emails perdus si l'app est fermée à l'heure du cron.

---

## 2. Matrice comparative

Légende : ✅ nous l'avons (égal ou mieux) · ⚠️ Eugenio fait mieux / plus complet · ❌ absent chez nous

| Domaine | Fonctionnalité | Eugenio | Nous | Verdict |
|---|---|---|---|---|
| **Plateforme** | Web multi-postes, accès simultané | mono-poste Electron | Next.js/Vercel | ✅ |
| | Authentification & rôles côté serveur | UI seulement, pas de session | Auth.js JWT + PERMISSIONS serveur | ✅ |
| | Hébergement EU, RGPD, backups gérés | base locale + Drive perso | Supabase Pro eu-west-1 | ✅ |
| | Rapports email fiables (app fermée) | node-cron si app ouverte | Vercel cron 7 h | ✅ |
| | i18n FR/IT | ~250 clés, trous FR en dur | complète | ✅ |
| **Vente** | Caisse panier multi-lignes + contrôle stock | ✔ | ✔ (contrôle serveur) | ✅ |
| | Ticket 80 mm + facture A4 | HTML iframe, pas de facture | @react-pdf ticket + facture | ✅ |
| | Copie client sur ticket + mention retours | ✔ | ✗ | ⚠️ |
| | Rendu monnaie (montant reçu, step 500 Ar) | ✔ | ✗ | ❌ |
| | Double devise Ariary / FMG (×5) | ✔ | ✗ | ❌ |
| | **Fractionnement** boîte/unité + prix détail | ✔ complet | ✗ | ❌ |
| | **Prise en charge (PEC)** Ilena / Centre Miaraka | ✔ complet + ticket signé | ✗ | ❌ |
| | Reso jour-même vs annulation admin | ✔ (mais date UTC boguée) | annulation 2 étapes unique | ⚠️ |
| **Stock** | Journal de mouvements (stock calculé) | dénormalisé + journal lots | append-only pur (Σ signée) | ✅ |
| | **Multi-lots FEFO** (déduction par péremption) | ✔ moteur complet | lots saisis mais pas de FEFO | ⚠️ |
| | **Compartiments GROS/VENTE + transferts** | ✔ | ✗ | ❌ |
| | Restauration d'annulation exacte par lot | ✔ | contre-passation globale | ⚠️ |
| | Ajustement inventaire motivé | ✔ par lot, 6 motifs fermés | ✔ par produit, motif libre | ⚠️ |
| | Stock historique à une date | ✔ (calcul faux après annulation) | ✗ (mais trivial et **exact** chez nous) | ❌ |
| | Kardex produit unifié + solde cumulé | ✔ 7 sources | ✗ | ❌ |
| | Export Excel situation stock | ✔ | ✗ | ❌ |
| **Achats** | Factures fournisseurs (TVA, marge snapshot) | ✔ module complet | réception simple | ⚠️ |
| | Création fournisseur/produit à la volée | ✔ | ✗ | ❌ |
| | Annulation d'achat tout-ou-rien | ✔ | ✗ | ❌ |
| **Alertes** | Rupture / stock bas / péremption | ✔ 4 paliers + boîtes équiv. | ✔ basique | ⚠️ |
| | Réassort détail (< 30 % d'une boîte au rayon) | ✔ | ✗ (sans objet avant fractionnement) | ❌ |
| | Liste à commander groupée par fournisseur | ✔ | ✗ | ❌ |
| | Transfert rapide depuis l'alerte | ✔ | ✗ | ❌ |
| **Analytique** | Dashboard KPIs période + graphiques + tops | ✔ riche | KPIs du jour | ⚠️ |
| | Journal de caisse filtrable + totaux cash/PEC | ✔ | historique ventes simple | ⚠️ |
| | Rapport imprimable configurable | ✔ | ✗ (email quotidien fixe) | ⚠️ |
| **Divers** | Stock externe chirurgie pédiatrique + import | ✔ | ✗ | ❌ |
| | Guide utilisateur intégré | ✔ FR/IT | ✗ | ❌ |
| | Recherche globale produits/ventes/achats | ✔ (composant non branché) | ✗ | ❌ |
| | Audit édition produit champ par champ | ✔ | partiel (mouvements seulement) | ⚠️ |

### Verdict direct

**Aucune des deux ne domine l'autre — elles sont plus avancées sur des axes orthogonaux.**

- **Notre app est la meilleure plateforme** : web multi-postes, sécurité serveur réelle,
  RGPD/EU, PDF de vrais tickets et factures, cron fiable, double backend Sheets/Supabase.
  Sur ces axes, l'app d'Eugenio n'est pas rattrapable (limites structurelles d'Electron
  mono-poste).
- **L'app d'Eugenio est la plus avancée en métier pharmacie** : fractionnement, FEFO
  multi-lots, compartiments GROS/VENTE, achats fournisseurs avec marge, PEC, kardex,
  alertes actionnables — environ **15 fonctionnalités métier que nous n'avons pas**,
  toutes validées par l'usage réel au comptoir.

**Conclusion opérationnelle** : porter la logique métier d'Eugenio sur notre plateforme
donne une application strictement supérieure aux deux. C'est l'objet du backlog ci-dessous.

---

## 3. Backlog priorisé d'adaptations

Principes : on adapte la **logique**, jamais le code (Electron/SQLite → Next.js server
actions + PostgREST) ; notre architecture append-only prime ; chaque tranche = un commit
déployé et vérifié, crédité `Co-Authored-By: Eugenio`.

### P0 — Prérequis (en cours, tâche #4)
Basculer Pharmacie sur **Supabase** (il reste : exposer le schéma `pharmacie` dans
Data API Settings — geste UI de Max —, migrer les données, `PHARMACIE_BACKEND=supabase`).
Les fondations P2 demandent des évolutions de schéma : bien plus propres en SQL qu'en
colonnes Sheets. Les P1 sont indépendants du backend (couche données commune).

### P1 — Quick wins (indépendants du backend, sans migration)
1. **Rendu monnaie + double devise FMG** à la caisse : montant reçu (min = total,
   pas de 500 Ar), monnaie à rendre, totaux Ar + FMG (×5). Effort : XS.
2. **Alertes enrichies** : paliers péremption 30/60/90 j, seuils en boîtes,
   **liste à commander groupée par fournisseur** (`ceil(stock_min − stock)`) — page
   alertes + section « à commander » dans le rapport email quotidien. Effort : S.
3. **Kardex produit** : vue historique des mouvements d'un produit avec solde cumulé —
   notre journal append-only le fournit nativement, il manque juste l'écran. Effort : S.
4. **Stock historique à une date** : `stock à D = Σ mouvements où date ≤ D` — notre
   modèle le calcule **exactement** (les annulations étant des contre-passations, le bug
   d'Eugenio disparaît par construction). Colonne Évolution dans la vue stock. Effort : S.
5. **Ticket enrichi** : copie client après ligne de coupe + mention « retours jour
   même ». Effort : XS.

### P2 — Fondations métier (après bascule Supabase ; migrations SQL)
6. **Fractionnement** : colonnes produits (peut_fractionner, unite_detail,
   facteur_conversion, prix_vente_detail), classification automatique adaptée à l'import
   (regex conditionnement + tolérance typos), vente boîte/unité à la caisse.
   **Adaptation** : la conversion en unités de base est recalculée **côté serveur**
   (jamais confiance au client, contrairement à Eugenio). Effort : L.
7. **FEFO multi-lots** : déduction par péremption croissante, `lot_id` porté par chaque
   mouvement → stock par lot = Σ signée des mouvements du lot (append-only conservé,
   pas d'UPDATE de quantités) ; annulation = contre-passation par lot (équivalent exact
   du `restaurerStock` d'Eugenio, en mieux : le journal est la seule vérité). Effort : L.
8. **Compartiments GROS/VENTE + transferts** : champ `compartiment` sur les mouvements,
   transfert = paire de mouvements (− gros / + detail) dans la même transaction,
   écran transfert + transfert rapide depuis l'alerte réassort. Effort : M.

### P3 — Modules
9. **Achats fournisseurs** : tables achats/lignes_achat (TVA, prix_vente_snap,
   marge_valeur), création fournisseur à la volée, chaque ligne crée un lot, annulation
   tout-ou-rien (refus si lot entamé), historique filtrable, bon d'entrée PDF. Effort : L.
10. **Prise en charge (PEC)** : entités payeuses en table `parametres` (Ilena, Centre
    Miaraka — pas en dur), total forcé à 0 côté serveur, champs service/médecin/lit/
    attestation, ticket PEC avec valeur réelle + signature. Effort : M.
11. **Reso vs annulation** : retour jour-même ouvert aux vendeurs, annulation rétroactive
    admin — règle de date appliquée **côté serveur en fuseau Indian/Antananarivo**
    (corrige le bug UTC d'Eugenio). Effort : S.
12. **Dashboard analytique** : KPIs sur période (presets), histogramme ventes/achats,
    tops, ventilation par forme, marge estimée — SVG maison comme Eugenio (zéro
    dépendance) ou recharts. Effort : M.

### P4 — Confort
13. Export Excel/CSV de la situation stock filtrée.
14. Stock externe « chirurgie pédiatrique » (import Excel + rapprochement flou).
15. Guide utilisateur intégré FR/IT (reprendre la structure des 7 sections).
16. Recherche globale produits/ventes/achats.

### Désaccords d'architecture (notre choix prime, signalés comme convenu)

| Sujet | Eugenio | Nous | Décision |
|---|---|---|---|
| Stock | dénormalisé (`produits.quantite` recalculée) + journal | **calculé** (Σ mouvements signés) | Append-only conservé ; le FEFO se fait par lot via `lot_id` sur les mouvements |
| Quantités déduites | calculées côté client, stockées telles quelles | — | Recalcul **serveur** systématique (prix, sous-totaux, conversions) |
| Rôles | vérifiés côté UI uniquement | PERMISSIONS serveur | Serveur, sans exception |
| Dates | UTC + heure locale mélangées | — | `Indian/Antananarivo` partout (règle « jour même » incluse) |
| Références | suffixe aléatoire non unique | — | Séquence serveur (format `YY/MM/PHA/NNNNN` repris, génération fiable) |
| Secrets | en clair dans la base | env Vercel | Env Vercel |
| REVITALOSE et entités PEC | codés en dur | — | Table `parametres` |

---

*Analyse générée le 14/07/2026. Chaque tranche implémentée créditera Eugenio
(`Co-Authored-By`) — son travail de terrain est la spécification fonctionnelle de
référence de ce module.*
