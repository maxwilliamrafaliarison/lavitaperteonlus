#!/usr/bin/env node
/**
 * PUBLIE UN OU PLUSIEURS PLANNINGS, comme le ferait le bouton de l'écran.
 *
 * Le chemin normal reste l'application : « Tous les plannings », un clic par
 * semaine. Ce script existe pour publier plusieurs semaines d'affilée après
 * un import de reprise, sans quinze allers-retours.
 *
 * ── IL REPREND LES BRIQUES DE L'ACTION, IL NE LES CONTOURNE PAS ──────────
 * Publier n'est pas un simple changement de statut. Deux invariants tiennent
 * à l'écran et doivent tenir ici :
 *
 *  1. LE REFUS SUR POSTE CRITIQUE VIDE. C'est le seul refus de tout le
 *     module. Publier, c'est annoncer la semaine au personnel : une semaine
 *     où la sécurité ou l'accueil de REX n'ont personne ne part pas sans
 *     que quelqu'un l'ait vu et assumé. Le script REFUSE de la même façon,
 *     et `--motif=` lève le refus en restant écrit sur le planning, comme
 *     le fait le formulaire.
 *
 *  2. LE LIEN NE CHANGE JAMAIS. Le jeton appartient au CENTRE : on reprend
 *     celui de ses plannings déjà publiés, et la nouvelle semaine s'ajoute
 *     derrière la même adresse. En engendrer un nouveau obligerait à
 *     rediffuser un lien, et l'ancien afficherait une semaine périmée sans
 *     le dire.
 *
 * Usage :
 *   npx tsx scripts/publier-planning.mts --ids=PLN-REX-20260907,PLN-REX-20260914
 *   npx tsx scripts/publier-planning.mts --ids=… --par=direction@… --apply
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const {
  listPlannings, listAffectations, listCreneaux, listServices,
  listParametresPlanning, majPlanning, tokenDuCentre, genererToken,
} = await import("../src/lib/planning/data.ts");
const { lireExigences, trousCritiques, resumerTrous, EXIGENCES_DEFAUT } =
  await import("../src/lib/planning/postes-critiques.ts");
const { PREFIXE_ATTENTE } = await import("../src/lib/planning/constantes.ts");

const APPLY = process.argv.includes("--apply");
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const IDS = arg("ids")?.split(",").map((s) => s.trim()).filter(Boolean);
if (!IDS?.length) throw new Error("--ids= est obligatoire : on ne publie pas un centre entier par mégarde.");
const PAR = arg("par") ?? "import";
const MOTIF = (arg("motif") ?? "").slice(0, 300);

const plannings = await listPlannings();
const [creneaux, services, parametres] = await Promise.all([
  listCreneaux(), listServices(), listParametresPlanning(),
]);
const typeDe = new Map(creneaux.map((c) => [c.id, c.type]));

/** Les jours d'un planning, bornes incluses. */
function joursDe(du: string, au: string): string[] {
  const out: string[] = [];
  for (let j = du; j <= au; ) {
    out.push(j);
    const d = new Date(`${j}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    j = d.toISOString().slice(0, 10);
  }
  return out;
}

let publies = 0;
let refuses = 0;

for (const id of IDS) {
  const p = plannings.find((x) => x.id === id);
  if (!p) {
    console.log(`✗ ${id} : introuvable`);
    refuses += 1;
    continue;
  }

  const affectations = await listAffectations(id);
  const libelles = new Map<string, string>([
    ...services.map((s) => [s.id, s.libelle] as [string, string]),
    ["garde_nuit", "Garde de nuit"],
  ]);
  const cle = `postes_critiques_${p.centre.toUpperCase()}`;
  const brut = parametres.find((x) => x.cle === cle)?.valeur ?? EXIGENCES_DEFAUT[p.centre.toUpperCase()];
  const exigences = lireExigences(brut, libelles);

  const trous = exigences.length
    ? trousCritiques(
        joursDe(p.du, p.au),
        affectations.map((a) => ({
          jour: a.jour,
          serviceId: a.service_id,
          creneauType: typeDe.get(a.creneau_id) ?? "",
          repos: typeDe.get(a.creneau_id) === "repos",
          sansTitulaire: a.agent_id.startsWith(PREFIXE_ATTENTE),
        })),
        exigences,
      )
    : [];

  const entete = `${p.centre} ${p.du} → ${p.au} (${affectations.length} affectations, statut ${p.statut})`;

  if (trous.length && !MOTIF) {
    console.log(`✗ ${id} : ${entete}`);
    console.log(`    REFUS — poste critique sans personne : ${resumerTrous(trous)}`);
    console.log(`    Complétez le planning, ou relancez avec --motif="…" pour publier en l'assumant.`);
    refuses += 1;
    continue;
  }

  const token =
    p.token_public || (await tokenDuCentre(p.centre).catch(() => "")) || genererToken();
  const maintenant = new Date().toISOString();

  console.log(`${APPLY ? "→" : "·"} ${id} : ${entete}`);
  console.log(`    jeton ${p.token_public ? "conservé" : token === (await tokenDuCentre(p.centre).catch(() => "")) ? "repris du centre" : "engendré"} · ${token.slice(0, 8)}…`);
  if (trous.length) console.log(`    ⚠ publié malgré : ${resumerTrous(trous)}`);

  if (APPLY) {
    await majPlanning(id, {
      statut: "publie",
      token_public: token,
      publie_par: PAR,
      publie_le: maintenant,
      modifie_le: maintenant,
      /* La note s'AJOUTE, elle ne remplace pas. L'import y a inscrit d'où
         vient la semaine — quel classeur, quelle feuille — et cette
         provenance est ce qui permet, six mois plus tard, de retrouver la
         source d'une affectation contestée. L'écraser par le motif de
         publication échangerait une trace contre une autre. */
      ...(trous.length && MOTIF
        ? {
            note: [p.note, `Publié malgré un poste vide (${resumerTrous(trous)}) : ${MOTIF}`]
              .filter(Boolean)
              .join(" · "),
          }
        : {}),
    });
  }
  publies += 1;
}

console.log(`\n${publies} planning(s) ${APPLY ? "publié(s)" : "à publier"} · ${refuses} refusé(s)`);
if (!APPLY) console.log("(simulation — relancez avec --apply)");
