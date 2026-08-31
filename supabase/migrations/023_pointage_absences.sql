-- ============================================================
-- Migration 023 — CONGÉS ET ABSENCES
-- ============================================================
--
-- ── CE QUI EXISTAIT, ET POURQUOI CELA NE SUFFISAIT PAS ───────────────────
-- La table `pointage.ajustements` porte depuis l'origine une colonne
-- `type_absence`. Elle a rendu service, mais elle répond à une autre
-- question : elle CORRIGE une journée passée, une à la fois, une fois que
-- la pointeuse a parlé. Déclarer cinq jours de congé demandait cinq
-- saisies, et rien ne reliait ces cinq lignes entre elles.
--
-- Surtout, un congé se pose AVANT. Le planning de la semaine se fait le
-- vendredi pour la semaine suivante : si l'outil ne sait pas que Voahangy
-- sera absente du 14 au 18, il l'affecte, et personne ne s'en aperçoit
-- jusqu'au lundi matin.
--
-- ── CE QUE CETTE TABLE AJOUTE ────────────────────────────────────────────
-- Une absence est une PÉRIODE, portée par une seule ligne, avec un état :
-- demandée, acceptée, refusée, annulée. Elle vit donc avant les faits, et
-- non après. Les ajustements restent ce qu'ils sont, la correction du
-- passé ; les deux ne se contredisent pas, ils se complètent.
--
-- ── LES DATES SONT DU TEXTE 'YYYY-MM-DD' ─────────────────────────────────
-- Comme partout dans ce schéma, et pour la même raison : le temps de
-- travail se juge à l'heure du centre (UTC+3), pas à celle du serveur. Un
-- type `date` inviterait Postgres puis le pilote JavaScript à convertir, et
-- une conversion de fuseau sur une date de congé décale un jour entier. Le
-- texte trié lexicographiquement se compare exactement comme une date,
-- sans ce risque.
--
-- ── RIEN N'EST SUPPRIMÉ ──────────────────────────────────────────────────
-- Une absence annulée passe à l'état 'annulee', elle ne disparaît pas.
-- Même invariant que les pointages : on doit toujours pouvoir répondre à
-- « qui a demandé quoi, et qui a tranché ».
-- ============================================================

-- 1. ABSENCES — une ligne par période et par personne.
create table if not exists pointage.absences (
  id            text primary key,
  agent_id      text not null default '',
  -- 'conge' | 'maladie' | 'maternite' | 'mission' | 'ferie' | 'sans_solde'
  -- | 'injustifiee'. Le comportement de chacune vit dans absences.ts, où
  -- il est testé ; la base ne fait que porter la valeur.
  nature        text not null default 'conge',
  du            text not null default '',
  au            text not null default '',
  -- Demi-journées : une absence peut commencer l'après-midi et finir le
  -- matin. '' vaut journée entière.
  demi_debut    text not null default '',        -- '' | 'apres_midi'
  demi_fin      text not null default '',        -- '' | 'matin'
  -- 'demande' | 'acceptee' | 'refusee' | 'annulee'. Seule 'acceptee'
  -- produit un effet sur le pointage, le planning et les écarts.
  etat          text not null default 'demande',
  motif         text not null default '',
  -- Jours réellement décomptés, FIGÉS à l'acceptation. Recalculer plus tard
  -- donnerait un autre chiffre le jour où le mode de décompte ou les jours
  -- travaillés de la personne changent, et le solde bougerait tout seul
  -- dans le passé.
  jours_decomptes numeric not null default 0,
  -- Qui a posé, qui a tranché.
  demande_par   text not null default '',
  demande_le    text not null default '',
  decide_par    text not null default '',
  decide_le     text not null default '',
  decision_note text not null default ''
);

-- La question posée cent fois par jour est « qui est absent ce jour-là »,
-- ce qui se lit par intervalle : l'index porte donc sur les bornes.
create index if not exists absences_periode_idx on pointage.absences (du, au);
create index if not exists absences_agent_idx on pointage.absences (agent_id, du);
-- La file des demandes à trancher se lit par état.
create index if not exists absences_etat_idx on pointage.absences (etat, du);

