import QRCode from "qrcode";
import { QrCode } from "lucide-react";
import { GlassCard } from "@/components/glass/glass-card";
import { QrActionsButtons } from "./qr-actions";

interface Props {
  materialId: string;
  materialRef: string;
  designation: string;
  /** URL publique à encoder (ex: https://lavitaperteonlus.vercel.app/materials/abc). */
  url: string;
}

/**
 * Server component qui génère le SVG du QR code côté serveur.
 * Les actions (télécharger SVG, imprimer étiquette) sont déléguées à un
 * sous-composant client (QrActionsButtons).
 */
export async function QrCodeCard({ materialId, materialRef, designation, url }: Props) {
  // SVG natif, rendu une seule fois côté serveur
  const svg = await QRCode.toString(url, {
    type: "svg",
    margin: 1,
    width: 200,
    errorCorrectionLevel: "M",
    color: {
      dark: "#0a0a0b",
      light: "#ffffff",
    },
  });

  return (
    <GlassCard className="p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="inline-flex size-9 items-center justify-center rounded-xl bg-accent/15 text-accent shrink-0">
            <QrCode className="size-4" />
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold">QR code</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Scanner pour ouvrir la fiche depuis un téléphone.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-6">
        {/* QR visuel : cadre blanc pour contraste en mode sombre */}
        <div
          className="qr-svg-wrapper inline-flex items-center justify-center rounded-2xl bg-white p-3 shadow-md shrink-0"
          dangerouslySetInnerHTML={{ __html: svg }}
          aria-label={`QR code vers la fiche ${materialRef}`}
        />

        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Lien encodé
          </p>
          <p className="text-xs font-mono text-muted-foreground break-all leading-relaxed">
            {url}
          </p>

          <QrActionsButtons
            url={url}
            materialId={materialId}
            materialRef={materialRef}
            designation={designation}
          />
        </div>
      </div>

      <style>{`
        .qr-svg-wrapper svg {
          display: block;
          width: 180px;
          height: 180px;
        }
      `}</style>
    </GlassCard>
  );
}
