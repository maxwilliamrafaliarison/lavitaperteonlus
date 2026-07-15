-- ============================================================
-- Migration 004 — Pharmacie : sûreté des colonnes texte (NULL)
--
-- POURQUOI : le script de migration Sheets → Supabase convertit les cellules
-- vides en NULL. Or Zod rejette null sur `z.string().default("")` (le default
-- ne joue que sur `undefined`), et listProduits() écarte silencieusement les
-- lignes invalides (.filter(p => p.success)). Résultat mesuré sur la base
-- réelle : 18 des 65 produits DISPARAISSAIENT de toute l'app à la bascule
-- PHARMACIE_BACKEND=supabase — sans une seule erreur affichée.
--
-- Le correctif de fond est dans le code (helper `txt()` dans types.ts, qui
-- absorbe null). Cette migration est la seconde barrière : elle empêche de
-- nouveaux NULL d'entrer et normalise l'existant.
--
-- Strictement additive : aucune donnée détruite, "" et NULL étant équivalents
-- pour cette application.
-- ============================================================

-- 1. Normalise l'existant (NULL → chaîne vide)
update pharmacie.produits set
  code            = coalesce(code, ''),
  dci             = coalesce(dci, ''),
  classe          = coalesce(classe, ''),
  forme           = coalesce(forme, ''),
  dosage          = coalesce(dosage, ''),
  conditionnement = coalesce(conditionnement, ''),
  fournisseur     = coalesce(fournisseur, ''),
  emplacement     = coalesce(emplacement, ''),
  statut          = coalesce(statut, 'actif'),
  "createdAt"     = coalesce("createdAt", '');   -- seule colonne camelCase : à quoter

update pharmacie.lots set
  numero_lot      = coalesce(numero_lot, ''),
  date_expiration = coalesce(date_expiration, ''),
  date_reception  = coalesce(date_reception, '');

update pharmacie.mouvements set
  lot_id     = coalesce(lot_id, ''),
  reference  = coalesce(reference, ''),
  user_email = coalesce(user_email, ''),
  note       = coalesce(note, '');

-- 2. Empêche de nouveaux NULL d'entrer
alter table pharmacie.produits
  alter column code            set default '', alter column code            set not null,
  alter column dci             set default '', alter column dci             set not null,
  alter column classe          set default '', alter column classe          set not null,
  alter column forme           set default '', alter column forme           set not null,
  alter column dosage          set default '', alter column dosage          set not null,
  alter column conditionnement set default '', alter column conditionnement set not null,
  alter column fournisseur     set default '', alter column fournisseur     set not null,
  alter column emplacement     set default '', alter column emplacement     set not null,
  alter column statut          set default 'actif', alter column statut     set not null,
  alter column "createdAt"     set default '', alter column "createdAt"     set not null;

alter table pharmacie.lots
  alter column numero_lot      set default '', alter column numero_lot      set not null,
  alter column date_expiration set default '', alter column date_expiration set not null,
  alter column date_reception  set default '', alter column date_reception  set not null;

alter table pharmacie.mouvements
  alter column lot_id     set default '', alter column lot_id     set not null,
  alter column reference  set default '', alter column reference  set not null,
  alter column user_email set default '', alter column user_email set not null,
  alter column note       set default '', alter column note       set not null;

-- 3. Contrôle : doit renvoyer 65 produits, 0 NULL.
-- select count(*) as total,
--        count(*) filter (where dci is null or classe is null or forme is null) as restants
--   from pharmacie.produits;
