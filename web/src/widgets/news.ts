// Pure helpers for the news widget: config parsing and headline ages.
// Kept free of React and fetch so bun can table-test them.

export const NEWS_TOPICS = [
  { value: "top", label: "Top stories" },
  { value: "world", label: "World" },
  { value: "nation", label: "U.S." },
  { value: "business", label: "Business" },
  { value: "technology", label: "Technology" },
  { value: "science", label: "Science" },
  { value: "health", label: "Health" },
  { value: "sports", label: "Sports" },
  { value: "entertainment", label: "Entertainment" },
];

export const DEFAULT_TOPIC = "top";
export const DEFAULT_COUNT = 6;
export const MAX_COUNT = 10; // the backend caches a couple more than this

export interface NewsConfig {
  topic: string;
  count: number;
}

export function parseNewsConfig(config: Record<string, unknown>): NewsConfig {
  const topic =
    typeof config.topic === "string" && NEWS_TOPICS.some((t) => t.value === config.topic)
      ? config.topic
      : DEFAULT_TOPIC;
  let count = typeof config.count === "number" ? Math.round(config.count) : DEFAULT_COUNT;
  if (!Number.isFinite(count)) count = DEFAULT_COUNT;
  return { topic, count: Math.min(MAX_COUNT, Math.max(1, count)) };
}

// "now", "35m", "4h", "2d" — a headline's age at kiosk-glance size. Clock
// skew between feed and kiosk can put publishedAt slightly in the future;
// clamp to "now" rather than showing negative ages.
export function timeAgo(iso: string, now: Date): string {
  const ms = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
