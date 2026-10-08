import { ApiError } from "../api/client";

const LOCALIZED_CODES = new Set([
  "invalid",
  "not_found",
  "conflict",
  "unauthorized",
  "forbidden",
  "rate_limited",
  "unprocessable",
]);

const MESSAGES: Record<string, string> = {
  invalid: "Ungültige Eingabe.",
  not_found: "Nicht gefunden.",
  conflict: "Konflikt mit vorhandenen Daten.",
  unauthorized: "Nicht angemeldet.",
  forbidden: "Kein Zugriff.",
  rate_limited: "Zu viele Anmeldeversuche. Bitte später erneut versuchen.",
  unprocessable: "Die Daten konnten nicht verarbeitet werden.",
  network: "Netzwerkfehler. Bitte Verbindung prüfen.",
  unexpected: "Unerwarteter Fehler.",
};

export function apiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (LOCALIZED_CODES.has(err.code)) {
      return MESSAGES[err.code] ?? err.message;
    }
    return err.message;
  }
  if (err instanceof TypeError) {
    return MESSAGES.network;
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return MESSAGES.unexpected;
}
