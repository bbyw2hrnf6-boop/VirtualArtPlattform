import { useEffect, type RefObject } from "react";

export function useDialogFocus(
  dialog: RefObject<HTMLElement | null>,
  onClose: () => void,
  returnFocus?: RefObject<HTMLElement | null>,
  enabled = true,
  initialFocus?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!enabled) return;
    const previous = document.activeElement as HTMLElement | null;
    const returnElement = returnFocus?.current;
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        element?.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    (initialFocus?.current ?? focusable()[0] ?? element)?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    addEventListener("keydown", onKeyDown);
    return () => {
      removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      (returnElement ?? previous)?.focus?.({ preventScroll: true });
    };
  }, [dialog, enabled, initialFocus, onClose, returnFocus]);
}
