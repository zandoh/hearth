package sports

// ESPN site API adapter, standard library only. The endpoints are ESPN's
// public keyless JSON API (the one espn.com itself uses): team lists, a
// team's season schedule, and the league scoreboard for live detail. The
// responses are huge and league-shaped, so this adapter normalizes them to
// the compact structs the widget caches and serves; raw ESPN JSON never
// leaves this file.

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"
)

const espnBase = "https://site.api.espn.com/apis/site/v2/sports"

// leaguePath maps a league slug to ESPN's sport/league URL segment and
// doubles as the allowlist for the ?league= query parameter.
var leaguePath = map[string]string{
	"nfl": "football/nfl",
	"nhl": "hockey/nhl",
	"mlb": "baseball/mlb",
	"nba": "basketball/nba",
}

// sportsAPI is the seam between the widget and ESPN. espnClient is the
// production adapter; tests substitute a fake.
type sportsAPI interface {
	teams(ctx context.Context, league string) ([]team, error)
	schedule(ctx context.Context, league, teamID string) (team, []game, error)
	scoreboard(ctx context.Context, league string) ([]liveEvent, error)
}

type team struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Abbrev string `json:"abbrev"`
	Logo   string `json:"logo,omitempty"`
	Record string `json:"record,omitempty"` // "52-39", schedule endpoint only
}

type gameStatus string

const (
	statusScheduled gameStatus = "scheduled" // ESPN state "pre"
	statusLive      gameStatus = "live"      // ESPN state "in"
	statusFinal     gameStatus = "final"     // ESPN state "post"
)

// game is one schedule entry seen from the tracked team's perspective.
type game struct {
	ID        string     `json:"id"`
	Start     time.Time  `json:"start"` // UTC; the frontend renders local time
	Status    gameStatus `json:"status"`
	Home      bool       `json:"home"`
	Opponent  team       `json:"opponent"`
	TeamScore *int       `json:"teamScore,omitempty"`
	OppScore  *int       `json:"oppScore,omitempty"`
	// Detail is ESPN's human status line ("Q3 8:42", "Top 5th", "Final/OT",
	// "7/17 - 1:35 PM EDT") — already league-aware, so the frontend never is.
	Detail    string `json:"detail,omitempty"`
	Broadcast string `json:"broadcast,omitempty"`
}

// liveEvent is one scoreboard entry, league-wide and perspective-free; the
// widget resolves "us vs them" when it overlays these onto a team's games.
type liveEvent struct {
	ID     string
	Status gameStatus
	Detail string
	Scores map[string]*int // team ID → score
}

// espnScore tolerates ESPN's two score encodings: the schedule endpoint
// sends {value, displayValue} objects (null before a game starts), the
// scoreboard sends plain strings.
type espnScore struct {
	val *int
}

func (s *espnScore) UnmarshalJSON(b []byte) error {
	s.val = nil
	if string(b) == "null" {
		return nil
	}
	if b[0] == '"' {
		var str string
		if err := json.Unmarshal(b, &str); err != nil {
			return err
		}
		if str == "" {
			return nil
		}
		n, err := strconv.Atoi(str)
		if err != nil {
			return nil // non-numeric display score; treat as absent
		}
		s.val = &n
		return nil
	}
	var obj struct {
		Value *float64 `json:"value"`
	}
	if err := json.Unmarshal(b, &obj); err != nil {
		return err
	}
	if obj.Value != nil {
		n := int(*obj.Value)
		s.val = &n
	}
	return nil
}

// parseESPNTime handles ESPN's minute-precision timestamps
// ("2026-03-26T20:10Z"), which RFC 3339 rejects for the missing seconds.
func parseESPNTime(s string) (time.Time, error) {
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t, nil
	}
	return time.Parse("2006-01-02T15:04Z07:00", s)
}

func statusFromState(state string) gameStatus {
	switch state {
	case "in":
		return statusLive
	case "post":
		return statusFinal
	default:
		return statusScheduled
	}
}

// Shared decode targets for the fields both endpoints nest the same way.
type espnStatus struct {
	Type struct {
		State       string `json:"state"`
		ShortDetail string `json:"shortDetail"`
	} `json:"type"`
}

type espnTeam struct {
	ID           string `json:"id"`
	DisplayName  string `json:"displayName"`
	Abbreviation string `json:"abbreviation"`
	// The teams and schedule-competitor shapes carry a logos array; the
	// schedule's top-level team carries a singular logo URL instead.
	Logos []struct {
		Href string `json:"href"`
	} `json:"logos"`
	Logo          string `json:"logo"`
	RecordSummary string `json:"recordSummary"`
}

func (t espnTeam) normalize() team {
	out := team{ID: t.ID, Name: t.DisplayName, Abbrev: t.Abbreviation, Logo: t.Logo, Record: t.RecordSummary}
	if len(t.Logos) > 0 {
		out.Logo = t.Logos[0].Href
	}
	return out
}

type espnClient struct {
	http *http.Client
}

