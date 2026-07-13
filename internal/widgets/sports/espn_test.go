package sports

// Decode tests pin the ESPN response shapes the adapter depends on, using
// trimmed copies of real payloads (captured 2026-07). ESPN's API is
// unofficial; if a shape drifts, these fixtures localize the breakage.

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

const teamsFixture = `{
  "sports": [{"leagues": [{"teams": [
    {"team": {"id": "29", "displayName": "Arizona Diamondbacks", "abbreviation": "ARI",
      "logos": [{"href": "https://a.espncdn.com/i/teamlogos/mlb/500/ari.png"}]}},
    {"team": {"id": "2", "displayName": "Boston Red Sox", "abbreviation": "BOS", "logos": []}}
  ]}]}]
}`

// One final game (object scores) and one future game (null scores), as the
// schedule endpoint sends them. Team 2 (BOS) is the tracked team.
const scheduleFixture = `{
  "team": {"id": "2", "displayName": "Boston Red Sox", "abbreviation": "BOS",
    "logo": "https://a.espncdn.com/i/teamlogos/mlb/500/bos.png", "recordSummary": "52-39"},
  "events": [
    {"id": "401814689", "date": "2026-03-26T20:10Z", "competitions": [{
      "date": "2026-03-26T20:10Z",
      "status": {"type": {"state": "post", "shortDetail": "Final"}},
      "competitors": [
        {"homeAway": "home", "score": {"value": 0.0, "displayValue": "0"},
         "team": {"id": "17", "displayName": "Cincinnati Reds", "abbreviation": "CIN",
           "logos": [{"href": "https://a.espncdn.com/i/teamlogos/mlb/500/cin.png"}]}},
        {"homeAway": "away", "score": {"value": 3.0, "displayValue": "3"},
         "team": {"id": "2", "displayName": "Boston Red Sox", "abbreviation": "BOS", "logos": []}}
      ],
      "broadcasts": [{"media": {"shortName": "NESN"}}]
    }]},
    {"id": "401815000", "date": "2026-07-17T17:35Z", "competitions": [{
      "date": "2026-07-17T17:35Z",
      "status": {"type": {"state": "pre", "shortDetail": "7/17 - 1:35 PM EDT"}},
      "competitors": [
        {"homeAway": "home", "score": null,
         "team": {"id": "2", "displayName": "Boston Red Sox", "abbreviation": "BOS", "logos": []}},
        {"homeAway": "away", "score": null,
         "team": {"id": "30", "displayName": "Tampa Bay Rays", "abbreviation": "TB", "logos": []}}
      ],
      "broadcasts": []
    }]}
  ]
}`

// Scoreboard scores are strings and the live clock lives on event.status.
const scoreboardFixture = `{
  "events": [
    {"id": "401816130",
     "status": {"displayClock": "0:00", "period": 5,
       "type": {"state": "in", "shortDetail": "Top 5th"}},
     "competitions": [{"competitors": [
       {"homeAway": "home", "score": "14", "team": {"id": "23", "displayName": "Home", "abbreviation": "HOM"}},
       {"homeAway": "away", "score": "5", "team": {"id": "8", "displayName": "Away", "abbreviation": "AWY"}}
     ]}]}
  ]
}`

