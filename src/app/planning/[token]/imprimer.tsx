"use client";

import { Printer } from "lucide-react";

/** Lance l'impression du navigateur — la mise en page print est en CSS. */
export function BoutonImprimer() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-xl border border-black/15 px-3 py-1.5 text-xs text-neutral-600 hover:bg-black/5 transition-colors print:hidden dark:border-white/15 dark:text-neutral-300 dark:hover:bg-white/5"
    >
      <Printer className="size-3.5" aria-hidden="true" />
      Imprimer
    </button>
  );
}
