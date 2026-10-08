package service

import (
	"archive/zip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"halite/internal/domain"
	"halite/internal/storage"
)

const ExportSchemaVersion = 2

// MaxImportBytes caps the size of an uploaded .zip bundle.
const MaxImportBytes = 512 << 20 // 512 MiB

// maxImageBytes caps a single extracted image.
const maxImageBytes = 32 << 20 // 32 MiB

type TransferService struct {
	recipes  domain.RecipeRepository
	settings domain.SettingsRepository
	images   *storage.Store
	tx       domain.TransactionManager
	clock    Clock
}

func NewTransferService(
	recipes domain.RecipeRepository,
	settings domain.SettingsRepository,
	images *storage.Store,
	tx domain.TransactionManager,
	clock Clock,
) *TransferService {
	return &TransferService{recipes: recipes, settings: settings, images: images, tx: tx, clock: clock}
}

type ExportDoc struct {
	App           string            `json:"app"`
	SchemaVersion int               `json:"schema_version"`
	ExportedAt    string            `json:"exported_at"`
	Settings      map[string]string `json:"settings"`
	Recipes       []ExportRecipe    `json:"recipes"`
}

type ExportRecipe struct {
	ID          string              `json:"id"`
	Title       string              `json:"title"`
	Description string              `json:"description"`
	Servings    int                 `json:"servings"`
	PrepMinutes int                 `json:"prep_minutes"`
	CookMinutes int                 `json:"cook_minutes"`
	Ingredients []domain.Ingredient `json:"ingredients"`
	Steps       []string            `json:"steps"`
	Tags        []string            `json:"tags"`
	ImageExt    string              `json:"image_ext,omitempty"`
	CreatedAt   string              `json:"created_at,omitempty"`
	UpdatedAt   string              `json:"updated_at,omitempty"`
}

type ImportCounts struct {
	Recipes int64 `json:"recipes"`
	Images  int64 `json:"images"`
}

func (s *TransferService) Export(ctx context.Context, w io.Writer) error {
	recipes, err := s.recipes.ListAll(ctx)
	if err != nil {
		return err
	}
	values, err := s.settings.All(ctx)
	if err != nil {
		return err
	}
	doc := ExportDoc{
		App:           "halite",
		SchemaVersion: ExportSchemaVersion,
		ExportedAt:    s.clock().UTC().Format(time.RFC3339),
		Settings:      values,
		Recipes:       make([]ExportRecipe, 0, len(recipes)),
	}
	for _, r := range recipes {
		doc.Recipes = append(doc.Recipes, ExportRecipe{
			ID:          r.ID,
			Title:       r.Title,
			Description: r.Description,
			Servings:    r.Servings,
			PrepMinutes: r.PrepMinutes,
			CookMinutes: r.CookMinutes,
			Ingredients: r.Ingredients,
			Steps:       r.Steps,
			Tags:        r.Tags,
			ImageExt:    r.ImageExt,
			CreatedAt:   r.CreatedAt.UTC().Format(time.RFC3339),
			UpdatedAt:   r.UpdatedAt.UTC().Format(time.RFC3339),
		})
	}

	zw := zip.NewWriter(w)
	manifest, err := zw.Create("manifest.json")
	if err != nil {
		return err
	}
	enc := json.NewEncoder(manifest)
	enc.SetIndent("", "  ")
	if err := enc.Encode(doc); err != nil {
		return err
	}
	for _, r := range recipes {
		if r.ImageExt == "" {
			continue
		}
		src, err := s.images.Open(r.ID, r.ImageExt)
		if err != nil {
			return err
		}
		entry, err := zw.Create("images/" + r.ID + "." + r.ImageExt)
		if err != nil {
			src.Close()
			return err
		}
		_, copyErr := io.Copy(entry, src)
		src.Close()
		if copyErr != nil {
			return copyErr
		}
	}
	return zw.Close()
}

type importDoc struct {
	App           string            `json:"app"`
	SchemaVersion *int              `json:"schema_version"`
	Settings      map[string]string `json:"settings"`
	Recipes       []ExportRecipe    `json:"recipes"`
}

