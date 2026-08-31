"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, X, Check } from "lucide-react";
import { toast } from "sonner";

import { versMinutes, versHeures } from "@/lib/pointage/calcul";
import { cn } from "@/lib/utils";

import {
  affecterAction,
  deplacerAffectationAction,
  envoyerRecapModificationsAction,
} from "./actions";
import { FAMILLES, classeDe } from "./gantt";

/* ============================================================
   GRILLE HORAIRE — emploi du temps heures × jours, par service
   ============================================================
   La représentation des logiciels d'emploi du temps (EDT, Pronote) : les
   heures en ordonnée, les jours en abscisse, chaque affectation étant un
   bloc positionné et dimensionné selon son horaire réel. C'est la seule vue
   qui rende visibles les chevauchements, les trous de couverture et
   l'amplitude d'une garde.

   Décisions issues des réponses du responsable :
   • une grille PAR SERVICE (réponse 4c), chacune avec son AMPLITUDE propre
     (réponse 1c) — la sécurité vit sur 24 h, les consultations sur 7h-18h ;
     imposer 0-24 partout noierait les journées dans du vide ;
   • création à la souris FAÇON GOOGLE AGENDA (réponse 2) : on glisse sur la
     grille pour dessiner la plage, réglée ensuite à la minute dans le
     formulaire ; accroche à 30 minutes ;
   • déplacement par GLISSER-DÉPOSER (réponse 6), le clic simple ouvrant la
     modification détaillée ;
   • un bloc porte le NOM et l'HORAIRE, le lieu s'il existe (réponse 3) — le
     service est donné par la grille, le répéter n'apprendrait rien.

   Une garde qui traverse minuit est COUPÉE en deux segments : 17h→24h le
   jour J, 0h→6h le lendemain, marqués « … ». Sans cette coupe, le bloc
   déborderait de la grille ou se dessinerait à l'envers.
   ============================================================ */

export interface BlocEdt {
  affId: string;
  agentId: string;
  agentNom: string;
  jour: string;
  debut: string; // effectif "HH:MM"
  fin: string;
  type: string;
  lieu: string;
  creneauId: string;
  surchargeDebut: string;
  surchargeFin: string;
  partie?: 1 | 2;
}

export interface GroupeEdt {
  /** Clé de rattachement des blocs : l'identifiant du service, ou
   *  « ag:<id> » quand la section représente UNE personne (MIARAKA, qui
   *  planifie par agent et non par poste). */
  cle: string;
  service: string;
  libelle: string;
  agents: Array<{ id: string; nom: string; statut: string }>;
}

export interface EdtProps {
  planningId: string;
  editable: boolean;
  jours: Array<{ date: string; num: string; abrege: string; weekend: boolean }>;
  groupes: GroupeEdt[];
  blocs: Record<string, BlocEdt[]>;
  repos: Record<string, Array<{ jour: string; agentNom: string; motif: string }>>;
  tousAgents: Array<{ id: string; nom: string }>;
}

const H_HEURE = 44; // px par heure
const GOUTTIERE = 52; // px de la colonne des heures
const PAS = 30; // accroche de la sélection, en minutes

interface Segment {
  bloc: BlocEdt;
  jour: string;
  debutMin: number;
  finMin: number;
  continuation: boolean; // second morceau d'une garde coupée à minuit
  voie: number;
  voies: number;
}

