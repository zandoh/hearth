// Package sports: previous game, upcoming games, and live scores for one
// NFL/NHL/MLB/NBA team per widget instance, from ESPN's keyless public API.
// Team choice lives in each widget instance's layout config, so unlike
// weather there is no global setting to poll: the backend caches per
// (league, team) on demand. A widget's first request registers its key and
// the refresh job keeps in-use keys fresh — every minute while a game is
// live or imminent (via the league scoreboard, shared across teams), every
// 30 minutes otherwise (via the team schedule). Keys nobody has requested
// for two hours stop being polled. The kiosk is always served from memory.
package sports

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"sort"
	"sync"
	"time"

	"github.com/zandoh/hearth/internal/httpx"
	"github.com/zandoh/hearth/internal/sse"
	"github.com/zandoh/hearth/internal/topics"
	"github.com/zandoh/hearth/internal/widget"
)

const (
	tickEvery  = time.Minute
	idleEvery  = 30 * time.Minute
	soonWindow = 30 * time.Minute
	// liveGrace bounds the "expected live" window: a game whose start has
	// passed but never went final (postponed, suspended, or missing from
	// the scoreboard) stops forcing per-minute polls after this long.
	liveGrace   = 6 * time.Hour
	evictAfter  = 2 * time.Hour
	teamsTTL    = 24 * time.Hour
	// teamsRetry spaces out re-attempts after a failed team-list fetch so a
	// long ESPN outage doesn't add four upstream calls to every tick.
	teamsRetry  = 15 * time.Minute
	maxUpcoming = 5
)

type teamKey struct {
	League string
	TeamID string
}

// entry is one tracked team's cached state. Its events slice is treated as
// immutable: updates swap in a fresh slice, never mutate in place, so
// handlers can JSON-encode a snapshot after releasing the lock.
type entry struct {
	lastRequested time.Time
	fetchedAt     time.Time // zero until the first schedule fetch lands
	fetching      bool      // an on-demand fetch goroutine is in flight
	team          team
	events        []game
}

type teamListCache struct {
	teams       []team
	fetchedAt   time.Time
	attemptedAt time.Time
}

// teamGames is the shape served to the frontend.
type teamGames struct {
	League    string    `json:"league"`
	Team      team      `json:"team"`
	FetchedAt time.Time `json:"fetchedAt"`
	Previous  *game     `json:"previous,omitempty"`
	Live      *game     `json:"live,omitempty"`
	Upcoming  []game    `json:"upcoming"`
}

type Widget struct {
	widget.Base
	api sportsAPI
	now func() time.Time // time.Now; injectable for cadence/eviction tests

	mu        sync.Mutex
	cache     map[teamKey]*entry
	teamLists map[string]teamListCache
}

func New(hub *sse.Hub) *Widget {
	return &Widget{
		Base:      widget.Base{Hub: hub, Slug: topics.Sports},
		api:       &espnClient{http: &http.Client{Timeout: 20 * time.Second}},
		now:       time.Now,
		cache:     map[teamKey]*entry{},
		teamLists: map[string]teamListCache{},
	}
}

func (w *Widget) Jobs() []widget.Job {
	return []widget.Job{{
		Name:     "refresh",
		Interval: tickEvery,
		Run:      w.refresh,
	}}
}

func (w *Widget) Routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/widgets/sports/teams", w.handleTeams)
	mux.HandleFunc("GET /api/widgets/sports/games", w.handleGames)
}

// handleGames serves one team's split schedule from cache. A first request
// for an unknown team registers it, answers {pending:true}, and fetches in
// the background; the completed fetch announces itself over SSE and the
// widget re-requests. Every request bumps the key's keep-alive.
func (w *Widget) handleGames(rw http.ResponseWriter, r *http.Request) {
	league := r.URL.Query().Get("league")
	teamID := r.URL.Query().Get("team")
	if _, ok := leaguePath[league]; !ok {
		httpx.BadRequest(rw, "league must be one of nfl, nhl, mlb, nba")
		return
	}
	if teamID == "" {
		httpx.BadRequest(rw, "team is required")
		return
	}
	key := teamKey{League: league, TeamID: teamID}
	now := w.now()

	w.mu.Lock()
	e := w.cache[key]
	if e == nil {
		e = &entry{}
		w.cache[key] = e
	}
	e.lastRequested = now
	if e.fetchedAt.IsZero() {
		if !e.fetching {
			e.fetching = true
			// Detached from the request context: the fetch must outlive
			// the client, and completion is announced over SSE.
			go w.fetchAndPublish(key)
		}
		w.mu.Unlock()
		httpx.JSON(rw, http.StatusOK, map[string]any{"pending": true})
		return
	}
	prev, live, upcoming := splitGames(e.events, now)
	games := teamGames{
		League:    league,
		Team:      e.team,
		FetchedAt: e.fetchedAt,
		Previous:  prev,
		Live:      live,
		Upcoming:  upcoming,
	}
	w.mu.Unlock()
	httpx.JSON(rw, http.StatusOK, map[string]any{"games": games})
}

