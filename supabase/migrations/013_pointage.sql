-- ============================================================
-- Migration 013 — POINTAGE : gestion du temps de travail
--
-- 4e application du portail (après logistique, pharmacie, patients).
-- Deux sites équipés de pointeuses ZKTeco MB360 : REX et MIARAKA.
--
-- ── PRINCIPE STRUCTURANT : les pointages sont APPEND-ONLY ────────────────
-- La table `pointages` reçoit les événements bruts de la pointeuse et n'est
-- JAMAIS modifiée : un pointage biométrique est un fait, pas une opinion.
-- Une erreur (oubli de badger, sortie non pointée) se corrige par une ligne
-- d'`ajustements` — motif, auteur et horodatage obligatoires. On peut ainsi
-- toujours répondre à « qu'a dit la machine ? » ET « qu'a décidé le RH ? »,
-- ce qu'un écrasement rendrait impossible. C'est le même invariant que le
-- stock de la pharmacie (stock = Σ mouvements, jamais une cellule mutée).
--
-- ── RGPD (art. 9) ────────────────────────────────────────────────────────
-- AUCUNE donnée biométrique ici : ni empreinte, ni gabarit facial. Ceux-ci
-- restent confinés au terminal ZKTeco. On ne stocke que l'identifiant de
-- pointage, l'horodatage et le sens (entrée/sortie) — le strict nécessaire
-- au décompte du temps de travail (minimisation, art. 5.1.c).
-- ============================================================

create schema if not exists pointage;

-- 1. MODÈLES D'HORAIRES — un agent suit un modèle (choix 2c).
--    Les heures sont du texte "HH:MM" : lisible, comparable, sans piège de
--    fuseau (une prise de poste à 8:00 est locale, pas un instant UTC).
create table if not exists pointage.horaires (
  id                text primary key,
  libelle           text not null default '',
  -- Plages théoriques. Une plage vide = pas de service sur cette demi-journée.
  matin_debut       text not null default '08:00',
  matin_fin         text not null default '12:00',
  aprem_debut       text not null default '14:00',
  aprem_fin         text not null default '17:00',
  -- Jours travaillés : 1=lundi … 7=dimanche. Le samedi matin est courant ici.
  jours_travailles  text not null default '1,2,3,4,5,6',
  -- Tolérance avant de compter un retard (minutes).
  tolerance_minutes numeric not null default 5,
  -- Durée théorique d'une journée complète, en minutes (sert aux HS).
  minutes_jour      numeric not null default 420,
  actif             boolean not null default true
);

insert into pointage.horaires (id, libelle, matin_debut, matin_fin, aprem_debut, aprem_fin, jours_travailles, minutes_jour) values
  ('std',      'Standard (8h-12h / 14h-17h)', '08:00', '12:00', '14:00', '17:00', '1,2,3,4,5,6', 420),
  ('mitemps',  'Mi-temps (8h-12h)',           '08:00', '12:00', '',      '',      '1,2,3,4,5',   240),
  ('gardien',  'Gardien (journée continue)',  '06:00', '18:00', '',      '',      '1,2,3,4,5,6,7', 720)
on conflict (id) do nothing;

-- 2. AGENTS — le référentiel des personnes (identité stable).
create table if not exists pointage.agents (
  id            text primary key,
  nom           text not null default '',
  prenom        text not null default '',       -- prénom usuel (celui de la pointeuse)
  -- Site de RATTACHEMENT contractuel (≠ site où la personne a badgé).
  site          text not null default 'REX',
  -- 'salarie' | 'prestataire' : les prestataires sont facturés à l'heure.
  statut        text not null default 'salarie',
  poste         text not null default '',
  service       text not null default '',
  horaire_id    text not null default 'std',
  -- Taux horaire (prestataires) ; 0 pour un salarié.
  taux_horaire  numeric not null default 0,
  actif         boolean not null default true,
  createdAt     text not null default ''
);
create index if not exists agents_site_idx on pointage.agents (site);
create index if not exists agents_prenom_idx on pointage.agents (prenom);

