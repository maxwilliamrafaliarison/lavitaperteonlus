# 🏥 La Vita Per Te — Tableau de bord Parc Informatique

> Application de gestion du parc informatique du **Centre REX Fianarantsoa** et du **Centre MIARAKA** — ONG-ODV Alfeo Corassori, Madagascar.

🌐 **En production** : https://lavitaperteonlus.vercel.app

Inventaire centralisé, fiches détaillées, détection d'obsolescence automatique, historique des mouvements et gestion sécurisée des mots de passe — pensé pour la direction (outil décisionnel) et les équipes (visibilité du parc).

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
| BDD | Google Sheets API v4 |
| Auth | Auth.js v5 (NextAuth) |
| Chiffrement | AES-256-GCM (node:crypto) |
| Validation | Zod |
| i18n | next-intl + JSON messages |
| Déploiement | Vercel |

## 👥 Rôles

| Rôle | Lecture | Voir MDP | Écriture | Corbeille | Users |
|---|:-:|:-:|:-:|:-:|:-:|
| 👑 **Administrateur** | ✅ | ✅ | ✅ | ✅ | ✅ |
| 🛠 **Informaticien** | ✅ | ✅ | ✅ | ❌ | ❌ |
| 🏛 **Direction** | ✅ | ✅ | ❌ | ❌ | ❌ |
| 📦 **Responsable logistique** | ✅ | ❌ | ✅ | ❌ | ❌ |

Toute consultation de MDP est enregistrée dans le journal d'audit (`audit_log`).

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
- [ ] **Phase 10** · Monitoring + custom domain

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
