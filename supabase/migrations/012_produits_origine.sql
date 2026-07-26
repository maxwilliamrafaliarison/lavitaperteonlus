-- ============================================================
-- Migration 012 — Pharmacie : origine des produits (labo galénique)
--
-- Distingue les PRÉPARATIONS OFFICINALES du laboratoire galénique
-- (fabriquées en interne) des spécialités pharmaceutiques industrielles,
-- sans rien changer à la vente ni au stock. Colonne texte, NOT NULL,
-- défaut '' (spécialité) ; 'galenique' pour une préparation maison.
--
-- Additive et inerte : les 70 produits existants restent origine '' et se
-- comportent exactement comme avant.
-- ============================================================

alter table pharmacie.produits
  add column if not exists origine text not null default '';

-- Index partiel : les préparations galéniques sont une minorité qu'on
-- filtre souvent (rapport dédié, pastille) — l'index les cible sans peser
-- sur le reste du catalogue.
create index if not exists produits_origine_idx
  on pharmacie.produits (origine)
  where origine <> '';
