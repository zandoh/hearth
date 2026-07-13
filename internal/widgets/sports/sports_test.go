package sports

// Cache, cadence, and handler tests drive the widget through the sportsAPI
// seam with a fake adapter that counts upstream calls — the polling
// discipline (share scoreboards, skip fresh entries, evict idle keys) is
// the widget's real contract with ESPN.

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/zandoh/hearth/internal/sse"
)

type fakeSports struct {
	mu        sync.Mutex
	teamLists map[string][]team
	schedules map[teamKey][]game
	teamInfo  map[teamKey]team
	boards    map[string][]liveEvent
	err       error
	calls     map[string]int
}

func newFakeSports() *fakeSports {
	return &fakeSports{
		teamLists: map[string][]team{},
		schedules: map[teamKey][]game{},
		teamInfo:  map[teamKey]team{},
		boards:    map[string][]liveEvent{},
		calls:     map[string]int{},
	}
}

func (f *fakeSports) count(k string) {
	f.mu.Lock()
	f.calls[k]++
	f.mu.Unlock()
}

func (f *fakeSports) callCount(k string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls[k]
}

func (f *fakeSports) teams(ctx context.Context, league string) ([]team, error) {
	f.count("teams:" + league)
	return f.teamLists[league], f.err
}

func (f *fakeSports) schedule(ctx context.Context, league, teamID string) (team, []game, error) {
	f.count("schedule:" + league + ":" + teamID)
	key := teamKey{League: league, TeamID: teamID}
	return f.teamInfo[key], f.schedules[key], f.err
}

func (f *fakeSports) scoreboard(ctx context.Context, league string) ([]liveEvent, error) {
	f.count("scoreboard:" + league)
	return f.boards[league], f.err
}

func newTestWidget(t *testing.T) (*Widget, *fakeSports) {
	t.Helper()
	w := New(sse.NewHub())
	fake := newFakeSports()
	w.api = fake
	return w, fake
}

func get(t *testing.T, w *Widget, path string) *httptest.ResponseRecorder {
	t.Helper()
	mux := http.NewServeMux()
	w.Routes(mux)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest("GET", path, nil))
	return rec
}

// subscribe connects an SSE client to the widget's hub and returns a reader
// positioned after the ": connected" preamble.
func subscribe(t *testing.T, w *Widget) *bufio.Reader {
	t.Helper()
	srv := httptest.NewServer(w.Hub)
	t.Cleanup(srv.Close)
	res, err := http.Get(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { res.Body.Close() })
	br := bufio.NewReader(res.Body)
	for {
		line, err := br.ReadString('\n')
		if err != nil {
			t.Fatalf("reading SSE preamble: %v", err)
		}
		if strings.HasPrefix(line, ": connected") {
			br.ReadString('\n') // trailing blank line
			return br
		}
	}
}

func waitForChanged(t *testing.T, br *bufio.Reader) {
	t.Helper()
	for {
		line, err := br.ReadString('\n')
		if err != nil {
			t.Fatalf("reading published event: %v", err)
		}
		if strings.HasPrefix(line, "data: ") {
			if !strings.Contains(line, `"topic":"sports"`) || !strings.Contains(line, `"changed"`) {
				t.Fatalf("published %q, want changed on the sports topic", line)
			}
			return
		}
	}
}

// seedEntry primes the cache as if a widget had requested the key and the
// fetch had landed, so cadence tests start from a known state.
func seedEntry(w *Widget, key teamKey, fetchedAt time.Time, events []game) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.cache[key] = &entry{
		lastRequested: w.now(),
		fetchedAt:     fetchedAt,
		events:        events,
	}
}

func gamesPath(league, team string) string {
	return fmt.Sprintf("/api/widgets/sports/games?league=%s&team=%s", league, team)
}

func TestGamesValidation(t *testing.T) {
	w, _ := newTestWidget(t)
	for _, path := range []string{
		"/api/widgets/sports/games",
		"/api/widgets/sports/games?league=xfl&team=1",
		"/api/widgets/sports/games?league=nfl",
		"/api/widgets/sports/teams",
		"/api/widgets/sports/teams?league=premier",
	} {
		if rec := get(t, w, path); rec.Code != http.StatusBadRequest {
			t.Errorf("GET %s = %d, want 400", path, rec.Code)
		}
	}
}

