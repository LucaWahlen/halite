const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function formatMinutes(minutes: number): string {
  if (!minutes || minutes <= 0) {
    return "";
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return `${rest} Min.`;
  }
  if (rest === 0) {
    return `${hours} Std.`;
  }
  return `${hours} Std. ${rest} Min.`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return dateFormatter.format(date);
}

const amountFormatter = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });

export function formatAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "";
  }
  const rounded = Math.round(value * 100) / 100;
  return amountFormatter.format(rounded);
}

export function formatServings(servings: number): string {
  if (servings <= 0) {
    return "";
  }
  return `${servings} ${servings === 1 ? "Portion" : "Portionen"}`;
}
