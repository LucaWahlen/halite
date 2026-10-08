import { Link } from "react-router";
import { Button } from "@heroui/react";

import type { RecipeSummary } from "../api/client";
import { formatMinutes, formatServings } from "../lib/format";

function Placeholder() {
  return (
    <div className="flex size-full items-center justify-center bg-surface-secondary">
      <svg viewBox="0 0 32 32" className="size-12 text-accent/35" aria-hidden="true">
        <path
          d="M16 3.5 26 9.5v13L16 28.5 6 22.5v-13z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M16 3.5v25M6 9.5 16 15.5 26 9.5M6 22.5 16 16.5l10 6" fill="none" stroke="currentColor" strokeWidth="1" opacity=".7" />
      </svg>
    </div>
  );
}

function CartPlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4" aria-hidden="true">
      <path d="M2 3h2.2l2.3 11.2a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L21 7H5.2" />
      <path d="M12 4.5v5M9.5 7h5" />
    </svg>
  );
}

export function RecipeCard({ recipe, onAdd }: { recipe: RecipeSummary; onAdd: (recipe: RecipeSummary) => void }) {
  const total = formatMinutes(recipe.total_minutes);
  return (
    <div className="group flex flex-col overflow-hidden rounded-3xl border border-border/70 bg-surface shadow-surface transition-transform duration-200 hover:-translate-y-0.5">
      <Link
        to={`/rezept/${recipe.id}`}
        className="flex flex-1 flex-col focus-visible:ring-2 focus-visible:ring-accent"
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden">
          {recipe.has_image && recipe.image_url ? (
            <img
              src={recipe.image_url}
              alt=""
              loading="lazy"
              className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            />
          ) : (
            <Placeholder />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4 pb-2">
          <h3 className="font-display text-lg leading-snug font-semibold text-balance">{recipe.title}</h3>
          {recipe.description ? (
            <p className="line-clamp-2 text-sm text-muted">{recipe.description}</p>
          ) : null}
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted">
            {recipe.servings > 0 ? <span>{formatServings(recipe.servings)}</span> : null}
            {total ? <span className="tabular-nums">{total}</span> : null}
          </div>
          {recipe.tags.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5 pt-1">
              {recipe.tags.slice(0, 3).map((tag) => (
                <li
                  key={tag}
                  className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-soft-foreground"
                >
                  {tag}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Link>
      <div className="p-4 pt-2">
        <Button variant="secondary" size="sm" className="w-full" onPress={() => onAdd(recipe)}>
          <span className="flex items-center gap-1.5">
            <CartPlusIcon /> Zur Einkaufsliste
          </span>
        </Button>
      </div>
    </div>
  );
}
