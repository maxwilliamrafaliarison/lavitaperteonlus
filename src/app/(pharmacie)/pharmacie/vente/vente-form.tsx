"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Loader2,
  ShoppingCart,
  CheckCircle2,
  Receipt,
  FileText,
  Pencil,
  Lock,
  LockOpen,
  Printer,
} from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass/glass-card";
import { GlassButton } from "@/components/glass/glass-button";
import { getT, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { estGalenique, type ProduitAvecStock, type ModeVente, type EntitePec } from "@/lib/pharmacie/types";
import { BadgeGalenique } from "@/components/pharmacie/badge-galenique";
import type { CaisseSession } from "@/lib/pharmacie/caisse";
import {
  estFractionnable,
  prixPour,
  versUnitesBase,
  formaterQuantite,
} from "@/lib/pharmacie/fractionnement";

import { creerVenteAction } from "./actions";
import { ouvrirCaisseAction, cloreCaisseAction } from "./actions-caisse";

/* ============================================================
   ÉCRAN DE VENTE — poste de travail type officine (POS)
   ============================================================

   Deux colonnes : le CATALOGUE à gauche, permanent — tous les produits
   actifs, y compris épuisés, car la dispensatrice doit pouvoir répondre
   « le produit existe mais il manque » sans quitter l'écran — et le PANIER
   à droite, avec l'encaissement.

   Piloté au clavier : la recherche filtre en tapant, ↑↓ déplacent la
   sélection, Entrée ajoute (à la boîte), Échap vide la recherche. La souris
   reste possible partout ; le clavier est simplement plus rapide au
   comptoir, une cliente en face.

   La caisse encadre le tout : pas d'encaissement sans session ouverte
   (fonds initial compté), clôture par comptage À L'AVEUGLE — l'écart ne
   s'affiche qu'après la saisie, sinon le comptage « retombe juste ».
   ============================================================ */

interface LignePanier {
  produit: ProduitAvecStock;
  /** Quantité dans l'unité du mode : des boîtes, ou des comprimés. */
  quantite: number;
  mode: ModeVente;
}

/** Deux lignes du même produit dans deux modes différents sont distinctes. */
const cle = (l: LignePanier) => `${l.produit.id}|${l.mode}`;

function fmtAr(n: number): string {
  return (
    new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) +
    " Ar"
  );
}

/** « VTE-… » unique, engendré par le navigateur à l'ouverture du panier. */
function nouvelIdPanier(): string {
  const alea =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()
      : Math.random().toString(36).slice(2, 14).toUpperCase();
  return `VTE-${Date.now().toString(36).toUpperCase()}-${alea}`;
}

const JOUR_MS = 86_400_000;

