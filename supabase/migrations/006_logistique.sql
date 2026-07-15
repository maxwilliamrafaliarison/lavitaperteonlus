-- ============================================================
-- Migration 006 — Schéma LOGISTIQUE (parc matériel + authentification)
--
-- Crée les tables. N'active RIEN : le code continue de lire Google Sheets
-- tant que le flag de bascule n'est pas posé. Aucune donnée n'est copiée
-- ici (voir le script de migration dédié).
--
-- ⚠️ CE SCHÉMA PORTE L'AUTHENTIFICATION DE TOUTES LES APPS. Une erreur ici
--    ne casse pas que la logistique : elle empêche de se connecter à la
--    pharmacie et aux patients aussi.
--
-- ── TROIS RÈGLES, ET LEURS RAISONS ──────────────────────────────────────
--
-- 1. LES NOMS DE COLONNES SONT CEUX DES EN-TÊTES DU SHEET, camelCase
--    QUOTÉ ("passwordHash", "siteId"). Sans guillemets, Postgres replierait
--    en minuscules et PostgREST renverrait `passwordhash` — que le code lit
--    comme `undefined`. Un mot de passe undefined, c'est un compte
--    inaccessible, sans la moindre erreur. Les guillemets ne sont pas un
--    détail de style ici.
--
-- 2. TEXTE EN `not null default ''`. Zod rejette null sur un champ texte et
--    les lecteurs écartent silencieusement les lignes invalides : c'est ce
--    qui a fait disparaître 18 produits sur 65 côté pharmacie. Ici un null
--    explicite échoue BRUYAMMENT en 23502 — sur l'authentification, on
--    préfère mille fois l'échec au silence.
--
-- 3. `users.active` EST `boolean not null` SANS DEFAULT. Un `default true`
--    réactiverait en silence un compte désactivé si une écriture omettait
--    la colonne ; un `default false` enfermerait quelqu'un dehors. Sans
--    défaut, l'insertion échoue et dit ce qui manque.
--
-- Volumétrie constatée le 15/07/2026 : 6 users, 2 sites, 20 rooms,
-- 260 materials, 23 sessions, 114 movements, 411 audit_log.
-- ============================================================

create schema if not exists logistique;

-- --- Authentification -----------------------------------------------------
create table if not exists logistique.users (
  id             text primary key,
  email          text not null default '',
  "passwordHash" text not null default '',
  name           text not null default '',
  role           text not null default 'logistique',
  lang           text not null default 'fr',
  -- Sans default : voir la règle 3 en tête de fichier.
  active         boolean not null,
  "createdAt"    text not null default '',
  "lastLoginAt"  text not null default '',
  "invitedBy"    text not null default ''
);

-- Volontairement PAS d'index unique sur l'email au départ : les 6 emails
-- sont uniques aujourd'hui (vérifié), mais une contrainte qui rejette une
-- écriture d'authentification est un risque qu'on n'ajoute pas le jour de
-- la bascule. À poser une fois le backend stabilisé.
create index if not exists users_email_idx on logistique.users (lower(email));

-- --- Référentiel des lieux ------------------------------------------------
create table if not exists logistique.sites (
  id      text primary key,
  code    text not null default '',
  name    text not null default '',
  city    text not null default '',
  address text not null default '',
  active  boolean not null default true
);

create table if not exists logistique.rooms (
  id        text primary key,
  "siteId"  text not null default '',
  code      text not null default '',
  name      text not null default '',
  floor     text not null default '',
  service   text not null default '',
  "ipRange" text not null default ''
);

-- --- Parc matériel (33 colonnes, ordre du Sheet) --------------------------
create table if not exists logistique.materials (
  id               text primary key,
  ref              text not null default '',
  type             text not null default 'autre',
  designation      text not null default '',
  brand            text not null default '',
  model            text not null default '',
  "serialNumber"   text not null default '',
  "siteId"         text not null default '',
  "roomId"         text not null default '',
  service          text not null default '',
  owner            text not null default '',
  "assignedTo"     text not null default '',
  "purchaseDate"   text not null default '',
  -- Nullable : « prix inconnu » et « gratuit » ne sont pas la même chose.
  "purchasePrice"  numeric,
  amortization     text not null default '',
  os               text not null default '',
  cpu              text not null default '',
  ram              text not null default '',
  storage          text not null default '',
  "ipAddress"      text not null default '',
  "macAddress"     text not null default '',
  -- Nullable À DESSEIN : le lecteur renvoie undefined sur une cellule vide.
  -- Trois états distincts — oui / non / on ne sait pas.
  "internetAccess" boolean,
  "linkedToBDD"    boolean,
  state            text not null default 'operationnel',
  notes            text not null default '',
  photos           text not null default '',
  "quantity2023"   numeric,
  "quantity2024"   numeric,
  "quantity2025"   numeric,
  "createdAt"      text not null default '',
  "updatedAt"      text not null default '',
  -- Suppression douce : vide = vivant. Pas de null, pour rester aligné
  -- sur le Sheet où la cellule est vide.
  "deletedAt"      text not null default '',
  -- Absent des commentaires du code, bien présent dans le Sheet (33e colonne).
  "biosDate"       text not null default ''
);

