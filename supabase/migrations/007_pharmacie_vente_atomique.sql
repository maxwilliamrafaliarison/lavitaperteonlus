-- ============================================================
-- Migration 007 — Pharmacie : la vente devient atomique
--
-- ── LE PROBLÈME ─────────────────────────────────────────────────────────
-- enregistrerVente enchaînait TROIS écritures indépendantes : l'en-tête de
-- vente, ses lignes, puis les mouvements de stock. Avec la connexion de
-- Fianarantsoa, le scénario suivant n'est pas hypothétique, il est certain
-- à terme :
--
--   1. l'en-tête passe        → la vente existe
--   2. les lignes passent     → le ticket est juste
--   3. les mouvements ÉCHOUENT → LE STOCK N'EST JAMAIS DÉCRÉMENTÉ
--
-- Le pharmacien voit une erreur, refait la vente : un nouvel identifiant
-- est généré, une deuxième vente s'enregistre. La première reste — comptée
-- dans le chiffre d'affaires du rapport quotidien, qui ne filtre que sur
-- statut ≠ annulee. La caisse et le stock divergent, sans aucun signal.
-- Sur des médicaments.
--
-- ── LA SOLUTION ─────────────────────────────────────────────────────────
-- Une fonction plpgsql : Postgres rend les trois insertions atomiques par
-- construction. Une seule requête HTTP, un seul verdict. Si une seule ligne
-- échoue, RIEN n'est écrit — la vente n'a pas eu lieu, et le pharmacien
-- peut la refaire sans créer de fantôme.
--
-- L'append-only n'est pas affaibli : on n'écrase toujours rien, on ajoute.
-- On garantit simplement que les trois ajouts tombent ensemble.
-- ============================================================

create or replace function pharmacie.enregistrer_vente(
  p_vente      jsonb,
  p_lignes     jsonb,
  p_mouvements jsonb
) returns text
language plpgsql
security definer
-- search_path figé : une fonction security definer sans search_path explicite
-- peut être détournée par un schéma placé devant dans le chemin de recherche.
set search_path = pharmacie, pg_temp
as $$
declare
  v_id text;
begin
  v_id := p_vente ->> 'id';
  if v_id is null or btrim(v_id) = '' then
    raise exception 'Vente sans identifiant : refus d''écrire';
  end if;

  -- Clé d'idempotence : si cet identifiant existe déjà, c'est un renvoi du
  -- même formulaire (réseau instable, double clic). On ne duplique pas la
  -- recette : on renvoie l'identifiant existant et l'appelant n'y voit que
  -- du feu. La contrainte de clé primaire sur ventes.id est le garde-fou.
  if exists (select 1 from pharmacie.ventes where id = v_id) then
    return v_id;
  end if;

  insert into pharmacie.ventes (
    id, timestamp, client_nom, type_vente, total, operateur_email, statut
  )
  select
    x.id, x.timestamp, coalesce(x.client_nom, ''), coalesce(x.type_vente, 'cash'),
    coalesce(x.total, 0), coalesce(x.operateur_email, ''), coalesce(x.statut, 'active')
  from jsonb_to_record(p_vente) as x(
    id text, timestamp text, client_nom text, type_vente text,
    total numeric, operateur_email text, statut text
  );

  insert into pharmacie.lignes_vente (
    id, vente_id, produit_id, lot_id, quantite, prix_unitaire, sous_total,
    mode_vente, qte_stock_deduire
  )
  select
    x.id, x.vente_id, x.produit_id, coalesce(x.lot_id, ''),
    coalesce(x.quantite, 0), coalesce(x.prix_unitaire, 0), coalesce(x.sous_total, 0),
    coalesce(x.mode_vente, 'boite'),
    -- Sans mode détail, la quantité déduite est la quantité vendue.
    coalesce(x.qte_stock_deduire, x.quantite, 0)
  from jsonb_to_recordset(p_lignes) as x(
    id text, vente_id text, produit_id text, lot_id text,
    quantite numeric, prix_unitaire numeric, sous_total numeric,
    mode_vente text, qte_stock_deduire numeric
  );

  insert into pharmacie.mouvements (
    id, timestamp, produit_id, lot_id, type, quantite, prix_unitaire,
    reference, user_email, note, unite_saisie, facteur_applique
  )
  select
    x.id, x.timestamp, x.produit_id, coalesce(x.lot_id, ''),
    coalesce(x.type, 'vente'), coalesce(x.quantite, 0), coalesce(x.prix_unitaire, 0),
    coalesce(x.reference, ''), coalesce(x.user_email, ''), coalesce(x.note, ''),
    coalesce(x.unite_saisie, 'boite'), coalesce(x.facteur_applique, 1)
  from jsonb_to_recordset(p_mouvements) as x(
    id text, timestamp text, produit_id text, lot_id text, type text,
    quantite numeric, prix_unitaire numeric, reference text,
    user_email text, note text, unite_saisie text, facteur_applique numeric
  );

  return v_id;
end;
$$;

-- Seul le serveur applicatif appelle cette fonction.
revoke all on function pharmacie.enregistrer_vente(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function pharmacie.enregistrer_vente(jsonb, jsonb, jsonb) to service_role;

comment on function pharmacie.enregistrer_vente(jsonb, jsonb, jsonb) is
  'Enregistre une vente et ses effets de stock de façon ATOMIQUE. Idempotent : '
  'un identifiant déjà présent renvoie sans rien écrire, pour qu''un renvoi du '
  'formulaire ne duplique jamais la recette.';

-- ── Contrôle de cohérence, à garder sous la main ─────────────────────────
-- Cette requête doit toujours renvoyer 0 ligne. Une vente sans mouvement de
-- stock est exactement le fantôme que cette migration rend impossible ; s'il
-- en existe d'AVANT, il apparaîtra ici.
--
--   select v.id, v.timestamp, v.total
--     from pharmacie.ventes v
--    where v.statut <> 'annulee'
--      and not exists (select 1 from pharmacie.mouvements m where m.reference = v.id);
