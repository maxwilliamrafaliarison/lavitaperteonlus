-- ============================================================
-- Migration 009 — Pharmacie : compartiments GROS/DÉTAIL, PEC, achats
--
-- Strictement ADDITIVE et INERTE. Aucune ligne existante n'est réécrite,
-- aucun comportement ne change tant que le code FEFO (tranches suivantes)
-- n'est pas déployé. Les 65 produits, 70 mouvements et 65 lots restent
-- valides au bit près.
--
-- ── LE PIVOT : mouvements.compartiment ──────────────────────────────────
-- Le stock reste la somme des mouvements (append-only, invariant sacré).
-- On ajoute UNE dimension : chaque mouvement est en GROS (réserve, boîtes
-- fermées) ou en DÉTAIL (rayon, unités ouvertes). Alors :
--   stock(produit, lot, compartiment) = Σ mouvements.quantite du sous-ensemble.
-- Aucune colonne de quantité sur `lots` — ce serait la cellule mutable que
-- l'invariant interdit.
--
-- Ordre de déploiement IMPÉRATIF : ce schéma AVANT le backfill (011) AVANT
-- le code FEFO. Sinon compartiment prend son DEFAULT et une vente au détail
-- serait mal restockée.
-- ============================================================

-- 1. Compartiment sur les mouvements. DEFAULT 'gros' : les 70 mouvements
--    existants deviennent tous GROS, la somme par produit est identique.
alter table pharmacie.mouvements
  add column if not exists compartiment text not null default 'gros';

-- 2. Contenance sur les lots (registre des entrées : boîte/flacon/tube/autre).
alter table pharmacie.lots
  add column if not exists contenance text not null default '';

-- 3. Prise en charge sur l'en-tête de vente.
--    valeur_pec : la valeur catalogue d'une vente PEC (facturée 0 Ar au
--    client), pour que les rapports la retrouvent sans recalcul.
alter table pharmacie.ventes
  add column if not exists pec_payeur text not null default '',
  add column if not exists valeur_pec numeric not null default 0;

-- 4. Normaliser type_vente AVANT de poser la contrainte (toutes les ventes
--    existantes valent 'cash', mais on ne suppose rien).
update pharmacie.ventes
   set type_vente = 'cash'
 where type_vente is null or type_vente not in ('cash', 'pec');

-- 5. Contraintes métier.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ventes_type_chk') then
    alter table pharmacie.ventes
      add constraint ventes_type_chk check (type_vente in ('cash', 'pec'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'mouvements_compartiment_chk') then
    alter table pharmacie.mouvements
      add constraint mouvements_compartiment_chk check (compartiment in ('gros', 'detail'));
  end if;
  -- 'transfert' rejoint les types autorisés (ouvrir une boîte GROS→DÉTAIL).
  if not exists (select 1 from pg_constraint where conname = 'mouvements_type_chk') then
    alter table pharmacie.mouvements
      add constraint mouvements_type_chk check (
        type in ('entree', 'vente', 'ajustement', 'retour', 'perte', 'destruction', 'transfert')
      );
  end if;
end $$;

-- 6. Index de l'agrégation FEFO (stock par produit × lot × compartiment).
create index if not exists mouvements_lot_comp_idx
  on pharmacie.mouvements (produit_id, lot_id, compartiment);

-- 7. Registre des entrées / achats fournisseurs.
create table if not exists pharmacie.achats (
  id               text primary key,
  timestamp        text not null default '',
  date_facture     text not null default '',
  fournisseur      text not null default '',
  num_facture      text not null default '',
  num_bl           text not null default '',
  montant_total    numeric not null default 0,
  operateur_email  text not null default '',
  statut           text not null default 'valide',
  note             text not null default ''
);

create table if not exists pharmacie.achats_lignes (
  id              text primary key,
  achat_id        text not null default '',
  produit_id      text not null default '',
  designation     text not null default '',
  contenance      text not null default '',
  quantite        numeric not null default 0,
  date_expiration text not null default '',
  numero_lot      text not null default '',
  montant         numeric not null default 0
);
create index if not exists achats_lignes_achat_idx on pharmacie.achats_lignes (achat_id);

-- 8. Entités de prise en charge — liste SUGGÉRÉE au comptoir. La colonne
--    ventes.pec_payeur reste du texte libre : on peut saisir un nom ou une
--    enseigne hors liste sans migration.
create table if not exists pharmacie.entites_pec (
  id    text primary key,
  nom   text not null default '',
  actif boolean not null default true
);
insert into pharmacie.entites_pec (id, nom) values
  ('pec_miaraka', 'Miaraka'),
  ('pec_ilena',   'Ilena')
on conflict (id) do nothing;

-- 9. Fournisseurs de référence (la table existe depuis 003, jamais alimentée).
insert into pharmacie.fournisseurs (id, nom) values
  ('four_pharmatek', 'Pharmatek'),
  ('four_medico',    'Médico'),
  ('four_sopharmad', 'Sopharmad'),
  ('four_salama',    'Salama')
on conflict (id) do nothing;

-- 10. Écriture d'un paramètre (upsert) — aucun chemin d'écriture de la table
--     parametres n'existe aujourd'hui (listParametres est en lecture seule).
--     Sert à l'option TVA réservée admin (tranche T7).
create or replace function pharmacie.set_parametre(p_cle text, p_valeur text)
returns void
language plpgsql
security definer
set search_path = pharmacie, pg_temp
as $$
begin
  insert into pharmacie.parametres (cle, valeur)
  values (p_cle, p_valeur)
  on conflict (cle) do update set valeur = excluded.valeur;
end $$;

-- 11. Sécurité : RLS actif, accès service_role seul (comme le reste du schéma).
alter table pharmacie.achats       enable row level security;
alter table pharmacie.achats_lignes enable row level security;
alter table pharmacie.entites_pec  enable row level security;

grant all on pharmacie.achats        to service_role;
grant all on pharmacie.achats_lignes to service_role;
grant all on pharmacie.entites_pec   to service_role;

revoke all on function pharmacie.set_parametre(text, text) from public, anon, authenticated;
grant execute on function pharmacie.set_parametre(text, text) to service_role;

-- Contrôle : doit renvoyer 65 produits, 70 mouvements (tous 'gros'), 2 PEC, 4 fournisseurs.
--   select
--     (select count(*) from pharmacie.produits)                              as produits,
--     (select count(*) from pharmacie.mouvements)                            as mouvements,
--     (select count(*) from pharmacie.mouvements where compartiment='gros')  as gros,
--     (select count(*) from pharmacie.entites_pec)                           as pec,
--     (select count(*) from pharmacie.fournisseurs)                          as fournisseurs;
