"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type Lang = "fr" | "it";

interface LanguageSwitcherProps {
  value: Lang;
  onChange: (lang: Lang) => void;
  className?: string;
}

export function LanguageSwitcher({ value, onChange, className }: LanguageSwitcherProps) {
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
          onClick={() => onChange(lang)}
          className={cn(
            "px-3 h-7 rounded-full text-xs font-medium uppercase tracking-wider transition-all",
            value === lang
              ? "bg-primary text-primary-foreground shadow-md"
              : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={value === lang}
        >
          {lang}
        </button>
      ))}
    </div>
  );
}
