package calendar

// Google OAuth2 + Calendar API client, standard library only.
//
// OAuth here is just three HTTP exchanges:
//  1. Send the user to Google's consent page (authURL).
//  2. Google redirects back with a one-time code; POST it to the token
//     endpoint to get an access token + long-lived refresh token (exchange).
//  3. When the access token expires (~1h), POST the refresh token to get a
//     new one (refresh).

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const (
	googleAuthEndpoint  = "https://accounts.google.com/o/oauth2/v2/auth"
	googleTokenEndpoint = "https://oauth2.googleapis.com/token"
	googleCalendarAPI   = "https://www.googleapis.com/calendar/v3"

	// calendar.readonly lets us list the account's calendars; calendar.events
	// lets us read and write events on them.
	oauthScopes = "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events"
)

var errNotConnected = errors.New("google: not connected")

type googleClient struct {
	clientID     string
	clientSecret string
	redirectURL  string
	http         *http.Client

	mu sync.Mutex // guards token refresh

	// loadToken/saveToken persist the token via the store's settings table.
	loadToken func() (googleToken, error)
	saveToken func(googleToken) error
}

type googleToken struct {
	AccessToken  string    `json:"accessToken"`
	RefreshToken string    `json:"refreshToken"`
	Expiry       time.Time `json:"expiry"`
	Email        string    `json:"email"`
}

func (g *googleClient) configured() bool {
	return g.clientID != "" && g.clientSecret != ""
}

func (g *googleClient) authURL(state string) string {
	q := url.Values{
		"client_id":     {g.clientID},
		"redirect_uri":  {g.redirectURL},
		"response_type": {"code"},
		"scope":         {oauthScopes},
		"access_type":   {"offline"}, // ask for a refresh token
		"prompt":        {"consent"}, // re-issue refresh token on reconnect
		"state":         {state},
	}
	return googleAuthEndpoint + "?" + q.Encode()
}

type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	IDToken      string `json:"id_token"`
}

func (g *googleClient) postToken(ctx context.Context, form url.Values) (tokenResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		googleTokenEndpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return tokenResponse{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := g.http.Do(req)
	if err != nil {
		return tokenResponse{}, err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return tokenResponse{}, err
	}
	if res.StatusCode != http.StatusOK {
		return tokenResponse{}, fmt.Errorf("google token endpoint: %s: %s", res.Status, body)
	}
	var tr tokenResponse
	if err := json.Unmarshal(body, &tr); err != nil {
		return tokenResponse{}, err
	}
	return tr, nil
}

// exchange trades the consent code for tokens and persists them.
func (g *googleClient) exchange(ctx context.Context, code string) error {
	tr, err := g.postToken(ctx, url.Values{
		"client_id":     {g.clientID},
		"client_secret": {g.clientSecret},
		"code":          {code},
		"grant_type":    {"authorization_code"},
		"redirect_uri":  {g.redirectURL},
	})
	if err != nil {
		return err
	}
	tok := googleToken{
		AccessToken:  tr.AccessToken,
		RefreshToken: tr.RefreshToken,
		Expiry:       time.Now().Add(time.Duration(tr.ExpiresIn) * time.Second),
		Email:        emailFromIDToken(tr.IDToken),
	}
	return g.saveToken(tok)
}

// emailFromIDToken pulls the email claim out of a JWT without verifying the
// signature — fine here because the token came straight from Google over TLS
// and is used only as a display label.
func emailFromIDToken(idToken string) string {
	parts := strings.Split(idToken, ".")
	if len(parts) != 3 {
		return ""
	}
	payload, err := base64URLDecode(parts[1])
	if err != nil {
		return ""
	}
	var claims struct {
		Email string `json:"email"`
	}
	if json.Unmarshal(payload, &claims) != nil {
		return ""
	}
	return claims.Email
}

// accessToken returns a valid access token, refreshing it if expired.
func (g *googleClient) accessToken(ctx context.Context) (string, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	tok, err := g.loadToken()
	if err != nil {
		return "", errNotConnected
	}
	if time.Until(tok.Expiry) > time.Minute {
		return tok.AccessToken, nil
	}
	tr, err := g.postToken(ctx, url.Values{
		"client_id":     {g.clientID},
		"client_secret": {g.clientSecret},
		"refresh_token": {tok.RefreshToken},
		"grant_type":    {"refresh_token"},
	})
	if err != nil {
		return "", fmt.Errorf("refresh access token: %w", err)
	}
	tok.AccessToken = tr.AccessToken
	tok.Expiry = time.Now().Add(time.Duration(tr.ExpiresIn) * time.Second)
	if err := g.saveToken(tok); err != nil {
		return "", err
	}
	return tok.AccessToken, nil
}

// apiCall performs an authenticated Calendar API request. out may be nil for
// calls whose response body doesn't matter (e.g. DELETE).
func (g *googleClient) apiCall(ctx context.Context, method, path string, query url.Values, body, out any) error {
	token, err := g.accessToken(ctx)
	if err != nil {
		return err
	}
	u := googleCalendarAPI + path
	if len(query) > 0 {
		u += "?" + query.Encode()
	}
	var reader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = strings.NewReader(string(b))
	}
	req, err := http.NewRequestWithContext(ctx, method, u, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := g.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	resBody, err := io.ReadAll(io.LimitReader(res.Body, 8<<20))
	if err != nil {
		return err
	}
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return fmt.Errorf("google api %s %s: %s: %s", method, path, res.Status, resBody)
	}
	if out == nil {
		return nil
	}
	return json.Unmarshal(resBody, out)
}

