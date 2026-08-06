-- ============================================================
-- DEVIS (PROFORMA) — trace des estimations remises au comptoir
-- ============================================================
--
-- Un devis ne produit AUCUNE écriture : ni vente, ni mouvement de stock.
-- Cette table ne sert donc pas la comptabilité mais le pilotage : savoir
-- combien de patients repartent avec un prix, et combien reviennent
-- acheter. C'est le taux de transformation, et il se mesure mal de tête.
--
-- Le détail des lignes est figé en JSON plutôt que relié aux produits :
-- un devis constate un PRIX À UN INSTANT. Si le tarif change ou si le
-- produit est archivé, la pièce remise au patient doit rester lisible
-- telle qu'elle a été imprimée. Une jointure la réécrirait.
-- ============================================================

create table if not exists pharmacie.proformas (
  id              text primary key,
  timestamp       text not null,
  site            text not null default 'REX',
  client_nom      text not null default '',
  total           numeric not null default 0 check (total >= 0),
  operateur_email text not null default '',
  valide_jusquau  text not null default '',
  -- Lignes figées : [{designation, detail, quantite, unite, prixUnitaire, total}]
  lignes          jsonb not null default '[]'::jsonb,
  -- « emis » tant que rien n'a suivi ; « transforme » dès qu'une vente en naît.
  statut          text not null default 'emis' check (statut in ('emis', 'transforme')),
  -- Vente issue de ce devis, le cas échéant.
  vente_id        text not null default '',
  transforme_le   text not null default ''
);

alter table pharmacie.proformas enable row level security;

-- Le suivi se lit par période et par état : deux index, pas davantage.
create index if not exists proformas_timestamp on pharmacie.proformas (timestamp desc);
create index if not exists proformas_statut on pharmacie.proformas (statut);

-- Retrouver le devis d'origine depuis une vente, sans balayer la table.
create index if not exists proformas_vente on pharmacie.proformas (vente_id)
  where vente_id <> '';
