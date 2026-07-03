import { useCallback, useState } from "react";

/**
 * The one mutate-then-refresh discipline for widget writes: run the request;
 * on success reload the data this screen shows (SSE only covers OTHER
 * screens, never our own action) and then run `onSuccess` — so forms clear
 * only AFTER the server said yes; on failure surface the server's message
 * (apiFetch unwraps the {"error"} body) in `error` for a
 * <Text className="form-error"> — failures never vanish into the console.
 *
 * `busy` is true while a request is in flight, for disabling submit buttons.
 */
export function useMutate(reload?: () => void): {
  mutate: (fn: () => Promise<unknown>, onSuccess?: () => void) => Promise<void>;
  error: string;
  busy: boolean;
} {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const mutate = useCallback(
    async (fn: () => Promise<unknown>, onSuccess?: () => void) => {
      setError("");
      setBusy(true);
      try {
        await fn();
      } catch (err) {
        setError(err instanceof Error ? err.message : "request failed");
        return;
      } finally {
        setBusy(false);
      }
      reload?.();
      onSuccess?.();
    },
    [reload],
  );
  return { mutate, error, busy };
}
