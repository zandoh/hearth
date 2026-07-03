import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./api";
import { useTopic } from "./useSSE";

// Household profiles: the people chores are assigned to and meds belong to.
// Platform-level (like views); widgets resolve ids against this list.
export interface Profile {
  id: number;
  name: string;
  color: string;
}

export const getProfiles = () => apiFetch<Profile[]>("/api/profiles");

export const createProfile = (name: string, color: string) =>
  apiFetch<Profile>("/api/profiles", { method: "POST", body: JSON.stringify({ name, color }) });

export const updateProfile = (p: Profile) =>
  apiFetch<void>(`/api/profiles/${p.id}`, {
    method: "PUT",
    body: JSON.stringify({ name: p.name, color: p.color }),
  });

export const deleteProfile = (id: number) =>
  apiFetch<void>(`/api/profiles/${id}`, { method: "DELETE" });

/** The profile list, kept fresh over the "profiles" SSE topic. */
export function useProfiles(): { profiles: Profile[]; reload: () => void } {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const reload = useCallback(() => {
    getProfiles().then(setProfiles).catch(console.error);
  }, []);
  useEffect(reload, [reload]);
  useTopic("profiles", reload);
  return { profiles, reload };
}
