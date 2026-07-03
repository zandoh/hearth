package calendar

import (
	"context"
	"io"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"
)

type staticTransport struct {
	status int
	body   string
}

func (t staticTransport) RoundTrip(*http.Request) (*http.Response, error) {
	return &http.Response{
		StatusCode: t.status,
		Status:     strconv.Itoa(t.status),
		Body:       io.NopCloser(strings.NewReader(t.body)),
		Header:     http.Header{},
	}, nil
}

func testClient(status int, body string) *googleClient {
	return &googleClient{
		clientID:     "id",
		clientSecret: "secret",
		http:         &http.Client{Transport: staticTransport{status: status, body: body}},
		loadToken: func() (googleToken, error) {
			return googleToken{AccessToken: "t", RefreshToken: "r", Expiry: time.Now().Add(time.Hour)}, nil
		},
		saveToken: func(googleToken) error { return nil },
	}
}

// Regression: an interrupted delete that had in fact succeeded on Google
// left the local event undeletable — every retry got 410 Gone and was
// treated as failure. Gone IS the goal state of a delete.
func TestDeleteEventTreatsGoneAsSuccess(t *testing.T) {
	for _, status := range []int{http.StatusGone, http.StatusNotFound} {
		g := testClient(status, `{"error":{"message":"Resource has been deleted"}}`)
		if err := g.deleteEvent(context.Background(), "cal", "ev"); err != nil {
			t.Fatalf("%d should read as already-deleted, got %v", status, err)
		}
	}
}

func TestDeleteEventStillFailsOnRealErrors(t *testing.T) {
	g := testClient(http.StatusForbidden, `{}`)
	if err := g.deleteEvent(context.Background(), "cal", "ev"); err == nil {
		t.Fatal("403 must remain an error")
	}
}
