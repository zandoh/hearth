import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./api";
import { useTopic } from "./useSSE";

/**
 * The data-loading quartet every widget otherwise repeats: fetch on mount,
 * refetch whenever the widget's SSE topic fires, hold the latest payload.
 * The topic and the API root both derive from the slug — the same
 * convention the backend's widget.Base publishes on.
 *
 * `path` extends the widget's API root, e.g. useWidgetData("meds", "/today")
 * fetches /api/widgets/meds/today and refetches on the "meds" topic.
 */
export function useWidgetData<T>(slug: string, path = ""): { data: T | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const reload = useCallback(() => {
    apiFetch<T>(`/api/widgets/${slug}${path}`).then(setData).catch(console.error);
  }, [slug, path]);
  useEffect(reload, [reload]);
  useTopic(slug, reload);
  return { data, reload };
}
