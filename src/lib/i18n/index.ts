import fr from "./messages/fr.json";
import it from "./messages/it.json";

/* ============================================================
   I18N LÉGER — pas de routing /locale, source de vérité = session.user.lang
   - `getT(lang)` retourne un callable `t(key, vars?)` qui résout les clés
     dottées depuis le catalogue correspondant, avec fallback FR.
   - Interpolation simple {var} supportée.
   - Usage serveur ou client : passer `lang` via props ou depuis session.
   ============================================================ */

export type Lang = "fr" | "it";

type Catalog = Record<string, unknown>;

const CATALOGS: Record<Lang, Catalog> = {
  fr: fr as Catalog,
  it: it as Catalog,
};

export const SUPPORTED_LANGS: Lang[] = ["fr", "it"];

// Résout une clé dottée "dashboard.welcome" dans un objet JSON imbriqué.
function lookup(catalog: Catalog, key: string): string | undefined {
  const parts = key.split(".");
  let cur: unknown = catalog;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}

function interpolate(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    const v = vars[name];
    return v === undefined || v === null ? `{${name}}` : String(v);
  });
}

export type TFn = (key: string, vars?: Record<string, string | number>) => string;

/**
 * Retourne une fonction t() liée à la langue donnée.
 * Fallback : si la clé n'existe pas dans la langue, on essaie en FR,
 * puis on retourne la clé elle-même (aide au debug).
 */
export function getT(lang: Lang): TFn {
  const primary = CATALOGS[lang] ?? CATALOGS.fr;
  const fallback = CATALOGS.fr;

  return (key, vars) => {
    const raw = lookup(primary, key) ?? lookup(fallback, key);
    if (raw === undefined) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[i18n] missing key: ${key} (lang=${lang})`);
      }
      return key;
    }
    return interpolate(raw, vars);
  };
}

export function isLang(value: unknown): value is Lang {
  return value === "fr" || value === "it";
}
