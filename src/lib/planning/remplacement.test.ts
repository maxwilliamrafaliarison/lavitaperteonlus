import { describe, it, expect } from "vitest";

import {
  classerCandidats,
  resumerCandidat,
  type AffectationSimple,
  type AgentCandidat,
  type Besoin,
  type ContexteRemplacement,
  type CreneauModele,
} from "./remplacement";

/* ============================================================
   Une proposition fausse envoie quelqu'un travailler onze heures après sa
   garde de nuit. Chaque cas ci-dessous vérifie donc soit un refus qui doit
   tomber, soit un ordre qui doit tenir.
   ============================================================ */

const CRENEAUX = new Map<string, CreneauModele>([
  ["repos", { id: "repos", libelle: "Repos", type: "repos", debut: "", fin: "", debut2: "", fin2: "", minutes: 0 }],
  ["std7", { id: "std7", libelle: "7h-12h / 14h-17h", type: "fractionnee", debut: "07:00", fin: "12:00", debut2: "14:00", fin2: "17:00", minutes: 480 }],
  ["matin", { id: "matin", libelle: "Matin 8h-12h", type: "demi", debut: "08:00", fin: "12:00", debut2: "", fin2: "", minutes: 240 }],
  ["garde_nuit", { id: "garde_nuit", libelle: "Garde 18h-6h", type: "garde_nuit", debut: "18:00", fin: "06:00", debut2: "", fin2: "", minutes: 720 }],
]);

const agent = (id: string, nom: string, extra: Partial<AgentCandidat> = {}): AgentCandidat => ({
  id,
  nom,
  site: "REX",
  statut: "salarie",
  poste: "",
  actif: true,
  ...extra,
});

const aff = (
  agent_id: string,
  jour: string,
  creneau_id: string,
  service_id = "",
): AffectationSimple => ({ agent_id, jour, creneau_id, service_id, debut: "", fin: "" });

/** `rattacheA` du dépôt : la DRH écrit « MIARAKA/REX » pour les polyvalents. */
const rattacheA = (site: string, centre: string) =>
  site.split(/[/,+]/).map((s) => s.trim().toUpperCase()).includes(centre.trim().toUpperCase());

const contexte = (p: Partial<ContexteRemplacement> = {}): ContexteRemplacement => ({
  affectations: [],
  historique: [],
  creneaux: CRENEAUX,
  absences: new Map(),
  rattacheA,
  ...p,
});

const BESOIN: Besoin = {
  jour: "2026-09-16", // un mercredi
  creneauId: "std7",
  serviceId: "securite",
  posteLibelle: "Sécurité",
  lieu: "",
  centre: "REX",
  motif: "absence",
  agentRemplaceId: "AG-REX-01",
  agentRemplaceNom: "Voahangy",
  natureAbsence: "Congé payé",
  debut: "",
  fin: "",
};

describe("qui est écarté", () => {
  it("n'écarte personne sans raison", () => {
    const r = classerCandidats(BESOIN, [agent("AG-REX-02", "Cynthia")], contexte());
    expect(r).toHaveLength(1);
    expect(r[0].disponible).toBe(true);
  });

  it("ne propose jamais la personne qu'on remplace", () => {
    const r = classerCandidats(BESOIN, [agent("AG-REX-01", "Voahangy"), agent("AG-REX-02", "Cynthia")], contexte());
    expect(r.map((c) => c.agentId)).toEqual(["AG-REX-02"]);
  });

  it("écarte le personnel d'un autre centre, mais garde les polyvalents", () => {
    const r = classerCandidats(
      BESOIN,
      [agent("A", "Miaraka seul", { site: "MIARAKA" }), agent("B", "Polyvalente", { site: "MIARAKA/REX" })],
      contexte(),
    );
    expect(r.map((c) => c.nom)).toEqual(["Polyvalente"]);
  });

  it("écarte le personnel inactif", () => {
    const r = classerCandidats(BESOIN, [agent("A", "Partie", { actif: false })], contexte());
    expect(r).toHaveLength(0);
  });
});

