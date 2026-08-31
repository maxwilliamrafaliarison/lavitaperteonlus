-- ============================================================
-- JOURNAL DES MODIFICATIONS DE PLANNING PUBLIÉ
-- ============================================================
--
-- Chaque retouche d'un planning déjà diffusé partait par courriel, une par
-- une. Une séance de corrections en produisait dix, ce qui noie l'avis dans
-- le bruit et finit par le faire ignorer. La direction a demandé un
-- récapitulatif unique.
--
-- Regrouper suppose de RETENIR les modifications entre deux requêtes. En
-- environnement sans état, la mémoire d'une requête ne survit pas à la
-- suivante : il faut donc les écrire. D'où cette table.
--
-- ── ELLE SERT DEUX FOIS ──────────────────────────────────────────────────
-- Elle porte la file d'attente des avis à envoyer, et elle devient du même
-- coup le JOURNAL des retouches faites après publication : qui, quand, sur
-- qui, et ce qui a changé. Une modification annoncée puis oubliée ne vaut
-- guère mieux qu'une modification silencieuse.
--
-- `notifie_le` vide signifie « en attente d'envoi ». Les lignes ne sont
-- jamais supprimées après l'envoi, seulement datées : le journal reste.
-- ============================================================

create table if not exists planning.modifications (
  id            text primary key,
  planning_id   text not null,
  centre        text not null default '',
  auteur        text not null default '',
  nature        text not null default '',
  agent_id      text not null default '',
  agent_nom     text not null default '',
  jour          text not null default '',
  avant         text not null default '',
  detail        text not null default '',
  horodatage    timestamptz not null default now(),
  notifie_le    timestamptz
);

-- La file d'attente se lit par « ce qui n'est pas encore notifié », et le
-- journal par planning : deux index, deux usages.
create index if not exists modifications_attente_idx
  on planning.modifications (horodatage)
  where notifie_le is null;

create index if not exists modifications_planning_idx
  on planning.modifications (planning_id, horodatage desc);

-- Contrôle : doit rendre la table et ses deux index.
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'planning' and tablename = 'modifications';