create index if not exists materials_site_idx on logistique.materials ("siteId");
create index if not exists materials_room_idx on logistique.materials ("roomId");
create index if not exists materials_deleted_idx on logistique.materials ("deletedAt");

-- --- Sessions (mots de passe des machines) --------------------------------
-- Les mots de passe sont chiffrés en AES-256-GCM côté application, avec
-- ENCRYPTION_SECRET. Cette base ne voit que du chiffré, et le triplet
-- (encryptedPassword, passwordIv, passwordTag) est indissociable : perdre
-- une seule de ces colonnes rend le mot de passe irrécupérable.
create table if not exists logistique.sessions (
  id                  text primary key,
  "materialId"        text not null default '',
  "sessionName"       text not null default '',
  "encryptedPassword" text not null default '',
  "passwordIv"        text not null default '',
  "passwordTag"       text not null default '',
  "assignedUser"      text not null default '',
  "isAdmin"           boolean not null default false,
  notes               text not null default '',
  "createdAt"         text not null default '',
  "updatedAt"         text not null default ''
);

create index if not exists sessions_material_idx on logistique.sessions ("materialId");

-- --- Historique des mouvements de matériel --------------------------------
create table if not exists logistique.movements (
  id               text primary key,
  "materialId"     text not null default '',
  type             text not null default 'creation',
  "fromSiteId"     text not null default '',
  "fromRoomId"     text not null default '',
  "fromAssignedTo" text not null default '',
  "toSiteId"       text not null default '',
  "toRoomId"       text not null default '',
  "toAssignedTo"   text not null default '',
  "byUserId"       text not null default '',
  reason           text not null default '',
  date             text not null default ''
);

create index if not exists movements_material_idx on logistique.movements ("materialId");
create index if not exists movements_date_idx on logistique.movements (date);

-- --- Journal d'audit ------------------------------------------------------
create table if not exists logistique.audit_log (
  id           text primary key,
  "userId"     text not null default '',
  "userEmail"  text not null default '',
  action       text not null default '',
  "targetType" text not null default '',
  "targetId"   text not null default '',
  details      text not null default '',
  ip           text not null default '',
  "userAgent"  text not null default '',
  timestamp    text not null default ''
);

create index if not exists audit_ts_idx on logistique.audit_log (timestamp);

-- --- Divers ---------------------------------------------------------------
create table if not exists logistique.config (
  -- Cet onglet n'a pas de colonne id : la clé EST l'identifiant.
  key         text primary key,
  value       text not null default '',
  description text not null default ''
);

create table if not exists logistique.trash (
  id              text primary key,
  "originalSheet" text not null default '',
  "originalId"    text not null default '',
  snapshot        text not null default '',
  "deletedBy"     text not null default '',
  "deletedAt"     text not null default '',
  reason          text not null default ''
);

create table if not exists logistique.network (
  id                  text primary key,
  "siteId"            text not null default '',
  "roomId"            text not null default '',
  type                text not null default '',
  name                text not null default '',
  "encryptedPassword" text not null default '',
  "passwordIv"        text not null default '',
  "passwordTag"       text not null default '',
  "ipAddress"         text not null default '',
  notes               text not null default ''
);

-- ── AUCUNE CLÉ ÉTRANGÈRE ──────────────────────────────────────────────────
-- Volontaire. hardDeleteMaterial() supprime un matériel en laissant ses
-- mouvements par choix de conception (traçabilité), et un mouvement orphelin
-- existe déjà dans les données. Une FK ferait échouer la copie des données
-- sur une donnée que l'application considère comme normale.

-- --- Sécurité : RLS actif, aucune policy = accès serveur seul -------------
alter table logistique.users enable row level security;
alter table logistique.sites enable row level security;
alter table logistique.rooms enable row level security;
alter table logistique.materials enable row level security;
alter table logistique.sessions enable row level security;
alter table logistique.movements enable row level security;
alter table logistique.audit_log enable row level security;
alter table logistique.config enable row level security;
alter table logistique.trash enable row level security;
alter table logistique.network enable row level security;

grant usage on schema logistique to service_role;
grant all on all tables in schema logistique to service_role;
alter default privileges in schema logistique grant all on tables to service_role;

-- Ceinture : ces rôles ne doivent jamais approcher les hachages de mots de
-- passe ni les sessions chiffrées, même si une policy était ajoutée par
-- erreur un jour.
revoke all on all tables in schema logistique from anon, authenticated;
revoke usage on schema logistique from anon, authenticated;

-- Contrôle post-migration : 10 tables, toutes vides.
--   select table_name, (xpath('/row/c/text()',
--          query_to_xml(format('select count(*) c from logistique.%I', table_name),
--          false, true, '')))[1]::text::int as lignes
--     from information_schema.tables where table_schema = 'logistique'
--    order by table_name;
