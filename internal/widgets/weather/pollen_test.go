package weather

import "testing"

func fp(v float64) *float64 { return &v }

func TestGroupPollenTakesWorstSpeciesPerCategory(t *testing.T) {
	p := groupPollen(
		[]*float64{fp(3), fp(90), nil}, // alder, birch, olive
		[]*float64{fp(12)},
		[]*float64{nil, fp(55)},
	)
	if p == nil || *p.Tree != 90 || *p.Grass != 12 || *p.Weed != 55 {
		t.Errorf("groupPollen = %+v, want tree 90, grass 12, weed 55", p)
	}
}

func TestGroupPollenAllNullCollapsesToNil(t *testing.T) {
	if p := groupPollen([]*float64{nil, nil, nil}, []*float64{nil}, []*float64{nil, nil}); p != nil {
		t.Errorf("groupPollen = %+v, want nil outside pollen coverage", p)
	}
}

func TestGroupPollenPartialCoverageKeepsNilCategories(t *testing.T) {
	p := groupPollen([]*float64{nil, nil, nil}, []*float64{fp(0)}, []*float64{nil, nil})
	if p == nil || p.Tree != nil || p.Grass == nil || *p.Grass != 0 || p.Weed != nil {
		t.Errorf("groupPollen = %+v, want only grass populated (zero is data)", p)
	}
}
