import { NextRequest, NextResponse } from "next/server";

import { sbSelect, sbInsert } from "@/lib/supabase-server";
import { idPointage } from "@/lib/pointage/parseur";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/* ============================================================
   RÉCEPTION DES POINTAGES — point d'entrée du poste de collecte
   ============================================================
   Le poste d'Aliniaina exécute une tâche planifiée qui lit la pointeuse et
   ENVOIE ici les badgeages bruts. Ce détour par l'application, plutôt qu'une
   écriture directe dans la base, a une raison de sécurité précise : la clé
   de la base ouvre TOUT (patients compris) et n'a rien à faire sur un poste
   de bureau. Le poste ne détient qu'un secret dédié, qui ne permet que ce
   seul geste — déposer des pointages, rien lire, rien effacer.

   Même pipeline idempotent que les autres voies d'entrée : identifiants
   déterministes, agents et badges créés au besoin, journal d'import.
   ============================================================ */

interface PointageRecu {
  id: string; // Personnel ID dans la pointeuse
  horodatage: string; // "YYYY-MM-DD HH:MM:SS", heure LOCALE du centre
}

const HORODATAGE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

export async function POST(req: NextRequest) {
  const secret = process.env.POINTAGE_COLLECTE_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "POINTAGE_COLLECTE_SECRET non configuré sur le serveur." },
      { status: 503 },
    );
  }
  const fourni = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (fourni !== secret) {
    return NextResponse.json({ ok: false, error: "Secret invalide." }, { status: 401 });
  }

  let corps: { site?: string; pointages?: PointageRecu[] };
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Corps JSON attendu." }, { status: 400 });
  }
  const site = String(corps.site ?? "").toUpperCase();
  if (!["REX", "MIARAKA"].includes(site)) {
    return NextResponse.json({ ok: false, error: "Site inconnu (REX ou MIARAKA)." }, { status: 400 });
  }
  const recus = Array.isArray(corps.pointages) ? corps.pointages : [];
  if (recus.length > 20000) {
    return NextResponse.json({ ok: false, error: "Trop de pointages en un envoi (max 20 000)." }, { status: 413 });
  }

  // Validation stricte : la fin de mémoire des pointeuses contient des
  // enregistrements vides datés de 1999 — rien de tout cela n'entre.
  const valides = recus.filter(
    (p) => p && /^\d{1,6}$/.test(String(p.id ?? "")) && HORODATAGE.test(String(p.horodatage ?? "")) && p.horodatage >= "2020-01-01",
  );

  const maintenant = new Date().toISOString();
  try {
    // Agents et badges manquants.
    const { rows: agents } = await sbSelect<{ id: string }>("pointage", "agents", {
      select: "id", order: "id.asc", limit: 5000,
    });
    const idsAgents = new Set(agents.map((a) => a.id));
    const { rows: badges } = await sbSelect<{ id: string }>("pointage", "badges", {
      select: "id", order: "id.asc", limit: 5000,
    });
    const idsBadges = new Set(badges.map((b) => b.id));

    const idsPointeuse = [...new Set(valides.map((p) => String(p.id)))];
    const nvAgents = idsPointeuse
      .filter((i) => !idsAgents.has(`AG-${site}-${i}`))
      .map((i) => ({
        id: `AG-${site}-${i}`, nom: "", prenom: `Agent ${i}`, site, statut: "salarie",
        poste: "", service: "", horaire_id: "std", taux_horaire: 0, actif: true, createdat: maintenant,
      }));
    if (nvAgents.length) await sbInsert("pointage", "agents", nvAgents);
    const nvBadges = idsPointeuse
      .filter((i) => !idsBadges.has(`BDG-${site}-${i}`))
      .map((i) => ({
        id: `BDG-${site}-${i}`, agent_id: `AG-${site}-${i}`, installation: site,
        id_pointeuse: i, valide_du: "", valide_au: "", note: "Créé par le poste de collecte",
      }));
    if (nvBadges.length) await sbInsert("pointage", "badges", nvBadges);

    // Idempotence — PostgREST plafonne à 1000 lignes par réponse : pagination.
    const connus = new Set<string>();
    for (let off = 0; ; off += 1000) {
      const { rows } = await sbSelect<{ id: string }>("pointage", "pointages", {
        select: "id", order: "id.asc", limit: 1000, offset: off,
      });
      rows.forEach((r) => connus.add(r.id));
      if (rows.length < 1000) break;
    }

    const lignes = valides
      .map((p) => {
        const idPtse = String(p.id);
        const brut = {
          idPointeuse: idPtse, prenom: "", horodatage: p.horodatage,
          jour: p.horodatage.slice(0, 10), appareil: site, sensBrut: "none", verif: "",
        };
        return {
          id: idPointage(brut, site),
          agent_id: `AG-${site}-${idPtse}`,
          site_pointage: site,
          horodatage: p.horodatage,
          jour: p.horodatage.slice(0, 10),
          sens_brut: "none", verif: "", appareil: site,
          source: "poste", importe_le: maintenant,
        };
      })
      .filter((l) => !connus.has(l.id));

    for (let i = 0; i < lignes.length; i += 500) {
      await sbInsert("pointage", "pointages", lignes.slice(i, i + 500));
    }

    await sbInsert("pointage", "imports", [{
      id: `IMP-POSTE-${Date.now().toString(36).toUpperCase()}`,
      site,
      fichier: "poste de collecte (tâche planifiée)",
      lignes_lues: recus.length,
      lignes_creees: lignes.length,
      lignes_ignorees: recus.length - lignes.length,
      anomalies: "",
      auteur_email: "poste-collecte",
      timestamp: maintenant,
    }]);

    return NextResponse.json({
      ok: true,
      site,
      recus: recus.length,
      ajoutes: lignes.length,
      dejaPresents: valides.length - lignes.length,
      agentsCrees: nvAgents.length,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Enregistrement impossible : ${String(e).slice(0, 200)}` },
      { status: 500 },
    );
  }
}
