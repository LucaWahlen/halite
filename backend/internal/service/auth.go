package service

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"strconv"
	"strings"
	"time"

	"halite/internal/domain"
)

const SessionCookieName = "halite_session"

const sessionLifetime = 12 * time.Hour

type AuthService struct {
	password []byte
	key      []byte
	now      Clock
}

func NewAuthService(adminPassword string, now Clock) *AuthService {
	h := sha256.Sum256([]byte("halite-session:" + adminPassword))
	return &AuthService{password: []byte(adminPassword), key: h[:], now: now}
}

func (s *AuthService) Login(password string) (string, time.Time, error) {
	if subtle.ConstantTimeCompare([]byte(password), s.password) != 1 {
		return "", time.Time{}, domain.NewError(domain.KindUnauthorized, "invalid password")
	}
	expiry := s.now().Add(sessionLifetime)
	return s.formatSession(expiry), expiry, nil
}

func (s *AuthService) Validate(value string) bool {
	expHex, sig, ok := strings.Cut(value, ".")
	if !ok {
		return false
	}
	exp, err := strconv.ParseInt(expHex, 16, 64)
	if err != nil {
		return false
	}
	if exp <= s.now().Unix() {
		return false
	}
	sigBytes, err := hex.DecodeString(sig)
	if err != nil {
		return false
	}
	return hmac.Equal(s.sign(expHex), sigBytes)
}

func (s *AuthService) sign(expHex string) []byte {
	mac := hmac.New(sha256.New, s.key)
	mac.Write([]byte(expHex))
	return mac.Sum(nil)
}

func (s *AuthService) formatSession(expiry time.Time) string {
	expHex := strconv.FormatInt(expiry.Unix(), 16)
	return expHex + "." + hex.EncodeToString(s.sign(expHex))
}
