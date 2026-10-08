package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"

	"halite/internal/domain"
)

type RecipeRepo struct {
	db *DB
}

func NewRecipeRepo(db *DB) *RecipeRepo { return &RecipeRepo{db: db} }

const recipeColumns = `id, title, description, servings_count, prep_minutes, cook_minutes,
	ingredients, steps, tags, image_ext, created_at, updated_at`

func scanRecipe(sc interface{ Scan(...any) error }) (domain.Recipe, error) {
	var (
		r         domain.Recipe
		ingJSON   string
		stepJSON  string
		tagJSON   string
		createdAt string
		updatedAt string
	)
	if err := sc.Scan(
		&r.ID, &r.Title, &r.Description, &r.Servings, &r.PrepMinutes, &r.CookMinutes,
		&ingJSON, &stepJSON, &tagJSON, &r.ImageExt, &createdAt, &updatedAt,
	); err != nil {
		return r, err
	}
	r.Ingredients = decodeIngredients(ingJSON)
	r.Steps = decodeList(stepJSON)
	r.Tags = decodeList(tagJSON)
	r.CreatedAt, _ = parseTimestamp(createdAt)
	r.UpdatedAt, _ = parseTimestamp(updatedAt)
	return r, nil
}

func decodeIngredients(raw string) []domain.Ingredient {
	out := []domain.Ingredient{}
	if strings.TrimSpace(raw) == "" {
		return out
	}
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return []domain.Ingredient{}
	}
	if out == nil {
		return []domain.Ingredient{}
	}
	return out
}

func encodeIngredients(list []domain.Ingredient) string {
	if list == nil {
		list = []domain.Ingredient{}
	}
	raw, err := json.Marshal(list)
	if err != nil {
		return "[]"
	}
	return string(raw)
}

func decodeList(raw string) []string {
	out := []string{}
	if strings.TrimSpace(raw) == "" {
		return out
	}
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return []string{}
	}
	if out == nil {
		return []string{}
	}
	return out
}

func encodeList(list []string) string {
	if list == nil {
		list = []string{}
	}
	raw, err := json.Marshal(list)
	if err != nil {
		return "[]"
	}
	return string(raw)
}

func escapeLike(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `%`, `\%`)
	s = strings.ReplaceAll(s, `_`, `\_`)
	return s
}

func (r *RecipeRepo) ListPage(ctx context.Context, q domain.RecipeListQuery) (domain.RecipePage, error) {
	page := q.Page
	if page < 1 {
		page = 1
	}
	size := q.PageSize
	if size < 1 {
		size = 12
	}
	if size > 100 {
		size = 100
	}

	var (
		where     []string
		whereArgs []any
	)
	if search := strings.TrimSpace(q.Search); search != "" {
		like := "%" + escapeLike(search) + "%"
		where = append(where, `(
			title LIKE ? ESCAPE '\' COLLATE NOCASE
			OR description LIKE ? ESCAPE '\' COLLATE NOCASE
			OR EXISTS (SELECT 1 FROM json_each(recipes.ingredients) je WHERE json_extract(je.value, '$.name') LIKE ? ESCAPE '\' COLLATE NOCASE)
			OR EXISTS (SELECT 1 FROM json_each(recipes.tags) jt WHERE jt.value LIKE ? ESCAPE '\' COLLATE NOCASE)
		)`)
		whereArgs = append(whereArgs, like, like, like, like)
	}
	if tag := strings.TrimSpace(q.Tag); tag != "" {
		where = append(where, `EXISTS (SELECT 1 FROM json_each(recipes.tags) jt WHERE jt.value = ? COLLATE NOCASE)`)
		whereArgs = append(whereArgs, tag)
	}
	whereSQL := ""
	if len(where) > 0 {
		whereSQL = "WHERE " + strings.Join(where, " AND ")
	}

	var total int
	if err := r.db.runner(ctx).QueryRowContext(ctx,
		`SELECT COUNT(*) FROM recipes `+whereSQL, whereArgs...).Scan(&total); err != nil {
		return domain.RecipePage{}, err
	}

	limitArgs := append(append([]any{}, whereArgs...), size, (page-1)*size)
	rows, err := r.db.runner(ctx).QueryContext(ctx,
		`SELECT `+recipeColumns+` FROM recipes `+whereSQL+` ORDER BY `+recipeOrderBy(q.Sort)+` LIMIT ? OFFSET ?`,
		limitArgs...)
	if err != nil {
		return domain.RecipePage{}, err
	}
	defer rows.Close()

	items := []domain.RecipeSummary{}
	for rows.Next() {
		full, err := scanRecipe(rows)
		if err != nil {
			return domain.RecipePage{}, err
		}
		items = append(items, domain.RecipeSummary{
			ID:          full.ID,
			Title:       full.Title,
			Description: full.Description,
			Servings:    full.Servings,
			PrepMinutes: full.PrepMinutes,
			CookMinutes: full.CookMinutes,
			Tags:        full.Tags,
			ImageExt:    full.ImageExt,
			CreatedAt:   full.CreatedAt,
			UpdatedAt:   full.UpdatedAt,
		})
	}
	if err := rows.Err(); err != nil {
		return domain.RecipePage{}, err
	}
	return domain.RecipePage{Items: items, Total: total}, nil
}

