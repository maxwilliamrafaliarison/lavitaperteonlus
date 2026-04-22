import type { MaterialType, MaterialState, MovementType } from "@/types";

export type ReportType =
  | "inventaire"
  | "a_remplacer"
  | "valorisation"
  | "mouvements"
  | "par_utilisateur"
  | "par_salle";

export interface ReportFilters {
  // Inventaire / par-type
  siteId?: string;
  roomId?: string;
  materialType?: MaterialType;
  state?: MaterialState;

  // À remplacer
  minScore?: number; // ex: 40 par défaut
  maxScore?: number;

  // Mouvements
  dateFrom?: string; // ISO date
  dateTo?: string;
  movementType?: MovementType;

  // Par utilisateur
  assignedTo?: string; // name substring match
  service?: string; // name match

  // Valorisation
  includeCritical?: boolean;
  includeAll?: boolean;
}

export interface ReportContext {
  /** Langue pour tous les labels du PDF */
  lang: "fr" | "it";
  /** Nom de l'utilisateur qui génère le rapport */
  generatedBy: string;
  /** Date/heure de génération (ISO) */
  generatedAt: string;
  /** Base URL publique de l'app (pour les QR éventuels) */
  baseUrl?: string;
}

export interface ReportMetadata {
  type: ReportType;
  title: { fr: string; it: string };
  description: { fr: string; it: string };
  defaultFilters: ReportFilters;
}

export const REPORT_CATALOG: Record<ReportType, ReportMetadata> = {
  inventaire: {
    type: "inventaire",
    title: {
      fr: "Inventaire complet",
      it: "Inventario completo",
    },
    description: {
      fr: "Liste exhaustive des matériels, groupés par site puis par salle.",
      it: "Elenco esaustivo dei dispositivi, raggruppati per sito e sala.",
    },
    defaultFilters: {},
  },
  a_remplacer: {
    type: "a_remplacer",
    title: {
      fr: "À remplacer en priorité",
      it: "Da sostituire con priorità",
    },
    description: {
      fr: "Matériels avec un score d'obsolescence bas — pour demande de devis.",
      it: "Dispositivi con basso punteggio di obsolescenza — per preventivi.",
    },
    defaultFilters: { maxScore: 40 },
  },
  valorisation: {
    type: "valorisation",
    title: {
      fr: "Valorisation & budget de renouvellement",
      it: "Valutazione & budget di rinnovo",
    },
    description: {
      fr: "Synthèse financière : valeur du parc + budget pour remplacer les critiques.",
      it: "Sintesi finanziaria: valore del parco + budget per sostituire i critici.",
    },
    defaultFilters: {},
  },
  mouvements: {
    type: "mouvements",
    title: {
      fr: "Mouvements sur période",
      it: "Movimenti nel periodo",
    },
    description: {
      fr: "Historique des transferts, créations et mises au rebut.",
      it: "Storico trasferimenti, creazioni e smaltimenti.",
    },
    defaultFilters: {},
  },
  par_utilisateur: {
    type: "par_utilisateur",
    title: {
      fr: "Matériels par personne / service",
      it: "Dispositivi per persona / reparto",
    },
    description: {
      fr: "Qui possède quoi — utile pour les états de sortie / retour de matériel.",
      it: "Chi possiede cosa — utile per le consegne e riconsegne di materiale.",
    },
    defaultFilters: {},
  },
  par_salle: {
    type: "par_salle",
    title: {
      fr: "Fiche d'une salle",
      it: "Scheda di una sala",
    },
    description: {
      fr: "Liste complète des matériels d'une salle spécifique (inventaire physique).",
      it: "Elenco completo dei dispositivi di una sala specifica (inventario fisico).",
    },
    defaultFilters: {},
  },
};
