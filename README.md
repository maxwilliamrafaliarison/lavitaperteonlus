# 🏥 La Vita Per Te — Portail du Centre REX

> Portail multi-applications du **Centre REX Fianarantsoa** et du **Centre MIARAKA** — ONG-ODV Alfeo Corassori, Madagascar.

🌐 **En production** : https://lavitaperteonlus.vercel.app

## 📦 Les applications

| App | Rôle | Données |
|---|---|---|
| **Logistique** | Parc informatique : inventaire, obsolescence, mouvements, mots de passe machines chiffrés. **Porte l'authentification de tout le portail.** | Google Sheets (260 matériels, 6 comptes) |
| **Pharmacie** | Stock, ventes, ticket 80 mm, facture A4, alertes de péremption, rapport quotidien par email | Supabase `pharmacie` (65 produits) |
| **Patients** | Consultation des dossiers de dépistage — **lecture seule** | Supabase `patients` (139 928 dossiers) |
| **Site public** | Vitrine de l'association | — |

> ⚠️ **Données de santé.** Les dossiers de dépistage relèvent de l'article 9
> du RGPD : hébergement dans l'UE (eu-west-1) obligatoire, accès journalisés,
> aucune écriture depuis l'application.

🆘 **Panne, reprise, comptes, secrets → [docs/REPRISE.md](docs/REPRISE.md)**

---

## 🎨 Design

- **Style** : Liquid glass premium (inspiration Apple), mode sombre par défaut
- **Palette** : dérivée du logo (**rouge** `#E30613`) et du bâtiment (**cyan** `#2DD4BF`)
- **Typographie** : Inter (UI) + Playfair Display (titres) + Geist Mono
- **Multilingue** : 🇫🇷 Français · 🇮🇹 Italien

## 🛠️ Stack technique

| Couche | Technologie |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript, React 19) |
| Style | Tailwind CSS v4 + shadcn/ui |
| Animations | Framer Motion |
| BDD | **Supabase Postgres** (eu-west-1) — un schéma par app · **Google Sheets** pour la logistique et en secours |
| Auth | Auth.js v5 (NextAuth), sessions JWT, bcrypt (12 tours) |
| Chiffrement | AES-256-GCM (node:crypto) |
| Validation | Zod |
| Tests | Vitest |
| i18n | maison (`src/lib/i18n`) + JSON messages FR/IT |
| Déploiement | Vercel (build bloquant si les types ne passent pas) |

Chaque app migrée garde son **interrupteur de retour arrière** (`PHARMACIE_BACKEND`,
`LOGISTIQUE_SUPABASE_TABS`) : Google Sheets reste le filet de secours.
Voir [.env.example](.env.example) pour les 16 variables et leur rôle.

## 👥 Rôles

**Dans la Logistique :**

| Rôle | Lecture | Voir MDP | Écriture | Corbeille | Users |
|---|:-:|:-:|:-:|:-:|:-:|
| 👑 **Administrateur** | ✅ | ✅ | ✅ | ✅ | ✅ |
| 🛠 **Informaticien** | ✅ | ✅ | ✅ | ❌ | ❌ |
| 🏛 **Direction** | ✅ | ✅ | ❌ | ❌ | ❌ |
| 📦 **Responsable logistique** | ✅ | ❌ | ✅ | ❌ | ❌ |
| 💊 **Pharmacien** | ❌ | ❌ | ❌ | ❌ | ❌ |

**Accès aux applications :**

| Rôle | Logistique | Pharmacie | Patients |
|---|:-:|:-:|:-:|
| 👑 Administrateur | ✅ | ✅ | ✅ |
| 🏛 Direction | ✅ | ✅ | ✅ |
| 🛠 Informaticien | ✅ | ❌ | ❌ |
| 📦 Logistique | ✅ | ❌ | ❌ |
| 💊 Pharmacien | ❌ | ✅ | ❌ |

L'app **Patients** est réservée à l'administration et à la direction : ce sont
des données de santé (RGPD art. 9), et **chaque consultation d'un dossier est
journalisée** (`patients.acces_log`). Toute consultation d'un mot de passe
machine l'est aussi (`audit_log`).

