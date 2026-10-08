package httpapi

import "halite/internal/domain"

type ingredientDTO struct {
	Amount float64 `json:"amount"`
	Unit   string  `json:"unit"`
	Name   string  `json:"name"`
}

type recipeSummaryDTO struct {
	ID           string   `json:"id"`
	Title        string   `json:"title"`
	Description  string   `json:"description"`
	Servings     int      `json:"servings"`
	PrepMinutes  int      `json:"prep_minutes"`
	CookMinutes  int      `json:"cook_minutes"`
	TotalMinutes int      `json:"total_minutes"`
	Tags         []string `json:"tags"`
	HasImage     bool     `json:"has_image"`
	ImageURL     string   `json:"image_url,omitempty"`
	CreatedAt    string   `json:"created_at"`
	UpdatedAt    string   `json:"updated_at"`
}

type recipeDTO struct {
	recipeSummaryDTO
	Ingredients []ingredientDTO `json:"ingredients"`
	Steps       []string        `json:"steps"`
}

type recipePageDTO struct {
	Items    []recipeSummaryDTO `json:"items"`
	Total    int                `json:"total"`
	Page     int                `json:"page"`
	PageSize int                `json:"page_size"`
}

type settingsDTO struct {
	ImprintText string `json:"imprint_text"`
	PrivacyText string `json:"privacy_text"`
}

type importResponseDTO struct {
	Imported importCountsDTO `json:"imported"`
}

type importCountsDTO struct {
	Recipes int64 `json:"recipes"`
	Images  int64 `json:"images"`
}

func imageURL(id string, hasImage bool) string {
	if !hasImage {
		return ""
	}
	return "/api/v1/recipes/" + id + "/image"
}

func toRecipeSummary(r domain.RecipeSummary) recipeSummaryDTO {
	tags := r.Tags
	if tags == nil {
		tags = []string{}
	}
	return recipeSummaryDTO{
		ID:           r.ID,
		Title:        r.Title,
		Description:  r.Description,
		Servings:     r.Servings,
		PrepMinutes:  r.PrepMinutes,
		CookMinutes:  r.CookMinutes,
		TotalMinutes: r.TotalMinutes(),
		Tags:         tags,
		HasImage:     r.HasImage(),
		ImageURL:     imageURL(r.ID, r.HasImage()),
		CreatedAt:    r.CreatedAt.UTC().Format(rfc3339),
		UpdatedAt:    r.UpdatedAt.UTC().Format(rfc3339),
	}
}

func toIngredientDTOs(list []domain.Ingredient) []ingredientDTO {
	out := make([]ingredientDTO, 0, len(list))
	for _, ing := range list {
		out = append(out, ingredientDTO{Amount: ing.Amount, Unit: ing.Unit, Name: ing.Name})
	}
	return out
}

func toRecipeDTO(r domain.Recipe) recipeDTO {
	steps := r.Steps
	if steps == nil {
		steps = []string{}
	}
	tags := r.Tags
	if tags == nil {
		tags = []string{}
	}
	return recipeDTO{
		recipeSummaryDTO: recipeSummaryDTO{
			ID:           r.ID,
			Title:        r.Title,
			Description:  r.Description,
			Servings:     r.Servings,
			PrepMinutes:  r.PrepMinutes,
			CookMinutes:  r.CookMinutes,
			TotalMinutes: r.TotalMinutes(),
			Tags:         tags,
			HasImage:     r.HasImage(),
			ImageURL:     imageURL(r.ID, r.HasImage()),
			CreatedAt:    r.CreatedAt.UTC().Format(rfc3339),
			UpdatedAt:    r.UpdatedAt.UTC().Format(rfc3339),
		},
		Ingredients: toIngredientDTOs(r.Ingredients),
		Steps:       steps,
	}
}