func TestGamesMissReturnsPendingThenData(t *testing.T) {
	w, fake := newTestWidget(t)
	key := teamKey{League: "nfl", TeamID: "2"}
	fake.teamInfo[key] = team{ID: "2", Name: "Buffalo Bills", Abbrev: "BUF"}
	fake.schedules[key] = []game{{
		ID: "g1", Start: time.Now().Add(24 * time.Hour), Status: statusScheduled,
		Opponent: team{ID: "15", Abbrev: "MIA"},
	}}
	br := subscribe(t, w)

	rec := get(t, w, gamesPath("nfl", "2"))
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"pending":true`) {
		t.Fatalf("first GET = %d %s, want pending", rec.Code, rec.Body)
	}

	waitForChanged(t, br) // the background fetch announces itself

	rec = get(t, w, gamesPath("nfl", "2"))
	var res struct {
		Games *teamGames `json:"games"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	if res.Games == nil || res.Games.Team.Abbrev != "BUF" || len(res.Games.Upcoming) != 1 {
		t.Errorf("games = %+v", res.Games)
	}
}

func TestSplitGames(t *testing.T) {
	now := time.Date(2026, 7, 12, 18, 0, 0, 0, time.UTC)
	day := func(d int) time.Time { return now.Add(time.Duration(d) * 24 * time.Hour) }
	events := []game{
		{ID: "old-final", Start: day(-10), Status: statusFinal},
		{ID: "recent-final", Start: day(-1), Status: statusFinal},
		{ID: "live-now", Start: now.Add(-time.Hour), Status: statusLive},
		// A doubleheader: two games the same day with distinct IDs.
		{ID: "dh-1", Start: day(1), Status: statusScheduled},
		{ID: "dh-2", Start: day(1).Add(4 * time.Hour), Status: statusScheduled},
		{ID: "u3", Start: day(2), Status: statusScheduled},
		{ID: "u4", Start: day(3), Status: statusScheduled},
		{ID: "u5", Start: day(4), Status: statusScheduled},
		{ID: "u6-over-cap", Start: day(5), Status: statusScheduled},
		// Postponed weeks ago, never finalized: excluded from upcoming.
		{ID: "stale-ppd", Start: day(-20), Status: statusScheduled},
	}
	prev, live, upcoming := splitGames(events, now)
	if prev == nil || prev.ID != "recent-final" {
		t.Errorf("prev = %+v, want recent-final", prev)
	}
	if live == nil || live.ID != "live-now" {
		t.Errorf("live = %+v, want live-now", live)
	}
	ids := make([]string, len(upcoming))
	for i, g := range upcoming {
		ids[i] = g.ID
	}
	want := []string{"dh-1", "dh-2", "u3", "u4", "u5"}
	if strings.Join(ids, ",") != strings.Join(want, ",") {
		t.Errorf("upcoming = %v, want %v (doubleheader kept, cap %d, stale postponed dropped)",
			ids, want, maxUpcoming)
	}

	if _, _, empty := splitGames(nil, now); empty == nil {
		t.Error("upcoming must be [] (not nil) so the offseason serves an empty list")
	}
}

func TestLiveRelevant(t *testing.T) {
	now := time.Date(2026, 7, 12, 18, 0, 0, 0, time.UTC)
	cases := []struct {
		name string
		g    game
		want bool
	}{
		{"live", game{Status: statusLive}, true},
		{"starts in 10m", game{Status: statusScheduled, Start: now.Add(10 * time.Minute)}, true},
		{"started 1h ago, still pre", game{Status: statusScheduled, Start: now.Add(-time.Hour)}, true},
		{"starts tomorrow", game{Status: statusScheduled, Start: now.Add(24 * time.Hour)}, false},
		{"postponed 20d ago", game{Status: statusScheduled, Start: now.Add(-480 * time.Hour)}, false},
		{"final", game{Status: statusFinal, Start: now.Add(-2 * time.Hour)}, false},
	}
	for _, c := range cases {
		if got := liveRelevant(c.g, now); got != c.want {
			t.Errorf("%s: liveRelevant = %v, want %v", c.name, got, c.want)
		}
	}
}

