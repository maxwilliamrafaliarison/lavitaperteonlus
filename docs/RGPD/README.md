# Conformité RGPD — Centre REX

Le portail traite **139 928 dossiers de dépistage gynécologique** : des
données de santé au sens de l'**article 9** du RGPD. C'est la catégorie la
plus protégée du règlement, et elle fait tomber la plupart des exemptions
réservées aux petites structures.

L'ONG est de droit italien : le RGPD s'applique.

---

## Les documents

| Document | Contenu | État |
|---|---|---|
| [REGISTRE.md](REGISTRE.md) | Les 4 traitements, leurs finalités, bases légales, durées | ✅ rédigé · ⚠️ 2 décisions attendues |
| [SOUS-TRAITANTS.md](SOUS-TRAITANTS.md) | Où vivent les données, les 3 contrats à signer | ✅ rédigé · ❌ contrats à activer |
| [DROITS.md](DROITS.md) | Procédure pour les demandes des patientes | ✅ rédigé |
| [NOTE-INFORMATION.md](NOTE-INFORMATION.md) | La note à afficher à l'accueil | ⚠️ à compléter et traduire |

---

## Où on en est vraiment

**Ce qui est en place et vérifié :**

- ✅ Hébergement **dans l'UE** : base en Irlande, application à Paris
- ✅ **Journal de chaque consultation** — qui, quand, quelle patiente ; désormais interrogeable
- ✅ Accès restreint : `admin` et `direction` seulement (2 personnes sur 6)
- ✅ **Lecture seule** : l'application ne peut ni modifier ni supprimer un dossier
- ✅ Chiffrement en transit et au repos, RLS active, accès serveur uniquement
- ✅ Sauvegardes possédées, restauration **exercée** (art. 32.1.d)

**Ce qui manque — franchement :**

| Manque | Article | Qui décide |
|---|---|---|
| **AIPD** (analyse d'impact) | 35.3.b — obligatoire ici | Direction, avec conseil |
| **DPO** désigné | 37.1.c — obligatoire ici | Direction |
| **Note d'information** affichée | 13 et 14 | Direction (traduction malgache) |
| **Durées de conservation** fixées puis appliquées | 5.1.e | Direction, puis développeur |
| **Contrats de sous-traitance** | 28.3 | Max — 30 min, gratuit |

---

## Un incident à documenter

Jusqu'au 15 juillet 2026, les fonctions de l'application s'exécutaient à
**Washington** (mesuré : `x-vercel-id: cdg1::iad1::…`) alors que la base est
en Irlande. Chaque consultation faisait donc transiter des données de santé
**hors de l'Union**, sans base légale de transfert (art. 44-49).

Corrigé le jour même. Il n'y a **aucun indice d'accès non autorisé** —
Vercel est un sous-traitant contractuel, pas un tiers hostile. Mais la
direction doit décider si cela se documente comme un incident. Voir
[SOUS-TRAITANTS.md](SOUS-TRAITANTS.md).

---

## Ce que ces documents sont, et ne sont pas

Ils ont été rédigés **par le développeur, à partir du code et des données
réelles** — pas recopiés d'un modèle. Ils décrivent fidèlement ce que le
logiciel fait, avec les preuves techniques à l'appui.

**Ils ne valent pas un avis juridique.** Le choix de la base légale, la durée
de conservation, la désignation du DPO et l'AIPD appellent une décision de la
direction, idéalement avec un conseil. Les zones « À TRANCHER » le signalent.

Un registre honnête et incomplet vaut infiniment mieux qu'un modèle parfait
qui décrirait un autre logiciel que le vôtre.

---

## La prochaine étape la plus utile

**L'AIPD.** Elle est obligatoire, et c'est aussi l'exercice qui sert
réellement à quelque chose : elle force à écrire ce qui peut mal tourner et
ce qu'on fait pour l'empêcher. Le risque principal est déjà identifié — la
clé `service_role`, point unique de compromission des 139 928 dossiers.

*Dernière mise à jour : 15 juillet 2026*
