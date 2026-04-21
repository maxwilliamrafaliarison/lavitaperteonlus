"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Save, Loader2, Cpu, Package, MapPin,
  Banknote, Wifi, FileText, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass/glass-card";
import { GlassButton } from "@/components/glass/glass-button";
import { cn } from "@/lib/utils";
import {
  MATERIAL_TYPE_LABELS,
  type Material, type Site, type Room, type MaterialType, type MaterialState,
} from "@/types";
import { type Lang } from "@/lib/i18n";

import {
  createMaterialAction,
  updateMaterialAction,
} from "./material-form-actions";

interface Props {
  mode: "create" | "edit";
  material?: Material;
  sites: Site[];
  rooms: Room[];
  defaultSiteId?: string;
  defaultRoomId?: string;
  lang?: Lang;
}

const TYPES: MaterialType[] = [
  "ordinateur_fixe", "ordinateur_portable", "ordinateur_bdd",
  "imprimante", "scanner", "routeur", "switch", "box",
  "telephone", "serveur", "ecran", "peripherique", "autre",
];

const STATES: { value: MaterialState; label: string }[] = [
  { value: "operationnel", label: "Opérationnel" },
  { value: "en_panne", label: "En panne" },
  { value: "en_reparation", label: "En réparation" },
  { value: "obsolete", label: "Obsolète" },
  { value: "hors_service", label: "Hors service" },
];