export function VenteForm({
  produits,
  entites,
  lang,
  stockParCompartiment,
  peremptions,
  caisse,
  caisseDisponible,
}: {
  produits: ProduitAvecStock[];
  entites: EntitePec[];
  lang: Lang;
  /**
   * Stock ventilé gros/détail par produit, lots périmés exclus — fourni par
   * la page. Le total « stockBase » ne suffit pas : une vente À LA BOÎTE
   * n'est servie que depuis le GROS, si bien qu'un produit à 1 boîte fermée
   * et 10 unités ouvertes affichait « 2 boîtes disponibles » puis se faisait
   * refuser à l'encaissement, cliente devant le comptoir.
   */
  stockParCompartiment?: Record<string, { gros: number; detail: number }>;
  /** Péremption la plus proche (lots non périmés), par produit. */
  peremptions?: Record<string, string>;
  /** Session de caisse ouverte, ou null (caisse fermée). */
  caisse: CaisseSession | null;
  /** Faux tant que la migration caisse n'est pas passée : l'écran vit sans. */
  caisseDisponible: boolean;
}) {
  const router = useRouter();
  const t = React.useMemo(() => getT(lang), [lang]);
  const [query, setQuery] = React.useState("");
  const [sel, setSel] = React.useState(0);
  const [panier, setPanier] = React.useState<LignePanier[]>([]);
  const [clientNom, setClientNom] = React.useState("");
  const [typeVente, setTypeVente] = React.useState<"cash" | "pec">("cash");
  const [pecPayeur, setPecPayeur] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [proforma, setProforma] = React.useState(false);
  /* Devis édité pour LE PANIER COURANT. Si le patient achète dans la
     foulée, la vente le mentionne et le devis compte comme transformé.
     Effacé dès que le panier change : le devis ne décrirait plus la
     même chose, et rattacher la vente fausserait la mesure. */
  const [devisEnCours, setDevisEnCours] = React.useState<string | null>(null);
  /**
   * Identifiant du panier, engendré une fois et conservé tant que la vente
   * n'est pas encaissée : réessayer après une coupure renvoie le MÊME
   * identifiant, que le serveur reconnaît comme un renvoi — la recette n'est
   * jamais comptée deux fois.
   */
  const [idPanier, setIdPanier] = React.useState(() => nouvelIdPanier());
  const [done, setDone] = React.useState<{ venteId: string; total: number } | null>(null);
  const [recu, setRecu] = React.useState<number>(0);
  const listeRef = React.useRef<HTMLUListElement>(null);

  const estPec = typeVente === "pec";
  const caisseOuverte = !caisseDisponible || caisse !== null;

  /* Le catalogue montre TOUT le rayon actif, épuisés compris — grisés, avec
     la raison. Les masquer laisserait la dispensatrice répondre « inconnu »
     quand la vérité est « épuisé » — deux réponses différentes au comptoir. */
  const actifs = React.useMemo(
    () =>
      produits
        .filter((p) => p.statut === "actif")
        .sort((a, b) => a.designation.localeCompare(b.designation, "fr")),
    [produits],
  );

  const filtres = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actifs;
    return actifs.filter(
      (p) =>
        p.designation.toLowerCase().includes(q) ||
        p.dci.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q),
    );
  }, [query, actifs]);

  /* Rendu plafonné : au-delà, un bandeau invite à affiner. Un rayon de
     quelques centaines de lignes se rend sans peine ; on garde une borne
     pour que l'écran reste fluide si le catalogue décuple. */
  const PLAFOND = 150;
  const visibles = filtres.slice(0, PLAFOND);

  React.useEffect(() => {
    setSel(0);
  }, [query]);

  /* Le devis cesse de valoir dès que le panier change.
     Rattacher une vente à un devis qui ne décrit plus la même chose
     fausserait la mesure : on compterait comme « transformé » un devis
     que le patient n'a pas suivi. La signature du panier — produits,
     modes, quantités — sert de témoin. */
  const signaturePanier = panier.map((l) => `${cle(l)}x${l.quantite}`).join("|");
  const signatureAuDevis = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (signatureAuDevis.current !== null && signatureAuDevis.current !== signaturePanier) {
      setDevisEnCours(null);
      signatureAuDevis.current = null;
    }
  }, [signaturePanier]);

  const total = panier.reduce(
    (s, l) => s + l.quantite * prixPour(l.produit, l.mode),
    0,
  );

  function compartDe(p: ProduitAvecStock) {
    return stockParCompartiment?.[p.id] ?? null;
  }

  /** Épuisé = plus rien à vendre, compartiments confondus (périmés exclus). */
  function estEpuise(p: ProduitAvecStock): boolean {
    const c = compartDe(p);
    if (c) return c.gros + c.detail <= 0;
    return p.stockBase <= 0;
  }

  /**
   * Quantité maximale d'une ligne, en tenant compte de ce que les AUTRES
   * lignes du même produit consomment déjà. Sans ça, 2 boîtes + N comprimés
   * du même produit pourraient dépasser le stock à eux deux — le serveur
   * refuserait, mais après que la dispensatrice a composé tout son panier.
   */
  function maxPour(ligne: LignePanier, courant: LignePanier[]): number {
    const dejaPris = courant
      .filter((l) => l.produit.id === ligne.produit.id && l.mode !== ligne.mode)
      .reduce((s, l) => s + versUnitesBase(l.produit, l.quantite, l.mode), 0);
    const parUnite = versUnitesBase(ligne.produit, 1, ligne.mode);
    const compart = compartDe(ligne.produit);
    if (!compart) {
      // Repli (ventilation indisponible) : ancien calcul sur le total.
      return Math.max(0, Math.floor((ligne.produit.stockBase - dejaPris) / parUnite));
    }
    // À la boîte : seules les boîtes FERMÉES comptent. Au détail : les unités
    // déjà ouvertes, plus celles qu'on peut encore ouvrir.
    const base =
      ligne.mode === "boite" ? compart.gros : compart.detail + compart.gros;
    return Math.max(0, Math.floor((base - dejaPris) / parUnite));
  }

  /** Reste ajoutable pour un produit/mode, panier déduit — pilote le grisage. */
  function resteAjoutable(p: ProduitAvecStock, mode: ModeVente): number {
    const existante = panier.find((l) => l.produit.id === p.id && l.mode === mode);
    const fictive: LignePanier = existante ?? { produit: p, quantite: 0, mode };
    return maxPour(fictive, panier) - (existante?.quantite ?? 0);
  }

  function ajouter(p: ProduitAvecStock, mode: ModeVente) {
    setPanier((prev) => {
      const existante = prev.find((l) => l.produit.id === p.id && l.mode === mode);
      const cible: LignePanier = existante ?? { produit: p, quantite: 0, mode };
      if (cible.quantite + 1 > maxPour(cible, prev)) {
        // Distinguer « plus de stock » de « plus de boîte fermée » : le
        // second se résout en vendant à l'unité, pas en renonçant.
        const compart = compartDe(p);
        const resteDuDetail = mode === "boite" && (compart?.detail ?? 0) > 0;
        toast.warning(
          resteDuDetail
            ? t("pharmacie.vente_plus_de_boite", { p: p.designation })
            : t("pharmacie.vente_stock_max", { p: p.designation }),
        );
        return prev;
      }
      return existante
        ? prev.map((l) => (cle(l) === cle(cible) ? { ...l, quantite: l.quantite + 1 } : l))
        : [...prev, { produit: p, quantite: 1, mode }];
    });
  }

  /** Ajout au clavier : Entrée sur la ligne sélectionnée. */
  function ajouterSelection() {
    const p = visibles[sel];
    if (!p || estEpuise(p)) return;
    const sansPrix = !p.prix_vente || p.prix_vente <= 0;
    if (sansPrix) return;
    const compart = compartDe(p);
    const auDetail = estFractionnable(p) && p.prix_vente_detail > 0;
    // Plus de boîte fermée mais du détail : Entrée bascule d'elle-même sur
    // l'unité — c'est ce que la dispensatrice ferait à la souris.
    const mode: ModeVente =
      compart && compart.gros <= 0 && auDetail ? "detail" : "boite";
    ajouter(p, mode);
  }

  function auClavier(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, visibles.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      ajouterSelection();
    } else if (e.key === "Escape") {
      setQuery("");
    }
  }

  React.useEffect(() => {
    listeRef.current
      ?.querySelector(`[data-idx="${sel}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  function changerQuantite(k: string, delta: number) {
    setPanier((prev) =>
      prev
        .map((l) => {
          if (cle(l) !== k) return l;
          return { ...l, quantite: Math.min(l.quantite + delta, maxPour(l, prev)) };
        })
        .filter((l) => l.quantite > 0),
    );
  }

  /**
   * Édite un devis à partir du panier courant.
   *
   * N'appelle PAS l'action de vente : aucun chemin de code ne doit pouvoir
   * transformer une estimation en encaissement. Le serveur rend un PDF sans
   * rien écrire — ni vente, ni mouvement de stock, ni réservation.
   *
   * Le fichier arrive en binaire ; on l'ouvre par une URL d'objet plutôt que
   * par un lien, car la requête est un POST porteur du panier.
   */
  async function editerProforma(format: "ticket" | "a4" = "ticket") {
    setProforma(true);
    try {
      const r = await fetch("/api/pharmacie/proforma", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          client: clientNom.trim(),
          lignes: panier.map((l) => ({
            designation: l.produit.designation,
            detail: [l.produit.dci, l.produit.dosage].filter(Boolean).join(" · "),
            quantite: l.quantite,
            unite:
              l.mode === "detail"
                ? l.produit.unite_detail || t("pharmacie.vente_mode_detail")
                : t("pharmacie.vente_mode_boite"),
            prixUnitaire: prixPour(l.produit, l.mode),
            total: l.quantite * prixPour(l.produit, l.mode),
          })),
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        toast.error(t("common.failed"), { description: d.error ?? String(r.status) });
        return;
      }
      const numero = r.headers.get("X-Proforma-Id");
      if (numero) {
        setDevisEnCours(numero);
        // Mémorise l'état du panier au moment du devis : toute
        // modification ultérieure rompra le rattachement.
        signatureAuDevis.current = signaturePanier;
      }
      const url = URL.createObjectURL(await r.blob());
      window.open(url, "_blank", "noopener");
      // Libéré après ouverture : l'onglet a déjà chargé le document.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.error(t("common.failed"), { description: String(e).slice(0, 120) });
    } finally {
      setProforma(false);
    }
  }

  async function encaisser() {
    if (panier.length === 0) return;
    if (!caisseOuverte) {
      toast.warning(t("pharmacie.caisse_requise"));
      return;
    }
    if (estPec && pecPayeur.trim() === "") {
      toast.warning(t("pharmacie.vente_error_pec_payeur"));
      return;
    }
    setLoading(true);
    try {
      const result = await creerVenteAction({
        venteId: idPanier,
        // Rattache la vente au devis dont elle découle, s'il y en a un.
        proformaId: devisEnCours ?? undefined,
        clientNom,
        typeVente,
        pecPayeur,
        lignes: panier.map((l) => ({
          produitId: l.produit.id,
          quantite: l.quantite,
          mode: l.mode,
          // Indicatif : le serveur relit le catalogue de toute façon.
          prixUnitaire: prixPour(l.produit, l.mode),
        })),
      });
      if (result.ok) {
        setDone({ venteId: result.venteId, total: result.total });
        setRecu(result.total);
        toast.success(t("pharmacie.vente_success"));
        router.refresh();
      } else {
        toast.error(t("common.failed"), { description: result.error });
      }
    } catch {
      // Jamais le message technique brut au comptoir : la dispensatrice a
      // besoin d'un geste, pas d'une trace d'exception.
      toast.error(t("pharmacie.vente_reseau_titre"), {
        description: t("pharmacie.vente_reseau_aide"),
        duration: 12000,
      });
    } finally {
      setLoading(false);
    }
  }

  // -------- Écran de confirmation / ticket --------
  if (done) {
    return (
      <GlassCard className="mx-auto max-w-md p-8 text-center print:shadow-none">
        <CheckCircle2
          className="mx-auto size-12 text-[var(--success)]"
          aria-hidden="true"
        />
        <h2 className="mt-4 font-display text-2xl font-semibold">
          {t("pharmacie.vente_done_title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground font-mono">{done.venteId}</p>

        <div className="mt-6 rounded-2xl glass border p-4 text-left text-sm print:border-black">
          {estPec ? (
            <p className="mb-2 rounded-lg bg-primary/10 px-2.5 py-1.5 text-primary">
              {t("pharmacie.vente_type_pec")} :{" "}
              <span className="font-medium">{pecPayeur || "—"}</span>
            </p>
          ) : (
            clientNom && (
              <p className="mb-2 text-muted-foreground">
                {t("pharmacie.vente_client")} :{" "}
                <span className="text-foreground">{clientNom}</span>
              </p>
            )
          )}
          <ul role="list" className="divide-y divide-glass-border">
            {panier.map((l) => (
              <li key={cle(l)} className="flex justify-between py-1.5">
                <span>
                  {l.produit.designation}{" "}
                  {/* « × 3 » sans l'unité, c'est un litige au comptoir :
                      3 boîtes ou 3 comprimés ? */}
                  <span className="text-muted-foreground">
                    × {l.quantite}
                    {estFractionnable(l.produit) &&
                      ` ${
                        l.mode === "detail"
                          ? l.produit.unite_detail || t("pharmacie.vente_mode_detail")
                          : "bte"
                      }`}
                  </span>
                </span>
                <span className="font-mono tabular-nums">
                  {fmtAr(l.quantite * prixPour(l.produit, l.mode))}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex justify-between border-t border-glass-border pt-3 font-semibold">
            <span>{estPec ? t("pharmacie.vente_pec_valeur") : t("pharmacie.vente_total")}</span>
            <span className={cn("font-mono tabular-nums", estPec && "line-through text-muted-foreground")}>
              {fmtAr(done.total)}
            </span>
          </p>
          {estPec && (
            <p className="mt-1 flex justify-between font-semibold">
              <span>{t("pharmacie.vente_a_payer")}</span>
              <span className="font-mono tabular-nums text-[var(--success)]">
                {fmtAr(0)}
              </span>
            </p>
          )}
        </div>

        {/* Monnaie à rendre (espèces) — sans objet en prise en charge. */}
        {!estPec && (
        <div className="mt-4 rounded-2xl glass border p-4 text-left text-sm print:hidden">
          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor="montant-recu"
              className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
            >
              {t("pharmacie.vente_recu")}
            </label>
            <div className="inline-flex items-center gap-1">
              <QtyBtn onClick={() => setRecu((r) => Math.max(done.total, r - 500))} label="-500">
                <Minus className="size-3" aria-hidden="true" />
              </QtyBtn>
              <input
                id="montant-recu"
                type="number"
                inputMode="numeric"
                min={done.total}
                step={500}
                value={recu}
                onChange={(e) => setRecu(Math.max(0, Number(e.target.value) || 0))}
                className="w-28 rounded-xl glass border px-2 h-9 text-right font-mono text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <QtyBtn onClick={() => setRecu((r) => r + 500)} label="+500">
                <Plus className="size-3" aria-hidden="true" />
              </QtyBtn>
            </div>
          </div>
          <p className="mt-3 flex items-center justify-between border-t border-glass-border pt-3">
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {t("pharmacie.vente_rendu")}
            </span>
            <span
              className={cn(
                "font-mono text-base font-semibold tabular-nums",
                recu >= done.total && "text-[var(--success)]",
              )}
            >
              {fmtAr(Math.max(0, recu - done.total))}
            </span>
          </p>
        </div>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-2 print:hidden">
          <GlassButton
            type="button"
            variant="glass"
            size="sm"
            onClick={() =>
              window.open(
                // Les espèces reçues n'existent qu'ici (jamais stockées) :
                // on les passe au ticket pour afficher la monnaie rendue.
                estPec
                  ? `/api/pharmacie/ventes/${done.venteId}/ticket`
                  : `/api/pharmacie/ventes/${done.venteId}/ticket?recu=${Math.max(recu, done.total)}`,
                "_blank",
                "noopener",
              )
            }
          >
            <Receipt className="size-3.5" aria-hidden="true" />
            {t("pharmacie.vente_ticket")}
          </GlassButton>
          <GlassButton
            type="button"
            variant="glass"
            size="sm"
            onClick={() =>
              window.open(
                `/api/pharmacie/ventes/${done.venteId}/facture`,
                "_blank",
                "noopener",
              )
            }
          >
            <FileText className="size-3.5" aria-hidden="true" />
            {t("pharmacie.vente_facture")}
          </GlassButton>
          <GlassButton
            type="button"
            variant="brand"
            size="sm"
            onClick={() => {
              setPanier([]);
              setClientNom("");
              setTypeVente("cash");
              setPecPayeur("");
              setDone(null);
              setRecu(0);
              // Nouveau panier = nouvel identifiant : sans cela, la vente
              // suivante serait prise pour un renvoi de la précédente et
              // silencieusement ignorée par la garde d'idempotence.
              setIdPanier(nouvelIdPanier());
            }}
          >
            {t("pharmacie.vente_new")}
          </GlassButton>
        </div>
      </GlassCard>
    );
  }

  // -------- Écran de vente (POS) --------
  return (
    <div className="space-y-4">
      {caisseDisponible && (
        <BandeauCaisse caisse={caisse} t={t} onChange={() => router.refresh()} />
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Catalogue permanent */}
        <div className="lg:col-span-3 space-y-3">
          <div className="relative">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={auClavier}
              placeholder={t("pharmacie.vente_search_placeholder")}
              aria-label={t("pharmacie.vente_search_placeholder")}
              className="w-full h-12 rounded-2xl glass border pl-11 pr-4 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/30"
              autoFocus
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 hidden md:block text-[10px] text-muted-foreground">
              {t("pharmacie.vente_raccourcis")}
            </span>
          </div>

          <GlassCard className="p-2">
            {/* En-tête de colonnes : le rayon se lit comme un registre. */}
            <div className="hidden md:grid grid-cols-[1fr_7rem_6rem_9.5rem] gap-2 px-3 pb-1.5 pt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <span>{t("pharmacie.vente_col_produit")}</span>
              <span className="text-right">{t("pharmacie.vente_col_stock")}</span>
              <span className="text-right">{t("pharmacie.vente_col_peremption")}</span>
              <span className="text-right">{t("pharmacie.vente_col_prix")}</span>
            </div>
            <ul
              role="listbox"
              aria-label={t("pharmacie.vente_col_produit")}
              ref={listeRef}
              className="max-h-[60vh] overflow-y-auto divide-y divide-glass-border"
            >
              {visibles.map((p, idx) => (
                <LigneCatalogue
                  key={p.id}
                  produit={p}
                  idx={idx}
                  selectionne={idx === sel}
                  epuise={estEpuise(p)}
                  compart={compartDe(p)}
                  peremption={peremptions?.[p.id] ?? ""}
                  resteBoite={resteAjoutable(p, "boite")}
                  resteDetail={resteAjoutable(p, "detail")}
                  t={t}
                  onAjouter={(mode) => {
                    setSel(idx);
                    ajouter(p, mode);
                  }}
                />
              ))}
              {visibles.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {t("pharmacie.vente_no_result")}
                </li>
              )}
            </ul>
            {filtres.length > PLAFOND && (
              <p className="px-3 py-2 text-center text-[11px] text-muted-foreground border-t border-glass-border">
                {t("pharmacie.vente_affiner", { n: String(filtres.length - PLAFOND) })}
              </p>
            )}
          </GlassCard>
        </div>

        {/* Panier */}
        <div className="lg:col-span-2">
          <GlassCard className="p-5 sticky top-24">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <ShoppingCart className="size-4 text-primary" aria-hidden="true" />
              {t("pharmacie.vente_panier")} ({panier.length})
            </h2>

            {panier.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                {t("pharmacie.vente_panier_vide")}
              </p>
            ) : (
              <ul role="list" className="mt-4 space-y-3">
                {panier.map((l) => {
                  const k = cle(l);
                  return (
                    <li key={k} className="rounded-xl glass border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-tight inline-flex items-center gap-1.5 flex-wrap">
                            {l.produit.designation}
                            {estGalenique(l.produit) && <BadgeGalenique compact />}
                          </p>
                          {/* L'unité doit être lisible : deux lignes du même
                              produit ne se distinguent que par elle. */}
                          {estFractionnable(l.produit) && (
                            <span
                              className={cn(
                                "mt-1 inline-block rounded-full border px-1.5 py-0.5 text-[9px] font-medium",
                                l.mode === "detail"
                                  ? "border-accent/30 bg-accent/10 text-accent"
                                  : "border-glass-border text-muted-foreground",
                              )}
                            >
                              {l.mode === "detail"
                                ? l.produit.unite_detail || t("pharmacie.vente_mode_detail")
                                : t("pharmacie.vente_mode_boite")}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => changerQuantite(k, -l.quantite)}
                          aria-label={t("actions.delete")}
                          className="text-muted-foreground hover:text-primary transition-colors"
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="inline-flex items-center gap-1">
                          <QtyBtn onClick={() => changerQuantite(k, -1)} label="-">
                            <Minus className="size-3" aria-hidden="true" />
                          </QtyBtn>
                          <span className="w-8 text-center font-mono text-sm tabular-nums">
                            {l.quantite}
                          </span>
                          <QtyBtn
                            onClick={() => changerQuantite(k, 1)}
                            disabled={l.quantite >= maxPour(l, panier)}
                            label="+"
                          >
                            <Plus className="size-3" aria-hidden="true" />
                          </QtyBtn>
                        </div>
                        <span className="font-mono text-sm tabular-nums">
                          {fmtAr(l.quantite * prixPour(l.produit, l.mode))}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mt-5 space-y-3 border-t border-glass-border pt-4">
              {/* Type de vente : comptant ou prise en charge (client à 0 Ar). */}
              <div className="grid grid-cols-2 gap-2">
                <TypeBtn
                  actif={!estPec}
                  onClick={() => setTypeVente("cash")}
                  label={t("pharmacie.vente_type_cash")}
                />
                <TypeBtn
                  actif={estPec}
                  onClick={() => setTypeVente("pec")}
                  label={t("pharmacie.vente_type_pec")}
                />
              </div>

              {!estPec ? (
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
                    {t("pharmacie.vente_client")} ({t("common.optional")})
                  </span>
                  <input
                    type="text"
                    value={clientNom}
                    onChange={(e) => setClientNom(e.target.value)}
                    placeholder={t("pharmacie.vente_client_placeholder")}
                    className="w-full rounded-xl glass border px-3.5 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </label>
              ) : (
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
                    {t("pharmacie.vente_pec_payeur")}{" "}
                    <span aria-label={t("a11y.required_indicator")} className="text-primary">*</span>
                  </span>
                  <input
                    type="text"
                    list="pec-entites"
                    value={pecPayeur}
                    onChange={(e) => setPecPayeur(e.target.value)}
                    placeholder={t("pharmacie.vente_pec_placeholder")}
                    className="w-full rounded-xl glass border px-3.5 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <datalist id="pec-entites">
                    {entites.map((e) => (
                      <option key={e.id} value={e.nom} />
                    ))}
                  </datalist>
                </label>
              )}

              <div>
                {estPec ? (
                  <>
                    <p className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>{t("pharmacie.vente_pec_valeur")}</span>
                      <span className="font-mono tabular-nums line-through">{fmtAr(total)}</span>
                    </p>
                    <p className="mt-1 flex items-center justify-between text-lg font-semibold">
                      <span>{t("pharmacie.vente_a_payer")}</span>
                      <span className="font-mono tabular-nums text-[var(--success)]">
                        {fmtAr(0)}
                      </span>
                    </p>
                  </>
                ) : (
                  <p className="flex items-center justify-between text-lg font-semibold">
                    <span>{t("pharmacie.vente_total")}</span>
                    <span className="font-mono tabular-nums">{fmtAr(total)}</span>
                  </p>
                )}
              </div>

              <GlassButton
                type="button"
                variant="brand"
                size="lg"
                className="w-full"
                disabled={panier.length === 0 || loading || !caisseOuverte}
                onClick={encaisser}
              >
                {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {estPec ? t("pharmacie.vente_valider_pec") : t("pharmacie.vente_encaisser")}
              </GlassButton>
              {!caisseOuverte && (
                <p className="text-center text-[11px] text-muted-foreground">
                  {t("pharmacie.caisse_requise")}
                </p>
              )}

              {/* Devis : le patient veut connaître le prix avant de décider.
                  Volontairement en bouton secondaire et SANS condition de
                  caisse ouverte — établir une estimation n'encaisse rien et
                  ne doit pas dépendre de l'état du tiroir. */}
              <div className="flex gap-2">
                <GlassButton
                  type="button"
                  variant="ghost"
                  size="md"
                  className="flex-1"
                  disabled={panier.length === 0 || proforma}
                  onClick={() => editerProforma("ticket")}
                >
                  {proforma ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Receipt className="size-4" aria-hidden="true" />
                  )}
                  {t("pharmacie.vente_proforma")}
                </GlassButton>
                {/* Version A4 : pour un devis qu'on remet formellement, à
                    présenter à un tiers payeur ou à comparer ailleurs. */}
                <GlassButton
                  type="button"
                  variant="ghost"
                  size="md"
                  disabled={panier.length === 0 || proforma}
                  onClick={() => editerProforma("a4")}
                  title={t("pharmacie.vente_proforma_a4")}
                  aria-label={t("pharmacie.vente_proforma_a4")}
                >
                  <FileText className="size-4" aria-hidden="true" />
                  A4
                </GlassButton>
              </div>
              <p className="text-center text-[11px] text-muted-foreground">
                {t("pharmacie.vente_proforma_aide")}
              </p>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Ligne du catalogue
   ============================================================ */
function LigneCatalogue({
  produit: p,
  idx,
  selectionne,
  epuise,
  compart,
  peremption,
  resteBoite,
  resteDetail,
  t,
  onAjouter,
}: {
  produit: ProduitAvecStock;
  idx: number;
  selectionne: boolean;
  epuise: boolean;
  compart: { gros: number; detail: number } | null;
  peremption: string;
  resteBoite: number;
  resteDetail: number;
  t: (k: string, v?: Record<string, string>) => string;
  onAjouter: (mode: ModeVente) => void;
}) {
  const sansPrix = !p.prix_vente || p.prix_vente <= 0;
  const auDetail = estFractionnable(p) && p.prix_vente_detail > 0;
  // Péremption sous 90 jours : ambre — le lot est vendable mais à écouler.
  const perimeBientot =
    peremption !== "" &&
    new Date(peremption).getTime() - Date.now() < 90 * JOUR_MS;

  const infos = (
    <div className="flex-1 min-w-0">
      <p
        className={cn(
          "font-medium text-sm leading-tight inline-flex items-center gap-1.5 max-w-full",
          epuise && "text-muted-foreground",
        )}
      >
        <span className="truncate">{p.designation}</span>
        {estGalenique(p) && <BadgeGalenique compact />}
      </p>
      <p className="text-[11px] text-muted-foreground truncate">
        {p.dci || p.classe || p.id}
        {p.dosage ? ` · ${p.dosage}` : ""}
      </p>
    </div>
  );

  const stock = (
    <span
      className={cn(
        "text-xs font-mono tabular-nums text-right",
        epuise ? "text-primary font-semibold" : "text-muted-foreground",
      )}
    >
      {epuise ? t("pharmacie.vente_stock_zero") : formaterQuantite(p, p.stockBase)}
      {!epuise && compart && auDetail && compart.detail > 0 && (
        <span className="block text-[10px]">
          {t("pharmacie.vente_dont_detail", { n: String(compart.detail) })}
        </span>
      )}
    </span>
  );

  const colPeremption = (
    <span
      className={cn(
        "text-[11px] font-mono tabular-nums text-right",
        perimeBientot ? "text-[var(--warning)]" : "text-muted-foreground",
      )}
    >
      {peremption ? peremption.slice(0, 10) : "—"}
    </span>
  );

  return (
    <li
      data-idx={idx}
      role="option"
      aria-selected={selectionne}
      aria-disabled={epuise || sansPrix}
      className={cn(
        "grid grid-cols-[1fr_auto] md:grid-cols-[1fr_7rem_6rem_9.5rem] items-center gap-2 rounded-xl px-3 py-2",
        "transition-colors",
        /* Curseur clavier en CYAN, jamais en rouge.
           Le rouge est la couleur de l'alerte dans cette application —
           rupture, produit périmé, vente annulée. S'en servir pour marquer
           la ligne sélectionnée faisait lire « ce médicament a un problème »
           là où le code disait seulement « Entrée ajoutera celui-ci ». Au
           comptoir, cette confusion coûte une hésitation à chaque recherche.
           La barre à gauche porte la sélection, le fond reste sobre. */
        selectionne && "bg-accent/10 border-l-[3px] border-accent",
        !selectionne && "border-l-[3px] border-transparent",
        /* Épuisé : la ligne reste LISIBLE (la dispensatrice répond « épuisé »,
           pas « inconnu ») mais rien n'y est cliquable. */
        epuise && "opacity-55",
      )}
    >
      {infos}
      {stock}
      <span className="hidden md:block">{colPeremption}</span>

      <span className="flex justify-end gap-1.5">
        {epuise ? (
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary whitespace-nowrap">
            {t("pharmacie.vente_epuise")}
          </span>
        ) : sansPrix ? (
          // Le produit n'est pas vendable : on mène à la fiche pour saisir le
          // prix, au lieu d'un bouton mort.
          <Link
            href={`/pharmacie/produits/${p.id}`}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--warning)/30] bg-[var(--warning)/12] px-2 py-0.5 text-[10px] font-medium text-[var(--warning)] whitespace-nowrap"
          >
            {t("pharmacie.vente_sans_prix_badge")}
            <Pencil className="size-3" aria-hidden="true" />
            <span className="sr-only">{t("pharmacie.vente_sans_prix_aide")}</span>
          </Link>
        ) : auDetail ? (
          // Deux boutons : la dispensatrice choisit l'unité au moment
          // d'ajouter, pas après — c'est le geste du comptoir.
          <>
            <BoutonMode
              onClick={() => onAjouter("boite")}
              libelle={t("pharmacie.vente_mode_boite")}
              prix={fmtAr(p.prix_vente)}
              epuiseMode={resteBoite <= 0}
            />
            <BoutonMode
              onClick={() => onAjouter("detail")}
              libelle={p.unite_detail || t("pharmacie.vente_mode_detail")}
              prix={fmtAr(p.prix_vente_detail)}
              accent
              epuiseMode={resteDetail <= 0}
            />
          </>
        ) : (
          <button
            type="button"
            onClick={() => onAjouter("boite")}
            disabled={resteBoite <= 0}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl border border-glass-border glass px-2.5 py-1.5",
              "hover:bg-white/8 transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            )}
          >
            <span className="font-mono text-[11px] tabular-nums">{fmtAr(p.prix_vente)}</span>
            <Plus className="size-3.5 text-primary" aria-hidden="true" />
          </button>
        )}
      </span>
    </li>
  );
}

/* ============================================================
   Bandeau de caisse — ouverture et clôture comptées
   ============================================================ */
function BandeauCaisse({
  caisse,
  t,
  onChange,
}: {
  caisse: CaisseSession | null;
  t: (k: string, v?: Record<string, string>) => string;
  onChange: () => void;
}) {
  const [fonds, setFonds] = React.useState<number>(0);
  const [enCloture, setEnCloture] = React.useState(false);
  const [comptees, setComptees] = React.useState<number>(0);
  const [note, setNote] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [bilan, setBilan] = React.useState<{ theorique: number; comptees: number; ecart: number; sessionId: string } | null>(null);

  async function ouvrir() {
    setLoading(true);
    try {
      const r = await ouvrirCaisseAction({ fondsInitial: fonds });
      if (r.ok) {
        toast.success(t("pharmacie.caisse_ouverte_succes"));
        onChange();
      } else {
        toast.error(t("common.failed"), { description: r.error });
      }
    } finally {
      setLoading(false);
    }
  }

  async function clore() {
    setLoading(true);
    try {
      const r = await cloreCaisseAction({ especesComptees: comptees, note });
      if (r.ok && "ecart" in r) {
        setBilan({ theorique: r.theorique, comptees: r.comptees, ecart: r.ecart, sessionId: r.sessionId });
        onChange();
      } else if (!r.ok) {
        toast.error(t("common.failed"), { description: r.error });
      }
    } finally {
      setLoading(false);
    }
  }

  // Bilan de clôture : l'écart ne s'affiche qu'ICI, après le comptage.
  if (bilan) {
    const juste = bilan.ecart === 0;
    return (
      <GlassCard className="p-4">
        <p className="font-display font-semibold">{t("pharmacie.caisse_cloturee")}</p>
        <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
          <span>
            <span className="block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{t("pharmacie.caisse_theorique")}</span>
            <span className="font-mono tabular-nums">{fmtAr(bilan.theorique)}</span>
          </span>
          <span>
            <span className="block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{t("pharmacie.caisse_comptees")}</span>
            <span className="font-mono tabular-nums">{fmtAr(bilan.comptees)}</span>
          </span>
          <span>
            <span className="block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{t("pharmacie.caisse_ecart")}</span>
            <span
              className={cn(
                "font-mono tabular-nums font-semibold",
                juste ? "text-[var(--success)]" : "text-primary",
              )}
            >
              {bilan.ecart > 0 ? "+" : ""}
              {fmtAr(bilan.ecart)}
            </span>
          </span>
        </div>

        {/* La pièce s'imprime et se range : un état de caisse vaut
            justificatif comptable, il ne vit pas qu'à l'écran. Le même
            document vient de partir à l'administration. */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-glass-border pt-3">
          <GlassButton
            type="button"
            variant="brand"
            size="sm"
            onClick={() =>
              window.open(`/api/pharmacie/caisse/${bilan.sessionId}`, "_blank", "noopener")
            }
          >
            <Printer className="size-3.5" aria-hidden="true" />
            {t("pharmacie.caisse_imprimer")}
          </GlassButton>
          <p className="text-[11px] text-muted-foreground">{t("pharmacie.caisse_envoye")}</p>
        </div>
      </GlassCard>
    );
  }

  // Caisse fermée : on l'ouvre avec un fonds compté.
  if (!caisse) {
    return (
      <GlassCard className="p-4 border-[var(--warning)/35]">
        <div className="flex flex-wrap items-end gap-3">
          <p className="flex items-center gap-2 font-medium text-sm mr-auto">
            <Lock className="size-4 text-[var(--warning)]" aria-hidden="true" />
            {t("pharmacie.caisse_fermee_titre")}
          </p>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1">
              {t("pharmacie.caisse_fonds")}
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              value={fonds}
              onChange={(e) => setFonds(Math.max(0, Number(e.target.value) || 0))}
              className="w-36 rounded-xl glass border px-3 h-10 text-right font-mono text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <GlassButton type="button" variant="brand" size="sm" disabled={loading} onClick={ouvrir}>
            {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <LockOpen className="size-3.5" aria-hidden="true" />}
            {t("pharmacie.caisse_ouvrir")}
          </GlassButton>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">{t("pharmacie.caisse_fermee_aide")}</p>
      </GlassCard>
    );
  }

  // Caisse ouverte : rappel discret + clôture (comptage à l'aveugle).
  return (
    <GlassCard className="p-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto flex items-center gap-2 text-sm text-muted-foreground">
          <LockOpen className="size-4 text-[var(--success)]" aria-hidden="true" />
          {t("pharmacie.caisse_ouverte_par", {
            p: caisse.ouverte_par.split("@")[0],
            h: new Date(caisse.ouverte_le).toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Indian/Antananarivo",
            }),
          })}
          <span className="font-mono tabular-nums">
            · {t("pharmacie.caisse_fonds_court")} {fmtAr(caisse.fonds_initial)}
          </span>
        </p>
        {!enCloture && (
          <GlassButton type="button" variant="glass" size="sm" onClick={() => setEnCloture(true)}>
            <Lock className="size-3.5" aria-hidden="true" />
            {t("pharmacie.caisse_clore")}
          </GlassButton>
        )}
      </div>

      {enCloture && (
        <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-glass-border pt-3">
          {/* Comptage à l'aveugle : ni total du jour ni théorique à l'écran. */}
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1">
              {t("pharmacie.caisse_comptees")}
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={500}
              value={comptees}
              onChange={(e) => setComptees(Math.max(0, Number(e.target.value) || 0))}
              className="w-40 rounded-xl glass border px-3 h-10 text-right font-mono text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
              autoFocus
            />
          </label>
          <label className="block flex-1 min-w-40">
            <span className="block text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1">
              {t("pharmacie.caisse_note")}
            </span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-xl glass border px-3 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <GlassButton type="button" variant="brand" size="sm" disabled={loading} onClick={clore}>
            {loading && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
            {t("pharmacie.caisse_confirmer_cloture")}
          </GlassButton>
          <GlassButton type="button" variant="glass" size="sm" onClick={() => setEnCloture(false)}>
            {t("common.cancel")}
          </GlassButton>
        </div>
      )}
    </GlassCard>
  );
}

/** Bascule Comptant / Prise en charge, au-dessus du bouton d'encaissement. */
function TypeBtn({
  actif,
  onClick,
  label,
}: {
  actif: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={cn(
        "rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        actif
          ? "border-primary/40 bg-primary/12 text-primary"
          : "border-glass-border text-muted-foreground hover:bg-white/5",
      )}
    >
      {label}
    </button>
  );
}

/**
 * Bouton d'ajout au panier dans une unité donnée. Le prix figure DANS le
 * bouton : au comptoir, on choisit « la boîte à 8 126 » ou « le comprimé à
 * 300 » — pas un mode abstrait qu'il faudrait traduire mentalement.
 * (Geste repris de l'app d'Eugenio.)
 */
function BoutonMode({
  onClick,
  libelle,
  prix,
  accent,
  epuiseMode,
}: {
  onClick: () => void;
  libelle: string;
  prix: string;
  accent?: boolean;
  /** Ce mode précis n'a plus de stock (panier déduit) : bouton inerte. */
  epuiseMode?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={epuiseMode}
      className={cn(
        "flex flex-col items-center rounded-xl border px-2.5 py-1.5 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        accent
          ? "border-accent/30 bg-accent/10 hover:bg-accent/20"
          : "border-glass-border glass hover:bg-white/8",
      )}
    >
      <span className={cn("text-[10px] font-medium leading-none", accent && "text-accent")}>
        {libelle}
      </span>
      <span className="mt-0.5 font-mono text-[11px] tabular-nums leading-none">{prix}</span>
    </button>
  );
}

function QtyBtn({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-lg glass border",
        "hover:bg-white/8 transition-colors disabled:opacity-40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
      )}
    >
      {children}
    </button>
  );
}
