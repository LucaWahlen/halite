package service

import (
	"archive/zip"
	"bytes"
	"context"
	"path/filepath"
	"testing"
	"time"

	"halite/internal/db"
	"halite/internal/domain"
	"halite/internal/repository/sqlite"
	"halite/internal/storage"
)

type transferEnv struct {
	recipes  *RecipeService
	settings *SettingsService
	transfer *TransferService
	images   *storage.Store
}

func newTransferEnv(t *testing.T) *transferEnv {
	t.Helper()
	dir := t.TempDir()
	conn, err := db.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	if err := db.Migrate(context.Background(), conn); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	images, err := storage.New(filepath.Join(dir, "uploads"))
	if err != nil {
		t.Fatalf("storage: %v", err)
	}
	store := sqlite.New(conn)
	recipeRepo := sqlite.NewRecipeRepo(store)
	settingsRepo := sqlite.NewSettingsRepo(store)
	clock := func() time.Time { return time.Date(2026, 10, 8, 12, 0, 0, 0, time.UTC) }
	return &transferEnv{
		recipes:  NewRecipeService(recipeRepo),
		settings: NewSettingsService(settingsRepo),
		transfer: NewTransferService(recipeRepo, settingsRepo, images, store, clock),
		images:   images,
	}
}

func pngBytes() []byte {
	header := []byte{0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a}
	return append(header, make([]byte, 64)...)
}

func TestExportImportRoundTrip(t *testing.T) {
	env := newTransferEnv(t)
	ctx := context.Background()
	rec, err := env.recipes.Create(ctx, RecipeInput{
		Title:       "Salzige Suppe",
		Description: "lecker",
		Servings:    4,
		PrepMinutes: 10,
		CookMinutes: 20,
		Ingredients: []domain.Ingredient{
			{Amount: 1.5, Unit: "TL", Name: "Salz"},
			{Amount: 500, Unit: "ml", Name: "Wasser"},
		},
		Steps: []string{"Mischen", "Kochen"},
		Tags:  []string{"Suppe", "Vegetarisch"},
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if err := env.images.Save(rec.ID, "png", bytes.NewReader(pngBytes())); err != nil {
		t.Fatalf("save image: %v", err)
	}
	if _, err := env.recipes.SetImageExt(ctx, rec.ID, "png"); err != nil {
		t.Fatalf("set image ext: %v", err)
	}
	if err := env.settings.SetImprintText(ctx, "Impressum: Max Mustermann"); err != nil {
		t.Fatalf("set imprint: %v", err)
	}

	var buf bytes.Buffer
	if err := env.transfer.Export(ctx, &buf); err != nil {
		t.Fatalf("Export: %v", err)
	}

	fresh := newTransferEnv(t)
	counts, err := fresh.transfer.Import(ctx, bytes.NewReader(buf.Bytes()))
	if err != nil {
		t.Fatalf("Import: %v", err)
	}
	if counts.Recipes != 1 || counts.Images != 1 {
		t.Fatalf("counts = %+v, want 1 recipe / 1 image", counts)
	}

	got, err := fresh.recipes.Get(ctx, rec.ID)
	if err != nil {
		t.Fatalf("Get after import: %v", err)
	}
	if got.Title != "Salzige Suppe" || len(got.Ingredients) != 2 || len(got.Steps) != 2 || got.ImageExt != "png" {
		t.Fatalf("unexpected recipe: %+v", got)
	}
	if got.Servings != 4 || got.Ingredients[0] != (domain.Ingredient{Amount: 1.5, Unit: "TL", Name: "Salz"}) {
		t.Fatalf("structured data lost: %+v", got)
	}
	f, err := fresh.images.Open(rec.ID, "png")
	if err != nil {
		t.Fatalf("open imported image: %v", err)
	}
	f.Close()

	view, err := fresh.settings.Get(ctx)
	if err != nil {
		t.Fatalf("settings after import: %v", err)
	}
	if view.ImprintText != "Impressum: Max Mustermann" {
		t.Errorf("imprint after import = %q", view.ImprintText)
	}
}

func TestImportReplacesEverything(t *testing.T) {
	source := newTransferEnv(t)
	ctx := context.Background()
	if _, err := source.recipes.Create(ctx, RecipeInput{Title: "Eins"}); err != nil {
		t.Fatal(err)
	}
	if err := source.settings.SetImprintText(ctx, "Quelle"); err != nil {
		t.Fatal(err)
	}
	var buf bytes.Buffer
	if err := source.transfer.Export(ctx, &buf); err != nil {
		t.Fatalf("Export: %v", err)
	}

	target := newTransferEnv(t)
	if _, err := target.recipes.Create(ctx, RecipeInput{Title: "Alt A"}); err != nil {
		t.Fatal(err)
	}
	if _, err := target.recipes.Create(ctx, RecipeInput{Title: "Alt B"}); err != nil {
		t.Fatal(err)
	}
	if _, err := target.transfer.Import(ctx, bytes.NewReader(buf.Bytes())); err != nil {
		t.Fatalf("Import: %v", err)
	}
	page, err := target.recipes.List(ctx, domain.RecipeListQuery{Page: 1, PageSize: 10, Sort: "newest"})
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 1 || page.Items[0].Title != "Eins" {
		t.Errorf("after import = %+v, want only 'Eins'", page.Items)
	}
}

func TestImportValidation(t *testing.T) {
	env := newTransferEnv(t)
	ctx := context.Background()

	tests := []struct {
		name    string
		raw     []byte
		wantErr bool
		code    domain.Kind
	}{
		{name: "not a zip", raw: []byte("nope"), wantErr: true, code: domain.KindInvalid},
		{name: "wrong app", raw: manifestZip(t, `{"app":"other","schema_version":2,"recipes":[]}`), wantErr: true, code: domain.KindInvalid},
		{name: "unsupported version", raw: manifestZip(t, `{"app":"halite","schema_version":99,"recipes":[]}`), wantErr: true, code: domain.KindUnprocessable},
		{name: "empty title", raw: manifestZip(t, `{"app":"halite","schema_version":2,"recipes":[{"id":"","title":"  "}]}`), wantErr: true, code: domain.KindUnprocessable},
		{name: "valid minimal", raw: manifestZip(t, `{"app":"halite","schema_version":2,"recipes":[{"id":"","title":"Suppe","ingredients":[{"amount":0,"unit":"","name":"Salz"}]}]}`), wantErr: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			counts, err := env.transfer.Import(ctx, bytes.NewReader(tt.raw))
			if tt.wantErr != (err != nil) {
				t.Fatalf("Import() error = %v, wantErr %v", err, tt.wantErr)
			}
			if tt.wantErr {
				if k, ok := domain.KindOf(err); ok && k != tt.code {
					t.Errorf("kind = %q, want %q", k, tt.code)
				}
				return
			}
			if counts.Recipes != 1 {
				t.Errorf("counts = %+v, want 1 recipe", counts)
			}
		})
	}
}

func manifestZip(t *testing.T, manifest string) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	w, err := zw.Create("manifest.json")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := w.Write([]byte(manifest)); err != nil {
		t.Fatal(err)
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}
