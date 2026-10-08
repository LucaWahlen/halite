package web

import (
	"bytes"
	"embed"
	"html"
	"io/fs"
	"net/http"
	"path"
	"regexp"
	"strings"
)

//go:embed all:dist
var distFS embed.FS

// Meta describes the OpenGraph/Twitter metadata injected into the SPA shell so
// link previews render server-side (crawlers do not execute JavaScript).
type Meta struct {
	Title       string
	Description string
	Image       string
	URL         string
	Type        string
	SiteName    string
}

// Resolver returns the metadata for a request. ok=false falls back to defaults.
type Resolver func(r *http.Request) (Meta, bool)

var titleRe = regexp.MustCompile(`(?s)<title>.*?</title>`)

func Handler(resolve Resolver) (http.Handler, error) {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		return nil, err
	}
	index, err := fs.ReadFile(sub, "index.html")
	if err != nil {
		return nil, err
	}
	fileServer := http.FileServerFS(sub)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if name == "" || name == "." {
			name = "index.html"
		}
		if name != "index.html" {
			if _, err := fs.Stat(sub, name); err == nil {
				if strings.HasPrefix(name, "assets/") {
					w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
				}
				fileServer.ServeHTTP(w, r)
				return
			}
			// Missing static files (anything with a file extension) must 404
			// instead of being answered with the SPA shell, otherwise the
			// browser receives HTML for e.g. /favicon.svg.
			if path.Ext(name) != "" {
				http.NotFound(w, r)
				return
			}
		}
		// SPA route (including the root): serve the shell with metadata injected
		// so link previews work for crawlers that do not run JavaScript.
		meta := Meta{}
		if resolve != nil {
			if resolved, ok := resolve(r); ok {
				meta = resolved
			}
		}
		page := injectMeta(index, meta)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(page)
	}), nil
}

func injectMeta(index []byte, m Meta) []byte {
	title := m.Title
	if title == "" {
		title = m.SiteName
	}
	if title == "" {
		title = "halite"
	}
	site := m.SiteName
	if site == "" {
		site = "halite"
	}
	typ := m.Type
	if typ == "" {
		typ = "website"
	}

	var b strings.Builder
	write := func(attr, key, content string) {
		if content == "" {
			return
		}
		b.WriteString("<meta ")
		b.WriteString(attr)
		b.WriteString(`="`)
		b.WriteString(html.EscapeString(key))
		b.WriteString(`" content="`)
		b.WriteString(html.EscapeString(content))
		b.WriteString(`">`)
	}
	write("property", "og:site_name", site)
	write("property", "og:title", title)
	write("property", "og:description", m.Description)
	write("property", "og:type", typ)
	write("property", "og:url", m.URL)
	write("property", "og:image", m.Image)
	if m.Image != "" {
		write("name", "twitter:card", "summary_large_image")
	} else {
		write("name", "twitter:card", "summary")
	}
	write("name", "twitter:title", title)
	write("name", "twitter:description", m.Description)
	write("name", "twitter:image", m.Image)
	write("name", "description", m.Description)

	out := bytes.Replace(index, []byte("</head>"), []byte(b.String()+"</head>"), 1)
	out = titleRe.ReplaceAll(out, []byte("<title>"+html.EscapeString(title)+"</title>"))
	return out
}
