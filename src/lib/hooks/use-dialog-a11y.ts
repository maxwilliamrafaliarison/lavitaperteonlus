"use client";

import * as React from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Hook d'accessibilité pour les modales custom (RGAA 7.1, 7.3) :
 *   - Place le focus sur le 1er élément focusable à l'ouverture
 *   - Piège le focus dans le modal (Tab / Shift+Tab cyclent à l'intérieur)
 *   - Ferme le modal sur Escape
 *   - Restaure le focus sur l'élément déclencheur à la fermeture
 *
 * `active` indique si le modal est ouvert (les listeners ne sont posés que
 * dans ce cas). `disabled` désactive Escape pendant une action critique
 * (ex : pendant un loading).
 *
 * Utilisation :
 *   const ref = useRef<HTMLDivElement>(null);
 *   useDialogA11y(ref, open, onClose, { disabled: loading });
 *   return open ? <div ref={ref} role="dialog" aria-modal="true">...</div> : null;
 */
export function useDialogA11y(
  containerRef: React.RefObject<HTMLElement | null>,
  active: boolean,
  onClose: () => void,
  options?: { disabled?: boolean },
) {
  const disabled = options?.disabled;
  const previousActive = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!active) return;
    previousActive.current = document.activeElement as HTMLElement;
    const items =
      containerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    items?.[0]?.focus();

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !disabled) {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const list =
        containerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!list || list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      previousActive.current?.focus?.();
    };
  }, [containerRef, active, onClose, disabled]);
}
