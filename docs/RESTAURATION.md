# Sauvegarde et restauration

> **Cette procédure a été exercée pour de vrai le 15 juillet 2026**, pas
> seulement écrite : purge complète du schéma `logistique` puis
> restauration depuis une sauvegarde. 846 lignes, 20 secondes, données
> identiques au champ près, les 6 hachages de mots de passe intacts.
>
> Une sauvegarde qu'on n'a jamais restaurée n'est pas une mesure de
> sécurité, c'est une croyance (RGPD art. 32.1.d : **tester** l'efficacité
> des mesures).

---

## Sauvegarder

```bash
cd ~/dev/lavitaperte-dashboard
node --env-file=.env.local scripts/backup-supabase.mjs
```

Produit `backups/supabase_AAAA-MM-JJTHH-MM-SS.json.gz`.
**141 022 lignes · 34 Mo · environ 2 minutes.**

Le script **relit ce qu'il vient d'écrire** et refuse une sauvegarde
incomplète : il compare son résultat au nombre de lignes annoncé par le
serveur, table par table, et s'arrête si un seul compte ne tombe pas juste.

> ⚠️ **Le fichier contient 139 928 dossiers de santé en clair.** Il ne doit
> jamais être commité (`backups/` est dans `.gitignore`), ni envoyé par
> email, ni déposé sur un service hors UE. Sur clé USB ou disque externe :
> chiffrer le support.

**Une sauvegarde qui reste sur le portable de Max ne protège de rien** — le
portable est précisément ce qui peut brûler, être volé ou tomber en panne.
Copiez le fichier ailleurs : disque externe du centre, Drive de l'ONG.

### Options

```bash
--out=/Volumes/DisqueExterne/backups   # ailleurs que ./backups
--schema=pharmacie                     # un seul schéma
```

---

## Restaurer

**Le schéma n'est pas dans la sauvegarde** — il vit dans git
(`supabase/migrations/*.sql`). Une restauration complète, c'est donc :

### 1. Recréer les tables

Supabase → SQL Editor → exécuter les migrations dans l'ordre :
`003_pharmacie.sql`, `004_pharmacie_null_safety.sql`,
`005_pharmacie_fractionnement.sql`, `006_logistique.sql`.
(Elles sont toutes en `create table if not exists` : les rejouer sur une
base intacte ne casse rien.)

### 2. Exposer les schémas

Data API → Settings → **Exposed schemas** → cocher `patients`, `pharmacie`,
`logistique` → **Save**. Sans cette étape, chaque lecture répond 404.

### 3. Recharger les données

```bash
# Toujours simuler d'abord — c'est le comportement par défaut
node --env-file=.env.local scripts/restore-supabase.mjs \
  --file=backups/supabase_2026-07-15T17-18-09.json.gz --schema=pharmacie

# Puis écrire
node --env-file=.env.local scripts/restore-supabase.mjs \
  --file=… --schema=pharmacie --apply

# Sur une base déjà peuplée : vider avant de recharger
node --env-file=.env.local scripts/restore-supabase.mjs \
  --file=… --schema=pharmacie --apply --purge --confirm=pharmacie
```

Le script compte les lignes en base après coup et les compare au fichier :
il annonce un succès **seulement** si tout correspond.

### Trois barrières contre l'accident

Écraser la production en croyant faire un test serait pire que la panne
d'origine :

1. **Simulation par défaut** — rien ne s'écrit sans `--apply` ;
2. **`--schema` obligatoire** — jamais tous les schémas d'un seul geste ;
3. **`--purge` exige `--confirm=NOM_DU_SCHEMA`**, tapé à la main.

---

## Exercer la procédure (à refaire tous les 6 mois)

Le schéma `logistique` n'est lu par aucune application tant que
`LOGISTIQUE_SUPABASE_TABS` est vide : c'est le terrain d'entraînement idéal
— vraies données, vrai volume, aucun risque.

```bash
node --env-file=.env.local scripts/backup-supabase.mjs
BK=$(ls -t backups/*.json.gz | head -1)
node --env-file=.env.local scripts/restore-supabase.mjs \
  --file="$BK" --schema=logistique --apply --purge --confirm=logistique
```

Les 10 tables doivent afficher ✅. Noter la date du dernier exercice ici :

| Date | Par qui | Résultat |
|---|---|---|
| 15/07/2026 | Max (assisté) | ✅ 846 lignes, 20 s, données identiques, hachages intacts |

---

## En cas de perte réelle

1. **Ne rien précipiter.** Supabase Pro conserve ses propres sauvegardes
   automatiques (Database → Backups) : c'est souvent le chemin le plus
   rapide et le plus fidèle. Nos fichiers sont le filet **au cas où** ce
   chemin échoue ou remonte trop peu loin.
2. Prévenir la direction : selon ce qui est perdu et pendant combien de
   temps, une notification RGPD peut être requise sous 72 h (art. 33) —
   les dossiers de dépistage sont des données de santé.
3. Restaurer selon la procédure ci-dessus, dans cet ordre :
   `logistique` (on se reconnecte), puis `pharmacie` (le comptoir tourne),
   puis `patients` (consultation seule, peut attendre).

---

## Ce que ces sauvegardes ne couvrent PAS

Honnêteté sur les limites :

- **Les classeurs Google Sheets** ne sont pas sauvegardés par ce script.
  Ils gardent leur propre historique de versions (Fichier → Historique) et
  restent la source de la logistique aujourd'hui.
- **Aucune automatisation** : le script se lance à la main. Une sauvegarde
  qui dépend de la mémoire d'une personne finit par ne plus être faite.
  Automatiser en cron reste à faire — mais un fichier vérifié fait à la
  main vaut mieux qu'un cron qu'on n'a jamais testé.
- **Aucun envoi hors site automatique** : la copie ailleurs est manuelle.

---

*Dernière mise à jour : 15 juillet 2026 · voir aussi [REPRISE.md](REPRISE.md)*
