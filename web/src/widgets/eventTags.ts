// Hashtag tags on calendar events: put #countdown, #travel, #meal … in an
// event's description (the tidy place) or its title, wherever the event is
// managed — Google Calendar included, since descriptions sync into notes.
//
// This module is the shared contract for every widget that reacts to
// tagged events; the countdown widget is the first consumer. Keep it free
// of widget specifics so the next tag-driven widget only writes a filter.

const TAG_RE = /#([a-z0-9][a-z0-9_-]*)/gi;

export interface Taggable {
  title: string;
  notes?: string;
}

/** All hashtags found in a piece of text, lower-cased, without the #. */
export function extractTags(text: string): Set<string> {
  const tags = new Set<string>();
  for (const m of text.matchAll(TAG_RE)) tags.add(m[1].toLowerCase());
  return tags;
}

/** An event's tags, gathered from description and title. */
export const eventTags = (ev: Taggable): Set<string> =>
  extractTags(`${ev.notes ?? ""} ${ev.title}`);

/** Whether the event carries at least one of the wanted tags. */
export function hasAnyTag(ev: Taggable, wanted: string[]): boolean {
  const tags = eventTags(ev);
  return wanted.some((t) => tags.has(t));
}

/** Title with hashtags removed — what widgets should display. */
export const stripTags = (title: string): string =>
  title
    .replace(TAG_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();

/** User-entered tag list ("Travel, #trip camp") → clean lower-case tags. */
export const parseTagList = (raw: unknown): string[] =>
  typeof raw === "string"
    ? [
        ...new Set(
          raw
            .split(/[\s,]+/)
            .map((t) => t.replace(/^#/, "").toLowerCase())
            .filter((t) => /^[a-z0-9][a-z0-9_-]*$/.test(t)),
        ),
      ]
    : Array.isArray(raw)
      ? raw.filter((t): t is string => typeof t === "string")
      : [];

// Tags the system watches when a widget hasn't configured its own list.
export const DEFAULT_TAGS = ["countdown", "travel", "trip"];

// Widget types that react to event tags; an instance with no configured
// list watches DEFAULT_TAGS.
const TAG_DRIVEN_WIDGETS = new Set(["countdown"]);

/**
 * Every tag the system is currently watching — the union of what each
 * tag-driven widget instance effectively watches (its configured list, or
 * the defaults when it has none). Empty when nothing watches tags: a pill
 * for a tag no widget reacts to would be a lie. Any widget with a
 * config.tags list contributes, so future tag-driven widgets join for free.
 */
export function knownTags(views: { layout: { widget?: string; config?: unknown }[] }[]): string[] {
  const tags = new Set<string>();
  for (const v of views) {
    for (const item of v.layout) {
      const cfg = item.config as { tags?: unknown } | undefined;
      const configured = parseTagList(cfg?.tags);
      if (configured.length > 0) {
        for (const t of configured) tags.add(t);
      } else if (item.widget && TAG_DRIVEN_WIDGETS.has(item.widget)) {
        for (const t of DEFAULT_TAGS) tags.add(t);
      }
    }
  }
  return [...tags];
}

/** Add the tag to the text if absent, remove it if present. */
export function toggleTag(text: string, tag: string): string {
  const re = new RegExp(`\\s*#${tag}(?![a-z0-9_-])`, "gi");
  if (extractTags(text).has(tag.toLowerCase())) {
    return text
      .replace(re, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  return text.trim() ? `${text.trim()} #${tag}` : `#${tag}`;
}
