-- Migration 002 — Caisse + Lettres (FileMaker juillet 2026)
-- Complète le schéma patients : encaissements et comptes-rendus PAP.
-- À exécuter dans le SQL Editor Supabase, après 001_patients.sql.

-- encaissements par patiente (PAP, HPV, colpo, mamo, écho, consult + n° de reçus)
create table if not exists patients.caisse (
  id bigint generated always as identity primary key,
  fmp_row integer,
  n_patiente text,
  nom_prenom text,
  date_de_naissance text,
  percu_pap text,
  percu_hpv text,
  percu_colpo text,
  percu_mamo text,
  percu_echo text,
  percu_consult text,
  n_recu_pap text,
  n_recu_hpv text,
  n_recu_colpo text,
  n_recu_mamo text,
  n_recu_echo text,
  n_recu_consult text,
  mois_annee text,
  total_percu_pap text,
  total_percu_hpv text,
  total_general text,
  total_percu_colpo text,
  total_percu_mamo text,
  total_percu_echo text,
  total_percu_consult text,
  date text,
  rubrique_28 text,
  csb text,
  prise_en_charge text,
  total_de_prise_en_charge text,
  percu_seno text,
  total_percu_seno text,
  part_pap_dans_le_total text,
  part_hpv_dans_le_total text,
  part_colpo_dans_le_total text,
  part_mamo_dans_le_total text,
  part_gene_dans_le_total text,
  part_seno_dans_le_total text,
  percu_pediatrie text,
  total_percu_pediatrie text,
  part_pedia_dans_le_total text,
  part_echo_dans_le_total text,
  percu_soins text,
  total_percu_soins text,
  part_soins_dans_le_total text,
  percu_biopanap text,
  total_percu_biopanap text,
  part_biopanap_dans_le_total text,
  consultation text,
  percu_cpn text,
  total_percu_cpn text,
  part_cpn_dans_le_total text,
  percu_examen_histo text,
  total_percu_examen_histo text,
  part_examen_histo text,
  imported_at timestamptz not null default now()
);
alter table patients.caisse enable row level security;

-- comptes-rendus cytologie PAP (classification, conduite à tenir)
create table if not exists patients.lettres (
  id bigint generated always as identity primary key,
  fmp_row integer,
  k00_negatif_pour_une_lesion_intra_epitheliale_ou_maligne text,
  k00_differenciation text,
  kkk_qualite_du_prelevement text,
  kay_micro_organismes text,
  repetition_pour_raison_specifique text,
  conduite_a_tenir_conseillee text,
  repetition_normale_pap_test_negatif_selon_protocole_de_sc text,
  provenance_de_la_lame text,
  n_patiente text,
  nom_prenom text,
  date_de_naissance text,
  adresse text,
  pap_test_n text,
  acceptee_le text,
  j00_anomalies_des_cellules_epitheliales_malpighiennes text,
  y00_anomalies_des_cellules_epitheliales_glandulaires text,
  numero_du_tube text,
  date_prelevement_hpv text,
  centre_de_prelevement_hpv text,
  conduite_a_tenir_conseillee_hpv text,
  resultat_hpv text,
  le_cytologiste text,
  imported_at timestamptz not null default now()
);
alter table patients.lettres enable row level security;

create index if not exists caisse_patiente_idx on patients.caisse (n_patiente);
create index if not exists lettres_patiente_idx on patients.lettres (n_patiente);
grant all on all tables in schema patients to service_role;
