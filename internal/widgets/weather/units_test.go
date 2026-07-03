package weather

import "testing"

func TestUnitsParams(t *testing.T) {
	cases := []struct{ in, temp, wind string }{
		{"imperial", "fahrenheit", "mph"},
		{"metric", "celsius", "kmh"},
		{"", "fahrenheit", "mph"},
		{"garbage", "fahrenheit", "mph"},
	}
	for _, c := range cases {
		temp, wind := unitsParams(c.in)
		if temp != c.temp || wind != c.wind {
			t.Errorf("unitsParams(%q) = %s/%s, want %s/%s", c.in, temp, wind, c.temp, c.wind)
		}
	}
}
