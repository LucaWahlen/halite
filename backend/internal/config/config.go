package config

import (
	"errors"
	"os"
)

type Config struct {
	AdminPassword string
	DBPath        string
	UploadsDir    string
	Addr          string
}

func Load() (Config, error) {
	cfg := Config{
		AdminPassword: os.Getenv("HALITE_ADMIN_PASSWORD"),
		DBPath:        envDefault("HALITE_DB_PATH", "/data/halite.db"),
		UploadsDir:    envDefault("HALITE_UPLOADS_DIR", "/data/uploads"),
		Addr:          envDefault("HALITE_ADDR", ":8080"),
	}
	if cfg.AdminPassword == "" {
		return Config{}, errors.New("environment variable HALITE_ADMIN_PASSWORD is required and must not be empty")
	}
	return cfg, nil
}

func envDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
