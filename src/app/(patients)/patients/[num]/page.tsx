import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, User, Calendar, MapPin, Phone, Stethoscope } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { GlassCard } from "@/components/glass/glass-card";
import {
  visitesDeLaPatiente,
  logAccesPatient,
  type DossierRow,
} from "@/lib/patients/supabase";
import { getT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Dossier patiente" };

/** Première valeur non vide parmi les visites (identité stable). */
function premier(visites: DossierRow[], champ: keyof DossierRow): string {
  for (const v of visites) {
    const val = v[champ];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return "";
}

export default async function DossierPatientePage({
  params,
}: {
  params: Promise<{ num: string }>;
}) {
  const { num } = await params;
  const nPatiente = decodeURIComponent(num);
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "app:patients")) redirect("/apps");
  const lang = session.user.lang;
  const t = getT(lang);

  const visites = await visitesDeLaPatiente(nPatiente);
  if (visites.length === 0) notFound();

  // Journal d'accès RGPD : consultation d'un dossier patiente.
  // `nPatiente` va dans sa propre colonne, pas seulement dans le texte :
  // c'est ce qui permet de répondre à « qui a consulté mon dossier ? »
  // (art. 15) par une requête, et non en relisant des phrases à la main.
  await logAccesPatient({
    userEmail: session.user.email ?? "",
    action: "consultation_dossier",
    nPatiente,
    details: `${visites.length} visite(s)`,
  });

  const nom = premier(visites, "nom_prenom") || t("patients.sans_nom");
  const naissance = premier(visites, "date_de_naissance");
  const adresse = premier(visites, "adresse");
  const tel = premier(visites, "tel");

  // Champs d'examen affichés par visite (libellé i18n → clé colonne)
  const EXAMENS: Array<{ key: keyof DossierRow; labelKey: string }> = [
    { key: "pap", labelKey: "patients.exam_pap" },
    { key: "hpv", labelKey: "patients.exam_hpv" },
    { key: "colposcopies", labelKey: "patients.exam_colpo" },
    { key: "mamo", labelKey: "patients.exam_mamo" },
    { key: "echographies", labelKey: "patients.exam_echo" },
    { key: "resultat", labelKey: "patients.exam_resultat" },
    { key: "resultat_histologique", labelKey: "patients.exam_histo" },
  ];

  return (
    <main id="main-content" className="mx-auto max-w-4xl flex-1 p-4 md:p-10 space-y-6">
      <Link
        href="/patients"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("patients.back_search")}
      </Link>

      {/* Identité */}
      <GlassCard className="p-6">
        <div className="flex items-start gap-4">
          <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-accent/15 text-accent shrink-0">
            <User className="size-7" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">
              {nom}
            </h1>
            <p className="text-xs text-muted-foreground font-mono">
              N° {nPatiente}
            </p>
            <dl className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2 text-sm">
              {naissance && (
                <Info icon={<Calendar className="size-3.5" />} label={t("patients.naissance")} value={naissance} />
              )}
              {adresse && (
                <Info icon={<MapPin className="size-3.5" />} label={t("patients.adresse")} value={adresse} />
              )}
              {tel && (
                <Info icon={<Phone className="size-3.5" />} label={t("patients.tel")} value={tel} />
              )}
              <Info
                icon={<Stethoscope className="size-3.5" />}
                label={t("patients.total_visites")}
                value={String(visites.length)}
              />
            </dl>
          </div>
        </div>
      </GlassCard>

      {/* Historique des visites */}
      <section aria-label={t("patients.historique")}>
        <h2 className="font-display text-lg font-semibold mb-4">
          {t("patients.historique")} ({visites.length})
        </h2>
        <ul role="list" className="space-y-3">
          {visites.map((v) => {
            const examens = EXAMENS.filter(
              (e) => typeof v[e.key] === "string" && (v[e.key] as string).trim(),
            );
            const medecin = typeof v.nom_du_medecin === "string" ? v.nom_du_medecin.trim() : "";
            const csb = typeof v.csb === "string" ? v.csb.trim() : "";
            const renseignements =
              typeof v.renseignements_cliniques === "string"
                ? v.renseignements_cliniques.trim()
                : "";
            return (
              <li key={v.id}>
                <GlassCard className="p-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 font-mono text-sm font-medium">
                      <Calendar className="size-3.5 text-accent" aria-hidden="true" />
                      {v.date || t("patients.sans_date")}
                    </span>
                    <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      {csb && <span>{csb}</span>}
                      {medecin && <span>· {medecin}</span>}
                    </span>
                  </div>

                  {examens.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {examens.map((e) => (
                        <span
                          key={String(e.key)}
                          className="inline-flex items-center gap-1 rounded-full border border-glass-border bg-white/3 px-2 py-0.5 text-[11px]"
                        >
                          <span className="text-muted-foreground">{t(e.labelKey)}:</span>
                          <span className="font-medium">{v[e.key] as string}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {renseignements && (
                    <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                      {renseignements}
                    </p>
                  )}
                </GlassCard>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}

function Info({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className={cn("flex items-start gap-2")}>
      <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </dt>
        <dd className="font-medium truncate">{value}</dd>
      </div>
    </div>
  );
}
