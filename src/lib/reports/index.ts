import { renderToStream, type DocumentProps } from "@react-pdf/renderer";
import * as React from "react";

import {
  fetchInventaire,
  fetchARemplacer,
  fetchValorisation,
  fetchMouvements,
  fetchParUtilisateur,
  fetchParSalle,
} from "./fetchers";
import { InventairePdf } from "./templates/inventaire";
import { ARemplacerPdf } from "./templates/a-remplacer";
import { ValorisationPdf } from "./templates/valorisation";
import { MouvementsPdf } from "./templates/mouvements";
import { ParUtilisateurPdf } from "./templates/par-utilisateur";
import { ParSallePdf } from "./templates/par-salle";
import type { ReportType, ReportFilters, ReportContext } from "./types";

/**
 * Construit le résumé des filtres affichés dans le PDF (context box).
 */
function buildFiltersSummary(
  filters: ReportFilters,
  ctx: ReportContext,
  enriched: {
    siteName?: string;
    roomName?: string;
    typeLabel?: string;
    stateLabel?: string;
  } = {},
): { label: string; value: string }[] {
  const L = ctx.lang === "it"
    ? { site: "Sito", room: "Sala", type: "Tipo", state: "Stato", score: "Punteggio", threshold: "Soglia", period: "Periodo", assigned: "Assegnato a", service: "Reparto", all: "Tutti" }
    : { site: "Site", room: "Salle", type: "Type", state: "État", score: "Score", threshold: "Seuil", period: "Période", assigned: "Affecté à", service: "Service", all: "Tous" };

  const out: { label: string; value: string }[] = [];
  if (enriched.siteName) out.push({ label: L.site, value: enriched.siteName });
  if (enriched.roomName) out.push({ label: L.room, value: enriched.roomName });
  if (enriched.typeLabel) out.push({ label: L.type, value: enriched.typeLabel });
  if (enriched.stateLabel) out.push({ label: L.state, value: enriched.stateLabel });
  if (filters.maxScore != null) out.push({ label: L.threshold, value: `≤ ${filters.maxScore}` });
  if (filters.assignedTo) out.push({ label: L.assigned, value: filters.assignedTo });
  if (filters.service) out.push({ label: L.service, value: filters.service });

  return out;
}

/**
 * Génère un PDF et retourne le flux binaire.
 * Utilisé depuis l'API route /api/reports/[type].
 */
export async function generateReportPdf(
  type: ReportType,
  filters: ReportFilters,
  ctx: ReportContext,
  enriched: {
    siteName?: string;
    roomName?: string;
    typeLabel?: string;
    stateLabel?: string;
    groupedByService?: boolean;
  } = {},
): Promise<NodeJS.ReadableStream> {
  const filtersSummary = buildFiltersSummary(filters, ctx, enriched);

  let element: React.ReactElement;

  switch (type) {
    case "inventaire": {
      const data = await fetchInventaire(filters);
      element = React.createElement(InventairePdf, { data, ctx, filtersSummary });
      break;
    }
    case "a_remplacer": {
      const data = await fetchARemplacer(filters);
      element = React.createElement(ARemplacerPdf, { data, ctx, filtersSummary });
      break;
    }
    case "valorisation": {
      const data = await fetchValorisation(filters);
      element = React.createElement(ValorisationPdf, { data, ctx, filtersSummary });
      break;
    }
    case "mouvements": {
      const data = await fetchMouvements(filters);
      element = React.createElement(MouvementsPdf, { data, ctx, filtersSummary });
      break;
    }
    case "par_utilisateur": {
      const data = await fetchParUtilisateur(filters);
      element = React.createElement(ParUtilisateurPdf, {
        data,
        ctx,
        filtersSummary,
        groupedByService: !!enriched.groupedByService,
      });
      break;
    }
    case "par_salle": {
      const data = await fetchParSalle(filters);
      element = React.createElement(ParSallePdf, { data, ctx });
      break;
    }
    default:
      throw new Error(`Report type inconnu : ${type}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await renderToStream(element as React.ReactElement<DocumentProps> as any);
}

/**
 * Construit un nom de fichier propre pour le téléchargement.
 */
export function reportFilename(type: ReportType, filters: ReportFilters): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const parts = [`lvpt-${type.replace(/_/g, "-")}`];
  if (filters.siteId) parts.push(filters.siteId.replace("site_", ""));
  if (filters.roomId) parts.push(filters.roomId.replace("room_", ""));
  parts.push(date);
  return parts.join("_") + ".pdf";
}

export type { ReportType, ReportFilters, ReportContext };
export { REPORT_CATALOG } from "./types";