// handleTeams serves a league's team list for the settings dialog, cached a
// day so the browser never talks to ESPN. Fetched synchronously (like
// weather's geocode) — it only runs while someone is in settings.
func (w *Widget) handleTeams(rw http.ResponseWriter, r *http.Request) {
	league := r.URL.Query().Get("league")
	if _, ok := leaguePath[league]; !ok {
		httpx.BadRequest(rw, "league must be one of nfl, nhl, mlb, nba")
		return
	}
	now := w.now()
	w.mu.Lock()
	cached := w.teamLists[league]
	w.mu.Unlock()
	if now.Sub(cached.fetchedAt) < teamsTTL {
		httpx.JSON(rw, http.StatusOK, cached.teams)
		return
	}
	teams, err := w.api.teams(r.Context(), league)
	if err != nil {
		if cached.teams != nil { // a stale list beats an error for a dropdown
			httpx.JSON(rw, http.StatusOK, cached.teams)
			return
		}
		httpx.Fail(rw, err)
		return
	}
	w.mu.Lock()
	w.teamLists[league] = teamListCache{teams: teams, fetchedAt: now, attemptedAt: now}
	w.mu.Unlock()
	httpx.JSON(rw, http.StatusOK, teams)
}

// warmTeamLists keeps every league's team list in memory — fetched at
// startup, refreshed daily — so opening the settings dialog never waits on
// an ESPN round-trip. Failed fetches back off for teamsRetry.
func (w *Widget) warmTeamLists(ctx context.Context) []error {
	now := w.now()
	var stale []string
	w.mu.Lock()
	for league := range leaguePath {
		c := w.teamLists[league]
		if now.Sub(c.fetchedAt) < teamsTTL || now.Sub(c.attemptedAt) < teamsRetry {
			continue
		}
		c.attemptedAt = now
		w.teamLists[league] = c
		stale = append(stale, league)
	}
	w.mu.Unlock()

	var errs []error
	for _, league := range stale {
		teams, err := w.api.teams(ctx, league)
		if err != nil {
			errs = append(errs, err)
			continue
		}
		w.mu.Lock()
		w.teamLists[league] = teamListCache{teams: teams, fetchedAt: w.now(), attemptedAt: w.now()}
		w.mu.Unlock()
	}
	return errs
}

// refresh is the per-minute tick. Most ticks do nothing: it evicts keys
// nobody is requesting, refetches schedules older than idleEvery, and — only
// while some team has a game live or imminent — pulls that league's
// scoreboard (once per league, shared by its teams) for live scores.
func (w *Widget) refresh(ctx context.Context) error {
	now := w.now()
	errs := w.warmTeamLists(ctx)

	type work struct {
		key          teamKey
		needSchedule bool
		needLive     bool
	}
	var todo []work

	w.mu.Lock()
	for key, e := range w.cache {
		if now.Sub(e.lastRequested) > evictAfter {
			delete(w.cache, key)
			continue
		}
		if e.fetching {
			continue
		}
		item := work{
			key:          key,
			needSchedule: now.Sub(e.fetchedAt) >= idleEvery,
			needLive:     anyLiveRelevant(e.events, now),
		}
		if item.needSchedule || item.needLive {
			todo = append(todo, item)
		}
	}
	w.mu.Unlock()

	boards := map[string][]liveEvent{} // league → scoreboard, one call per tick
	changed := false
	for _, item := range todo {
		if item.needSchedule {
			if err := w.fetchSchedule(ctx, item.key); err != nil {
				errs = append(errs, err)
			} else {
				changed = true
			}
		}
		if item.needLive {
			board, fetched := boards[item.key.League]
			if !fetched {
				var err error
				board, err = w.api.scoreboard(ctx, item.key.League)
				if err != nil {
					errs = append(errs, err)
					board = nil
				}
				boards[item.key.League] = board // nil caches the failure for this tick
			}
			if board == nil {
				continue
			}
			overlaid, wentFinal := w.overlayLive(item.key, board)
			if overlaid {
				changed = true
			}
			if wentFinal && !item.needSchedule {
				// The official record and any next-game changes land with a
				// schedule refetch, so don't wait out the idle interval.
				if err := w.fetchSchedule(ctx, item.key); err != nil {
					errs = append(errs, err)
				}
			}
		}
	}
	if changed {
		w.Publish("changed")
	}
	return errors.Join(errs...)
}