export function MaterialForm({
  mode,
  material,
  sites,
  rooms,
  defaultSiteId,
  defaultRoomId,
  lang = "fr",
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const initialSite = material?.siteId ?? defaultSiteId ?? sites[0]?.id ?? "";
  const [siteId, setSiteId] = React.useState(initialSite);
  const [roomId, setRoomId] = React.useState(
    material?.roomId ??
      defaultRoomId ??
      rooms.find((r) => r.siteId === initialSite)?.id ??
      "",
  );

  const availableRooms = rooms.filter((r) => r.siteId === siteId);

  React.useEffect(() => {
    if (!availableRooms.some((r) => r.id === roomId)) {
      setRoomId(availableRooms[0]?.id ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    formData.set("siteId", siteId);
    formData.set("roomId", roomId);

    try {
      const result =
        mode === "create"
          ? await createMaterialAction(formData)
          : await updateMaterialAction(material!.id, formData);

      if (result.ok && result.material) {
        toast.success(
          mode === "create" ? "Matériel créé" : "Matériel mis à jour",
        );
        router.push(`/materials/${result.material.id}`);
        router.refresh();
      } else {
        setError(result.error ?? "Erreur inconnue");
        toast.error("Échec", { description: result.error });
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const backHref = material ? `/materials/${material.id}` : "/materials";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        Retour
      </Link>

      {/* Identification */}
      <Section icon={<Package className="size-5" />} title="Identification">
        <Grid>
          <Field label="Référence *" required>
            <Input
              name="ref"
              defaultValue={material?.ref ?? ""}
              placeholder="REX-INFO-043A-2026"
              required
              className="font-mono"
            />
          </Field>
          <Field label="Type *" required>
            <Select name="type" defaultValue={material?.type ?? "autre"} required>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {MATERIAL_TYPE_LABELS[t][lang]}
                </option>
              ))}
            </Select>
          </Field>
        </Grid>
        <Field label="Désignation *" required>
          <Input
            name="designation"
            defaultValue={material?.designation ?? ""}
            placeholder="Ex: Ordinateur portable HP ProBook"
            required
          />
        </Field>
        <Grid>
          <Field label="Marque">
            <Input name="brand" defaultValue={material?.brand ?? ""} placeholder="HP, Dell, TP-Link…" />
          </Field>
          <Field label="Modèle">
            <Input name="model" defaultValue={material?.model ?? ""} placeholder="ProBook 450" />
          </Field>
        </Grid>
        <Field label="N° de série">
          <Input
            name="serialNumber"
            defaultValue={material?.serialNumber ?? ""}
            placeholder="SN123456789"
            className="font-mono text-xs"
          />
        </Field>
        <Field label="État">
          <Select name="state" defaultValue={material?.state ?? "operationnel"}>
            {STATES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
      </Section>

      {/* Localisation */}
      <Section icon={<MapPin className="size-5" />} title="Localisation">
        <Grid>
          <Field label="Site *" required>
            <Select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              required
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Salle *" required>
            <Select
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              required
              disabled={availableRooms.length === 0}
            >
              {availableRooms.length === 0 && (
                <option value="">Aucune salle pour ce site</option>
              )}
              {availableRooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.code ? ` (${r.code})` : ""}
                </option>
              ))}
            </Select>
          </Field>
        </Grid>
        <Grid>
          <Field label="Service">
            <Input
              name="service"
              defaultValue={material?.service ?? ""}
              placeholder="Médical, Administration…"
            />
          </Field>
          <Field label="Affecté à">
            <Input
              name="assignedTo"
              defaultValue={material?.assignedTo ?? ""}
              placeholder="Nom de la personne"
            />
          </Field>
        </Grid>
        <Field label="Propriétaire">
          <Input
            name="owner"
            defaultValue={material?.owner ?? ""}
            placeholder="Alfeo Corassori, ONG…"
          />
        </Field>
      </Section>

      {/* Achat */}
      <Section icon={<Banknote className="size-5" />} title="Achat & finance">
        <Grid>
          <Field label="Date d'achat">
            <Input
              name="purchaseDate"
              type="date"
              defaultValue={material?.purchaseDate?.slice(0, 10) ?? ""}
            />
          </Field>
          <Field label="Prix d'achat (EUR)">
            <Input
              name="purchasePrice"
              type="number"
              step="0.01"
              defaultValue={material?.purchasePrice?.toString() ?? ""}
              placeholder="0"
            />
          </Field>
        </Grid>
        <Field label="Amortissement">
          <Input
            name="amortization"
            defaultValue={material?.amortization ?? ""}
            placeholder="Ex: 3 ans · en cours"
          />
        </Field>
      </Section>

      {/* Caractéristiques */}
      <Section icon={<Cpu className="size-5" />} title="Caractéristiques techniques">
        <Grid>
          <Field label="Système d'exploitation">
            <Input name="os" defaultValue={material?.os ?? ""} placeholder="Windows 10, macOS Sonoma…" />
          </Field>
          <Field label="Processeur">
            <Input name="cpu" defaultValue={material?.cpu ?? ""} placeholder="Intel i5, AMD Ryzen 5…" />
          </Field>
        </Grid>
        <Grid>
          <Field label="Mémoire RAM">
            <Input name="ram" defaultValue={material?.ram ?? ""} placeholder="8 Go, 16 Go…" />
          </Field>
          <Field label="Stockage">
            <Input name="storage" defaultValue={material?.storage ?? ""} placeholder="256 Go SSD…" />
          </Field>
        </Grid>
      </Section>

      {/* Réseau */}
      <Section icon={<Wifi className="size-5" />} title="Réseau">
        <Grid>
          <Field label="Adresse IP">
            <Input
              name="ipAddress"
              defaultValue={material?.ipAddress ?? ""}
              placeholder="192.168.8.x"
              className="font-mono text-xs"
            />
          </Field>
          <Field label="Adresse MAC">
            <Input
              name="macAddress"
              defaultValue={material?.macAddress ?? ""}
              placeholder="AA:BB:CC:DD:EE:FF"
              className="font-mono text-xs"
            />
          </Field>
        </Grid>
        <Grid>
          <Field label="Accès internet">
            <Select
              name="internetAccess"
              defaultValue={
                material?.internetAccess === undefined
                  ? ""
                  : material.internetAccess
                    ? "true"
                    : "false"
              }
            >
              <option value="">— non spécifié —</option>
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </Select>
          </Field>
          <Field label="Lié à la BDD">
            <Select
              name="linkedToBDD"
              defaultValue={
                material?.linkedToBDD === undefined
                  ? ""
                  : material.linkedToBDD
                    ? "true"
                    : "false"
              }
            >
              <option value="">— non spécifié —</option>
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </Select>
          </Field>
        </Grid>
      </Section>

      {/* Notes */}
      <Section icon={<FileText className="size-5" />} title="Remarques">
        <Field label="Notes internes">
          <textarea
            name="notes"
            defaultValue={material?.notes ?? ""}
            rows={4}
            placeholder="Toute information utile : condition physique, historique, instructions particulières…"
            className={cn(
              "w-full rounded-xl glass border px-3.5 py-2.5 text-sm",
              "focus:outline-none focus:ring-2 focus:ring-primary/40",
              "placeholder:text-muted-foreground/60 resize-y",
            )}
          />
        </Field>
      </Section>

      {error && (
        <div className="rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary flex items-start gap-2">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2 justify-end sticky bottom-4 z-10">
        <Link href={backHref}>
          <GlassButton type="button" variant="glass" size="md">
            Annuler
          </GlassButton>
        </Link>
        <GlassButton type="submit" variant="brand" size="md" disabled={loading}>
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          {loading
            ? "Enregistrement…"
            : mode === "create"
              ? "Créer le matériel"
              : "Enregistrer les modifications"}
        </GlassButton>
      </div>
    </form>
  );
}

/* ============================================================
   UI primitives
   ============================================================ */

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="inline-flex size-9 items-center justify-center rounded-xl bg-primary/12 text-primary">
          {icon}
        </div>
        <h3 className="font-display text-lg font-semibold">{title}</h3>
      </div>
      <div className="space-y-4">{children}</div>
    </GlassCard>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
        {label}
        {required && <span className="text-primary ml-1">*</span>}
      </span>
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      type={props.type ?? "text"}
      className={cn(
        "w-full rounded-xl glass border px-3.5 h-10 text-sm",
        "focus:outline-none focus:ring-2 focus:ring-primary/40",
        "placeholder:text-muted-foreground/60",
        props.className,
      )}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "w-full rounded-xl glass border px-3 h-10 text-sm",
        "focus:outline-none focus:ring-2 focus:ring-primary/40",
        "disabled:opacity-50",
        props.className,
      )}
    >
      {props.children}
    </select>
  );
}