-- 2. COMPTEURS DE CONGÉS — ce que le calcul ne peut pas deviner.
--
--    Le droit acquis se calcule (2,5 jours par mois de service, art. 86 du
--    Code du travail malgache), mais deux valeurs ne se calculent pas : la
--    date d'entrée réelle de la personne, et le report de l'exercice
--    précédent, qui vient des registres papier antérieurs à l'application.
--    Sans elles, tout solde affiché serait faux.
create table if not exists pointage.conges_compteurs (
  agent_id      text primary key,
  date_entree   text not null default '',
  -- LA SORTIE ARRÊTE L'ACQUISITION. Sans elle, une personne partie en mars
  -- continue de gagner deux jours et demi par mois, et le tableau des
  -- soldes dérive d'un demi-jour par quinzaine sans que rien ne l'annonce.
  -- Vide se lit « toujours en poste » : une date inventée arrêterait au
  -- contraire un droit qui court encore, au détriment de la personne.
  date_sortie   text not null default '',
  -- Solde reporté de l'exercice précédent, en jours (peut être négatif).
  reporte       numeric not null default 0,
  -- Exercice auquel se rapporte le report, pour savoir s'il est périmé.
  exercice      text not null default '',
  note          text not null default '',
  modifie_par   text not null default '',
  modifie_le    text not null default ''
);

-- 3. JOURS FÉRIÉS — jamais décomptés d'un congé.
--
--    Un férié tombant pendant un congé est un jour chômé payé, pas un jour
--    de congé consommé. Le décompter reviendrait à faire payer au salarié
--    un droit que la loi lui accorde par ailleurs. La liste est saisie
--    plutôt que calculée : les fêtes mobiles malgaches (Pâques, Pentecôte)
--    et les jours chômés décidés par le centre ne suivent aucune règle
--    qu'on puisse coder une fois pour toutes.
create table if not exists pointage.feries (
  jour          text not null,                   -- 'YYYY-MM-DD'
  libelle       text not null default '',
  -- '' = les deux centres ; sinon 'REX' ou 'MIARAKA'.
  centre        text not null default '',
  saisi_par     text not null default '',
  saisi_le      text not null default '',
  -- LA CLÉ PORTE LE CENTRE, et pas seulement le jour. Avec le jour seul,
  -- déclarer le 26 juin pour REX interdisait de le déclarer pour MIARAKA :
  -- l'écran répondait « ce jour est déjà férié » devant une liste où il ne
  -- figurait pas pour ce centre, ce qui est incompréhensible au guichet.
  primary key (jour, centre)
);

-- 4. PARAMÈTRES DU MODULE — le décompte n'est pas le même partout.
--
--    Le Code du travail compte en jours CALENDAIRES : dans une semaine de
--    congé, le dimanche est décompté. Beaucoup d'employeurs comptent en
--    jours OUVRÉS, ce qui est plus favorable et plus simple à expliquer.
--    Les deux usages existent ; l'ONG tranche ici, sans qu'on retouche le
--    code. Le décompte légal est la valeur par défaut, puisque c'est celui
--    qu'un contrôle opposerait.
create table if not exists pointage.parametres (
  cle           text primary key,
  valeur        text not null default '',
  libelle       text not null default ''
);

insert into pointage.parametres (cle, valeur, libelle) values
  ('conges_mode_decompte', 'calendaire', 'Décompte des congés : calendaire (légal) ou ouvre'),
  ('conges_acquisition_mois', '2.5',      'Jours de congé acquis par mois de service'),
  ('conges_exercice_debut', '01-01',      'Début de l''exercice de congés (MM-JJ)')
on conflict (cle) do nothing;

-- ── Sécurité : RLS active, accès par la clé service_role uniquement ───────
alter table pointage.absences         enable row level security;
alter table pointage.conges_compteurs enable row level security;
alter table pointage.feries           enable row level security;
alter table pointage.parametres       enable row level security;

grant all on pointage.absences         to service_role;
grant all on pointage.conges_compteurs to service_role;
grant all on pointage.feries           to service_role;
grant all on pointage.parametres       to service_role;

-- ── Contrôle ─────────────────────────────────────────────────────────────
-- Doit rendre les quatre tables, puis les trois paramètres par défaut.
select table_name
from information_schema.tables
where table_schema = 'pointage'
  and table_name in ('absences', 'conges_compteurs', 'feries', 'parametres')
order by table_name;

select cle, valeur from pointage.parametres order by cle;