/** Coupe les gardes à minuit et pose chaque morceau sur son jour. */
function segmenter(blocs: BlocEdt[], joursVisibles: string[]): Segment[] {
  const out: Segment[] = [];
  const suivant = (j: string) => {
    const d = new Date(`${j}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  };
  for (const b of blocs) {
    const d = versMinutes(b.debut);
    const f = versMinutes(b.fin);
    if (d === null || f === null) continue;
    if (f > d) {
      out.push({ bloc: b, jour: b.jour, debutMin: d, finMin: f, continuation: false, voie: 0, voies: 1 });
    } else {
      out.push({ bloc: b, jour: b.jour, debutMin: d, finMin: 1440, continuation: false, voie: 0, voies: 1 });
      const lendemain = suivant(b.jour);
      if (joursVisibles.includes(lendemain)) {
        out.push({ bloc: b, jour: lendemain, debutMin: 0, finMin: f, continuation: true, voie: 0, voies: 1 });
      }
    }
  }
  // Voies : les blocs qui se chevauchent sur un même jour se partagent la
  // largeur, sinon ils se masqueraient l'un l'autre.
  const parJour = new Map<string, Segment[]>();
  for (const s of out) parJour.set(s.jour, [...(parJour.get(s.jour) ?? []), s]);
  for (const segs of parJour.values()) {
    segs.sort((a, b) => a.debutMin - b.debutMin || b.finMin - a.finMin);
    const finsParVoie: number[] = [];
    for (const s of segs) {
      let v = finsParVoie.findIndex((fin) => fin <= s.debutMin);
      if (v === -1) {
        v = finsParVoie.length;
        finsParVoie.push(0);
      }
      finsParVoie[v] = s.finMin;
      s.voie = v;
    }
    const groupesChev: Segment[][] = [];
    for (const s of segs) {
      const g = groupesChev.find((gr) => gr.some((x) => x.debutMin < s.finMin && s.debutMin < x.finMin));
      if (g) g.push(s);
      else groupesChev.push([s]);
    }
    for (const g of groupesChev) {
      const nv = Math.max(...g.map((x) => x.voie)) + 1;
      for (const x of g) x.voies = nv;
    }
  }
  return out;
}

const snap = (min: number) => Math.round(min / PAS) * PAS;
const hhmm = (min: number) =>
  `${String(Math.floor(Math.max(0, Math.min(1439, min)) / 60)).padStart(2, "0")}:${String(Math.max(0, Math.min(1439, min)) % 60).padStart(2, "0")}`;

type Modale =
  | { mode: "creer"; service: string; jour: string; debut: string; fin: string }
  | { mode: "editer"; bloc: BlocEdt };

export function PlanningEdt({ planningId, editable, jours, groupes, blocs, repos, tousAgents }: EdtProps) {
  const router = useRouter();
  const [modale, setModale] = React.useState<Modale | null>(null);
  const [enCours, setEnCours] = React.useState(false);
  const joursVisibles = jours.map((j) => j.date);

  /* ── LE SILENCE DÉCLENCHE LE RÉCAPITULATIF ─────────────────────────────
     Les modifications d'un planning PUBLIÉ s'accumulent côté serveur et
     partent en un seul message. Reste à savoir quand la séance est finie :
     le serveur ne peut pas le deviner, le navigateur si. On relance donc
     une temporisation à chaque modification, et l'envoi part quand elle
     expire sans avoir été relancée.

     Ce n'est pas le seul déclencheur, et c'est voulu : si l'onglet se ferme
     avant l'échéance, la modification suivante ou l'ouverture de la liste
     des plannings videront la file. Aucun des trois n'est fiable seul. */
  const minuterie = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmerRecap = React.useCallback(() => {
    if (minuterie.current) clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => {
      void envoyerRecapModificationsAction();
    }, 4 * 60_000);
  }, []);
  React.useEffect(() => () => {
    if (minuterie.current) clearTimeout(minuterie.current);
  }, []);

  async function envoyer(fd: FormData, action: typeof affecterAction | typeof deplacerAffectationAction) {
    setEnCours(true);
    try {
      fd.set("planningId", planningId);
      const r = await action(fd);
      if (!r.ok) {
        toast.error("Refusé", { description: r.error });
        return false;
      }
      if ("alertes" in r && r.alertes?.length) {
        toast.warning("Seuil légal dépassé", { description: r.alertes[0], duration: 8000 });
      }
      router.refresh();
      programmerRecap();
      return true;
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="space-y-5">
      <Legende />
      {groupes.map((g) => (
        <GrilleService
          key={g.cle}
          groupe={g}
          jours={jours}
          segments={segmenter(blocs[g.cle] ?? [], joursVisibles)}
          repos={repos[g.cle] ?? []}
          editable={editable}
          onCreer={(jour, dMin, fMin) =>
            setModale({ mode: "creer", service: g.service, jour, debut: hhmm(dMin), fin: hhmm(fMin) })
          }
          onOuvrir={(bloc) => setModale({ mode: "editer", bloc })}
          onDeplacer={async (bloc, jour, dMin) => {
            const duree = (versMinutes(bloc.fin)! - versMinutes(bloc.debut)! + 1440) % 1440 || 1440;
            const fd = new FormData();
            fd.set("agentId", bloc.agentId);
            fd.set("jourAvant", bloc.jour);
            fd.set("jour", jour);
            fd.set("serviceId", g.service);
            fd.set("creneauId", bloc.creneauId);
            fd.set("debut", hhmm(dMin));
            fd.set("fin", hhmm((dMin + duree) % 1440));
            await envoyer(fd, deplacerAffectationAction);
          }}
        />
      ))}

      {modale && (
        <ModaleAffectation
          modale={modale}
          groupes={groupes}
          tousAgents={tousAgents}
          enCours={enCours}
          onFermer={() => setModale(null)}
          onEnregistrer={async (svc, agentId, jour, debut, fin) => {
            const fd = new FormData();
            fd.set("agentId", agentId);
            fd.set("jour", jour);
            fd.set("serviceId", svc);
            fd.set("creneauId", "libre");
            fd.set("debut", debut);
            fd.set("fin", fin);
            if (modale.mode === "editer" && modale.bloc.jour !== jour) {
              fd.set("jourAvant", modale.bloc.jour);
              if (await envoyer(fd, deplacerAffectationAction)) setModale(null);
            } else if (await envoyer(fd, affecterAction)) {
              setModale(null);
            }
          }}
          onSupprimer={
            modale.mode === "editer"
              ? async () => {
                  const fd = new FormData();
                  fd.set("agentId", modale.bloc.agentId);
                  fd.set("jour", modale.bloc.jour);
                  fd.set("serviceId", modale.mode === "editer" ? serviceDe(groupes, modale.bloc) : "");
                  fd.set("creneauId", "");
                  if (await envoyer(fd, affecterAction)) setModale(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

/** Retrouve le service d'un bloc à partir des groupes (le bloc n'en porte pas). */
function serviceDe(groupes: GroupeEdt[], bloc: BlocEdt): string {
  for (const g of groupes) if (g.agents.some((a) => a.id === bloc.agentId)) return g.service;
  return "";
}

/* ── Une grille par service ─────────────────────────────────────────────── */

function GrilleService({
  groupe, jours, segments, repos, editable, onCreer, onOuvrir, onDeplacer,
}: {
  groupe: GroupeEdt;
  jours: EdtProps["jours"];
  segments: Segment[];
  repos: Array<{ jour: string; agentNom: string; motif: string }>;
  editable: boolean;
  onCreer: (jour: string, debutMin: number, finMin: number) => void;
  onOuvrir: (bloc: BlocEdt) => void;
  onDeplacer: (bloc: BlocEdt, jour: string, debutMin: number) => Promise<void>;
}) {
  // Amplitude PROPRE au service : arrondie à l'heure, avec une marge, et un
  // plancher 7h-17h pour que la grille reste comparable d'un service à
  // l'autre même quand une seule affectation existe.
  const minutesMin = segments.length ? Math.min(...segments.map((s) => s.debutMin), 7 * 60) : 7 * 60;
  const minutesMax = segments.length ? Math.max(...segments.map((s) => s.finMin), 17 * 60) : 17 * 60;
  const ampMin = Math.floor(minutesMin / 60) * 60;
  const ampMax = Math.min(1440, Math.ceil(minutesMax / 60) * 60);
  const hauteur = ((ampMax - ampMin) / 60) * H_HEURE;

  const zone = React.useRef<HTMLDivElement>(null);
  const [selection, setSelection] = React.useState<{ jourIdx: number; a: number; b: number } | null>(null);
  const [fantome, setFantome] = React.useState<{ seg: Segment; jourIdx: number; debutMin: number } | null>(null);
  const drag = React.useRef<
    | { type: "creer"; jourIdx: number; origine: number }
    | { type: "bouger"; seg: Segment; delta: number; bougeait: boolean }
    | null
  >(null);

  const coord = (e: React.PointerEvent): { jourIdx: number; min: number } | null => {
    const r = zone.current?.getBoundingClientRect();
    if (!r) return null;
    const largeurJour = (r.width - GOUTTIERE) / jours.length;
    const jourIdx = Math.max(0, Math.min(jours.length - 1, Math.floor((e.clientX - r.left - GOUTTIERE) / largeurJour)));
    const min = ampMin + ((e.clientY - r.top) / H_HEURE) * 60;
    return { jourIdx, min: Math.max(ampMin, Math.min(ampMax, min)) };
  };

  function pointerDownFond(e: React.PointerEvent) {
    if (!editable || e.button !== 0) return;
    const c = coord(e);
    if (!c || e.clientX - (zone.current?.getBoundingClientRect().left ?? 0) < GOUTTIERE) return;
    drag.current = { type: "creer", jourIdx: c.jourIdx, origine: snap(c.min) };
    setSelection({ jourIdx: c.jourIdx, a: snap(c.min), b: snap(c.min) + PAS });
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function pointerDownBloc(e: React.PointerEvent, seg: Segment) {
    if (!editable) return;
    e.stopPropagation();
    if (seg.continuation) return; // la suite d'une garde s'édite depuis son origine
    const c = coord(e);
    if (!c) return;
    drag.current = { type: "bouger", seg, delta: c.min - seg.debutMin, bougeait: false };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function pointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const c = coord(e);
    if (!c) return;
    if (d.type === "creer") {
      setSelection({
        jourIdx: d.jourIdx,
        a: Math.min(d.origine, snap(c.min)),
        b: Math.max(d.origine + PAS, snap(c.min)),
      });
    } else {
      const debut = snap(c.min - d.delta);
      // Un simple clic ne doit pas devenir un déplacement d'un pixel.
      if (!d.bougeait && Math.abs(debut - d.seg.debutMin) < PAS && c.jourIdx === jours.findIndex((j) => j.date === d.seg.jour)) return;
      d.bougeait = true;
      setFantome({ seg: d.seg, jourIdx: c.jourIdx, debutMin: Math.max(ampMin, debut) });
    }
  }

  async function pointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.type === "creer") {
      const s = selection;
      setSelection(null);
      if (s && s.b - s.a >= PAS) onCreer(jours[s.jourIdx].date, s.a, s.b);
    } else {
      const f = fantome;
      setFantome(null);
      if (d.bougeait && f) {
        await onDeplacer(d.seg.bloc, jours[f.jourIdx].date, f.debutMin);
      } else {
        onOuvrir(d.seg.bloc);
      }
    }
  }

  const heures: number[] = [];
  for (let m = ampMin; m < ampMax; m += 60) heures.push(m);
  const reposParJour = new Map<string, Array<{ agentNom: string; motif: string }>>();
  for (const r of repos) reposParJour.set(r.jour, [...(reposParJour.get(r.jour) ?? []), r]);

  /* ── LA CHARGE DE CHAQUE JOUR, ET LE JOUR COURANT ─────────────────────
     Deux repères que tout outil de planning porte et qui manquaient ici.
     Le total par colonne dit d'un regard quelle journée est chargée et
     laquelle ne l'est pas, ce qu'on devait auparavant estimer à la hauteur
     des blocs. Et l'on ne peut pas lire une semaine sans savoir où l'on
     est : la colonne du jour se distingue, et un trait marque l'heure
     qu'il est.

     La date se fixe APRÈS montage, jamais au rendu : le serveur et le
     navigateur ne sont pas dans le même fuseau, et l'écart produirait une
     divergence d'hydratation. Le repère apparaît donc une fraction de
     seconde plus tard, ce qui ne coûte rien. */
  const minutesParJour = new Map<string, number>();
  for (const s of segments) {
    minutesParJour.set(s.jour, (minutesParJour.get(s.jour) ?? 0) + (s.finMin - s.debutMin));
  }
  const [maintenant, setMaintenant] = React.useState<{ jour: string; min: number } | null>(null);
  React.useEffect(() => {
    const lire = () => {
      const d = new Date(Date.now() + 3 * 3600 * 1000); // heure des centres
      setMaintenant({
        jour: d.toISOString().slice(0, 10),
        min: d.getUTCHours() * 60 + d.getUTCMinutes(),
      });
    };
    lire();
    const t = setInterval(lire, 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <section aria-label={`Emploi du temps : ${groupe.libelle}`}>
      <h2 className="mb-1.5 flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-wide text-accent">
        {groupe.libelle}
        <span className="font-normal text-muted-foreground">
          {groupe.agents.length} agent(s) · {versHeures(ampMin)}–{ampMax === 1440 ? "24:00" : versHeures(ampMax)}
          {segments.length > 0 && (
            <>
              {" · "}
              <span className="font-mono tabular-nums">
                {versHeures([...minutesParJour.values()].reduce((s, m) => s + m, 0))}
              </span>{" "}
              sur {segments.filter((s) => !s.continuation).length} créneau(x)
            </>
          )}
        </span>
      </h2>
      <div className="overflow-x-auto rounded-xl border border-glass-border">
        <div className="min-w-[640px]">
          {/* En-tête des jours + repos du jour. */}
          <div className="grid border-b border-glass-border bg-black/[0.03] dark:bg-white/[0.03]" style={{ gridTemplateColumns: `${GOUTTIERE}px repeat(${jours.length}, 1fr)` }}>
            <div />
            {jours.map((j) => {
              const rj = reposParJour.get(j.date) ?? [];
              const charge = minutesParJour.get(j.date) ?? 0;
              const ceJour = maintenant?.jour === j.date;
              return (
                <div
                  key={j.date}
                  aria-current={ceJour ? "date" : undefined}
                  className={cn(
                    "border-l border-glass-border px-1 py-1.5 text-center",
                    j.weekend && "bg-black/[0.04] dark:bg-white/[0.04]",
                    ceJour && "bg-accent/10",
                  )}
                >
                  <span className={cn("text-[10px] capitalize", ceJour ? "font-semibold text-accent" : "text-muted-foreground")}>{j.abrege}</span>{" "}
                  <span className={cn("font-mono text-sm font-medium", ceJour && "text-accent")}>{j.num}</span>
                  {/* La charge du jour : lue en colonne, elle se compare. */}
                  <span className={cn("mt-0.5 block font-mono text-[10px] tabular-nums", charge > 0 ? "text-muted-foreground" : "text-muted-foreground/40")}>
                    {charge > 0 ? versHeures(charge) : "—"}
                  </span>
                  {rj.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                      {rj.map((r, i) => (
                        <span key={i} title={`${r.agentNom} : ${r.motif}`} className="max-w-full truncate rounded-full bg-black/[0.07] px-1.5 py-px text-[9px] text-muted-foreground dark:bg-white/[0.08]">
                          {r.agentNom.split(" ")[0]} · {r.motif}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Zone horaire. */}
          <div
            ref={zone}
            className={cn("relative select-none", editable && "cursor-crosshair touch-none")}
            style={{ height: hauteur }}
            onPointerDown={pointerDownFond}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
          >
            {/* Lignes et étiquettes d'heures. */}
            {heures.map((m) => (
              <React.Fragment key={m}>
                <div className="pointer-events-none absolute left-0 right-0 border-t border-glass-border" style={{ top: ((m - ampMin) / 60) * H_HEURE }} />
                {/* La demi-heure, plus pâle : elle guide le placement d'un
                    créneau à 8h30 sans concurrencer le trait de l'heure. */}
                {m + 30 < ampMax && (
                  <div
                    className="pointer-events-none absolute right-0 border-t border-dashed border-glass-border/50"
                    style={{ top: ((m + 30 - ampMin) / 60) * H_HEURE, left: GOUTTIERE }}
                  />
                )}
                <span
                  className="pointer-events-none absolute font-mono text-[10px] tabular-nums text-muted-foreground"
                  style={{ top: ((m - ampMin) / 60) * H_HEURE - 6, left: 0, width: GOUTTIERE - 8, textAlign: "right" }}
                >
                  {versHeures(m)}
                </span>
              </React.Fragment>
            ))}
            {/* Colonnes des jours. */}
            {jours.map((j, i) => (
              <div
                key={j.date}
                className={cn(
                  "pointer-events-none absolute bottom-0 top-0 border-l border-glass-border/60",
                  j.weekend && "bg-black/[0.02] dark:bg-white/[0.02]",
                  maintenant?.jour === j.date && "bg-accent/[0.06]",
                )}
                style={{ left: `calc(${GOUTTIERE}px + ${(i / jours.length) * 100}% - ${(GOUTTIERE * i) / jours.length}px)`, width: `calc((100% - ${GOUTTIERE}px) / ${jours.length})` }}
              />
            ))}

            {/* L'HEURE QU'IL EST, en travers de la colonne du jour. Sans ce
                trait, il faut compter les lignes depuis le haut pour savoir
                si un créneau est passé ou à venir. */}
            {maintenant &&
              (() => {
                const i = jours.findIndex((j) => j.date === maintenant.jour);
                if (i === -1 || maintenant.min < ampMin || maintenant.min > ampMax) return null;
                return (
                  <div
                    className="pointer-events-none absolute z-10"
                    style={{
                      top: ((maintenant.min - ampMin) / 60) * H_HEURE,
                      left: `calc(${GOUTTIERE}px + (100% - ${GOUTTIERE}px) * ${i} / ${jours.length})`,
                      width: `calc((100% - ${GOUTTIERE}px) / ${jours.length})`,
                    }}
                  >
                    <div className="h-px w-full bg-[var(--danger)]" />
                    <div className="absolute -left-0.5 -top-1 size-2 rounded-full bg-[var(--danger)]" />
                  </div>
                );
              })()}

            {/* Blocs. */}
            {segments.map((s, i) => {
              const idx = jours.findIndex((j) => j.date === s.jour);
              if (idx === -1) return null;
              const enFantome = fantome?.seg === s;
              return (
                <Bloc
                  key={`${s.bloc.affId}-${s.continuation ? "suite" : "deb"}-${i}`}
                  seg={s}
                  jourIdx={enFantome ? fantome.jourIdx : idx}
                  debutMin={enFantome ? fantome.debutMin : s.debutMin}
                  finMin={enFantome ? fantome.debutMin + (s.finMin - s.debutMin) : s.finMin}
                  nJours={jours.length}
                  ampMin={ampMin}
                  editable={editable}
                  translucide={enFantome}
                  onPointerDown={(e) => pointerDownBloc(e, s)}
                />
              );
            })}

            {/* Sélection en cours (création). */}
            {selection && (
              <div
                className="pointer-events-none absolute rounded-md border-2 border-dashed border-accent bg-accent/15"
                style={{
                  top: ((selection.a - ampMin) / 60) * H_HEURE,
                  height: ((selection.b - selection.a) / 60) * H_HEURE,
                  left: `calc(${GOUTTIERE}px + (100% - ${GOUTTIERE}px) * ${selection.jourIdx} / ${jours.length})`,
                  width: `calc((100% - ${GOUTTIERE}px) / ${jours.length})`,
                }}
              >
                <span className="ml-1 font-mono text-[10px] text-accent">
                  {hhmm(selection.a)}–{hhmm(selection.b)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Bloc({
  seg, jourIdx, debutMin, finMin, nJours, ampMin, editable, translucide, onPointerDown,
}: {
  seg: Segment;
  jourIdx: number;
  debutMin: number;
  finMin: number;
  nJours: number;
  ampMin: number;
  editable: boolean;
  translucide: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const b = seg.bloc;
  const h = ((finMin - debutMin) / 60) * H_HEURE;
  const largeurVoie = 100 / seg.voies;
  const compact = h < 30;
  return (
    <div
      role={editable ? "button" : undefined}
      tabIndex={editable ? 0 : undefined}
      onPointerDown={onPointerDown}
      title={`${b.agentNom} · ${b.debut} → ${b.fin}${b.lieu ? ` · ${b.lieu}` : ""}${seg.continuation ? " (suite de la veille)" : ""}`}
      className={cn(
        "absolute overflow-hidden rounded-md px-1 py-0.5 text-[10px] leading-tight shadow-sm",
        classeDe(b.type),
        editable && !seg.continuation && "cursor-grab active:cursor-grabbing",
        seg.continuation && "opacity-80",
        translucide && "opacity-50 ring-2 ring-accent",
      )}
      style={{
        top: ((debutMin - ampMin) / 60) * H_HEURE + 1,
        height: Math.max(14, h - 2),
        left: `calc(${GOUTTIERE}px + (100% - ${GOUTTIERE}px) * (${jourIdx} + ${(seg.voie * largeurVoie) / 100}) / ${nJours} + 1px)`,
        width: `calc((100% - ${GOUTTIERE}px) / ${nJours} * ${largeurVoie / 100} - 2px)`,
      }}
    >
      <span className="block truncate font-semibold">
        {seg.continuation ? "… " : ""}
        {b.agentNom}
      </span>
      {!compact && (
        <span className="block truncate font-mono text-[9px] opacity-90">
          {seg.continuation ? `→ ${b.fin}` : `${b.debut} → ${b.fin === "00:00" ? "24:00" : b.fin}`}
          {b.lieu ? ` · ${b.lieu}` : ""}
        </span>
      )}
    </div>
  );
}

/* ── Modale de création / édition ───────────────────────────────────────── */

function ModaleAffectation({
  modale, groupes, tousAgents, enCours, onFermer, onEnregistrer, onSupprimer,
}: {
  modale: Modale;
  groupes: GroupeEdt[];
  tousAgents: Array<{ id: string; nom: string }>;
  enCours: boolean;
  onFermer: () => void;
  onEnregistrer: (service: string, agentId: string, jour: string, debut: string, fin: string) => void;
  onSupprimer?: () => void;
}) {
  const creation = modale.mode === "creer";
  const service = creation ? modale.service : serviceDe(groupes, modale.bloc);
  const groupe = groupes.find((g) => g.service === service);
  const [agentId, setAgentId] = React.useState(creation ? (groupe?.agents[0]?.id ?? "") : modale.bloc.agentId);
  const [jour, setJour] = React.useState(creation ? modale.jour : modale.bloc.jour);
  const [debut, setDebut] = React.useState(creation ? modale.debut : modale.bloc.debut);
  const [fin, setFin] = React.useState(creation ? modale.fin : modale.bloc.fin);

  const duGroupe = new Set((groupe?.agents ?? []).map((a) => a.id));
  const autres = tousAgents.filter((a) => !duGroupe.has(a.id));
  const nuit = (versMinutes(fin) ?? 0) <= (versMinutes(debut) ?? 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onFermer} aria-label="Fermer" />
      <div className="relative w-full max-w-sm rounded-2xl border border-glass-border bg-[var(--background)] p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-semibold">
            {creation ? "Nouvelle affectation" : "Modifier l'affectation"}
          </h3>
          <button type="button" onClick={onFermer} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{groupe?.libelle ?? "Service"}</p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Agent</span>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              disabled={!creation}
              className="h-10 w-full rounded-lg glass border px-2 text-sm disabled:opacity-70"
            >
              {groupe && (
                <optgroup label={groupe.libelle}>
                  {groupe.agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.nom}</option>
                  ))}
                </optgroup>
              )}
              {creation && autres.length > 0 && (
                <optgroup label="Autres agents">
                  {autres.map((a) => (
                    <option key={a.id} value={a.id}>{a.nom}</option>
                  ))}
                </optgroup>
              )}
              {!creation && !groupe && <option value={agentId}>{modale.mode === "editer" ? modale.bloc.agentNom : ""}</option>}
            </select>
          </label>

          <div className="grid grid-cols-3 gap-2">
            <label className="col-span-1 block">
              <span className="mb-1 block text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Jour</span>
              <input type="date" value={jour} onChange={(e) => setJour(e.target.value)} className="h-10 w-full rounded-lg glass border px-2 text-sm font-mono" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Début</span>
              <input type="time" value={debut} onChange={(e) => setDebut(e.target.value)} className="h-10 w-full rounded-lg glass border px-2 text-sm font-mono" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Fin</span>
              <input type="time" value={fin} onChange={(e) => setFin(e.target.value)} className="h-10 w-full rounded-lg glass border px-2 text-sm font-mono" />
            </label>
          </div>
          {nuit && (
            <p className="text-[11px] text-muted-foreground">
              La fin précède le début : ce créneau sera traité comme une garde traversant minuit
              (fin le lendemain).
            </p>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          {onSupprimer ? (
            <button
              type="button"
              onClick={onSupprimer}
              disabled={enCours}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/40 px-3 py-2 text-xs text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Supprimer
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => agentId && onEnregistrer(service, agentId, jour, debut, fin)}
            disabled={enCours || !agentId || !debut || !fin}
            className="inline-flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/15 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/25 transition-colors disabled:opacity-50"
          >
            {enCours ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

function Legende() {
  return (
    /* Deux choses distinctes, et non plus une seule ligne grise : ce que
       les couleurs veulent dire, puis comment on manipule la grille. Les
       mêler obligeait à relire la phrase pour trouver la légende. */
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-glass-border pb-2.5 text-[11px]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {FAMILLES.filter((f) => f.type !== "repos").map((f) => (
          <span key={f.type} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-sm", f.classe)} aria-hidden="true" />
            <span className="text-muted-foreground">{f.libelle}</span>
          </span>
        ))}
      </div>
      <p className="text-muted-foreground/70">
        Glisser pour créer · déplacer un bloc · cliquer pour modifier
      </p>
    </div>
  );
}
