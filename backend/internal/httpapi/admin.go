package httpapi

import (
	"fmt"
	"io"
	"net/http"
	"time"

	"halite/internal/domain"
	"halite/internal/service"
	"halite/internal/storage"
)

const maxUploadBytes = 10 << 20 // 10 MiB

type recipeInputRequest struct {
	Title       string          `json:"title"`
	Description string          `json:"description"`
	Servings    int             `json:"servings"`
	PrepMinutes int             `json:"prep_minutes"`
	CookMinutes int             `json:"cook_minutes"`
	Ingredients []ingredientDTO `json:"ingredients"`
	Steps       []string        `json:"steps"`
	Tags        []string        `json:"tags"`
}

func (req recipeInputRequest) toInput() service.RecipeInput {
	ingredients := make([]domain.Ingredient, 0, len(req.Ingredients))
	for _, ing := range req.Ingredients {
		ingredients = append(ingredients, domain.Ingredient{
			Amount: ing.Amount,
			Unit:   ing.Unit,
			Name:   ing.Name,
		})
	}
	return service.RecipeInput{
		Title:       req.Title,
		Description: req.Description,
		Servings:    req.Servings,
		PrepMinutes: req.PrepMinutes,
		CookMinutes: req.CookMinutes,
		Ingredients: ingredients,
		Steps:       req.Steps,
		Tags:        req.Tags,
	}
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Password string `json:"password"`
	}
	if err := readJSON(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	value, expiry, err := s.deps.Auth.Login(req.Password)
	if err != nil {
		writeError(w, err)
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   r.TLS != nil,
		Expires:  expiry,
	})
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleSession(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]bool{"authenticated": true})
}

func (s *Server) handleGetAdminSettings(w http.ResponseWriter, r *http.Request) {
	view, err := s.deps.Settings.Get(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, settingsDTO{ImprintText: view.ImprintText, PrivacyText: view.PrivacyText})
}

func (s *Server) handlePutAdminSettings(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ImprintText *string `json:"imprint_text"`
		PrivacyText *string `json:"privacy_text"`
	}
	if err := readJSON(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	if req.ImprintText != nil {
		if err := s.deps.Settings.SetImprintText(r.Context(), *req.ImprintText); err != nil {
			writeError(w, err)
			return
		}
	}
	if req.PrivacyText != nil {
		if err := s.deps.Settings.SetPrivacyText(r.Context(), *req.PrivacyText); err != nil {
			writeError(w, err)
			return
		}
	}
	view, err := s.deps.Settings.Get(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, settingsDTO{ImprintText: view.ImprintText, PrivacyText: view.PrivacyText})
}

func (s *Server) handleCreateRecipe(w http.ResponseWriter, r *http.Request) {
	var req recipeInputRequest
	if err := readJSON(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	rec, err := s.deps.Recipes.Create(r.Context(), req.toInput())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toRecipeDTO(rec))
}

func (s *Server) handleUpdateRecipe(w http.ResponseWriter, r *http.Request) {
	id, err := pathUUID(r, "id")
	if err != nil {
		writeError(w, err)
		return
	}
	var req recipeInputRequest
	if err := readJSON(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	rec, err := s.deps.Recipes.Update(r.Context(), id, req.toInput())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toRecipeDTO(rec))
}

func (s *Server) handleDeleteRecipe(w http.ResponseWriter, r *http.Request) {
	id, err := pathUUID(r, "id")
	if err != nil {
		writeError(w, err)
		return
	}
	rec, err := s.deps.Recipes.Delete(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	if rec.ImageExt != "" {
		if err := s.deps.Images.Delete(rec.ID, rec.ImageExt); err != nil {
			s.log.Error("delete recipe image", "recipe", rec.ID, "error", err)
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleUploadImage(w http.ResponseWriter, r *http.Request) {
	id, err := pathUUID(r, "id")
	if err != nil {
		writeError(w, err)
		return
	}
	if _, err := s.deps.Recipes.Get(r.Context(), id); err != nil {
		writeError(w, err)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes)
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		writeError(w, domain.Errorf(domain.KindInvalid, "invalid multipart upload (max %d bytes)", maxUploadBytes))
		return
	}
	defer r.MultipartForm.RemoveAll()
	file, _, err := r.FormFile("file")
	if err != nil {
		writeError(w, domain.NewError(domain.KindInvalid, "missing file field"))
		return
	}
	defer file.Close()

	head := make([]byte, 512)
	n, readErr := io.ReadFull(file, head)
	if readErr != nil && readErr != io.ErrUnexpectedEOF && readErr != io.EOF {
		writeError(w, errInternal)
		return
	}
	ext, ok := storage.DetectExt(head[:n])
	if !ok {
		writeError(w, domain.NewError(domain.KindInvalid, "unsupported image type (allowed: jpeg, png, webp)"))
		return
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		writeError(w, errInternal)
		return
	}

	if err := s.deps.Images.Save(id, ext, file); err != nil {
		writeError(w, errInternal)
		return
	}
	prev, err := s.deps.Recipes.SetImageExt(r.Context(), id, ext)
	if err != nil {
		_ = s.deps.Images.Delete(id, ext)
		writeError(w, err)
		return
	}
	if prev != "" && prev != ext {
		if err := s.deps.Images.Delete(id, prev); err != nil {
			s.log.Error("delete replaced image", "recipe", id, "error", err)
		}
	}
	rec, err := s.deps.Recipes.Get(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toRecipeDTO(rec))
}

func (s *Server) handleDeleteImage(w http.ResponseWriter, r *http.Request) {
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
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if _, err := s.deps.Recipes.SetImageExt(r.Context(), id, ""); err != nil {
		writeError(w, err)
		return
	}
	if err := s.deps.Images.Delete(id, rec.ImageExt); err != nil {
		s.log.Error("delete image", "recipe", id, "error", err)
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleExport(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="halite-export-%s.zip"`, time.Now().UTC().Format("20060102")))
	w.WriteHeader(http.StatusOK)
	if err := s.deps.Transfer.Export(r.Context(), w); err != nil {
		s.log.Error("export failed", "error", err)
	}
}

func (s *Server) handleImport(w http.ResponseWriter, r *http.Request) {
	counts, err := s.deps.Transfer.Import(r.Context(), r.Body)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, importResponseDTO{Imported: importCountsDTO{
		Recipes: counts.Recipes,
		Images:  counts.Images,
	}})
}
