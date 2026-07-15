# Registre des activités de traitement

**Responsable du traitement** : ONG-ODV Alfeo Corassori — La Vita Per Te
**Établissement** : Centre REX, Fianarantsoa (Madagascar) · Centre MIARAKA
**Contact** : direction.lavitaperte@gmail.com
**Dernière mise à jour** : 15 juillet 2026

> **Pourquoi ce document est obligatoire.** L'article 30 du RGPD dispense
> les organismes de moins de 250 personnes de tenir un registre — **sauf**
> lorsqu'ils traitent des données de l'article 9. Le dépistage gynécologique
> en fait partie. L'exemption ne s'applique donc pas ici.
>
> ⚠️ **Ce registre est rédigé par le développeur d'après le code et les
> données réelles. Il décrit fidèlement ce que le logiciel fait — il ne
> vaut pas avis juridique.** Les zones marquées « À TRANCHER » appellent une
> décision de la direction, éventuellement avec un conseil. Un registre
> imparfait mais honnête vaut mieux que pas de registre.

---

## Traitement n°1 — Dossiers de dépistage gynécologique

| | |
|---|---|
| **Finalité** | Suivi médical des patientes dépistées : retrouver l'historique d'une patiente lors d'une consultation ultérieure |
| **Base légale** | Art. 6.1.e (mission d'intérêt public — santé publique) **et**, pour lever l'interdiction de l'art. 9.1 : **art. 9.2.h** (médecine préventive, diagnostic médical, gestion de services de santé) |
| **Pourquoi pas le consentement** | Le consentement (art. 9.2.a) serait fragile : dans une relation de soin, il n'est pas librement révocable sans conséquence, et les données ont été **importées d'un système existant** (FileMaker) — nul n'a consenti à cette migration. L'art. 9.2.h est la base adaptée aux soins. **À TRANCHER par la direction.** |
| **Catégories de personnes** | Patientes dépistées au Centre REX |
| **Volume réel** | **139 928 dossiers** de visite (constaté le 15/07/2026) |
| **Catégories de données** | Identité (numéro de patiente R####, nom, date de naissance, adresse), **données de santé (art. 9)** : résultats de dépistage, observations cliniques, dates de visite |
| **Destinataires** | Personnel du centre uniquement, rôles `admin` et `direction` (2 personnes sur 6). Aucune communication à un tiers. Aucun transfert commercial. |
| **Sous-traitants** | Supabase (hébergement base) · Vercel (hébergement application) — voir [SOUS-TRAITANTS.md](SOUS-TRAITANTS.md) |
| **Lieu d'hébergement** | **Union européenne** : base de données en `eu-west-1` (Irlande), fonctions applicatives en `cdg1` (Paris) |
| **Durée de conservation** | **À TRANCHER** — voir ci-dessous |
| **Mesures de sécurité** | Authentification par mot de passe (bcrypt, 12 tours) · accès restreint par rôle · **journal de chaque consultation** (qui, quand, quelle patiente) · chiffrement en transit (TLS) et au repos (Supabase) · RLS active, accès serveur uniquement |
| **Écriture** | **Aucune.** L'application est en lecture seule sur ce traitement : elle ne peut ni modifier ni supprimer un dossier. |

### Durée de conservation — décision attendue

Le droit malgache s'applique au centre ; le RGPD s'applique à l'ONG de droit
italien. **Aucune durée n'est aujourd'hui fixée ni appliquée** : les données
importées de FileMaker remontent à plusieurs années et rien ne les purge.

Pistes usuelles, à confirmer : **20 ans après le dernier contact** (pratique
courante pour un dossier médical en Europe), ou la durée légale malgache si
elle est plus courte. Une fois tranchée, elle doit figurer ici, dans la note
d'information aux patientes, et être **techniquement appliquée** (purge
automatique) — sans quoi elle n'est qu'un vœu.

---

## Traitement n°2 — Journal des accès aux dossiers

| | |
|---|---|
| **Finalité** | Sécurité : tracer qui consulte quel dossier, pour détecter un accès anormal et répondre à une demande d'accès |
| **Base légale** | Art. 6.1.c (obligation légale — l'art. 32 impose la traçabilité) |
| **Personnes concernées** | Les 6 utilisateurs du portail (et non les patientes) |
| **Données** | Email de l'utilisateur, horodatage, action, **numéro de patiente consultée** |
| **Volume** | 27 entrées au 15/07/2026 |
| **Durée** | **À TRANCHER** — usage courant : 1 an glissant. Aucune purge n'existe aujourd'hui. |
| **Accès** | `admin` et `direction` |

---

## Traitement n°3 — Comptes utilisateurs

| | |
|---|---|
| **Finalité** | Authentifier le personnel, gérer les droits |
| **Base légale** | Art. 6.1.b (exécution du contrat de travail / mission) |
| **Personnes** | 6 salariés et bénévoles |
| **Données** | Email professionnel, nom, rôle, empreinte du mot de passe (bcrypt), date de dernière connexion |
| **Hébergement** | Google Sheets (UE non garanti — **à vérifier**), Supabase `eu-west-1` prêt |
| **Durée** | Compte désactivé au départ de la personne ; à purger après. |

---

## Traitement n°4 — Pharmacie

| | |
|---|---|
| **Finalité** | Gérer le stock de médicaments et les ventes |
| **Base légale** | Art. 6.1.e (mission d'intérêt public) |
| **Données personnelles** | **Marginales** : le nom du client peut être saisi lors d'une vente (champ facultatif, souvent vide) |
| **Attention** | Le nom d'un client associé à un médicament **est une donnée de santé indirecte** (on peut en déduire une pathologie). Ne renseigner ce champ que s'il est nécessaire. |
| **Hébergement** | Supabase `eu-west-1` |

---

## Ce qui manque encore

Constats à la date de rédaction, énoncés franchement :

| Manque | Obligation | État |
|---|---|---|
| **AIPD / DPIA** | Art. 35.3.b — obligatoire : traitement à grande échelle de données de l'art. 9 | ❌ à faire |
| **DPO** | Art. 37.1.c — obligatoire pour le même motif | ❌ à désigner |
| **Note d'information aux patientes** | Art. 13 et 14 | ❌ à rédiger et afficher |
| **Contrats de sous-traitance (DPA)** | Art. 28.3 | ⚠️ voir [SOUS-TRAITANTS.md](SOUS-TRAITANTS.md) |
| **Durées de conservation** | Art. 5.1.e | ❌ à trancher puis appliquer |
| **Procédure droits des personnes** | Art. 15 à 20 | ⚠️ voir [DROITS.md](DROITS.md) |

**Le DPO n'a pas besoin d'être un juriste ni un salarié dédié** : ce peut
être un membre de la direction, ou un prestataire mutualisé. L'essentiel est
qu'une personne soit nommée, joignable, et que son contact figure dans la
note d'information.
