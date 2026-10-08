package service

import (
	"context"
	"math"
	"strings"

	"halite/internal/domain"
)

type RecipeService struct {
	recipes domain.RecipeRepository
}

func NewRecipeService(recipes domain.RecipeRepository) *RecipeService {
	return &RecipeService{recipes: recipes}
}

const (
	maxTitleRunes       = 200
	maxDescriptionRunes = 5000
	maxServings         = 1000
	maxIngredients      = 100
	maxIngredientRunes  = 200
	maxUnitRunes        = 30
	maxIngredientAmount = 1_000_000
	maxSteps            = 100
	maxStepRunes        = 2000
	maxTags             = 20
	maxTagRunes         = 50
	maxMinutes          = 6000
)

type RecipeInput struct {
	Title       string
	Description string
	Servings    int
	PrepMinutes int
	CookMinutes int
	Ingredients []domain.Ingredient
	Steps       []string
	Tags        []string
}

func (s *RecipeService) List(ctx context.Context, q domain.RecipeListQuery) (domain.RecipePage, error) {
	return s.recipes.ListPage(ctx, q)
}

func (s *RecipeService) Tags(ctx context.Context) ([]string, error) {
	return s.recipes.ListTags(ctx)
}

func (s *RecipeService) Get(ctx context.Context, id string) (domain.Recipe, error) {
	return s.recipes.GetByID(ctx, id)
}

func (s *RecipeService) Create(ctx context.Context, in RecipeInput) (domain.Recipe, error) {
	clean, err := normalizeRecipeInput(in)
	if err != nil {
		return domain.Recipe{}, err
	}
	rec := domain.Recipe{
		Title:       clean.Title,
		Description: clean.Description,
		Servings:    clean.Servings,
		PrepMinutes: clean.PrepMinutes,
		CookMinutes: clean.CookMinutes,
		Ingredients: clean.Ingredients,
		Steps:       clean.Steps,
		Tags:        clean.Tags,
	}
	if err := s.recipes.Create(ctx, &rec); err != nil {
		return domain.Recipe{}, err
	}
	return rec, nil
}

func (s *RecipeService) Update(ctx context.Context, id string, in RecipeInput) (domain.Recipe, error) {
	existing, err := s.recipes.GetByID(ctx, id)
	if err != nil {
		return domain.Recipe{}, err
	}
	clean, err := normalizeRecipeInput(in)
	if err != nil {
		return domain.Recipe{}, err
	}
	existing.Title = clean.Title
	existing.Description = clean.Description
	existing.Servings = clean.Servings
	existing.PrepMinutes = clean.PrepMinutes
	existing.CookMinutes = clean.CookMinutes
	existing.Ingredients = clean.Ingredients
	existing.Steps = clean.Steps
	existing.Tags = clean.Tags
	if err := s.recipes.Update(ctx, &existing); err != nil {
		return domain.Recipe{}, err
	}
	return existing, nil
}

// SetImageExt updates the image extension for a recipe and returns the previous
// extension so the caller can clean up a replaced file.
func (s *RecipeService) SetImageExt(ctx context.Context, id, ext string) (string, error) {
	existing, err := s.recipes.GetByID(ctx, id)
	if err != nil {
		return "", err
	}
	if err := s.recipes.SetImageExt(ctx, id, ext); err != nil {
		return "", err
	}
	return existing.ImageExt, nil
}

// Delete removes a recipe and returns the deleted record (for image cleanup).
func (s *RecipeService) Delete(ctx context.Context, id string) (domain.Recipe, error) {
	existing, err := s.recipes.GetByID(ctx, id)
	if err != nil {
		return domain.Recipe{}, err
	}
	if err := s.recipes.Delete(ctx, id); err != nil {
		return domain.Recipe{}, err
	}
	return existing, nil
}

