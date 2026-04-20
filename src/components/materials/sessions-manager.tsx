"use client";

import * as React from "react";
import { Eye, EyeOff, Copy, Plus, Trash2, Pencil, Lock, ShieldCheck, Loader2, X, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { GlassButton } from "@/components/glass/glass-button";
import { GlassCard } from "@/components/glass/glass-card";
import { cn } from "@/lib/utils";
import type { MaterialSession } from "@/types";

import {
  revealPasswordAction,
  createSessionAction,
  updateSessionAction,
  deleteSessionAction,
  type SessionActionState,
} from "./sessions-actions";

interface SessionsManagerProps {
  materialId: string;
  sessions: MaterialSession[];
  canReveal: boolean;
  canEdit: boolean;
}

interface RevealedState {
  [sessionId: string]: { value: string; until: number } | undefined;
}

const REVEAL_DURATION_MS = 30_000;

export function SessionsManager({
  materialId,
  sessions: initialSessions,
  canReveal,
  canEdit,
}: SessionsManagerProps) {
  const [sessions, setSessions] = React.useState(initialSessions);
  const [revealed, setRevealed] = React.useState<RevealedState>({});
  const [loadingId, setLoadingId] = React.useState<string | null>(null);
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  // Auto-mask after timeout
  React.useEffect(() => {
    const timer = setInterval(() => {
      setRevealed((prev) => {
        const now = Date.now();
        const next: RevealedState = {};
        let changed = false;
        for (const [id, val] of Object.entries(prev)) {
          if (val && val.until > now) {
            next[id] = val;
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  async function handleReveal(session: MaterialSession) {
    setLoadingId(session.id);
    try {
      const result = await revealPasswordAction(session.id);
      if (result.ok && result.password) {
        setRevealed((prev) => ({
          ...prev,
          [session.id]: { value: result.password!, until: Date.now() + REVEAL_DURATION_MS },
        }));
        toast.success("Mot de passe révélé", {
          description: "Consultation enregistrée dans le journal d'audit.",
        });
      } else {
        toast.error("Impossible de révéler", { description: result.error });
      }
    } catch (e) {
      toast.error("Erreur inattendue", { description: String(e) });
    } finally {
      setLoadingId(null);
    }
  }

  function handleHide(sessionId: string) {
    setRevealed((prev) => {
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
  }

  async function handleCopy(session: MaterialSession) {
    setLoadingId(session.id);
    try {
      const r = revealed[session.id];
      let value: string;
      if (r) {
        value = r.value;
      } else {
        const result = await revealPasswordAction(session.id);
        if (!result.ok || !result.password) {
          toast.error("Impossible de copier", { description: result.error });
          return;
        }
        value = result.password;
      }
      await navigator.clipboard.writeText(value);
      toast.success("Mot de passe copié", {
        description: "Consultation enregistrée dans le journal d'audit.",
      });
    } catch (e) {
      toast.error("Erreur copie", { description: String(e) });
    } finally {
      setLoadingId(null);
    }
  }

  async function handleDelete(sessionId: string) {
    if (!confirm("Supprimer cette session ? Le mot de passe sera perdu.")) return;
    setLoadingId(sessionId);
    try {
      const result = await deleteSessionAction(sessionId);
      if (result.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        toast.success("Session supprimée");
      } else {
        toast.error("Erreur", { description: result.error });
      }
    } finally {
      setLoadingId(null);
    }
  }

  function handleSessionAdded(s: MaterialSession) {
    setSessions((prev) => [...prev, s]);
    setShowAddModal(false);
    toast.success("Session ajoutée");
  }

  function handleSessionUpdated(s: MaterialSession) {
    setSessions((prev) => prev.map((x) => (x.id === s.id ? s : x)));
    setEditingId(null);
    toast.success("Session mise à jour");
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4 mb-5">
        <p className="text-xs text-muted-foreground">
          {sessions.length === 0
            ? "Aucune session configurée."
            : `${sessions.length} session${sessions.length > 1 ? "s" : ""} · MDP chiffrés AES-256`}
        </p>
        {canEdit && (
          <GlassButton variant="glass" size="sm" onClick={() => setShowAddModal(true)}>
            <Plus className="size-3.5" />
            Ajouter
          </GlassButton>
        )}
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-glass-border p-8 text-center">
          <Lock className="size-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            Aucun compte configuré sur ce matériel.
          </p>
          {canEdit && (
            <p className="text-xs text-muted-foreground mt-1">
              Cliquez sur &quot;Ajouter&quot; pour enregistrer le premier compte.
            </p>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {sessions.map((session) => {
            const reveal = revealed[session.id];
            const isLoading = loadingId === session.id;
            const remainingSec = reveal ? Math.max(0, Math.ceil((reveal.until - Date.now()) / 1000)) : 0;

            return (
              <li key={session.id}>
                <div className="rounded-2xl glass border p-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium">{session.sessionName}</h4>
                        {session.isAdmin && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 text-primary px-1.5 h-4 text-[9px] font-medium uppercase tracking-wider">
                            <ShieldCheck className="size-2.5" />
                            admin
                          </span>
                        )}
                      </div>
                      {session.assignedUser && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Affecté à : <span className="text-foreground">{session.assignedUser}</span>
                        </p>
                      )}
                      {session.notes && (
                        <p className="text-xs text-muted-foreground mt-1.5 italic">
                          {session.notes}
                        </p>
                      )}

                      {/* Password row */}
                      <div className="mt-3 flex items-center gap-2">
                        <code
                          className={cn(
                            "flex-1 min-w-0 px-3 h-9 inline-flex items-center rounded-xl bg-background/50 border border-glass-border text-sm font-mono select-all overflow-x-auto whitespace-nowrap",
                            !reveal && "tracking-widest text-muted-foreground",
                          )}
                        >
                          {reveal ? reveal.value : "•".repeat(12)}
                        </code>
                        {reveal && (
                          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                            {remainingSec}s
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {canReveal && (
                        <>
                          {reveal ? (
                            <button
                              onClick={() => handleHide(session.id)}
                              className="size-9 inline-flex items-center justify-center rounded-xl glass border hover:bg-white/10 transition-colors"
                              aria-label="Masquer"
                            >
                              <EyeOff className="size-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleReveal(session)}
                              disabled={isLoading}
                              className="size-9 inline-flex items-center justify-center rounded-xl glass border hover:bg-white/10 transition-colors disabled:opacity-50"
                              aria-label="Voir le mot de passe"
                            >
                              {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
                            </button>
                          )}
                          <button
                            onClick={() => handleCopy(session)}
                            disabled={isLoading}
                            className="size-9 inline-flex items-center justify-center rounded-xl glass border hover:bg-white/10 transition-colors disabled:opacity-50"
                            aria-label="Copier"
                          >
                            <Copy className="size-4" />
                          </button>
                        </>
                      )}
                      {canEdit && (
                        <>
                          <button
                            onClick={() => setEditingId(session.id)}
                            className="size-9 inline-flex items-center justify-center rounded-xl glass border hover:bg-white/10 transition-colors"
                            aria-label="Modifier"
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(session.id)}
                            disabled={isLoading}
                            className="size-9 inline-flex items-center justify-center rounded-xl glass border hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
                            aria-label="Supprimer"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!canReveal && sessions.length > 0 && (
        <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground rounded-2xl bg-muted/50 border border-glass-border p-3">
          <AlertCircle className="size-4 shrink-0 mt-0.5 text-accent" />
          <span>
            Votre rôle ne vous autorise pas à voir les mots de passe en clair. Contactez l&apos;administrateur si vous avez besoin d&apos;y accéder.
          </span>
        </div>
      )}

      {showAddModal && (
        <SessionFormModal
          materialId={materialId}
          onClose={() => setShowAddModal(false)}
          onSaved={handleSessionAdded}
        />
      )}

      {editingId && (
        <SessionFormModal
          materialId={materialId}
          session={sessions.find((s) => s.id === editingId)}
          onClose={() => setEditingId(null)}
          onSaved={handleSessionUpdated}
        />
      )}
    </>
  );
}

/* ----------------------------------------------------------- */

function SessionFormModal({
  materialId,
  session,
  onClose,
  onSaved,
}: {
  materialId: string;
  session?: MaterialSession;
  onClose: () => void;
  onSaved: (s: MaterialSession) => void;
}) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const isEdit = !!session;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(undefined);
    const formData = new FormData(e.currentTarget);
    let result: SessionActionState;
    if (isEdit && session) {
      result = await updateSessionAction(session.id, formData);
    } else {
      formData.set("materialId", materialId);
      result = await createSessionAction(formData);
    }
    setPending(false);
    if (result.ok && result.session) {
      onSaved(result.session);
    } else {
      setError(result.error ?? "Erreur inconnue");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/60 backdrop-blur-md"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md">
        <GlassCard intensity="strong" className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-display text-xl font-semibold">
                {isEdit ? "Modifier la session" : "Ajouter une session"}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Le mot de passe sera chiffré AES-256 dans le Sheet.
              </p>
            </div>
            <button
              onClick={onClose}
              className="size-8 inline-flex items-center justify-center rounded-full glass border hover:bg-white/10 transition-colors"
              aria-label="Fermer"
            >
              <X className="size-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Field label="Nom de session" required>
              <input
                name="sessionName"
                required
                defaultValue={session?.sessionName ?? ""}
                placeholder="Administrator, Accueil, Mission…"
                className="w-full h-11 rounded-2xl glass border px-4 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/30"
              />
            </Field>

            <Field
              label={isEdit ? "Nouveau mot de passe (laisser vide pour conserver)" : "Mot de passe"}
              required={!isEdit}
            >
              <input
                name="plainPassword"
                type="text"
                required={!isEdit}
                placeholder={isEdit ? "Laisser vide" : "Mot de passe en clair"}
                className="w-full h-11 rounded-2xl glass border px-4 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/30 font-mono"
              />
            </Field>

            <Field label="Utilisateur affecté (optionnel)">
              <input
                name="assignedUser"
                defaultValue={session?.assignedUser ?? ""}
                placeholder="Perline, Felana, …"
                className="w-full h-11 rounded-2xl glass border px-4 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/30"
              />
            </Field>

            <Field label="Notes (optionnel)">
              <textarea
                name="notes"
                rows={2}
                defaultValue={session?.notes ?? ""}
                placeholder="Détail additionnel"
                className="w-full rounded-2xl glass border px-4 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </Field>

            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                name="isAdmin"
                defaultChecked={session?.isAdmin ?? false}
                className="size-4 rounded border-glass-border accent-primary"
              />
              Compte administrateur
            </label>

            {error && (
              <div className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2">
              <GlassButton variant="ghost" size="md" type="button" onClick={onClose}>
                Annuler
              </GlassButton>
              <GlassButton variant="brand" size="md" type="submit" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                {isEdit ? "Enregistrer" : "Ajouter"}
              </GlassButton>
            </div>
          </form>
        </GlassCard>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
        {required && <span className="text-primary ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}
