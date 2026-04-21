"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { setStoredLang } from "@/lib/i18n/persist";
import { type Lang } from "@/lib/i18n";

export type { Lang };

interface LanguageSwitcherProps {
  value: Lang;
  onChange: (lang: Lang) => void;
  /** Si true, persiste aussi le choix dans cookie + localStorage (pages publiques). */
  persist?: boolean;
  className?: string;
}

export function LanguageSwitcher({
  value,
  onChange,
  persist = false,
  className,
}: LanguageSwitcherProps) {
  function handleChange(lang: Lang) {
    if (persist) setStoredLang(lang);
    onChange(lang);
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full p-1 glass border",
        className,
      )}
    >
      {(["fr", "it"] as const).map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => handleChange(lang)}
          className={cn(
            "px-3 h-7 rounded-full text-xs font-medium uppercase tracking-wider transition-all",
            value === lang
              ? "bg-primary text-primary-foreground shadow-md"
              : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={value === lang}
        >
          {lang === "fr" ? "🇫🇷 FR" : "🇮🇹 IT"}
        </button>
      ))}
    </div>
  );
}
