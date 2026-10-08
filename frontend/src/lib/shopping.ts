import type { Recipe } from "../api/client";
import { formatAmount } from "./format";

export interface ShoppingLine {
  name: string;
  unit: string;
  amount: number;
}

export interface SelectionEntry {
  recipe: Recipe;
  portions: number;
}

// aggregate combines the ingredients of the selected recipes, scaling each by
// its portion factor and summing lines that share the same name and unit.
export function aggregate(entries: SelectionEntry[]): ShoppingLine[] {
  const map = new Map<string, ShoppingLine>();
  for (const { recipe, portions } of entries) {
    const factor = recipe.servings > 0 && portions > 0 ? portions / recipe.servings : 1;
    for (const ingredient of recipe.ingredients) {
      const name = ingredient.name.trim();
      if (name === "") {
        continue;
      }
      const unit = ingredient.unit.trim();
      const key = `${name.toLowerCase()}\u0000${unit.toLowerCase()}`;
      const amount = ingredient.amount > 0 ? ingredient.amount * factor : 0;
      const existing = map.get(key);
      if (existing) {
        existing.amount += amount;
      } else {
        map.set(key, { name, unit, amount });
      }
    }
  }
  const lines = [...map.values()].map((line) => ({
    ...line,
    amount: Math.round(line.amount * 100) / 100,
  }));
  lines.sort((a, b) => a.name.localeCompare(b.name, "de"));
  return lines;
}

export function formatLine(line: ShoppingLine): string {
  if (line.amount > 0) {
    const amount = formatAmount(line.amount);
    if (amount) {
      return line.unit ? `${amount} ${line.unit} ${line.name}` : `${amount} ${line.name}`;
    }
  }
  return line.name;
}

export function buildShoppingText(entries: SelectionEntry[], lines: ShoppingLine[]): string {
  const recipes = entries
    .map((e) => {
      const portions = e.recipe.servings > 0 ? `${e.portions} ${e.portions === 1 ? "Portion" : "Portionen"}` : "ganzes Rezept";
      return `- ${e.recipe.title} (${portions})`;
    })
    .join("\n");
  const items = lines.map((line) => `- ${formatLine(line)}`).join("\n");
  const parts = ["Einkaufsliste"];
  if (recipes) {
    parts.push(`Rezepte:\n${recipes}`);
  }
  if (items) {
    parts.push(`Zutaten:\n${items}`);
  }
  return parts.join("\n\n");
}

export function encodeSelection(selection: Map<string, number>): string {
  return [...selection.entries()].map(([id, portions]) => `${id}:${portions}`).join(",");
}

export function decodeSelection(raw: string): Map<string, number> {
  const selection = new Map<string, number>();
  for (const part of raw.split(",")) {
    const [id, portions] = part.split(":");
    if (!id) {
      continue;
    }
    const value = Number.parseInt(portions ?? "", 10);
    selection.set(id, Number.isNaN(value) ? 1 : Math.max(1, Math.min(1000, value)));
  }
  return selection;
}
