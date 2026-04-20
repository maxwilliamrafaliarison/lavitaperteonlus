import { auth } from "@/auth";
import { UserMenu } from "./user-menu";
import { redirect } from "next/navigation";

export async function AppTopbar({ title }: { title?: string }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { name, email, role, lang } = session.user;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-glass-border bg-background/60 backdrop-blur-2xl px-6 md:px-8">
      <div className="flex items-center gap-3 min-w-0">
        {title && (
          <h1 className="font-display text-xl font-semibold tracking-tight truncate">
            {title}
          </h1>
        )}
      </div>

      <UserMenu
        name={name ?? email ?? ""}
        email={email ?? ""}
        role={role}
        lang={lang}
      />
    </header>
  );
}
