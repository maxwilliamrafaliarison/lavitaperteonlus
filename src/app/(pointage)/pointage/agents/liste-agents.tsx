"use client";

import * as React from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

/* ============================================================
   FICHES DU PERSONNEL — recherche et filtres
   ============================================================

   ── CE QUI SE TAPE, ET CE QUI SE CLIQUE ──────────────────────────────────
   Soixante lignes tiennent sur trois écrans : trouver quelqu'un demandait de
   les parcourir à l'œil, ou d'appeler la recherche du navigateur, qui ne
   sait rien des accents ni des colonnes.

   Le partage entre champ et boutons suit la donnée, pas l'habitude. Le NOM
   et le POSTE prennent des dizaines de valeurs distinctes : on les tape. Le
   SITE, le STATUT et le SERVICE en prennent deux à quatre : les taper serait
   absurde quand un bouton montre d'emblée ce qui existe et combien.

   ── LE SERVICE ÉTAIT INVISIBLE ───────────────────────────────────────────
   Il est renseigné pour cinquante-trois personnes et n'apparaissait dans
   aucune colonne. Chercher sur une information qu'on ne voit pas est le plus
   sûr moyen de douter du résultat : la colonne est donc ajoutée en même
   temps que le filtre.

   ── LA RECHERCHE IGNORE LES ACCENTS ET LA CASSE ──────────────────────────
   « Hervé » se trouve en tapant « herve », « Génér » trouve « Généraliste ».
   Sur des noms malgaches saisis par plusieurs mains, exiger l'accent juste
   reviendrait à cacher la moitié du personnel.
   ============================================================ */

export interface LigneAgent {
  id: string;
  nom: string;
  site: string;
  statut: string;
  statutLibelle: string;
  poste: string;
  service: string;
  horaire: string;
}