// serveFixture runs a decode function against a test server serving one
// canned body, exercising the adapter's real getJSON + decode path.
func serveFixture[T any](t *testing.T, body string, run func(c *espnClient, url string) (T, error)) T {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	out, err := run(&espnClient{http: srv.Client()}, srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func TestDecodeTeams(t *testing.T) {
	teams := serveFixture(t, teamsFixture, func(c *espnClient, url string) ([]team, error) {
		return c.decodeTeams(context.Background(), url)
	})
	if len(teams) != 2 {
		t.Fatalf("teams = %d, want 2", len(teams))
	}
	ari := teams[0]
	if ari.ID != "29" || ari.Name != "Arizona Diamondbacks" || ari.Abbrev != "ARI" ||
		ari.Logo != "https://a.espncdn.com/i/teamlogos/mlb/500/ari.png" {
		t.Errorf("normalized team = %+v", ari)
	}
	if teams[1].Logo != "" {
		t.Errorf("missing logos should normalize to empty, got %q", teams[1].Logo)
	}
}

type scheduleResult struct {
	team  team
	games []game
}

func TestDecodeScheduleNormalizesPerspective(t *testing.T) {
	res := serveFixture(t, scheduleFixture, func(c *espnClient, url string) (scheduleResult, error) {
		tm, games, err := c.decodeSchedule(context.Background(), url, "2")
		return scheduleResult{team: tm, games: games}, err
	})
	games := res.games
	if len(games) != 2 {
		t.Fatalf("games = %d, want 2", len(games))
	}

	if res.team.Name != "Boston Red Sox" || res.team.Record != "52-39" ||
		res.team.Logo != "https://a.espncdn.com/i/teamlogos/mlb/500/bos.png" {
		t.Errorf("schedule team = %+v (singular logo + recordSummary shape)", res.team)
	}

	final := games[0]
	if final.ID != "401814689" || final.Status != statusFinal || final.Detail != "Final" {
		t.Errorf("final game = %+v", final)
	}
	if final.Home {
		t.Error("BOS was the away team")
	}
	if final.Opponent.Abbrev != "CIN" {
		t.Errorf("opponent = %+v", final.Opponent)
	}
	if final.TeamScore == nil || *final.TeamScore != 3 || final.OppScore == nil || *final.OppScore != 0 {
		t.Errorf("scores = %v/%v, want 3/0", final.TeamScore, final.OppScore)
	}
	if final.Broadcast != "NESN" {
		t.Errorf("broadcast = %q", final.Broadcast)
	}
	want := time.Date(2026, 3, 26, 20, 10, 0, 0, time.UTC)
	if !final.Start.Equal(want) {
		t.Errorf("start = %v, want %v (minute-precision ESPN timestamp)", final.Start, want)
	}

	upcoming := games[1]
	if upcoming.Status != statusScheduled || !upcoming.Home || upcoming.Opponent.Abbrev != "TB" {
		t.Errorf("upcoming game = %+v", upcoming)
	}
	if upcoming.TeamScore != nil || upcoming.OppScore != nil {
		t.Errorf("future game must have nil scores, got %v/%v", upcoming.TeamScore, upcoming.OppScore)
	}
}

func TestDecodeScheduleSkipsEventsWithoutTrackedTeam(t *testing.T) {
	res := serveFixture(t, scheduleFixture, func(c *espnClient, url string) (scheduleResult, error) {
		tm, games, err := c.decodeSchedule(context.Background(), url, "999")
		return scheduleResult{team: tm, games: games}, err
	})
	if len(res.games) != 0 {
		t.Errorf("games = %d, want 0 when the tracked team is in no event", len(res.games))
	}
}

func TestDecodeScoreboard(t *testing.T) {
	events := serveFixture(t, scoreboardFixture, func(c *espnClient, url string) ([]liveEvent, error) {
		return c.decodeScoreboard(context.Background(), url)
	})
	if len(events) != 1 {
		t.Fatalf("events = %d, want 1", len(events))
	}
	ev := events[0]
	if ev.ID != "401816130" || ev.Status != statusLive || ev.Detail != "Top 5th" {
		t.Errorf("event = %+v", ev)
	}
	if s := ev.Scores["23"]; s == nil || *s != 14 {
		t.Errorf("home score = %v, want 14 (string-encoded score)", s)
	}
	if s := ev.Scores["8"]; s == nil || *s != 5 {
		t.Errorf("away score = %v, want 5", s)
	}
}

func TestEspnScoreForms(t *testing.T) {
	cases := []struct {
		in   string
		want *int
	}{
		{`null`, nil},
		{`""`, nil},
		{`"14"`, intp(14)},
		{`{"value": 3.0, "displayValue": "3"}`, intp(3)},
		{`{"value": null}`, nil},
		{`"PPD"`, nil}, // postponed placeholder — absent, not an error
	}
	for _, c := range cases {
		var s espnScore
		if err := json.Unmarshal([]byte(c.in), &s); err != nil {
			t.Errorf("unmarshal %s: %v", c.in, err)
			continue
		}
		switch {
		case c.want == nil && s.val != nil:
			t.Errorf("%s → %d, want nil", c.in, *s.val)
		case c.want != nil && (s.val == nil || *s.val != *c.want):
			t.Errorf("%s → %v, want %d", c.in, s.val, *c.want)
		}
	}
}

func TestStatusFromState(t *testing.T) {
	cases := map[string]gameStatus{
		"pre": statusScheduled, "in": statusLive, "post": statusFinal,
		"unknown": statusScheduled,
	}
	for state, want := range cases {
		if got := statusFromState(state); got != want {
			t.Errorf("statusFromState(%q) = %q, want %q", state, got, want)
		}
	}
}

func intp(n int) *int { return &n }
