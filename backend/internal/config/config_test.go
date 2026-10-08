package config

import "testing"

func TestLoadRequiresPassword(t *testing.T) {
	t.Setenv("HALITE_ADMIN_PASSWORD", "")
	if _, err := Load(); err == nil {
		t.Fatal("expected error when HALITE_ADMIN_PASSWORD is empty")
	}
}

func TestLoadDefaults(t *testing.T) {
	t.Setenv("HALITE_ADMIN_PASSWORD", "secret")
	t.Setenv("HALITE_DB_PATH", "")
	t.Setenv("HALITE_UPLOADS_DIR", "")
	t.Setenv("HALITE_ADDR", "")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.AdminPassword != "secret" {
		t.Errorf("AdminPassword = %q", cfg.AdminPassword)
	}
	if cfg.DBPath != "/data/halite.db" {
		t.Errorf("DBPath = %q", cfg.DBPath)
	}
	if cfg.UploadsDir != "/data/uploads" {
		t.Errorf("UploadsDir = %q", cfg.UploadsDir)
	}
	if cfg.Addr != ":8080" {
		t.Errorf("Addr = %q", cfg.Addr)
	}
}

func TestLoadOverrides(t *testing.T) {
	t.Setenv("HALITE_ADMIN_PASSWORD", "secret")
	t.Setenv("HALITE_DB_PATH", "/tmp/x.db")
	t.Setenv("HALITE_UPLOADS_DIR", "/tmp/img")
	t.Setenv("HALITE_ADDR", ":9999")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.DBPath != "/tmp/x.db" || cfg.UploadsDir != "/tmp/img" || cfg.Addr != ":9999" {
		t.Errorf("unexpected config: %+v", cfg)
	}
}