func (c *espnClient) getJSON(ctx context.Context, url string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("%s: %s", url, res.Status)
	}
	return json.NewDecoder(res.Body).Decode(out)
}

func (c *espnClient) teams(ctx context.Context, league string) ([]team, error) {
	return c.decodeTeams(ctx, fmt.Sprintf("%s/%s/teams", espnBase, leaguePath[league]))
}

func (c *espnClient) decodeTeams(ctx context.Context, url string) ([]team, error) {
	var payload struct {
		Sports []struct {
			Leagues []struct {
				Teams []struct {
					Team espnTeam `json:"team"`
				} `json:"teams"`
			} `json:"leagues"`
		} `json:"sports"`
	}
	if err := c.getJSON(ctx, url, &payload); err != nil {
		return nil, err
	}
	if len(payload.Sports) == 0 || len(payload.Sports[0].Leagues) == 0 {
		return nil, fmt.Errorf("%s: unexpected teams response shape", url)
	}
	entries := payload.Sports[0].Leagues[0].Teams
	out := make([]team, 0, len(entries))
	for _, e := range entries {
		out = append(out, e.Team.normalize())
	}
	return out, nil
}

// schedule returns the team (with its record) and the team's season
// schedule (past and future events), normalized to that team's perspective.
func (c *espnClient) schedule(ctx context.Context, league, teamID string) (team, []game, error) {
	url := fmt.Sprintf("%s/%s/teams/%s/schedule", espnBase, leaguePath[league], teamID)
	return c.decodeSchedule(ctx, url, teamID)
}

func (c *espnClient) decodeSchedule(ctx context.Context, url, teamID string) (team, []game, error) {
	var payload struct {
		Team   espnTeam `json:"team"`
		Events []struct {
			ID           string `json:"id"`
			Date         string `json:"date"`
			Competitions []struct {
				Date        string     `json:"date"`
				Status      espnStatus `json:"status"`
				Competitors []struct {
					HomeAway string    `json:"homeAway"`
					Score    espnScore `json:"score"`
					Team     espnTeam  `json:"team"`
				} `json:"competitors"`
				Broadcasts []struct {
					Media struct {
						ShortName string `json:"shortName"`
					} `json:"media"`
				} `json:"broadcasts"`
			} `json:"competitions"`
		} `json:"events"`
	}
	if err := c.getJSON(ctx, url, &payload); err != nil {
		return team{}, nil, err
	}

	out := make([]game, 0, len(payload.Events))
	for _, ev := range payload.Events {
		if len(ev.Competitions) == 0 {
			continue
		}
		comp := ev.Competitions[0]
		start, err := parseESPNTime(ev.Date)
		if err != nil {
			continue // an unparseable event is dropped, not fatal
		}
		g := game{
			ID:     ev.ID,
			Start:  start,
			Status: statusFromState(comp.Status.Type.State),
			Detail: comp.Status.Type.ShortDetail,
		}
		if len(comp.Broadcasts) > 0 {
			g.Broadcast = comp.Broadcasts[0].Media.ShortName
		}
		found := false
		for _, competitor := range comp.Competitors {
			if competitor.Team.ID == teamID {
				g.Home = competitor.HomeAway == "home"
				g.TeamScore = competitor.Score.val
				found = true
			} else {
				g.Opponent = competitor.Team.normalize()
				g.OppScore = competitor.Score.val
			}
		}
		if !found {
			continue // e.g. an all-star exhibition without the team's ID
		}
		out = append(out, g)
	}
	return payload.Team.normalize(), out, nil
}

// scoreboard returns today's league-wide events; fresher than the schedule
// while games are in progress (running clock, period, live scores).
func (c *espnClient) scoreboard(ctx context.Context, league string) ([]liveEvent, error) {
	return c.decodeScoreboard(ctx, fmt.Sprintf("%s/%s/scoreboard", espnBase, leaguePath[league]))
}

func (c *espnClient) decodeScoreboard(ctx context.Context, url string) ([]liveEvent, error) {
	var payload struct {
		Events []struct {
			ID           string     `json:"id"`
			Status       espnStatus `json:"status"`
			Competitions []struct {
				Competitors []struct {
					Score espnScore `json:"score"`
					Team  espnTeam  `json:"team"`
				} `json:"competitors"`
			} `json:"competitions"`
		} `json:"events"`
	}
	if err := c.getJSON(ctx, url, &payload); err != nil {
		return nil, err
	}

	out := make([]liveEvent, 0, len(payload.Events))
	for _, ev := range payload.Events {
		if len(ev.Competitions) == 0 {
			continue
		}
		le := liveEvent{
			ID:     ev.ID,
			Status: statusFromState(ev.Status.Type.State),
			Detail: ev.Status.Type.ShortDetail,
			Scores: map[string]*int{},
		}
		for _, competitor := range ev.Competitions[0].Competitors {
			le.Scores[competitor.Team.ID] = competitor.Score.val
		}
		out = append(out, le)
	}
	return out, nil
}
