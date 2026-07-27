-- ============================================================
-- Migration 015 — PLANNING : créneaux et services réellement en usage
--
-- Relevés dans les 7 plannings des deux centres (23/12/2024 → 06/09/2026,
-- 75 231 cellules). Les modèles pré-chargés en 014 étaient une hypothèse ;
-- ceux-ci sont mesurés, avec leur fréquence d'emploi.
--
-- ⚠️ Le barème d'heures de MIARAKA n'est écrit NULLE PART dans les fichiers :
-- il se déduit des formules de total saisies à la main (« =24*3 », « =7.5*6 »).
-- Le voici explicité — c'est précisément ce qu'un module applicatif apporte,
-- là où les totaux Excel sont des constantes figées qui ne se recalculent
-- jamais quand un créneau change.
-- ============================================================

-- ── Créneaux MIARAKA (gardes et postes de sécurité) ──────────────────────
insert into planning.creneaux (id, libelle, type, debut, fin, debut2, fin2, minutes) values
  -- Gardes : la fin précède le début → le créneau traverse minuit.
  ('g_8_8',    'Garde 8h-8h (24 h)',            'garde_nuit',  '08:00', '08:00', '', '', 1440),
  ('g_11_8',   'Garde 11h-8h (21 h)',           'garde_nuit',  '11:00', '08:00', '', '', 1260),
  ('g_16_8',   'Garde 16h-8h (16 h)',           'garde_nuit',  '16:00', '08:00', '', '', 960),
  -- Postes de sécurité (rotation à 3 vigiles, toujours un en repos).
  ('sec_nuit', 'Sécurité nuit 17h-6h (13 h)',   'garde_nuit',  '17:00', '06:00', '', '', 780),
  ('sec_14_6', 'Sécurité 14h-6h (16 h)',        'garde_nuit',  '14:00', '06:00', '', '', 960),
  ('sec_18_7', 'Sécurité 18h-7h (13 h)',        'garde_nuit',  '18:00', '07:00', '', '', 780),
  ('sec_jour', 'Sécurité jour 6h-18h (12 h)',   'journee',     '06:00', '18:00', '', '', 720),
  -- Journées coupées, dans les quatre écritures rencontrées.
  ('j_7_17',   'Journée 7h-12h / 14h-17h',      'fractionnee', '07:00', '12:00', '14:00', '17:00', 480),
  ('j_7_1630', 'Journée 7h-12h / 14h-16h30',    'fractionnee', '07:00', '12:00', '14:00', '16:30', 450),
  ('j_8_16',   'Journée 8h-12h / 14h-16h',      'fractionnee', '08:00', '12:00', '14:00', '16:00', 360),
  -- Demi-journées.
  ('m_7_12',   'Matin 7h-12h',                  'demi',        '07:00', '12:00', '', '', 300),
  ('m_8_1130', 'Matin 8h-11h30',                'demi',        '08:00', '11:30', '', '', 210),
  ('m_8_11',   'Matin 8h-11h',                  'demi',        '08:00', '11:00', '', '', 180),
  -- Absences et jours non travaillés.
  ('conge',    'Congé',                         'repos',       '', '', '', '', 0),
  ('maternite','Congé maternité',               'repos',       '', '', '', '', 0),
  ('ferie',    'Jour férié',                    'repos',       '', '', '', '', 0),
  ('absence',  'Absence',                       'repos',       '', '', '', '', 0)
on conflict (id) do nothing;

-- ── Services du Centre REX, dans l'ordre du planning papier ──────────────
--    L'ordre n'est pas cosmétique : la 5e colonne des feuilles Excel change
--    de sens selon la POSITION de la ligne dans le bloc du jour (les quatre
--    premières portent Ouverture / Clôture / Absente / Congé du jour, les
--    suivantes la salle du service en regard). Conserver cet ordre permet de
--    relire les anciens plannings sans les réinterpréter.
insert into planning.services (id, libelle, centre, rang) values
  ('securite',    'Sécurité',                    'REX', 10),
  ('nettoyage',   'Nettoyage',                   'REX', 20),
  ('reception',   'Réception',                   'REX', 30),
  ('caisse',      'Accueil-Caisse',              'REX', 40),
  ('consult',     'Consultations',               'REX', 50),
  ('echo',        'Échographies',                'REX', 60),
  ('mammo',       'Mammographie',                'REX', 70),
  ('gyneco',      'Gynécologie',                 'REX', 80),
  ('pediatrie',   'Pédiatrie',                   'REX', 90),
  ('nutrition',   'Nutrition',                   'REX', 100),
  ('cpn',         'CPN',                         'REX', 110),
  ('paptest',     'Pap-test',                    'REX', 120),
  ('coloration',  'Coloration',                  'REX', 130),
  ('cytologie',   'Cytologie',                   'REX', 140),
  ('vaccins',     'Vaccins',                     'REX', 150),
  ('pharmacie',   'Pharmacie',                   'REX', 160),
  ('labo_gal',    'Laboratoire galénique',       'REX', 170),
  ('labo_analyse','Laboratoire d''analyses',     'REX', 180),
  ('chauffeur',   'Chauffeur + Logistique',      'REX', 190),
  ('admin',       'Administration',              'REX', 200),
  ('mission',     'Mission',                     'REX', 900)
on conflict (id) do nothing;

-- ── Paramètre relevé chez MIARAKA ────────────────────────────────────────
insert into planning.parametres (cle, valeur, note) values
  ('quota_mensuel_minutes', '12480',
   'Quota mensuel de référence à MIARAKA : 208 h. Valeur pivot des feuilles, '
   'servant à calculer l''écart par agent (+23, 0, -33…).')
on conflict (cle) do nothing;

-- Contrôle : select count(*) from planning.creneaux;  → 24 modèles
--            select count(*) from planning.services;  → 21 services
