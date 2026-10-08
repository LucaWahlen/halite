package httpapi

import (
	"log/slog"
	"net/http"

	"halite/internal/service"
	"halite/internal/storage"
)

const SessionCookieName = "halite_session"

type Deps struct {
	Recipes  *service.RecipeService
	Settings *service.SettingsService
	Transfer *service.TransferService
	Auth     *service.AuthService
	Images   *storage.Store
}

type Server struct {
	deps    Deps
	log     *slog.Logger
	limiter *loginLimiter
}

func New(deps Deps, log *slog.Logger) *Server {
	return &Server{deps: deps, log: log, limiter: newLoginLimiter(5, defaultWindow)}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/v1/health", s.handleHealth)
	mux.HandleFunc("GET /api/v1/settings", s.handleGetSettings)
	mux.HandleFunc("GET /api/v1/recipes", s.handleListRecipes)
	mux.HandleFunc("GET /api/v1/recipes/{id}", s.handleGetRecipe)
	mux.HandleFunc("GET /api/v1/recipes/{id}/image", s.handleRecipeImage)
	mux.HandleFunc("GET /api/v1/tags", s.handleListTags)

	mux.Handle("POST /api/v1/admin/login", s.limiter.middleware(http.HandlerFunc(s.handleLogin)))
	mux.HandleFunc("POST /api/v1/admin/logout", s.handleLogout)
	mux.Handle("GET /api/v1/admin/session", s.admin(s.handleSession))

	mux.Handle("GET /api/v1/admin/settings", s.admin(s.handleGetAdminSettings))
	mux.Handle("PUT /api/v1/admin/settings", s.admin(s.handlePutAdminSettings))

	mux.Handle("POST /api/v1/admin/recipes", s.admin(s.handleCreateRecipe))
	mux.Handle("PUT /api/v1/admin/recipes/{id}", s.admin(s.handleUpdateRecipe))
	mux.Handle("DELETE /api/v1/admin/recipes/{id}", s.admin(s.handleDeleteRecipe))
	mux.Handle("POST /api/v1/admin/recipes/{id}/image", s.admin(s.handleUploadImage))
	mux.Handle("DELETE /api/v1/admin/recipes/{id}/image", s.admin(s.handleDeleteImage))

	mux.Handle("GET /api/v1/admin/export", s.admin(s.handleExport))
	mux.Handle("POST /api/v1/admin/import", s.admin(s.handleImport))

	mux.HandleFunc("/api/{path...}", func(w http.ResponseWriter, r *http.Request) {
		writeError(w, errNotFoundRoute)
	})

	return s.logMiddleware(s.recoverMiddleware(mux))
}
