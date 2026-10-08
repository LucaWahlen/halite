package domain

import "time"

// Ingredient is a measured component of a recipe. Amount is expressed in the
// given Unit; an Amount of 0 means "to taste" (no measurable quantity).
type Ingredient struct {
	Amount float64 `json:"amount"`
	Unit   string  `json:"unit"`
	Name   string  `json:"name"`
}

type Recipe struct {
	ID          string
	Title       string
	Description string
	Servings    int
	PrepMinutes int
	CookMinutes int
	Ingredients []Ingredient
	Steps       []string
	Tags        []string
	ImageExt    string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (r Recipe) TotalMinutes() int { return r.PrepMinutes + r.CookMinutes }
func (r Recipe) HasImage() bool    { return r.ImageExt != "" }

type RecipeSummary struct {
	ID          string
	Title       string
	Description string
	Servings    int
	PrepMinutes int
	CookMinutes int
	Tags        []string
	ImageExt    string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (r RecipeSummary) TotalMinutes() int { return r.PrepMinutes + r.CookMinutes }
func (r RecipeSummary) HasImage() bool    { return r.ImageExt != "" }

type RecipeListQuery struct {
	Search   string
	Tag      string
	Sort     string
	Page     int
	PageSize int
}

type RecipePage struct {
	Items []RecipeSummary
	Total int
}
