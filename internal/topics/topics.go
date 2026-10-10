// Package topics names every SSE topic Hearth publishes on: the SSE contract that
// web/src/topics.ts mirrors. Each widget publishes on its own ID, platform code on
// concept topics, and the payload "changed" means "re-fetch". Add each new topic to
// the frontend mirror too.
package topics

// Widget topics — one per registered widget, equal to the widget's ID.
const (
	Clock     = "clock"
	Calendar  = "calendar"
	Chores    = "chores"
	Grocery   = "grocery"
	Meds      = "meds"
	Weather   = "weather"
	Guestbook = "guestbook"
	MealPlan  = "mealplan"
	Sports    = "sports"
	News      = "news"
	Word      = "word"
)

// Platform topics — concepts owned by the server, not any single widget.
const (
	Views    = "views"
	Profiles = "profiles"
	Night    = "night"
	Guest    = "guest"
)
