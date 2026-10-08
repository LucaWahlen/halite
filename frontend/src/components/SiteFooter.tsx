import { Link } from "react-router";

import { useSettings } from "../lib/useSettings";

export function SiteFooter() {
  const { data } = useSettings();
  const hasImprint = (data?.imprint_text ?? "").trim().length > 0;
  const hasPrivacy = (data?.privacy_text ?? "").trim().length > 0;

  if (!hasImprint && !hasPrivacy) {
    return null;
  }

  return (
    <footer className="mt-auto border-t border-border/60">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-4 text-sm text-muted sm:px-6">
        {hasImprint ? (
          <Link
            to="/impressum"
            className="rounded transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
          >
            Impressum
          </Link>
        ) : null}
        {hasPrivacy ? (
          <Link
            to="/datenschutz"
            className="rounded transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
          >
            Datenschutz
          </Link>
        ) : null}
      </div>
    </footer>
  );
}