La source de vérité des droits est [src/lib/auth/permissions.ts](src/lib/auth/permissions.ts).

## 🚀 Démarrage local

```bash
npm install
cp .env.example .env.local      # remplir les variables (voir guide Phase 1)
npm run dev                     # http://localhost:3000
```

## ⚙️ Configuration Google Cloud + Sheet

👉 Suivre le guide pas-à-pas : [`docs/PHASE1-GCP.md`](docs/PHASE1-GCP.md)

Le script Apps Script [`scripts/google-sheet-setup.gs`](scripts/google-sheet-setup.gs) crée automatiquement les **10 onglets** du Sheet avec en-têtes formatés et données seed (sites REX/MIARAKA, 15 salles, 4 entrées réseau).

## 📊 Structure du Google Sheet

| Onglet | Rôle |
|---|---|
| `config` | Paramètres globaux |
| `users` | Utilisateurs de l'app (4 rôles) |
| `sites` | Centres (REX, MIARAKA, ...) |
| `rooms` | Salles par site |
| `materials` | Parc matériel (~222 entrées) |
| `sessions` | Sessions PC (MDP chiffrés AES) |
| `movements` | Transferts / historique |
| `trash` | Soft delete (admin only) |
| `audit_log` | Qui a vu quel MDP, quand |
| `network` | Wifi, box, switches |

## 📋 Phases de développement

- [x] **Phase 0** · Setup Next.js + design system liquid glass + GitHub + Vercel
- [x] **Phase 1** · Guide GCP + structure Google Sheet ([guide](docs/PHASE1-GCP.md))
- [x] **Phase 2** · Auth.js + 4 rôles + middleware
- [x] **Phase 3** · CRUD matériels (sites → salles → fiche)
- [x] **Phase 4** · Chiffrement AES MDP + audit log
- [x] **Phase 5** · Dashboard Direction (KPIs + obsolescence + budget + export CSV)
- [x] **Phase 6** · Historique mouvements / transferts (timeline + transferts site/salle/affectation)
- [x] **Phase 7** · Corbeille (restore + hard delete) + admin utilisateurs (invite, rôles, MDP)
- [x] **Phase 8** · i18n FR/IT (foundation + /settings + surfaces principales)
- [x] **Phase 9** · Polish (QR codes + mobile sidebar + animations dashboard)
- [x] **Phase 10** · Monitoring (`/api/health`, logger, error boundary) + guide domaine custom

## 📁 Structure des dossiers

```
src/
├── app/                   Pages Next.js (App Router)
│   ├── login/            Connexion
│   └── page.tsx          Landing vitrine
├── components/
│   ├── glass/            Primitives liquid glass (GlassCard, GlassButton)
│   ├── layout/           BrandLogo, ThemeToggle, LanguageSwitcher
│   ├── materials/        Composants métier matériel
│   ├── providers/        ThemeProvider
│   └── ui/               shadcn/ui
├── lib/
│   ├── auth/             Permissions (4 rôles)
│   ├── crypto/           AES-256-GCM
│   ├── i18n/             Messages FR / IT
│   ├── sheets/           Google Sheets API client
│   ├── obsolescence.ts   Algorithme de scoring
│   └── utils.ts
├── types/                Zod schemas + types
└── middleware.ts         (à venir Phase 2)

docs/                     Guides utilisateur
└── PHASE1-GCP.md        Setup Google Cloud + Sheet

scripts/                  Scripts d'automatisation
└── google-sheet-setup.gs  Apps Script de création des onglets
```

## 📸 Données sources

L'app est construite à partir de l'inventaire réel du Centre REX :
- **222 matériels** inventoriés (informatique, imprimantes, routeurs, téléphones…)
- **14 salles** REX + Centre MIARAKA Ambatolahikosoa
- **48 personnels** avec mails professionnels
- Système de MDP à comptes multiples (1 admin + N sessions utilisateurs par ordinateur)

---

© La Vita Per Te · ONG-ODV Alfeo Corassori · Fianarantsoa, Madagascar