describe("ce qui empêche, sans faire disparaître", () => {
  it("signale la personne déjà affectée ce jour-là, sans la masquer", () => {
    /* On la montre parce qu'il arrive qu'on décide quand même : la faire
       disparaître obligerait à aller la chercher sur un autre écran. */
    const r = classerCandidats(
      BESOIN,
      [agent("A", "Occupée"), agent("B", "Libre")],
      contexte({ affectations: [aff("A", "2026-09-16", "matin")] }),
    );
    expect(r.map((c) => c.nom)).toEqual(["Libre", "Occupée"]);
    expect(r[1].disponible).toBe(false);
    expect(r[1].empechements[0]).toContain("Déjà affecté");
  });

  it("empêche quand une absence est accordée ce jour-là", () => {
    const r = classerCandidats(
      BESOIN,
      [agent("A", "En congé")],
      contexte({ absences: new Map([["A|2026-09-16", "Congé payé"]]) }),
    );
    expect(r[0].disponible).toBe(false);
    expect(r[0].empechements).toEqual(["Congé payé ce jour-là"]);
  });

  it("empêche quand un repos occupe déjà le même service, parce que l'écriture échouerait", () => {
    /* L'unicité de la base porte sur (planning, agent, jour, service) : le
       transfert se heurterait à la ligne de repos. L'annoncer possible
       promettait une opération que la base refuse. */
    const r = classerCandidats(
      BESOIN,
      [agent("A", "Au repos")],
      contexte({ affectations: [aff("A", "2026-09-16", "repos", "securite")] }),
    );
    expect(r[0].disponible).toBe(false);
    expect(r[0].empechements[0]).toContain("Repos prévu");
  });

  it("laisse passer un repos posé sur un autre service, mais le dit", () => {
    const r = classerCandidats(
      BESOIN,
      [agent("A", "Au repos ailleurs")],
      contexte({ affectations: [aff("A", "2026-09-16", "repos", "caisse")] }),
    );
    expect(r[0].disponible).toBe(true);
    expect(r[0].reserves.some((x) => x.includes("Repos prévu"))).toBe(true);
  });

  it("refuse celle qui sortirait de garde de nuit la veille", () => {
    /* LE CAS QUI JUSTIFIE TOUT LE MODULE. Garde du 15 à 18h jusqu'au 16 à
       6h, puis prise de poste le 16 à 7h : une heure de repos. Proposer
       cette personne serait pire que ne rien proposer. */
    const r = classerCandidats(
      BESOIN,
      [agent("A", "Sort de garde"), agent("B", "Reposée")],
      contexte({ affectations: [aff("A", "2026-09-15", "garde_nuit")] }),
    );
    const sortDeGarde = r.find((c) => c.nom === "Sort de garde")!;
    expect(sortDeGarde.disponible).toBe(false);
    expect(sortDeGarde.empechements.join(" ")).toContain("Repos");
    expect(r[0].nom).toBe("Reposée");
  });

  it("n'impute pas au remplacement une alerte née d'une autre semaine", () => {
    // Une garde très antérieure ne doit pas bloquer : elle existait avant,
    // et l'affectation proposée n'y change rien.
    const r = classerCandidats(
      BESOIN,
      [agent("A", "Ancienne garde")],
      contexte({ affectations: [aff("A", "2026-08-01", "garde_nuit")] }),
    );
    expect(r[0].disponible).toBe(true);
  });
});