// Import reads a .zip bundle, validates it fully, then replaces the entire
// recipe collection, image store and settings. Body is read into a temporary
// file first because archive/zip requires random access.
func (s *TransferService) Import(ctx context.Context, body io.Reader) (ImportCounts, error) {
	tmp, err := os.CreateTemp(s.images.Dir(), ".import-*.zip")
	if err != nil {
		return ImportCounts{}, err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)

	n, err := io.Copy(tmp, io.LimitReader(body, MaxImportBytes+1))
	if err != nil {
		tmp.Close()
		return ImportCounts{}, domain.NewError(domain.KindInvalid, "could not read import body")
	}
	if err := tmp.Close(); err != nil {
		return ImportCounts{}, err
	}
	if n > MaxImportBytes {
		return ImportCounts{}, domain.Errorf(domain.KindInvalid, "import bundle too large (max %d bytes)", MaxImportBytes)
	}

	zr, err := zip.OpenReader(tmpName)
	if err != nil {
		return ImportCounts{}, domain.NewError(domain.KindInvalid, "body must be a valid .zip export bundle")
	}
	defer zr.Close()

	doc, recipes, details, err := parseImport(zr)
	if err != nil {
		return ImportCounts{}, err
	}
	if len(details) > 0 {
		return ImportCounts{}, domain.NewErrorWithDetails(domain.KindUnprocessable, "import validation failed", details)
	}

	entries := make(map[string]*zip.File, len(zr.File))
	for _, f := range zr.File {
		entries[f.Name] = f
	}

	staging, err := os.MkdirTemp(s.images.Dir(), ".import-images-*")
	if err != nil {
		return ImportCounts{}, err
	}
	defer os.RemoveAll(staging)

	type stagedImage struct{ id, ext, path string }
	var images []stagedImage
	for i, er := range doc.Recipes {
		if er.ImageExt == "" {
			continue
		}
		id := recipes[i].ID
		name := "images/" + id + "." + er.ImageExt
		f, ok := entries[name]
		if !ok {
			details = append(details, domain.Detail{Path: fmt.Sprintf("recipes[%d]", i), Message: "image file missing from bundle"})
			continue
		}
		dest := filepath.Join(staging, id+"."+er.ImageExt)
		if err := extractFile(f, dest); err != nil {
			return ImportCounts{}, err
		}
		if ext, ok := detectFileExt(dest); !ok || ext != er.ImageExt {
			details = append(details, domain.Detail{Path: fmt.Sprintf("recipes[%d]", i), Message: "image content does not match declared extension"})
			continue
		}
		images = append(images, stagedImage{id: id, ext: er.ImageExt, path: dest})
	}
	if len(details) > 0 {
		return ImportCounts{}, domain.NewErrorWithDetails(domain.KindUnprocessable, "import validation failed", details)
	}

	counts := ImportCounts{}
	err = s.tx.Do(ctx, func(ctx context.Context) error {
		if err := s.recipes.DeleteAll(ctx); err != nil {
			return err
		}
		for _, key := range []string{domain.SettingImprintText, domain.SettingPrivacyText} {
			if err := s.settings.Set(ctx, key, strings.TrimSpace(doc.Settings[key])); err != nil {
				return err
			}
		}
		for i := range recipes {
			rec := recipes[i]
			if err := s.recipes.Create(ctx, &rec); err != nil {
				return err
			}
			counts.Recipes++
		}
		return nil
	})
	if err != nil {
		return ImportCounts{}, err
	}

	if err := s.images.WipeAll(); err != nil {
		return ImportCounts{}, err
	}
	for _, im := range images {
		if err := os.Rename(im.path, filepath.Join(s.images.Dir(), im.id+"."+im.ext)); err != nil {
			return ImportCounts{}, err
		}
		counts.Images++
	}
	return counts, nil
}