func TestRefreshSkipsFreshIdleEntries(t *testing.T) {
	w, fake := newTestWidget(t)
	key := teamKey{League: "nba", TeamID: "5"}
	seedEntry(w, key, w.now(), []game{
		{ID: "g1", Start: w.now().Add(48 * time.Hour), Status: statusScheduled},
	})

	if err := w.refresh(context.Background()); err != nil {
		t.Fatal(err)
	}
	if n := fake.callCount("schedule:nba:5"); n != 0 {
		t.Errorf("schedule calls = %d, want 0 for a fresh idle entry", n)
	}
	if n := fake.callCount("scoreboard:nba"); n != 0 {
		t.Errorf("scoreboard calls = %d, want 0 with no live-relevant game", n)
	}
}

func TestRefreshRefetchesStaleSchedule(t *testing.T) {
	w, fake := newTestWidget(t)
	key := teamKey{League: "nba", TeamID: "5"}
	fake.schedules[key] = []game{{ID: "g1", Start: w.now().Add(48 * time.Hour), Status: statusScheduled}}
	seedEntry(w, key, w.now().Add(-idleEvery-time.Minute), nil)
	br := subscribe(t, w)

	if err := w.refresh(context.Background()); err != nil {
		t.Fatal(err)
	}
	if n := fake.callCount("schedule:nba:5"); n != 1 {
		t.Errorf("schedule calls = %d, want 1 for a stale entry", n)
	}
	waitForChanged(t, br)
}

func TestRefreshSharesScoreboardPerLeague(t *testing.T) {
	w, fake := newTestWidget(t)
	now := w.now()
	live := func(id, opp string) []game {
		return []game{{ID: id, Start: now.Add(-time.Hour), Status: statusLive, Opponent: team{ID: opp}}}
	}
	seedEntry(w, teamKey{League: "mlb", TeamID: "2"}, now, live("e1", "17"))
	seedEntry(w, teamKey{League: "mlb", TeamID: "17"}, now, live("e1", "2"))
	fake.boards["mlb"] = []liveEvent{{
		ID: "e1", Status: statusLive, Detail: "Top 5th",
		Scores: map[string]*int{"2": intp(3), "17": intp(1)},
	}}

	if err := w.refresh(context.Background()); err != nil {
		t.Fatal(err)
	}
	if n := fake.callCount("scoreboard:mlb"); n != 1 {
		t.Errorf("scoreboard calls = %d, want 1 shared across both teams", n)
	}

	rec := get(t, w, gamesPath("mlb", "2"))
	var res struct {
		Games *teamGames `json:"games"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	lg := res.Games.Live
	if lg == nil || lg.Detail != "Top 5th" || lg.TeamScore == nil || *lg.TeamScore != 3 ||
		lg.OppScore == nil || *lg.OppScore != 1 {
		t.Errorf("live game = %+v, want overlaid scoreboard data", lg)
	}
}

func TestLiveToFinalForcesScheduleRefetch(t *testing.T) {
	w, fake := newTestWidget(t)
	now := w.now()
	key := teamKey{League: "nhl", TeamID: "9"}
	seedEntry(w, key, now, []game{
		{ID: "e1", Start: now.Add(-2 * time.Hour), Status: statusLive, Opponent: team{ID: "4"}},
	})
	fake.schedules[key] = []game{
		{ID: "e1", Start: now.Add(-2 * time.Hour), Status: statusFinal, Opponent: team{ID: "4"}},
	}
	fake.boards["nhl"] = []liveEvent{{
		ID: "e1", Status: statusFinal, Detail: "Final/OT",
		Scores: map[string]*int{"9": intp(4), "4": intp(3)},
	}}

	if err := w.refresh(context.Background()); err != nil {
		t.Fatal(err)
	}
	if n := fake.callCount("schedule:nhl:9"); n != 1 {
		t.Errorf("schedule calls = %d, want 1 forced by the live→final transition", n)
	}
}

func TestEviction(t *testing.T) {
	w, fake := newTestWidget(t)
	key := teamKey{League: "nfl", TeamID: "2"}
	w.mu.Lock()
	w.cache[key] = &entry{
		lastRequested: w.now().Add(-evictAfter - time.Minute),
		fetchedAt:     w.now().Add(-evictAfter - time.Minute),
	}
	w.mu.Unlock()

	if err := w.refresh(context.Background()); err != nil {
		t.Fatal(err)
	}
	w.mu.Lock()
	_, alive := w.cache[key]
	w.mu.Unlock()
	if alive {
		t.Error("entry idle past evictAfter must be evicted")
	}
	if n := fake.callCount("schedule:nfl:2"); n != 0 {
		t.Errorf("schedule calls = %d, evicted entries must not be fetched", n)
	}
}

func TestFetchFailureKeepsLastGoodData(t *testing.T) {
	w, fake := newTestWidget(t)
	key := teamKey{League: "mlb", TeamID: "2"}
	events := []game{{ID: "g1", Start: w.now().Add(24 * time.Hour), Status: statusScheduled}}
	seedEntry(w, key, w.now().Add(-idleEvery-time.Minute), events)
	fake.err = errors.New("espn down")

	if err := w.refresh(context.Background()); err == nil {
		t.Fatal("refresh should surface the upstream error")
	}
	rec := get(t, w, gamesPath("mlb", "2"))
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"g1"`) {
		t.Errorf("GET after failed refresh = %d %s, want last good data", rec.Code, rec.Body)
	}
}

