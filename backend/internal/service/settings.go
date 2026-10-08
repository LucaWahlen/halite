package service

import (
	"context"
	"strings"

	"halite/internal/domain"
)

const MaxLegalTextRunes = 20000

type SettingsService struct {
	settings domain.SettingsRepository
}

func NewSettingsService(settings domain.SettingsRepository) *SettingsService {
	return &SettingsService{settings: settings}
}

type SettingsView struct {
	ImprintText string
	PrivacyText string
}

func (s *SettingsService) Get(ctx context.Context) (SettingsView, error) {
	return SettingsView{
		ImprintText: s.getText(ctx, domain.SettingImprintText),
		PrivacyText: s.getText(ctx, domain.SettingPrivacyText),
	}, nil
}

func (s *SettingsService) getText(ctx context.Context, key string) string {
	v, err := s.settings.Get(ctx, key)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(v)
}

func (s *SettingsService) SetImprintText(ctx context.Context, text string) error {
	return s.setText(ctx, domain.SettingImprintText, text)
}

func (s *SettingsService) SetPrivacyText(ctx context.Context, text string) error {
	return s.setText(ctx, domain.SettingPrivacyText, text)
}

func (s *SettingsService) setText(ctx context.Context, key, text string) error {
	trimmed := strings.TrimSpace(text)
	if runeLen(trimmed) > MaxLegalTextRunes {
		return domain.Errorf(domain.KindInvalid, "%s must be at most %d characters", key, MaxLegalTextRunes)
	}
	return s.settings.Set(ctx, key, trimmed)
}
