-- Migration 003 — Pharmacie (convergence Google Sheets → Supabase)
-- Schéma dédié pharmacie. Types : text pour ids/dates/horodatages
-- (l'app écrit et compare des chaînes ISO), numeric pour prix/quantités.
-- Architecture append-only conservée : le stock reste la somme des
-- mouvements (jamais une cellule modifiée). À exécuter dans le SQL Editor.

create schema if not exists pharmacie;

create table if not exists pharmacie.produits (
  id text primary key,
  code text,
  designation text not null,
  dci text,
  classe text,
  forme text,
  dosage text,
  conditionnement text,
  prix_achat numeric default 0,
  prix_vente numeric default 0,
  prix_unitaire numeric default 0,
  stock_min numeric default 0,
  fournisseur text,
  emplacement text,
  statut text default 'actif',
  "createdAt" text
);

create table if not exists pharmacie.lots (
  id text primary key,
  produit_id text,
  numero_lot text,
  date_expiration text,
  date_reception text
);

create table if not exists pharmacie.mouvements (
  id text primary key,
  timestamp text,
  produit_id text,
  lot_id text,
  type text,
  quantite numeric,        -- SIGNÉE : entrée/retour > 0, vente/perte < 0
  prix_unitaire numeric default 0,
  reference text,
  user_email text,
  note text
);

create table if not exists pharmacie.ventes (
  id text primary key,
  timestamp text,
  client_nom text,
  type_vente text,
  total numeric default 0,
  operateur_email text,
  statut text
);

create table if not exists pharmacie.lignes_vente (
  id text primary key,
  vente_id text,
  produit_id text,
  lot_id text,
  quantite numeric,
  prix_unitaire numeric default 0,
  sous_total numeric default 0
);

create table if not exists pharmacie.fournisseurs (
  id text primary key,
  nom text,
  telephone text,
  email text,
  adresse text
);

create table if not exists pharmacie.parametres (
  cle text primary key,
  valeur text
);

-- Index de lecture fréquents (stock par produit, lignes par vente)
create index if not exists mouvements_produit_idx on pharmacie.mouvements (produit_id);
create index if not exists lots_produit_idx on pharmacie.lots (produit_id);
create index if not exists lignes_vente_vente_idx on pharmacie.lignes_vente (vente_id);
create index if not exists ventes_ts_idx on pharmacie.ventes (timestamp);

-- Sécurité : RLS actif, aucune policy = accès serveur (service_role) seul.
alter table pharmacie.produits enable row level security;
alter table pharmacie.lots enable row level security;
alter table pharmacie.mouvements enable row level security;
alter table pharmacie.ventes enable row level security;
alter table pharmacie.lignes_vente enable row level security;
alter table pharmacie.fournisseurs enable row level security;
alter table pharmacie.parametres enable row level security;

grant usage on schema pharmacie to service_role;
grant all on all tables in schema pharmacie to service_role;
alter default privileges in schema pharmacie grant all on tables to service_role;
