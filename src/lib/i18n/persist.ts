"use client";

import { isLang, type Lang } from "./index";

const COOKIE_NAME = "lvpt_lang";
const STORAGE_KEY = "lvpt_lang";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 an

/**
 * Persiste le choix de langue côté client (cookie + localStorage) pour les
 * utilisateurs non authentifiés (pages /, /login, /setup).
 *
 * Une fois authentifié, c'est session.user.lang qui prend le dessus.
 */
export function setStoredLang(lang: Lang) {
  if (typeof document === "undefined") return;
  // Cookie : lisible aussi côté serveur (cookies()) si besoin un jour
  document.cookie = `${COOKIE_NAME}=${lang}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // ignore (storage indisponible)
  }
}

export function getStoredLang(): Lang | null {
  if (typeof document === "undefined") return null;

  // localStorage en priorité (plus rapide)
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLang(stored)) return stored;
  } catch {
    // ignore
  }

  // Fallback cookie
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]+)`));
  if (match) {
    const v = decodeURIComponent(match[1]);
    if (isLang(v)) return v;
  }

  return null;
}

/**
 * Détecte la langue préférée du navigateur (fallback intelligent).
 * Retourne `it` si l'utilisateur a IT dans son navigateur, sinon `fr`.
 */
export function detectBrowserLang(): Lang {
  if (typeof navigator === "undefined") return "fr";
  const langs = navigator.languages ?? [navigator.language];
  for (const l of langs) {
    const code = l.toLowerCase().slice(0, 2);
    if (code === "it") return "it";
    if (code === "fr") return "fr";
  }
  return "fr";
}
