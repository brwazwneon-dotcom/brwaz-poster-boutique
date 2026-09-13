import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ConfirmOptions = {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button — use for deletes and other irreversible actions. */
  destructive?: boolean;
};

type ConfirmFn = (input: string | ConfirmOptions) => Promise<boolean>;

const ConfirmDialogContext = createContext<ConfirmFn | null>(null);

/**
 * Drop-in async replacement for `window.confirm`:
 *   if (!(await confirm("Delete this poster?"))) return;
 * Renders a themed AlertDialog instead of the browser-native prompt, with a
 * red confirm button by default (deletes are the overwhelming majority of
 * call sites) — pass { destructive: false } to opt out for non-destructive
 * confirmations like "Publish now?".
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmDialogContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmDialogProvider");
  return ctx;
}

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { open: boolean }) | null>(null);
  const resolver = useRef<((value: boolean) => void) | undefined>(undefined);

  const confirm = useCallback<ConfirmFn>((input) => {
    const opts: ConfirmOptions = typeof input === "string" ? { description: input } : input;
    setState({ destructive: true, ...opts, open: true });
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (result: boolean) => {
    setState((s) => (s ? { ...s, open: false } : s));
    resolver.current?.(result);
    resolver.current = undefined;
  };

  return (
    <ConfirmDialogContext.Provider value={confirm}>
      {children}
      <AlertDialog open={state?.open ?? false} onOpenChange={(open) => !open && close(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{state?.title ?? "Are you sure?"}</AlertDialogTitle>
            <AlertDialogDescription>{state?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => close(false)}>
              {state?.cancelLabel ?? "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => close(true)}
              className={
                state?.destructive
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
            >
              {state?.confirmLabel ?? "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmDialogContext.Provider>
  );
}
