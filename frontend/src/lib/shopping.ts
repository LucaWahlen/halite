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

export function buildShoppingText(lines: ShoppingLine[]): string {
  const items = lines.map((line) => `- ${formatLine(line)}`).join("\n");
  return `Einkaufsliste\n\n${items}`;
}
