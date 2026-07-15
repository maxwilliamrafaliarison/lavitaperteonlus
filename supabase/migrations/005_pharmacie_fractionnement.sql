-- ============================================================
-- Migration 005 — Pharmacie : FRACTIONNEMENT (vente à la boîte ou à l'unité)
--
-- Strictement ADDITIVE et INERTE : aucune ligne existante n'est réécrite,
-- et le comportement de l'application ne change pas tant qu'aucun produit
-- n'est déclaré fractionnable.
--
-- ── L'INVARIANT, à ne jamais enfreindre ─────────────────────────────────
-- `mouvements.quantite`, `produits.stock_min` et le stock qui en découle
-- sont TOUS exprimés dans la même unité : l'unité de base du produit.
-- `facteur_conversion` = nombre d'unités de base par boîte (>= 1).
-- Un produit est fractionnable SSI facteur_conversion > 1 (pas de drapeau
-- redondant : le stock ne dépend QUE de ce nombre, jamais d'un prix ni
-- d'un libellé — sinon vider un prix réinterpréterait 600 comprimés en
-- 600 boîtes).
--
-- Avec facteur_conversion = 1 partout (le défaut), l'unité de base EST la
-- boîte : les 65 produits et tout l'historique des mouvements gardent leur
-- sens exact, sans une ligne réécrite.
--
-- ── DEUX PIÈGES ÉVITÉS ICI ──────────────────────────────────────────────
-- 1. NOT NULL DEFAULT '' sur les colonnes TEXTE. Un simple
--    `add column unite_detail text` laisserait NULL sur les 65 lignes.
--    C'est exactement ce qui a fait disparaître 18 produits sur 65 le
--    15/07/2026 (Zod rejette null, listProduits() filtre en silence).
--    Les colonnes numériques sont sûres : Number(null) === 0.
-- 2. AJOUT EN FIN DE TABLE, jamais d'insertion : updateProduitFieldsSheets
--    mappe les colonnes par LETTRE en dur (prix_achat: "I"…). Insérer une
--    colonne avant la fin décalerait tout et écrirait dans les mauvaises
--    cellules SANS lever la moindre erreur.
-- ============================================================

alter table pharmacie.produits
  add column if not exists facteur_conversion numeric not null default 1,   -- Q
  add column if not exists unite_detail       text    not null default '',  -- R
  add column if not exists prix_vente_detail  numeric not null default 0;   -- S

alter table pharmacie.mouvements
  -- AUDIT ET AFFICHAGE SEULEMENT. `quantite` reste la seule source du
  -- stock, toujours en unités de base. Se servir de ces colonnes dans un
  -- calcul de stock recréerait la dette qu'on a relevée chez Eugenio.
  add column if not exists unite_saisie     text    not null default 'boite', -- K
  add column if not exists facteur_applique numeric not null default 1;      -- L

alter table pharmacie.lignes_vente
  -- `quantite` reste dans l'unité DU MODE choisi (2 = 2 boîtes ou 2 comprimés).
  -- `qte_stock_deduire` porte la quantité en unités de base réellement sortie.
  add column if not exists mode_vente        text    not null default 'boite', -- H
  add column if not exists qte_stock_deduire numeric;                          -- I

-- Historique : tout a été vendu à la boîte avec un facteur de 1,
-- donc la quantité déduite est égale à la quantité vendue.
update pharmacie.lignes_vente
   set qte_stock_deduire = quantite
 where qte_stock_deduire is null;

alter table pharmacie.lignes_vente
  alter column qte_stock_deduire set not null;

-- Contraintes métier. Le code reste la vraie garde (ces contrôles n'existent
-- pas côté Google Sheets, qui demeure le filet de secours) — la base est la
-- ceinture par-dessus les bretelles.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'produits_facteur_chk') then
    alter table pharmacie.produits add constraint produits_facteur_chk check (
      facteur_conversion >= 1
      and (facteur_conversion = 1 or (unite_detail <> '' and prix_vente_detail >= 0))
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'mouvements_unite_chk') then
    alter table pharmacie.mouvements
      add constraint mouvements_unite_chk check (unite_saisie in ('boite', 'detail'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lignes_vente_mode_chk') then
    alter table pharmacie.lignes_vente
      add constraint lignes_vente_mode_chk check (mode_vente in ('boite', 'detail'));
  end if;
end $$;

-- Contrôle post-migration : doit renvoyer 65 et 65 (tous neutres).
-- select count(*) as total,
--        count(*) filter (where facteur_conversion = 1) as neutres
--   from pharmacie.produits;
