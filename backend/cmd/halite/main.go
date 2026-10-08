package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	_ "time/tzdata"

	"halite/internal/config"
	"halite/internal/db"
	"halite/internal/httpapi"
	"halite/internal/repository/sqlite"
	"halite/internal/service"
	"halite/internal/storage"
	"halite/web"
)

func main() {
	if err := run(); err != nil {
		slog.Error("halite exited with error", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	conn, err := db.Open(cfg.DBPath)
	if err != nil {
		return err
	}
	defer conn.Close()
	if err := db.Migrate(ctx, conn); err != nil {
		return err
	}

	images, err := storage.New(cfg.UploadsDir)
	if err != nil {
		return err
	}

	store := sqlite.New(conn)
	recipeRepo := sqlite.NewRecipeRepo(store)
	settingsRepo := sqlite.NewSettingsRepo(store)

	clock := func() time.Time { return time.Now() }

	recipeSvc := service.NewRecipeService(recipeRepo)
	settingsSvc := service.NewSettingsService(settingsRepo)
	transferSvc := service.NewTransferService(recipeRepo, settingsRepo, images, store, clock)

	api := httpapi.New(httpapi.Deps{
		Recipes:  recipeSvc,
		Settings: settingsSvc,
		Transfer: transferSvc,
		Auth:     service.NewAuthService(cfg.AdminPassword, clock),
		Images:   images,
	}, logger)

	spa, err := web.Handler(metaResolver(recipeSvc))
	if err != nil {
		return err
	}
	root := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api" || strings.HasPrefix(r.URL.Path, "/api/") {
			api.Handler().ServeHTTP(w, r)
			return
		}
		spa.ServeHTTP(w, r)
	})

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           root,
		ReadHeaderTimeout: 10 * time.Second,
	}
	errCh := make(chan error, 1)
	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()
	logger.Info("halite listening", "addr", cfg.Addr, "db_path", cfg.DBPath, "uploads_dir", cfg.UploadsDir)

	select {
	case <-ctx.Done():
		logger.Info("shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return srv.Shutdown(shutdownCtx)
	case err := <-errCh:
		return err
	}
}
