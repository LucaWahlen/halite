import { useMemo } from "react";
import { Link } from "react-router";
import { useQueries } from "@tanstack/react-query";
import { Button, Card, toast } from "@heroui/react";

import { api } from "../api/client";
import { AppHeader } from "../components/AppHeader";
import { SiteFooter } from "../components/SiteFooter";
import { clearCart, removeItem, setPortions, useCart } from "../lib/cart";
import type { CartItem } from "../lib/cart";
import { aggregate, buildShoppingText, formatLine } from "../lib/shopping";
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

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function ShoppingListPage() {
  const cart = useCart();
  const ids = useMemo(() => cart.map((item) => item.id), [cart]);

  const detailQueries = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["recipe", id],
      queryFn: () => api.getRecipe(id),
      staleTime: 60_000,
    })),
  });
  const dataKey = detailQueries.map((q) => q.dataUpdatedAt).join(",");

  const entries = useMemo<SelectionEntry[]>(() => {
    const list: SelectionEntry[] = [];
    cart.forEach((item: CartItem, index) => {
      const recipe = detailQueries[index]?.data;
      if (recipe) {
        list.push({ recipe, portions: item.portions });
      }
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, dataKey]);

  const lines = useMemo(() => aggregate(entries), [entries]);
  const shareText = () => buildShoppingText(lines);

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

  const remaining = cart.length - entries.length;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="font-display flex items-center gap-2 text-3xl font-bold">
            <CartIcon /> Einkaufsliste
          </h1>
          {cart.length > 0 ? (
            <Button variant="secondary" size="sm" onPress={() => clearCart()}>
              Liste leeren
            </Button>
          ) : null}
        </div>

        {cart.length === 0 ? (
          <Card>
            <Card.Content className="flex flex-col items-center gap-3 py-16 text-center">
              <p className="font-display text-lg font-semibold">Einkaufsliste ist leer</p>
              <p className="max-w-sm text-sm text-muted">
                Füge Rezepte über die Übersicht oder die Rezeptseite hinzu.
              </p>
              <Link to="/">
                <Button>Zu den Rezepten</Button>
              </Link>
            </Card.Content>
          </Card>
        ) : (
          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-lg font-semibold">Zutaten</h2>
              {lines.length === 0 ? (
                <p className="text-sm text-muted">Die ausgewählten Rezepte haben keine Zutaten.</p>
              ) : (
                <Card>
                  <Card.Content>
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
                  </Card.Content>
                </Card>
              )}
              <div className="flex flex-wrap gap-2">
                <Button isDisabled={lines.length === 0} onPress={() => void onShare()}>
                  Teilen
                </Button>
                <Button variant="secondary" isDisabled={lines.length === 0} onPress={() => void onCopy()}>
                  Text kopieren
                </Button>
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <h2 className="font-display text-lg font-semibold">Rezepte</h2>
              <ul className="flex flex-col gap-2">
                {entries.map(({ recipe, portions }) => (
                  <li
                    key={recipe.id}
                    className="flex items-center gap-3 rounded-xl border border-border/70 bg-surface py-2 pl-4 pr-2"
                  >
                    <Link
                      to={`/rezept/${recipe.id}`}
                      className="min-w-0 flex-1 truncate text-sm font-medium focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {recipe.title}
                    </Link>
                    <div className="flex shrink-0 items-center gap-1.5">
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
                      <span className="text-xs text-muted">Portionen</span>
                    </div>
                    <button
                      type="button"
                      className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger focus-visible:ring-2 focus-visible:ring-accent"
                      aria-label={`${recipe.title} entfernen`}
                      onClick={() => removeItem(recipe.id)}
                    >
                      <CloseIcon />
                    </button>
                  </li>
                ))}
              </ul>
              {remaining > 0 ? (
                <p className="text-xs text-muted">
                  {remaining} {remaining === 1 ? "Rezept ist" : "Rezepte sind"} nicht mehr verfügbar.
                </p>
              ) : null}
            </section>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
