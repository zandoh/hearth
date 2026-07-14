package news

// Parser tests use a captured-shape fixture; handler and refresh tests
// drive the widget through the feedAPI seam with a fake adapter.

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/zandoh/hearth/internal/sse"
)

const feedFixture = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Top stories - Google News</title>
    <item>
      <title>Quiet solar maximum surprises forecasters - The Example Times</title>
      <pubDate>Mon, 13 Jul 2026 12:04:00 GMT</pubDate>
      <source url="https://example.com">The Example Times</source>
    </item>
    <item>
      <title>Title with - a dash but no trailing source</title>
      <pubDate>Mon, 13 Jul 2026 11:00:00 +0000</pubDate>
      <source url="https://other.example">Other Wire</source>
    </item>
    <item>
      <title></title>
      <pubDate>bad date</pubDate>
      <source>Empty Item Gazette</source>
    </item>
  </channel>
</rss>`

func TestParseFeed(t *testing.T) {
	items, err := parseFeed([]byte(feedFixture))
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 2 {
		t.Fatalf("items = %d, want 2 (empty title skipped)", len(items))
	}
	if items[0].Title != "Quiet solar maximum surprises forecasters" {
		t.Errorf("title = %q, want the ' - Source' suffix stripped", items[0].Title)
	}
	if items[0].Source != "The Example Times" {
		t.Errorf("source = %q", items[0].Source)
	}
	if items[0].PublishedAt.IsZero() || items[0].PublishedAt.Hour() != 12 {
		t.Errorf("publishedAt = %v, want the RFC1123 pubDate parsed", items[0].PublishedAt)
	}
	if items[1].Title != "Title with - a dash but no trailing source" {
		t.Errorf("title = %q, want mid-title dashes untouched", items[1].Title)
	}
	if items[1].PublishedAt.IsZero() {
		t.Errorf("publishedAt zero, want the RFC1123Z pubDate parsed")
	}
}

func TestParseFeedCapsHeadlines(t *testing.T) {
	body := `<rss><channel>`
	for range maxHeadlines + 5 {
		body += `<item><title>H - S</title><source>S</source></item>`
	}
	body += `</channel></rss>`
	items, err := parseFeed([]byte(body))
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != maxHeadlines {
		t.Errorf("items = %d, want capped at %d", len(items), maxHeadlines)
	}
}

func TestFeedURL(t *testing.T) {
	if got := feedURL("top"); got != feedBase+"?"+feedParams {
		t.Errorf("top feed = %q, want the front page (no section)", got)
	}
	if got := feedURL("technology"); got != feedBase+"/headlines/section/topic/TECHNOLOGY?"+feedParams {
		t.Errorf("technology feed = %q", got)
	}
}

type fakeFeed struct {
	mu    sync.Mutex
	items []headline
	err   error
	calls int
}

func (f *fakeFeed) headlines(ctx context.Context, topic string) ([]headline, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	return f.items, f.err
}

func newTestWidget() (*Widget, *fakeFeed, *time.Time) {
	w := New(sse.NewHub())
	fake := &fakeFeed{items: []headline{{Title: "Headline", Source: "Wire"}}}
	w.api = fake
	now := time.Now()
	w.now = func() time.Time { return now }
	return w, fake, &now
}

func get(t *testing.T, w *Widget, path string) *httptest.ResponseRecorder {
	t.Helper()
	mux := http.NewServeMux()
	w.Routes(mux)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest("GET", path, nil))
	return rec
}

func TestHandleHeadlinesPendingThenServed(t *testing.T) {
	w, _, _ := newTestWidget()

	rec := get(t, w, "/api/widgets/news/headlines?topic=top")
	var res map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	if res["pending"] != true {
		t.Fatalf("first request = %v, want pending", res)
	}

	// The on-demand fetch is a goroutine; drive the fetch synchronously
	// instead of racing it.
	if err := w.fetchTopic(context.Background(), "top"); err != nil {
		t.Fatal(err)
	}
	rec = get(t, w, "/api/widgets/news/headlines?topic=top")
	var served struct {
		Headlines *topicHeadlines `json:"headlines"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &served); err != nil {
		t.Fatal(err)
	}
	if served.Headlines == nil || served.Headlines.Topic != "top" || len(served.Headlines.Items) != 1 {
		t.Errorf("served = %+v", served.Headlines)
	}
}

func TestHandleHeadlinesRejectsUnknownTopic(t *testing.T) {
	w, _, _ := newTestWidget()
	if rec := get(t, w, "/api/widgets/news/headlines?topic=gossip"); rec.Code != http.StatusBadRequest {
		t.Errorf("unknown topic: %d, want 400", rec.Code)
	}
	if rec := get(t, w, "/api/widgets/news/headlines"); rec.Code != http.StatusBadRequest {
		t.Errorf("missing topic: %d, want 400", rec.Code)
	}
}

func TestRefreshRefetchesStaleAndEvictsIdle(t *testing.T) {
	w, fake, now := newTestWidget()
	// Register the topic directly rather than via the handler: the handler's
	// on-demand fetch goroutine would race the call counting below.
	w.mu.Lock()
	w.cache["top"] = &entry{lastRequested: *now}
	w.mu.Unlock()
	if err := w.fetchTopic(context.Background(), "top"); err != nil {
		t.Fatal(err)
	}
	before := fake.calls

	// Fresh cache: a tick does nothing.
	if err := w.refresh(context.Background()); err != nil {
		t.Fatal(err)
	}
	if fake.calls != before {
		t.Errorf("refresh refetched a fresh topic (%d calls)", fake.calls)
	}

	// Stale but still requested: refetched, and a fetch error surfaces.
	*now = now.Add(refreshAfter + time.Minute)
	w.mu.Lock()
	w.cache["top"].lastRequested = *now
	w.mu.Unlock()
	fake.err = errors.New("feed down")
	if err := w.refresh(context.Background()); err == nil {
		t.Error("refresh should surface fetch errors")
	}

	// Idle past evictAfter: dropped without a fetch.
	*now = now.Add(evictAfter + time.Minute)
	if err := w.refresh(context.Background()); err != nil {
		t.Fatal(err)
	}
	w.mu.Lock()
	if len(w.cache) != 0 {
		t.Errorf("cache = %d entries, want idle topic evicted", len(w.cache))
	}
	w.mu.Unlock()
}
