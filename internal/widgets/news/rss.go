package news

// Google News RSS adapter, standard library only: one keyless GET per
// topic, parsed with encoding/xml.

import (
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	feedBase     = "https://news.google.com/rss"
	feedParams   = "hl=en-US&gl=US&ceid=US:en"
	maxHeadlines = 12
)

// sections maps a widget topic to its Google News section; "top" is the
// front page, which has no section path.
var sections = map[string]string{
	"top":           "",
	"world":         "WORLD",
	"nation":        "NATION",
	"business":      "BUSINESS",
	"technology":    "TECHNOLOGY",
	"entertainment": "ENTERTAINMENT",
	"science":       "SCIENCE",
	"sports":        "SPORTS",
	"health":        "HEALTH",
}

type headline struct {
	Title       string    `json:"title"`
	Source      string    `json:"source"`
	PublishedAt time.Time `json:"publishedAt"`
}

// feedAPI is the seam between the widget and Google News. googleNewsClient
// is the production adapter; tests substitute a fake.
type feedAPI interface {
	headlines(ctx context.Context, topic string) ([]headline, error)
}

type googleNewsClient struct {
	http *http.Client
}

func feedURL(topic string) string {
	if s := sections[topic]; s != "" {
		return feedBase + "/headlines/section/topic/" + s + "?" + feedParams
	}
	return feedBase + "?" + feedParams
}

func (c *googleNewsClient) headlines(ctx context.Context, topic string) ([]headline, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, feedURL(topic), nil)
	if err != nil {
		return nil, err
	}
	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("google news %s: %s", topic, res.Status)
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return nil, err
	}
	return parseFeed(body)
}

// parseFeed extracts headlines from a Google News RSS document. Item titles
// arrive as "Headline - Source"; the trailing source is stripped when it
// matches the item's <source> element so the card doesn't say it twice.
func parseFeed(body []byte) ([]headline, error) {
	var doc struct {
		Items []struct {
			Title   string `xml:"title"`
			PubDate string `xml:"pubDate"`
			Source  string `xml:"source"`
		} `xml:"channel>item"`
	}
	if err := xml.Unmarshal(body, &doc); err != nil {
		return nil, fmt.Errorf("parsing feed: %w", err)
	}
	out := make([]headline, 0, min(len(doc.Items), maxHeadlines))
	for _, it := range doc.Items {
		if len(out) == maxHeadlines {
			break
		}
		title := strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(it.Title), " - "+it.Source))
		if title == "" {
			continue
		}
		h := headline{Title: title, Source: strings.TrimSpace(it.Source)}
		for _, layout := range []string{time.RFC1123, time.RFC1123Z} {
			if t, err := time.Parse(layout, it.PubDate); err == nil {
				h.PublishedAt = t
				break
			}
		}
		out = append(out, h)
	}
	return out, nil
}
