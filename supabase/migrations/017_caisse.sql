-- ============================================================
-- 017 — SESSIONS DE CAISSE (pharmacie)
-- ============================================================
-- La journée de caisse devient un objet compté : la dispensatrice OUVRE la
-- caisse avec un fonds initial, la CLÔT en comptant les espèces, et l'écart
-- entre le théorique (fonds + ventes comptant de la session) et le compté
-- est tracé. C'est le contrôle standard d'une officine ; jusqu'ici seul le
-- rapport quotidien tenait lieu de clôture, sans comptage opposable.
--
-- Append-only dans l'esprit : une session se clôt, elle ne se modifie ni ne
-- se supprime. Une erreur de comptage se corrige en note, pas en réécriture.

create table if not exists pharmacie.caisse_sessions (
  id             text primary key,
  site           text not null default 'REX',
  statut         text not null default 'ouverte' check (statut in ('ouverte', 'fermee')),

  ouverte_par    text not null,             -- email de la dispensatrice
  ouverte_le     text not null,             -- ISO, heure des centres
  fonds_initial  numeric not null default 0 check (fonds_initial >= 0),

  fermee_par     text not null default '',
  fermee_le      text not null default '',
  especes_comptees numeric,                 -- null tant que la session est ouverte
  total_theorique  numeric,                 -- fonds + ventes comptant de la session
  ecart            numeric,                 -- comptées − théorique (négatif = manque)
  note           text not null default ''
);

-- Une seule caisse ouverte à la fois par site : c'est l'invariant qui rend
-- le théorique calculable (toute vente comptant appartient à LA session
-- ouverte de son site).
create unique index if not exists caisse_une_ouverte_par_site
  on pharmacie.caisse_sessions (site)
  where statut = 'ouverte';

create index if not exists caisse_sessions_ouverte_le
  on pharmacie.caisse_sessions (ouverte_le desc);
