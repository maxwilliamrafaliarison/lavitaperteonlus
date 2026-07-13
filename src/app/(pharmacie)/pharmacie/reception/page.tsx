import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import { listProduitsAvecStock } from "@/lib/pharmacie/sheets";
import { safe } from "@/lib/sheets/safe";
import { getT } from "@/lib/i18n";
import type { ProduitAvecStock } from "@/lib/pharmacie/types";

import { ReceptionForm } from "./reception-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Réception de stock" };

export default async function ReceptionPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "pharmacie:stock")) redirect("/pharmacie");
  const lang = session.user.lang;
  const t = getT(lang);

  const res = await safe<ProduitAvecStock[]>(() => listProduitsAvecStock(), []);

  return (
    <main id="main-content" className="mx-auto max-w-7xl flex-1 p-4 md:p-10 space-y-6">
      <div>
        <Link
          href="/pharmacie"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("pharmacie.title")}
        </Link>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
          {t("pharmacie.reception_title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("pharmacie.reception_subtitle")}
        </p>
      </div>

      <ReceptionForm produits={res.data} lang={lang} />
    </main>
  );
}