// --- Calendar API types (only the fields we use) ---

type gcalCalendar struct {
	ID      string `json:"id"`
	Summary string `json:"summary"`
	Color   string `json:"backgroundColor"`
	Primary bool   `json:"primary"`
}

type gcalTime struct {
	Date     string `json:"date,omitempty"`     // "2026-07-04" for all-day
	DateTime string `json:"dateTime,omitempty"` // RFC3339 for timed
	TimeZone string `json:"timeZone,omitempty"`
}

type gcalEvent struct {
	ID          string   `json:"id,omitempty"`
	Status      string   `json:"status,omitempty"`
	Summary     string   `json:"summary,omitempty"`
	Location    string   `json:"location,omitempty"`
	Description string   `json:"description,omitempty"`
	Start       gcalTime `json:"start"`
	End         gcalTime `json:"end"`
}

func (g *googleClient) listCalendars(ctx context.Context) ([]gcalCalendar, error) {
	var all []gcalCalendar
	pageToken := ""
	for {
		q := url.Values{"maxResults": {"250"}}
		if pageToken != "" {
			q.Set("pageToken", pageToken)
		}
		var page struct {
			Items         []gcalCalendar `json:"items"`
			NextPageToken string         `json:"nextPageToken"`
		}
		if err := g.apiCall(ctx, http.MethodGet, "/users/me/calendarList", q, nil, &page); err != nil {
			return nil, err
		}
		all = append(all, page.Items...)
		if page.NextPageToken == "" {
			return all, nil
		}
		pageToken = page.NextPageToken
	}
}

// listEvents fetches all event instances in [timeMin, timeMax], with
// recurring events expanded to single instances by singleEvents=true.
func (g *googleClient) listEvents(ctx context.Context, calendarID string, timeMin, timeMax time.Time) ([]gcalEvent, error) {
	var all []gcalEvent
	pageToken := ""
	for {
		q := url.Values{
			"singleEvents": {"true"},
			"maxResults":   {"2500"},
			"timeMin":      {timeMin.Format(time.RFC3339)},
			"timeMax":      {timeMax.Format(time.RFC3339)},
		}
		if pageToken != "" {
			q.Set("pageToken", pageToken)
		}
		var page struct {
			Items         []gcalEvent `json:"items"`
			NextPageToken string      `json:"nextPageToken"`
		}
		path := "/calendars/" + url.PathEscape(calendarID) + "/events"
		if err := g.apiCall(ctx, http.MethodGet, path, q, nil, &page); err != nil {
			return nil, err
		}
		all = append(all, page.Items...)
		if page.NextPageToken == "" {
			return all, nil
		}
		pageToken = page.NextPageToken
	}
}

func (g *googleClient) insertEvent(ctx context.Context, calendarID string, ev gcalEvent) (gcalEvent, error) {
	var created gcalEvent
	path := "/calendars/" + url.PathEscape(calendarID) + "/events"
	err := g.apiCall(ctx, http.MethodPost, path, nil, ev, &created)
	return created, err
}

func (g *googleClient) updateEvent(ctx context.Context, calendarID, eventID string, ev gcalEvent) error {
	path := "/calendars/" + url.PathEscape(calendarID) + "/events/" + url.PathEscape(eventID)
	return g.apiCall(ctx, http.MethodPatch, path, nil, ev, nil)
}

func (g *googleClient) deleteEvent(ctx context.Context, calendarID, eventID string) error {
	path := "/calendars/" + url.PathEscape(calendarID) + "/events/" + url.PathEscape(eventID)
	return g.apiCall(ctx, http.MethodDelete, path, nil, nil, nil)
}
