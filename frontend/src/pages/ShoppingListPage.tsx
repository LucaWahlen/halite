import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Button, Card, toast } from "@heroui/react";

import { api } from "../api/client";
import { AppHeader } from "../components/AppHeader";
import { SiteFooter } from "../components/SiteFooter";
import { aggregate, buildShoppingText, decodeSelection, encodeSelection, formatLine } from "../lib/shopping";
import type { SelectionEntry } from "../lib/shopping";
import { shareOrCopy } from "../lib/share";

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5" aria-hidden="true">
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2 3h2.2l2.3 11.2a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L21 7H5.2" />
    </svg>
  );
}

export function ShoppingListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const itemsParam = searchParams.get("items") ?? "";
  const selection = useMemo(() => decodeSelection(itemsParam), [itemsParam]);
  const selectedIds = useMemo(() => [...selection.keys()], [selection]);

  const { data, isLoading } = useQuery({
    queryKey: ["recipes", "shopping-picker"],
    queryFn: () => api.listRecipes({ pageSize: 100, sort: "title" }),
    staleTime: 60_000,
  });

  const detailQueries = useQueries({
    queries: selectedIds.map((id) => ({
      queryKey: ["recipe", id],
      queryFn: () => api.getRecipe(id),
      staleTime: 60_000,
    })),
  });

  const entries = useMemo<SelectionEntry[]>(() => {
    const list: SelectionEntry[] = [];
    selectedIds.forEach((id, index) => {
      const recipe = detailQueries[index]?.data;
      if (recipe) {
        list.push({ recipe, portions: selection.get(id) ?? 1 });
      }
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, selection, detailQueries.map((q) => q.dataUpdatedAt).join(",")]);

  const lines = useMemo(() => aggregate(entries), [entries]);
  const recipes = data?.items ?? [];
  const servingsById = useMemo(() => {
    const map = new Map<string, number>();
    for (const recipe of recipes) {
      map.set(recipe.id, recipe.servings);
    }
    return map;
  }, [recipes]);

  const apply = (next: Map<string, number>) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        const encoded = encodeSelection(next);
        if (encoded) params.set("items", encoded);
        else params.delete("items");
        return params;
      },
      { replace: true },
    );
  };

  const toggle = (id: string) => {
    const next = new Map(selection);
    if (next.has(id)) {
      next.delete(id);
    } else {
      const servings = servingsById.get(id) ?? 0;
      next.set(id, servings > 0 ? servings : 1);
    }
    apply(next);
  };

  const setPortions = (id: string, portions: number) => {
    const next = new Map(selection);
    next.set(id, Math.max(1, Math.min(1000, portions)));
    apply(next);
  };

  const shareText = () => buildShoppingText(entries, lines);

  const onShare = async () => {
    const result = await shareOrCopy({ title: "Einkaufsliste", text: shareText() });
    if (result === "copied") toast.success("Einkaufsliste kopiert.");
    else if (result === "shared") toast.success("Einkaufsliste geteilt.");
    else toast.warning("Teilen nicht möglich.");
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareText());
      toast.success("Einkaufsliste kopiert.");
    } catch {
      toast.warning("Kopieren nicht möglich.");
    }
  };

  const totalPortionsNote = entries.length > 0 ? `${entries.length} ${entries.length === 1 ? "Rezept" : "Rezepte"} ausgewählt` : "";

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display flex items-center gap-2 text-3xl font-bold">
              <CartIcon /> Einkaufsliste
            </h1>
            <p className="mt-2 text-muted">
              Rezepte auswählen, Portionen anpassen — die Zutaten werden automatisch zusammengerechnet.
            </p>
          </div>
          {selectedIds.length > 0 ? (
            <Button variant="secondary" size="sm" onPress={() => apply(new Map())}>
              Auswahl zurücksetzen
            </Button>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_minmax(0,22rem)]">
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-semibold">Rezepte</h2>
            {isLoading ? <p className="text-muted">Wird geladen …</p> : null}
            {data && recipes.length === 0 ? <p className="text-muted">Noch keine Rezepte vorhanden.</p> : null}
            <ul className="flex flex-col gap-2">
              {recipes.map((recipe) => {
                const selected = selection.has(recipe.id);
                const portions = selection.get(recipe.id) ?? 0;
                return (
                  <li key={recipe.id}>
                    <Card className={selected ? "ring-1 ring-accent/60" : undefined}>
                      <Card.Content className="flex flex-row items-center gap-3">
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                          <input
                            type="checkbox"
                            className="size-4 shrink-0 accent-[var(--accent)]"
                            checked={selected}
                            onChange={() => toggle(recipe.id)}
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{recipe.title}</span>
                            {recipe.servings > 0 ? (
                              <span className="text-xs text-muted">{recipe.servings} Portionen</span>
                            ) : null}
                          </span>
                        </label>
                        {selected ? (
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span className="text-xs text-muted">Portionen</span>
                            <input
                              type="number"
                              min={1}
                              max={1000}
                              value={portions}
                              aria-label={`Portionen für ${recipe.title}`}
                              className="w-16 rounded-lg border border-border bg-surface px-2 py-1 text-center text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-accent"
                              onChange={(e) => {
                                const value = Number.parseInt(e.target.value, 10);
                                setPortions(recipe.id, Number.isNaN(value) ? 1 : value);
                              }}
                            />
                          </div>
                        ) : null}
                      </Card.Content>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="lg:sticky lg:top-20 lg:self-start">
            <Card>
              <Card.Content className="gap-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="font-display text-lg font-semibold">Liste</h2>
                  {totalPortionsNote ? <span className="text-xs text-muted">{totalPortionsNote}</span> : null}
                </div>

                {entries.length === 0 ? (
                  <p className="text-sm text-muted">Wähle links Rezepte aus, um die Einkaufsliste zu erstellen.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {lines.map((line, index) => (
                      <li key={`${line.name}-${line.unit}-${index}`} className="flex gap-2 text-sm">
                        <span aria-hidden="true" className="text-accent">
                          •
                        </span>
                        <span>{formatLine(line)}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
                  <Button isDisabled={entries.length === 0} onPress={() => void onShare()}>
                    Teilen
                  </Button>
                  <Button variant="secondary" isDisabled={entries.length === 0} onPress={() => void onCopy()}>
                    Text kopieren
                  </Button>
                </div>
              </Card.Content>
            </Card>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
