import { useSyncExternalStore } from "react";

export interface CartItem {
  id: string;
  portions: number;
}

const KEY = "halite.cart.v1";

function load(): CartItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    const items: CartItem[] = [];
    for (const entry of parsed) {
      if (entry && typeof entry === "object" && typeof (entry as { id?: unknown }).id === "string") {
        const value = Number((entry as { portions?: unknown }).portions);
        items.push({
          id: (entry as { id: string }).id,
          portions: Number.isFinite(value) && value > 0 ? Math.min(1000, Math.round(value)) : 1,
        });
      }
    }
    return items;
  } catch {
    return [];
  }
}

let items: CartItem[] = load();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // ignore storage failures (private mode, quota)
  }
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCart(): CartItem[] {
  return items;
}

export function addItem(id: string, portions: number) {
  const value = Math.max(1, Math.min(1000, Math.round(portions)));
  if (items.some((item) => item.id === id)) {
    items = items.map((item) => (item.id === id ? { ...item, portions: value } : item));
  } else {
    items = [...items, { id, portions: value }];
  }
  persist();
}

export function setPortions(id: string, portions: number) {
  addItem(id, portions);
}

export function removeItem(id: string) {
  items = items.filter((item) => item.id !== id);
  persist();
}

export function clearCart() {
  items = [];
  persist();
}

export function useCart(): CartItem[] {
  return useSyncExternalStore(subscribe, getCart, getCart);
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === KEY) {
      items = load();
      emit();
    }
  });
}
