"use server";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import {
  rechercherPatientes,
  logAccesPatient,
  type PatientResume,
} from "@/lib/patients/supabase";

export type RechercheResult =
  | { ok: true; patientes: PatientResume[] }
  | { ok: false; error: string };

export async function rechercherPatientesAction(
  q: string,
): Promise<RechercheResult> {
  const session = await auth();
  if (!session?.user || !can(session.user.role, "app:patients")) {
    return { ok: false, error: "Accès refusé." };
  }
  const terme = q.trim();
  if (terme.length < 2) return { ok: true, patientes: [] };

  try {
    const patientes = await rechercherPatientes(terme);
    // Trace la recherche (pas de dossier précis ; on loggue le terme)
    await logAccesPatient({
      userEmail: session.user.email ?? "",
      action: "recherche",
      details: `« ${terme} » → ${patientes.length} résultat(s)`,
    });
    return { ok: true, patientes };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 160) };
  }
}
