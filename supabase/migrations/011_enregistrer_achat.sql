-- ============================================================
-- Migration 011 — Pharmacie : enregistrer_achat (registre des entrées)
--
-- Un ACHAT est un document fournisseur (une facture / un BL) qui entre
-- PLUSIEURS produits d'un coup. Chaque ligne crée :
--   • une ligne de registre (achats_lignes) — la trace comptable ;
--   • un LOT GROS neuf (même n° de lot qu'un stock existant = lot distinct,
--     car deux livraisons ne partagent jamais la même péremption garantie) ;
--   • un MOUVEMENT 'entree' compartiment 'gros' — la seule chose qui bouge
--     le stock (invariant : stock = Σ mouvements, jamais une cellule).
--
-- Le tout est ATOMIQUE : une facture entre entièrement ou pas du tout. Une
-- entrée partielle fausserait à la fois le stock ET la comptabilité, et
-- personne ne s'en apercevrait avant l'inventaire. IDEMPOTENT sur achats.id
-- (un renvoi de formulaire ne double pas le stock).
--
-- Style calqué sur enregistrer_vente (010) : jsonb_to_record(set),
-- coalesce partout (jamais de null dans une colonne NOT NULL), security
-- definer, exécution réservée au service_role.
-- ============================================================

create or replace function pharmacie.enregistrer_achat(
  p_achat      jsonb,
  p_lignes     jsonb,
  p_lots       jsonb,
  p_mouvements jsonb
) returns text
language plpgsql
security definer
set search_path = pharmacie, pg_temp
as $$
declare
  v_id text;
begin
  v_id := p_achat ->> 'id';
  if v_id is null or btrim(v_id) = '' then
    raise exception 'Achat sans identifiant : refus d''ecrire';
  end if;

  -- Idempotence : un identifiant déjà présent est un renvoi du formulaire.
  if exists (select 1 from pharmacie.achats where id = v_id) then
    return v_id;
  end if;

  insert into pharmacie.achats (
    id, timestamp, date_facture, fournisseur, num_facture, num_bl,
    montant_total, operateur_email, statut, note
  )
  select
    x.id, coalesce(x.timestamp, ''), coalesce(x.date_facture, ''),
    coalesce(x.fournisseur, ''), coalesce(x.num_facture, ''), coalesce(x.num_bl, ''),
    coalesce(x.montant_total, 0), coalesce(x.operateur_email, ''),
    coalesce(x.statut, 'valide'), coalesce(x.note, '')
  from jsonb_to_record(p_achat) as x(
    id text, timestamp text, date_facture text, fournisseur text,
    num_facture text, num_bl text, montant_total numeric,
    operateur_email text, statut text, note text
  );

  insert into pharmacie.achats_lignes (
    id, achat_id, produit_id, designation, contenance, quantite,
    date_expiration, numero_lot, montant
  )
  select
    x.id, x.achat_id, coalesce(x.produit_id, ''), coalesce(x.designation, ''),
    coalesce(x.contenance, ''), coalesce(x.quantite, 0),
    coalesce(x.date_expiration, ''), coalesce(x.numero_lot, ''),
    coalesce(x.montant, 0)
  from jsonb_to_recordset(p_lignes) as x(
    id text, achat_id text, produit_id text, designation text,
    contenance text, quantite numeric, date_expiration text,
    numero_lot text, montant numeric
  );

  insert into pharmacie.lots (
    id, produit_id, numero_lot, date_expiration, date_reception, contenance
  )
  select
    x.id, x.produit_id, coalesce(x.numero_lot, ''),
    coalesce(x.date_expiration, ''), coalesce(x.date_reception, ''),
    coalesce(x.contenance, '')
  from jsonb_to_recordset(p_lots) as x(
    id text, produit_id text, numero_lot text, date_expiration text,
    date_reception text, contenance text
  );

  insert into pharmacie.mouvements (
    id, timestamp, produit_id, lot_id, type, quantite, prix_unitaire,
    reference, user_email, note, unite_saisie, facteur_applique, compartiment
  )
  select
    x.id, x.timestamp, x.produit_id, coalesce(x.lot_id, ''),
    coalesce(x.type, 'entree'), coalesce(x.quantite, 0), coalesce(x.prix_unitaire, 0),
    coalesce(x.reference, ''), coalesce(x.user_email, ''), coalesce(x.note, ''),
    coalesce(x.unite_saisie, 'boite'), coalesce(x.facteur_applique, 1),
    coalesce(x.compartiment, 'gros')
  from jsonb_to_recordset(p_mouvements) as x(
    id text, timestamp text, produit_id text, lot_id text, type text,
    quantite numeric, prix_unitaire numeric, reference text,
    user_email text, note text, unite_saisie text, facteur_applique numeric,
    compartiment text
  );

  return v_id;
end;
$$;

revoke all on function pharmacie.enregistrer_achat(jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function pharmacie.enregistrer_achat(jsonb, jsonb, jsonb, jsonb) to service_role;