describe("ce que le remplacement provoque, et rien d'autre", () => {
  it("juge le repos sur l'horaire DÉROGATOIRE, pas sur celui du modèle", () => {
    /* L'affectation est transférée telle quelle. Une ligne 18:00-06:00 posée
       sur un modèle 07:00-17:00 doit être jugée sur 18:00-06:00, sinon on
       propose quelqu'un qui reprendra une heure après avoir fini. */
    const besoinDeroge: Besoin = { ...BESOIN, creneauId: "std7", debut: "18:00", fin: "06:00" };
    const r = classerCandidats(
      besoinDeroge,
      [agent("A", "Reprend le lendemain")],
      // Elle travaille le 17 au matin : la nuit du 16 au 17 la mettrait à
      // une heure de repos.
      contexte({ affectations: [aff("A", "2026-09-17", "matin")] }),
    );
    expect(r[0].disponible).toBe(false);
    expect(r[0].empechements.join(" ")).toContain("Repos");
  });

  it("n'impute pas au remplaçant une infraction qui existait déjà", () => {
    /* Deux gardes consécutives déjà saisies violent le repos journalier.
       Le remplacement porte sur un tout autre jour : lui reprocher cette
       violation le déclarerait indisponible pour une faute qui n'est pas
       la sienne, et l'écran cesserait d'être cru. */
    const r = classerCandidats(
      { ...BESOIN, jour: "2026-09-18" },
      [agent("A", "Déjà en infraction")],
      contexte({
        affectations: [aff("A", "2026-09-14", "garde_nuit"), aff("A", "2026-09-15", "garde_nuit")],
      }),
    );
    expect(r[0].disponible).toBe(true);
  });
});

describe("l'ordre proposé", () => {
  it("met devant celle qui connaît le poste", () => {
    const r = classerCandidats(
      BESOIN,
      [agent("A", "Novice"), agent("B", "Habituée")],
      contexte({
        historique: [
          aff("B", "2026-06-01", "std7", "securite"),
          aff("B", "2026-06-02", "std7", "securite"),
          aff("A", "2026-06-03", "std7", "caisse"), // un autre service
        ],
      }),
    );
    expect(r.map((c) => c.nom)).toEqual(["Habituée", "Novice"]);
    expect(r[0].foisDejaTenu).toBe(2);
    expect(r[1].foisDejaTenu).toBe(0);
    expect(r[1].reserves.some((x) => x.includes("jamais tenu"))).toBe(true);
  });

  it("départage à expérience égale par la semaine la plus légère", () => {
    const histo = [aff("A", "2026-06-01", "std7", "securite"), aff("B", "2026-06-02", "std7", "securite")];
    const r = classerCandidats(
      BESOIN,
      [agent("A", "Chargée"), agent("B", "Légère")],
      contexte({
        historique: histo,
        // A travaille déjà lundi et mardi de la semaine du besoin.
        affectations: [aff("A", "2026-09-14", "std7"), aff("A", "2026-09-15", "std7")],
      }),
    );
    expect(r.map((c) => c.nom)).toEqual(["Légère", "Chargée"]);
    expect(r[1].minutesSemaine).toBeGreaterThan(0);
    expect(r[0].minutesSemaine).toBe(0);
  });

  it("mesure la compétence par TYPE de créneau quand il n'y a pas de service", () => {
    // MIARAKA n'a aucun service en base : son organisation tient au type.
    const besoinMiaraka: Besoin = {
      ...BESOIN,
      centre: "MIARAKA",
      serviceId: "",
      creneauId: "garde_nuit",
      posteLibelle: "Garde de nuit",
    };
    const r = classerCandidats(
      besoinMiaraka,
      [agent("A", "Jamais de garde", { site: "MIARAKA" }), agent("B", "Habituée des gardes", { site: "MIARAKA" })],
      contexte({
        historique: [
          aff("B", "2026-06-01", "garde_nuit"),
          aff("B", "2026-06-03", "garde_nuit"),
          aff("A", "2026-06-02", "matin"),
        ],
      }),
    );
    expect(r[0].nom).toBe("Habituée des gardes");
    expect(r[0].foisDejaTenu).toBe(2);
  });
});

describe("la phrase affichée", () => {
  it("dit d'abord ce qui bloque, quand quelque chose bloque", () => {
    const r = classerCandidats(
      BESOIN,
      [agent("A", "En congé")],
      contexte({ absences: new Map([["A|2026-09-16", "Maladie"]]) }),
    );
    expect(resumerCandidat(r[0])).toBe("Maladie ce jour-là");
  });

  it("résume la disponibilité en une phrase lisible", () => {
    const r = classerCandidats(
      BESOIN,
      [agent("A", "Cynthia")],
      contexte({ historique: [aff("A", "2026-06-01", "std7", "securite")] }),
    );
    expect(resumerCandidat(r[0])).toBe("Libre, a tenu ce poste 1 fois, 0:00 planifiées cette semaine");
  });
});
