// Frontend mirror of the SSE topic contract (Go: internal/topics). Widgets publish on
// their own slug (widget.Base ties slug and topic together). Platform features (views,
// profiles, guest, night) have their own topics. The payload "changed" means
// "re-fetch what you show".
export const TOPICS = {
  clock: "clock",
  calendar: "calendar",
  chores: "chores",
  grocery: "grocery",
  meds: "meds",
  weather: "weather",
  guestbook: "guestbook",
  mealplan: "mealplan",
  sports: "sports",
  news: "news",
  word: "word",
  views: "views",
  profiles: "profiles",
  night: "night",
  guest: "guest",
} as const;
