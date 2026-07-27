-- ============================================================
-- Migration 014 — PLANNING : organisation du temps de travail
--
-- Le planning devient la RÉFÉRENCE du calcul (choix 3a) : retards, heures
-- supplémentaires et anomalies se jugent par rapport au créneau réellement
-- planifié pour l'agent ce jour-là, et non plus à un horaire unique.
--
-- ── DEUX MODÈLES D'ORGANISATION, PAS UN SEUL ─────────────────────────────
-- Les plannings réels des deux centres ne se ressemblent pas :
--   • REX     : hebdomadaire, PAR SERVICE (sécurité, nettoyage, réception,
--               accueil-caisse, consultations, pédiatrie…), en matin /
--               après-midi, avec ouverture 7h30, clôture et salles.
--   • MIARAKA : mensuel, PAR AGENT, avec gardes de nuit de 21 h (« 11H-8H »),
--               repos tournants et journées fractionnées.
-- Imposer un modèle unique obligerait un des deux centres à déformer son
-- organisation pour entrer dans l'outil. Le schéma porte donc les deux :
-- une affectation peut être rattachée à un service (REX) ou non (MIARAKA).
--
-- ── CONFORMITÉ (directive 2003/88/CE, arrêt CJUE C-55/18) ────────────────
-- Les seuils légaux (repos journalier 11 h, repos hebdomadaire 35 h, 48 h
-- hebdomadaires en moyenne) sont vérifiés à la saisie par l'application ;
-- ils sont stockés ici en paramètres pour rester ajustables sans migration.
-- ============================================================

create schema if not exists planning;

-- 1. SERVICES — les postes à couvrir (surtout REX).
create table if not exists planning.services (
  id        text primary key,
  libelle   text not null default '',
  centre    text not null default 'REX',
  -- Ordre d'affichage dans la grille (le planning papier a un ordre établi).
  rang      numeric not null default 0,
  couleur   text not null default '',
  actif     boolean not null default true
);

-- 2. MODÈLES DE CRÉNEAUX — le vocabulaire horaire de l'établissement.
--
--    `debut`/`fin` en "HH:MM". Une garde de nuit a fin <= debut : c'est le
--    marqueur d'un créneau qui TRAVERSE MINUIT (11H-8H = 21 h). Sans cette
--    convention explicite, un tel créneau se calculerait en durée négative.
create table if not exists planning.creneaux (
  id            text primary key,
  libelle       text not null default '',
  -- journee | fractionnee | garde_nuit | demi | repos | astreinte
  type          text not null default 'journee',
  debut         text not null default '',
  fin           text not null default '',
  -- Seconde plage, pour les journées coupées (7H-12H / 14H-17H).
  debut2        text not null default '',
  fin2          text not null default '',
  -- Durée retenue en minutes. Stockée car elle ne se déduit pas toujours
  -- des bornes : une garde peut inclure des heures de repos non décomptées.
  minutes       numeric not null default 0,
  couleur       text not null default '',
  actif         boolean not null default true
);

insert into planning.creneaux (id, libelle, type, debut, fin, debut2, fin2, minutes) values
  ('repos',      'Repos',                     'repos',       '',      '',      '',      '',      0),
  ('std',        'Journée 8h-12h / 14h-17h',  'fractionnee', '08:00', '12:00', '14:00', '17:00', 420),
  ('std7',       'Journée 7h-12h / 14h-17h',  'fractionnee', '07:00', '12:00', '14:00', '17:00', 480),
  ('matin',      'Matin 8h-12h',              'demi',        '08:00', '12:00', '',      '',      240),
  ('aprem',      'Après-midi 14h-17h',        'demi',        '14:00', '17:00', '',      '',      180),
  ('garde_nuit', 'Garde 11h-8h (nuit)',       'garde_nuit',  '11:00', '08:00', '',      '',      1260),
  ('garde_jour', 'Garde 8h-8h (24h)',         'garde_nuit',  '08:00', '08:00', '',      '',      1440)
on conflict (id) do nothing;

-- 3. PLANNINGS — une période publiée pour un centre.
--
--    `token_public` : lien de consultation SECRET et non indexé (choix 1a).
--    Un planning nominatif de personnel de santé expose qui est absent et
--    quand ; il n'est donc jamais publié en clair sur une adresse devinable,
--    et la page porte un noindex. Le jeton est révocable : le régénérer
--    invalide l'ancien lien sans toucher au planning.
create table if not exists planning.plannings (
  id            text primary key,
  centre        text not null default 'REX',
  -- Période couverte, bornes incluses ("YYYY-MM-DD").
  du            text not null default '',
  au            text not null default '',
  libelle       text not null default '',
  -- brouillon | publie | archive
  statut        text not null default 'brouillon',
  token_public  text not null default '',
  publie_par    text not null default '',
  publie_le     text not null default '',
  modifie_par   text not null default '',
  modifie_le    text not null default '',
  note          text not null default ''
);
create index if not exists plannings_centre_periode_idx on planning.plannings (centre, du, au);
create unique index if not exists plannings_token_idx on planning.plannings (token_public) where token_public <> '';

-- 4. AFFECTATIONS — le cœur : qui travaille, quand, sur quel poste.
--
--    `service_id` vide = planning par agent (MIARAKA) ; renseigné = planning
--    par service (REX). Le même schéma sert donc aux deux organisations.
create table if not exists planning.affectations (
  id           text primary key,
  planning_id  text not null default '',
  agent_id     text not null default '',
  jour         text not null default '',           -- "YYYY-MM-DD"
  creneau_id   text not null default '',
  service_id   text not null default '',
  -- Horaires dérogatoires pour ce jour précis (sinon ceux du créneau).
  debut        text not null default '',
  fin          text not null default '',
  -- Lieu d'exécution (ex. « Ankofafa » à MIARAKA), salle, remarque.
  lieu         text not null default '',
  note         text not null default ''
);
create index if not exists affectations_planning_idx on planning.affectations (planning_id);
create index if not exists affectations_agent_jour_idx on planning.affectations (agent_id, jour);
create index if not exists affectations_jour_idx on planning.affectations (jour);
-- Un agent n'a qu'une affectation par jour et par service : re-planifier
-- corrige au lieu d'empiler des créneaux contradictoires.
create unique index if not exists affectations_unicite_idx
  on planning.affectations (planning_id, agent_id, jour, service_id);

-- 5. PARAMÈTRES légaux — ajustables sans migration.
create table if not exists planning.parametres (
  cle     text primary key,
  valeur  text not null default '',
  note    text not null default ''
);
insert into planning.parametres (cle, valeur, note) values
  ('repos_journalier_min_minutes', '660',  'Directive 2003/88/CE art. 3 — 11 h consécutives'),
  ('repos_hebdo_min_minutes',      '2100', 'Directive 2003/88/CE art. 5 — 35 h consécutives'),
  ('max_hebdo_minutes',            '2880', 'Directive 2003/88/CE art. 6 — 48 h en moyenne'),
  ('tolerance_retard_minutes',     '5',    'Tolérance avant comptage d''un retard')
on conflict (cle) do nothing;

-- ── Sécurité ─────────────────────────────────────────────────────────────
alter table planning.services     enable row level security;
alter table planning.creneaux     enable row level security;
alter table planning.plannings    enable row level security;
alter table planning.affectations enable row level security;
alter table planning.parametres   enable row level security;

grant usage on schema planning to service_role;
grant all on all tables in schema planning to service_role;
alter default privileges in schema planning grant all on tables to service_role;

-- Contrôle : select count(*) from planning.creneaux;  → 7 modèles