func recipeOrderBy(sort string) string {
	switch sort {
	case "oldest":
		return "created_at ASC, rowid ASC"
	case "title":
		return "title COLLATE NOCASE ASC, created_at DESC"
	case "title_desc":
		return "title COLLATE NOCASE DESC, created_at DESC"
	case "updated":
		return "updated_at DESC, rowid DESC"
	case "quickest":
		return "(prep_minutes + cook_minutes) ASC, title COLLATE NOCASE ASC"
	default:
		return "created_at DESC, rowid DESC"
	}
}

func (r *RecipeRepo) ListAll(ctx context.Context) ([]domain.Recipe, error) {
	rows, err := r.db.runner(ctx).QueryContext(ctx,
		`SELECT `+recipeColumns+` FROM recipes ORDER BY created_at ASC, rowid ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Recipe{}
	for rows.Next() {
		rec, err := scanRecipe(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

func (r *RecipeRepo) ListTags(ctx context.Context) ([]string, error) {
	rows, err := r.db.runner(ctx).QueryContext(ctx,
		`SELECT DISTINCT value FROM recipes, json_each(recipes.tags) ORDER BY value COLLATE NOCASE ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		if strings.TrimSpace(v) != "" {
			out = append(out, v)
		}
	}
	return out, rows.Err()
}

func (r *RecipeRepo) GetByID(ctx context.Context, id string) (domain.Recipe, error) {
	row := r.db.runner(ctx).QueryRowContext(ctx,
		`SELECT `+recipeColumns+` FROM recipes WHERE id = ?`, id)
	rec, err := scanRecipe(row)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.Recipe{}, domain.ErrNotFound("recipe")
	}
	return rec, err
}

func (r *RecipeRepo) Create(ctx context.Context, rec *domain.Recipe) error {
	now := timeNow()
	if rec.CreatedAt.IsZero() {
		rec.CreatedAt = now
	}
	if rec.UpdatedAt.IsZero() {
		rec.UpdatedAt = now
	}
	if rec.ID == "" {
		rec.ID = domain.NewID()
	}
	_, err := r.db.runner(ctx).ExecContext(ctx, `
		INSERT INTO recipes (id, title, description, servings_count, prep_minutes, cook_minutes,
			ingredients, steps, tags, image_ext, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		rec.ID, rec.Title, rec.Description, rec.Servings, rec.PrepMinutes, rec.CookMinutes,
		encodeIngredients(rec.Ingredients), encodeList(rec.Steps), encodeList(rec.Tags), rec.ImageExt,
		formatTime(rec.CreatedAt), formatTime(rec.UpdatedAt))
	return mapConstraint(err, "recipe id already exists")
}

func (r *RecipeRepo) Update(ctx context.Context, rec *domain.Recipe) error {
	now := timeNow()
	rec.UpdatedAt = now
	res, err := r.db.runner(ctx).ExecContext(ctx, `
		UPDATE recipes SET title = ?, description = ?, servings_count = ?, prep_minutes = ?, cook_minutes = ?,
			ingredients = ?, steps = ?, tags = ?, updated_at = ?
		WHERE id = ?`,
		rec.Title, rec.Description, rec.Servings, rec.PrepMinutes, rec.CookMinutes,
		encodeIngredients(rec.Ingredients), encodeList(rec.Steps), encodeList(rec.Tags), formatTime(now), rec.ID)
	if err != nil {
		return err
	}
	if n, err := rowsAffected(res); err != nil {
		return err
	} else if n == 0 {
		return domain.ErrNotFound("recipe")
	}
	return nil
}

func (r *RecipeRepo) SetImageExt(ctx context.Context, id, ext string) error {
	res, err := r.db.runner(ctx).ExecContext(ctx,
		`UPDATE recipes SET image_ext = ?, updated_at = ? WHERE id = ?`, ext, formatTime(timeNow()), id)
	if err != nil {
		return err
	}
	if n, err := rowsAffected(res); err != nil {
		return err
	} else if n == 0 {
		return domain.ErrNotFound("recipe")
	}
	return nil
}

func (r *RecipeRepo) Delete(ctx context.Context, id string) error {
	res, err := r.db.runner(ctx).ExecContext(ctx, `DELETE FROM recipes WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, err := rowsAffected(res); err != nil {
		return err
	} else if n == 0 {
		return domain.ErrNotFound("recipe")
	}
	return nil
}

func (r *RecipeRepo) DeleteAll(ctx context.Context) error {
	_, err := r.db.runner(ctx).ExecContext(ctx, `DELETE FROM recipes`)
	return err
}
