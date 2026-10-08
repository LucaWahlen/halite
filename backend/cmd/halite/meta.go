package main

import (
	"net/http"
	"strings"
	"unicode/utf8"

	"halite/internal/domain"
	"halite/internal/service"
	"halite/web"
)

const (
	defaultTitle       = "halite · Rezepte"
	defaultDescription = "Eine kleine, feine Rezeptsammlung zum Nachkochen."
	maxDescription     = 200
)

// metaResolver builds OpenGraph metadata for SPA routes so shared links show a
// meaningful preview. Recipe pages get the recipe title, description and image;
// every other route falls back to the site defaults.
func metaResolver(recipes *service.RecipeService) web.Resolver {
	return func(r *http.Request) (web.Meta, bool) {
		base := requestBaseURL(r)
		meta := web.Meta{
			Title:       defaultTitle,
			Description: defaultDescription,
			URL:         base + r.URL.Path,
			Type:        "website",
			SiteName:    "halite",
		}

		id, ok := recipeIDFromPath(r.URL.Path)
		if !ok {
			return meta, true
		}
		rec, err := recipes.Get(r.Context(), id)
		if err != nil {
			return meta, true
		}
		meta.Type = "article"
		meta.Title = rec.Title + " · halite"
		desc := strings.TrimSpace(rec.Description)
		if desc == "" {
			desc = ingredientSummary(rec)
		}
		if desc == "" {
			desc = defaultDescription
		}
		meta.Description = truncateRunes(desc, maxDescription)
		if rec.HasImage() {
			meta.Image = base + "/api/v1/recipes/" + rec.ID + "/image"
		}
		return meta, true
	}
}

func requestBaseURL(r *http.Request) string {
	scheme := "https"
	if r.TLS == nil {
		if p := r.Header.Get("X-Forwarded-Proto"); p != "" {
			scheme = p
		} else {
			scheme = "http"
		}
	}
	host := r.Host
	return scheme + "://" + host
}

func recipeIDFromPath(p string) (string, bool) {
	const prefix = "/rezept/"
	if !strings.HasPrefix(p, prefix) {
		return "", false
	}
	id := strings.TrimSuffix(strings.TrimPrefix(p, prefix), "/")
	if !domain.ValidID(id) {
		return "", false
	}
	return id, true
}

func ingredientSummary(rec domain.Recipe) string {
	names := make([]string, 0, 8)
	for _, ing := range rec.Ingredients {
		if ing.Name == "" {
			continue
		}
		names = append(names, ing.Name)
		if len(names) == 8 {
			break
		}
	}
	if len(names) == 0 {
		return ""
	}
	return "Mit " + strings.Join(names, ", ") + "."
}

func truncateRunes(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	runes := []rune(s)
	return string(runes[:n-1]) + "…"
}
