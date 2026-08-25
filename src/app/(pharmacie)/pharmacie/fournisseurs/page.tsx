import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Truck, Phone, Mail, MapPin, FileBadge } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { GlassCard } from "@/components/glass/glass-card";
import { PanneBanner } from "@/components/layout/panne-banner";
import { safe } from "@/lib/sheets/safe";
import { sbSelect } from "@/lib/supabase-server";
import { listAchats } from "@/lib/pharmacie/sheets";
import { getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fournisseurs (Pharmacie)" };

/* ============================================================
   FICHE FOURNISSEURS — consultation seule
   ============================================================

   Une page d'INFORMATION, pas de gestion : qui sont nos fournisseurs,
   comment les joindre, sous quelle immatriculation ils facturent, et ce
   qu'on leur a acheté. Les données d'identité viennent des factures
   originales ; les chiffres d'achat viennent du registre — les deux se
   recoupent, c'est le but.

   La lecture tolère l'absence des colonnes d'immatriculation (migration
   020 non passée) : la fiche montre alors le contact seul plutôt que de
   tomber en panne.
   ============================================================ */

interface Fournisseur {
  id: string;
  nom: string;
  telephone: string;
  email: string;
  adresse: string;
  nif?: string;
  stat?: string;
  rc?: string;
  note?: string;
}

function fmtAr(n: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) + " Ar";
}

export default async function FournisseursPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "app:pharmacie")) redirect("/apps");
  const lang = session.user.lang;
  const t = getT(lang);

  const fournRes = await safe<Fournisseur[]>(
    async () => (await sbSelect<Fournisseur>("pharmacie", "fournisseurs", { limit: 500 })).rows,
    [],
  );
  const achatsRes = await safe(() => listAchats(), []);

  /* Agrégats d'achat par fournisseur — le rapprochement entre la fiche et
     le registre. Le nom sert de clé : c'est lui que portent les factures. */
  const parFournisseur = new Map<string, { nb: number; total: number; derniere: string }>();
  for (const a of achatsRes.data) {
    const cle = (a.fournisseur || "").trim().toUpperCase();
    if (!cle) continue;
    const e = parFournisseur.get(cle) ?? { nb: 0, total: 0, derniere: "" };
    e.nb += 1;
    e.total += Number(a.montant_total ?? 0);
    const d = a.date_facture || a.timestamp.slice(0, 10);
    if (d > e.derniere) e.derniere = d;
    parFournisseur.set(cle, e);
  }

  const fiches = [...fournRes.data].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  // Fournisseurs présents au registre mais sans fiche : dits plutôt que tus.
  const sansFiche = [...parFournisseur.keys()].filter(
    (n) => !fiches.some((f) => f.nom.trim().toUpperCase() === n),
  );

  return (
    <main id="main-content" className="mx-auto max-w-5xl flex-1 p-4 md:p-10 space-y-6">
      <div>
        <Link
          href="/pharmacie"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("pharmacie.title")}
        </Link>
        <h1 className="mt-3 flex items-center gap-2 font-display text-3xl font-semibold tracking-tight">
          <Truck className="size-6 text-accent" aria-hidden="true" />
          {t("pharmacie.fournisseurs_title")}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {t("pharmacie.fournisseurs_subtitle")}
        </p>
      </div>

      {!fournRes.ok ? (
        <PanneBanner
          titre={t("pharmacie.panne_titre")}
          consigne={t("pharmacie.panne_consigne")}
          detail={fournRes.error}
        />
      ) : fiches.length === 0 ? (
        <GlassCard className="p-8 text-center text-sm text-muted-foreground">
          {t("pharmacie.fournisseurs_vide")}
        </GlassCard>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {fiches.map((f) => {
            const stats = parFournisseur.get(f.nom.trim().toUpperCase());
            return (
              <GlassCard key={f.id} className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-display text-lg font-semibold">{f.nom}</h2>
                  {stats && (
                    <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[11px] text-accent whitespace-nowrap">
                      {t("pharmacie.fournisseurs_n_factures", { n: stats.nb })}
                    </span>
                  )}
                </div>

                <ul className="space-y-1.5 text-sm">
                  {f.adresse && (
                    <li className="flex items-start gap-2">
                      <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span>{f.adresse}</span>
                    </li>
                  )}
                  {f.telephone && (
                    <li className="flex items-start gap-2">
                      <Phone className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="font-mono text-xs">{f.telephone}</span>
                    </li>
                  )}
                  {f.email && (
                    <li className="flex items-start gap-2">
                      <Mail className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <a href={`mailto:${f.email}`} className="text-accent hover:underline">
                        {f.email}
                      </a>
                    </li>
                  )}
                </ul>

                {(f.nif || f.stat || f.rc) && (
                  <div className="rounded-xl border border-glass-border bg-foreground/3 p-3 text-xs space-y-1">
                    <p className="flex items-center gap-1.5 font-medium text-muted-foreground">
                      <FileBadge className="size-3.5" aria-hidden="true" />
                      {t("pharmacie.fournisseurs_immatriculation")}
                    </p>
                    {f.nif && <p className="font-mono">NIF {f.nif}</p>}
                    {f.stat && <p className="font-mono">STAT {f.stat}</p>}
                    {f.rc && <p className="font-mono">{f.rc}</p>}
                  </div>
                )}

                {f.note && <p className="text-xs text-muted-foreground">{f.note}</p>}

                {stats && (
                  <p className="border-t border-glass-border pt-2.5 text-xs text-muted-foreground">
                    {t("pharmacie.fournisseurs_stats", {
                      total: fmtAr(stats.total),
                      date: stats.derniere,
                    })}
                  </p>
                )}
              </GlassCard>
            );
          })}
        </div>
      )}

      {sansFiche.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("pharmacie.fournisseurs_sans_fiche", { liste: sansFiche.join(", ") })}
        </p>
      )}
    </main>
  );
}
