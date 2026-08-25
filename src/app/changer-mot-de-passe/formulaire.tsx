"use client";

import * as React from "react";
import { Loader2, Check, Eye, EyeOff, X } from "lucide-react";
import { toast } from "sonner";

import { GlassButton } from "@/components/glass/glass-button";

import { changerMotDePasseAction } from "./actions";

/* ============================================================
   CHANGEMENT DU MOT DE PASSE PROVISOIRE
   ============================================================

   Écran refait après un échec réel : une personne a changé son mot de
   passe, l'a validé, et n'a plus jamais pu se connecter — deux fois de
   suite. Trois causes possibles, toutes invisibles derrière des points :
   une espace au bout, une majuscule ajoutée par le clavier du téléphone,
   ou deux frappes identiques dans « nouveau » et « confirmation » mais
   différentes de ce que la personne croyait taper.

   D'où trois partis pris :

   ON PEUT VOIR CE QU'ON TAPE. Un œil sur CHAQUE champ, y compris le mot de
   passe actuel. Masquer un mot de passe protège d'un regard par-dessus
   l'épaule ; dans un bureau où l'on est seul devant l'écran, cette
   protection coûte plus qu'elle ne rapporte.

   LES EXIGENCES SONT AFFICHÉES ET SE COCHENT EN DIRECT. Un message d'erreur
   après coup arrive trop tard : la personne a déjà oublié ce qu'elle a
   tapé. La liste dit AVANT ce qui manque, et se coche à mesure.

   L'ESPACE EN DÉBUT OU EN FIN EST REFUSÉE, PAS ROGNÉE. La rogner
   reviendrait à enregistrer un secret différent de celui qu'on a tapé —
   exactement le piège qu'on veut fermer. On la refuse en le disant.
   ============================================================ */

interface Exigence {
  cle: string;
  libelle: string;
  ok: (v: string) => boolean;
}

const EXIGENCES: Exigence[] = [
  { cle: "long", libelle: "8 caractères au minimum", ok: (v) => v.length >= 8 },
  { cle: "lettre", libelle: "au moins une lettre", ok: (v) => /[a-zA-Z]/.test(v) },
  { cle: "chiffre", libelle: "au moins un chiffre", ok: (v) => /\d/.test(v) },
  {
    cle: "espace",
    libelle: "ni espace au début ni espace à la fin",
    ok: (v) => v === v.trim(),
  },
];

function ChampMotDePasse({
  nom,
  etiquette,
  valeur,
  onChange,
  autoComplete,
  aide,
}: {
  nom: string;
  etiquette: string;
  valeur: string;
  onChange: (v: string) => void;
  autoComplete: string;
  aide?: string;
}) {
  const [visible, setVisible] = React.useState(false);
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {etiquette}
      </span>
      <span className="relative block">
        <input
          name={nom}
          type={visible ? "text" : "password"}
          required
          value={valeur}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          /* Le clavier d'un téléphone met une majuscule au premier caractère
             et propose une correction : sur un mot de passe, les deux
             fabriquent un secret que la personne n'a pas choisi. */
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="h-11 w-full rounded-xl glass border pl-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          title={visible ? "Masquer" : "Afficher en clair"}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </button>
      </span>
      {aide && <span className="mt-1 block text-[11px] text-muted-foreground">{aide}</span>}
    </label>
  );
}

export function FormulaireChangement() {
  const [loading, setLoading] = React.useState(false);
  const [actuel, setActuel] = React.useState("");
  const [nouveau, setNouveau] = React.useState("");
  const [confirmation, setConfirmation] = React.useState("");

  const manquants = EXIGENCES.filter((e) => !e.ok(nouveau));
  const identiques = confirmation.length > 0 && nouveau === confirmation;
  const differentDeLancien = nouveau.length > 0 && nouveau !== actuel;
  const pret = manquants.length === 0 && identiques && differentDeLancien;

  async function envoyer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    /* On dit ce qui manque AVANT d'envoyer : un aller-retour serveur pour
       apprendre qu'il manque un chiffre est un aller-retour de trop. */
    if (manquants.length) {
      toast.error("Mot de passe incomplet", {
        description: `Il manque : ${manquants.map((m) => m.libelle).join(", ")}.`,
      });
      return;
    }
    if (!identiques) {
      toast.error("La confirmation ne correspond pas", {
        description: "Affichez les deux champs avec l'œil pour les comparer.",
      });
      return;
    }
    setLoading(true);
    try {
      const r = await changerMotDePasseAction(new FormData(e.currentTarget));
      if (r && !r.ok && r.error) {
        toast.error("Impossible", { description: r.error });
        setLoading(false);
      }
    } catch {
      // Le redirect de next/navigation se propage par une exception : ne pas
      // la traiter comme une erreur.
    }
  }

  return (
    <form onSubmit={envoyer} className="space-y-4">
      <ChampMotDePasse
        nom="actuel"
        etiquette="Mot de passe actuel (provisoire)"
        valeur={actuel}
        onChange={setActuel}
        autoComplete="current-password"
        aide="Celui qui vous a été transmis. Utilisez l'œil pour vérifier votre saisie."
      />
      <ChampMotDePasse
        nom="nouveau"
        etiquette="Nouveau mot de passe"
        valeur={nouveau}
        onChange={setNouveau}
        autoComplete="new-password"
      />

      {/* La liste dit AVANT ce qui manque, et se coche à mesure. */}
      <ul className="space-y-1 rounded-xl border border-glass-border px-3.5 py-2.5">
        {EXIGENCES.map((e) => {
          const ok = nouveau.length > 0 && e.ok(nouveau);
          return (
            <li key={e.cle} className="flex items-center gap-2 text-[12px]">
              {ok ? (
                <Check className="size-3.5 shrink-0 text-[var(--success)]" aria-hidden="true" />
              ) : (
                <X className="size-3.5 shrink-0 text-muted-foreground/50" aria-hidden="true" />
              )}
              <span className={ok ? "text-[var(--success)]" : "text-muted-foreground"}>{e.libelle}</span>
            </li>
          );
        })}
        <li className="flex items-center gap-2 text-[12px]">
          {differentDeLancien ? (
            <Check className="size-3.5 shrink-0 text-[var(--success)]" aria-hidden="true" />
          ) : (
            <X className="size-3.5 shrink-0 text-muted-foreground/50" aria-hidden="true" />
          )}
          <span className={differentDeLancien ? "text-[var(--success)]" : "text-muted-foreground"}>
            différent du mot de passe provisoire
          </span>
        </li>
      </ul>

      <ChampMotDePasse
        nom="confirmation"
        etiquette="Confirmation"
        valeur={confirmation}
        onChange={setConfirmation}
        autoComplete="new-password"
        aide={
          confirmation.length === 0
            ? undefined
            : identiques
              ? "✓ Les deux saisies correspondent."
              : "Les deux saisies diffèrent : affichez-les avec l'œil pour comparer."
        }
      />

      <GlassButton type="submit" variant="brand" size="lg" className="w-full" disabled={loading || !pret}>
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Check className="size-4" aria-hidden="true" />
        )}
        Enregistrer et se reconnecter
      </GlassButton>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Notez votre mot de passe avant de valider : vous serez déconnecté aussitôt et devrez le
        ressaisir pour entrer. Personne ne peut le retrouver : il n&apos;est pas conservé en clair,
        même par l&apos;administrateur.
      </p>
    </form>
  );
}
