import { AppHeader } from "../components/AppHeader";
import { SiteFooter } from "../components/SiteFooter";
import { useSettings } from "../lib/useSettings";

export function LegalPage({ kind }: { kind: "imprint" | "privacy" }) {
  const { data } = useSettings();
  const isImprint = kind === "imprint";
  const title = isImprint ? "Impressum" : "Datenschutz";
  const text = isImprint ? data?.imprint_text : data?.privacy_text;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <h1 className="font-display text-3xl font-bold text-balance">{title}</h1>
        {text && text.trim() ? (
          <div className="mt-6 leading-relaxed whitespace-pre-line text-muted">{text}</div>
        ) : (
          <p className="mt-6 text-muted">Kein Text hinterlegt.</p>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
