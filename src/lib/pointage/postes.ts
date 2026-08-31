/* ============================================================
   POSTES DE COLLECTE — reconnaissance d'un poste par son secret
   ============================================================

   Module PUR. Un poste de collecte est une machine du centre autorisée à
   déposer des badgeages, et rien d'autre : elle ne détient pas la clé de la
   base, seulement un secret dédié.

   ── POURQUOI PLUSIEURS SECRETS PLUTÔT QU'UN ──────────────────────────────
   Tant qu'un seul poste existait, un secret unique suffisait. Dès qu'un
   second détenteur apparaît, le secret partagé pose deux problèmes concrets :
   on ne peut plus retirer l'accès à l'un sans le retirer à l'autre, et le
   journal d'import ne dit plus quelle machine a déposé. Les deux comptent le
   jour où un poste est volé, remplacé, ou dépose des données douteuses.

   Chaque poste a donc SON secret, et un nom qui le suit jusque dans le
   journal. Retirer un poste consiste à effacer sa ligne de la variable
   d'environnement, sans toucher aux autres.

   ── FORMAT ───────────────────────────────────────────────────────────────
   `POINTAGE_COLLECTE_SECRET` accepte une liste séparée par des virgules :

       aina:xxxxxxxx,jim:yyyyyyyy

   Un secret nu, sans nom, reste accepté tel quel : la configuration en place
   au moment où ce module a été écrit ne devait pas cesser de fonctionner
   pendant le déploiement.
   ============================================================ */

export interface Poste {
  /** Nom lisible, repris dans le journal d'import. */
  nom: string;
  secret: string;
}

/**
 * Comparaison à durée constante.
 *
 * Comparer deux secrets avec `===` s'arrête au premier caractère qui diffère,
 * et le temps de réponse laisse alors deviner le préfixe correct. Le risque
 * est faible ici, mais le coût de s'en prémunir l'est plus encore.
 */
function memeSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Lit la liste des postes autorisés depuis la variable d'environnement. */
export function lirePostes(brut: string | undefined): Poste[] {
  return String(brut ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entree) => {
      const sep = entree.indexOf(":");
      /* Le secret peut contenir n'importe quel caractère ; seul le PREMIER
         deux-points sépare, et un secret qui en contiendrait ne serait pas
         tronqué. */
      if (sep <= 0) return { nom: "poste", secret: entree };
      return { nom: entree.slice(0, sep).trim() || "poste", secret: entree.slice(sep + 1) };
    })
    .filter((p) => p.secret.length > 0);
}

/**
 * Quel poste présente ce secret ? `null` si aucun.
 *
 * On parcourt TOUS les postes même après avoir trouvé : sortir à la première
 * correspondance rendrait le temps de réponse dépendant du rang du poste
 * dans la liste.
 */
export function posteDuSecret(fourni: string, postes: Poste[]): Poste | null {
  let trouve: Poste | null = null;
  for (const p of postes) if (memeSecret(fourni, p.secret)) trouve = p;
  return trouve;
}
