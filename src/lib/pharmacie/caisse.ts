import { sbSelect, sbInsert, sbUpdate } from "@/lib/supabase-server";

/* ============================================================
   SESSIONS DE CAISSE — ouverture comptée, clôture comptée
   ============================================================

   La journée de caisse est un objet : ouverte avec un fonds initial, close
   avec un comptage d'espèces. Le THÉORIQUE se calcule, il ne se déclare
   pas : fonds + ventes comptant (non annulées) enregistrées entre
   l'ouverture et la clôture. L'écart signé est conservé tel quel — un
   manque se voit, il ne se maquille pas.

   Le comptage est demandé À L'AVEUGLE : l'écran de clôture ne montre pas le
   théorique avant la saisie, sinon le comptage « retombe juste » toujours.

   Une session close ne se modifie plus. Une seule session ouverte par site
   (index partiel en base) : toute vente comptant appartient sans ambiguïté
   à la session ouverte de son site.
   ============================================================ */

const SCHEMA = "pharmacie";
const TABLE = "caisse_sessions";

export interface CaisseSession {
  id: string;
  site: string;
  statut: "ouverte" | "fermee";
  ouverte_par: string;
  ouverte_le: string;
  fonds_initial: number;
  fermee_par: string;
  fermee_le: string;
  especes_comptees: number | null;
  total_theorique: number | null;
  ecart: number | null;
  note: string;
}

/** La session ouverte du site, ou null (caisse fermée). */
export async function getCaisseOuverte(site = "REX"): Promise<CaisseSession | null> {
  const { rows } = await sbSelect<CaisseSession>(SCHEMA, TABLE, {
    filters: { site: `eq.${site}`, statut: "eq.ouverte" },
    limit: 1,
  });
  return rows[0] ?? null;
}

export async function ouvrirCaisse(params: {
  par: string;
  fondsInitial: number;
  site?: string;
}): Promise<CaisseSession> {
  const site = params.site ?? "REX";
  const session: CaisseSession = {
    id: `CSE-${Date.now().toString(36).toUpperCase()}`,
    site,
    statut: "ouverte",
    ouverte_par: params.par,
    ouverte_le: new Date().toISOString(),
    fonds_initial: params.fondsInitial,
    fermee_par: "",
    fermee_le: "",
    especes_comptees: null,
    total_theorique: null,
    ecart: null,
    note: "",
  };
  // L'index unique partiel fait respecter « une seule ouverte par site » :
  // deux ouvertures simultanées → la seconde échoue, on relit la gagnante.
  try {
    await sbInsert(SCHEMA, TABLE, [session as unknown as Record<string, unknown>]);
    return session;
  } catch (e) {
    const deja = await getCaisseOuverte(site);
    if (deja) return deja;
    throw e;
  }
}

/**
 * Total théorique en espèces d'une session : fonds initial + ventes COMPTANT
 * non annulées depuis l'ouverture. Les PEC n'encaissent rien ; une vente
 * annulée pendant la session n'a pas laissé d'argent dans le tiroir.
 * Paginé : PostgREST plafonne chaque réponse à 1000 lignes.
 *
 * ⚠️ Le rapprochement se fait sur le TEMPS seul, pas sur le site : la table
 * `ventes` ne porte pas de colonne de site, la pharmacie n'existant qu'au
 * centre REX. Le jour où une seconde officine ouvrira, il faudra ajouter
 * cette colonne et filtrer ici — sans quoi les deux caisses compteraient
 * les mêmes encaissements.
 */
export async function totalTheorique(session: CaisseSession): Promise<number> {
  let somme = session.fonds_initial;
  for (let offset = 0; ; offset += 1000) {
    const { rows } = await sbSelect<{ total: number; type_vente: string; statut: string }>(
      SCHEMA,
      "ventes",
      {
        select: "total,type_vente,statut",
        filters: { timestamp: `gte.${session.ouverte_le}` },
        limit: 1000,
        offset,
      },
    );
    for (const v of rows) {
      if (String(v.statut ?? "active") === "annulee") continue;
      if (String(v.type_vente ?? "cash") !== "cash") continue;
      somme += Number(v.total ?? 0);
    }
    if (rows.length < 1000) break;
  }
  return somme;
}

export async function cloreCaisse(params: {
  session: CaisseSession;
  par: string;
  especesComptees: number;
  note?: string;
}): Promise<CaisseSession> {
  const theorique = await totalTheorique(params.session);
  const fermee: Partial<CaisseSession> = {
    statut: "fermee",
    fermee_par: params.par,
    fermee_le: new Date().toISOString(),
    especes_comptees: params.especesComptees,
    total_theorique: theorique,
    ecart: params.especesComptees - theorique,
    note: params.note ?? "",
  };
  // Ne clôt que si la session est ENCORE ouverte : deux clôtures simultanées
  // (double clic, second onglet) → une seule écrit, l'autre l'apprend.
  const n = await sbUpdate(
    SCHEMA,
    TABLE,
    { id: `eq.${params.session.id}`, statut: "eq.ouverte" },
    fermee as Record<string, unknown>,
  );
  if (n === 0) throw new Error("Cette caisse a déjà été clôturée.");
  return { ...params.session, ...fermee } as CaisseSession;
}

/** Dernières sessions closes (contrôle direction). */
export async function listSessionsRecentes(site = "REX", limit = 14): Promise<CaisseSession[]> {
  const { rows } = await sbSelect<CaisseSession>(SCHEMA, TABLE, {
    filters: { site: `eq.${site}` },
    order: "ouverte_le.desc",
    limit,
  });
  return rows;
}
