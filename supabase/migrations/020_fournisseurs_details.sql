-- ============================================================
-- FICHE FOURNISSEURS — détails d'immatriculation et notes
-- ============================================================
-- La table ne portait que le contact (téléphone, email, adresse).
-- Les factures originales fournissent l'immatriculation complète :
-- elle sert à vérifier qu'une facture émane bien du fournisseur
-- déclaré, et à remplir un dossier d'agrément sans rechercher les
-- papiers. Champs texte libres : ces numéros ne se calculent pas.
-- ============================================================
alter table pharmacie.fournisseurs
  add column if not exists nif text not null default '',
  add column if not exists stat text not null default '',
  add column if not exists rc text not null default '',
  add column if not exists note text not null default '';
