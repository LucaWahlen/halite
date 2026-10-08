package domain

import "context"

type RecipeRepository interface {
	ListPage(ctx context.Context, q RecipeListQuery) (RecipePage, error)
	ListAll(ctx context.Context) ([]Recipe, error)
	ListTags(ctx context.Context) ([]string, error)
	GetByID(ctx context.Context, id string) (Recipe, error)
	Create(ctx context.Context, r *Recipe) error
	Update(ctx context.Context, r *Recipe) error
	SetImageExt(ctx context.Context, id, ext string) error
	Delete(ctx context.Context, id string) error
	DeleteAll(ctx context.Context) error
}

type SettingsRepository interface {
	Get(ctx context.Context, key string) (string, error)
	Set(ctx context.Context, key, value string) error
	All(ctx context.Context) (map[string]string, error)
}

type TransactionManager interface {
	Do(ctx context.Context, fn func(ctx context.Context) error) error
}
