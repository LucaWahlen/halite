package sqlite

import "time"

func timeNow() time.Time { return time.Now().UTC() }

func formatTime(t time.Time) string { return t.Format(time.RFC3339) }

func parseTimestamp(s string) (time.Time, bool) {
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return time.Time{}, false
	}
	return t, true
}
