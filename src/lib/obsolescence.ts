import type { Material } from "@/types";

/* ============================================================
   ALGORITHME DE SCORE D'OBSOLESCENCE (0-100)
   ============================================================
   Score = 100 (neuf / moderne) → 0 (obsolète à remplacer)

   Pondération :
   - Âge (poids 40)           : -5/an au delà de 3 ans
   - OS (poids 30)            : Win XP -40 / Win 7 -25 / Win 10 -10 / Win 11 0 / autres 0
   - État (poids 20)          : panne -20 / hors service -30 / en réparation -10
   - Pannes historiques (10)  : -3 par panne déclarée (max -10)

   Catégorisation :
   - >= 70 : OK
   - 40-69 : À surveiller
   - <  40 : À remplacer en priorité
*/

export type ObsolescenceLevel = "ok" | "warning" | "critical";

export interface ObsolescenceResult {
  score: number;
  level: ObsolescenceLevel;
  reasons: string[];
}

export function scoreObsolescence(
  material: Pick<Material, "purchaseDate" | "os" | "state">,
  options?: { pannesCount?: number },
): ObsolescenceResult {
  let score = 100;
  const reasons: string[] = [];

  // --- Âge (à partir de la date d'achat) ---
  if (material.purchaseDate) {
    const purchase = new Date(material.purchaseDate);
    if (!Number.isNaN(purchase.getTime())) {
      const ageYears = (Date.now() - purchase.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      if (ageYears > 3) {
        const penalty = Math.min(40, Math.round((ageYears - 3) * 5));
        score -= penalty;
        if (penalty > 0) reasons.push(`Âge : ${ageYears.toFixed(1)} ans (-${penalty})`);
      }
    }
  }

  // --- OS ---
  const os = (material.os ?? "").toLowerCase();
  if (os.includes("xp")) {
    score -= 40;
    reasons.push("OS obsolète : Windows XP (-40)");
  } else if (os.includes("windows 7") || os.includes("win 7") || os.includes("win7")) {
    score -= 25;
    reasons.push("OS ancien : Windows 7 (-25)");
  } else if (os.includes("windows 8")) {
    score -= 20;
    reasons.push("OS ancien : Windows 8 (-20)");
  } else if (os.includes("windows 10") || os.includes("win 10") || os.includes("win10")) {
    score -= 10;
    reasons.push("OS : Windows 10 (fin de support 2025) (-10)");
  }

  // --- État ---
  switch (material.state) {
    case "en_panne":
      score -= 20;
      reasons.push("En panne (-20)");
      break;
    case "hors_service":
      score -= 30;
      reasons.push("Hors service (-30)");
      break;
    case "en_reparation":
      score -= 10;
      reasons.push("En réparation (-10)");
      break;
    case "obsolete":
      score -= 40;
      reasons.push("Marqué obsolète (-40)");
      break;
  }

  // --- Pannes historiques ---
  if (options?.pannesCount && options.pannesCount > 0) {
    const penalty = Math.min(10, options.pannesCount * 3);
    score -= penalty;
    reasons.push(`${options.pannesCount} panne(s) historique(s) (-${penalty})`);
  }

  score = Math.max(0, Math.min(100, score));

  const level: ObsolescenceLevel = score >= 70 ? "ok" : score >= 40 ? "warning" : "critical";

  return { score, level, reasons };
}

export const LEVEL_LABELS: Record<ObsolescenceLevel, { fr: string; it: string }> = {
  ok: { fr: "Opérationnel", it: "Operativo" },
  warning: { fr: "À surveiller", it: "Da monitorare" },
  critical: { fr: "À remplacer", it: "Da sostituire" },
};

export const LEVEL_COLORS: Record<ObsolescenceLevel, string> = {
  ok: "text-[oklch(0.75_0.18_150)] bg-[oklch(0.75_0.18_150_/_0.12)] border-[oklch(0.75_0.18_150_/_0.3)]",
  warning: "text-[oklch(0.82_0.16_85)] bg-[oklch(0.82_0.16_85_/_0.12)] border-[oklch(0.82_0.16_85_/_0.3)]",
  critical: "text-primary bg-brand-soft border-primary/30",
};