func TestRefreshWarmsTeamLists(t *testing.T) {
	w, fake := newTestWidget(t)
	for league := range map[string]bool{"nfl": true, "nhl": true, "mlb": true, "nba": true} {
		fake.teamLists[league] = []team{{ID: "1", Name: league + " team"}}
	}

	if err := w.refresh(context.Background()); err != nil {
		t.Fatal(err)
	}
	for league := range fake.teamLists {
		if n := fake.callCount("teams:" + league); n != 1 {
			t.Errorf("teams:%s calls = %d, want 1 (warmed at startup tick)", league, n)
		}
	}

	// A second tick and a settings-dialog GET both serve from the warm cache.
	if err := w.refresh(context.Background()); err != nil {
		t.Fatal(err)
	}
	if rec := get(t, w, "/api/widgets/sports/teams?league=nfl"); rec.Code != http.StatusOK {
		t.Fatalf("teams after warm: %d", rec.Code)
	}
	if n := fake.callCount("teams:nfl"); n != 1 {
		t.Errorf("teams:nfl calls = %d, want 1 (tick and GET served from cache)", n)
	}
}

func TestTeamsWarmFailureBacksOff(t *testing.T) {
	w, fake := newTestWidget(t)
	fake.err = errors.New("espn down")
	current := time.Date(2026, 7, 12, 18, 0, 0, 0, time.UTC)
	w.now = func() time.Time { return current }

	if err := w.refresh(context.Background()); err == nil {
		t.Fatal("warm failures should surface from refresh")
	}
	if n := fake.callCount("teams:nfl"); n != 1 {
		t.Fatalf("teams:nfl attempts = %d, want 1", n)
	}

	// Within the retry window nothing re-attempts; past it, one retry each.
	current = current.Add(time.Minute)
	w.refresh(context.Background())
	if n := fake.callCount("teams:nfl"); n != 1 {
		t.Errorf("teams:nfl attempts = %d, want 1 inside the backoff window", n)
	}
	current = current.Add(teamsRetry)
	w.refresh(context.Background())
	if n := fake.callCount("teams:nfl"); n != 2 {
		t.Errorf("teams:nfl attempts = %d, want 2 after the backoff window", n)
	}
}

func TestTeamsCaching(t *testing.T) {
	w, fake := newTestWidget(t)
	fake.teamLists["nhl"] = []team{{ID: "9", Name: "Boston Bruins", Abbrev: "BOS"}}

	for range 2 {
		rec := get(t, w, "/api/widgets/sports/teams?league=nhl")
		if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "Bruins") {
			t.Fatalf("teams = %d %s", rec.Code, rec.Body)
		}
	}
	if n := fake.callCount("teams:nhl"); n != 1 {
		t.Errorf("upstream teams calls = %d, want 1 (second GET served from cache)", n)
	}
}
