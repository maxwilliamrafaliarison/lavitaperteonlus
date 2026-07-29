-- Migration 016 -- changement de mot de passe impose a la premiere connexion.
-- Les comptes livres avec un mot de passe provisoire (connu de l'admin qui
-- le communique) portent ce marqueur ; le middleware conduit alors l'usager
-- vers l'ecran de changement et n'ouvre rien d'autre avant.

alter table logistique.users
  add column if not exists "mustChangePassword" boolean not null default false;

-- Les deux dispensatrices de la pharmacie (mots de passe provisoires).
update logistique.users
  set "mustChangePassword" = true
  where email in ('lida.lavitaperte@gmail.com', 'fanilo.lavitaperte@gmail.com');

-- Controle :
-- select email, "mustChangePassword" from logistique.users order by email;
