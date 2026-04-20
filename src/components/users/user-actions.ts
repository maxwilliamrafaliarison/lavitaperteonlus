"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { auth } from "@/auth";
import { can } from "@/lib/auth/permissions";
import {
  listUsers,
  getUserById,
  getUserByEmail,
  createUser,
  updateUser,
} from "@/lib/sheets/users";
import { hashPassword, validatePassword } from "@/lib/auth/password";
import { logAudit, AuditAction } from "@/lib/sheets/audit";
import type { AppUser, UserRole } from "@/types";

export type UserActionState = {
  ok: boolean;
  error?: string;
  user?: AppUser;
};

function genUserId(): string {
  return `usr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const ALLOWED_ROLES: UserRole[] = ["admin", "informaticien", "direction", "logistique"];
const ALLOWED_LANGS = ["fr", "it"] as const;

/* ============================================================
   INVITE — crée un nouvel utilisateur (admin only)
   ============================================================ */
export async function inviteUserAction(formData: FormData): Promise<UserActionState> {
  const userSession = await auth();
  if (!userSession?.user) return { ok: false, error: "Non authentifié." };
  if (!can(userSession.user.role, "user:invite")) {
    return { ok: false, error: "Seul un administrateur peut inviter des utilisateurs." };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "") as UserRole;
  const lang = String(formData.get("lang") ?? "fr") as "fr" | "it";
  const password = String(formData.get("password") ?? "");

  if (!email || !name) {
    return { ok: false, error: "Email et nom sont requis." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Email invalide." };
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return { ok: false, error: "Rôle invalide." };
  }
  if (!ALLOWED_LANGS.includes(lang)) {
    return { ok: false, error: "Langue invalide." };
  }
  const pwdCheck = validatePassword(password);
  if (!pwdCheck.ok) {
    return { ok: false, error: pwdCheck.error };
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    return { ok: false, error: `Un utilisateur existe déjà pour ${email}.` };
  }

  try {
    const passwordHash = await hashPassword(password);
    const user: AppUser = {
      id: genUserId(),
      email,
      passwordHash,
      name,
      role,
      lang,
      active: true,
      createdAt: new Date().toISOString(),
      invitedBy: userSession.user.id,
    };
    await createUser(user);

    const h = await headers();
    await logAudit({
      userId: userSession.user.id,
      userEmail: userSession.user.email ?? "",
      action: AuditAction.InviteUser,
      targetType: "user",
      targetId: user.id,
      details: `Invitation : ${email} (${role})`,
      ip: h.get("x-forwarded-for") ?? "",
      userAgent: h.get("user-agent") ?? "",
    });

    revalidatePath("/users");
    return { ok: true, user };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/* ============================================================
   TOGGLE ACTIVE — active/désactive un compte (admin only)
   ============================================================ */
export async function toggleActiveUserAction(userId: string): Promise<UserActionState> {
  const userSession = await auth();
  if (!userSession?.user) return { ok: false, error: "Non authentifié." };
  if (!can(userSession.user.role, "user:deactivate")) {
    return { ok: false, error: "Action réservée à l'administrateur." };
  }
  if (userSession.user.id === userId) {
    return { ok: false, error: "Vous ne pouvez pas désactiver votre propre compte." };
  }

  const target = await getUserById(userId);
  if (!target) return { ok: false, error: "Utilisateur introuvable." };

  try {
    const user = await updateUser(userId, { active: !target.active });

    const h = await headers();
    await logAudit({
      userId: userSession.user.id,
      userEmail: userSession.user.email ?? "",
      action: AuditAction.InviteUser, // pas d'action dédiée : on réutilise un marqueur proche
      targetType: "user",
      targetId: userId,
      details: user.active
        ? `Réactivation de ${target.email}`
        : `Désactivation de ${target.email}`,
      ip: h.get("x-forwarded-for") ?? "",
      userAgent: h.get("user-agent") ?? "",
    });

    revalidatePath("/users");
    return { ok: true, user };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/* ============================================================
   UPDATE ROLE/LANG/NAME — modification profil (admin only)
   ============================================================ */
export async function updateUserAction(
  userId: string,
  formData: FormData,
): Promise<UserActionState> {
  const userSession = await auth();
  if (!userSession?.user) return { ok: false, error: "Non authentifié." };
  if (!can(userSession.user.role, "user:update")) {
    return { ok: false, error: "Action réservée à l'administrateur." };
  }

  const target = await getUserById(userId);
  if (!target) return { ok: false, error: "Utilisateur introuvable." };

  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "") as UserRole;
  const lang = String(formData.get("lang") ?? "") as "fr" | "it";

  if (!name) return { ok: false, error: "Le nom est requis." };
  if (!ALLOWED_ROLES.includes(role)) {
    return { ok: false, error: "Rôle invalide." };
  }
  if (!ALLOWED_LANGS.includes(lang)) {
    return { ok: false, error: "Langue invalide." };
  }

  // Garde-fou : ne pas retirer son propre rôle admin
  if (userSession.user.id === userId && target.role === "admin" && role !== "admin") {
    return {
      ok: false,
      error: "Vous ne pouvez pas retirer votre propre rôle administrateur.",
    };
  }

  try {
    const user = await updateUser(userId, { name, role, lang });

    const h = await headers();
    const changes: string[] = [];
    if (target.name !== name) changes.push(`nom`);
    if (target.role !== role) changes.push(`rôle → ${role}`);
    if (target.lang !== lang) changes.push(`langue → ${lang}`);

    await logAudit({
      userId: userSession.user.id,
      userEmail: userSession.user.email ?? "",
      action: AuditAction.InviteUser,
      targetType: "user",
      targetId: userId,
      details: `Mise à jour ${target.email} : ${changes.join(", ") || "aucun changement"}`,
      ip: h.get("x-forwarded-for") ?? "",
      userAgent: h.get("user-agent") ?? "",
    });

    revalidatePath("/users");
    return { ok: true, user };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/* ============================================================
   RESET PASSWORD — admin force un nouveau MDP pour un user
   ============================================================ */
export async function resetPasswordAction(
  userId: string,
  newPassword: string,
): Promise<UserActionState> {
  const userSession = await auth();
  if (!userSession?.user) return { ok: false, error: "Non authentifié." };
  if (!can(userSession.user.role, "user:update")) {
    return { ok: false, error: "Action réservée à l'administrateur." };
  }

  const target = await getUserById(userId);
  if (!target) return { ok: false, error: "Utilisateur introuvable." };

  const pwdCheck = validatePassword(newPassword);
  if (!pwdCheck.ok) return { ok: false, error: pwdCheck.error };

  try {
    const passwordHash = await hashPassword(newPassword);
    const user = await updateUser(userId, { passwordHash });

    const h = await headers();
    await logAudit({
      userId: userSession.user.id,
      userEmail: userSession.user.email ?? "",
      action: AuditAction.InviteUser,
      targetType: "user",
      targetId: userId,
      details: `Reset MDP : ${target.email}`,
      ip: h.get("x-forwarded-for") ?? "",
      userAgent: h.get("user-agent") ?? "",
    });

    revalidatePath("/users");
    return { ok: true, user };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/* ============================================================
   READ — utilisé par la page users
   ============================================================ */
export async function getUsersForAdminAction(): Promise<AppUser[]> {
  const userSession = await auth();
  if (!userSession?.user || userSession.user.role !== "admin") {
    return [];
  }
  return listUsers();
}
