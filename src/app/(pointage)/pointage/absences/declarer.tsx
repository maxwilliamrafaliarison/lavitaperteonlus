"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass/glass-card";
import { GlassButton } from "@/components/glass/glass-button";
import { cn } from "@/lib/utils";
import { NATURES, REGLES, type NatureAbsence } from "@/lib/pointage/absences";

import { declarerAbsenceAction } from "./actions";

/* ============================================================
   DÉCLARER UNE ABSENCE
   ============================================================

   Trois questions, dans l'ordre où on se les pose en parlant : QUI, POURQUOI,
   QUAND. C'est l'ordre de la phrase qu'on prononce au bureau, « Voahangy sera
   en congé la semaine prochaine », et non celui de la table en base.

   ── CE QUE L'ÉCRAN CALCULE À LA PLACE DE LA PERSONNE ─────────────────────
   Le nombre de jours s'affiche pendant la saisie, sous les deux dates. La
   personne qui déclare n'a donc jamais à compter : elle LIT le décompte et
   le compare à ce qu'on lui a annoncé. Une erreur d'un jour, qui autrement
   ne se découvrirait qu'au bulletin de paie, se voit ici tout de suite.

   Le décompte affiché est une ESTIMATION en jours calendaires, honnêtement
   annoncée comme telle : le chiffre qui fera foi est celui du serveur, qui
   connaît les jours fériés et le mode de décompte paramétré. Mieux vaut un
   ordre de grandeur immédiat qu'un champ vide en attendant une requête.

   ── POURQUOI DES BOUTONS ET NON UNE LISTE DÉROULANTE ─────────────────────
   Sept natures d'absence tiennent à l'écran. Une liste déroulante les cache
   derrière un clic et oblige à lire pour choisir ; sept boutons se
   comparent d'un coup d'œil, et celui qui est retenu reste visible pendant
   toute la suite de la saisie.
   ============================================================ */

export interface PersonneAbsence {
  id: string;
  nom: string;
  site: string;
  poste: string;
}

/** Sans accents ni casse : « Hervé » se trouve en tapant « herve ». */
const aplatir = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function nbJours(du: string, au: string): number {
  if (!du || !au || au < du) return 0;
  return Math.round((Date.parse(`${au}T12:00:00Z`) - Date.parse(`${du}T12:00:00Z`)) / 86400000) + 1;
}

function enClair(iso: string): string {
  if (!iso) return "";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
  });
}

