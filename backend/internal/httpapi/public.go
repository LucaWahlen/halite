package httpapi

import (
	"net/http"
	"os"
	"strconv"
	"strings"

	"halite/internal/domain"
	"halite/internal/storage"
)

const (
	rfc3339               = "2006-01-02T15:04:05Z07:00"
	defaultRecipePageSize = 12
	maxRecipePageSize     = 100
)

var validRecipeSorts = map[string]struct{}{
	"newest":     {},
	"oldest":     {},
	"title":      {},
	"title_desc": {},
	"updated":    {},
	"quickest":   {},
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	view, err := s.deps.Settings.Get(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, settingsDTO{ImprintText: view.ImprintText, PrivacyText: view.PrivacyText})
}

func parseRecipeListQuery(r *http.Request) (domain.RecipeListQuery, error) {
	query := r.URL.Query()
	q := domain.RecipeListQuery{
		Search:   strings.TrimSpace(query.Get("q")),
		Tag:      strings.TrimSpace(query.Get("tag")),
		Sort:     query.Get("sort"),
		Page:     1,
		PageSize: defaultRecipePageSize,
	}
	if q.Sort == "" {
		q.Sort = "newest"
	}
	if _, ok := validRecipeSorts[q.Sort]; !ok {
		return q, domain.NewError(domain.KindInvalid, "invalid sort value")
	}
	if v := query.Get("page"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			return q, domain.NewError(domain.KindInvalid, "page must be a positive integer")
		}
		q.Page = n
	}
	if v := query.Get("page_size"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > maxRecipePageSize {
			return q, domain.Errorf(domain.KindInvalid, "page_size must be between 1 and %d", maxRecipePageSize)
		}
		q.PageSize = n
	}
	return q, nil
}

func (s *Server) handleListRecipes(w http.ResponseWriter, r *http.Request) {
	q, err := parseRecipeListQuery(r)
	if err != nil {
		writeError(w, err)
		return
	}
	page, err := s.deps.Recipes.List(r.Context(), q)
	if err != nil {
		writeError(w, err)
		return
	}
	items := make([]recipeSummaryDTO, 0, len(page.Items))
	for _, it := range page.Items {
		items = append(items, toRecipeSummary(it))
	}
	writeJSON(w, http.StatusOK, recipePageDTO{
		Items:    items,
		Total:    page.Total,
		Page:     q.Page,
		PageSize: q.PageSize,
	})
}

func (s *Server) handleListTags(w http.ResponseWriter, r *http.Request) {
	tags, err := s.deps.Recipes.Tags(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string][]string{"tags": tags})
}

func (s *Server) handleGetRecipe(w http.ResponseWriter, r *http.Request) {
	id, err := pathUUID(r, "id")
	if err != nil {
		writeError(w, err)
		return
	}
	rec, err := s.deps.Recipes.Get(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toRecipeDTO(rec))
}

func (s *Server) handleRecipeImage(w http.ResponseWriter, r *http.Request) {
	id, err := pathUUID(r, "id")
	if err != nil {
		writeError(w, err)
		return
	}
	rec, err := s.deps.Recipes.Get(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	if rec.ImageExt == "" {
		writeError(w, domain.ErrNotFound("image"))
		return
	}
	f, err := s.deps.Images.Open(rec.ID, rec.ImageExt)
	if err != nil {
		if os.IsNotExist(err) {
			writeError(w, domain.ErrNotFound("image"))
			return
		}
		writeError(w, errInternal)
		return
	}
	defer f.Close()

	w.Header().Set("Content-Type", storage.ContentType(rec.ImageExt))
	w.Header().Set("Cache-Control", "public, max-age=3600")
	http.ServeContent(w, r, rec.ID+"."+rec.ImageExt, rec.UpdatedAt, f)
}
