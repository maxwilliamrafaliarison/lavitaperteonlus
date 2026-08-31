-- ============================================================
-- LE JETON PUBLIC APPARTIENT AU CENTRE, PAS À UNE SEMAINE
-- ============================================================
--
-- La migration 014 posait un index UNIQUE sur `token_public`. C'était juste
-- tant qu'un jeton désignait une semaine et une seule.
--
-- La publication semaine par semaine derrière une adresse permanente a
-- renversé cette hypothèse : le jeton appartient désormais au CENTRE, et
-- chaque semaine publiée s'ajoute derrière la même adresse.
-- `planningsParToken` lit d'ailleurs une LISTE, et `planningParToken`
-- choisit dans cette liste celle qui couvre le jour demandé.
--
-- L'index unique et ce fonctionnement se contredisent. La contradiction ne
-- se voyait pas au premier planning publié ; elle apparaissait au second,
-- sous la forme d'un 23505 « duplicate key value ». Aucune publication n'a
-- donc abouti depuis la première, sans que rien ne l'explique à l'écran.
--
-- On garde un index, car la recherche par jeton reste le chemin d'accès de
-- la page publique. On lui retire seulement l'unicité.
-- ============================================================

drop index if exists planning.plannings_token_idx;

create index if not exists plannings_token_idx
  on planning.plannings (token_public)
  where token_public <> '';