export function DeclarerAbsence({
  personnes,
  peutAccorder,
  aujourdHui,
}: {
  personnes: PersonneAbsence[];
  peutAccorder: boolean;
  /* La date du jour vient du SERVEUR, qui la calcule à l'heure de
     Madagascar. La recalculer ici la ferait dépendre du fuseau du poste :
     le serveur est en Europe, et les deux valeurs divergeraient trois
     heures par jour, ce que React signale comme une erreur d'hydratation. */
  aujourdHui: string;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const [agentId, setAgentId] = React.useState("");
  const [recherche, setRecherche] = React.useState("");
  const [nature, setNature] = React.useState<NatureAbsence>("conge");
  const [du, setDu] = React.useState(aujourdHui);
  const [au, setAu] = React.useState(aujourdHui);

  const choisie = personnes.find((p) => p.id === agentId);
  const filtrees = React.useMemo(() => {
    const q = aplatir(recherche.trim());
    if (!q) return personnes;
    return personnes.filter((p) => aplatir(p.nom).includes(q) || aplatir(p.poste).includes(q));
  }, [personnes, recherche]);

  const jours = nbJours(du, au);
  const finAvantDebut = Boolean(du && au && au < du);

  function reinitialiser() {
    setAgentId("");
    setRecherche("");
    setNature("conge");
    setDu(aujourdHui);
    setAu(aujourdHui);
  }

  async function envoyer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      const fd = new FormData(e.currentTarget);
      fd.set("agentId", agentId);
      fd.set("nature", nature);
      const r = await declarerAbsenceAction(fd);
      if (r.ok) {
        toast.success("Absence enregistrée", { description: r.message });
        reinitialiser();
        setOuvert(false);
        router.refresh();
      } else {
        toast.error("Refusé", { description: r.error });
      }
    } catch {
      /* Une action serveur qui échoue au TRANSPORT (coupure, 502, session
         expirée) rejette la promesse au lieu de rendre {ok:false}. Sans ce
         filet, l'écran se contentait de retirer le voyant : la personne
         croyait avoir enregistré, et rien n'était parti. */
      toast.error("Rien n'a été enregistré", {
        description:
          "La connexion a été interrompue. Vérifiez le réseau, puis recommencez : aucune absence n'a été créée.",
      });
    } finally {
      setLoading(false);
    }
  }

  if (!ouvert) {
    return (
      <GlassButton type="button" variant="brand" onClick={() => setOuvert(true)}>
        <Plus className="size-4" aria-hidden="true" />
        Déclarer une absence
      </GlassButton>
    );
  }

  return (
    <GlassCard className="w-full p-5">
      <form onSubmit={envoyer} className="space-y-6">
        {/* 1. QUI */}
        <fieldset>
          <legend className="mb-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            1. Qui sera absent ?
          </legend>
          {choisie ? (
            <div className="flex items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-accent">{choisie.nom}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {choisie.poste || choisie.site}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setAgentId("")}
                className="rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Changer
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-glass-border">
              <div className="relative border-b border-glass-border p-2">
                <Search
                  className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  placeholder="Tapez un nom"
                  aria-label="Rechercher une personne"
                  className="h-9 w-full rounded-lg bg-foreground/[0.04] pl-8 pr-8 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
                {recherche && (
                  <button
                    type="button"
                    onClick={() => setRecherche("")}
                    aria-label="Effacer la recherche"
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
              <ul className="max-h-56 overflow-y-auto overscroll-contain">
                {filtrees.length === 0 ? (
                  <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                    Personne ne répond à « {recherche} ».
                  </li>
                ) : (
                  filtrees.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setAgentId(p.id)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-foreground/[0.05] focus-visible:bg-foreground/[0.05] focus-visible:outline-none"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium leading-tight">
                            {p.nom}
                          </span>
                          <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                            {p.poste || p.site}
                          </span>
                        </span>
                        <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {p.site}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </fieldset>

        {/* 2. POURQUOI */}
        <fieldset>
          <legend className="mb-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            2. Pour quelle raison ?
          </legend>
          <div className="flex flex-wrap gap-2">
            {NATURES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNature(n)}
                aria-pressed={nature === n}
                className={cn(
                  "rounded-xl border px-3 py-1.5 text-sm transition-colors",
                  nature === n
                    ? "border-accent/50 bg-accent/12 font-medium text-accent"
                    : "border-glass-border text-muted-foreground hover:bg-white/5",
                )}
              >
                {REGLES[n].libelle}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {REGLES[nature].decompteSolde
              ? "Ces jours sont retirés du solde de congés payés."
              : REGLES[nature].compteCommeTravail
                ? "La personne travaille : le temps reste dû, elle n'est simplement pas au centre."
                : "Ces jours ne touchent pas au solde de congés payés."}
            {REGLES[nature].justificatifAttendu ? " Un justificatif est attendu." : ""}
          </p>
        </fieldset>

        {/* 3. QUAND */}
        <fieldset>
          <legend className="mb-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            3. Du quand au quand ?
          </legend>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                Premier jour
              </span>
              <input
                name="du"
                type="date"
                required
                value={du}
                onChange={(e) => {
                  setDu(e.target.value);
                  // Une fin antérieure au début n'a aucun sens : on la
                  // rattrape au lieu d'attendre le refus du serveur.
                  if (au && e.target.value > au) setAu(e.target.value);
                }}
                className="h-10 rounded-lg glass border px-3 text-sm font-mono"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                Dernier jour
              </span>
              <input
                name="au"
                type="date"
                required
                value={au}
                min={du || undefined}
                onChange={(e) => setAu(e.target.value)}
                className="h-10 rounded-lg glass border px-3 text-sm font-mono"
              />
            </label>
          </div>

          {finAvantDebut ? (
            <p className="mt-2 text-[11px] text-[var(--danger,#e5484d)]">
              Le dernier jour tombe avant le premier.
            </p>
          ) : jours > 0 ? (
            <p className="mt-2 text-sm">
              <span className="font-semibold tabular-nums">
                {jours} jour{jours > 1 ? "s" : ""}
              </span>
              <span className="text-muted-foreground">
                {jours === 1 ? `, le ${enClair(du)}` : `, du ${enClair(du)} au ${enClair(au)}`}
              </span>
              {REGLES[nature].decompteSolde && (
                <span className="block text-[11px] text-muted-foreground">
                  Décompte indicatif. Le chiffre retenu tiendra compte des jours fériés et du mode de
                  décompte réglé pour le centre.
                </span>
              )}
            </p>
          ) : null}
        </fieldset>

        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Précision (facultatif)
          </span>
          <input
            name="motif"
            placeholder="Ce qu'il faudra se rappeler dans six mois"
            className="h-10 w-full rounded-lg glass border px-3 text-sm"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3 border-t border-glass-border pt-4">
          <GlassButton type="submit" variant="brand" disabled={loading || !agentId || finAvantDebut}>
            {loading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="size-4" aria-hidden="true" />
            )}
            {peutAccorder ? "Enregistrer l'absence" : "Envoyer la demande"}
          </GlassButton>
          <button
            type="button"
            onClick={() => setOuvert(false)}
            className="h-9 px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Annuler
          </button>
          {!agentId && (
            <p className="text-[11px] text-muted-foreground">Choisissez d&apos;abord une personne.</p>
          )}
          {!peutAccorder && agentId && (
            <p className="text-[11px] text-muted-foreground">
              La direction devra encore l&apos;accorder.
            </p>
          )}
        </div>
      </form>
    </GlassCard>
  );
}
