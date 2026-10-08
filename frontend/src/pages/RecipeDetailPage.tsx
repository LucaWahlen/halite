import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Button, Card, Chip, toast } from "@heroui/react";

import { api, ApiError } from "../api/client";
import type { Ingredient } from "../api/client";
import { AppHeader } from "../components/AppHeader";
import { SiteFooter } from "../components/SiteFooter";
import { formatAmount, formatDate, formatMinutes } from "../lib/format";
import { shareOrCopy } from "../lib/share";

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs tracking-wide text-muted uppercase">{label}</span>
      <span className="tabular-nums">{value || "-"}</span>
    </div>
  );
}

function ingredientText(ingredient: Ingredient, factor: number): string {
  if (ingredient.amount <= 0) {
    return ingredient.name;
  }
  const amount = formatAmount(ingredient.amount * factor);
  if (!amount) {
    return ingredient.name;
  }
  return ingredient.unit ? `${amount} ${ingredient.unit} ${ingredient.name}` : `${amount} ${ingredient.name}`;
}

function PortionStepper({
  portions,
  onChange,
}: {
  portions: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-xs tracking-wide text-muted uppercase">Portionen</span>
      <div className="mt-0.5 flex items-center gap-1.5">
        <button
          type="button"
          className="grid size-7 place-items-center rounded-full border border-border text-lg leading-none transition-colors hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Weniger Portionen"
          onClick={() => onChange(Math.max(1, portions - 1))}
        >
          −
        </button>
        <input
          type="number"
          min={1}
          max={1000}
          value={portions}
          aria-label="Anzahl Portionen"
          className="w-12 rounded-lg border border-border bg-surface px-1 py-1 text-center text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-accent"
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10);
            onChange(Number.isNaN(n) ? 1 : Math.min(1000, Math.max(1, n)));
          }}
        />
        <button
          type="button"
          className="grid size-7 place-items-center rounded-full border border-border text-lg leading-none transition-colors hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Mehr Portionen"
          onClick={() => onChange(Math.min(1000, portions + 1))}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function RecipeDetailPage() {
  const { id = "" } = useParams();
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [portions, setPortions] = useState(0);

  const { data, isError, error, isLoading } = useQuery({
    queryKey: ["recipe", id],
    queryFn: () => api.getRecipe(id),
    enabled: id !== "",
    retry: false,
  });

  useEffect(() => {
    if (data) {
      setPortions(data.servings > 0 ? data.servings : 0);
      setChecked(new Set());
    }
  }, [data]);

  const toggle = (index: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  if (isError) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <AppHeader />
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 px-4 py-16 sm:px-6">
          <h1 className="font-display text-2xl font-bold">Rezept nicht gefunden</h1>
          <p className="text-muted">
            {notFound ? "Dieses Rezept existiert nicht (mehr)." : "Etwas ist schiefgelaufen."}
          </p>
          <Link to="/" className="self-start">
            <Button variant="secondary">Zur Übersicht</Button>
          </Link>
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <AppHeader />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-16 sm:px-6">
          <p className="text-muted">Wird geladen …</p>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const factor = data.servings > 0 && portions > 0 ? portions / data.servings : 1;
  const scaled = factor !== 1;
  const shoppingItems = `${data.id}:${portions > 0 ? portions : 1}`;

  const onShare = async () => {
    const result = await shareOrCopy({
      title: data.title,
      text: data.description,
      url: `${window.location.origin}/rezept/${data.id}`,
    });
    if (result === "copied") toast.success("Link kopiert.");
    else if (result === "shared") toast.success("Geteilt.");
    else toast.warning("Teilen nicht möglich.");
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <AppHeader
        actions={
          <>
            <Button variant="secondary" size="sm" className="no-print" onPress={() => void onShare()}>
              Teilen
            </Button>
            <Link to={`/einkaufsliste?items=${shoppingItems}`}>
              <Button variant="secondary" size="sm" className="no-print">
                Einkaufsliste
              </Button>
            </Link>
            <Button variant="secondary" size="sm" className="no-print" onPress={() => window.print()}>
              Drucken
            </Button>
            <Link to={`/admin/rezept/${data.id}`}>
              <Button variant="secondary" size="sm" className="no-print">
                Bearbeiten
              </Button>
            </Link>
          </>
        }
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
        <article className="flex flex-col gap-8">
          {data.has_image && data.image_url ? (
            <img
              src={data.image_url}
              alt={data.title}
              className="aspect-[4/3] w-full rounded-3xl border border-border/70 object-cover"
            />
          ) : null}

          <header className="flex flex-col gap-4">
            <h1 className="font-display text-3xl font-bold text-balance sm:text-4xl">{data.title}</h1>
            {data.description ? <p className="text-lg text-muted whitespace-pre-line">{data.description}</p> : null}
            {data.tags.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {data.tags.map((tag) => (
                  <li key={tag}>
                    <Chip variant="soft" size="sm">
                      {tag}
                    </Chip>
                  </li>
                ))}
              </ul>
            ) : null}
          </header>

          <Card>
            <Card.Content className="grid grid-cols-2 items-start gap-4 sm:grid-cols-4">
              {data.servings > 0 ? (
                <PortionStepper portions={portions} onChange={setPortions} />
              ) : (
                <MetaItem label="Portionen" value="" />
              )}
              <MetaItem label="Vorbereitung" value={formatMinutes(data.prep_minutes)} />
              <MetaItem label="Kochzeit" value={formatMinutes(data.cook_minutes)} />
              <MetaItem label="Gesamt" value={formatMinutes(data.total_minutes)} />
            </Card.Content>
          </Card>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,18rem)_1fr]">
            <section className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-display text-xl font-semibold">Zutaten</h2>
                {scaled ? (
                  <span className="text-xs text-muted">für {portions} Portionen</span>
                ) : null}
              </div>
              {data.ingredients.length === 0 ? (
                <p className="text-sm text-muted">Keine Zutaten hinterlegt.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {data.ingredients.map((ingredient, index) => (
                    <li key={`${ingredient.name}-${index}`}>
                      <label className="flex cursor-pointer items-start gap-3 rounded-lg px-1 py-1.5 hover:bg-surface-secondary">
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
                          checked={checked.has(index)}
                          onChange={() => toggle(index)}
                        />
                        <span className={checked.has(index) ? "text-muted line-through" : ""}>
                          {ingredientText(ingredient, factor)}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-4">
              <h2 className="font-display text-xl font-semibold">Zubereitung</h2>
              {data.steps.length === 0 ? (
                <p className="text-sm text-muted">Keine Schritte hinterlegt.</p>
              ) : (
                <ol className="flex flex-col gap-4">
                  {data.steps.map((step, index) => (
                    <li key={index} className="flex gap-4">
                      <span className="font-display grid size-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
                        {index + 1}
                      </span>
                      <p className="pt-1 leading-relaxed whitespace-pre-line">{step}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          <p className="border-t border-border/60 pt-4 text-xs text-muted">
            Angelegt am {formatDate(data.created_at)}
            {data.updated_at !== data.created_at ? ` · zuletzt geändert am ${formatDate(data.updated_at)}` : ""}
          </p>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
