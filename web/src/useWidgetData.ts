import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./api";
import { useTopic } from "./useSSE";

/**
 * The data-loading pattern every widget would repeat: fetch on mount, re-fetch when the
 * fetcher changes or the SSE topic fires, and hold the latest payload. `fetcher` is
 * usually a named verb from a widget's api module (calendarApi.getCalendars,
 * mealplanApi.getWeek, ...). Keep it stable (module level or useCallback), or the
 * component re-fetches every render.
 */
export function useTopicData<T>(
  topic: string,
  fetcher: () => Promise<T>,
): { data: T | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const reload = useCallback(() => {
    fetcher().then(setData).catch(console.error);
  }, [fetcher]);
  useEffect(reload, [reload]);
  useTopic(topic, reload);
  return { data, reload };
}

/**
 * Slug shorthand over useTopicData: the topic and the API root both come from the slug,
 * the convention the backend's widget.Base publishes on. `path` extends the widget's
 * API root and may hold query params. The data re-fetches when it changes. Example:
 * useWidgetData("meds", "/today") fetches /api/widgets/meds/today and re-fetches on
 * the "meds" topic.
 */
export function useWidgetData<T>(slug: string, path = ""): { data: T | null; reload: () => void } {
  const fetcher = useCallback(() => apiFetch<T>(`/api/widgets/${slug}${path}`), [slug, path]);
  return useTopicData<T>(slug, fetcher);
}
