package service

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"halite/internal/db"
	"halite/internal/domain"
	"halite/internal/repository/sqlite"
)

func newRecipeService(t *testing.T) *RecipeService {
	t.Helper()
	conn, err := db.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	if err := db.Migrate(context.Background(), conn); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return NewRecipeService(sqlite.NewRecipeRepo(sqlite.New(conn)))
}

func TestCreateNormalizesInput(t *testing.T) {
	svc := newRecipeService(t)
	rec, err := svc.Create(context.Background(), RecipeInput{
		Title:       "  Salzige Suppe  ",
		Description: "  lecker  ",
		Servings:    4,
		Ingredients: []domain.Ingredient{
			{Amount: 1.5, Unit: " TL ", Name: "  Salz  "},
			{Name: "  "},
			{Amount: 500, Unit: "ml", Name: "Wasser"},
		},
		Steps: []string{" Mischen ", " Kochen "},
		Tags:  []string{"Suppe", "suppe", " Vegetarisch "},
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if rec.Title != "Salzige Suppe" {
		t.Errorf("title = %q", rec.Title)
	}
	if rec.Servings != 4 {
		t.Errorf("servings = %d", rec.Servings)
	}
	if len(rec.Ingredients) != 2 {
		t.Fatalf("ingredients = %v", rec.Ingredients)
	}
	if rec.Ingredients[0] != (domain.Ingredient{Amount: 1.5, Unit: "TL", Name: "Salz"}) {
		t.Errorf("ingredient[0] = %+v", rec.Ingredients[0])
	}
	if len(rec.Tags) != 2 || rec.Tags[0] != "Suppe" || rec.Tags[1] != "Vegetarisch" {
		t.Errorf("tags = %v", rec.Tags)
	}
}

func TestCreateRejectsEmptyTitle(t *testing.T) {
	svc := newRecipeService(t)
	_, err := svc.Create(context.Background(), RecipeInput{Title: "   "})
	if err == nil {
		t.Fatal("expected error")
	}
	if k, ok := domain.KindOf(err); !ok || k != domain.KindInvalid {
		t.Errorf("kind = %v, want invalid", k)
	}
}

func TestCreateRejectsTooManyTags(t *testing.T) {
	svc := newRecipeService(t)
	tags := make([]string, 0, maxTags+1)
	for i := 0; i <= maxTags; i++ {
		tags = append(tags, "tag")
	}
	// duplicate tags collapse, so build distinct ones
	for i := range tags {
		tags[i] = "tag-" + string(rune('a'+i))
	}
	_, err := svc.Create(context.Background(), RecipeInput{Title: "x", Tags: tags})
	if err == nil {
		t.Fatal("expected error for too many tags")
	}
}

func TestListFilterAndSort(t *testing.T) {
	svc := newRecipeService(t)
	ctx := context.Background()
	clock := time.Now()
	_ = clock
	if _, err := svc.Create(ctx, RecipeInput{Title: "Brot", Tags: []string{"Backen"}, PrepMinutes: 10, CookMinutes: 40}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Create(ctx, RecipeInput{Title: "Salat", Tags: []string{"Rohkost"}, PrepMinutes: 15, CookMinutes: 0}); err != nil {
		t.Fatal(err)
	}

	page, err := svc.List(ctx, domain.RecipeListQuery{Search: "brot", Sort: "newest", Page: 1, PageSize: 10})
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if page.Total != 1 || page.Items[0].Title != "Brot" {
		t.Errorf("search result = %+v", page.Items)
	}

	page, err = svc.List(ctx, domain.RecipeListQuery{Tag: "rohkost", Sort: "quickest", Page: 1, PageSize: 10})
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if page.Total != 1 || page.Items[0].Title != "Salat" {
		t.Errorf("tag result = %+v", page.Items)
	}

	tags, err := svc.Tags(ctx)
	if err != nil {
		t.Fatalf("Tags: %v", err)
	}
	if len(tags) != 2 {
		t.Errorf("tags = %v", tags)
	}
}
