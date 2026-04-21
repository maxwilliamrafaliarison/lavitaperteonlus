"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut, User as UserIcon, Languages, Sun, Moon, Settings } from "lucide-react";
import { useTheme } from "next-themes";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { UserRole } from "@/types";
import { ROLE_LABELS } from "@/types";
import { getT, type Lang } from "@/lib/i18n";

interface UserMenuProps {
  name: string;
  email: string;
  role: UserRole;
  lang: Lang;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function UserMenu({ name, email, role, lang }: UserMenuProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const isDark = mounted ? theme === "dark" : true;
  const t = React.useMemo(() => getT(lang), [lang]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-3 rounded-full glass border pl-1.5 pr-4 h-10 transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        aria-label="Menu"
      >
        <Avatar className="size-7">
          <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
            {initials(name) || <UserIcon className="size-3.5" />}
          </AvatarFallback>
        </Avatar>
        <div className="hidden md:flex flex-col items-start leading-tight">
          <span className="text-xs font-medium">{name}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            {ROLE_LABELS[role][lang]}
          </span>
        </div>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        {/* En-tête : div stylisé (pas DropdownMenuLabel qui exige un
            DropdownMenuGroup parent → Base UI #31 sinon) */}
        <div className="flex flex-col gap-0.5 px-2 py-1.5 text-sm">
          <span className="font-medium">{name}</span>
          <span className="text-xs text-muted-foreground font-normal">
            {email}
          </span>
          <span className="mt-1.5 inline-flex w-fit items-center rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
            {ROLE_LABELS[role][lang]}
          </span>
        </div>
        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => router.push("/settings")}>
          <Settings className="size-4 mr-2" />
          {t("user_menu.my_settings")}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => setTheme(isDark ? "light" : "dark")}
          closeOnClick={false}
        >
          {isDark ? <Sun className="size-4 mr-2" /> : <Moon className="size-4 mr-2" />}
          {isDark ? t("user_menu.theme_light") : t("user_menu.theme_dark")}
        </DropdownMenuItem>

        <DropdownMenuItem disabled>
          <Languages className="size-4 mr-2" />
          {t("user_menu.language_label")} : {lang.toUpperCase()}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            // Navigation vers /logout qui gère audit + signOut dans un
            // useEffect — isolé du cycle de vie du DropdownMenu Base UI.
            router.push("/logout");
          }}
        >
          <LogOut className="size-4 mr-2" />
          {t("user_menu.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
