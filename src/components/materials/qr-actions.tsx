"use client";

import * as React from "react";
import QRCode from "qrcode";
import { Download, Printer, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { GlassButton } from "@/components/glass/glass-button";

interface Props {
  url: string;
  materialId: string;
  materialRef: string;
  designation: string;
}

export function QrActionsButtons({ url, materialId, materialRef, designation }: Props) {
  const [loading, setLoading] = React.useState<"svg" | "print" | null>(null);

  async function handleDownloadSvg() {
    setLoading("svg");
    try {
      const svg = await QRCode.toString(url, {
        type: "svg",
        margin: 2,
        width: 512,
        errorCorrectionLevel: "M",
      });
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const link = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = link;
      a.download = `qr-${materialRef}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(link);
      toast.success("QR téléchargé", { description: `qr-${materialRef}.svg` });
    } catch (e) {
      toast.error("Échec", { description: String(e) });
    } finally {
      setLoading(null);
    }
  }

  async function handlePrintLabel() {
    setLoading("print");
    try {
      const svg = await QRCode.toString(url, {
        type: "svg",
        margin: 2,
        width: 400,
        errorCorrectionLevel: "M",
      });
      const printWindow = window.open("", "_blank", "width=480,height=640");
      if (!printWindow) {
        toast.error("Pop-up bloqué", {
          description: "Autorisez les pop-ups pour imprimer l'étiquette.",
        });
        return;
      }

      printWindow.document.write(`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Étiquette ${materialRef}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif;
    margin: 0;
    padding: 24px;
    background: #fff;
    color: #0a0a0b;
  }
  .label {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 24px;
    border: 2px dashed #ccc;
    border-radius: 16px;
    width: 280px;
    margin: 0 auto;
  }
  .brand {
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #E30613;
    font-weight: 600;
    text-align: center;
  }
  .qr { width: 200px; height: 200px; }
  .qr svg { width: 100%; height: 100%; display: block; }
  .ref {
    font-family: "Geist Mono", ui-monospace, Menlo, monospace;
    font-size: 11px;
    color: #555;
    text-align: center;
    word-break: break-all;
  }
  .designation {
    font-size: 14px;
    font-weight: 600;
    text-align: center;
    line-height: 1.3;
  }
  .footer {
    font-size: 9px;
    color: #999;
    text-align: center;
    margin-top: 4px;
  }
  @media print {
    body { padding: 0; }
    .label { border: none; page-break-inside: avoid; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
  <div class="label">
    <div class="brand">La Vita Per Te</div>
    <div class="qr">${svg}</div>
    <div class="designation">${escapeHtml(designation || materialRef)}</div>
    <div class="ref">${escapeHtml(materialRef)}</div>
    <div class="footer">Scannez pour ouvrir la fiche</div>
  </div>
  <script>
    window.onload = function() { setTimeout(function() { window.print(); }, 100); };
  </script>
</body>
</html>`);
      printWindow.document.close();
    } catch (e) {
      toast.error("Échec", { description: String(e) });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2 pt-2">
      <GlassButton
        type="button"
        variant="glass"
        size="sm"
        onClick={handleDownloadSvg}
        disabled={!!loading}
      >
        {loading === "svg" ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Download className="size-3.5" />
        )}
        Télécharger SVG
      </GlassButton>
      <GlassButton
        type="button"
        variant="glass"
        size="sm"
        onClick={handlePrintLabel}
        disabled={!!loading}
      >
        {loading === "print" ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Printer className="size-3.5" />
        )}
        Imprimer étiquette
      </GlassButton>
    </div>
  );
}

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[c] ?? c;
  });
}
