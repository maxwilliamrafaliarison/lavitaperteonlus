-- ============================================================
-- Migration 010 — Pharmacie : enregistrer_vente v2 (compartiment + PEC)
--
-- CREATE OR REPLACE de la fonction atomique de vente (007), étendue pour :
--   • le COMPARTIMENT des mouvements (gros|detail) — sans quoi les
--     mouvements 'detail' du FEFO seraient écrits 'gros' par défaut, et le
--     stock à deux niveaux serait faux ;
--   • la PRISE EN CHARGE (pec_payeur, valeur_pec) sur l'en-tête de vente.
--
-- Reste ATOMIQUE (les N mouvements de la répartition FEFO tombent avec la
-- vente ou pas du tout) et IDEMPOTENTE sur ventes.id (garde exists() en
-- tête, clé primaire en garde-fou). Signature (jsonb,jsonb,jsonb) inchangée.
-- ============================================================

create or replace function pharmacie.enregistrer_vente(
  p_vente      jsonb,
  p_lignes     jsonb,
  p_mouvements jsonb
) returns text
language plpgsql
security definer
set search_path = pharmacie, pg_temp
as $$
declare
  v_id text;
begin
  v_id := p_vente ->> 'id';
  if v_id is null or btrim(v_id) = '' then
    raise exception 'Vente sans identifiant : refus d''ecrire';
  end if;

  -- Idempotence : un identifiant déjà présent est un renvoi du formulaire.
  if exists (select 1 from pharmacie.ventes where id = v_id) then
    return v_id;
  end if;

  insert into pharmacie.ventes (
    id, timestamp, client_nom, type_vente, total, operateur_email, statut,
    pec_payeur, valeur_pec
  )
  select
    x.id, x.timestamp, coalesce(x.client_nom, ''), coalesce(x.type_vente, 'cash'),
    coalesce(x.total, 0), coalesce(x.operateur_email, ''), coalesce(x.statut, 'active'),
    coalesce(x.pec_payeur, ''), coalesce(x.valeur_pec, 0)
  from jsonb_to_record(p_vente) as x(
    id text, timestamp text, client_nom text, type_vente text,
    total numeric, operateur_email text, statut text,
    pec_payeur text, valeur_pec numeric
  );

  insert into pharmacie.lignes_vente (
    id, vente_id, produit_id, lot_id, quantite, prix_unitaire, sous_total,
    mode_vente, qte_stock_deduire
  )
  select
    x.id, x.vente_id, x.produit_id, coalesce(x.lot_id, ''),
    coalesce(x.quantite, 0), coalesce(x.prix_unitaire, 0), coalesce(x.sous_total, 0),
    coalesce(x.mode_vente, 'boite'), coalesce(x.qte_stock_deduire, x.quantite, 0)
  from jsonb_to_recordset(p_lignes) as x(
    id text, vente_id text, produit_id text, lot_id text,
    quantite numeric, prix_unitaire numeric, sous_total numeric,
    mode_vente text, qte_stock_deduire numeric
  );

  insert into pharmacie.mouvements (
    id, timestamp, produit_id, lot_id, type, quantite, prix_unitaire,
    reference, user_email, note, unite_saisie, facteur_applique, compartiment
  )
  select
    x.id, x.timestamp, x.produit_id, coalesce(x.lot_id, ''),
    coalesce(x.type, 'vente'), coalesce(x.quantite, 0), coalesce(x.prix_unitaire, 0),
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

revoke all on function pharmacie.enregistrer_vente(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function pharmacie.enregistrer_vente(jsonb, jsonb, jsonb) to service_role;
