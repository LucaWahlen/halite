package storage

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
)

var ErrInvalidType = errors.New("unsupported image type")

type Store struct {
	dir string
}

func New(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("create uploads directory: %w", err)
	}
	return &Store{dir: dir}, nil
}

func (s *Store) Dir() string { return s.dir }

func (s *Store) Save(id, ext string, r io.Reader) error {
	tmp, err := os.CreateTemp(s.dir, ".upload-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	if _, err := io.Copy(tmp, r); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return err
	}
	if err := os.Rename(tmpName, s.path(id, ext)); err != nil {
		os.Remove(tmpName)
		return err
	}
	return nil
}

func (s *Store) Open(id, ext string) (*os.File, error) {
	return os.Open(s.path(id, ext))
}

func (s *Store) Delete(id, ext string) error {
	if ext == "" {
		return nil
	}
	err := os.Remove(s.path(id, ext))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

func (s *Store) WipeAll() error {
	entries, err := os.ReadDir(s.dir)
	if err != nil {
		return err
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		if err := os.Remove(filepath.Join(s.dir, e.Name())); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) path(id, ext string) string {
	return filepath.Join(s.dir, id+"."+ext)
}

// DetectExt inspects the leading bytes of an image and returns the canonical
// extension for the allowed formats (jpg, png, webp).
func DetectExt(head []byte) (string, bool) {
	switch http.DetectContentType(head) {
	case "image/jpeg":
		return "jpg", true
	case "image/png":
		return "png", true
	case "image/webp":
		return "webp", true
	default:
		return "", false
	}
}

func ContentType(ext string) string {
	switch ext {
	case "jpg":
		return "image/jpeg"
	case "png":
		return "image/png"
	case "webp":
		return "image/webp"
	default:
		return "application/octet-stream"
	}
}
