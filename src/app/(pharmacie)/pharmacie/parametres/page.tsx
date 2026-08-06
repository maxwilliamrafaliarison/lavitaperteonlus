import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { listParametres } from "@/lib/pharmacie/sheets";
import { safe } from "@/lib/sheets/safe";
import { getT } from "@/lib/i18n";

import { ParametresForm } from "./parametres-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Paramètres pharmacie" };

export default async function ParametresPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Réservé à l'administrateur : le paramétrage comptable n'est pas du
  // ressort du comptoir.
  if (!can(session.user.role, "pharmacie:config")) redirect("/pharmacie");
  const lang = session.user.lang;
  const t = getT(lang);

  const params = await safe(() => listParametres(), new Map<string, string>());
  const lire = (k: string) => (params.data.get(k) ?? "").trim();
  const initial = {
    tvaActive: params.data.get("tva_active") === "1",
    tvaTaux: Number(params.data.get("tva_taux") ?? "0") || 0,
    siegeSocial: lire("entite_siege_social"),
    codeFiscal: lire("entite_code_fiscal"),
    denomination: lire("entite_denomination"),
    formeJuridique: lire("entite_forme_juridique"),
    emailCaisse: lire("email_caisse_destinataires"),
    nif: lire("entite_nif") || lire("facture_nif"),
    stat: lire("entite_stat") || lire("facture_stat"),
  };

  return (
    <main id="main-content" className="mx-auto max-w-3xl flex-1 p-4 md:p-10 space-y-6">
      <div>
        <Link
          href="/pharmacie"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("pharmacie.title")}
        </Link>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
          {t("pharmacie.param_title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
          {t("pharmacie.param_subtitle")}
        </p>
      </div>

      <ParametresForm initial={initial} lang={lang} />
    </main>
  );
}
