import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Button, Card, useOverlayState } from "@heroui/react";

import { api } from "../api/client";
import type { RecipeSort, RecipeSummary } from "../api/client";
import { AppHeader } from "../components/AppHeader";
import { AddToListDialog } from "../components/AddToListDialog";
import { CartButton } from "../components/CartButton";
import { SiteFooter } from "../components/SiteFooter";
import { RecipeCard } from "../components/RecipeCard";

const PAGE_SIZE = 9;

const SORTS: { value: RecipeSort; label: string }[] = [
  { value: "newest", label: "Neu zuerst" },
  { value: "oldest", label: "Älteste zuerst" },
  { value: "quickest", label: "Schnellste zuerst" },
  { value: "title", label: "Titel A-Z" },
  { value: "title_desc", label: "Titel Z-A" },
  { value: "updated", label: "Zuletzt geändert" },
];

export function RecipeListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const tag = searchParams.get("tag") ?? "";
  const sortParam = searchParams.get("sort");
  const sort: RecipeSort = SORTS.some((s) => s.value === sortParam) ? (sortParam as RecipeSort) : "newest";
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const [searchInput, setSearchInput] = useState(q);
  const addModal = useOverlayState();
  const [addTarget, setAddTarget] = useState<RecipeSummary | null>(null);

  const updateParams = (next: Record<string, string | undefined>) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(next)) {
          if (value === undefined || value === "") params.delete(key);
          else params.set(key, value);
        }
        return params;
      },
      { replace: true },
    );
  };

  useEffect(() => setSearchInput(q), [q]);

  useEffect(() => {
    if (searchInput === q) return;
    const id = window.setTimeout(() => {
      updateParams({ q: searchInput || undefined, page: undefined });
    }, 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, q]);

  const params = useMemo(
    () => ({ page, pageSize: PAGE_SIZE, sort, q: q.trim() || undefined, tag: tag || undefined }),
    [page, sort, q, tag],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["recipes", params],
    queryFn: () => api.listRecipes(params),
    placeholderData: keepPreviousData,
  });

  const { data: tagData } = useQuery({
    queryKey: ["tags"],
    queryFn: api.listTags,
    staleTime: 60_000,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.page_size ?? PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters = q.trim().length > 0 || tag.length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <AppHeader
        actions={
          <>
            <CartButton />
            <Link to="/admin" aria-label="Anmelden">
              <Button variant="secondary" size="sm">
                <span className="flex items-center gap-1.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4" aria-hidden="true">
                    <rect x="4" y="11" width="16" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                  Login
                </span>
              </Button>
            </Link>
          </>
        }
      />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        <div className="mb-8 max-w-2xl">
          <h1 className="font-display text-3xl font-bold text-balance sm:text-4xl">Rezepte</h1>
          <p className="mt-2 text-muted">Alle Rezepte zum Nachkochen.</p>
        </div>

        <div className="mb-6 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              name="recipe-search"
              autoComplete="off"
              className="min-w-44 flex-1 rounded-full border border-border bg-surface px-4 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
              placeholder="Nach Titel, Zutat oder Tag suchen …"
              aria-label="Rezepte durchsuchen"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm text-muted">
              <span className="hidden sm:inline">Sortieren</span>
              <select
                className="rounded-full border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent"
                value={sort}
                aria-label="Sortierung"
                onChange={(e) => updateParams({ sort: e.target.value === "newest" ? undefined : e.target.value, page: undefined })}
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {tagData && tagData.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-accent ${
                  tag === "" ? "bg-accent text-accent-foreground" : "bg-surface-secondary text-muted hover:text-foreground"
                }`}
                aria-pressed={tag === ""}
                onClick={() => updateParams({ tag: undefined, page: undefined })}
              >
                Alle
              </button>
              {tagData.tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-accent ${
                    tag === t ? "bg-accent text-accent-foreground" : "bg-surface-secondary text-muted hover:text-foreground"
                  }`}
                  aria-pressed={tag === t}
                  onClick={() => updateParams({ tag: tag === t ? undefined : t, page: undefined })}
                >
                  {t}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {isLoading ? <p className="text-muted">Rezepte werden geladen …</p> : null}

        {data && total === 0 ? (
          <Card>
            <Card.Content className="flex flex-col items-center gap-3 py-16 text-center">
              <p className="font-display text-lg font-semibold">
                {hasFilters ? "Keine Treffer" : "Noch keine Rezepte"}
              </p>
              <p className="max-w-sm text-sm text-muted">
                {hasFilters
                  ? "Versuche eine andere Suche oder wähle einen anderen Tag."
                  : "Sobald das erste Rezept angelegt ist, erscheint es hier."}
              </p>
              {hasFilters ? (
                <Button
                  variant="secondary"
                  onPress={() => {
                    setSearchInput("");
                    updateParams({ q: undefined, tag: undefined, page: undefined });
                  }}
                >
                  Filter zurücksetzen
                </Button>
              ) : (
                <Link to="/admin">
                  <Button>Rezept anlegen</Button>
                </Link>
              )}
            </Card.Content>
          </Card>
        ) : null}

        {items.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                onAdd={(target) => {
                  setAddTarget(target);
                  addModal.open();
                }}
              />
            ))}
          </div>
        ) : null}

        {data && totalPages > 1 ? (
          <nav className="mt-8 flex items-center justify-between gap-2" aria-label="Seitennavigation">
            <Button
              size="sm"
              variant="secondary"
              isDisabled={page <= 1 || isFetching}
              onPress={() => updateParams({ page: String(page - 1) })}
            >
              Zurück
            </Button>
            <span className="text-sm text-muted" aria-live="polite">
              Seite {page} von {totalPages}
            </span>
            <Button
              size="sm"
              variant="secondary"
              isDisabled={page >= totalPages || isFetching}
              onPress={() => updateParams({ page: String(page + 1) })}
            >
              Weiter
            </Button>
          </nav>
        ) : null}
      </main>
      <SiteFooter />
      <AddToListDialog recipe={addTarget} isOpen={addModal.isOpen} onOpenChange={addModal.setOpen} />
    </div>
  );
}
