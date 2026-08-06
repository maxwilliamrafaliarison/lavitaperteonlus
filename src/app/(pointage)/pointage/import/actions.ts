"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { parserClasseur, idPointage, type PointageBrut } from "@/lib/pointage/parseur";
import {
  listAgents,
  insererPointages,
  insererAgents,
  insererBadges,
  insererImport,
} from "@/lib/pointage/data";
import { sbSelect } from "@/lib/supabase-server";

export type ImportResult =
  | {
      ok: true;
      lignesLues: number;
      creees: number;
      ignorees: number;
      agentsCrees: number;
      anomalies: string[];
    }
  | { ok: false; error: string };

interface BadgeRow {
  id: string;
  agent_id: string;
  installation: string;
  id_pointeuse: string;
}

/**
 * Importe un export ZKAccess (.xls/.xlsx) déposé par le responsable.
 *
 * L'installation d'origine (REX ou MIARAKA) est choisie par l'utilisateur :
 * elle ne peut pas se déduire du fichier, puisque le « Personnel ID » n'a de
 * sens que dans la base de numérotation qui l'a émis — et que le nom du
 * fichier est trompeur (un export « MIARAKA » contient des pointages REX).
 *
 * Les agents inconnus sont CRÉÉS automatiquement plutôt que rejetés : perdre
 * un pointage parce que le référentiel n'est pas à jour serait pire qu'une
 * fiche à compléter. Ils sont nommés d'après le prénom de la pointeuse et
 * rattachés au site de l'installation, à corriger ensuite dans « Personnel ».
 */
export async function importerPointagesAction(
  formData: FormData,
): Promise<ImportResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  if (!can(session.user.role, "pointage:collecter")) {
    return { ok: false, error: "Votre rôle ne permet pas d'importer des pointages." };
  }

  const fichier = formData.get("fichier");
  const installation = String(formData.get("installation") ?? "REX").toUpperCase();
  if (!(fichier instanceof File) || fichier.size === 0) {
    return { ok: false, error: "Aucun fichier reçu." };
  }
  if (!["REX", "MIARAKA"].includes(installation)) {
    return { ok: false, error: "Installation inconnue." };
  }

  try {
    const buf = Buffer.from(await fichier.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    // TOUTES les feuilles : ZKAccess plafonne l'export à 500 lignes et
    // l'opérateur découpe en tranches, une feuille par tranche.
    const feuilles: Array<[string, unknown[][]]> = wb.SheetNames.map((n) => [
      n,
      XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true }),
    ]);
    const parse = parserClasseur(feuilles);
    if (parse.pointages.length === 0) {
      return { ok: false, error: "Aucun pointage exploitable dans ce fichier." };
    }

    // 1. Résoudre chaque Personnel ID → agent, via la table de badges.
    const { rows: badges } = await sbSelect<BadgeRow>("pointage", "badges", {
      select: "*",
      order: "id.asc",
      limit: 1000,
      filters: { installation: `eq.${installation}` },
    });
    const parBadge = new Map(badges.map((b) => [b.id_pointeuse, b.agent_id]));

    // 2. Créer les agents (et badges) inconnus.
    const agentsExistants = await listAgents();
    const idsExistants = new Set(agentsExistants.map((a) => a.id));
    const nouveauxAgents: Record<string, unknown>[] = [];
    const nouveauxBadges: Record<string, unknown>[] = [];
    const maintenant = new Date().toISOString();

    for (const p of parse.pointages) {
      if (parBadge.has(p.idPointeuse)) continue;
      // Identifiant stable et lisible : installation + id pointeuse.
      const agentId = `AG-${installation}-${p.idPointeuse}`;
      if (!idsExistants.has(agentId)) {
        idsExistants.add(agentId);
        nouveauxAgents.push({
          id: agentId,
          nom: "",
          prenom: p.prenom || `Agent ${p.idPointeuse}`,
          site: installation,
          statut: "salarie",
          poste: "",
          service: "",
          horaire_id: "std",
          taux_horaire: 0,
          actif: true,
          createdat: maintenant,
        });
      }
      nouveauxBadges.push({
        id: `BDG-${installation}-${p.idPointeuse}`,
        agent_id: agentId,
        installation,
        id_pointeuse: p.idPointeuse,
        valide_du: "",
        valide_au: "",
        note: "Créé automatiquement à l'import",
      });
      parBadge.set(p.idPointeuse, agentId);
    }
    if (nouveauxAgents.length) await insererAgents(nouveauxAgents);
    if (nouveauxBadges.length) await insererBadges(nouveauxBadges);

    // 3. Ne garder que les pointages absents de la base (idempotence).
    //    ⚠️ PostgREST plafonne CHAQUE réponse à 1000 lignes, quel que soit
    //    le `limit` demandé : sans pagination, la liste des ids connus serait
    //    silencieusement tronquée et un réimport recréerait des doublons dès
    //    le 1001e pointage. On pagine donc explicitement.
    const connus = new Set<string>();
    for (let offset = 0; ; offset += 1000) {
      const { rows } = await sbSelect<{ id: string }>("pointage", "pointages", {
        select: "id",
        order: "id.asc",
        limit: 1000,
        offset,
      });
      for (const r of rows) connus.add(r.id);
      if (rows.length < 1000) break;
    }

    const aInserer = parse.pointages
      .map((p: PointageBrut) => ({
        id: idPointage(p, installation),
        agent_id: parBadge.get(p.idPointeuse) ?? "",
        site_pointage: p.appareil || installation,
        horodatage: p.horodatage,
        jour: p.jour,
        sens_brut: p.sensBrut,
        verif: p.verif,
        appareil: p.appareil,
        source: "import",
        importe_le: maintenant,
      }))
      .filter((r) => !connus.has(r.id));

    await insererPointages(aInserer);

    await insererImport({
      id: `IMP-${Date.now().toString(36).toUpperCase()}`,
      site: installation,
      fichier: fichier.name,
      lignes_lues: parse.lignesLues,
      lignes_creees: aInserer.length,
      lignes_ignorees: parse.pointages.length - aInserer.length + parse.ignoreesDoublons + parse.ignoreesParasites,
      anomalies: parse.anomalies.join(" | "),
      auteur_email: session.user.email ?? "",
      timestamp: maintenant,
    });

    revalidatePath("/pointage");
    revalidatePath("/pointage/import");
    revalidatePath("/pointage/presence");

    return {
      ok: true,
      lignesLues: parse.lignesLues,
      creees: aInserer.length,
      ignorees:
        parse.pointages.length - aInserer.length + parse.ignoreesDoublons + parse.ignoreesParasites,
      agentsCrees: nouveauxAgents.length,
      anomalies: parse.anomalies,
    };
  } catch (e) {
    return { ok: false, error: `Import impossible : ${String(e).slice(0, 200)}` };
  }
}