// fetchAndPublish is the on-demand path behind {pending:true} responses.
func (w *Widget) fetchAndPublish(key teamKey) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := w.fetchSchedule(ctx, key); err != nil {
		slog.Warn("sports: schedule fetch failed", "league", key.League, "team", key.TeamID, "err", err)
		return
	}
	w.Publish("changed")
}

// fetchSchedule refreshes one team's schedule. On failure the entry keeps
// its last good data; the error is logged by the caller or job runner.
func (w *Widget) fetchSchedule(ctx context.Context, key teamKey) error {
	tm, games, err := w.api.schedule(ctx, key.League, key.TeamID)
	w.mu.Lock()
	defer w.mu.Unlock()
	e := w.cache[key]
	if e == nil {
		return err // evicted while fetching
	}
	e.fetching = false
	if err != nil {
		return err
	}
	e.team = tm
	e.events = games
	e.fetchedAt = w.now()
	return nil
}

// overlayLive merges a league scoreboard into one team's cached events,
// swapping in a fresh slice (entries are immutable in place). It reports
// whether anything visible changed and whether a game just went final.
func (w *Widget) overlayLive(key teamKey, board []liveEvent) (changed, wentFinal bool) {
	byID := make(map[string]liveEvent, len(board))
	for _, le := range board {
		byID[le.ID] = le
	}

	w.mu.Lock()
	defer w.mu.Unlock()
	e := w.cache[key]
	if e == nil {
		return false, false
	}
	next := make([]game, len(e.events))
	copy(next, e.events)
	for i := range next {
		le, ok := byID[next[i].ID]
		if !ok {
			continue // not on today's board (late-night ET edge) — keep schedule data
		}
		g := &next[i]
		if g.Status == statusLive && le.Status == statusFinal {
			wentFinal = true
		}
		if g.Status != le.Status || g.Detail != le.Detail {
			changed = true
		}
		g.Status = le.Status
		g.Detail = le.Detail
		if s := le.Scores[key.TeamID]; s != nil {
			if g.TeamScore == nil || *g.TeamScore != *s {
				changed = true
			}
			g.TeamScore = s
		}
		if s := le.Scores[g.Opponent.ID]; s != nil {
			if g.OppScore == nil || *g.OppScore != *s {
				changed = true
			}
			g.OppScore = s
		}
	}
	if changed {
		e.events = next
	}
	return changed, wentFinal
}

// splitGames views a cached season chronologically: the most recent final
// as "previous", any in-progress game as "live", and up to maxUpcoming
// scheduled games as "upcoming". Computed per request, so a game drifts
// from upcoming → live → previous purely by its status.
func splitGames(events []game, now time.Time) (prev, live *game, upcoming []game) {
	sorted := make([]game, len(events))
	copy(sorted, events)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Start.Before(sorted[j].Start) })

	upcoming = []game{} // serve [] rather than null in the offseason
	for i := range sorted {
		switch sorted[i].Status {
		case statusFinal:
			prev = &sorted[i] // ascending order: the last final wins
		case statusLive:
			if live == nil {
				live = &sorted[i]
			}
		case statusScheduled:
			// Skip long-past games that never went final (postponed) but
			// keep recent ones — a delayed start is still "upcoming".
			if len(upcoming) < maxUpcoming && sorted[i].Start.After(now.Add(-liveGrace)) {
				upcoming = append(upcoming, sorted[i])
			}
		}
	}
	return prev, live, upcoming
}

func anyLiveRelevant(events []game, now time.Time) bool {
	for _, g := range events {
		if liveRelevant(g, now) {
			return true
		}
	}
	return false
}

// liveRelevant reports whether a game should force per-minute scoreboard
// polls: it is in progress, or it is scheduled to start within soonWindow
// (or to have started up to liveGrace ago — the schedule may still say
// "pre" for a game the scoreboard already shows in progress).
func liveRelevant(g game, now time.Time) bool {
	switch g.Status {
	case statusLive:
		return true
	case statusScheduled:
		return g.Start.Before(now.Add(soonWindow)) && g.Start.After(now.Add(-liveGrace))
	}
	return false
}
