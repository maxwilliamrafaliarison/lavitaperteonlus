"use client";

import * as React from "react";
import { LogOut, User as UserIcon, Languages, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { logoutAction } from "@/lib/auth/actions";
import type { UserRole } from "@/types";
import { ROLE_LABELS } from "@/types";

interface UserMenuProps {
  name: string;
  email: string;
  role: UserRole;
  lang: "fr" | "it";
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
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const isDark = mounted ? theme === "dark" : true;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-3 rounded-full glass border pl-1.5 pr-4 h-10 transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        aria-label="Menu utilisateur"
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
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="font-medium">{name}</span>
          <span className="text-xs text-muted-foreground font-normal">
            {email}
          </span>
          <span className="mt-1.5 inline-flex w-fit items-center rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
            {ROLE_LABELS[role][lang]}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            setTheme(isDark ? "light" : "dark");
          }}
        >
          {isDark ? <Sun className="size-4 mr-2" /> : <Moon className="size-4 mr-2" />}
          {isDark ? "Mode clair" : "Mode sombre"}
        </DropdownMenuItem>

        <DropdownMenuItem disabled>
          <Languages className="size-4 mr-2" />
          Langue : {lang.toUpperCase()}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center px-2 py-1.5 text-sm rounded-sm hover:bg-destructive/10 text-destructive transition-colors"
          >
            <LogOut className="size-4 mr-2" />
            Se déconnecter
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