func normalizeRecipeInput(in RecipeInput) (RecipeInput, error) {
	title := strings.TrimSpace(in.Title)
	if title == "" {
		return in, domain.NewError(domain.KindInvalid, "title must not be empty")
	}
	if runeLen(title) > maxTitleRunes {
		return in, domain.Errorf(domain.KindInvalid, "title must be at most %d characters", maxTitleRunes)
	}

	desc := strings.TrimSpace(in.Description)
	if runeLen(desc) > maxDescriptionRunes {
		return in, domain.Errorf(domain.KindInvalid, "description must be at most %d characters", maxDescriptionRunes)
	}

	if in.Servings < 0 || in.Servings > maxServings {
		return in, domain.Errorf(domain.KindInvalid, "servings must be between 0 and %d", maxServings)
	}

	if in.PrepMinutes < 0 || in.PrepMinutes > maxMinutes {
		return in, domain.Errorf(domain.KindInvalid, "prep_minutes must be between 0 and %d", maxMinutes)
	}
	if in.CookMinutes < 0 || in.CookMinutes > maxMinutes {
		return in, domain.Errorf(domain.KindInvalid, "cook_minutes must be between 0 and %d", maxMinutes)
	}

	ingredients, err := cleanIngredients(in.Ingredients)
	if err != nil {
		return in, err
	}
	steps, err := cleanList(in.Steps, "step", maxSteps, maxStepRunes)
	if err != nil {
		return in, err
	}
	tags, err := cleanTags(in.Tags)
	if err != nil {
		return in, err
	}

	return RecipeInput{
		Title:       title,
		Description: desc,
		Servings:    in.Servings,
		PrepMinutes: in.PrepMinutes,
		CookMinutes: in.CookMinutes,
		Ingredients: ingredients,
		Steps:       steps,
		Tags:        tags,
	}, nil
}

func cleanIngredients(items []domain.Ingredient) ([]domain.Ingredient, error) {
	out := []domain.Ingredient{}
	for _, item := range items {
		name := strings.TrimSpace(item.Name)
		if name == "" {
			continue
		}
		if runeLen(name) > maxIngredientRunes {
			return nil, domain.Errorf(domain.KindInvalid, "ingredient name must be at most %d characters", maxIngredientRunes)
		}
		unit := strings.TrimSpace(item.Unit)
		if runeLen(unit) > maxUnitRunes {
			return nil, domain.Errorf(domain.KindInvalid, "ingredient unit must be at most %d characters", maxUnitRunes)
		}
		amount := item.Amount
		if math.IsNaN(amount) || math.IsInf(amount, 0) || amount < 0 || amount > maxIngredientAmount {
			return nil, domain.Errorf(domain.KindInvalid, "ingredient amount must be between 0 and %d", maxIngredientAmount)
		}
		out = append(out, domain.Ingredient{Amount: amount, Unit: unit, Name: name})
	}
	if len(out) > maxIngredients {
		return nil, domain.Errorf(domain.KindInvalid, "at most %d ingredients allowed", maxIngredients)
	}
	return out, nil
}

func cleanList(items []string, label string, maxItems, maxRunes int) ([]string, error) {
	out := []string{}
	for _, item := range items {
		trimmed := strings.TrimSpace(item)
		if trimmed == "" {
			continue
		}
		if runeLen(trimmed) > maxRunes {
			return nil, domain.Errorf(domain.KindInvalid, "%s must be at most %d characters", label, maxRunes)
		}
		out = append(out, trimmed)
	}
	if len(out) > maxItems {
		return nil, domain.Errorf(domain.KindInvalid, "at most %d %ss allowed", maxItems, label)
	}
	return out, nil
}

func cleanTags(tags []string) ([]string, error) {
	out := []string{}
	seen := map[string]bool{}
	for _, tag := range tags {
		trimmed := strings.TrimSpace(tag)
		if trimmed == "" {
			continue
		}
		if runeLen(trimmed) > maxTagRunes {
			return nil, domain.Errorf(domain.KindInvalid, "tag must be at most %d characters", maxTagRunes)
		}
		key := strings.ToLower(trimmed)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, trimmed)
		if len(out) > maxTags {
			return nil, domain.Errorf(domain.KindInvalid, "at most %d tags allowed", maxTags)
		}
	}
	return out, nil
}

func runeLen(s string) int {
	n := 0
	for range s {
		n++
	}
	return n
}