-- 2bis. BADGES — correspondance (installation, Personnel ID) → agent.
--
--    ⚠️ LEÇON DES DONNÉES RÉELLES : le "Personnel ID" de ZKAccess n'est PAS
--    une identité. Il est propre à chaque installation ET change dans le
--    temps : Aina est 15 sur la base REX mais 4 sur celle de MIARAKA ;
--    Dalianne était 61 en 2025, elle est 24 en 2026. Une personne peut même
--    porter deux badges (Herve = 5 ET 20). L'utiliser comme clé primaire
--    fusionnerait des gens différents et éclaterait les heures d'une même
--    personne sur deux fiches.
--
--    D'où cette table de correspondance datée : un même ID peut être réattribué
--    à quelqu'un d'autre plus tard, `valide_du`/`valide_au` tranchent alors
--    sans ambiguïté à quelle personne rattacher un pointage de telle date.
create table if not exists pointage.badges (
  id            text primary key,
  agent_id      text not null default '',
  -- Installation ZKAccess d'origine : 'REX' | 'MIARAKA' (base de numérotation).
  installation  text not null default 'REX',
  id_pointeuse  text not null default '',
  -- Fenêtre de validité ("" = depuis toujours / jusqu'à nouvel ordre).
  valide_du     text not null default '',
  valide_au     text not null default '',
  note          text not null default ''
);
create index if not exists badges_lookup_idx on pointage.badges (installation, id_pointeuse);
create index if not exists badges_agent_idx on pointage.badges (agent_id);

-- 3. POINTAGES — événements bruts, APPEND-ONLY.
--    `id` déterministe (site + id pointeuse + horodatage) : réimporter deux
--    fois le même fichier ne peut pas créer de doublon. C'est l'idempotence
--    exigée par un import répété chaque mois.
create table if not exists pointage.pointages (
  id           text primary key,
  agent_id     text not null default '',
  -- Site où la personne a BADGÉ (Device Name), qui n'est pas forcément son
  -- site de rattachement : un agent MIARAKA peut pointer à REX en mission.
  site_pointage text not null default 'REX',
  -- Horodatage local du pointage, "YYYY-MM-DD HH:MM:SS" tel que fourni par
  -- la pointeuse (heure de Madagascar, UTC+3) — on ne convertit pas : le
  -- temps de travail se juge à l'heure du centre, pas à celle du serveur.
  horodatage   text not null,
  jour         text not null default '',           -- "YYYY-MM-DD", pour l'agrégation
  -- Sens ANNONCÉ par la pointeuse. ⚠️ Peu fiable : sur les données réelles,
  -- le premier passage de la journée est étiqueté "Check-Out" dans 9 % (REX)
  -- à 36 % (MIARAKA) des cas — l'agent badge sur un terminal resté en mode
  -- sortie. Le sens EFFECTIF est donc recalculé par ordre chronologique
  -- (1er = entrée, 2e = sortie…) et non lu ici.
  sens_brut    text not null default '',           -- 'in' | 'out' | 'none'
  verif        text not null default '',           -- empreinte, visage, carte…
  appareil     text not null default '',
  source       text not null default 'import',     -- import | manuel
  importe_le   text not null default ''
);
create index if not exists pointages_agent_jour_idx on pointage.pointages (agent_id, jour);
create index if not exists pointages_jour_idx on pointage.pointages (jour);
create index if not exists pointages_site_jour_idx on pointage.pointages (site_pointage, jour);

-- 4. AJUSTEMENTS — corrections tracées, jamais un écrasement.
--    Un pointage oublié se rattrape ici : on garde côte à côte ce que la
--    machine a enregistré et ce que le responsable a décidé, avec le motif.
create table if not exists pointage.ajustements (
  id              text primary key,
  agent_id        text not null default '',
  jour            text not null default '',
  -- Heures corrigées (vides = inchangé). "HH:MM".
  matin_debut     text not null default '',
  matin_fin       text not null default '',
  aprem_debut     text not null default '',
  aprem_fin       text not null default '',
  -- Motif OBLIGATOIRE : sans justification, une correction n'est pas auditable.
  motif           text not null,
  -- Type d'absence éventuel : conge | maladie | mission | ferie | absence
  type_absence    text not null default '',
  auteur_email    text not null default '',
  timestamp       text not null default ''
);
create index if not exists ajustements_agent_jour_idx on pointage.ajustements (agent_id, jour);

-- 5. HEURES SUPPLÉMENTAIRES — proposées par le calcul, ACCORDÉES par l'humain
--    (choix 3a : le moteur propose, le responsable valide).
create table if not exists pointage.heures_sup (
  id             text primary key,
  agent_id       text not null default '',
  jour           text not null default '',
  minutes        numeric not null default 0,
  motif          text not null default '',
  valide_par     text not null default '',
  timestamp      text not null default ''
);
create index if not exists heures_sup_agent_jour_idx on pointage.heures_sup (agent_id, jour);

-- 6. CLÔTURES mensuelles — au-delà, le mois est figé pour la paie.
create table if not exists pointage.clotures (
  id           text primary key,                   -- ex. "REX-2026-06"
  site         text not null default '',
  mois         text not null default '',           -- "YYYY-MM"
  cloture_par  text not null default '',
  timestamp    text not null default '',
  note         text not null default ''
);

-- 7. IMPORTS — journal des fichiers intégrés (traçabilité + anti-doublon).
create table if not exists pointage.imports (
  id             text primary key,
  site           text not null default '',
  fichier        text not null default '',
  lignes_lues    numeric not null default 0,
  lignes_creees  numeric not null default 0,
  lignes_ignorees numeric not null default 0,
  anomalies      text not null default '',
  auteur_email   text not null default '',
  timestamp      text not null default ''
);

-- ── Sécurité : RLS active, accès par la clé service_role uniquement ───────
alter table pointage.horaires    enable row level security;
alter table pointage.agents      enable row level security;
alter table pointage.badges      enable row level security;
alter table pointage.pointages   enable row level security;
alter table pointage.ajustements enable row level security;
alter table pointage.heures_sup  enable row level security;
alter table pointage.clotures    enable row level security;
alter table pointage.imports     enable row level security;

grant usage on schema pointage to service_role;
grant all on all tables in schema pointage to service_role;
alter default privileges in schema pointage grant all on tables to service_role;

-- Contrôle : select count(*) from pointage.horaires;  → 3 modèles
