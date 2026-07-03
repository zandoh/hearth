import { type ReactNode, useCallback, useState } from "react";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";

export interface ConfirmOptions {
  title: string;
  description: string;
  actionLabel: string;
}

/**
 * Astryx-native replacement for window.confirm(). Usage:
 *
 *   const { confirm, confirmDialog } = useConfirm();
 *   ...
 *   confirm({ title, description, actionLabel }, () => doTheThing());
 *   ...
 *   return <>{...}{confirmDialog}</>;
 */
export function useConfirm() {
  const [pending, setPending] = useState<(ConfirmOptions & { onAction: () => void }) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions, onAction: () => void) => {
    setPending({ ...opts, onAction });
  }, []);

  const confirmDialog: ReactNode = pending ? (
    <AlertDialog
      isOpen
      title={pending.title}
      description={pending.description}
      actionLabel={pending.actionLabel}
      onOpenChange={(open) => {
        if (!open) setPending(null);
      }}
      onAction={() => {
        pending.onAction();
        setPending(null);
      }}
    />
  ) : null;

  return { confirm, confirmDialog };
}
