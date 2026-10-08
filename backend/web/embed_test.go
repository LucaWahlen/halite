package web

import (
	"strings"
	"testing"
)

func TestInjectMeta(t *testing.T) {
	index := []byte("<html><head><title>halite</title></head><body></body></html>")
	out := string(injectMeta(index, Meta{
		Title:       "Kürbissuppe – halite",
		Description: "Cremig",
		Image:       "https://example.com/api/v1/recipes/x/image",
		URL:         "https://example.com/rezept/x",
		Type:        "article",
		SiteName:    "halite",
	}))
	for _, want := range []string{
		`<title>Kürbissuppe – halite</title>`,
		`property="og:title" content="Kürbissuppe – halite"`,
		`property="og:image" content="https://example.com/api/v1/recipes/x/image"`,
		`property="og:type" content="article"`,
		`name="twitter:card" content="summary_large_image"`,
		`name="description" content="Cremig"`,
	} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in output:\n%s", want, out)
		}
	}
	if strings.Count(out, "<title>") != 1 {
		t.Errorf("expected exactly one title tag, got:\n%s", out)
	}
}

func TestInjectMetaEscapesAndDefaults(t *testing.T) {
	out := string(injectMeta([]byte("<head><title>x</title></head>"), Meta{
		Title:       `a "b" <c>`,
		Description: "&",
	}))
	if !strings.Contains(out, `content="a &#34;b&#34; &lt;c&gt;"`) {
		t.Errorf("title not escaped:\n%s", out)
	}
	if !strings.Contains(out, `name="twitter:card" content="summary"`) {
		t.Errorf("expected small twitter card without image:\n%s", out)
	}
}
