"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { GlassButton } from "@/components/glass/glass-button";
import { MATERIAL_TYPE_LABELS, type Material, type Site, type Room } from "@/types";
import { scoreObsolescence, LEVEL_LABELS } from "@/lib/obsolescence";
import { getT, type Lang } from "@/lib/i18n";

interface Props {
  materials: Material[];
  sites: Site[];
  rooms: Room[];
  lang?: Lang;
}

const CSV_HEADERS_FR = [
  "Référence", "Type", "Désignation", "Marque", "Modèle", "Site", "Salle",
  "Affecté à", "OS", "Date d'achat", "Prix (Ar)", "État",
  "Score obsolescence", "Niveau",
];
const CSV_HEADERS_IT = [
  "Riferimento", "Tipo", "Designazione", "Marca", "Modello", "Sito", "Sala",
  "Assegnato a", "OS", "Data acquisto", "Prezzo (Ar)", "Stato",
  "Punteggio obsolescenza", "Livello",
];

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function CsvExportButton({ materials, sites, rooms, lang = "fr" }: Props) {
  const [loading, setLoading] = useState(false);
  const t = getT(lang);

  const handleExport = () => {
    setLoading(true);
    try {
      const siteMap = new Map(sites.map((s) => [s.id, s]));
      const roomMap = new Map(rooms.map((r) => [r.id, r]));

      const rows = materials.map((m) => {
        const { score, level } = scoreObsolescence(m);
        return [
          m.ref,
          MATERIAL_TYPE_LABELS[m.type][lang],
          m.designation,
          m.brand ?? "",
          m.model ?? "",
          siteMap.get(m.siteId)?.code ?? m.siteId,
          roomMap.get(m.roomId)?.name ?? m.roomId,
          m.assignedTo ?? "",
          m.os ?? "",
          m.purchaseDate ?? "",
          m.purchasePrice ?? "",
          m.state,
          score,
          LEVEL_LABELS[level][lang],
        ];
      });

      const headers = lang === "it" ? CSV_HEADERS_IT : CSV_HEADERS_FR;
      const csv = [
        headers.join(","),
        ...rows.map((r) => r.map(csvEscape).join(",")),
      ].join("\n");

      // UTF-8 BOM pour ouverture propre dans Excel
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `parc-la-vita-per-te-${date}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(t("dashboard.export_toast", { n: materials.length }));
    } catch (err) {
      console.error(err);
      toast.error(t("dashboard.export_failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <GlassButton
      variant="glass"
      size="sm"
      onClick={handleExport}
      disabled={loading || materials.length === 0}
    >
      {loading ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Download className="size-3.5" />
      )}
      {t("dashboard.export_csv")}
    </GlassButton>
  );
}