/** Sans accents ni casse : « Hervé » se trouve en tapant « herve ». */
const aplatir = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function ListeAgents({
  agents,
  vide,
  libelles,
}: {
  agents: LigneAgent[];
  vide: string;
  libelles: { agent: string; site: string };
}) {
  const [recherche, setRecherche] = React.useState("");
  const [site, setSite] = React.useState("");
  const [statut, setStatut] = React.useState("");
  const [service, setService] = React.useState("");

  /* Les valeurs proposées viennent des DONNÉES, jamais d'une liste écrite à
     la main : un service ajouté demain apparaît sans qu'on touche au code,
     et un service disparu cesse d'être proposé au lieu de rendre zéro. */
  const valeurs = React.useMemo(() => {
    const compter = (cle: keyof LigneAgent) => {
      const m = new Map<string, number>();
      for (const a of agents) {
        const v = String(a[cle] ?? "").trim();
        if (v) m.set(v, (m.get(v) ?? 0) + 1);
      }
      return [...m].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
    };
    return { sites: compter("site"), services: compter("service") };
  }, [agents]);

  const filtres = React.useMemo(() => {
    const q = aplatir(recherche.trim());
    return agents.filter((a) => {
      if (site && a.site !== site) return false;
      if (statut && a.statut !== statut) return false;
      if (service && a.service !== service) return false;
      if (!q) return true;
      // L'identifiant entre dans la recherche : la RH le lit sur les
      // exports de la pointeuse et le cherche tel quel.
      return aplatir(`${a.nom} ${a.id} ${a.poste} ${a.service}`).includes(q);
    });
  }, [agents, recherche, site, statut, service]);

  const actif = Boolean(recherche || site || statut || service);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Chercher un nom, un poste, un identifiant"
            aria-label="Chercher une personne par nom, poste ou identifiant"
            className="h-10 w-full rounded-xl border border-glass-border bg-foreground/[0.03] pl-9 pr-9 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          {recherche && (
            <button
              type="button"
              onClick={() => setRecherche("")}
              aria-label="Effacer la recherche"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
        {actif && (
          <button
            type="button"
            onClick={() => {
              setRecherche("");
              setSite("");
              setStatut("");
              setService("");
            }}
            className="h-10 rounded-xl border border-glass-border px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Tout afficher
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Groupe
          etiquette={libelles.site}
          valeurs={valeurs.sites}
          choisi={site}
          onChoisir={setSite}
        />
        <Groupe
          etiquette="Statut"
          valeurs={[
            ["salarie", agents.filter((a) => a.statut === "salarie").length],
            ["prestataire", agents.filter((a) => a.statut === "prestataire").length],
          ]}
          rendu={(v) => (v === "salarie" ? "Salarié" : "Prestataire")}
          choisi={statut}
          onChoisir={setStatut}
        />
        {valeurs.services.length > 0 && (
          <Groupe
            etiquette="Service"
            valeurs={valeurs.services}
            choisi={service}
            onChoisir={setService}
          />
        )}
      </div>

      <p className="text-[11px] text-muted-foreground" aria-live="polite">
        {filtres.length === agents.length
          ? `${agents.length} personne${agents.length > 1 ? "s" : ""}`
          : `${filtres.length} sur ${agents.length}`}
      </p>

      <div className="overflow-x-auto rounded-2xl border border-glass-border">
        {filtres.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            {agents.length === 0 ? vide : "Personne ne répond à cette recherche."}
          </p>
        ) : (
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-glass-border text-left">
                <Th>{libelles.agent}</Th>
                <Th>{libelles.site}</Th>
                <Th>Statut</Th>
                <Th>Poste</Th>
                <Th>Service</Th>
                <Th>Horaire</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-glass-border">
              {filtres.map((a) => (
                <tr key={a.id} className="transition-colors hover:bg-white/3">
                  <td className="px-5 py-3">
                    <Link
                      href={`/pointage/agents/${a.id}`}
                      className="font-medium transition-colors hover:text-accent focus-visible:text-accent focus-visible:underline focus-visible:outline-none"
                    >
                      {a.nom}
                    </Link>
                    <span className="block font-mono text-[11px] text-muted-foreground">{a.id}</span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{a.site}</td>
                  <td className="px-5 py-3">
                    <span
                      className={
                        a.statut === "prestataire"
                          ? "rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] text-accent"
                          : "text-xs text-muted-foreground"
                      }
                    >
                      {a.statutLibelle}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{a.poste || "—"}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{a.service || "—"}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{a.horaire}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/**
 * Un groupe de filtres, avec l'effectif de chaque valeur.
 *
 * Le compte porte sur TOUT l'effectif, et non sur ce que les autres filtres
 * ont déjà retenu. C'est un choix : un chiffre qui bouge à chaque clic
 * ailleurs se lit comme un résultat alors qu'il n'est qu'un reste, et l'on
 * ne sait plus si « Sanitaire 31 » annonce trente et une personnes ou trente
 * et une parmi celles déjà filtrées. Stable, il dit ce que le centre
 * contient, ce qui est la question qu'on se pose en regardant ces boutons.
 *
 * Recliquer la valeur retenue la relâche, ce qui épargne un bouton
 * « annuler » par groupe.
 */
function Groupe({
  etiquette,
  valeurs,
  choisi,
  onChoisir,
  rendu,
}: {
  etiquette: string;
  valeurs: Array<[string, number]>;
  choisi: string;
  onChoisir: (v: string) => void;
  rendu?: (v: string) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
        {etiquette}
      </span>
      {valeurs.map(([v, n]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChoisir(choisi === v ? "" : v)}
          aria-pressed={choisi === v}
          className={cn(
            "rounded-lg border px-2 py-1 text-[11px] transition-colors",
            choisi === v
              ? "border-accent/50 bg-accent/12 font-medium text-accent"
              : "border-glass-border text-muted-foreground hover:bg-white/5",
          )}
        >
          {rendu ? rendu(v) : v}
          <span className="ml-1 tabular-nums opacity-70">{n}</span>
        </button>
      ))}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="px-5 py-2.5 text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground"
    >
      {children}
    </th>
  );
}