func parseImport(zr *zip.ReadCloser) (importDoc, []domain.Recipe, []domain.Detail, error) {
	var doc importDoc
	var manifest *zip.File
	for _, f := range zr.File {
		if f.Name == "manifest.json" {
			manifest = f
			break
		}
	}
	if manifest == nil {
		return doc, nil, nil, domain.NewError(domain.KindInvalid, "not a halite export: manifest.json missing")
	}
	if manifest.UncompressedSize64 > 16<<20 {
		return doc, nil, nil, domain.NewError(domain.KindInvalid, "manifest.json too large")
	}
	rc, err := manifest.Open()
	if err != nil {
		return doc, nil, nil, err
	}
	defer rc.Close()
	raw, err := io.ReadAll(io.LimitReader(rc, 16<<20+1))
	if err != nil {
		return doc, nil, nil, err
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		return doc, nil, nil, domain.NewError(domain.KindInvalid, "manifest.json is not valid JSON")
	}

	if doc.App != "halite" {
		return doc, nil, nil, domain.NewError(domain.KindInvalid, "not a halite export: missing app=halite marker")
	}
	var details []domain.Detail
	if doc.SchemaVersion == nil {
		details = append(details, domain.Detail{Path: "schema_version", Message: "schema_version is required"})
	} else if *doc.SchemaVersion > ExportSchemaVersion {
		details = append(details, domain.Detail{
			Path:    "schema_version",
			Message: fmt.Sprintf("unsupported schema_version %d (supported: <= %d)", *doc.SchemaVersion, ExportSchemaVersion),
		})
	} else if *doc.SchemaVersion < 1 {
		details = append(details, domain.Detail{Path: "schema_version", Message: "schema_version must be >= 1"})
	}

	for _, key := range []string{domain.SettingImprintText, domain.SettingPrivacyText} {
		if value, ok := doc.Settings[key]; ok && runeLen(strings.TrimSpace(value)) > MaxLegalTextRunes {
			details = append(details, domain.Detail{Path: "settings." + key, Message: fmt.Sprintf("must be at most %d characters", MaxLegalTextRunes)})
		}
	}

	seenIDs := map[string]bool{}
	recipes := make([]domain.Recipe, 0, len(doc.Recipes))
	for i, er := range doc.Recipes {
		base := fmt.Sprintf("recipes[%d]", i)
		id := er.ID
		if id != "" {
			if !domain.ValidID(id) {
				details = append(details, domain.Detail{Path: base + ".id", Message: "id must be a valid UUID"})
			} else if seenIDs[id] {
				details = append(details, domain.Detail{Path: base + ".id", Message: "duplicate recipe id"})
			}
			seenIDs[id] = true
		} else {
			id = domain.NewID()
		}

		clean, verr := normalizeRecipeInput(RecipeInput{
			Title:       er.Title,
			Description: er.Description,
			Servings:    er.Servings,
			PrepMinutes: er.PrepMinutes,
			CookMinutes: er.CookMinutes,
			Ingredients: er.Ingredients,
			Steps:       er.Steps,
			Tags:        er.Tags,
		})
		if verr != nil {
			details = append(details, domain.Detail{Path: base, Message: verr.Error()})
		}
		if !validImageExt(er.ImageExt) {
			details = append(details, domain.Detail{Path: base + ".image_ext", Message: "image_ext must be one of jpg, png, webp"})
		}

		rec := domain.Recipe{
			ID:          id,
			Title:       clean.Title,
			Description: clean.Description,
			Servings:    clean.Servings,
			PrepMinutes: clean.PrepMinutes,
			CookMinutes: clean.CookMinutes,
			Ingredients: clean.Ingredients,
			Steps:       clean.Steps,
			Tags:        clean.Tags,
			ImageExt:    er.ImageExt,
		}
		if ts, ok := parseTime(er.CreatedAt); ok {
			rec.CreatedAt = ts
		}
		if ts, ok := parseTime(er.UpdatedAt); ok {
			rec.UpdatedAt = ts
		}
		recipes = append(recipes, rec)
	}

	return doc, recipes, details, nil
}

func parseTime(s string) (time.Time, bool) {
	if strings.TrimSpace(s) == "" {
		return time.Time{}, false
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return time.Time{}, false
	}
	return t, true
}

func validImageExt(ext string) bool {
	switch ext {
	case "", "jpg", "png", "webp":
		return true
	default:
		return false
	}
}

func extractFile(f *zip.File, dest string) error {
	rc, err := f.Open()
	if err != nil {
		return err
	}
	defer rc.Close()
	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, io.LimitReader(rc, maxImageBytes+1))
	return err
}

func detectFileExt(path string) (string, bool) {
	f, err := os.Open(path)
	if err != nil {
		return "", false
	}
	defer f.Close()
	head := make([]byte, 512)
	n, err := io.ReadFull(f, head)
	if err != nil && err != io.ErrUnexpectedEOF && err != io.EOF {
		return "", false
	}
	return storage.DetectExt(head[:n])
}
