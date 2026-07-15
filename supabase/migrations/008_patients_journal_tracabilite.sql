-- ============================================================
-- Migration 008 — Patients : rendre le journal d'accès exploitable
--
-- ── LE PROBLÈME ─────────────────────────────────────────────────────────
-- Le journal fonctionne (27 entrées réelles au 15/07/2026) et il identifie
-- bien la patiente consultée — mais dans le TEXTE LIBRE de `details` :
--     « patiente N° R352 (16 visite(s)) »
-- La colonne dossier_id, elle, est restée nulle sur les 27 entrées.
--
-- Conséquence : impossible de répondre à « qui a consulté MON dossier ? »
-- autrement qu'en fouillant du texte à la main. C'est exactement ce que
-- l'article 15 du RGPD donne à la patiente le droit de demander, et ce que
-- l'article 33 impose d'instruire en 72 h en cas de violation.
--
-- ── LE CHOIX ────────────────────────────────────────────────────────────
-- On ajoute `n_patiente` plutôt que de remplir `dossier_id`. Une patiente a
-- PLUSIEURS visites (jusqu'à 16 pour R352) : `dossier_id` désigne une ligne
-- de visite, pas une personne. Le numéro de patiente est l'identifiant
-- stable, et c'est celui sur lequel une demande d'accès porte réellement.
--
-- Additive : rien n'est réécrit, les 27 entrées existantes gardent leur
-- trace dans `details`.
-- ============================================================

alter table patients.acces_log
  add column if not exists n_patiente text;

-- Récupère le numéro depuis le texte libre des entrées déjà écrites :
-- « patiente N° R352 (16 visite(s)) » → « R352 ». Aucune trace n'est perdue.
update patients.acces_log
   set n_patiente = substring(details from 'N°\s*([A-Za-z0-9]+)')
 where n_patiente is null
   and details ~ 'N°\s*[A-Za-z0-9]+';

-- La question posée sera toujours « tout l'historique de CETTE patiente,
-- du plus récent au plus ancien ».
create index if not exists acces_log_patiente_idx
  on patients.acces_log (n_patiente, ts desc);

-- Et « qu'a consulté CET utilisateur », pour instruire un accès anormal.
create index if not exists acces_log_user_idx
  on patients.acces_log (user_email, ts desc);

comment on column patients.acces_log.n_patiente is
  'Numéro de patiente consultée (R####). Identifiant STABLE, contrairement à '
  'dossier_id qui ne désigne qu''une visite parmi plusieurs. C''est la clé '
  'qui permet de répondre à une demande d''accès (RGPD art. 15).';

-- Contrôle : les 27 entrées historiques doivent être rattrapées.
--   select count(*) as total,
--          count(n_patiente) as avec_numero,
--          count(*) filter (where action = 'consultation_dossier') as consultations
--     from patients.acces_log;
