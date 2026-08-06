-- ============================================================
-- ESPÈCES REÇUES ET MONNAIE RENDUE
-- ============================================================
--
-- Le ticket affichait déjà ces deux lignes, mais l'information ne vivait
-- que dans l'écran, le temps de la vente : un ticket réimprimé depuis
-- l'historique les perdait. Or c'est précisément la réimpression qu'on
-- demande — pour un litige, une réclamation, un contrôle.
--
-- Les deux colonnes servent aussi de vérification au rapprochement de
-- caisse : espèces reçues − monnaie rendue doit égaler le total encaissé.
-- Un écart entre les deux signale une erreur de rendu de monnaie, que le
-- seul comptage du soir ne sait pas localiser.
--
-- Valeur nulle par défaut : les ventes déjà enregistrées n'ont pas cette
-- information, et zéro dirait faussement « rien reçu ». Le ticket
-- n'affiche la ligne que si elle est renseignée.
-- ============================================================

alter table pharmacie.ventes
  add column if not exists especes_recues numeric,
  add column if not exists monnaie_rendue numeric;
