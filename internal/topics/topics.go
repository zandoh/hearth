// Package topics names every SSE topic Hearth publishes on. It is the SSE
// contract shared with the frontend (web/src/topics.ts mirrors it): each
// widget publishes on its own ID, platform code publishes on concept
// topics, and a payload of "changed" means "re-fetch". Adding a topic here
// means adding it to the frontend mirror too.
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
)

// Platform topics — concepts owned by the server, not any single widget.
const (
	Views    = "views"
	Profiles = "profiles"
	Night    = "night"
	Guest    = "guest"
)
