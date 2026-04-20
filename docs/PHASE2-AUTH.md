# 🔐 Phase 2 — Authentification + 4 rôles

> Système complet basé sur **Auth.js v5** + **bcrypt** + **Google Sheets** comme base utilisateurs.

## 🏗️ Architecture

```
src/
├── auth.config.ts    ← Edge-safe (imports légers, pas de bcrypt/Sheets)
├── auth.ts           ← Node-only (bcrypt + Credentials provider + Sheets)
├── middleware.ts     ← Edge — utilise authConfig pour protéger les routes
└── app/
    ├── (app)/        ← Route group protégé (sidebar + topbar)
    │   ├── layout.tsx          → vérifie session + sidebar
    │   ├── dashboard/page.tsx
    │   ├── sites|materials|movements|users|trash|audit|settings/page.tsx
    │   └── _stub.tsx           → composant placeholder (privé)
    ├── login/
    │   ├── page.tsx            → formulaire avec useActionState
    │   └── actions.ts          → server action signIn + audit
    ├── setup/
    │   ├── page.tsx            → première config MDP admin
    │   └── actions.ts          → server action setupAdmin
    └── api/auth/[...nextauth]/route.ts  → handlers NextAuth
```

### Pourquoi splitter `auth.config.ts` et `auth.ts` ?

Le middleware Next.js s'exécute en **Edge runtime** (V8 isolé, pas de Node.js complet). Or :
- `bcryptjs` utilise des APIs Node natives
- `googleapis` (pour lire le Sheet) idem

→ On garde le middleware léger : il vérifie juste la **présence + validité du JWT** via `authConfig` (callbacks `authorized`, `jwt`, `session`).
Le provider `Credentials` (qui appelle `getUserByEmail` et `bcrypt.compare`) vit dans `auth.ts` (runtime Node), utilisé seulement par les Server Actions et l'API route.

## 🚦 Flux de connexion

1. Utilisateur arrive sur `/login`
2. Saisit email + mot de passe → soumet le formulaire
3. Server Action `loginAction` :
   - Appelle `signIn("credentials", { email, password, redirect: false })`
   - Le provider `Credentials.authorize` :
     - lit l'utilisateur dans le Sheet `users`
     - vérifie `active === true`
     - vérifie `bcrypt.compare(password, passwordHash)`
     - met à jour `lastLoginAt` (best-effort)
     - retourne `{ id, email, name, role, lang }`
4. JWT créé avec `role` et `lang` injectés
5. Cookie session posé
6. Audit log écrit (`login` action)
7. Redirection client vers `/dashboard`

## 🛡️ Protection des routes (middleware)

```ts
// src/auth.config.ts (extrait)
authorized: async ({ auth, request }) => {
  const { pathname } = request.nextUrl;
  const isPublic = ["/", "/login", "/setup"].includes(pathname)
    || pathname.startsWith("/api/auth");
  if (isPublic) return true;
  return !!auth?.user; // sinon redirect vers /login
}
```

Pour les routes admin-only (`/users`, `/trash`, `/audit`), une vérification supplémentaire en début de page :

```ts
const session = await auth();
if (session?.user.role !== "admin") redirect("/dashboard");
```

## 🔑 Première connexion (page /setup)

Le seed du Sheet contient un compte avec `passwordHash = "TO_SET_IN_PHASE_2"`.

L'utilisateur va sur `/setup`, saisit :
- son email (déjà présent dans le Sheet `users`)
- un nouveau MDP (≥ 8 chars, 1 lettre, 1 chiffre)
- confirmation

Le serveur :
- vérifie que le compte existe et que `passwordHash === "TO_SET_IN_PHASE_2"`
- hache le MDP avec `bcrypt` (rounds=12)
- met à jour la ligne dans le Sheet
- redirige vers `/login`

## 👤 Matrice des permissions (4 rôles)

Définie dans `src/lib/auth/permissions.ts` :

| Permission | Admin | Informaticien | Direction | Logistique |
|---|:-:|:-:|:-:|:-:|
| `parc:read` | ✅ | ✅ | ✅ | ✅ |
| `password:reveal` | ✅ | ✅ | ✅ | ❌ |
| `material:create/update/delete` | ✅ | ✅ | ❌ | ✅ |
| `material:restore` (corbeille) | ✅ | ❌ | ❌ | ❌ |
| `audit:read` | ✅ | ❌ | ❌ | ❌ |
| `user:invite/update` | ✅ | ❌ | ❌ | ❌ |

Usage côté code :
```ts
import { can } from "@/lib/auth/permissions";

if (can(session.user.role, "password:reveal")) {
  // afficher le bouton "Voir MDP"
}
```

## 📊 Audit log

Toutes les actions sensibles sont enregistrées dans l'onglet `audit_log` du Sheet :
- `login`, `logout` (auto)
- `view_password` (Phase 4 : à chaque révélation MDP)
- `edit_material`, `delete_material`, `restore_material` (Phase 3+)
- `invite_user` (Phase 7)

Champs : `id`, `userId`, `userEmail`, `action`, `targetType`, `targetId`, `details`, `ip`, `userAgent`, `timestamp`

## 🎨 UX

- **Login** : carte glass premium centrée, formulaire avec icônes Mail/Lock, bouton CTA rouge avec shimmer animé, message d'erreur en rouge avec icône
- **Setup** : badge "Première configuration" + champs avec validation côté serveur, message de succès vert avec CTA "Aller à la connexion"
- **App layout** : sidebar gauche (256px) avec navigation filtrée par rôle + topbar avec menu utilisateur (avatar + dropdown)
- **User menu** : nom + rôle visibles, dropdown avec mode sombre/clair, langue, bouton déconnexion (rouge)

## 🧪 Tester en local

```bash
# 1. Récupérer le code
git pull
npm install

# 2. Configurer .env.local (cf. .env.example)
cp .env.example .env.local
# Remplir : GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL,
#           GOOGLE_PRIVATE_KEY, AUTH_SECRET, ENCRYPTION_SECRET

# 3. Démarrer
npm run dev

# 4. Tester :
# - http://localhost:3000              → landing
# - http://localhost:3000/setup        → définir le MDP du compte admin du Sheet
# - http://localhost:3000/login        → se connecter
# - http://localhost:3000/dashboard    → ← protégé, doit rediriger si pas connecté
```

## ✅ Checklist Phase 2

- [x] Auth.js v5 configuré (split edge/node)
- [x] Provider Credentials avec bcrypt
- [x] Middleware de protection des routes
- [x] Page `/login` fonctionnelle avec server action
- [x] Page `/setup` pour première configuration admin
- [x] Layout `(app)` protégé avec sidebar + topbar
- [x] Filtre des items de navigation par rôle
- [x] Page `/dashboard` placeholder
- [x] 7 stubs de pages (sites, materials, movements, users, trash, audit, settings)
- [x] Audit log au login/logout
- [x] User menu avec déconnexion
- [x] Build Next.js OK

## ➡️ Phase 3 (suivante)

CRUD complet des matériels (sites → salles → liste → fiche détaillée), avec :
- Affichage de tous les matériels par salle
- Filtre/recherche
- Fiche détaillée premium (Apple-style)
- Création / édition / soft delete
- Import des 222 matériels depuis le fichier Excel REX (script `scripts/import-inventory.mjs`)
